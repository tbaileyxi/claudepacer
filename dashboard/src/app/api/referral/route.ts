/**
 * GET  /api/referral?userId=xxx  — get user's referral info
 * POST /api/referral             — register a new user (optionally with referral code)
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser, getReferrerByCode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = getOrCreateUser(userId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return NextResponse.json({
    referralCode: user.referralCode,
    referralUrl: `${appUrl}/?ref=${user.referralCode}`,
    tier: user.tier,
    creditsCents: user.creditsCents,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { userId, referralCode } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = getOrCreateUser(userId);

    // Validate the referral code they arrived with (for attribution on purchase)
    let referrerValid = false;
    if (referralCode) {
      const referrer = getReferrerByCode(referralCode);
      referrerValid = !!(referrer && referrer.id !== userId);
    }

    return NextResponse.json({
      userId: user.id,
      tier: user.tier,
      referralCode: user.referralCode,
      creditsCents: user.creditsCents,
      referrerValid,
    });
  } catch (err) {
    console.error("[/api/referral POST]", err);
    return NextResponse.json({ error: "Failed to register user" }, { status: 500 });
  }
}
