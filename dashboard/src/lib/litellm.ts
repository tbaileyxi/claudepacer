/**
 * LiteLLM proxy client.
 * Fetches spend logs and computes the burn-rate metrics shown in the dashboard.
 */

import { getWeekStart, estimateCost } from "./utils";

const BASE_URL = process.env.LITELLM_BASE_URL || "http://localhost:4000";
const MASTER_KEY = process.env.LITELLM_MASTER_KEY || "";

interface SpendLog {
  request_id: string;
  model: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  spend: number;          // USD
  startTime: string;      // ISO 8601
  endTime: string;
  user?: string;
  api_key?: string;
}

async function fetchLiteLLM<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${MASTER_KEY}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 0 }, // always fresh
  });

  if (!res.ok) {
    throw new Error(`LiteLLM ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ── Public stats types ────────────────────────────────────────────────────────

export interface UsageStats {
  // Burn rate (rolling 5-min window)
  burnRatePerMin: number;         // tokens/min
  burnRatePrev: number;           // tokens/min from previous 5-min window
  acceleration: "up" | "down" | "steady";
  multiplierVsAvg: number;        // e.g. 2.4 means "2.4× average"

  // Weekly totals
  tokensThisWeek: number;
  weeklyLimit: number;
  weeklyPctUsed: number;          // 0–1
  projectedDaysRemaining: number;

  // Cost
  costThisWeek: number;           // USD
  costThisMonth: number;          // USD

  // Session
  tokensThisSession: number;
  sessionStartedAt: Date | null;

  // Meta
  isLive: boolean;                // false → demo mode
  lastUpdatedAt: Date;
}

// Average user burn rate baseline (tokens/min) — used for the "× avg" display
const BASELINE_TOKENS_PER_MIN = 350;
const WEEKLY_LIMIT = parseInt(process.env.WEEKLY_TOKEN_LIMIT || "1000000", 10);

// ── Main export ───────────────────────────────────────────────────────────────

export async function getUsageStats(): Promise<UsageStats> {
  try {
    const logs = await fetchSpendLogs();
    return computeStats(logs);
  } catch {
    // LiteLLM not reachable — return demo data so the UI still looks great
    return getDemoStats();
  }
}

async function fetchSpendLogs(): Promise<SpendLog[]> {
  const weekStart = getWeekStart();
  const startDate = weekStart.toISOString().split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const data = await fetchLiteLLM<{ spend_logs?: SpendLog[] }>(
    `/spend/logs?start_date=${startDate}&end_date=${endDate}`
  );
  return data.spend_logs ?? [];
}

function computeStats(logs: SpendLog[]): UsageStats {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let tokensThisWeek = 0;
  let tokensLast5Min = 0;
  let tokensPrev5Min = 0;
  let costThisWeek = 0;
  let costThisMonth = 0;
  let tokensThisSession = 0;
  let sessionStartedAt: Date | null = null;
  let lastActivityAt: Date | null = null;

  for (const log of logs) {
    const ts = new Date(log.startTime);

    if (ts >= weekStart) {
      tokensThisWeek += log.total_tokens;
      costThisWeek += log.spend;
    }
    if (ts >= monthStart) {
      costThisMonth += log.spend;
    }
    if (ts >= fiveMinAgo) {
      tokensLast5Min += log.total_tokens;
    }
    if (ts >= tenMinAgo && ts < fiveMinAgo) {
      tokensPrev5Min += log.total_tokens;
    }

    // Session = continuous activity (gap < 30 min)
    if (
      lastActivityAt &&
      ts.getTime() - lastActivityAt.getTime() < 30 * 60 * 1000
    ) {
      tokensThisSession += log.total_tokens;
    } else {
      // New session
      tokensThisSession = log.total_tokens;
      sessionStartedAt = ts;
    }
    lastActivityAt = ts;
  }

  const burnRatePerMin = tokensLast5Min / 5;
  const burnRatePrev = tokensPrev5Min / 5;

  const accelDiff = burnRatePerMin - burnRatePrev;
  const acceleration =
    Math.abs(accelDiff) < 20
      ? "steady"
      : accelDiff > 0
      ? "up"
      : "down";

  const weeklyPctUsed = Math.min(tokensThisWeek / WEEKLY_LIMIT, 1);
  const tokensRemaining = Math.max(WEEKLY_LIMIT - tokensThisWeek, 0);

  // How many minutes of current burn to exhaust the remaining budget?
  const projectedDaysRemaining =
    burnRatePerMin > 0
      ? tokensRemaining / burnRatePerMin / (60 * 24)
      : Infinity;

  return {
    burnRatePerMin,
    burnRatePrev,
    acceleration,
    multiplierVsAvg: burnRatePerMin / BASELINE_TOKENS_PER_MIN,
    tokensThisWeek,
    weeklyLimit: WEEKLY_LIMIT,
    weeklyPctUsed,
    projectedDaysRemaining,
    costThisWeek,
    costThisMonth,
    tokensThisSession,
    sessionStartedAt,
    isLive: true,
    lastUpdatedAt: now,
  };
}

// ── Demo mode (LiteLLM unreachable) ───────────────────────────────────────────

function getDemoStats(): UsageStats {
  // Simulate a mid-week user who has burned ~38% of their budget
  const used = Math.floor(WEEKLY_LIMIT * 0.38);
  const burnRate = 420 + Math.random() * 80 - 40; // ~420 tokens/min
  const tokensRemaining = WEEKLY_LIMIT - used;
  const projDays = tokensRemaining / burnRate / (60 * 24);

  return {
    burnRatePerMin: burnRate,
    burnRatePrev: burnRate * 0.85,
    acceleration: "up",
    multiplierVsAvg: burnRate / BASELINE_TOKENS_PER_MIN,
    tokensThisWeek: used,
    weeklyLimit: WEEKLY_LIMIT,
    weeklyPctUsed: used / WEEKLY_LIMIT,
    projectedDaysRemaining: projDays,
    costThisWeek: estimateCost(used),
    costThisMonth: estimateCost(used * 1.4),
    tokensThisSession: 14_200,
    sessionStartedAt: new Date(Date.now() - 47 * 60 * 1000),
    isLive: false,
    lastUpdatedAt: new Date(),
  };
}

// ── Context window estimation ─────────────────────────────────────────────────

/**
 * Estimates current effective context size based on recent token usage.
 * Used by the memory-save feature to show before/after counts.
 */
export async function estimateContextSize(): Promise<number> {
  try {
    const logs = await fetchSpendLogs();
    // Find the most recent request
    if (logs.length === 0) return 12_000;
    const last = logs[logs.length - 1];
    return last.prompt_tokens ?? 12_000;
  } catch {
    return 12_000; // demo fallback
  }
}
