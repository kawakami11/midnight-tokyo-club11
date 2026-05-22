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
  const { reservationId } = (await request.json()) as { reservationId?: string };
  const supabase = getSupabaseAdminClient();

  if (!reservationId) {
    return NextResponse.json({ error: "reservationId is required." }, { status: 400 });
  }

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service credentials are not configured." },
      { status: 501 }
    );
  }

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("*, customer:customers(*), service:services(*), staff:staff_members(*), store:stores(*)")
    .eq("id", reservationId)
    .single();

  if (error || !reservation) {
    return NextResponse.json({ error: error?.message || "Reservation not found." }, { status: 404 });
  }

  const reservationWithRelations = reservation as ReservationWithRelations;
  if (!reservationWithRelations.store?.line_enabled) {
    await supabase
      .from("reservations")
      .update({ line_notification_status: "disabled" })
      .eq("id", reservationId);
    return NextResponse.json({ status: "disabled" });
  }

  const { token } = getLineConfig();
  const target = getLineTarget(reservationWithRelations);
  if (!token || !target) {
    await supabase
      .from("reservations")
      .update({ line_notification_status: "failed" })
      .eq("id", reservationId);
    return NextResponse.json(
      { error: "LINE_CHANNEL_ACCESS_TOKEN and LINE target ID are required." },
      { status: 501 }
    );
  }

  const result = await sendLineText(target, buildLineMessage(reservationWithRelations, "new"));

  await supabase
    .from("reservations")
    .update({ line_notification_status: result.ok ? "sent" : "failed" })
    .eq("id", reservationId);

  return NextResponse.json(
    { status: result.ok ? "sent" : "failed", error: result.ok ? undefined : result.error },
    { status: result.ok ? 200 : result.status || 502 }
  );
}
