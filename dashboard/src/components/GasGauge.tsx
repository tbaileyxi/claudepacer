"use client";

import { useMemo } from "react";
import { formatTokens, formatDaysRemaining, gaugeColor, clamp } from "@/lib/utils";

interface GasGaugeProps {
  tokensUsed: number;
  weeklyLimit: number;
  projectedDaysRemaining: number;
  costThisWeek: number;
}

const CX = 120;
const CY = 120;
const R = 90;
const CIRCUMFERENCE = 2 * Math.PI * R;

// Gauge sweep: same 270° as speedometer (for visual consistency)
// But we'll use a simpler stroke-dasharray circle approach here
const STROKE_WIDTH = 16;

export default function GasGauge({
  tokensUsed,
  weeklyLimit,
  projectedDaysRemaining,
  costThisWeek,
}: GasGaugeProps) {
  const pct = clamp(tokensUsed / weeklyLimit, 0, 1);
  const fillColor = gaugeColor(pct);
  const pctLabel = Math.round(pct * 100);

  // For the arc gauge: use a 270° sweep centered at bottom
  // We rotate the circle so the gap is at the bottom (7 o'clock to 5 o'clock)
  const arcLength = CIRCUMFERENCE * (270 / 360);
  const dashOffset = arcLength * (1 - pct);
  const rotation = 135; // degrees — rotates so gap is at the bottom

  const daysLabel = formatDaysRemaining(projectedDaysRemaining);

  const urgencyText = useMemo(() => {
    if (pct >= 0.95) return "Almost empty!";
    if (pct >= 0.80) return "Running low";
    if (pct >= 0.60) return "Use wisely";
    if (pct >= 0.40) return "Plenty left";
    return "Tank is full";
  }, [pct]);

  const urgencyColor = useMemo(() => {
    if (pct >= 0.80) return "#EF4444";
    if (pct >= 0.60) return "#F59E0B";
    return "#22C55E";
  }, [pct]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* SVG Gauge */}
      <div className="relative">
        <svg
          viewBox="0 0 240 200"
          className="w-full max-w-[260px]"
          aria-label={`Weekly budget: ${pctLabel}% used`}
        >
          <defs>
            <filter id="fill-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Track arc */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#1E1E30"
            strokeWidth={STROKE_WIDTH + 4}
            strokeDasharray={`${arcLength} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${CX} ${CY})`}
          />

          {/* Background zone arc */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={fillColor}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${arcLength} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${CX} ${CY})`}
            opacity={0.2}
          />

          {/* Fill arc (used amount) */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={fillColor}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${arcLength - dashOffset} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${CX} ${CY})`}
            opacity={0.9}
            filter="url(#fill-glow)"
            style={{ transition: "stroke-dasharray 1s ease-out, stroke 0.5s ease" }}
          />

          {/* Fuel pump icon (simplified SVG path) */}
          <text
            x={CX}
            y={CY - 26}
            textAnchor="middle"
            fontSize="22"
            fill={fillColor}
            opacity={0.8}
          >
            ⛽
          </text>

          {/* Percentage */}
          <text
            x={CX}
            y={CY + 8}
            textAnchor="middle"
            fill="white"
            fontSize="28"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
          >
            {pctLabel}%
          </text>
          <text
            x={CX}
            y={CY + 26}
            textAnchor="middle"
            fill="#6B6B90"
            fontSize="10"
            fontFamily="Inter, sans-serif"
          >
            used this week
          </text>

          {/* Days remaining label at bottom */}
          <text
            x={CX}
            y={185}
            textAnchor="middle"
            fill={urgencyColor}
            fontSize="13"
            fontWeight="600"
            fontFamily="Inter, sans-serif"
          >
            {isFinite(projectedDaysRemaining) && projectedDaysRemaining > 0
              ? `~${daysLabel} left at this pace`
              : pct >= 1
              ? "Budget exhausted"
              : "Idle — unlimited runway"}
          </text>
        </svg>
      </div>

      {/* Detail row */}
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className="bg-surface-700 rounded-xl px-3 py-2.5">
          <p className="stat-label mb-1">Used</p>
          <p className="text-base font-bold text-white tabular-nums">
            {formatTokens(tokensUsed)}
          </p>
          <p className="text-xs text-white/30 mt-0.5">tokens</p>
        </div>
        <div className="bg-surface-700 rounded-xl px-3 py-2.5">
          <p className="stat-label mb-1">Budget</p>
          <p className="text-base font-bold text-white tabular-nums">
            {formatTokens(weeklyLimit)}
          </p>
          <p className="text-xs text-white/30 mt-0.5">per week</p>
        </div>
      </div>

      {/* Urgency badge */}
      <div
        className="text-sm font-semibold px-4 py-1.5 rounded-full border"
        style={{
          color: urgencyColor,
          borderColor: urgencyColor + "40",
          backgroundColor: urgencyColor + "15",
        }}
      >
        {urgencyText}
      </div>
    </div>
  );
}
