import type { Reservation } from "@/lib/types";

export function getTodayInputValue() {
  return toDateInputValue(new Date());
}

export function toDateInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}

export function formatTime(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`2026-01-01T${value}:00`);
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function getTimeInputValue(isoValue: string) {
  const date = new Date(isoValue);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function combineDateAndTime(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue}:00`);
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

export function makeSlotTimes(openHour = 9, closeHour = 18, stepMinutes = 30) {
  const slots: string[] = [];
  for (let hour = openHour; hour < closeHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += stepMinutes) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

export function reservationOverlaps(
  reservation: Reservation,
  candidateStart: Date,
  candidateEnd: Date
) {
  if (reservation.status === "canceled") return false;
  return rangesOverlap(
    new Date(reservation.starts_at),
    new Date(reservation.ends_at),
    candidateStart,
    candidateEnd
  );
}

export function isPastSlot(dateValue: string, timeValue: string) {
  return combineDateAndTime(dateValue, timeValue).getTime() < Date.now();
}
