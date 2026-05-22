import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  upsertGoogleCalendarEvent,
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
  if (!reservationWithRelations.store?.google_calendar_enabled) {
    return NextResponse.json({ status: "disabled" });
  }

  const result = await upsertGoogleCalendarEvent(reservationWithRelations);
  if (!result.ok || !result.eventId) {
    return NextResponse.json(
      { status: "failed", error: result.error || "Google Calendar event could not be created." },
      { status: result.status || 502 }
    );
  }

  await supabase
    .from("reservations")
    .update({ google_event_id: result.eventId })
    .eq("id", reservationId);

  return NextResponse.json({
    status: reservationWithRelations.google_event_id ? "updated" : "created",
    eventId: result.eventId
  });
}
