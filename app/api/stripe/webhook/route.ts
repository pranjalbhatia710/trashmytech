import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
  });
}

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? ""
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userEmail = session.metadata?.user_email || session.customer_email;
    const userId = session.metadata?.user_id;

    if (userEmail || userId) {
      try {
        await fetch(`${BACKEND_URL}/v1/auth/verify-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            user_id: userId,
            stripe_session_id: session.id,
            amount_total: session.amount_total,
          }),
        });
      } catch (err) {
        console.error("Failed to notify backend of payment:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
