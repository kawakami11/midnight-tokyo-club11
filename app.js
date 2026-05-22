const SERVICES = [
  { id: "strategy", name: "Strategy Call", duration: 45, price: 120 },
  { id: "studio", name: "Studio Session", duration: 60, price: 180 },
  { id: "wellness", name: "Wellness Visit", duration: 50, price: 95 },
  { id: "consulting", name: "Consulting Review", duration: 75, price: 240 },
];

const STORAGE_KEY = "luma-reserve-bookings-v1";
const SLOT_START = 9;
const SLOT_END = 18;
const SLOT_STEP_MINUTES = 30;

const state = {
  selectedTime: "",
  toastTimer: null,
};

const elements = {
  bookingView: document.querySelector("#booking-view"),
  manageView: document.querySelector("#manage-view"),
  tabButtons: document.querySelectorAll("[data-view-target]"),
  serviceInput: document.querySelector("#service-input"),
  dateInput: document.querySelector("#date-input"),
  timeSlots: document.querySelector("#time-slots"),
  selectedTimeLabel: document.querySelector("#selected-time-label"),
  availabilityText: document.querySelector("#availability-text"),
  bookingForm: document.querySelector("#booking-form"),
  customerName: document.querySelector("#customer-name"),
  customerEmail: document.querySelector("#customer-email"),
  customerPhone: document.querySelector("#customer-phone"),
  notesInput: document.querySelector("#notes-input"),
  timeline: document.querySelector("#day-timeline"),
  metricUpcoming: document.querySelector("#metric-upcoming"),
  metricToday: document.querySelector("#metric-today"),
  metricConfirmed: document.querySelector("#metric-confirmed"),
  searchInput: document.querySelector("#search-input"),
  statusFilter: document.querySelector("#status-filter"),
  dateFilter: document.querySelector("#date-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  bookingList: document.querySelector("#booking-list"),
  exportButton: document.querySelector("#export-button"),
  toast: document.querySelector("#toast"),
};

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function readBookings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBookings(bookings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `booking-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getService(serviceId) {
  return SERVICES.find((service) => service.id === serviceId) || SERVICES[0];
}

function makeSlots() {
  const slots = [];
  for (let hour = SLOT_START; hour < SLOT_END; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_STEP_MINUTES) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

function toDateTime(booking) {
  return new Date(`${booking.date}T${booking.time}:00`);
}

function formatDate(dateISO) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateISO}T00:00:00`));
}

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hours, minutes));
}

function getBookingsForDay(dateISO) {
  return readBookings()
    .filter((booking) => booking.date === dateISO && booking.status !== "Canceled")
    .sort((a, b) => a.time.localeCompare(b.time));
}

function isSlotBooked(dateISO, serviceId, time) {
  return readBookings().some(
    (booking) =>
      booking.date === dateISO &&
      booking.serviceId === serviceId &&
      booking.time === time &&
      booking.status !== "Canceled",
  );
}

function isPastSlot(dateISO, time) {
  return new Date(`${dateISO}T${time}:00`).getTime() < Date.now();
}

function setView(view) {
  const isManage = view === "manage";
  elements.bookingView.classList.toggle("is-visible", !isManage);
  elements.manageView.classList.toggle("is-visible", isManage);
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === view);
  });
}

function renderServiceOptions() {
  elements.serviceInput.innerHTML = SERVICES.map(
    (service) =>
      `<option value="${service.id}">${service.name} - ${service.duration} min</option>`,
  ).join("");
}

