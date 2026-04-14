"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Speedometer from "@/components/Speedometer";
import GasGauge from "@/components/GasGauge";
import MemoryButtons from "@/components/MemoryButtons";
import ReferralSection from "@/components/ReferralSection";
import StatsBar from "@/components/StatsBar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageStats {
  burnRatePerMin: number;
  acceleration: "up" | "down" | "steady";
  multiplierVsAvg: number;
  tokensThisWeek: number;
  weeklyLimit: number;
  weeklyPctUsed: number;
  projectedDaysRemaining: number;
  costThisWeek: number;
  costThisMonth: number;
  tokensThisSession: number;
  sessionStartedAt: string | null;
  isLive: boolean;
  lastUpdatedAt: string;
}

interface UserInfo {
  userId: string;
  tier: "free" | "paid";
  referralCode: string;
  referralUrl: string;
  creditsCents: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateUserId(): string {
  // Simple fingerprint — not truly unique but good enough for MVP
  // In production, replace with auth (e.g. NextAuth, Clerk)
  const stored = localStorage.getItem("cpUserId");
  if (stored) return stored;
  const id = "u_" + Math.random().toString(36).slice(2, 12);
  localStorage.setItem("cpUserId", id);
  return id;
}

function getReferralCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("ref");
}

function getUpgradedFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("upgraded");
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Bootstrap ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let userId: string;
    try {
      userId = generateUserId();
    } catch {
      userId = "u_anon";
    }

    const refCode = getReferralCodeFromUrl();
    const upgraded = getUpgradedFromUrl();

    if (upgraded) setJustUpgraded(true);

    // Register / fetch user info
    fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, referralCode: refCode }),
    })
      .then((r) => r.json())
      .then((data) => {
        setUser({
          userId: data.userId,
          tier: data.tier,
          referralCode: data.referralCode,
          referralUrl: `${window.location.origin}/?ref=${data.referralCode}`,
          creditsCents: data.creditsCents,
        });
      })
      .catch(console.error);

    // Fetch usage stats immediately
    fetchStats();

    // Poll every 30 seconds
    pollRef.current = setInterval(fetchStats, 30_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) return;
      const data: UsageStats = await res.json();
      setStats(data);
    } catch {
      // silent — keeps stale data
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Upgrade flow ─────────────────────────────────────────────────────────────

  async function handleUpgrade() {
    if (!user) return;
    setUpgradeLoading(true);
    try {
      const refCode = getReferralCodeFromUrl();
      const res = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          referralCode: refCode,
        }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        // Stripe not configured — show a friendly message
        alert(
          `Payment not configured yet.\n\n${data.error}\n\nSee .env.example to set up Stripe.`
        );
      }
    } catch {
      alert("Upgrade failed — please try again.");
    } finally {
      setUpgradeLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isPaid = user?.tier === "paid";

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-surface-700 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
            CP
          </div>
          <div>
            <h1 className="font-bold text-white text-sm leading-none">
              ClaudePacer
            </h1>
            <p className="text-xs text-white/30 mt-0.5 hidden sm:block">
              Stop driving Claude without a speedometer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <span className={isPaid ? "badge-paid" : "badge-free"}>
              {isPaid ? "✦ Pro" : "Free"}
            </span>
          )}
          {!isPaid && (
            <button
              onClick={handleUpgrade}
              disabled={upgradeLoading}
              className="btn-primary text-xs py-2 px-4"
            >
              {upgradeLoading ? "Loading…" : "Upgrade $29"}
            </button>
          )}
        </div>
      </header>

      {/* ── Just upgraded banner ─────────────────────────────────────────── */}
      {justUpgraded && (
        <div className="bg-gauge-green/15 border-b border-gauge-green/30 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gauge-green text-sm font-medium">
            <span>🎉</span>
            <span>
              You&apos;re now a Pro user! Memory Tools are unlocked — enjoy the
              savings.
            </span>
          </div>
          <button
            onClick={() => setJustUpgraded(false)}
            className="text-gauge-green/50 hover:text-gauge-green text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* ── Gauges row ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-6 h-72 shimmer rounded-2xl" />
            <div className="card p-6 h-72 shimmer rounded-2xl" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Speedometer */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">
                  Burn Rate
                </h2>
                {!stats.isLive && (
                  <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    Demo mode
                  </span>
                )}
              </div>
              <Speedometer
                tokensPerMin={stats.burnRatePerMin}
                acceleration={stats.acceleration}
                multiplierVsAvg={stats.multiplierVsAvg}
              />
            </div>

            {/* Gas Gauge */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">
                  Weekly Budget
                </h2>
              </div>
              <GasGauge
                tokensUsed={stats.tokensThisWeek}
                weeklyLimit={stats.weeklyLimit}
                projectedDaysRemaining={stats.projectedDaysRemaining}
                costThisWeek={stats.costThisWeek}
              />
            </div>
          </div>
        ) : (
          <div className="card p-10 text-center text-white/40">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="font-medium">Could not load usage data.</p>
            <p className="text-sm mt-1">
              Make sure LiteLLM is running and your{" "}
              <code className="text-brand-400">.env</code> is configured.
            </p>
          </div>
        )}

        {/* ── Stats bar ─────────────────────────────────────────────────── */}
        {stats && (
          <StatsBar
            tokensThisSession={stats.tokensThisSession}
            sessionStartedAt={
              stats.sessionStartedAt ? new Date(stats.sessionStartedAt) : null
            }
            costThisWeek={stats.costThisWeek}
            costThisMonth={stats.costThisMonth}
            isLive={stats.isLive}
            lastUpdatedAt={new Date(stats.lastUpdatedAt)}
          />
        )}

        {/* ── Memory tools ─────────────────────────────────────────────── */}
        {user && (
          <div className="card p-5">
            <MemoryButtons
              isPaid={isPaid}
              userId={user.userId}
              onUpgradeClick={handleUpgrade}
              onSuccess={fetchStats}
            />
          </div>
        )}

        {/* ── Referral section ─────────────────────────────────────────── */}
        {user && (
          <ReferralSection
            referralCode={user.referralCode}
            referralUrl={user.referralUrl}
            creditsCents={user.creditsCents}
          />
        )}

        {/* ── Setup hint (demo mode) ───────────────────────────────────── */}
        {stats && !stats.isLive && (
          <div className="card p-5 border-amber-500/20">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <span>💡</span> Connect Claude to see live data
            </h3>
            <ol className="text-sm text-white/50 space-y-2 list-none">
              <li className="flex gap-2">
                <span className="text-brand-400 font-mono font-bold">1.</span>
                <span>
                  Add{" "}
                  <code className="bg-surface-700 px-1.5 py-0.5 rounded text-xs text-white/80">
                    ANTHROPIC_API_KEY=sk-ant-...
                  </code>{" "}
                  to your <code className="text-white/70">.env</code> file
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-400 font-mono font-bold">2.</span>
                <span>
                  Run{" "}
                  <code className="bg-surface-700 px-1.5 py-0.5 rounded text-xs text-white/80">
                    docker compose up -d
                  </code>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-400 font-mono font-bold">3.</span>
                <span>
                  Point Claude at{" "}
                  <code className="bg-surface-700 px-1.5 py-0.5 rounded text-xs text-white/80">
                    http://localhost:4000
                  </code>{" "}
                  as your API base URL
                </span>
              </li>
            </ol>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-700 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/20">
          <span>ClaudePacer — AGPL-3.0 · Self-hosted</span>
          <div className="flex items-center gap-4">
            <span>🏢 Business/team multi-seat version coming soon</span>
            <a
              href="https://github.com/anthropics/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/50 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
