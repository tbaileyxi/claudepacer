/**
 * ClaudePacer — Background Service Worker
 *
 * Receives token events from the content script, aggregates them,
 * and persists weekly + session usage to chrome.storage.local.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEKLY_LIMIT = 100_000; // Claude Pro default (~95-100k/week observed). User can override in options.
const STORAGE_KEY  = "claudepacer_data";

// ── Open side panel when toolbar icon is clicked ──────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── "Dashboard Window" (for Claude Code / desktop users) ──────────────────────
// Side panels are attached to a Chrome tab. When you're working in the Claude
// desktop app, it's nicer to have a floating window you can keep open.

function openDashboardWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL("sidepanel.html"),
    type: "popup",
    width: 420,
    height: 860,
    focused: true,
  }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "open_dashboard_window",
        title: "Open ClaudePacer Dashboard Window",
        contexts: ["action"],
      });
    });
  } catch (_) {}
});

chrome.contextMenus?.onClicked?.addListener((info) => {
  if (info.menuItemId === "open_dashboard_window") openDashboardWindow();
});

// ── Inject token interceptor into claude.ai pages ────────────────────────────
// Using scripting.executeScript with world:"MAIN" bypasses page CSP restrictions.

// Inject into any claude.ai tabs that are already open when the extension
// loads/reloads — without this, an existing tab won't fire tabs.onUpdated.
async function injectIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://claude.ai/*" });
    console.log("Found claude.ai tabs:", tabs?.length || 0);
    if (!tabs || tabs.length === 0) return false;
    for (const tab of tabs) {
      if (!tab.id) continue;
      console.log("Injecting into tab:", tab.id, tab.url);
      // CRITICAL ORDER: inject content.js FIRST so its window.addEventListener("message")
      // is registered before interceptor.js fires INTERCEPTOR_READY via postMessage.
      // Injecting in parallel (no await) loses the READY signal ~50% of the time.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world:  "ISOLATED",
          files:  ["content.js"],
        });
        console.log("Injected content.js into tab:", tab.id);
      } catch (e) {
        console.log("Failed to inject content.js:", e);
      }
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world:  "MAIN",
        files:  ["interceptor.js"],
      }).then(() => {
        console.log("Injected interceptor.js into tab:", tab.id);
      }).catch((e) => {
        console.log("Failed to inject interceptor.js:", e);
      });
    }
    return true;
  } catch (e) {
    console.log("injectIntoOpenTabs error:", e);
  }
  return false;
}

// Run immediately when service worker starts (covers manual reload from chrome://extensions)
injectIntoOpenTabs();
// Also run on browser startup
chrome.runtime.onStartup.addListener(injectIntoOpenTabs);

// Inject whenever a claude.ai tab finishes loading (covers new navigations)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url?.includes("claude.ai")) return;

  // CRITICAL ORDER: content.js listener must be ready before interceptor fires READY signal
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world:  "ISOLATED",
      files:  ["content.js"],
    });
  } catch (_) {}
  chrome.scripting.executeScript({
    target: { tabId },
    world:  "MAIN",
    files:  ["interceptor.js"],
  }).catch(() => {});

  // ── Pro fresh-chat auto-send ──────────────────────────────────────────────
  // If this tab is our pending fresh-chat tab, inject content.js then send the
  // handoff prompt automatically — no user paste needed.
  if (tabId === _pendingFreshChatTabId && _pendingFreshChatText) {
    const text = _pendingFreshChatText;
    _pendingFreshChatText  = "";
    _pendingFreshChatTabId = null;

    // Wait for the React SPA to render the editor (it takes a moment after load)
    setTimeout(async () => {
      try {
        // Make sure content.js is alive in this tab
        await chrome.scripting.executeScript({
          target: { tabId }, world: "ISOLATED", files: ["content.js"],
        });
        // Give content.js a moment to initialise, then send the text
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { type: "AUTO_SEND", text }).catch(() => {});
        }, 600);
      } catch (_) {}
    }, 2_000); // 2s for SPA to render — claude.ai is slow to paint the editor
  }
});

// ── Claude Code bridge polling ────────────────────────────────────────────────
// Sidepanel polls /tokens every 3s for real-time token deltas.
// Background polls /health every 15s as a fallback to set bridgeConnected state
// even if the sidepanel page fetch fails (timing, PNA preflight, etc.)

const BRIDGE_URL        = "http://127.0.0.1:7823/tokens";
const BRIDGE_HEALTH_URL = "http://127.0.0.1:7823/health";

async function pollBridge() {
  try {
    const res = await fetch(BRIDGE_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const data = await res.json();

    // ── Always record that the bridge is alive (even with zero token delta) ──
    const stored = await loadData();
    stored.lastBridgePingAt = Date.now();
    await saveData(stored);

    const { inputTokens, outputTokens } = data?.delta || {};
    if ((inputTokens || 0) + (outputTokens || 0) > 0) {
      await handleTokensUsed(inputTokens || 0, outputTokens || 0, "claude-code");
    }
  } catch (error) {
    // Bridge not running or network error - expected behavior
    // Could notify user if this happens repeatedly
  }
}

// Lightweight health-check — just pings /health to confirm bridge is up.
// Does NOT consume the token delta (sidepanel owns /tokens polling).
// Runs as a background alarm every 15s so bridgeConnected stays fresh
// even if the sidepanel is closed or its fetch fails for any reason.
async function pingBridgeHealth() {
  try {
    const res = await fetch(BRIDGE_HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const stored = await loadData();
    stored.lastBridgePingAt = Date.now();
    await saveData(stored);
  } catch (error) {
    // Bridge health check failed - expected when bridge is off
  }
}

// ── Auto-sync: open a silent background tab to scrape the usage page ──────────
// claude.ai is a React SPA — the HTML shell has no usage numbers.
// Only a real browser tab running the content script can read them.
// We create a background (non-focused) tab, let it load + scrape, then close it.

let _syncTabId = null;

async function autoSyncUsage() {
  const data = await loadData();
  const age  = Date.now() - (data.realDataAt || 0);
  if (age < 28 * 60 * 1000) return; // already fresh enough

  // Don't open if a settings tab is already open (content script will scrape it)
  const existing = await chrome.tabs.query({ url: "https://claude.ai/settings*" });
  if (existing.length > 0) return;

  // Don't open if we already have a sync tab pending
  if (_syncTabId !== null) return;

  try {
    const tab = await chrome.tabs.create({
      url:    "https://claude.ai/settings/usage",
      active: false,   // opens in background — won't steal focus
    });
    _syncTabId = tab.id;

    // Close after 14s — enough time for React SPA to fully render
    setTimeout(() => {
      if (_syncTabId !== null) {
        chrome.tabs.remove(_syncTabId).catch(() => {});
        _syncTabId = null;
      }
    }, 14_000);
  } catch (_) {}
}

// ── Alarm: reset weekly totals every Monday at midnight ───────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const data = await loadData();
  const weekStart = data.weekStart !== undefined ? data.weekStart : 1;
  chrome.alarms.create("weeklyReset", {
    when: nextResetMidnight(weekStart),
    periodInMinutes: 7 * 24 * 60,
  });
  chrome.alarms.create("badgeUpdate",   { periodInMinutes: 1 });
  // bridgePoll: background pings /health every 15s to keep bridgeConnected state fresh.
  // Sidepanel owns the /tokens delta — it polls every 3s and forwards via TOKENS_USED.
  // Background must NOT call /tokens or it steals the delta and sidepanel gets zero.
  chrome.alarms.create("bridgePoll",    { periodInMinutes: 0.25 }); // every 15s
  chrome.alarms.create("autoSync",      { periodInMinutes: 30 });
});

async function ensureAlarms() {
  // Alarms generally persist, but can go missing across extension reloads / dev cycles.
  // Ensure they're present so bridgeConnected + badge updates keep working when panel is closed.
  const existing = await chrome.alarms.getAll();
  const have = new Set(existing.map(a => a.name));
  const data = await loadData();
  const weekStart = data.weekStart !== undefined ? data.weekStart : 1;
  if (!have.has("weeklyReset")) {
    chrome.alarms.create("weeklyReset", {
      when: nextResetMidnight(weekStart),
      periodInMinutes: 7 * 24 * 60,
    });
  }
  if (!have.has("badgeUpdate")) chrome.alarms.create("badgeUpdate", { periodInMinutes: 1 });
  if (!have.has("bridgePoll"))  chrome.alarms.create("bridgePoll",  { periodInMinutes: 0.25 });
  if (!have.has("autoSync"))    chrome.alarms.create("autoSync",    { periodInMinutes: 30 });
}

// Also run on startup / worker boot
ensureAlarms().catch(() => {});
autoSyncUsage();
pingBridgeHealth(); // kick off immediately so bridgeConnected shows without waiting 15s

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms().catch(() => {});
  pingBridgeHealth();
  autoSyncUsage();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "weeklyReset") resetWeeklyTotals();
  if (alarm.name === "badgeUpdate") updateBadge();
  if (alarm.name === "bridgePoll")  pingBridgeHealth(); // health-check only — sidepanel owns /tokens
  if (alarm.name === "autoSync")    autoSyncUsage();
});

// ── Message handler (from content script) ────────────────────────────────────

let _typingUntil          = 0;
let _interceptorAt        = 0;    // timestamp of last INTERCEPTOR_READY signal (also persisted to session)
let _messageLimitAt       = 0;    // timestamp of last MESSAGE_LIMIT (browser-side)
let _messageLimitResetsAt = null; // ms epoch when limit resets (if known)
let _messageLimitRemaining = null;
let _pendingFreshChatText  = "";   // handoff text waiting for fresh tab to load
let _pendingFreshChatTabId = null; // tab id we're waiting on

// Restore interceptorAt from session storage on SW startup (SW is killed after ~30s idle)
chrome.storage.session.get("interceptorAt", d => {
  if (d.interceptorAt) _interceptorAt = d.interceptorAt;
});

// ── Streaming rate — persisted in chrome.storage.session so it survives ──────
// service worker restarts. Chrome kills the SW after ~30s idle; in-memory vars
// would reset to 0 and the needle would always read Idle between polls.
// storage.session is cleared on browser restart but survives SW termination.

async function getStreamData() {
  return new Promise(r => chrome.storage.session.get("streamData", d =>
    r(d.streamData || { toks: 0, startAt: 0, lastAt: 0 })
  ));
}
async function setStreamData(sd) {
  return new Promise(r => chrome.storage.session.set({ streamData: sd }, r));
}

// Persist interceptorAt across service worker restarts (SW is killed after ~30s idle;
// in-memory _interceptorAt resets to 0 and falsely shows "not detected" between polls)
async function getSessionInterceptorAt() {
  return new Promise(r => chrome.storage.session.get("interceptorAt", d => r(d.interceptorAt || 0)));
}
async function setSessionInterceptorAt(ts) {
  return new Promise(r => chrome.storage.session.set({ interceptorAt: ts }, r));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "TYPING_START")     { _typingUntil = Date.now() + 2000; sendResponse({ok:true}); }
  if (msg.type === "TYPING_STOP")      { _typingUntil = 0;                 sendResponse({ok:true}); }
  if (msg.type === "INTERCEPTOR_READY"){
    _interceptorAt = Date.now();
    setSessionInterceptorAt(_interceptorAt); // persist so it survives SW restart
    sendResponse({ok:true});
  }
  if (msg.type === "MESSAGE_LIMIT") {
    _messageLimitAt = Date.now();
    // Parse ISO string if needed
    const r = msg.resetsAt;
    _messageLimitResetsAt =
      typeof r === "number" ? r :
      (typeof r === "string" ? (Date.parse(r) || null) : null);
    _messageLimitRemaining = (msg.remaining ?? null);
    sendResponse({ ok: true });
  }
  // Lightweight typing check — doesn't hit storage, safe for 300ms polling
  if (msg.type === "GET_TYPING")       { sendResponse({ isTyping: Date.now() < _typingUntil }); }

  if (msg.type === "STREAM_PULSE") {
    (async () => {
      const now = Date.now();
      let sd = await getStreamData();
      // New stream if gap > 5s since last pulse
      if (now - sd.lastAt > 5_000) sd = { toks: 0, startAt: now, lastAt: now };
      sd.toks  += (msg.tokens || 0);
      sd.lastAt  = now;
      await setStreamData(sd);
      sendResponse({ ok: true });
    })();
    return true; // async
  }
  if (msg.type === "TOKENS_USED") {
    handleTokensUsed(msg.inputTokens || 0, msg.outputTokens || 0, msg.source || "browser", msg.responseText || "")
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true; // CRITICAL: keeps port open so SW stays alive until async storage write completes
  }
  if (msg.type === "GET_STATS") {
    getStats().then(sendResponse);
    return true; // async
  }
  if (msg.type === "SET_LIMIT") {
    setLimit(msg.limit, msg.weekStart).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "RESET_WEEK") {
    resetWeeklyTotals().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "USAGE_PAGE_DATA") {
    calibrateFromUsagePage(msg).then(() => sendResponse({ ok: true }));
    return true;
  }
  // Sidepanel "Reconnect" button → re-inject into all open claude.ai tabs
  if (msg.type === "RECONNECT") {
    console.log("Background received RECONNECT message");
    injectIntoOpenTabs().then((didInject) => {
      console.log("injectIntoOpenTabs result:", didInject);
      sendResponse({ ok: true, didInject });
    });
    return true;
  }

  // Open floating dashboard window (useful for Claude Code desktop app)
  if (msg.type === "OPEN_DASHBOARD_WINDOW") {
    openDashboardWindow();
    sendResponse({ ok: true });
    return true;
  }

  // Sidepanel bridge poller confirmed the bridge is alive
  if (msg.type === "BRIDGE_ALIVE") {
    loadData().then(data => {
      data.lastBridgePingAt = Date.now();
      saveData(data).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  // ── Pro: Compress — find active claude.ai tab, auto-send compression prompt ──
  if (msg.type === "COMPRESS_AND_SEND") {
    (async () => {
      const tabs = await chrome.tabs.query({ url: "https://claude.ai/*", active: true });
      const tab  = tabs[0] || (await chrome.tabs.query({ url: "https://claude.ai/*" }))[0];
      if (!tab) { sendResponse({ ok: false, reason: "no claude tab" }); return; }
      try {
        const result = await chrome.tabs.sendMessage(tab.id, { type: "AUTO_SEND", text: msg.text });
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: String(e) });
      }
    })();
    return true;
  }

  // ── Pro: Fresh Chat — open new tab, auto-send handoff prompt when it loads ───
  if (msg.type === "OPEN_FRESH_CHAT") {
    (async () => {
      _pendingFreshChatText = msg.text || "";
      const tab = await chrome.tabs.create({ url: "https://claude.ai/new", active: true });
      _pendingFreshChatTabId = tab.id;
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// ── Core logic ────────────────────────────────────────────────────────────────

async function handleTokensUsed(inputTokens, outputTokens, source = "browser", responseText = "") {
  const total = inputTokens + outputTokens;
  if (total <= 0) return;

  const now = Date.now();
  const data = await loadData();

  // Guard: if we've crossed into a new week, reset first
  if (now >= data.weekResetAt) {
    await resetWeeklyTotals();
    return handleTokensUsed(inputTokens, outputTokens);
  }

  // Weekly totals
  data.weeklyTokens += total;
  data.weeklyInputTokens += inputTokens;
  data.weeklyOutputTokens += outputTokens;
  data.weeklyMessages += 1;

  // Track last-seen source for UI indicator
  if (source === "claude-code") data.lastBridgeActivityAt = now;
  else data.lastBrowserActivityAt = now;

  // Session (reset if idle > 30 min)
  const idleMs = now - (data.lastActivityAt || 0);
  if (idleMs > 30 * 60 * 1000) {
    data.sessionTokens = 0;
    data.sessionStartedAt = now;
    data.sessionMessages = 0;
  }
  data.sessionTokens += total;
  data.sessionMessages += 1;
  data.lastActivityAt = now;

  // Keep a rolling buffer of the last 3 response texts for Pro features
  if (responseText && responseText.trim().length > 50) {
    data.recentResponses = data.recentResponses || [];
    data.recentResponses.push({ text: responseText, ts: now, tokens: outputTokens });
    // Keep only last 3, each capped at 8k chars
    if (data.recentResponses.length > 3) data.recentResponses.shift();
  }

  // Rolling event log for burn rate — keep last 10 min
  data.recentEvents = data.recentEvents || [];
  data.recentEvents.push({ ts: now, tokens: total });
  data.recentEvents = data.recentEvents.filter(e => now - e.ts < 10 * 60 * 1000);

  await saveData(data);
  updateBadge(data);
}

async function getStats() {
  const data = await loadData();
  const now = Date.now();
  // MV3 service worker restarts wipe in-memory vars; use session storage as fallback.
  const sessionInterceptorAt = await getSessionInterceptorAt();

  const weeklyLimit = data.weeklyLimit || WEEKLY_LIMIT;
  const weeklyTokens = data.weeklyTokens || 0;
  const pctUsed = Math.min(weeklyTokens / weeklyLimit, 1);

  // Burn rate from stored events — divide by actual elapsed span, not fixed window.
  // This ensures even a single message shows a non-zero rate immediately.
  const allRecent = (data.recentEvents || []).filter(e => now - e.ts < 5 * 60 * 1000);
  const prev      = (data.recentEvents || []).filter(e => {
    const age = now - e.ts;
    return age >= 5 * 60 * 1000 && age < 10 * 60 * 1000;
  });

  const recentTokens = allRecent.reduce((s, e) => s + e.tokens, 0);
  const prevTokens   = prev.reduce((s, e) => s + e.tokens, 0);

  // Span = time from oldest recent event to now, min 0.5 min so first message shows rate
  let spanMin = 0.5;
  if (allRecent.length > 1) {
    spanMin = Math.max(0.5, (now - allRecent[0].ts) / 60_000);
  }
  const rawBurnRate    = recentTokens / spanMin;
  const prevRatePerMin = prevTokens / 5;

  // No decay for 2 minutes after last activity, then slow 5-min half-life
  const browserIdleMs = now - (data.lastBrowserActivityAt || 0);
  const decayFactor   = browserIdleMs > 2 * 60_000
    ? Math.exp(-browserIdleMs / 300_000)
    : 1;
  const historicRate = rawBurnRate * decayFactor;

  // Streaming rate — read from session storage (survives SW restarts).
  // Active during stream; decays to 0 ~30s after last pulse.
  const sd = await getStreamData();
  const pulseIdleMs = now - (sd.lastAt || 0);
  let streamingRate = 0;
  if (pulseIdleMs < 30_000 && (sd.startAt || 0) > 0 && (sd.toks || 0) > 0) {
    // Use at least 15s as the window floor so first-pulse doesn't spike to infinity
    const durationMin = Math.max(0.25, ((sd.lastAt || 0) - (sd.startAt || 0)) / 60_000);
    const rawStreamRate = sd.toks / durationMin;
    // Decay rapidly once stream ends (15s half-life)
    const streamDecay = pulseIdleMs > 2_000 ? Math.exp(-pulseIdleMs / 15_000) : 1;
    streamingRate = rawStreamRate * streamDecay;
  }

  // Use whichever rate is higher — streaming rate wins while Claude is actively generating
  const burnRatePerMin = Math.max(historicRate, streamingRate);

  const accelDiff  = burnRatePerMin - prevRatePerMin;
  const acceleration = Math.abs(accelDiff) < 20 ? "steady" : accelDiff > 0 ? "up" : "down";

  // Projected days remaining
  const tokensRemaining = Math.max(weeklyLimit - weeklyTokens, 0);
  const projectedDaysRemaining = burnRatePerMin > 0
    ? tokensRemaining / burnRatePerMin / (60 * 24)
    : Infinity;

  // Days until week reset (use stored weekResetAt; fall back to sync calculation)
  const msUntilReset = (data.weekResetAt || nextResetMidnight(data.weekStart || 1)) - now;
  const daysUntilReset = msUntilReset / (1000 * 60 * 60 * 24);

  // Calibration: prefer real % from Anthropic's settings page (valid for 7 days)
  const realAge = now - (data.realDataAt || 0);
  const isCalibrated = !!(data.realWeeklyPctUsed && realAge < 7 * 24 * 60 * 60 * 1000);
  const displayPct   = isCalibrated ? data.realWeeklyPctUsed : pctUsed;

  return {
    // Weekly
    weeklyTokens,
    weeklyLimit,
    weeklyInputTokens: data.weeklyInputTokens || 0,
    weeklyOutputTokens: data.weeklyOutputTokens || 0,
    weeklyMessages: data.weeklyMessages || 0,
    pctUsed: displayPct,
    isCalibrated,
    projectedDaysRemaining,
    daysUntilReset,

    // Session
    sessionTokens: data.sessionTokens || 0,
    sessionMessages: data.sessionMessages || 0,
    sessionStartedAt: data.sessionStartedAt || null,
    // Local session % — used when Anthropic sync is unavailable
    // Estimate: session limit ≈ 1/5 of weekly limit (5-hr window in a ~25-hr week budget)
    localSessionPct: Math.min((data.sessionTokens || 0) / Math.max((data.weeklyLimit || WEEKLY_LIMIT) / 5, 10000), 1),

    // Burn rate
    burnRatePerMin,
    prevRatePerMin,
    acceleration,
    multiplierVsAvg: burnRatePerMin > 0 ? burnRatePerMin / 350 : 0,

    // Meta
    lastActivityAt: data.lastActivityAt || null,
    isPaid: data.isPaid || false,
    lifetimeSaved: data.lifetimeSaved || { tokens: 0, messages: 0 },
    detectedPlan: data.detectedPlan || null,
    detectedPlanAt: data.detectedPlanAt || null,

    // Captured response texts for Pro features
    recentResponses: data.recentResponses || [],

    // Session window (5-hour rolling — from Anthropic's settings page)
    // Expire if: reset timestamp passed, OR data is older than 5.5 hours
    ...(() => {
      const sessionAge     = now - (data.realSessionDataAt || data.realDataAt || 0);
      const resetPassed    = data.realSessionResetAt && now > data.realSessionResetAt;
      const tooOld         = sessionAge > 5.5 * 60 * 60 * 1000;
      const sessionExpired = resetPassed || tooOld;
      return {
        sessionPctUsed: sessionExpired ? null : (data.realSessionPctUsed ?? null),
        sessionResetAt: sessionExpired ? null : (data.realSessionResetAt || null),
      };
    })(),

    // Source indicators
    lastBrowserActivityAt: data.lastBrowserActivityAt || null,
    lastBridgeActivityAt:  data.lastBridgeActivityAt  || null,
    isTyping: Date.now() < _typingUntil,

    // Interceptor connection state — true if interceptor.js reported READY in last 60s.
    interceptorActive: (() => {
      const ts = (_interceptorAt || 0) || (sessionInterceptorAt || 0);
      return ts > 0 && (now - ts < 60_000);
    })(),
    interceptorAt: (_interceptorAt || 0) || (sessionInterceptorAt || 0),

    // Message limit state (browser). Consider it "active" for 10 minutes after observed.
    messageLimit: (() => {
      const active = _messageLimitAt > 0 && (now - _messageLimitAt < 10 * 60_000);
      return active ? {
        at: _messageLimitAt,
        resetsAt: _messageLimitResetsAt,
        remaining: _messageLimitRemaining,
      } : null;
    })(),

    // bridgeConnected = bridge responded to a ping in the last 90s (even with 0 tokens)
    bridgeConnected: data.lastBridgePingAt
      ? (now - data.lastBridgePingAt < 90_000)
      : (data.lastBridgeActivityAt ? (now - data.lastBridgeActivityAt < 90_000) : false),

  };
}

async function setLimit(limit, weekStart) {
  const data = await loadData();
  data.weeklyLimit = parseInt(limit, 10);
  data.limitSetByUser = true; // prevents auto-migration from overwriting user's choice
  if (weekStart !== undefined) data.weekStart = weekStart;
  await saveData(data);
}

async function resetWeeklyTotals() {
  const data = await loadData();
  data.weeklyTokens = 0;
  data.weeklyInputTokens = 0;
  data.weeklyOutputTokens = 0;
  data.weeklyMessages = 0;
  data.recentEvents = [];
  data.weekResetAt = nextResetMidnight(data.weekStart !== undefined ? data.weekStart : 1);
  await saveData(data);
}

// ── Badge ──────────────────────────────────────────────────────────────────────

async function updateBadge(data) {
  if (!data) data = await loadData();
  const weeklyLimit = data.weeklyLimit || WEEKLY_LIMIT;
  const pct = Math.min((data.weeklyTokens || 0) / weeklyLimit, 1);

  let color, text;
  if (pct >= 0.9) {
    color = "#EF4444"; text = "!";
  } else if (pct >= 0.7) {
    color = "#F59E0B"; text = `${Math.round(pct * 100)}%`;
  } else {
    color = "#22C55E"; text = `${Math.round(pct * 100)}%`;
  }

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY];
      const data = stored || {
        weeklyTokens: 0,
        weeklyInputTokens: 0,
        weeklyOutputTokens: 0,
        weeklyMessages: 0,
        weeklyLimit: WEEKLY_LIMIT,
        weekResetAt: nextResetMidnight(1),
        sessionTokens: 0,
        sessionMessages: 0,
        sessionStartedAt: Date.now(),
        lastActivityAt: null,
        recentEvents: [],
        isPaid: false,
        lifetimeSaved: { tokens: 0, messages: 0 },
      };

      // Migrate: if the limit is still the old 1M default, auto-update to 100k.
      // (A real Max user who actually wants >100k will set it via Settings.)
      if (data.weeklyLimit === 1_000_000 && !data.limitSetByUser) {
        data.weeklyLimit = WEEKLY_LIMIT; // 100_000
        // Persist the migration silently
        chrome.storage.local.set({ [STORAGE_KEY]: data });
      }

      resolve(data);
    });
  });
}

async function saveData(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: data }, resolve);
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function nextResetMidnight(weekStart) {
  // weekStart: 0=Sun, 1=Mon (default), 6=Sat
  const target = (weekStart !== undefined) ? weekStart : 1;
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  let daysUntil = (target - day + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // already past today's midnight, next week
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

// ── Calibration from Anthropic's /settings/usage page ────────────────────────
// Content script scrapes "32% used" and "Resets Sat 10:00 PM" from the DOM.
// We use that to: (a) show the real percentage, (b) auto-calibrate the limit.

async function calibrateFromUsagePage({ weeklyPctUsed, sessionPctUsed, sessionResetAt, resetDay, resetTime, plan }) {
  // Don't bail if weekly is missing — session data should still update independently
  const hasWeekly  = weeklyPctUsed  && weeklyPctUsed  > 0  && weeklyPctUsed  <= 1;
  const hasSession = sessionPctUsed && sessionPctUsed >= 0 && sessionPctUsed <= 1;
  if (!hasWeekly && !hasSession) return;

  const data = await loadData();
  const now  = Date.now();

  // Store detected plan tier (best-effort)
  if (plan) {
    data.detectedPlan = plan;
    data.detectedPlanAt = now;
    // If user has never set a limit manually, seed a sensible default from plan.
    if (!data.limitSetByUser) {
      if (plan === "pro") data.weeklyLimit = 100_000;
      if (plan === "max_5x") data.weeklyLimit = 500_000;
      if (plan === "max_20x") data.weeklyLimit = 2_000_000;
    }
  }

  // Update whatever we actually got from the page
  if (hasWeekly) {
    data.realWeeklyPctUsed = weeklyPctUsed;
    data.realDataAt        = now;
  }
  if (hasSession || sessionResetAt) {
    data.realSessionPctUsed = hasSession ? sessionPctUsed : null;
    data.realSessionResetAt = sessionResetAt || null;
    data.realSessionDataAt  = now;   // age stamp separate from weekly
  }

  // Auto-calibrate the weekly limit if user hasn't manually set it.
  // Logic: tokensUsed ÷ pctUsed = total limit
  const tokensUsed = data.weeklyTokens || 0;
  if (tokensUsed > 500 && !data.limitSetByUser) {
    const estimated = tokensUsed / weeklyPctUsed;
    // Round to nearest 5 000 tokens for a clean display number
    data.weeklyLimit = Math.max(Math.round(estimated / 5_000) * 5_000, 50_000);
  // Debug removed: auto-calibrated limit
  }

  // Update reset day/time from Anthropic's actual data
  if (resetDay) {
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = dayMap[resetDay.slice(0, 3)];
    if (day !== undefined) {
      data.weekStart = day;

      // Parse "10:00 PM" into an hour offset so the countdown is accurate
      let resetHour = 0;
      if (resetTime) {
        const tm = resetTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (tm) {
          resetHour = parseInt(tm[1], 10);
          if (tm[3].toUpperCase() === "PM" && resetHour !== 12) resetHour += 12;
          if (tm[3].toUpperCase() === "AM" && resetHour === 12) resetHour = 0;
        }
      }
      data.weekResetAt = nextResetAtHour(day, resetHour);
    }
  }

  await saveData(data);
  updateBadge(data);
}

// Like nextResetMidnight but at a specific hour (e.g. 22 for 10 PM)
function nextResetAtHour(weekDay, hour) {
  const now = new Date();
  const day = now.getDay();
  let daysUntil = (weekDay - day + 7) % 7;
  if (daysUntil === 0) {
    // Same weekday: check if we've already passed the reset hour today
    daysUntil = now.getHours() >= hour ? 7 : 0;
  }
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(hour, 0, 0, 0);
  return next.getTime();
}
