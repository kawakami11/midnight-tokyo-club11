"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadDemoWorkspace, newDemoId, saveDemoWorkspace } from "@/lib/demo-store";
import {
  addDays,
  addMinutes,
  combineDateAndTime,
  formatCurrency,
  formatDate,
  formatTime,
  getTimeInputValue,
  getTodayInputValue,
  isPastSlot,
  makeSlotTimes,
  reservationOverlaps,
  toDateInputValue
} from "@/lib/time";
import type {
  Customer,
  NotificationStatus,
  PaymentStatus,
  Reservation,
  ReservationFormState,
  ReservationStatus,
  ReminderStatus,
  Service,
  StaffMember,
  Store,
  WorkspaceData
} from "@/lib/types";

const emptyWorkspace: WorkspaceData = {
  stores: [],
  staff: [],
  services: [],
  customers: [],
  reservations: []
};

const statusLabels: ReservationStatus[] = ["confirmed", "completed", "canceled", "no_show"];
const paymentLabels: PaymentStatus[] = ["unpaid", "pending", "paid", "refunded"];

const reservationStatusLabels: Record<ReservationStatus, string> = {
  confirmed: "確定",
  completed: "完了",
  canceled: "キャンセル",
  no_show: "無断キャンセル"
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "未払い",
  pending: "決済待ち",
  paid: "支払い済み",
  refunded: "返金済み"
};

const notificationStatusLabels: Record<NotificationStatus, string> = {
  pending: "待機",
  sent: "送信済み",
  failed: "失敗",
  disabled: "無効"
};

const reminderStatusLabels: Record<ReminderStatus, string> = {
  pending: "待機",
  sent: "送信済み",
  skipped: "スキップ"
};

function getInitialFilterDate() {
  if (typeof window === "undefined") return getTodayInputValue();
  return new URLSearchParams(window.location.search).get("date") || getTodayInputValue();
}

