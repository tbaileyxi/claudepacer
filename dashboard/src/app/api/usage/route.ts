import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/litellm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getUsageStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[/api/usage]", err);
    return NextResponse.json(
      { error: "Failed to fetch usage stats" },
      { status: 500 }
    );
  }
}
