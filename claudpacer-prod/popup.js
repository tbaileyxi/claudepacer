/**
 * ClaudePacer — Popup JS
 * Full dashboard: speedometer, gas gauge, memory tools, referral.
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// SVG helpers
// ─────────────────────────────────────────────────────────────────────────────

function polarXY(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcD(cx, cy, r, a1, a2) {
  const s = polarXY(cx, cy, r, a1);
  const e = polarXY(cx, cy, r, a2);
  const sweep = ((a2 - a1) + 360) % 360;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

// ─────────────────────────────────────────────────────────────────────────────
// Speedometer  (cx=110, cy=120, r=80, sweep 270° from 135°)
// ─────────────────────────────────────────────────────────────────────────────

const S = { cx: 110, cy: 120, r: 80, start: 135, sweep: 270, max: 3000 };

function initSpeedometerTicks() {
  const g = document.getElementById("s-ticks");
  for (let i = 0; i <= 9; i++) {
    const ang = S.start + (i / 9) * S.sweep;
    const inner = polarXY(S.cx, S.cy, S.r - 14, ang);
    const outer = polarXY(S.cx, S.cy, S.r + 4,  ang);
    const line  = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", inner.x); line.setAttribute("y1", inner.y);
    line.setAttribute("x2", outer.x); line.setAttribute("y2", outer.y);
    line.setAttribute("stroke-width", i % 3 === 0 ? "2" : "1");
    line.setAttribute("stroke", i % 3 === 0 ? "#3A3A5A" : "#232335");
    g.appendChild(line);
  }
  // Zone labels: 0, 1k, 2k, 3k
  [0, 1, 2, 3].forEach((v, i) => {
    const ang = S.start + (i / 3) * S.sweep;
    const pos = polarXY(S.cx, S.cy, S.r + 18, ang);
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", pos.x); txt.setAttribute("y", pos.y);
    txt.setAttribute("text-anchor", "middle"); txt.setAttribute("dominant-baseline", "central");
    txt.setAttribute("fill", "#3A3A5A"); txt.setAttribute("font-size", "9");
    txt.setAttribute("font-family", "Inter,sans-serif");
    txt.textContent = v === 0 ? "0" : v + "k";
    document.getElementById("s-ticks").appendChild(txt);
  });
}

function drawSpeedometer(tokPerMin) {
  const pct = clamp(tokPerMin / S.max, 0, 1);
  const endAng = S.start + pct * S.sweep;
  const color = pct < 0.33 ? "#22C55E" : pct < 0.66 ? "#F59E0B" : "#EF4444";

  // Track
  document.getElementById("s-track").setAttribute(
    "d", arcD(S.cx, S.cy, S.r, S.start, S.start + S.sweep)
  );
  // Zones
  document.getElementById("s-z-green").setAttribute("d",
    arcD(S.cx, S.cy, S.r, S.start, S.start + S.sweep * 0.33));
  document.getElementById("s-z-amber").setAttribute("d",
    arcD(S.cx, S.cy, S.r, S.start + S.sweep * 0.33, S.start + S.sweep * 0.66));
  document.getElementById("s-z-red").setAttribute("d",
    arcD(S.cx, S.cy, S.r, S.start + S.sweep * 0.66, S.start + S.sweep));
  // Active fill
  const fill = document.getElementById("s-fill");
  if (pct > 0.005) {
    fill.setAttribute("d", arcD(S.cx, S.cy, S.r, S.start, endAng));
    fill.setAttribute("stroke", color);
  } else {
    fill.setAttribute("d", "");
  }

  // Needle
  const tip  = polarXY(S.cx, S.cy, 66, endAng);
  const lft  = polarXY(S.cx, S.cy, 7,  endAng - 90);
  const rgt  = polarXY(S.cx, S.cy, 7,  endAng + 90);
  const n = document.getElementById("s-needle");
  n.setAttribute("points", `${tip.x},${tip.y} ${lft.x},${lft.y} ${rgt.x},${rgt.y}`);
  n.setAttribute("fill", color);
  n.setAttribute("opacity", "0.95");

  // Pivot
  const ring = document.getElementById("s-pivot-ring");
  ring.setAttribute("stroke", color); ring.setAttribute("stroke-width", "2.5");
  document.getElementById("s-pivot-dot").setAttribute("fill", color);

  // Value label
  const v = document.getElementById("s-val");
  v.textContent = tokPerMin >= 1000
    ? (tokPerMin / 1000).toFixed(1) + "k"
    : Math.round(tokPerMin).toString();
  v.setAttribute("fill", color);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gas gauge  (cx=80, cy=80, r=60, 270° sweep, rotation 135°)
// ─────────────────────────────────────────────────────────────────────────────

function drawGasGauge(pct, weeklyTokens, weeklyLimit) {
  const circ   = 2 * Math.PI * 60;
  const arcLen = circ * (270 / 360);
  const fill   = arcLen * clamp(pct, 0, 1);
  const rot    = 135;
  const color  = pct < 0.5 ? "#22C55E" : pct < 0.8 ? "#F59E0B" : "#EF4444";

  const track = document.getElementById("g-track");
  track.setAttribute("stroke-dasharray", `${arcLen} ${circ}`);
  track.setAttribute("transform", `rotate(${rot} 80 80)`);

  const bg = document.getElementById("g-bg");
  bg.setAttribute("stroke", color);
  bg.setAttribute("stroke-dasharray", `${arcLen} ${circ}`);
  bg.setAttribute("transform", `rotate(${rot} 80 80)`);

  const gf = document.getElementById("g-fill");
  gf.setAttribute("stroke", color);
  gf.setAttribute("stroke-dasharray", `${fill} ${circ}`);
  gf.setAttribute("transform", `rotate(${rot} 80 80)`);

  const pctEl = document.getElementById("g-pct");
  pctEl.textContent = Math.round(pct * 100) + "%";
  pctEl.setAttribute("fill", pct > 0.8 ? color : "white");

  // Tokens label
  document.getElementById("g-tokens").textContent =
    fmtTok(weeklyTokens) + " / " + fmtTok(weeklyLimit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function fmtTok(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function fmtDays(days) {
  if (!isFinite(days) || days > 180) return "∞ runway";
  if (days < 1 / 24) return "< 1 hour left ⚠";
  if (days < 1)      return Math.round(days * 24) + " hours left";
  return "~" + days.toFixed(1) + " days left";
}

function fmtDaysUntil(days) {
  if (days < 1) return Math.round(days * 24) + "h";
  return Math.round(days) + "d";
}

function speedLabel(r) {
  if (r < 50)   return "Idle";
  if (r < 200)  return "Slow";
  if (r < 600)  return "Cruising";
  if (r < 1500) return "Fast";
  if (r < 3000) return "Speeding";
  return "Floored 🔥";
}
function speedColor(r) {
  if (r < 600)  return "#22C55E";
  if (r < 1500) return "#F59E0B";
  return "#EF4444";
}

function urgencyText(p) {
  if (p >= 0.95) return "⚠ Almost empty!";
  if (p >= 0.8)  return "Running low";
  if (p >= 0.6)  return "Use wisely";
  if (p >= 0.3)  return "Plenty left";
  return "Tank is full 🟢";
}
function urgencyStyle(p) {
  const c = p >= 0.8 ? "#EF4444" : p >= 0.6 ? "#F59E0B" : "#22C55E";
  return `color:${c}; background:${c}18; border:1px solid ${c}28; border-radius:20px; padding:2px 9px;`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────

function render(stats) {
  document.getElementById("no-data").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");

  const rate = stats.burnRatePerMin || 0;
  const pct  = stats.pctUsed || 0;

  // ── Speedometer
  drawSpeedometer(rate);
  const sl = document.getElementById("s-label");
  sl.textContent = speedLabel(rate);
  sl.style.color = speedColor(rate);

  const ac = document.getElementById("s-accel");
  if (stats.acceleration === "up")   { ac.textContent = "↑"; ac.style.color = "#22C55E"; }
  else if (stats.acceleration === "down") { ac.textContent = "↓"; ac.style.color = "#EF4444"; }
  else                                { ac.textContent = "→"; ac.style.color = "#6B6B90"; }

  const mx = document.getElementById("s-mult");
  mx.textContent = stats.multiplierVsAvg > 0
    ? stats.multiplierVsAvg.toFixed(1) + "× avg" : "—";

  // ── Gas gauge
  drawGasGauge(pct, stats.weeklyTokens || 0, stats.weeklyLimit || 1_000_000);

  const daysEl = document.getElementById("g-days");
  daysEl.textContent = fmtDays(stats.projectedDaysRemaining);
  const dc = pct >= 0.8 ? "#EF4444" : pct >= 0.6 ? "#F59E0B" : "#22C55E";
  daysEl.style.color = dc;

  const urg = document.getElementById("g-urgency");
  urg.textContent = urgencyText(pct);
  urg.style.cssText = urgencyStyle(pct);

  // ── Stats bar
  document.getElementById("st-session").textContent = fmtTok(stats.sessionTokens || 0);
  document.getElementById("st-week").textContent    = fmtTok(stats.weeklyTokens  || 0);
  document.getElementById("st-msgs").textContent    = (stats.weeklyMessages || 0).toString();
  document.getElementById("st-reset").textContent   =
    isFinite(stats.daysUntilReset) ? fmtDaysUntil(stats.daysUntilReset) : "—";

  // ── Live dot
  const lastMs = stats.lastActivityAt ? Date.now() - stats.lastActivityAt : Infinity;
  if (lastMs < 5 * 60 * 1000) {
    document.getElementById("live-dot").classList.add("active");
  }

  // ── Tier
  if (stats.isPaid) {
    document.getElementById("tier-badge").textContent = "✦ Pro";
    document.getElementById("tier-badge").className   = "badge pro";
    document.getElementById("mem-badge").textContent  = "✦ Pro";
    document.getElementById("mem-badge").className    = "mem-badge unlocked";
    document.getElementById("btn-memory").dataset.locked = "false";
    document.getElementById("btn-upgrade").classList.add("hidden");
  } else {
    document.getElementById("btn-upgrade").classList.remove("hidden");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory save result card
// ─────────────────────────────────────────────────────────────────────────────

function showSaveResult(result) {
  document.getElementById("save-tokens-saved").textContent =
    fmtTok(result.tokensSaved) + " tokens saved";
  document.getElementById("save-pct-saved").textContent =
    result.pctSaved + "% smaller context";
  document.getElementById("save-before").textContent = fmtTok(result.tokensBefore);
  document.getElementById("save-after").textContent  = fmtTok(result.tokensAfter);
  document.getElementById("save-result").classList.remove("hidden");
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────

let _toastTimer;
function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral
// ─────────────────────────────────────────────────────────────────────────────

function loadReferral() {
  chrome.storage.local.get("cp_ref", (r) => {
    let code = r.cp_ref;
    if (!code) {
      code = Math.random().toString(36).slice(2, 10).toUpperCase();
      chrome.storage.local.set({ cp_ref: code });
    }
    document.getElementById("ref-url").value =
      `https://claudepacer.com/?ref=${code}`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  initSpeedometerTicks();

  // Load stats
  chrome.runtime.sendMessage({ type: "GET_STATS" }, (stats) => {
    if (chrome.runtime.lastError || !stats) {
      // Background worker not ready yet — show no-data
      return;
    }
    const hasData = (stats.weeklyTokens || 0) + (stats.sessionTokens || 0) > 0;
    if (hasData) {
      render(stats);
    }
    // If no data: no-data screen stays visible
  });

  loadReferral();

  // ── Buttons ──────────────────────────────────────────────────────────────

  document.getElementById("btn-memory").addEventListener("click", async () => {
    if (document.getElementById("btn-memory").dataset.locked === "true") {
      document.getElementById("btn-upgrade").scrollIntoView({ behavior: "smooth" });
      return;
    }
    // Delegate to background/sidepanel logic: this popup is a lightweight launcher.
    toast("🧠 Opening ClaudePacer…");
    chrome.tabs.create({ url: "https://claude.ai/new" });
  });

  document.getElementById("btn-upgrade").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://claudepacer.com/upgrade" });
  });

  document.getElementById("btn-copy").addEventListener("click", async () => {
    const url = document.getElementById("ref-url").value;
    try { await navigator.clipboard.writeText(url); }
    catch { document.getElementById("ref-url").select(); document.execCommand("copy"); }
    const btn = document.getElementById("btn-copy");
    btn.textContent = "✓ Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
  });

  document.getElementById("btn-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("btn-openside").addEventListener("click", () => {
    // Open side panel if supported
    if (chrome.sidePanel) {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.sidePanel.open({ tabId: tab.id });
      });
    } else {
      toast("Side panel requires Chrome 116+", "err");
    }
  });

  // Reset-week removed (too destructive / confusing).
}

document.addEventListener("DOMContentLoaded", init);