function renderTimeSlots() {
  const selectedDate = elements.dateInput.value;
  const selectedService = elements.serviceInput.value;
  const slots = makeSlots();
  let availableCount = 0;

  elements.timeSlots.innerHTML = "";

  slots.forEach((slot) => {
    const booked = isSlotBooked(selectedDate, selectedService, slot);
    const past = selectedDate === todayISO() && isPastSlot(selectedDate, slot);
    const disabled = booked || past;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.textContent = formatTime(slot);
    button.disabled = disabled;
    button.setAttribute("role", "listitem");

    if (booked) {
      button.classList.add("is-booked");
      button.setAttribute("aria-label", `${formatTime(slot)} booked`);
    }

    if (state.selectedTime === slot) {
      button.classList.add("is-selected");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    if (!disabled) {
      availableCount += 1;
      button.addEventListener("click", () => {
        state.selectedTime = slot;
        renderTimeSlots();
      });
    }

    elements.timeSlots.append(button);
  });

  elements.selectedTimeLabel.textContent = state.selectedTime
    ? `${formatTime(state.selectedTime)} selected`
    : "No time selected";
  elements.availabilityText.textContent = `${availableCount} open times on ${formatDate(selectedDate)}.`;
}

function renderTimeline() {
  const selectedDate = elements.dateInput.value;
  const bookings = getBookingsForDay(selectedDate);

  if (!bookings.length) {
    elements.timeline.innerHTML = `<div class="empty-state">No reservations on ${formatDate(selectedDate)}.</div>`;
    return;
  }

  elements.timeline.innerHTML = bookings
    .map((booking) => {
      const service = getService(booking.serviceId);
      return `
        <article class="timeline-item">
          <div class="timeline-time">${formatTime(booking.time)}</div>
          <div class="timeline-detail">
            <strong>${escapeHTML(booking.customerName)}</strong>
            <span>${service.name}</span>
            <small>${escapeHTML(booking.customerEmail)}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMetrics() {
  const bookings = readBookings();
  const today = todayISO();
  const now = Date.now();
  const active = bookings.filter((booking) => booking.status !== "Canceled");

  elements.metricUpcoming.textContent = active.filter(
    (booking) => toDateTime(booking).getTime() >= now,
  ).length;
  elements.metricToday.textContent = active.filter((booking) => booking.date === today).length;
  elements.metricConfirmed.textContent = bookings.filter(
    (booking) => booking.status === "Confirmed",
  ).length;
}

function renderBookingList() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const status = elements.statusFilter.value;
  const date = elements.dateFilter.value;

  const bookings = readBookings()
    .filter((booking) => {
      const service = getService(booking.serviceId);
      const searchText = [
        booking.customerName,
        booking.customerEmail,
        booking.customerPhone,
        service.name,
        booking.notes,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchText.includes(query)) &&
        (status === "all" || booking.status === status) &&
        (!date || booking.date === date)
      );
    })
    .sort((a, b) => toDateTime(a).getTime() - toDateTime(b).getTime());

  if (!bookings.length) {
    elements.bookingList.innerHTML = `<div class="empty-state">No reservations match this view.</div>`;
    return;
  }

  elements.bookingList.innerHTML = bookings.map(renderBookingCard).join("");

  elements.bookingList.querySelectorAll("[data-status-id]").forEach((select) => {
    select.addEventListener("change", () => updateBookingStatus(select.dataset.statusId, select.value));
  });

  elements.bookingList.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => deleteBooking(button.dataset.deleteId));
  });
}

function renderBookingCard(booking) {
  const service = getService(booking.serviceId);
  const statusClass = booking.status.toLowerCase();
  return `
    <article class="booking-card">
      <div class="booking-person">
        <strong>${escapeHTML(booking.customerName)}</strong>
        <span>${escapeHTML(booking.customerEmail)}</span>
        <span>${escapeHTML(booking.customerPhone || "No phone")}</span>
      </div>
      <div class="booking-meta">
        <strong>${service.name}</strong>
        <span>${service.duration} min · $${service.price}</span>
        <span>${escapeHTML(booking.notes || "No notes")}</span>
      </div>
      <div class="booking-meta">
        <strong>${formatDate(booking.date)}</strong>
        <span>${formatTime(booking.time)}</span>
        <span class="status-pill status-${statusClass}">${booking.status}</span>
      </div>
      <div class="card-actions">
        <select data-status-id="${booking.id}" aria-label="Update reservation status">
          ${["Confirmed", "Completed", "Canceled"]
            .map(
              (status) =>
                `<option value="${status}" ${booking.status === status ? "selected" : ""}>${status}</option>`,
            )
            .join("")}
        </select>
        <button class="danger-action" type="button" data-delete-id="${booking.id}">Delete</button>
      </div>
    </article>
  `;
}

function createBooking(event) {
  event.preventDefault();

  const date = elements.dateInput.value;
  const serviceId = elements.serviceInput.value;

  if (!state.selectedTime) {
    showToast("Please select an available time.");
    return;
  }

  if (isSlotBooked(date, serviceId, state.selectedTime)) {
    showToast("That time was just booked. Please choose another slot.");
    state.selectedTime = "";
    refreshViews();
    return;
  }

  const booking = {
    id: makeId(),
    serviceId,
    date,
    time: state.selectedTime,
    customerName: elements.customerName.value.trim(),
    customerEmail: elements.customerEmail.value.trim(),
    customerPhone: elements.customerPhone.value.trim(),
    notes: elements.notesInput.value.trim(),
    status: "Confirmed",
    createdAt: new Date().toISOString(),
  };

  const bookings = readBookings();
  bookings.push(booking);
  writeBookings(bookings);

  elements.customerName.value = "";
  elements.customerEmail.value = "";
  elements.customerPhone.value = "";
  elements.notesInput.value = "";
  state.selectedTime = "";

  refreshViews();
  showToast(`Reservation confirmed for ${formatDate(booking.date)} at ${formatTime(booking.time)}.`);
}

function updateBookingStatus(id, status) {
  const bookings = readBookings().map((booking) =>
    booking.id === id ? { ...booking, status } : booking,
  );
  writeBookings(bookings);
  refreshViews();
  showToast(`Reservation marked ${status}.`);
}

function deleteBooking(id) {
  const booking = readBookings().find((item) => item.id === id);
  if (!booking) return;

  const confirmed = window.confirm(`Delete reservation for ${booking.customerName}?`);
  if (!confirmed) return;

  writeBookings(readBookings().filter((item) => item.id !== id));
  refreshViews();
  showToast("Reservation deleted.");
}

function exportCSV() {
  const bookings = readBookings();
  if (!bookings.length) {
    showToast("No reservations to export.");
    return;
  }

  const headers = [
    "Name",
    "Email",
    "Phone",
    "Service",
    "Date",
    "Time",
    "Status",
    "Notes",
    "Created At",
  ];

  const rows = bookings.map((booking) => {
    const service = getService(booking.serviceId);
    return [
      booking.customerName,
      booking.customerEmail,
      booking.customerPhone,
      service.name,
      booking.date,
      booking.time,
      booking.status,
      booking.notes,
      booking.createdAt,
    ];
  });

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `luma-reservations-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV export ready.");
}

function refreshViews() {
  renderTimeSlots();
  renderTimeline();
  renderMetrics();
  renderBookingList();
}

function escapeHTML(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3200);
}

function bindEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });

  elements.serviceInput.addEventListener("change", () => {
    state.selectedTime = "";
    refreshViews();
  });

  elements.dateInput.addEventListener("change", () => {
    state.selectedTime = "";
    refreshViews();
  });

  elements.bookingForm.addEventListener("submit", createBooking);
  elements.searchInput.addEventListener("input", renderBookingList);
  elements.statusFilter.addEventListener("change", renderBookingList);
  elements.dateFilter.addEventListener("change", renderBookingList);
  elements.exportButton.addEventListener("click", exportCSV);
  elements.clearFilters.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.statusFilter.value = "all";
    elements.dateFilter.value = "";
    renderBookingList();
  });
}

