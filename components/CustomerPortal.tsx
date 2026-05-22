"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadDemoWorkspace, newDemoId, saveDemoWorkspace } from "@/lib/demo-store";
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
import type { Customer, Reservation, Store, WorkspaceData } from "@/lib/types";

export default function CustomerPortal() {
  const [data, setData] = useState<WorkspaceData>({
    stores: [],
    staff: [],
    services: [],
    customers: [],
    reservations: []
  });
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [storeId, setStoreId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(getTodayInputValue());
  const [time, setTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [memo, setMemo] = useState("");

  const supabaseEnabled = isSupabaseConfigured();
  const publicStores = data.stores.filter((store) => store.public_booking_enabled);
  const selectedStore = publicStores.find((store) => store.id === storeId) || publicStores[0];
  const staff = data.staff.filter((item) => item.store_id === selectedStore?.id && item.active);
  const services = data.services.filter((item) => item.store_id === selectedStore?.id && item.active);
  const selectedService = services.find((service) => service.id === serviceId) || services[0];

  const slots = useMemo(() => {
    if (!selectedService || !staffId || !date) return [];
    const close = combineDateAndTime(date, "18:00");
    return makeSlotTimes().map((slotTime) => {
      const start = combineDateAndTime(date, slotTime);
      const end = addMinutes(start, selectedService.duration_minutes);
      const conflict = data.reservations.some(
        (reservation) =>
          reservation.staff_id === staffId &&
          reservationOverlaps(reservation, start, end)
      );
      return {
        time: slotTime,
        available: end <= close && !conflict && !isPastSlot(date, slotTime)
      };
    });
  }, [data.reservations, date, selectedService, staffId]);

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!selectedStore) return;
    setStoreId((current) => current || selectedStore.id);
    setStaffId((current) => current || staff[0]?.id || "");
    setServiceId((current) => current || services[0]?.id || "");
  }, [selectedStore, services, staff]);

  async function loadWorkspace() {
    if (!supabaseEnabled) {
      const workspace = loadDemoWorkspace();
      setData(workspace);
      setStoreId(workspace.stores.find((store) => store.public_booking_enabled)?.id || "");
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

    const workspace = {
      stores: (storeResult.data || []) as WorkspaceData["stores"],
      staff: (staffResult.data || []) as WorkspaceData["staff"],
      services: (serviceResult.data || []) as WorkspaceData["services"],
      customers: [],
      reservations: (reservationResult.data || []) as Reservation[]
    };
    setData(workspace);
    setStoreId(workspace.stores[0]?.id || "");
    setReady(true);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStore || !selectedService || !staffId || !time) {
      setMessage("Please choose an available time.");
      return;
    }

    const slot = slots.find((item) => item.time === time);
    if (!slot?.available) {
      setMessage("That slot is no longer available.");
      return;
    }

    const startsAt = combineDateAndTime(date, time);
    const endsAt = addMinutes(startsAt, selectedService.duration_minutes);

    if (!supabaseEnabled) {
      const workspace = loadDemoWorkspace();
      const customer: Customer = {
        id: newDemoId("customer"),
        store_id: selectedStore.id,
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
        memo: memo.trim(),
        line_user_id: null
      };
      workspace.customers.push(customer);
      workspace.reservations.push({
        id: newDemoId("reservation"),
        store_id: selectedStore.id,
        staff_id: staffId,
        service_id: selectedService.id,
        customer_id: customer.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "confirmed",
        memo: memo.trim(),
        payment_status: "unpaid",
        payment_url: null,
        line_notification_status: selectedStore.line_enabled ? "pending" : "disabled",
        reminder_status: selectedStore.reminder_enabled ? "pending" : "skipped",
        google_event_id: null
      });
      saveDemoWorkspace(workspace);
      setData(workspace);
      resetForm();
      setMessage("Your reservation is confirmed.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        store_id: selectedStore.id,
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
        memo: memo.trim()
      })
      .select("*")
      .single();

    if (customerError || !customer) {
      setMessage(customerError?.message || "Could not create customer.");
      return;
    }

    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .insert({
        store_id: selectedStore.id,
        staff_id: staffId,
        service_id: selectedService.id,
        customer_id: customer.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "confirmed",
        memo: memo.trim(),
        payment_status: "unpaid",
        line_notification_status: selectedStore.line_enabled ? "pending" : "disabled",
        reminder_status: selectedStore.reminder_enabled ? "pending" : "skipped"
      })
      .select("*")
      .single();

    if (reservationError || !reservation) {
      setMessage(reservationError?.message || "Could not create reservation.");
      return;
    }

    await Promise.allSettled([
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
    resetForm();
    setMessage("Your reservation is confirmed.");
  }

  function resetForm() {
    setTime("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setMemo("");
  }

  if (!ready) {
    return <main className="center-screen">Loading booking page...</main>;
  }

  return (
    <main className="customer-shell">
      <a className="secondary-action back-link" href="/admin">
        Admin
      </a>
      <section className="customer-hero">
        <p className="eyebrow">Online booking</p>
        <h1>Choose a time that works for you.</h1>
        <p>
          Select a store, service, staff member, and open slot. You will receive confirmation
          after the reservation is created.
        </p>
      </section>

      <form className="customer-booking-panel" onSubmit={submitBooking}>
        <div className="form-grid">
          <label className="field">
            <span>Store</span>
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)} required>
              {publicStores.map((store) => (
                <option value={store.id} key={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Service</span>
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
              {services.map((service) => (
                <option value={service.id} key={service.id}>
                  {service.name} · {formatCurrency(service.price_cents)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Staff</span>
            <select value={staffId} onChange={(event) => setStaffId(event.target.value)} required>
              {staff.map((member) => (
                <option value={member.id} key={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input value={date} onChange={(event) => setDate(event.target.value)} min={getTodayInputValue()} type="date" required />
          </label>
        </div>

        <div className="slot-grid customer-slots">
          {slots.map((slot) => (
            <button
              className={`slot-button ${time === slot.time ? "is-selected" : ""}`}
              disabled={!slot.available}
              key={slot.time}
              type="button"
              onClick={() => setTime(slot.time)}
            >
              {formatTime(slot.time)}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} type="email" required />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required />
          </label>
          <label className="field">
            <span>Request</span>
            <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Optional note" />
          </label>
        </div>

        <p className="policy-text">
          Cancellation policy: changes are accepted up to {(selectedStore as Store | undefined)?.cancellation_hours || 24} hours before the appointment.
        </p>
        <button className="primary-action" type="submit">
          Confirm Reservation
        </button>
        {message ? <div className="inline-message">{message}</div> : null}
      </form>
    </main>
  );
}
