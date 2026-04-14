/**
 * ClaudePacer — Content Script
 * Runs on all claude.ai pages.
 *
 * 1. Relays token events from interceptor.js → background
 * 2. Scrapes actual usage % from the /settings/usage page → background
 *    This auto-calibrates the gas gauge without any manual setup.
 */

// Guard against double-injection: remove old listeners before adding new ones
if (window.__cpMsgListener) {
  window.removeEventListener("message", window.__cpMsgListener);
  window.__cpMsgListener = null;
}
window.__cpContentInjected = true;

// ── 1. Relay token events from interceptor → background ───────────────────────

function _cpHandleInterceptorMsg(event) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "CLAUDEPACER_INTERCEPTOR") return;

  // Interceptor just (re-)patched fetch — tell background so sidepanel can show ✅
  if (event.data.type === "INTERCEPTOR_READY") {
    chrome.runtime.sendMessage({ type: "INTERCEPTOR_READY" }).catch(() => {});
    return;
  }

  // Real-time speedometer pulse — fired every ~50 output tokens during streaming
  // Updates burn rate but NOT weekly/session totals (avoids double-counting)
  if (event.data.type === "STREAM_PULSE") {
    chrome.runtime.sendMessage({ type: "STREAM_PULSE", tokens: event.data.tokens || 0 }).catch(() => {});
    return;
  }

  const { inputTokens, outputTokens, responseText } = event.data;
  if ((inputTokens || 0) + (outputTokens || 0) <= 0) return;

  // Send with retry — background SW may need a moment to wake up after idle
  function sendTokens(attemptsLeft) {
    chrome.runtime.sendMessage({
      type: "TOKENS_USED",
      inputTokens:  inputTokens  || 0,
      outputTokens: outputTokens || 0,
      responseText: responseText || "",
    }).catch(() => {
      if (attemptsLeft > 0) setTimeout(() => sendTokens(attemptsLeft - 1), 400);
    });
  }
  sendTokens(2);
}

window.__cpMsgListener = _cpHandleInterceptorMsg;
window.addEventListener("message", window.__cpMsgListener);

// ── 4. Auto-send — inject text into Claude's input and submit ─────────────────
// Used by Pro flow (Compress + Fresh Chat) to send messages without user paste.
// Claude.ai uses ProseMirror contenteditable — execCommand is the reliable path.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "AUTO_SEND") return;
  const text = msg.text || "";
  if (!text) { sendResponse({ ok: false, reason: "empty" }); return; }

  // Find the ProseMirror editor (claude.ai's input box)
  const editor =
    document.querySelector('.ProseMirror[contenteditable="true"]') ||
    document.querySelector('[contenteditable="true"][data-placeholder]') ||
    document.querySelector('[contenteditable="true"]');

  if (!editor) { sendResponse({ ok: false, reason: "no editor" }); return; }

  // Focus, select all existing text, replace with our prompt
  editor.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete",    false, null);
  document.execCommand("insertText", false, text);

  // Also dispatch an 'input' event so React's state updates the send button
  editor.dispatchEvent(new Event("input", { bubbles: true }));

  // Try to click Send — retry up to 3 times with increasing delay
  // (React needs a tick to re-render the button as enabled after text insertion)
  function trySend(attempt) {
    // Case-insensitive aria-label search (claude.ai has changed capitalization)
    const allBtns = [...document.querySelectorAll("button:not([disabled])")];
    const sendBtn =
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[aria-label="Send Message"]') ||
      document.querySelector('[data-testid="send-button"]')       ||
      // Any enabled icon-only button (SVG, no text) near the bottom of the page
      allBtns.find(b => b.querySelector("svg") && !b.textContent.trim() &&
                        b.getBoundingClientRect().bottom > window.innerHeight * 0.5) ||
      // Submit button fallback
      [...document.querySelectorAll('button[type="submit"]:not([disabled])')].pop();

    if (sendBtn && !sendBtn.disabled) {
      // Full click simulation so React's synthetic event fires
      sendBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      sendBtn.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true }));
      sendBtn.click();
      sendResponse({ ok: true });
      return;
    }

    if (attempt < 3) {
      setTimeout(() => trySend(attempt + 1), attempt * 300 + 200);
      return;
    }

    // Final fallback: try submitting the form, then Enter key
    const form = editor.closest("form");
    if (form) {
      try { form.requestSubmit(); sendResponse({ ok: true, fallback: "form" }); return; }
      catch (_) {}
    }
    editor.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true, cancelable: true
    }));
    sendResponse({ ok: true, fallback: "enter" });
  }

  setTimeout(() => trySend(0), 150);
  return true; // async response
});

