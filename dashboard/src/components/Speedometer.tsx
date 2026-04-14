"use client";

import { useMemo } from "react";
import { arcPath, polarToCartesian, clamp, speedLabel } from "@/lib/utils";

interface SpeedometerProps {
  tokensPerMin: number;       // current burn rate
  maxTokensPerMin?: number;   // top of the dial (default 3000)
  acceleration: "up" | "down" | "steady";
  multiplierVsAvg: number;
}

// SVG layout constants
const CX = 200;
const CY = 200;
const TRACK_R = 155;
const FILL_R = 155;
const TRACK_WIDTH = 22;
const NEEDLE_LENGTH = 130;
const NEEDLE_BASE = 8;

// Gauge sweep: 135° (bottom-left) → 45° (bottom-right), clockwise = 270°
const START_ANGLE = 135;
const TOTAL_SWEEP = 270;

// Color zone thresholds (% of max)
const ZONES = [
  { from: 0,    to: 0.33, color: "#22C55E", label: "green"  },
  { from: 0.33, to: 0.66, color: "#F59E0B", label: "amber"  },
  { from: 0.66, to: 1.0,  color: "#EF4444", label: "red"    },
];

// Tick mark positions (every 30° = 10 ticks)
const TICK_ANGLES = Array.from({ length: 10 }, (_, i) =>
  START_ANGLE + (i / 9) * TOTAL_SWEEP
);

function valueToAngle(pct: number): number {
  return START_ANGLE + clamp(pct, 0, 1) * TOTAL_SWEEP;
}