export default function ReservationDashboard() {
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [filterDate, setFilterDate] = useState(getInitialFilterDate);
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReservationFormState>(() => createBlankForm());

  const supabaseEnabled = isSupabaseConfigured();
  const stores = data.stores;
  const selectedStore = stores.find((store) => store.id === selectedStoreId) || stores[0];
  const storeStaff = data.staff.filter((staff) => staff.store_id === selectedStore?.id && staff.active);
  const storeServices = data.services.filter(
    (service) => service.store_id === selectedStore?.id && service.active
  );

  const enrichedReservations = useMemo(
    () =>
      data.reservations.map((reservation) => ({
        ...reservation,
        customer:
          reservation.customer ||
          data.customers.find((customer) => customer.id === reservation.customer_id),
        service:
          reservation.service || data.services.find((service) => service.id === reservation.service_id),
        staff: reservation.staff || data.staff.find((staff) => staff.id === reservation.staff_id)
      })),
    [data]
  );

  const availableSlots = useMemo(() => {
    const service = storeServices.find((item) => item.id === form.serviceId);
    if (!service || !form.date || !form.staffId) return [];

    const close = combineDateAndTime(form.date, "18:00");
    return makeSlotTimes().map((time) => {
      const start = combineDateAndTime(form.date, time);
      const end = addMinutes(start, service.duration_minutes);
      const conflict = enrichedReservations.some(
        (reservation) =>
          reservation.id !== editingId &&
          reservation.staff_id === form.staffId &&
          reservationOverlaps(reservation, start, end)
      );
      const past = isPastSlot(form.date, time);
      const available = end <= close && !conflict && !past;
      return { time, available, conflict, past };
    });
  }, [editingId, enrichedReservations, form.date, form.serviceId, form.staffId, storeServices]);

  const filteredReservations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enrichedReservations
      .filter((reservation) => reservation.store_id === selectedStore?.id)
      .filter((reservation) => !filterDate || reservation.starts_at.slice(0, 10) === filterDate)
      .filter((reservation) => statusFilter === "all" || reservation.status === statusFilter)
      .filter((reservation) => {
        if (!query) return true;
        return [
          reservation.customer?.name,
          reservation.customer?.email,
          reservation.customer?.phone,
          reservation.customer?.memo,
          reservation.service?.name,
          reservation.staff?.name,
          reservation.memo
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [enrichedReservations, filterDate, search, selectedStore?.id, statusFilter]);

  const metrics = useMemo(() => {
    const active = enrichedReservations.filter(
      (reservation) => reservation.store_id === selectedStore?.id && reservation.status !== "canceled"
    );
    const revenue = active
      .filter((reservation) => reservation.payment_status === "paid")
      .reduce((sum, reservation) => sum + (reservation.service?.price_cents || 0), 0);
    const todayCount = active.filter(
      (reservation) => reservation.starts_at.slice(0, 10) === getTodayInputValue()
    ).length;
    const upcoming = active.filter((reservation) => new Date(reservation.starts_at) >= new Date()).length;
    const reminders = active.filter((reservation) => reservation.reminder_status === "pending").length;
    return { revenue, todayCount, upcoming, reminders };
  }, [enrichedReservations, selectedStore?.id]);

  const salesByService = useMemo(() => {
    const rows = storeServices.map((service) => {
      const revenue = enrichedReservations
        .filter(
          (reservation) =>
            reservation.service_id === service.id &&
            reservation.store_id === selectedStore?.id &&
            reservation.payment_status === "paid"
        )
        .reduce((sum) => sum + service.price_cents, 0);
      return { service, revenue };
    });
    const max = Math.max(...rows.map((row) => row.revenue), 1);
    return rows.map((row) => ({ ...row, percentage: Math.round((row.revenue / max) * 100) }));
  }, [enrichedReservations, selectedStore?.id, storeServices]);

  const todayInput = getTodayInputValue();
  const tomorrowInput = getDateOffsetInputValue(1);
  const openSlotsCount = availableSlots.filter((slot) => slot.available).length;
  const selectedSlot = availableSlots.find((slot) => slot.time === form.time);
  const selectedFormService = storeServices.find((service) => service.id === form.serviceId);
  const selectedFormStaff = storeStaff.find((staff) => staff.id === form.staffId);

  useEffect(() => {
    document.documentElement.lang = "ja";
    document.documentElement.dir = "ltr";
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      const workspace = loadDemoWorkspace();
      setData(workspace);
      setSelectedStoreId(workspace.stores[0]?.id || "");
      setForm(createBlankForm(workspace, workspace.stores[0]?.id));
      setUserEmail("demo@lumareserve.local");
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      const session = sessionData.session;
      setUserEmail(session?.user.email || null);
      if (session?.user) await loadSupabaseWorkspace();
      setReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email || null);
      if (session?.user) void loadSupabaseWorkspace();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedStore) return;
    if (!form.storeId || form.storeId !== selectedStore.id) {
      setForm(createBlankForm(data, selectedStore.id, filterDate));
    }
  }, [data, filterDate, form.storeId, selectedStore]);

  async function loadSupabaseWorkspace() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setBusy(false);
      return;
    }

    const { data: storeRows, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .order("created_at", { ascending: true });

    if (storeError) {
      showMessage(storeError.message);
      setBusy(false);
      return;
    }

    let stores = (storeRows || []) as Store[];
    if (!stores.length) {
      stores = await seedSupabaseWorkspace(user.id);
    }

    const storeIds = stores.map((store) => store.id);
    const [staffResult, serviceResult, customerResult, reservationResult] = await Promise.all([
      supabase.from("staff_members").select("*").in("store_id", storeIds).order("name"),
      supabase.from("services").select("*").in("store_id", storeIds).order("name"),
      supabase.from("customers").select("*").in("store_id", storeIds).order("created_at", { ascending: false }),
      supabase
        .from("reservations")
        .select("*, customer:customers(*), service:services(*), staff:staff_members(*)")
        .in("store_id", storeIds)
        .order("starts_at", { ascending: true })
    ]);

    const nextData: WorkspaceData = {
      stores,
      staff: ((staffResult.data || []) as StaffMember[]).filter(Boolean),
      services: ((serviceResult.data || []) as Service[]).filter(Boolean),
      customers: ((customerResult.data || []) as Customer[]).filter(Boolean),
      reservations: ((reservationResult.data || []) as Reservation[]).filter(Boolean)
    };

    setData(nextData);
    setSelectedStoreId((current) => current || stores[0]?.id || "");
    setForm(createBlankForm(nextData, stores[0]?.id, filterDate));
    setBusy(false);
  }

  async function seedSupabaseWorkspace(userId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return [];

    const { data: store, error } = await supabase
      .from("stores")
      .insert({
        owner_id: userId,
        name: "Midnight Tokyo Club",
        slug: `midnight-tokyo-club-${userId.slice(0, 8)}`,
        address: "Set your private meet point",
        region: "Tokyo",
        city: "Shibuya",
        description: "Premium JDM night access and private tour operations.",
        hero_image_url: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1600&q=80",
        timezone: "Asia/Tokyo",
        cancellation_hours: 24,
        line_enabled: false,
        reminder_enabled: true,
        google_calendar_enabled: false,
        public_booking_enabled: true
      })
      .select("*")
      .single();

    if (error || !store) {
      showMessage(error?.message || "初期店舗を作成できませんでした。");
      return [];
    }

    await Promise.all([
      supabase.from("staff_members").insert([
        { store_id: store.id, name: "Primary Host", role: "Route Host", active: true, color: "#C9A84C" }
      ]),
      supabase.from("services").insert([
        {
          store_id: store.id,
          name: "C1 Midnight Run",
          category: "Signature",
          description: "A late-night Tokyo route built around Shibuya lights, C1 mythology, and real local car culture.",
          route: "Shibuya / C1 / Tokyo Tower",
          highlights: ["Private guide", "Cinematic photo stops", "English-first concierge"],
          cover_image_url: "https://images.unsplash.com/photo-1494587351196-bbf5f29cff42?auto=format&fit=crop&w=1400&q=80",
          rating: 4.9,
          review_count: 1,
          max_guests: 4,
          remaining_seats: 4,
          featured: true,
          duration_minutes: 150,
          price_cents: 38000,
          active: true
        }
      ])
    ]);

    return [store as Store];
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setBusy(true);
    const result =
      authMode === "signup"
        ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
        : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });

    if (result.error) {
      showMessage(result.error.message);
      setBusy(false);
      return;
    }

    setAuthPassword("");
    showMessage(
      authMode === "signup"
        ? "アカウントを作成しました。メール確認が有効な場合は受信箱を確認してください。"
        : "ログインしました。"
    );
    await loadSupabaseWorkspace();
    setBusy(false);
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setUserEmail(null);
    setData(emptyWorkspace);
  }

  async function saveReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStore || !form.serviceId || !form.staffId || !form.time) {
      showMessage("店舗、スタッフ、サービス、日付、空き時間を選択してください。");
      return;
    }

    const service = data.services.find((item) => item.id === form.serviceId);
    if (!service) return;

    const slot = availableSlots.find((item) => item.time === form.time);
    if (!slot?.available) {
      showMessage("この枠はすでに利用できません。");
      return;
    }

    const startsAt = combineDateAndTime(form.date, form.time);
    const endsAt = addMinutes(startsAt, service.duration_minutes);

    setBusy(true);
    if (!supabaseEnabled) {
      saveDemoReservation(startsAt, endsAt);
      setBusy(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const customer = await upsertSupabaseCustomer();
    if (!customer) {
      setBusy(false);
      return;
    }

    const payload = {
      store_id: selectedStore.id,
      staff_id: form.staffId,
      service_id: form.serviceId,
      customer_id: customer.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: form.status,
      memo: form.reservationMemo,
      payment_status: form.paymentStatus,
      line_notification_status: selectedStore.line_enabled ? "pending" : "disabled",
      reminder_status: selectedStore.reminder_enabled ? "pending" : "skipped"
    };

    const result = editingId
      ? await supabase.from("reservations").update(payload).eq("id", editingId).select("*").single()
      : await supabase.from("reservations").insert(payload).select("*").single();

    if (result.error) {
      showMessage(result.error.message);
      setBusy(false);
      return;
    }

    await triggerPostBookingIntegrations(result.data as Reservation);
    await loadSupabaseWorkspace();
    setEditingId(null);
    setForm(createBlankForm(data, selectedStore.id, filterDate));
    showMessage(editingId ? "予約を更新しました。" : "予約を作成しました。");
    setBusy(false);
  }

  function saveDemoReservation(startsAt: Date, endsAt: Date) {
    const workspace = structuredClone(data) as WorkspaceData;
    let customer = workspace.customers.find(
      (item) =>
        item.store_id === selectedStore?.id &&
        item.email.toLowerCase() === form.customerEmail.trim().toLowerCase()
    );

    if (!customer) {
      customer = {
        id: newDemoId("customer"),
        store_id: selectedStore?.id || form.storeId,
        name: form.customerName.trim(),
        email: form.customerEmail.trim(),
        phone: form.customerPhone.trim(),
        memo: form.customerMemo.trim(),
        line_user_id: null
      };
      workspace.customers.push(customer);
    } else {
      customer.name = form.customerName.trim();
      customer.phone = form.customerPhone.trim();
      customer.memo = form.customerMemo.trim();
    }

    if (editingId) {
      workspace.reservations = workspace.reservations.map((reservation) =>
        reservation.id === editingId
          ? {
              ...reservation,
              staff_id: form.staffId,
              service_id: form.serviceId,
              customer_id: customer.id,
              starts_at: startsAt.toISOString(),
              ends_at: endsAt.toISOString(),
              status: form.status,
              memo: form.reservationMemo,
              payment_status: form.paymentStatus
            }
          : reservation
      );
    } else {
      workspace.reservations.push({
        id: newDemoId("reservation"),
        store_id: selectedStore?.id || form.storeId,
        staff_id: form.staffId,
        service_id: form.serviceId,
        customer_id: customer.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: form.status,
        memo: form.reservationMemo,
        payment_status: form.paymentStatus,
        payment_url: null,
        line_notification_status: selectedStore?.line_enabled ? "pending" : "disabled",
        reminder_status: selectedStore?.reminder_enabled ? "pending" : "skipped",
        google_event_id: selectedStore?.google_calendar_enabled ? "demo-calendar-event" : null
      });
    }

    saveDemoWorkspace(workspace);
    setData(workspace);
    setEditingId(null);
    setForm(createBlankForm(workspace, selectedStore?.id, filterDate));
    showMessage(editingId ? "デモモードで予約を更新しました。" : "デモモードで予約を作成しました。");
  }

  async function upsertSupabaseCustomer() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedStore) return null;

    const existingCustomerId = editingId
      ? data.reservations.find((reservation) => reservation.id === editingId)?.customer_id
      : null;

    if (existingCustomerId) {
      const { data: customer, error } = await supabase
        .from("customers")
        .update({
          name: form.customerName.trim(),
          email: form.customerEmail.trim(),
          phone: form.customerPhone.trim(),
          memo: form.customerMemo.trim()
        })
        .eq("id", existingCustomerId)
        .select("*")
        .single();

      if (error) showMessage(error.message);
      return customer as Customer | null;
    }

    const { data: found } = await supabase
      .from("customers")
      .select("*")
      .eq("store_id", selectedStore.id)
      .eq("email", form.customerEmail.trim())
      .maybeSingle();

    if (found) {
      const { data: customer, error } = await supabase
        .from("customers")
        .update({
          name: form.customerName.trim(),
          phone: form.customerPhone.trim(),
          memo: form.customerMemo.trim()
        })
        .eq("id", found.id)
        .select("*")
        .single();

      if (error) showMessage(error.message);
      return customer as Customer | null;
    }

    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        store_id: selectedStore.id,
        name: form.customerName.trim(),
        email: form.customerEmail.trim(),
        phone: form.customerPhone.trim(),
        memo: form.customerMemo.trim()
      })
      .select("*")
      .single();

    if (error) showMessage(error.message);
    return customer as Customer | null;
  }

  async function updateReservationStatus(id: string, status: ReservationStatus) {
    if (!supabaseEnabled) {
      const workspace = {
        ...data,
        reservations: data.reservations.map((reservation) =>
          reservation.id === id ? { ...reservation, status } : reservation
        )
      };
      saveDemoWorkspace(workspace);
      setData(workspace);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.from("reservations").update({ status }).eq("id", id);
    await loadSupabaseWorkspace();
  }

  async function deleteReservation(id: string) {
    if (!window.confirm("この予約を削除しますか？")) return;

    if (!supabaseEnabled) {
      const workspace = {
        ...data,
        reservations: data.reservations.filter((reservation) => reservation.id !== id)
      };
      saveDemoWorkspace(workspace);
      setData(workspace);
      showMessage("予約を削除しました。");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) showMessage(error.message);
    await loadSupabaseWorkspace();
  }

  async function createPaymentLink(reservation: Reservation) {
    if (!supabaseEnabled) {
      showMessage("デモ用の決済リンクを作成しました。本番決済にはStripeキーを追加してください。");
      return;
    }

    const response = await fetch("/api/payments/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: reservation.id })
    });
    const body = (await response.json()) as { url?: string; error?: string };
    if (body.url) {
      window.open(body.url, "_blank", "noopener,noreferrer");
      await loadSupabaseWorkspace();
    } else {
      showMessage(body.error || "決済リンクを作成できませんでした。");
    }
  }

  async function retryLineNotification(reservationId: string) {
    await runReservationIntegration(
      reservationId,
      "/api/line/notify",
      "LINE通知を実行しました。"
    );
  }

  async function syncCalendarEvent(reservationId: string) {
    await runReservationIntegration(
      reservationId,
      "/api/calendar/create-event",
      "Googleカレンダーを同期しました。"
    );
  }

  async function runReservationIntegration(reservationId: string, endpoint: string, successMessage: string) {
    if (!supabaseEnabled) {
      showMessage("実連携はSupabase接続後に利用できます。");
      return;
    }

    setBusy(true);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId })
    });
    const body = (await response.json().catch(() => ({}))) as { status?: string; error?: string };

    if (response.ok) {
      const statusText = body.status ? ` (${body.status})` : "";
      showMessage(`${successMessage}${statusText}`);
      await loadSupabaseWorkspace();
    } else {
      showMessage(body.error || "連携に失敗しました。環境変数と店舗設定を確認してください。");
    }
    setBusy(false);
  }

  async function triggerPostBookingIntegrations(reservation: Reservation) {
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
  }

  function startEdit(reservation: Reservation) {
    const customer = reservation.customer || data.customers.find((item) => item.id === reservation.customer_id);
    setEditingId(reservation.id);
    setSelectedStoreId(reservation.store_id);
    setForm({
      storeId: reservation.store_id,
      staffId: reservation.staff_id,
      serviceId: reservation.service_id,
      date: reservation.starts_at.slice(0, 10),
      time: getTimeInputValue(reservation.starts_at),
      customerName: customer?.name || "",
      customerEmail: customer?.email || "",
      customerPhone: customer?.phone || "",
      customerMemo: customer?.memo || "",
      reservationMemo: reservation.memo || "",
      status: reservation.status,
      paymentStatus: reservation.payment_status
    });
  }

  function exportCsv() {
    const headers = ["顧客名", "メール", "サービス", "スタッフ", "開始日時", "ステータス", "決済", "メモ"];
    const rows = filteredReservations.map((reservation) => [
      reservation.customer?.name || "",
      reservation.customer?.email || "",
      reservation.service?.name || "",
      reservation.staff?.name || "",
      reservation.starts_at,
      getReservationStatusLabel(reservation.status),
      getPaymentStatusLabel(reservation.payment_status),
      reservation.memo || ""
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reservations-${filterDate || "all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function showMessage(nextMessage: string) {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3600);
  }

  if (!ready) {
    return <main className="center-screen">予約管理画面を読み込んでいます...</main>;
  }

  if (supabaseEnabled && !userEmail) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <p className="eyebrow">管理者ログイン</p>
          <h1>Midnight Tokyo Club</h1>
          <p className="muted">
            予約、決済、リマインド、スタッフ枠、店舗運営を管理します。
          </p>
          <form className="stack" onSubmit={handleAuth}>
            <label className="field">
              <span>メールアドレス</span>
              <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} type="email" required />
            </label>
            <label className="field">
              <span>パスワード</span>
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                minLength={6}
                required
              />
            </label>
            <button className="primary-action" disabled={busy} type="submit">
              {authMode === "signin" ? "ログイン" : "アカウント作成"}
            </button>
          </form>
          <button className="text-action" type="button" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>
            {authMode === "signin" ? "アカウントがない場合はこちら" : "すでにアカウントがある場合はこちら"}
          </button>
        </section>
        {message ? <div className="toast is-visible">{message}</div> : null}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="brand-lockup">
          <span className="brand-mark brand-mark-image" aria-hidden="true">
            <img src="/mtc-logo.png" alt="" />
          </span>
          <div>
            <strong>Midnight Tokyo Club</strong>
            <small>{supabaseEnabled ? "Supabase本番モード" : "Supabaseキー追加まではデモモード"}</small>
          </div>
        </div>
        <div className="topbar-actions">
          <a className="secondary-action" href="/">
            公開予約サイト
          </a>
          <button className="secondary-action" type="button" onClick={exportCsv}>
            CSV出力
          </button>
          {supabaseEnabled ? (
            <button className="ghost-action" type="button" onClick={signOut}>
              ログアウト
            </button>
          ) : null}
        </div>
      </header>

      <section className="hero-band">
        <div>
          <p className="eyebrow">管理者用予約MVP</p>
          <h1>予約、スタッフ枠、決済、通知を一画面で管理。</h1>
          <div className="admin-hero-actions">
            <a className="primary-link" href="/">
              公開ページを見る
            </a>
            <button className="ghost-action" type="button" onClick={() => setFilterDate(todayInput)}>
              今日の予約
            </button>
          </div>
        </div>
        <div className="store-switcher">
          <label className="field">
            <span>店舗</span>
            <select
              value={selectedStoreId}
              onChange={(event) => {
                setSelectedStoreId(event.target.value);
                setEditingId(null);
                setForm(createBlankForm(data, event.target.value, filterDate));
              }}
            >
              {stores.map((store) => (
                <option value={store.id} key={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-command-strip" aria-label="連携と公開状態">
        <AdminSignal label="公開予約" value={selectedStore?.public_booking_enabled ? "公開中" : "停止中"} tone={selectedStore?.public_booking_enabled ? "good" : "warn"} />
        <AdminSignal label="LINE通知" value={selectedStore?.line_enabled ? "有効" : "未設定"} tone={selectedStore?.line_enabled ? "good" : "warn"} />
        <AdminSignal label="自動リマインド" value={selectedStore?.reminder_enabled ? "有効" : "停止"} tone={selectedStore?.reminder_enabled ? "good" : "warn"} />
        <AdminSignal label="Googleカレンダー" value={selectedStore?.google_calendar_enabled ? "同期ON" : "未設定"} tone={selectedStore?.google_calendar_enabled ? "good" : "warn"} />
      </section>

      <section className="metric-grid" aria-label="売上と予約指標">
        <Metric label="支払い済み売上" value={formatCurrency(metrics.revenue)} />
        <Metric label="本日の予約" value={String(metrics.todayCount)} />
        <Metric label="今後の予約" value={String(metrics.upcoming)} />
        <Metric label="リマインド待ち" value={String(metrics.reminders)} />
      </section>

      <section className="workspace-grid">
        <div className="reservation-column">
          <div className="toolbar admin-toolbar">
            <label className="field">
              <span>日付検索</span>
              <input value={filterDate} onChange={(event) => setFilterDate(event.target.value)} type="date" />
            </label>
            <label className="field">
              <span>ステータス</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReservationStatus | "all")}>
                <option value="all">すべて</option>
                {statusLabels.map((status) => (
                  <option value={status} key={status}>
                    {getReservationStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field search-field">
              <span>顧客検索</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="名前、メール、メモ" />
            </label>
            <div className="quick-filter-row" aria-label="日付ショートカット">
              <button className={filterDate === todayInput ? "is-active" : ""} type="button" onClick={() => setFilterDate(todayInput)}>
                今日
              </button>
              <button className={filterDate === tomorrowInput ? "is-active" : ""} type="button" onClick={() => setFilterDate(tomorrowInput)}>
                明日
              </button>
              <button className={!filterDate ? "is-active" : ""} type="button" onClick={() => setFilterDate("")}>
                全日程
              </button>
              <button type="button" onClick={() => setStatusFilter("all")}>
                ステータス解除
              </button>
            </div>
          </div>

          <div className="reservation-list">
            {filteredReservations.length ? (
              filteredReservations.map((reservation) => (
                <article className="reservation-card" key={reservation.id}>
                  <div className="reservation-time">
                    <strong>{formatTime(reservation.starts_at)}</strong>
                    <span>{formatDate(reservation.starts_at)}</span>
                  </div>
                  <div className="reservation-main">
                    <div>
                      <h2>{reservation.customer?.name || "顧客名未登録"}</h2>
                      <p>{reservation.service?.name} / 担当: {reservation.staff?.name}</p>
                    </div>
                    <div className="pill-row">
                      <span className={`status-pill status-${reservation.status}`}>{getReservationStatusLabel(reservation.status)}</span>
                      <span className={`status-pill payment-${reservation.payment_status}`}>{getPaymentStatusLabel(reservation.payment_status)}</span>
                      <span className={`status-pill ${reservation.google_event_id ? "calendar-linked" : "calendar-pending"}`}>
                        {reservation.google_event_id ? "カレンダー連携済み" : "カレンダー未連携"}
                      </span>
                      <span className={`status-pill integration-${reservation.line_notification_status}`}>
                        LINE {getNotificationStatusLabel(reservation.line_notification_status)}
                      </span>
                      <span className={`status-pill integration-${reservation.reminder_status}`}>
                        リマインド {getReminderStatusLabel(reservation.reminder_status)}
                      </span>
                    </div>
                    <p className="note-line">{reservation.customer?.memo || "顧客メモはまだありません。"}</p>
                    <p className="note-line">{reservation.memo || "予約メモはまだありません。"}</p>
                  </div>
                  <div className="card-actions">
                    <select
                      value={reservation.status}
                      onChange={(event) => updateReservationStatus(reservation.id, event.target.value as ReservationStatus)}
                    >
                      {statusLabels.map((status) => (
                        <option value={status} key={status}>
                          {getReservationStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                    <button className="secondary-action" type="button" onClick={() => startEdit(reservation)}>
                      編集
                    </button>
                    <button className="secondary-action" type="button" onClick={() => createPaymentLink(reservation)}>
                      決済リンク
                    </button>
                    <button className="secondary-action compact-action" disabled={busy} type="button" onClick={() => retryLineNotification(reservation.id)}>
                      LINE再送
                    </button>
                    <button className="secondary-action compact-action" disabled={busy} type="button" onClick={() => syncCalendarEvent(reservation.id)}>
                      カレンダー同期
                    </button>
                    <button className="danger-action" type="button" onClick={() => deleteReservation(reservation.id)}>
                      削除
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">条件に一致する予約はありません。</div>
            )}
          </div>
        </div>

        <aside className="side-column">
          <form className="editor-panel" onSubmit={saveReservation}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editingId ? "予約編集" : "予約追加"}</p>
                <h2>{editingId ? "予約を更新" : "新規予約"}</h2>
              </div>
              {editingId ? (
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(createBlankForm(data, selectedStore?.id, filterDate));
                  }}
                >
                  クリア
                </button>
              ) : null}
            </div>

            <div className="form-grid">
              <label className="field">
                <span>スタッフ</span>
                <select value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value, time: "" })} required>
                  {storeStaff.map((staff) => (
                    <option value={staff.id} key={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>サービス</span>
                <select value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value, time: "" })} required>
                  {storeServices.map((service) => (
                    <option value={service.id} key={service.id}>
                      {service.name} / {formatCurrency(service.price_cents)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>日付</span>
                <input value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, time: "" })} type="date" required />
              </label>
              <label className="field">
                <span>ステータス</span>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ReservationStatus })}>
                  {statusLabels.map((status) => (
                    <option value={status} key={status}>
                      {getReservationStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="slot-grid" aria-label="スタッフ別の空き枠">
              {availableSlots.map((slot) => (
                <button
                  className={`slot-button ${form.time === slot.time ? "is-selected" : ""}`}
                  disabled={!slot.available}
                  key={slot.time}
                  type="button"
                  onClick={() => setForm({ ...form, time: slot.time })}
                >
                  {formatTime(slot.time)}
                </button>
              ))}
            </div>
            <div className="admin-slot-summary" aria-live="polite">
              <span>空き枠 {openSlotsCount} 件</span>
              <strong>
                {selectedSlot
                  ? `${formatTime(selectedSlot.time)} / ${selectedFormStaff?.name || "担当未選択"}`
                  : selectedFormService
                    ? `${selectedFormService.duration_minutes}分 / ${formatCurrency(selectedFormService.price_cents)}`
                    : "サービスを選択してください"}
              </strong>
            </div>
            {availableSlots.length > 0 && openSlotsCount === 0 ? (
              <p className="inline-hint">この条件で予約できる空き枠はありません。</p>
            ) : null}

            <div className="form-grid">
              <label className="field">
                <span>顧客名</span>
                <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
              </label>
              <label className="field">
                <span>メールアドレス</span>
                <input value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} type="email" required />
              </label>
              <label className="field">
                <span>電話番号</span>
                <input value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
              </label>
              <label className="field">
                <span>決済</span>
                <select value={form.paymentStatus} onChange={(event) => setForm({ ...form, paymentStatus: event.target.value as PaymentStatus })}>
                  {paymentLabels.map((status) => (
                    <option value={status} key={status}>
                      {getPaymentStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>顧客メモ</span>
              <textarea value={form.customerMemo} onChange={(event) => setForm({ ...form, customerMemo: event.target.value })} rows={3} />
            </label>
            <label className="field">
              <span>予約メモ</span>
              <textarea value={form.reservationMemo} onChange={(event) => setForm({ ...form, reservationMemo: event.target.value })} rows={3} />
            </label>
            <button className="primary-action" disabled={busy} type="submit">
              {editingId ? "変更を保存" : "予約を作成"}
            </button>
          </form>

          <section className="integration-panel">
            <p className="eyebrow">自動化</p>
            <h2>連携状況</h2>
            <Integration label="LINE通知" enabled={Boolean(selectedStore?.line_enabled)} />
            <Integration label="自動リマインド" enabled={Boolean(selectedStore?.reminder_enabled)} />
            <Integration label="Googleカレンダー" enabled={Boolean(selectedStore?.google_calendar_enabled)} />
            <Integration label="公開予約ページ" enabled={Boolean(selectedStore?.public_booking_enabled)} />
            <p className="policy-text">
              キャンセルポリシー: 予約開始の{selectedStore?.cancellation_hours || 24}時間前までキャンセル可能です。
            </p>
          </section>

          <section className="analytics-panel">
            <p className="eyebrow">売上分析</p>
            <h2>サービス別売上</h2>
            {salesByService.map((row) => (
              <div className="bar-row" key={row.service.id}>
                <span>{row.service.name}</span>
                <strong>{formatCurrency(row.revenue)}</strong>
                <i style={{ width: `${row.percentage}%` }} />
              </div>
            ))}
          </section>
        </aside>
      </section>
      {message ? <div className="toast is-visible">{message}</div> : null}
    </main>
  );
}

function createBlankForm(data?: WorkspaceData, storeId?: string, date = getTodayInputValue()): ReservationFormState {
  const activeStoreId = storeId || data?.stores[0]?.id || "";
  return {
    storeId: activeStoreId,
    staffId: data?.staff.find((staff) => staff.store_id === activeStoreId && staff.active)?.id || "",
    serviceId: data?.services.find((service) => service.store_id === activeStoreId && service.active)?.id || "",
    date,
    time: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerMemo: "",
    reservationMemo: "",
    status: "confirmed",
    paymentStatus: "unpaid"
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AdminSignal({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" }) {
  return (
    <article className={`admin-signal is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Integration({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="integration-row">
      <span>{label}</span>
      <strong className={enabled ? "is-on" : "is-off"}>{enabled ? "有効" : "未設定"}</strong>
    </div>
  );
}

function getReservationStatusLabel(status: ReservationStatus) {
  return reservationStatusLabels[status];
}

function getPaymentStatusLabel(status: PaymentStatus) {
  return paymentStatusLabels[status];
}

function getNotificationStatusLabel(status: NotificationStatus) {
  return notificationStatusLabels[status];
}

function getReminderStatusLabel(status: ReminderStatus) {
  return reminderStatusLabels[status];
}

function getDateOffsetInputValue(days: number) {
  return toDateInputValue(addDays(new Date(), days));
}
