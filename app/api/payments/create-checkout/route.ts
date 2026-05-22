import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { reservationId } = (await request.json()) as { reservationId?: string };
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const supabase = getSupabaseAdminClient();

  if (!reservationId) {
    return NextResponse.json({ error: "reservationId is required." }, { status: 400 });
  }

  if (!stripeKey || !supabase) {
    return NextResponse.json(
      { error: "Stripe and Supabase service credentials are not configured." },
      { status: 501 }
    );
  }

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select("*, customer:customers(*), service:services(*), store:stores(*)")
    .eq("id", reservationId)
    .single();

  if (error || !reservation) {
    return NextResponse.json({ error: error?.message || "Reservation not found." }, { status: 404 });
  }

  const stripe = new Stripe(stripeKey);
  const service = reservation.service;
  const customer = reservation.customer;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: customer?.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: service.price_cents,
          product_data: {
            name: service.name,
            description: `Reservation on ${new Date(reservation.starts_at).toLocaleString("en")}`
          }
        }
      }
    ],
    metadata: {
      reservation_id: reservation.id,
      store_id: reservation.store_id
    },
    success_url: `${appUrl}/?payment=success`,
    cancel_url: `${appUrl}/?payment=cancelled`
  });

  await supabase
    .from("reservations")
    .update({ payment_status: "pending", payment_url: session.url })
    .eq("id", reservation.id);

  return NextResponse.json({ url: session.url });
}