export default function Speedometer({
  tokensPerMin,
  maxTokensPerMin = 3000,
  acceleration,
  multiplierVsAvg,
}: SpeedometerProps) {
  const pct = clamp(tokensPerMin / maxTokensPerMin, 0, 1);
  const needleAngle = valueToAngle(pct);
  const label = speedLabel(tokensPerMin);

  // Needle tip coordinates
  const needleTip = polarToCartesian(CX, CY, NEEDLE_LENGTH, needleAngle);
  const needleLeft = polarToCartesian(
    CX, CY, NEEDLE_BASE, needleAngle - 90
  );
  const needleRight = polarToCartesian(
    CX, CY, NEEDLE_BASE, needleAngle + 90
  );

  // Active needle color
  const needleColor = useMemo(() => {
    if (pct < 0.33) return "#22C55E";
    if (pct < 0.66) return "#F59E0B";
    return "#EF4444";
  }, [pct]);

  // Glow intensity based on speed
  const glowOpacity = 0.3 + pct * 0.5;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* SVG Gauge */}
      <div className="relative">
        <svg
          viewBox="0 0 400 260"
          className="w-full max-w-[380px]"
          aria-label={`Burn rate: ${Math.round(tokensPerMin)} tokens per minute`}
        >
          {/* Glow filter */}
          <defs>
            <filter id="needle-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="track-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="center-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22223B" />
              <stop offset="100%" stopColor="#13131E" />
            </radialGradient>
          </defs>

          {/* Dark track background */}
          <path
            d={arcPath(CX, CY, TRACK_R, START_ANGLE, START_ANGLE + TOTAL_SWEEP)}
            fill="none"
            stroke="#1E1E30"
            strokeWidth={TRACK_WIDTH + 4}
            strokeLinecap="round"
          />

          {/* Color zone arcs */}
          {ZONES.map((zone) => {
            const zoneStart = START_ANGLE + zone.from * TOTAL_SWEEP;
            const zoneEnd = START_ANGLE + zone.to * TOTAL_SWEEP;
            return (
              <path
                key={zone.label}
                d={arcPath(CX, CY, FILL_R, zoneStart, zoneEnd)}
                fill="none"
                stroke={zone.color}
                strokeWidth={TRACK_WIDTH}
                strokeLinecap="butt"
                opacity={0.25}
              />
            );
          })}

          {/* Active fill arc (up to current value) */}
          {pct > 0.005 && (
            <path
              d={arcPath(CX, CY, FILL_R, START_ANGLE, needleAngle)}
              fill="none"
              stroke={needleColor}
              strokeWidth={TRACK_WIDTH}
              strokeLinecap="round"
              opacity={0.9}
              filter="url(#track-glow)"
            />
          )}

          {/* Tick marks */}
          {TICK_ANGLES.map((angle, i) => {
            const inner = polarToCartesian(CX, CY, TRACK_R - 18, angle);
            const outer = polarToCartesian(CX, CY, TRACK_R + 6, angle);
            const isMajor = i % 3 === 0;
            return (
              <line
                key={i}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={isMajor ? "#4A4A70" : "#2D2D4A"}
                strokeWidth={isMajor ? 2 : 1}
              />
            );
          })}

          {/* Tick labels (0, 1k, 2k, 3k) */}
          {[0, 1, 2, 3].map((val) => {
            const tickPct = val / (maxTokensPerMin / 1000);
            const angle = START_ANGLE + clamp(tickPct / 3, 0, 1) * TOTAL_SWEEP;
            const pos = polarToCartesian(CX, CY, TRACK_R + 22, angle);
            return (
              <text
                key={val}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#4A4A70"
                fontSize="11"
                fontFamily="Inter, sans-serif"
              >
                {val === 0 ? "0" : `${val}k`}
              </text>
            );
          })}

          {/* Needle */}
          <polygon
            points={`${needleTip.x},${needleTip.y} ${needleLeft.x},${needleLeft.y} ${needleRight.x},${needleRight.y}`}
            fill={needleColor}
            opacity={glowOpacity + 0.3}
            filter="url(#needle-glow)"
            className="gauge-needle"
            style={{
              transformOrigin: `${CX}px ${CY}px`,
            }}
          />

          {/* Pivot cap */}
          <circle
            cx={CX}
            cy={CY}
            r={14}
            fill="url(#center-grad)"
            stroke={needleColor}
            strokeWidth={2}
          />
          <circle cx={CX} cy={CY} r={5} fill={needleColor} />

          {/* Speed number */}
          <text
            x={CX}
            y={CY + 42}
            textAnchor="middle"
            fill="white"
            fontSize="32"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
            className="tabular-nums"
          >
            {Math.round(tokensPerMin).toLocaleString()}
          </text>
          <text
            x={CX}
            y={CY + 60}
            textAnchor="middle"
            fill="#6B6B90"
            fontSize="11"
            fontFamily="Inter, sans-serif"
          >
            tokens / min
          </text>
        </svg>
      </div>

      {/* Below-dial stats row */}
      <div className="flex items-center gap-6 px-4">
        {/* Speed label */}
        <div className="flex flex-col items-center">
          <span
            className="text-lg font-bold"
            style={{ color: needleColor }}
          >
            {label}
          </span>
          <span className="text-xs text-white/40 mt-0.5">pace</span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Acceleration */}
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-white flex items-center gap-1">
            {acceleration === "up" && (
              <span className="text-gauge-green">↑</span>
            )}
            {acceleration === "down" && (
              <span className="text-gauge-red">↓</span>
            )}
            {acceleration === "steady" && (
              <span className="text-white/40">→</span>
            )}
            {acceleration !== "steady"
              ? acceleration === "up"
                ? "Accelerating"
                : "Slowing"
              : "Steady"}
          </span>
          <span className="text-xs text-white/40 mt-0.5">trend</span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Multiplier vs avg */}
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-white">
            {isFinite(multiplierVsAvg) && multiplierVsAvg > 0
              ? `${multiplierVsAvg.toFixed(1)}×`
              : "—"}
          </span>
          <span className="text-xs text-white/40 mt-0.5">vs avg</span>
        </div>
      </div>
    </div>
  );
}