// ── 3. Typing activity detector ───────────────────────────────────────────────
// Remove old listener if content.js was re-injected
if (window.__cpKeyListener) {
  document.removeEventListener("keydown", window.__cpKeyListener, true);
  window.__cpKeyListener = null;
}

(function initTypingDetector() {
  let _stopTimer = null;
  let _isTyping  = false;

  function onKey(e) {
    if (e.key.length > 1 && !["Backspace","Delete"].includes(e.key)) return;
    if (!_isTyping) {
      _isTyping = true;
      chrome.runtime.sendMessage({ type: "TYPING_START" }).catch(() => {});
    }
    clearTimeout(_stopTimer);
    _stopTimer = setTimeout(() => {
      _isTyping = false;
      chrome.runtime.sendMessage({ type: "TYPING_STOP" }).catch(() => {});
    }, 1500);
  }

  window.__cpKeyListener = onKey;
  document.addEventListener("keydown", window.__cpKeyListener, true);
})();

// ── 2. Settings/Usage page scraper ────────────────────────────────────────────
// When user is on /settings/usage, read Anthropic's real usage data from the DOM.
// Sends to background which auto-calibrates the weekly limit and reset time.

function scrapeUsagePage() {
  const path = window.location.pathname;
  if (!path.includes("/settings")) return;

  const text = document.body.innerText;

  // Need both "Weekly limits" section and a percentage
  const weeklyIdx = text.indexOf("Weekly limits");
  if (weeklyIdx === -1) return;

  // Find "XX% used" within the weekly section (first 600 chars after header)
  const weeklySection = text.slice(weeklyIdx, weeklyIdx + 1200);
  const pctMatch = weeklySection.match(/(\d+)%\s*used/);
  if (!pctMatch) return; // page not rendered yet, retry

  const weeklyPctUsed = parseInt(pctMatch[1], 10) / 100;

  // Find "Resets Sat 10:00 PM" anywhere on the page (weekly reset)
  // We look for the one AFTER "Weekly limits" to avoid grabbing session reset
  const afterWeekly = text.slice(weeklyIdx, weeklyIdx + 800);
  const resetMatch = afterWeekly.match(
    /Resets\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i
  );
  const resetDay  = resetMatch ? resetMatch[1] : null;
  const resetTime = resetMatch ? resetMatch[2] : null;

  // Session section (everything before "Weekly limits")
  const sessionSection = text.slice(0, weeklyIdx);

  const sessionPctMatch = sessionSection.match(/(\d+)%\s*used/);
  const sessionPctUsed  = sessionPctMatch ? parseInt(sessionPctMatch[1], 10) / 100 : null;

  // "Resets in 3 hr 32 min" or "Resets in 45 min" → absolute timestamp
  const sessionCountdown = sessionSection.match(
    /Resets in\s+(?:(\d+)\s*hr)?\s*(?:(\d+)\s*min)?/i
  );
  let sessionResetAt = null;
  if (sessionCountdown) {
    const hrs  = parseInt(sessionCountdown[1] || 0, 10);
    const mins = parseInt(sessionCountdown[2] || 0, 10);
    const totalMs = (hrs * 60 + mins) * 60 * 1000;
    if (totalMs > 0) sessionResetAt = Date.now() + totalMs;
  }

  console.log("[ClaudePacer] 📊 Usage page:", {
    weeklyPctUsed, resetDay, resetTime,
    sessionPctUsed, sessionResetAt: sessionResetAt ? new Date(sessionResetAt).toLocaleTimeString() : null,
  });

  const payload = { type: "USAGE_PAGE_DATA", weeklyPctUsed, sessionPctUsed, sessionResetAt, resetDay, resetTime };

  // Retry up to 3 times — extension reload can cause the first send to fail silently
  function sendWithRetry(attempts) {
    chrome.runtime.sendMessage(payload).catch(() => {
      if (attempts > 1) setTimeout(() => sendWithRetry(attempts - 1), 1000);
    });
  }
  sendWithRetry(3);
}

// Retry up to N times because SPA pages render content after JS runs
function scrapeWithRetry(remaining) {
  if (!window.location.pathname.includes("/settings")) return;
  scrapeUsagePage();
  // Space retries: first few fast, then slower to catch late-rendering SPA content
  if (remaining > 1) {
    const delay = remaining > 5 ? 800 : remaining > 2 ? 1500 : 3000;
    setTimeout(() => scrapeWithRetry(remaining - 1), delay);
  }
}

// Run on initial page load — try up to 8 times (SPA can take several seconds to render)
scrapeWithRetry(8);

// Watch for SPA navigation (claude.ai is a single-page app)
let _lastPath = window.location.pathname;
setInterval(() => {
  const path = window.location.pathname;
  if (path !== _lastPath) {
    _lastPath = path;
    setTimeout(() => scrapeWithRetry(5), 400);
  }
}, 500);
