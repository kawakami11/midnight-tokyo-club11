"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadDemoWorkspace, newDemoId, saveDemoWorkspace } from "@/lib/demo-store";
import { languageOptions, marketplaceCopy, type LanguageCode } from "@/lib/marketplace-copy";
import {
  addMinutes,
  combineDateAndTime,
  formatCurrency,
  formatTime,
  getTodayInputValue,
  isPastSlot,
  makeSlotTimes,
  reservationOverlaps
} from "@/lib/time";
import type { Customer, Reservation, Service, StaffMember, Store, WorkspaceData } from "@/lib/types";

const regions = ["All Tokyo", "Shibuya", "Yokohama", "C1 Route", "Daikoku"];
const carGallery = [
  {
    src: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=900&q=80",
    label: "Supercar night line"
  },
  {
    src: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80",
    label: "Imported coupe"
  },
  {
    src: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=900&q=80",
    label: "Muscle silhouette"
  },
  {
    src: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80",
    label: "European performance"
  },
  {
    src: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
    label: "Track-spec detail"
  },
  {
    src: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=900&q=80",
    label: "Tokyo tunnel run"
  }
];

const referenceSignals = [
  { value: "Private route", label: "Host-led Daikoku timing, not a bus tour" },
  { value: "Pickup ready", label: "Hotel request or central Tokyo meet-up" },
  { value: "Calendar handoff", label: "Google Calendar and ICS after booking" },
  { value: "Closure aware", label: "Weather and PA conditions checked by the host" }
];

const routeTimeline = [
  {
    step: "Meet / pickup",
    detail: "Share your hotel, station, or private meet point. The host confirms the exact handoff before departure."
  },
  {
    step: "Tokyo skyline pass",
    detail: "C1, Tokyo Tower, Rainbow Bridge, or bay-view photo stops are adjusted to traffic and guest preference."
  },
  {
    step: "JDM culture stop",
    detail: "Optional parts-store, garage, or local meet-up context for guests who want more than a photo stop."
  },
  {
    step: "Daikoku PA",
    detail: "A host-led visit focused on etiquette, timing, safety, and the real car scene when conditions are good."
  },
  {
    step: "Flexible drop-off",
    detail: "Return timing and drop-off are coordinated with the host after the night route is confirmed."
  }
];

const bookingNotes = [
  "Passenger tours do not require a Japanese driving permit. Self-drive upgrades may require license and IDP/JAF translation checks.",
  "Vehicle requests are handled as preferences. Final assignment depends on availability, group size, and weather.",
  "Guests who appear intoxicated or unsafe can be refused for the protection of the host, car, and group.",
  "Daikoku PA can close unexpectedly. The host prepares alternate skyline, C1, or garage options when needed."
];

const vehicleShowcase = [
  {
    title: "Luxury transfer",
    meta: "Lexus LS / Alphard style",
    image: "https://images.unsplash.com/photo-1617814065893-00757125efab?auto=format&fit=crop&w=900&q=80"
  },
  {
    title: "JDM passenger run",
    meta: "Integra / Civic / Crown request",
    image: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=900&q=80"
  },
  {
    title: "Supercar upgrade",
    meta: "GT-R / RX-7 / cabrio request",
    image: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80"
  }
];

type CalendarConfirmation = {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  details: string;
  googleUrl: string;
  syncStatus: string;
  reservationId?: string;
};

