/**
 * POST /api/payment/webhook
 *
 * Stripe webhook handler.
 * Upgrades the user to 'paid' tier and credits the referrer on successful purchase.
 */

import { NextRequest, NextResponse } from "next/server";
import { upgradeToPaid, recordReferralConversion, addCredits } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ received: false }, { status: 200 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: { type: string; data: { object: Record<string, unknown> } };

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret) as unknown as typeof event;
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      metadata?: {
        userId?: string;
        referrerId?: string;
        referralCode?: string;
      };
      payment_status?: string;
    };

    if (session.payment_status === "paid" && session.metadata?.userId) {
      const { userId, referrerId, referralCode } = session.metadata;

      // Upgrade the buyer to paid tier
      upgradeToPaid(userId);

      // If referred, credit the referrer and record the conversion
      if (referrerId && referralCode) {
        recordReferralConversion(referrerId, userId, referralCode);
      }

      // The buyer also gets their $5 credit stored (already applied via Stripe coupon discount)
      // Optionally store it locally for display purposes:
      if (referrerId) {
        addCredits(userId, 500); // buyer's $5 saving, tracked locally
      }

      console.log(`[webhook] Upgraded user ${userId} to paid tier`);
    }
  }

  return NextResponse.json({ received: true });
}
