/**
 * POST /api/payment/checkout
 *
 * Creates a Stripe Checkout session for the $29 lifetime upgrade.
 * If a referral code is provided and valid, applies a $5 discount (user pays $24).
 */

import { NextRequest, NextResponse } from "next/server";
import { getReferrerByCode, getOrCreateUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.LIFETIME_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!stripeKey || !priceId) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY and LIFETIME_PRICE_ID in your .env file.",
      },
      { status: 501 }
    );
  }

  try {
    const { userId, referralCode } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Validate referral code
    let referrerId: string | null = null;
    let discountCoupon: string | null = null;

    if (referralCode) {
      const referrer = getReferrerByCode(referralCode);
      if (referrer && referrer.id !== userId) {
        referrerId = referrer.id;
        discountCoupon = await getOrCreateReferralCoupon(stripeKey);
      }
    }

    // Dynamically import Stripe only when needed
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    const user = getOrCreateUser(userId);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?cancelled=1`,
      discounts: discountCoupon ? [{ coupon: discountCoupon }] : undefined,
      metadata: {
        userId,
        referrerId: referrerId ?? "",
        referralCode: referralCode ?? "",
        referralCredits: user.creditsCents.toString(),
      },
      allow_promotion_codes: !discountCoupon, // allow manual promo codes if no auto-discount
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[/api/payment/checkout]", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

/**
 * Gets or creates the $5-off referral coupon in Stripe.
 * We reuse a single named coupon so we don't flood the Stripe dashboard.
 */
async function getOrCreateReferralCoupon(stripeKey: string): Promise<string> {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const couponId = "CLAUDEPACER_REFERRAL_5OFF";

  try {
    await stripe.coupons.retrieve(couponId);
    return couponId;
  } catch {
    await stripe.coupons.create({
      id: couponId,
      name: "Referral — $5 off",
      amount_off: 500, // $5.00 in cents
      currency: "usd",
      duration: "once",
    });
    return couponId;
  }
}
