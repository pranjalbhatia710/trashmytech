import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthSession } from "@/lib/auth";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be signed in to purchase." },
        { status: 401 }
      );
    }

    const origin = request.headers.get("origin") || "http://localhost:3000";

    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: session.user.email,
      metadata: {
        user_id: session.user.id,
        user_email: session.user.email,
      },
      success_url: `${origin}/?payment=success`,
      cancel_url: `${origin}/?payment=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
