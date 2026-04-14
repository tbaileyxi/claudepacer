export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function formatCost(dollars: number): string {
  if (dollars < 0.01) return "<$0.01";
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

export function formatDaysRemaining(days: number): string {
  if (!isFinite(days) || days > 365) return "∞";
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days.toFixed(1)}d`;
}

/** Returns the week start (Monday 00:00:00 UTC) for a given date. */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Clamp a value between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Convert a burn rate (tokens/min) to a human-readable speed label. */
export function speedLabel(tokensPerMin: number): string {
  if (tokensPerMin < 50) return "Idle";
  if (tokensPerMin < 200) return "Slow";
  if (tokensPerMin < 600) return "Cruising";
  if (tokensPerMin < 1500) return "Fast";
  if (tokensPerMin < 3000) return "Speeding";
  return "Floored";
}

/** Return color class based on gauge percentage. */
export function gaugeColor(pct: number): string {
  if (pct < 0.5) return "#22C55E"; // green
  if (pct < 0.8) return "#F59E0B"; // amber
  return "#EF4444"; // red
}

/** Polar coords → SVG cartesian (0° = right, clockwise). */
export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Build an SVG arc path string for a gauge arc. */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const sweep = ((endAngle - startAngle + 360) % 360);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Token cost estimate in USD (rough Claude blended rate). */
export function estimateCost(tokens: number): number {
  // Blended input/output at ~$5/M tokens (rough Pro estimate)
  return (tokens / 1_000_000) * 5;
}
