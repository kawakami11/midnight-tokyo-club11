import { randomUUID } from "crypto";
import { google } from "googleapis";
import type { Customer, Reservation, Service, StaffMember, Store } from "@/lib/types";

export type ReservationWithRelations = Reservation & {
  customer?: Customer | null;
  service?: Service | null;
  staff?: StaffMember | null;
  store?: Store | null;
};

type LinePurpose = "new" | "reminder";

export function getLineConfig() {
  return {
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
    fallbackTarget: process.env.LINE_ADMIN_TO_ID || process.env.LINE_DEFAULT_USER_ID || ""
  };
}

export function getGoogleCalendarConfig() {
  return {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || "",
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "",
    calendarId: process.env.GOOGLE_CALENDAR_ID || ""
  };
}

export function getLineTarget(reservation: ReservationWithRelations) {
  const { fallbackTarget } = getLineConfig();
  return reservation.customer?.line_user_id || fallbackTarget;
}

export function buildLineMessage(reservation: ReservationWithRelations, purpose: LinePurpose) {
  const store = reservation.store;
  const service = reservation.service;
  const staff = reservation.staff;
  const customer = reservation.customer;
  const timezone = store?.timezone || "Asia/Tokyo";
  const startsAt = formatDateTime(reservation.starts_at, timezone);
  const adminUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin?date=${reservation.starts_at.slice(0, 10)}`
    : "";

  const heading = purpose === "reminder" ? "Reservation reminder" : "New reservation confirmed";
  return [
    `[Midnight Tokyo Club] ${heading}`,
    `Store: ${store?.name || reservation.store_id}`,
    `Service: ${service?.name || reservation.service_id}`,
    `Schedule: ${startsAt}`,
    `Host: ${staff?.name || reservation.staff_id}`,
    `Customer: ${customer?.name || reservation.customer_id}`,
    customer?.phone ? `Phone: ${customer.phone}` : "",
    customer?.email ? `Email: ${customer.email}` : "",
    reservation.memo ? `Memo: ${reservation.memo}` : "",
    adminUrl ? `Admin: ${adminUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4900);
}

export async function sendLineText(to: string, text: string) {
  const { token } = getLineConfig();
  if (!token) {
    return { ok: false, status: 501, error: "LINE_CHANNEL_ACCESS_TOKEN is not configured." };
  }
  if (!to) {
    return { ok: false, status: 400, error: "LINE target user/group ID is not configured." };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": randomUUID()
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }]
    })
  });

  if (response.ok) {
    return { ok: true, status: response.status };
  }

  return {
    ok: false,
    status: response.status,
    error: await response.text()
  };
}

export async function upsertGoogleCalendarEvent(reservation: ReservationWithRelations) {
  const { clientEmail, privateKey, calendarId } = getGoogleCalendarConfig();
  if (!clientEmail || !privateKey || !calendarId) {
    return { ok: false, status: 501, error: "Google Calendar credentials are not configured." };
  }

  const timezone = reservation.store?.timezone || "Asia/Tokyo";
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });
  const calendar = google.calendar({ version: "v3", auth });
  const requestBody = buildCalendarEventBody(reservation, timezone);

  try {
    const event = reservation.google_event_id
      ? await calendar.events.patch({
          calendarId,
          eventId: reservation.google_event_id,
          requestBody
        })
      : await calendar.events.insert({
          calendarId,
          requestBody
        });

    return { ok: true, eventId: event.data.id || reservation.google_event_id || "" };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Google Calendar request failed."
    };
  }
}

function buildCalendarEventBody(reservation: ReservationWithRelations, timezone: string) {
  const store = reservation.store;
  const service = reservation.service;
  const staff = reservation.staff;
  const customer = reservation.customer;
  const adminUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin?date=${reservation.starts_at.slice(0, 10)}`
    : "";

  return {
    summary: `${service?.name || "Reservation"} - ${customer?.name || "Guest"}`,
    location: store?.address || store?.name || "",
    description: [
      `Store: ${store?.name || reservation.store_id}`,
      `Staff: ${staff?.name || reservation.staff_id}`,
      `Customer: ${customer?.name || reservation.customer_id}`,
      customer?.phone ? `Phone: ${customer.phone}` : "",
      customer?.email ? `Email: ${customer.email}` : "",
      reservation.memo ? `Memo: ${reservation.memo}` : "",
      adminUrl ? `Admin: ${adminUrl}` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: reservation.starts_at, timeZone: timezone },
    end: { dateTime: reservation.ends_at, timeZone: timezone },
    extendedProperties: {
      private: {
        reservationId: reservation.id,
        storeId: reservation.store_id
      }
    }
  };
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
