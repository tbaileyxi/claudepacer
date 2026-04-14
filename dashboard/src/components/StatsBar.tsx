"use client";

import { formatTokens, formatCost, formatDuration } from "@/lib/utils";

interface StatsBarProps {
  tokensThisSession: number;
  sessionStartedAt: Date | null;
  costThisWeek: number;
  costThisMonth: number;
  isLive: boolean;
  lastUpdatedAt: Date;
}

export default function StatsBar({
  tokensThisSession,
  sessionStartedAt,
  costThisWeek,
  costThisMonth,
  isLive,
  lastUpdatedAt,
}: StatsBarProps) {
  const sessionDurationMin = sessionStartedAt
    ? (Date.now() - sessionStartedAt.getTime()) / 60_000
    : 0;

  const stats = [
    {
      label: "This Session",
      value: formatTokens(tokensThisSession),
      sub: sessionStartedAt
        ? formatDuration(sessionDurationMin) + " ago"
        : "No activity",
      icon: "⚡",
    },
    {
      label: "This Week",
      value: formatCost(costThisWeek),
      sub: formatTokens(
        Math.round((costThisWeek / 5) * 1_000_000)
      ) + " tokens",
      icon: "📅",
    },
    {
      label: "This Month",
      value: formatCost(costThisMonth),
      sub: "estimated spend",
      icon: "📊",
    },
  ];

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="card px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm">{stat.icon}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
            <p className="stat-value text-xl">{stat.value}</p>
            <p className="text-xs text-white/30 mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Connection status */}
      <div className="flex items-center justify-end gap-2 mt-2">
        <span
          className={`w-2 h-2 rounded-full ${
            isLive ? "bg-gauge-green animate-pulse" : "bg-white/20"
          }`}
        />
        <span className="text-xs text-white/30">
          {isLive
            ? `Live · updated ${formatTime(lastUpdatedAt)}`
            : "Demo mode — connect LiteLLM for live data"}
        </span>
      </div>
    </div>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
