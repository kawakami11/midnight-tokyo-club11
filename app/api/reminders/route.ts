import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildLineMessage,
  getLineConfig,
  getLineTarget,
  sendLineText,
  type ReservationWithRelations
} from "@/lib/integrations/reservation-integrations";

export async function POST(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret =
    request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { token: lineToken } = getLineConfig();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase service credentials are not configured." }, { status: 501 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("*, customer:customers(*), service:services(*), staff:staff_members(*), store:stores(*)")
    .eq("reminder_status", "pending")
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd)
    .neq("status", "canceled");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const reservation of reservations || []) {
    const reservationWithRelations = reservation as ReservationWithRelations;
    const lineTarget = getLineTarget(reservationWithRelations);
    if (!reservationWithRelations.store?.reminder_enabled) {
      await supabase.from("reservations").update({ reminder_status: "skipped" }).eq("id", reservation.id);
      skipped += 1;
      continue;
    }

    if (!lineToken || !lineTarget) {
      failed += 1;
      continue;
    }

    const result = await sendLineText(lineTarget, buildLineMessage(reservationWithRelations, "reminder"));

    await supabase
      .from("reservations")
      .update({ reminder_status: result.ok ? "sent" : "pending" })
      .eq("id", reservation.id);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({ checked: reservations?.length || 0, sent, skipped, failed });
}

export async function GET(request: Request) {
  return POST(request);
}
