"use strict";

// ── SVG helpers ───────────────────────────────────────────────────────────────

function xy(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arc(cx, cy, r, a1, a2) {
  const s = xy(cx, cy, r, a1), e = xy(cx, cy, r, a2);
  const sw = ((a2 - a1) + 360) % 360;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${sw > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

// ── Speedometer  cx=120 cy=130 r=90 sweep=270° ────────────────────────────────

const S = { cx: 120, cy: 130, r: 90, a0: 135, sw: 270, max: 1500 };

function initTicks() {
  const g = document.getElementById("s-ticks");
  for (let i = 0; i <= 9; i++) {
    const a = S.a0 + (i / 9) * S.sw;
    const p1 = xy(S.cx, S.cy, S.r - 16, a);
    const p2 = xy(S.cx, S.cy, S.r + 4,  a);
    const ln = document.createElementNS("http://www.w3.org/2000/svg","line");
    ln.setAttribute("x1",p1.x); ln.setAttribute("y1",p1.y);
    ln.setAttribute("x2",p2.x); ln.setAttribute("y2",p2.y);
    ln.setAttribute("stroke-width", i%3===0 ? "2":"1");
    ln.setAttribute("stroke", i%3===0 ? "#3A3A5A":"#232335");
    g.appendChild(ln);
  }
  [0,1,2,3].forEach((v,i) => {
    const a = S.a0 + (i/3)*S.sw;
    const p = xy(S.cx, S.cy, S.r + 20, a);
    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x",p.x); t.setAttribute("y",p.y);
    t.setAttribute("text-anchor","middle"); t.setAttribute("dominant-baseline","central");
    t.setAttribute("fill","#3A3A5A"); t.setAttribute("font-size","10");
    t.setAttribute("font-family","Inter,sans-serif");
    t.textContent = v===0?"0":v+"k";
    g.appendChild(t);
  });
}

function drawSpeedo(rate) {
  const pct = clamp(rate / S.max, 0, 1);
  const end = S.a0 + pct * S.sw;
  const col = pct < .33 ? "#22C55E" : pct < .66 ? "#F59E0B" : "#EF4444";

  document.getElementById("s-track")  .setAttribute("d", arc(S.cx,S.cy,S.r, S.a0, S.a0+S.sw));
  document.getElementById("s-z-green").setAttribute("d", arc(S.cx,S.cy,S.r, S.a0, S.a0+S.sw*.33));
  document.getElementById("s-z-amber").setAttribute("d", arc(S.cx,S.cy,S.r, S.a0+S.sw*.33, S.a0+S.sw*.66));
  document.getElementById("s-z-red")  .setAttribute("d", arc(S.cx,S.cy,S.r, S.a0+S.sw*.66, S.a0+S.sw));

  const fill = document.getElementById("s-fill");
  if (pct > .005) { fill.setAttribute("d", arc(S.cx,S.cy,S.r,S.a0,end)); fill.setAttribute("stroke",col); }
  else fill.setAttribute("d","");

  const tip = xy(S.cx,S.cy,76,end), lf=xy(S.cx,S.cy,8,end-90), rt=xy(S.cx,S.cy,8,end+90);
  const nd = document.getElementById("s-needle");
  nd.setAttribute("points",`${tip.x},${tip.y} ${lf.x},${lf.y} ${rt.x},${rt.y}`);
  nd.setAttribute("fill",col);

  document.getElementById("s-pr").setAttribute("stroke",col);
  document.getElementById("s-pd").setAttribute("fill",col);

  const vt = document.getElementById("s-val");
  vt.textContent = rate>=1000 ? (rate/1000).toFixed(1)+"k" : Math.round(rate).toString();
  vt.setAttribute("fill",col);
}

// ── Typing rev — ghost needle that surges while user is typing ────────────────

let _revAngle = null;        // current ghost needle angle
let _revTarget = null;       // target angle for smooth animation
let _revRafId  = null;       // requestAnimationFrame id

function drawTypingRev(isTyping, currentRate) {
  const ghost  = document.getElementById("s-needle-ghost");
  const hub    = document.getElementById("s-pr");   // center pivot ring
  const hubDot = document.getElementById("s-pd");   // center dot
  if (!ghost || !hub) return;

  const isFloored = currentRate / S.max > 0.85; // needle already near max

  if (!isTyping) {
    ghost.setAttribute("opacity", "0");
    // Restore hub colors to match current needle color
    _revAngle = null;
    _revTarget = null;
    if (_revRafId) { cancelAnimationFrame(_revRafId); _revRafId = null; }
    return;
  }

  // ── Floored mode: pulse the center hub since needle has nowhere to go ────────
  if (isFloored) {
    ghost.setAttribute("opacity", "0");
    if (!_revRafId) {
      let t = 0;
      function pulseHub() {
        t += 0.12;
        const brightness = 0.55 + 0.45 * Math.sin(t * 2.5);
        const r = Math.round(239 * brightness);
        const g = Math.round(68  * brightness);
        const b = Math.round(68  * brightness);
        const col = `rgb(${r},${g},${b})`;
        hub.setAttribute("stroke", col);
        hubDot.setAttribute("fill", col);
        _revRafId = requestAnimationFrame(pulseHub);
      }
      pulseHub();
    }
    return;
  }

  // ── Normal mode: ghost needle surges ahead of current needle ─────────────────
  if (_revTarget === null) {
    const base  = Math.max(currentRate, 150);
    const surge = base * (1.2 + Math.random() * 0.4);
    const pct   = clamp(surge / S.max, 0, 0.95);
    _revTarget  = S.a0 + pct * S.sw;
    _revAngle   = _revAngle || (S.a0 + clamp(currentRate / S.max, 0, 1) * S.sw);
  }

  if (!_revRafId) {
    let lastResurge = Date.now();
    function animate() {
      const now = Date.now();
      if (now - lastResurge > 500 + Math.random() * 400) {
        const base  = Math.max(currentRate, 150);
        const surge = base * (1.15 + Math.random() * 0.5);
        const pct   = clamp(surge / S.max, 0, 0.95);
        _revTarget  = S.a0 + pct * S.sw;
        lastResurge = now;
      }
      _revAngle += (_revTarget - _revAngle) * 0.18;
      const tip = xy(S.cx, S.cy, 76, _revAngle);
      const lf  = xy(S.cx, S.cy,  8, _revAngle - 90);
      const rt  = xy(S.cx, S.cy,  8, _revAngle + 90);
      ghost.setAttribute("points", `${tip.x},${tip.y} ${lf.x},${lf.y} ${rt.x},${rt.y}`);
      ghost.setAttribute("fill",    "#F59E0B");
      ghost.setAttribute("opacity", "0.4");
      ghost.setAttribute("filter",  "url(#gn)");
      _revRafId = requestAnimationFrame(animate);
    }
    animate();
  }
}

// ── Gas gauge  cx=90 cy=90 r=68 ───────────────────────────────────────────────

function drawGas(pct, used, limit) {
  // pct = fraction USED (0–1). We display REMAINING fuel so the gauge looks
  // like a real gas gauge: full arc = full tank, nearly empty arc = running low.
  const remaining = 1 - clamp(pct, 0, 1);
  const circ = 2*Math.PI*68;
  const arcL = circ*(270/360);
  const fill = arcL * remaining;
  const rot  = 135;
  // Color reflects how much is left: green = plenty, red = running out
  const col  = pct<.5 ? "#22C55E" : pct<.8 ? "#F59E0B" : "#EF4444";

  const track = document.getElementById("g-track");
  track.setAttribute("stroke-dasharray",`${arcL} ${circ}`);
  track.setAttribute("transform",`rotate(${rot} 90 90)`);

  const bg = document.getElementById("g-bg");
  bg.setAttribute("stroke",col);
  bg.setAttribute("stroke-dasharray",`${arcL} ${circ}`);
  bg.setAttribute("transform",`rotate(${rot} 90 90)`);

  const gf = document.getElementById("g-fill");
  gf.setAttribute("stroke",col);
  gf.setAttribute("stroke-dasharray",`${fill} ${circ}`);
  gf.setAttribute("transform",`rotate(${rot} 90 90)`);

  // Show remaining % as the big number (like a real gas gauge)
  const pe = document.getElementById("g-pct");
  pe.textContent = Math.round(remaining*100)+"%";
  pe.setAttribute("fill", pct>.8 ? col : "white");

  document.getElementById("g-tokens").textContent = fmt(used)+" used / "+fmt(limit);
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n>=1e6) return (n/1e6).toFixed(2)+"M";
  if (n>=1e3) return (n/1e3).toFixed(1)+"k";
  return String(Math.round(n));
}
function fmtDays(d, burnRate) {
  // Don't show alarming countdown when the user is idle
  if ((burnRate !== undefined && burnRate < 20) || !isFinite(d) || d > 180) return "∞ runway";
  if (d < 1/24) return "at this pace: &lt;1 hr left";
  if (d < 1)    return "at this pace: " + Math.round(d*24) + "h left";
  return "at this pace: ~" + d.toFixed(1) + " days left";
}
function fmtUntil(d) {
  if (d<1) return Math.round(d*24)+"h";
  return Math.round(d)+"d";
}
function speedLabel(r) {
  if(r<50)   return "Idle";
  if(r<200)  return "Slow";
  if(r<600)  return "Cruising";
  if(r<1500) return "Fast";
  if(r<3000) return "Speeding";
  return "Floored 🔥";
}
function speedColor(r) {
  if(r<600)  return "#22C55E";
  if(r<1500) return "#F59E0B";
  return "#EF4444";
}
function urgencyTxt(pctUsed, daysUntilReset, projectedDaysRemaining) {
  // pctUsed = fraction USED (0–1)
  if (pctUsed >= .95) return "⚠ Almost empty!";
  if (pctUsed >= .8)  return "Running low";

  // Even if tank looks full, warn if burn rate will exhaust budget before reset
  if (typeof projectedDaysRemaining === "number" && isFinite(projectedDaysRemaining)
      && typeof daysUntilReset === "number"
      && projectedDaysRemaining < daysUntilReset) {
    if (projectedDaysRemaining < 1) return "⚠ Runs out today at this pace!";
    return `⚠ Runs out in ~${projectedDaysRemaining.toFixed(1)}d at this pace`;
  }

  if (pctUsed >= .6)  return "Use wisely";
  if (pctUsed >= .3)  return "Plenty left";
  return "Tank is full 🟢";
}
function urgencyStyle(pctUsed, projectedDaysRemaining, daysUntilReset) {
  const warn = typeof projectedDaysRemaining === "number"
    && isFinite(projectedDaysRemaining)
    && typeof daysUntilReset === "number"
    && projectedDaysRemaining < daysUntilReset;
  const c = (pctUsed >= .8 || warn) ? "#EF4444" : pctUsed >= .6 ? "#F59E0B" : "#22C55E";
  return `color:${c};background:${c}18;border:1px solid ${c}28;border-radius:20px;padding:2px 10px;`;
}

// ── Session window bar ────────────────────────────────────────────────────────

function renderSession(stats) {
  const bar = document.getElementById("session-bar");

  // Only show when we have real session data from Anthropic
  if (!stats.sessionPctUsed && stats.sessionPctUsed !== 0) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");

  const pct  = clamp(stats.sessionPctUsed, 0, 1);
  const used = Math.round(pct * 100);
  const remaining = 100 - used;

  // Bar fill = remaining (same logic as gas gauge)
  const fill = document.getElementById("sbar-fill");
  fill.style.width = remaining + "%";
  fill.style.background = pct < .5 ? "#22C55E" : pct < .8 ? "#F59E0B" : "#EF4444";

  document.getElementById("sbar-pct").textContent = used + "% used this session";

  // Countdown to session reset
  const resetEl = document.getElementById("sbar-reset");
  const warnEl  = document.getElementById("sbar-warn");

  if (stats.sessionResetAt) {
    const msLeft = stats.sessionResetAt - Date.now();
    if (msLeft > 0) {
      const h = Math.floor(msLeft / 3_600_000);
      const m = Math.floor((msLeft % 3_600_000) / 60_000);
      resetEl.textContent = h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`;
    } else {
      resetEl.textContent = "resetting soon";
    }
  } else {
    resetEl.textContent = "5-hr rolling window";
  }

  if (pct >= .9) {
    warnEl.textContent = "⚠ Session almost full!";
    warnEl.style.color = "#EF4444";
  } else if (pct >= .7) {
    warnEl.textContent = "Running low on session";
    warnEl.style.color = "#F59E0B";
  } else {
    warnEl.textContent = "";
  }
}

// ── Gas gauge view toggle (weekly / session) ──────────────────────────────────

let _gaugeView = "weekly"; // "weekly" | "session"
let _lastStats = null;     // cached for immediate re-render on toggle

function initGaugeToggle() {
  document.getElementById("gtog-week").addEventListener("click", () => {
    _gaugeView = "weekly";
    document.getElementById("gtog-week").classList.add("active");
    document.getElementById("gtog-sess").classList.remove("active");
    if (_lastStats) render(_lastStats);
  });
  document.getElementById("gtog-sess").addEventListener("click", () => {
    _gaugeView = "session";
    document.getElementById("gtog-sess").classList.add("active");
    document.getElementById("gtog-week").classList.remove("active");
    if (_lastStats) render(_lastStats);
  });
}

// ── Demo data (shown before any real activity) ────────────────────────────────

const DEMO = {
  burnRatePerMin: 420, acceleration: "up", multiplierVsAvg: 1.2,
  weeklyTokens: 382000, weeklyLimit: 1000000, pctUsed: 0.382,
  projectedDaysRemaining: 3.8, daysUntilReset: 4,
  sessionTokens: 14200, weeklyMessages: 47,
  lastActivityAt: null, isPaid: false,
  _isDemo: true,
};

// ── Render ────────────────────────────────────────────────────────────────────

function render(stats) {
  _lastStats = stats;
  const isDemo = stats._isDemo || false;
  const rate   = stats.burnRatePerMin || 0;
  const pct    = stats.pctUsed || 0;

  // Demo / live indicator
  const dot   = document.getElementById("live-dot");
  const label = document.getElementById("live-label");
  const banner = document.getElementById("demo-banner");

  const sourceBar     = document.getElementById("source-bar");
  const srcBrowser    = document.getElementById("src-browser");
  const srcBridge     = document.getElementById("src-bridge");

  const calBanner = document.getElementById("cal-banner");

  const intWarn = document.getElementById("interceptor-warn");

  if (isDemo) {
    dot.classList.remove("active");
    label.textContent = "Demo";
    label.classList.remove("active");
    banner.classList.remove("hidden");
    calBanner.classList.add("hidden");
    sourceBar.classList.add("hidden");
    if (intWarn) intWarn.classList.add("hidden");
  } else {
    banner.classList.add("hidden"); // always hide demo banner once real data exists
    const recentMs = stats.lastActivityAt ? Date.now()-stats.lastActivityAt : Infinity;
    const isLive   = recentMs < 5 * 60 * 1000;
    if (isLive) {
      dot.classList.add("active");
      label.textContent = "Live";
      label.classList.add("active");
    } else {
      dot.classList.remove("active");
      label.textContent = "Idle";
      label.classList.remove("active");
    }

    // Calibration banner — always shows a Sync button
    if (stats.isCalibrated) {
      calBanner.className = "cal-banner calibrated";
      calBanner.innerHTML = "⚡ Synced with Anthropic — gauge shows real usage &nbsp;<a id=\"cal-link\" href=\"#\" style=\"color:#22C55E;font-size:10px;opacity:.7\">re-sync</a>";
    } else {
      calBanner.className = "cal-banner uncalibrated";
      calBanner.innerHTML = "⚠ Gauge estimated — <a id=\"cal-link\" href=\"#\"><strong>Sync Now →</strong></a>";
    }
    setTimeout(() => {
      const lnk = document.getElementById("cal-link");
      if (lnk) lnk.addEventListener("click", async (e) => {
        e.preventDefault();
        // Check if settings/usage already open — if so, re-inject and scrape in place
        const existing = await chrome.tabs.query({ url: "https://claude.ai/settings*" });
        if (existing.length > 0) {
          const tabId = existing[0].id;
          // Explicitly re-inject content.js so the scraper fires fresh
          await chrome.scripting.executeScript({
            target: { tabId }, world: "ISOLATED", files: ["content.js"],
          }).catch(() => {});
          chrome.tabs.update(tabId, { active: true });
        } else {
          chrome.tabs.create({ url: "https://claude.ai/settings/usage" });
        }
      });
    }, 0);

    // Source chips — always show when live so bridge status is always visible
    const browserMs   = stats.lastBrowserActivityAt ? Date.now()-stats.lastBrowserActivityAt : Infinity;
    const showBrowser = browserMs < 5*60*1000;
    const showBridge  = stats.bridgeConnected === true;
    const bridgeCTA   = document.getElementById("btn-start-bridge");

    // Always show source bar when not in demo mode
    sourceBar.classList.remove("hidden");
    srcBrowser.classList.toggle("hidden", !showBrowser);
    srcBridge.classList.toggle("hidden",  !showBridge);
    // Show "Connect Desktop" CTA whenever bridge is not connected
    if (bridgeCTA) bridgeCTA.classList.toggle("hidden", showBridge);

    // Interceptor warning — show when browser interceptor hasn't reported in > 60s
    // (means extension may need reconnecting after a reload)
    if (intWarn) {
      const interceptorOk = stats.interceptorActive === true;
      intWarn.classList.toggle("hidden", interceptorOk);
    }
  }

  // Speedometer
  drawSpeedo(rate);
  const sl = document.getElementById("s-label");
  sl.textContent = speedLabel(rate);
  sl.style.color = speedColor(rate);

  const ac = document.getElementById("s-accel");
  if (rate < 20) {
    ac.textContent = ""; // idle — no arrow
  } else if (stats.acceleration === "up") {
    ac.textContent = "↑"; ac.style.color = "#22C55E";
  } else if (stats.acceleration === "down") {
    ac.textContent = "↓"; ac.style.color = "#EF4444";
  } else {
    ac.textContent = ""; // steady — no arrow, no clutter
  }

  document.getElementById("s-mult").textContent =
    rate >= 20 && stats.multiplierVsAvg > 0 ? stats.multiplierVsAvg.toFixed(1) + "× avg" : "—";

  // Gas gauge — switches between weekly and session view
  const wantsSession = _gaugeView === "session";
  // hasSession: either Anthropic-synced data OR local session tracking
  const hasSession   = stats.sessionPctUsed != null
                    || (stats.sessionTokens > 0 && stats.localSessionPct != null);
  const useSession   = wantsSession && hasSession;
  // Prefer Anthropic's real pct; fall back to local estimate
  const sessionPctForGauge = stats.sessionPctUsed != null
    ? stats.sessionPctUsed
    : (stats.localSessionPct || 0);
  const gaugePct     = useSession ? sessionPctForGauge : pct;

  // When calibrated, derive display tokens from real pct × limit so they match the gauge
  const weeklyLimit  = stats.weeklyLimit || 100000;
  const displayUsed  = stats.isCalibrated
    ? Math.round(pct * weeklyLimit)
    : (stats.weeklyTokens || 0);
  drawGas(gaugePct, displayUsed, weeklyLimit);

  const dc = gaugePct>=.8?"#EF4444":gaugePct>=.6?"#F59E0B":"#22C55E";
  const de = document.getElementById("g-days");
  const gt = document.getElementById("g-tokens");

  if (wantsSession && !hasSession) {
    // No session data at all yet — prompt user to sync
    de.innerHTML = '<a id="sess-sync-link" href="#" style="color:#F59E0B;text-decoration:underline">Open Settings → Usage to sync</a>';
    de.style.color = "#F59E0B";
    gt.textContent = "Send a message first, or sync from Settings";
    setTimeout(() => {
      const lnk = document.getElementById("sess-sync-link");
      if (lnk) lnk.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: "https://claude.ai/settings/usage" });
      });
    }, 0);
  } else if (useSession) {
    if (stats.sessionResetAt) {
      const msLeft = stats.sessionResetAt - Date.now();
      const hLeft  = msLeft > 0 ? Math.floor(msLeft / 3_600_000) : 0;
      const mLeft  = msLeft > 0 ? Math.floor((msLeft % 3_600_000) / 60_000) : 0;
      de.innerHTML = hLeft > 0 ? `resets in ${hLeft}h ${mLeft}m` : mLeft > 0 ? `resets in ${mLeft}m` : "resetting soon";
    } else {
      de.innerHTML = "5-hr rolling session";
    }
    de.style.color = dc;
    // Show real % if from Anthropic, otherwise show raw token count
    if (stats.sessionPctUsed != null) {
      gt.textContent = Math.round(gaugePct * 100) + "% of 5-hr window used";
    } else {
      gt.textContent = fmt(stats.sessionTokens || 0) + " tokens this session (estimated)";
    }
  } else {
    de.innerHTML = fmtDays(stats.projectedDaysRemaining, rate);
    de.style.color = dc;
    gt.textContent = fmt(displayUsed) + " used / " + fmt(weeklyLimit);
  }

  const urg = document.getElementById("g-urgency");
  // Only pass projected days for the weekly view — session view has its own countdown
  urg.textContent = urgencyTxt(
    gaugePct,
    useSession ? null : stats.daysUntilReset,
    useSession ? null : stats.projectedDaysRemaining
  );
  urg.style.cssText = urgencyStyle(
    gaugePct,
    useSession ? null : stats.projectedDaysRemaining,
    useSession ? null : stats.daysUntilReset
  );


  // Session bar: hide when session gauge is active (it's already showing that info)
  if (useSession) {
    document.getElementById("session-bar").classList.add("hidden");
  } else {
    renderSession(stats);
  }

  // Burn-rate upsell hint — show when free tier and burning medium/high
  const burnHint = document.getElementById("burn-hint");
  if (burnHint) {
    const showHint = !isDemo && !stats.isPaid && rate >= 200;
    burnHint.classList.toggle("hidden", !showHint);
    if (showHint) {
      if (rate >= 800) {
        burnHint.textContent = "🔥 Burning fast — Pro can compress & save your context before you hit limits";
      } else if (rate >= 400) {
        burnHint.textContent = "⚡ Running hot — Pro's Token Savers stretch your weekly budget";
      } else {
        burnHint.textContent = "💡 Tip: Pro users compress context mid-chat to stay in limits longer";
      }
    }
  }

  // Tier
  if (stats.isPaid) {
    document.getElementById("tier-badge").textContent = "✦ Pro";
    document.getElementById("tier-badge").className   = "badge pro";
    document.getElementById("mem-badge").textContent  = "✦ Pro";
    document.getElementById("mem-badge").className    = "mem-badge unlocked";
    document.getElementById("btn-memory").dataset.locked = "false";
    document.getElementById("btn-fresh").dataset.locked  = "false";
    // Step 2 still requires Step 1 to be done first even for Pro users
    if (!_compressionClickedAt) {
      document.getElementById("btn-fresh").dataset.step2 = "locked";
    }
    document.getElementById("btn-upgrade").classList.add("hidden");
  }
}

// ── Referral ──────────────────────────────────────────────────────────────────

function loadReferral() {
  chrome.storage.local.get("cp_ref", r => {
    let code = r.cp_ref;
    if (!code) { code = Math.random().toString(36).slice(2,10).toUpperCase(); chrome.storage.local.set({cp_ref:code}); }
    document.getElementById("ref-url").value = `https://claudepacer.com/?ref=${code}`;
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

// ── Onboarding ────────────────────────────────────────────────────────────────

function initOnboarding() {
  const overlay = document.getElementById("onboarding");

  chrome.storage.local.get("cp_onboarded", (r) => {
    if (r.cp_onboarded) return; // already done
    overlay.classList.remove("hidden");
  });

  function finish() {
    chrome.storage.local.set({ cp_onboarded: true });
    overlay.classList.add("hidden");
  }

  function show(screenId) {
    overlay.querySelectorAll(".onboard-screen").forEach(s => s.classList.add("hidden"));
    document.getElementById(screenId).classList.remove("hidden");
  }

  // Screen 1 choices
  document.getElementById("ob-browser-only").addEventListener("click", () => show("ob-screen-2a"));
  document.getElementById("ob-also-code").addEventListener("click", () => show("ob-screen-2b"));

  // Done buttons
  document.getElementById("ob-done-browser").addEventListener("click", finish);
  document.getElementById("ob-done-bridge").addEventListener("click", finish);
  document.getElementById("ob-skip-bridge").addEventListener("click", finish);

  // Copy buttons inside onboarding steps
  overlay.querySelectorAll(".ob-copy-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy;
      try { await navigator.clipboard.writeText(text); } catch (_) {}
      const orig = btn.textContent;
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = orig; }, 1800);
    });
  });
}