function initReservationApp() {
  renderServiceOptions();
  elements.dateInput.min = todayISO();
  elements.dateInput.value = todayISO();
  bindEvents();
  refreshViews();
}

function initWebGLBackground() {
  const canvas = document.querySelector("#visual-canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
  });

  if (!gl) return;

  const vertexSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;

    float line(float value, float center, float width) {
      return smoothstep(width, 0.0, abs(value - center));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec3 paper = mix(vec3(0.964, 0.972, 0.948), vec3(0.900, 0.932, 0.896), uv.y);
      vec3 ink = vec3(0.040, 0.080, 0.074);
      vec3 coral = vec3(0.847, 0.365, 0.263);
      vec3 citrus = vec3(0.839, 0.655, 0.141);

      float mesh = 0.0;
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float wave = 0.032 * sin(uv.x * (4.0 + fi * 0.22) + u_time * 0.15 + fi);
        float center = 0.10 + fi * 0.118 + wave;
        mesh += line(uv.y, center, 0.0065);
      }

      float vertical = 0.0;
      for (int j = 0; j < 7; j++) {
        float fj = float(j);
        float curve = 0.028 * sin(uv.y * 5.3 + fj + u_time * 0.12);
        vertical += line(uv.x, 0.12 + fj * 0.145 + curve, 0.0048);
      }

      float diagonal = line(fract((uv.x + uv.y * 0.42 + u_time * 0.018) * 8.0), 0.5, 0.022);
      float emphasis = smoothstep(0.18, 0.96, uv.x) * smoothstep(1.0, 0.28, uv.y);

      vec3 color = paper;
      color = mix(color, ink, mesh * 0.09);
      color = mix(color, ink, vertical * 0.055);
      color = mix(color, coral, diagonal * 0.026 * emphasis);
      color = mix(color, citrus, mesh * vertical * 0.16);

      float vignette = smoothstep(1.15, 0.24, distance(uv, vec2(0.58, 0.48)));
      color = mix(vec3(0.948, 0.954, 0.928), color, 0.86 + vignette * 0.14);

      gl_FragColor = vec4(color, 0.92);
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  if (!program) return;

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const timeLocation = gl.getUniformLocation(program, "u_time");
  const buffer = gl.createBuffer();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.floor(canvas.clientWidth * pixelRatio);
    const height = Math.floor(canvas.clientHeight * pixelRatio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function draw(time = 0) {
    resize();
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, reducedMotion ? 0 : time * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!reducedMotion) {
      requestAnimationFrame(draw);
    }
  }

  window.addEventListener("resize", resize);
  requestAnimationFrame(draw);
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

initReservationApp();
initWebGLBackground();
