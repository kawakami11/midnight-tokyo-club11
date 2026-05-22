import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const supabase = getSupabaseAdminClient();

  if (!stripeKey || !webhookSecret || !signature || !supabase) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 501 });
  }

  const stripe = new Stripe(stripeKey);
  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const reservationId = session.metadata?.reservation_id;
    if (reservationId) {
      await supabase
        .from("reservations")
        .update({ payment_status: "paid" })
        .eq("id", reservationId);
    }
  }

  return NextResponse.json({ received: true });
}