export default function MarketplaceHome() {
  const [data, setData] = useState<WorkspaceData>({
    stores: [],
    staff: [],
    services: [],
    customers: [],
    reservations: []
  });
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState(regions[0]);
  const [category, setCategory] = useState("All");
  const [today, setToday] = useState(getTodayInputValue);
  const [date, setDate] = useState(getTodayInputValue);
  const [guests, setGuests] = useState(2);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<CalendarConfirmation | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(() => {
    if (typeof window === "undefined") return "EN";
    const savedLanguage = window.localStorage.getItem("midnight-tokyo-club-language") as LanguageCode | null;
    return savedLanguage && marketplaceCopy[savedLanguage] ? savedLanguage : "EN";
  });
  const c = marketplaceCopy[language];
  const todayRef = useRef(today);
  const dateRef = useRef(date);

  const supabaseEnabled = isSupabaseConfigured();
  const publicStores = data.stores.filter((store) => store.public_booking_enabled);
  const activeServices = data.services.filter((service) => {
    const store = publicStores.find((item) => item.id === service.store_id);
    return service.active && store;
  });
  const categories = ["All", ...Array.from(new Set(activeServices.map((service) => service.category || "Tours")))];
  const selectedService = activeServices.find((service) => service.id === selectedServiceId) || activeServices[0];
  const selectedStore = selectedService
    ? publicStores.find((store) => store.id === selectedService.store_id)
    : publicStores[0];
  const storeStaff = data.staff.filter((staff) => staff.store_id === selectedStore?.id && staff.active);
  const selectedStaff = storeStaff.find((staff) => staff.id === selectedStaffId) || storeStaff[0];

  const filteredServices = useMemo(() => {
    const search = query.trim().toLowerCase();
    return activeServices
      .filter((service) => {
        const store = publicStores.find((item) => item.id === service.store_id);
        if (!store) return false;
        const text = [
          service.name,
          service.category,
          service.description,
          service.route,
          service.highlights?.join(" "),
          store.name,
          store.city,
          store.region
        ]
          .join(" ")
          .toLowerCase();

        const matchesQuery = !search || text.includes(search);
        const matchesRegion =
          region === "All Tokyo" ||
          store.city === region ||
          store.region === region ||
          service.route?.toLowerCase().includes(region.toLowerCase());
        const matchesCategory = category === "All" || service.category === category;
        return matchesQuery && matchesRegion && matchesCategory;
      })
      .sort((a, b) => Number(b.featured) - Number(a.featured) || (b.rating || 0) - (a.rating || 0));
  }, [activeServices, category, publicStores, query, region]);

  const availableSlots = useMemo(() => {
    if (!selectedService || !selectedStaff || !date) return [];
    const close = combineDateAndTime(date, "04:00");
    close.setDate(close.getDate() + 1);

    return makeSlotTimes(21, 24, 30)
      .concat(["00:00", "00:30", "01:00", "01:30", "02:00"])
      .map((time) => {
        const normalizedDate = time.startsWith("0") ? nextDayInput(date) : date;
        const start = combineDateAndTime(normalizedDate, time);
        const end = addMinutes(start, selectedService.duration_minutes);
        const conflict = data.reservations.some(
          (reservation) =>
            reservation.staff_id === selectedStaff.id &&
            reservationOverlaps(reservation, start, end)
        );
        return {
          time,
          displayDate: normalizedDate,
          available: end <= close && !conflict && !isPastSlot(normalizedDate, time)
        };
      });
  }, [data.reservations, date, selectedService, selectedStaff]);

  const selectedSlot = availableSlots.find((slot) => slot.time === selectedTime);
  const availableSlotCount = availableSlots.filter((slot) => slot.available).length;
  const selectedDateLabel = formatLocaleDate(selectedSlot?.displayDate || date, language);
  const selectedTotal = selectedService ? formatCurrency(selectedService.price_cents * guests) : "--";

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    const refreshToday = () => {
      const nextToday = getTodayInputValue();
      const previousToday = todayRef.current;
      if (nextToday === previousToday) return;

      todayRef.current = nextToday;
      setToday(nextToday);
      if (dateRef.current <= previousToday) {
        dateRef.current = nextToday;
        setDate(nextToday);
        setSelectedTime("");
      }
    };

    refreshToday();
    const intervalId = window.setInterval(refreshToday, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const option = languageOptions.find((item) => item.code === language) || languageOptions[0];
    document.documentElement.lang = option.htmlLang;
    document.documentElement.dir = option.dir;
    window.localStorage.setItem("midnight-tokyo-club-language", language);
  }, [language]);

  useEffect(() => {
    if (!selectedService && filteredServices[0]) {
      chooseService(filteredServices[0]);
    }
  }, [filteredServices, selectedService]);

  async function loadWorkspace() {
    if (!supabaseEnabled) {
      const workspace = loadDemoWorkspace();
      setData(workspace);
      const firstService = workspace.services.find((service) => service.active);
      const firstStaff = workspace.staff.find((staff) => staff.store_id === firstService?.store_id && staff.active);
      setSelectedServiceId(firstService?.id || "");
      setSelectedStaffId(firstStaff?.id || "");
      setReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const [storeResult, staffResult, serviceResult, reservationResult] = await Promise.all([
      supabase.from("stores").select("*").eq("public_booking_enabled", true).order("name"),
      supabase.from("staff_members").select("*").eq("active", true).order("name"),
      supabase.from("services").select("*").eq("active", true).order("name"),
      supabase
        .from("reservations")
        .select("id, store_id, staff_id, service_id, customer_id, starts_at, ends_at, status, memo, payment_status, line_notification_status, reminder_status")
        .neq("status", "canceled")
    ]);

    const workspace: WorkspaceData = {
      stores: (storeResult.data || []) as Store[],
      staff: (staffResult.data || []) as StaffMember[],
      services: (serviceResult.data || []) as Service[],
      customers: [],
      reservations: (reservationResult.data || []) as Reservation[]
    };
    setData(workspace);
    const firstService = workspace.services.find((service) => service.active);
    const firstStaff = workspace.staff.find((staff) => staff.store_id === firstService?.store_id && staff.active);
    setSelectedServiceId(firstService?.id || "");
    setSelectedStaffId(firstStaff?.id || "");
    setReady(true);
  }

  function chooseService(service: Service) {
    const firstStaff = data.staff.find((staff) => staff.store_id === service.store_id && staff.active);
    setSelectedServiceId(service.id);
    setSelectedStaffId(firstStaff?.id || "");
    setSelectedTime("");
  }

  function chooseServiceAndShowSlots(service: Service) {
    chooseService(service);
    window.requestAnimationFrame(() => {
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bookingBusy) return;
    if (!selectedStore || !selectedService || !selectedStaff || !selectedTime) {
      showMessage(c.chooseSlot);
      return;
    }

    const slot = availableSlots.find((item) => item.time === selectedTime);
    if (!slot?.available) {
      showMessage(c.unavailable);
      return;
    }

    const startsAt = combineDateAndTime(slot.displayDate, selectedTime);
    const endsAt = addMinutes(startsAt, selectedService.duration_minutes);
    setBookingBusy(true);
    const calendarPayload = buildCalendarConfirmation({
      service: selectedService,
      staff: selectedStaff,
      store: selectedStore,
      startsAt,
      endsAt,
      guests,
      memo,
      syncStatus: supabaseEnabled ? c.calendarServerPending : c.calendarDemo
    });

    if (!supabaseEnabled) {
      const workspace = loadDemoWorkspace();
      const reservationId = newDemoId("reservation");
      const customer: Customer = {
        id: newDemoId("customer"),
        store_id: selectedStore.id,
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
        memo: `${memo.trim()} Guests: ${guests}`,
        line_user_id: null
      };
      workspace.customers.push(customer);
      workspace.reservations.push({
        id: reservationId,
        store_id: selectedStore.id,
        staff_id: selectedStaff.id,
        service_id: selectedService.id,
        customer_id: customer.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "confirmed",
        memo: `${memo.trim()} Guests: ${guests}`,
        payment_status: "unpaid",
        payment_url: null,
        line_notification_status: selectedStore.line_enabled ? "pending" : "disabled",
        reminder_status: selectedStore.reminder_enabled ? "pending" : "skipped",
        google_event_id: "demo-google-calendar-link"
      });
      saveDemoWorkspace(workspace);
      setData(workspace);
      setConfirmation({ ...calendarPayload, reservationId });
      resetLeadFields();
      showMessage(c.demoConfirmed);
      setBookingBusy(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setBookingBusy(false);
      return;
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        store_id: selectedStore.id,
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
        memo: `${memo.trim()} Guests: ${guests}`
      })
      .select("*")
      .single();

    if (customerError || !customer) {
      showMessage(customerError?.message || c.customerError);
      setBookingBusy(false);
      return;
    }

    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .insert({
        store_id: selectedStore.id,
        staff_id: selectedStaff.id,
        service_id: selectedService.id,
        customer_id: customer.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "confirmed",
        memo: `${memo.trim()} Guests: ${guests}`,
        payment_status: "unpaid",
        line_notification_status: selectedStore.line_enabled ? "pending" : "disabled",
        reminder_status: selectedStore.reminder_enabled ? "pending" : "skipped"
      })
      .select("*")
      .single();

    if (reservationError || !reservation) {
      showMessage(reservationError?.message || c.reservationError);
      setBookingBusy(false);
      return;
    }

    const [, calendarResult] = await Promise.allSettled([
      fetch("/api/line/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: reservation.id })
      }),
      fetch("/api/calendar/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: reservation.id })
      })
    ]);

    await loadWorkspace();
    setConfirmation({
      ...calendarPayload,
      reservationId: reservation.id,
      syncStatus:
        calendarResult.status === "fulfilled" && calendarResult.value.ok
          ? c.calendarServerCreated
          : c.calendarPersonalFallback
    });
    resetLeadFields();
    showMessage(c.confirmed);
    setBookingBusy(false);
  }

  function resetLeadFields() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setMemo("");
    setSelectedTime("");
  }

  function showMessage(nextMessage: string) {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3800);
  }

  if (!ready) {
    return <main className="center-screen">{c.loading}</main>;
  }

  return (
    <main className="marketplace-shell">
      <header className="marketplace-header">
        <a className="brand-lockup" href="#top">
          <span className="brand-mark brand-mark-image" aria-hidden="true">
            <img src="/mtc-logo.png" alt="" />
          </span>
          <span>
            <strong>Midnight Tokyo Club</strong>
            <small>{c.brandSub}</small>
          </span>
        </a>
        <nav className="market-nav" aria-label="Primary">
          <a href="#tours">{c.tours}</a>
          <a href="#plan">Plan</a>
          <a href="#reviews">{c.reviewsNav}</a>
          <a href="/admin">{c.admin}</a>
        </nav>
        <div className="language-strip" aria-label="Languages">
          {languageOptions.map((option) => (
            <button
              aria-pressed={language === option.code}
              className={language === option.code ? "is-active" : ""}
              onClick={() => setLanguage(option.code)}
              type="button"
              key={option.code}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <section className="market-hero" id="top">
        <div className="hero-media" />
        <div className="hero-content">
          <p className="eyebrow">{c.heroEyebrow}</p>
          <h1>{c.heroTitle}</h1>
          <p>{c.heroText}</p>
          <div className="hero-action-row">
            <a className="primary-link" href="#booking">
              {c.viewSlots}
            </a>
            <a className="ghost-link" href="#plan">
              Route plan
            </a>
          </div>
          <div className="trust-row">
            {c.trust.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="visual-wall" aria-label={c.galleryAria}>
        {carGallery.map((image, index) => (
          <figure key={image.src}>
            <img src={image.src} alt="" />
            <figcaption>{c.galleryLabels[index] || image.label}</figcaption>
          </figure>
        ))}
      </section>

      <section className="search-dock" aria-label={c.searchAria}>
        <label className="field">
          <span>{c.keyword}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={c.keywordPlaceholder}
            type="search"
          />
        </label>
        <label className="field">
          <span>{c.area}</span>
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            {regions.map((item) => (
              <option value={item} key={item}>
                {localizeRecord(c.regions, item)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{c.date}</span>
          <input value={date} onChange={(event) => setDate(event.target.value)} min={today} type="date" />
        </label>
        <label className="field">
          <span>{c.guests}</span>
          <input
            value={guests}
            onChange={(event) => setGuests(Math.max(1, Number(event.target.value)))}
            min={1}
            max={10}
            type="number"
          />
        </label>
      </section>

      <section className="category-tabs" aria-label={c.categoriesAria}>
        {categories.map((item) => (
          <button
            className={category === item ? "is-active" : ""}
            onClick={() => setCategory(item)}
            type="button"
            key={item}
          >
            {localizeRecord(c.categories, item)}
          </button>
        ))}
      </section>

      <section className="booking-brief" id="plan" aria-label="Daikoku experience plan">
        <div className="brief-heading">
          <p className="eyebrow">Daikoku booking brief</p>
          <h2>Know the route, vehicle style, and rules before you reserve.</h2>
          <p>
            Inspired by marketplace-style activity pages and premium driving experiences, this view gives travelers
            the essentials before they pick a slot.
          </p>
        </div>

        <div className="brief-signal-grid">
          {referenceSignals.map((item) => (
            <article className="brief-signal" key={item.value}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </div>

        <div className="route-planner">
          <div className="timeline-column">
            <p className="eyebrow">Sample night flow</p>
            <ol className="route-timeline">
              {routeTimeline.map((item) => (
                <li key={item.step}>
                  <strong>{item.step}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="booking-notes">
            <p className="eyebrow">Before you book</p>
            <h3>Clear expectations for international guests.</h3>
            <ul>
              {bookingNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="vehicle-showcase" aria-label="Vehicle request styles">
          {vehicleShowcase.map((vehicle) => (
            <article className="vehicle-card" key={vehicle.title}>
              <img src={vehicle.image} alt="" />
              <div>
                <strong>{vehicle.title}</strong>
                <span>{vehicle.meta}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="marketplace-grid" id="tours">
        <div className="listing-column">
          <div className="listing-summary">
            <div>
              <p className="eyebrow">{c.availableEyebrow}</p>
              <h2>{c.routesMatch.replace("{count}", String(filteredServices.length))}</h2>
            </div>
            <span>{formatLocaleDate(date, language)}</span>
          </div>

          <div className="experience-list">
            {filteredServices.map((service) => {
              const store = publicStores.find((item) => item.id === service.store_id);
              const isSelected = selectedService?.id === service.id;
              return (
                <article className={`experience-card ${isSelected ? "is-selected" : ""}`} key={service.id}>
                  <button className="image-button" type="button" onClick={() => chooseService(service)}>
                    <img src={service.cover_image_url || store?.hero_image_url || ""} alt="" />
                  </button>
                  <div className="experience-body">
                    <div className="experience-topline">
                      <span>{localizeRecord(c.categories, service.category || "Tours")}</span>
                      <strong>{service.rating?.toFixed(2) || "4.80"} / {service.review_count || 0} {c.reviews}</strong>
                    </div>
                    <h3>{service.name}</h3>
                    <p>{service.description}</p>
                    <div className="tag-row">
                      <span>{store?.city || "Tokyo"}</span>
                      <span>{service.route}</span>
                      <span>{service.duration_minutes} {c.minuteSuffix}</span>
                    </div>
                    <div className="highlight-row">
                      {(service.highlights || []).map((highlight) => (
                        <span key={highlight}>{highlight}</span>
                      ))}
                    </div>
                    <div className="experience-footer">
                      <strong>{formatCurrency(service.price_cents)} {c.perGuest}</strong>
                      <button className="secondary-action" type="button" onClick={() => chooseServiceAndShowSlots(service)}>
                        {c.viewSlots}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="booking-rail" id="booking">
          <form className={`booking-widget ${confirmation ? "has-confirmation" : ""}`} onSubmit={submitReservation}>
            <div className="booking-widget-head">
              <div>
                <p className="eyebrow">{c.reserveEyebrow}</p>
                <h2>{selectedService?.name || c.selectTour}</h2>
              </div>
              <div className="booking-price-chip">
                <span>{c.estimatedTotal}</span>
                <strong>{selectedTotal}</strong>
              </div>
            </div>
            <p className="booking-context">
              {selectedStore?.name} / {selectedStaff?.name || c.hostPending} / {guests} {c.guestUnit}
            </p>
            <div className="booking-assurance-row" aria-label="Booking assurances">
              <span>Instant hold</span>
              <span>Mobile voucher</span>
              <span>Admin synced</span>
            </div>

            <label className="field">
              <span>{c.host}</span>
              <select
                value={selectedStaffId}
                onChange={(event) => {
                  setSelectedStaffId(event.target.value);
                  setSelectedTime("");
                }}
              >
                {storeStaff.map((staff) => (
                  <option value={staff.id} key={staff.id}>
                    {staff.name} - {staff.role}
                  </option>
                ))}
              </select>
            </label>

            <div className="slot-picker-panel">
              <div className="slot-heading">
                <span>{availableSlotCount} live slots</span>
                <strong>{selectedDateLabel}</strong>
              </div>
              <div className="mini-slot-grid">
                {availableSlots.map((slot) => (
                  <button
                    className={selectedTime === slot.time ? "is-selected" : ""}
                    disabled={!slot.available}
                    type="button"
                    onClick={() => setSelectedTime(slot.time)}
                    key={`${slot.displayDate}-${slot.time}`}
                  >
                    {formatTime(slot.time)}
                  </button>
                ))}
              </div>
              {selectedSlot ? (
                <div className="selected-slot-summary" aria-live="polite">
                  <span>Selected</span>
                  <strong>{selectedDateLabel} / {formatTime(selectedSlot.time)}</strong>
                </div>
              ) : null}
            </div>

            <div className="form-grid compact">
              <label className="field">
                <span>{c.name}</span>
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
              </label>
              <label className="field">
                <span>{c.email}</span>
                <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} type="email" required />
              </label>
              <label className="field">
                <span>{c.phone}</span>
                <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required />
              </label>
              <label className="field">
                <span>{c.request}</span>
                <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder={c.requestPlaceholder} />
              </label>
            </div>

            <div className="price-box">
              <span>{c.estimatedTotal}</span>
              <strong>{selectedTotal}</strong>
            </div>
            <button className="primary-action reserve-submit" disabled={bookingBusy || !selectedTime} type="submit">
              {bookingBusy ? "Reserving..." : c.reserveButton}
            </button>
            {confirmation ? (
              <div className="confirmation-panel">
                <strong>{c.confirmationTitle}</strong>
                <span>{confirmation.syncStatus}</span>
                {confirmation.reservationId ? <span>Reservation ref: {confirmation.reservationId.slice(0, 8)}</span> : null}
                <a className="secondary-action" href={confirmation.googleUrl} target="_blank" rel="noreferrer">
                  {c.addGoogle}
                </a>
                <button className="ghost-action" type="button" onClick={() => downloadIcs(confirmation)}>
                  {c.downloadIcs}
                </button>
                <a className="ghost-action" href={`/admin?date=${confirmation.startsAt.slice(0, 10)}`}>
                  View in admin
                </a>
              </div>
            ) : null}
          </form>
        </aside>
      </section>

      <section className="review-band" id="reviews">
        <p className="eyebrow">{c.reviewEyebrow}</p>
        <h2>{c.reviewTitle}</h2>
        <div className="review-grid">
          <blockquote>
            <p>{c.reviewQuotes[0]}</p>
            <cite>Jake / USA</cite>
          </blockquote>
          <blockquote>
            <p>{c.reviewQuotes[1]}</p>
            <cite>Thomas / UK</cite>
          </blockquote>
          <blockquote>
            <p>{c.reviewQuotes[2]}</p>
            <cite>Kenji / Singapore</cite>
          </blockquote>
        </div>
      </section>
      {message ? <div className="toast is-visible">{message}</div> : null}
    </main>
  );
}

function nextDayInput(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + 1);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function localizeRecord(records: Record<string, string>, value: string) {
  return records[value] || value;
}

function formatLocaleDate(dateValue: string, language: LanguageCode) {
  const locale =
    languageOptions.find((option) => option.code === language)?.htmlLang || languageOptions[0].htmlLang;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${dateValue}T00:00:00`));
}

function buildCalendarConfirmation({
  service,
  staff,
  store,
  startsAt,
  endsAt,
  guests,
  memo,
  syncStatus
}: {
  service: Service;
  staff: StaffMember;
  store: Store;
  startsAt: Date;
  endsAt: Date;
  guests: number;
  memo: string;
  syncStatus: string;
}) {
  const title = `${service.name} - Midnight Tokyo Club`;
  const details = [
    `Host: ${staff.name}`,
    `Guests: ${guests}`,
    `Route: ${service.route || "Tokyo night route"}`,
    memo ? `Request: ${memo}` : "",
    "Reservation created through Midnight Tokyo Club."
  ]
    .filter(Boolean)
    .join("\n");
  const location = store.address || `${store.city || "Tokyo"}, Japan`;
  const googleUrl = new URL("https://calendar.google.com/calendar/render");
  googleUrl.searchParams.set("action", "TEMPLATE");
  googleUrl.searchParams.set("text", title);
  googleUrl.searchParams.set("dates", `${toGoogleDate(startsAt)}/${toGoogleDate(endsAt)}`);
  googleUrl.searchParams.set("details", details);
  googleUrl.searchParams.set("location", location);

  return {
    title,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    location,
    details,
    googleUrl: googleUrl.toString(),
    syncStatus
  };
}

function toGoogleDate(date: Date) {
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".000", "");
}

function downloadIcs(confirmation: CalendarConfirmation) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Midnight Tokyo Club//Reservation//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}@midnighttokyoclub`,
    `DTSTAMP:${toGoogleDate(new Date())}`,
    `DTSTART:${toGoogleDate(new Date(confirmation.startsAt))}`,
    `DTEND:${toGoogleDate(new Date(confirmation.endsAt))}`,
    `SUMMARY:${escapeIcs(confirmation.title)}`,
    `LOCATION:${escapeIcs(confirmation.location)}`,
    `DESCRIPTION:${escapeIcs(confirmation.details)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "midnight-tokyo-club-reservation.ics";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}