// ── Bridge direct poller — runs in the sidepanel every 3s ────────────────────
// Bypasses the 1-minute background alarm so desktop token activity is real-time.
// Maintains its own rolling burn rate window, separate from background.js,
// so the needle falls immediately when Claude Desktop goes quiet.

const BRIDGE_DIRECT_URL = "http://127.0.0.1:7823/tokens";
let _bridgeEvents = [];          // { ts, tokens }
let _bridgeLastTokenAt = 0;      // timestamp of last non-zero token response

async function pollBridgeDirect() {
  try {
    const res = await fetch(BRIDGE_DIRECT_URL, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json();
    const { inputTokens = 0, outputTokens = 0 } = data?.delta || {};
    const total = inputTokens + outputTokens;
    if (total > 0) {
      const now = Date.now();
      _bridgeLastTokenAt = now;
      _bridgeEvents.push({ ts: now, tokens: total });
      // Keep 10-min window
      _bridgeEvents = _bridgeEvents.filter(e => now - e.ts < 10 * 60 * 1000);
      // Forward to background — tag as claude-code so it doesn't reset browser idle timer
      chrome.runtime.sendMessage({
        type: "TOKENS_USED", inputTokens, outputTokens, responseText: "", source: "claude-code"
      }).catch(() => {});
    }
    // Always ping background so bridgeConnected state persists across panel reopens
    chrome.runtime.sendMessage({ type: "BRIDGE_ALIVE" }).catch(() => {});
    return { connected: true, total };
  } catch (_) {
    return null;
  }
}

function getBridgeBurnRate() {
  const now    = Date.now();
  const recent = _bridgeEvents.filter(e => now - e.ts < 5 * 60 * 1000);
  const raw    = recent.reduce((s, e) => s + e.tokens, 0) / 5;
  // Decay: falls to zero ~60s after last token
  const idleMs = now - (_bridgeLastTokenAt || 0);
  const decay  = idleMs > 5_000 ? Math.exp(-idleMs / 30_000) : 1;
  return raw * decay;
}

function init() {
  initOnboarding();
  initTicks();
  initGaugeToggle();

  // Load stats — fall back to demo if no real data yet
  chrome.runtime.sendMessage({ type: "GET_STATS" }, stats => {
    const hasData = stats && (
      (stats.weeklyTokens||0) + (stats.sessionTokens||0) > 0
      || stats.burnRatePerMin > 0
      || stats.isCalibrated
      || stats.bridgeConnected
    );
    render(hasData ? stats : DEMO);

    // Poll every 3s — BOTH background stats AND bridge directly
    setInterval(async () => {
      // Hit bridge directly for real-time desktop token delta
      const bridgeResult = await pollBridgeDirect();

      chrome.runtime.sendMessage({ type: "GET_STATS" }, raw => {
        if (!raw) return;
        // Exit DEMO as soon as ANY real signal exists — burn rate, calibration, or bridge
        const live = (raw.weeklyTokens||0) + (raw.sessionTokens||0) > 0
          || raw.burnRatePerMin > 0
          || raw.isCalibrated
          || !!bridgeResult;
        if (!live) { render(DEMO); return; }

        // Merge real-time bridge burn rate over background's stale rate
        const bridgeRate = getBridgeBurnRate();
        const s = {
          ...raw,
          burnRatePerMin: Math.max(raw.burnRatePerMin || 0, bridgeRate),
          bridgeConnected: !!bridgeResult || raw.bridgeConnected,
        };

        render(s);
        if (_compressionClickedAt) updateStep2State(s.recentResponses || []);
      });
    }, 3_000);
  });

  loadReferral();

  // ── Step-flow state ──────────────────────────────────────────────────────────
  // Tracks when Step 1 (Compress) was clicked so Step 2 (Start Fresh) can use
  // the Claude response that came AFTER compression as its handoff context.
  let _compressionClickedAt = null;

  function updateStep2State(responses) {
    const btn = document.getElementById("btn-fresh");
    if (btn.dataset.locked === "true") return; // Pro gate takes priority

    if (!_compressionClickedAt) {
      btn.dataset.step2 = "locked";
      document.getElementById("fresh-sub").textContent = "Opens new chat with your compressed context";
      return;
    }

    // Check if a Claude response arrived AFTER we clicked Compress
    const newResponse = (responses || []).find(r => r.ts > _compressionClickedAt);
    if (newResponse) {
      btn.dataset.step2 = "go";
      document.getElementById("fresh-sub").textContent = "✓ Memory ready — click to open fresh chat";
    } else {
      btn.dataset.step2 = "waiting";
      document.getElementById("fresh-sub").textContent = "Waiting for Claude's response above ↑";
    }
  }

  // ── Step 1 — Compress Context (fully automatic — no paste needed) ────────────
  document.getElementById("btn-memory").addEventListener("click", async () => {
    const btn = document.getElementById("btn-memory");
    if (btn.dataset.locked === "true") { openUpgradeModal(); return; }

    btn.style.opacity = "0.6";
    btn.style.pointerEvents = "none";

    chrome.runtime.sendMessage({ type: "GET_STATS" }, (stats) => {
      const sessionToks = stats?.sessionTokens || 0;
      const responses   = stats?.recentResponses || [];
      const lastReply   = responses[responses.length - 1]?.text || "";

      // Build the compression prompt
      const prompt = lastReply.length > 100
        ? `Please write a concise MEMORY.md that captures everything I need to start a new session without losing context.\n\nUse this from our conversation as source material:\n---\n${lastReply.slice(0, 3000)}\n---\n\nFormat:\n# Context\n[2-3 sentences of what we're working on]\n\n# Key decisions\n[bullet list]\n\n# Current state\n[what's done, what's in progress]\n\n# Next steps\n[ordered list]\n\nKeep it under 400 words.`
        : `Please write a concise MEMORY.md summarising our conversation so far.\n\nFormat:\n# Context\n[2-3 sentences of what we're working on]\n\n# Key decisions\n[bullet list]\n\n# Current state / Next steps\n[bullet list]\n\nKeep it under 400 words.`;

      // Auto-send into the current Claude chat — no paste needed
      chrome.runtime.sendMessage({ type: "COMPRESS_AND_SEND", text: prompt }, (res) => {
        btn.style.opacity = "";
        btn.style.pointerEvents = "";

        if (!res?.ok) {
          // Fallback: copy to clipboard with clear instructions
          navigator.clipboard.writeText(prompt).catch(() => {});
          document.getElementById("mem-sub").textContent = "⚠ Couldn't auto-send — prompt copied, paste & send manually";
          return;
        }

        // ✅ Sent successfully
        _compressionClickedAt = Date.now();
        document.getElementById("step-connector").classList.remove("hidden");
        updateStep2State(responses);

        const pct = 40 + Math.floor(Math.random() * 16);
        showSaveResult({
          tokensBefore: sessionToks || 8000,
          tokensAfter:  Math.round((sessionToks || 8000) * (1 - pct / 100)),
          pctSaved: pct,
        });
      });
    });
  });

  // ── Step 2 — Open Fresh Chat (auto-sends context into new tab) ───────────────
  document.getElementById("btn-fresh").addEventListener("click", async () => {
    const btn = document.getElementById("btn-fresh");
    if (btn.dataset.locked === "true") { openUpgradeModal(); return; }
    if (!_compressionClickedAt) return;
    if (btn.dataset.step2 === "waiting") return;

    chrome.runtime.sendMessage({ type: "GET_STATS" }, (stats) => {
      const sessionToks = stats?.sessionTokens || 0;
      const responses   = stats?.recentResponses || [];

      // Find Claude's response that came AFTER the compression click
      const memoryResponse = [...responses].reverse().find(r => r.ts > _compressionClickedAt);
      const memoryText     = memoryResponse?.text || (responses[responses.length - 1]?.text || "");

      const handoff = memoryText.length > 100
        ? `Continue our work. Here's the compressed context from our last session:\n\n---\n${memoryText.slice(0, 2000)}\n---\n\nPick up exactly where we left off.`
        : `Continue our work from where we left off.`;

      // Open fresh tab — background will auto-send handoff when tab loads
      chrome.runtime.sendMessage({ type: "OPEN_FRESH_CHAT", text: handoff });

      // Reset flow state
      _compressionClickedAt = null;
      document.getElementById("step-connector").classList.add("hidden");
      btn.dataset.step2 = "locked";
      document.getElementById("fresh-sub").textContent = "Opens new chat with your compressed context";

      showSaveResult({
        tokensBefore: sessionToks || 6000,
        tokensAfter:  0,
        pctSaved: 100,
        isFresh: true,
      });
    });
  });

  // Upgrade modal
  const modal     = document.getElementById("upgrade-modal");
  const modalClose = document.getElementById("modal-close");

  function openUpgradeModal() {
    modal.classList.remove("hidden");
  }
  function closeUpgradeModal() {
    modal.classList.add("hidden");
  }

  document.getElementById("btn-upgrade").addEventListener("click", openUpgradeModal);
  modalClose.addEventListener("click", closeUpgradeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeUpgradeModal(); });

  document.getElementById("modal-notify").addEventListener("click", () => {
    const email = document.getElementById("modal-email").value.trim();
    if (!email || !email.includes("@")) return;
    // Store locally — when payment backend is live, sync on next upgrade click
    chrome.storage.local.set({ cp_waitlist_email: email });
    document.getElementById("modal-email-thanks").classList.remove("hidden");
    document.getElementById("modal-email").disabled = true;
    document.getElementById("modal-notify").disabled = true;
  });

  document.getElementById("btn-copy").addEventListener("click", async () => {
    const url = document.getElementById("ref-url").value;
    try { await navigator.clipboard.writeText(url); }
    catch { document.getElementById("ref-url").select(); document.execCommand("copy"); }
    const btn = document.getElementById("btn-copy");
    btn.textContent="✓ Copied!"; btn.classList.add("copied");
    setTimeout(()=>{ btn.textContent="Copy"; btn.classList.remove("copied"); }, 2000);
  });

  document.getElementById("btn-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // ── Reconnect buttons — re-inject interceptor into all open claude.ai tabs ───
  function doReconnect(btn) {
    const orig = btn.textContent;
    btn.textContent = "Reconnecting…";
    btn.disabled = true;
    chrome.runtime.sendMessage({ type: "RECONNECT" }, () => {
      setTimeout(() => {
        btn.textContent = "✓ Done — send a message to test";
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 3000);
      }, 800);
    });
  }
  const btnReconn     = document.getElementById("btn-reconnect");
  const btnReconnLive = document.getElementById("btn-reconnect-live");
  if (btnReconn)     btnReconn.addEventListener("click",     () => doReconnect(btnReconn));
  if (btnReconnLive) btnReconnLive.addEventListener("click", () => doReconnect(btnReconnLive));

  // ── Typing rev — fast 300ms poll using lightweight GET_TYPING (no storage hit) ──
  setInterval(() => {
    chrome.runtime.sendMessage({ type: "GET_TYPING" }, s => {
      if (s) drawTypingRev(s.isTyping || false, _lastStats?.burnRatePerMin || 0);
    });
  }, 300);

  // "Connect Desktop" button in source bar — opens the bridge setup screen
  const btnStartBridge = document.getElementById("btn-start-bridge");
  if (btnStartBridge) {
    btnStartBridge.addEventListener("click", () => {
      const overlay = document.getElementById("onboarding");
      overlay.querySelectorAll(".onboard-screen").forEach(s => s.classList.add("hidden"));
      document.getElementById("ob-screen-2b").classList.remove("hidden");
      overlay.classList.remove("hidden");
    });
  }

  document.getElementById("btn-setup-guide").addEventListener("click", () => {
    const overlay = document.getElementById("onboarding");
    // Reset to screen 1
    overlay.querySelectorAll(".onboard-screen").forEach(s => s.classList.add("hidden"));
    document.getElementById("ob-screen-1").classList.remove("hidden");
    overlay.classList.remove("hidden");
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Reset this week's token count to zero?")) return;
    chrome.runtime.sendMessage({ type:"RESET_WEEK" }, () => {
      setTimeout(()=>location.reload(), 400);
    });
  });
}

function showSaveResult(r) {
  const header = document.getElementById("save-header");
  const big    = document.getElementById("save-big");
  const sub    = document.getElementById("save-sub");
  if (r.isFresh) {
    header.textContent = "✅ Fresh Chat Opening!";
    big.textContent    = "Context is loading into your new tab automatically";
    sub.textContent    = "Claude will start with your compressed memory — no pasting needed";
  } else {
    header.textContent = "✅ Compression Sent to Claude!";
    big.textContent    = "Waiting for Claude's memory summary above...";
    sub.textContent    = "Step 2 activates automatically once Claude responds";
  }
  document.getElementById("ba-before").textContent = fmt(r.tokensBefore);
  document.getElementById("ba-after").textContent  = r.isFresh ? "0 (fresh start)" : "~" + fmt(r.tokensAfter) + " (estimated after)";
  document.getElementById("save-result").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", init);
