/**
 * ClaudePacer — Token Interceptor (runs in MAIN world)
 * Injected by background.js via chrome.scripting.executeScript (bypasses CSP).
 *
 * Claude.ai's SSE strips usage from events, so we use two methods:
 *   Input  — parse the POST request body JSON, sum only the text content fields
 *   Output — accumulate content_block_delta text chunks, divide by 4
 */

(function () {
  // Timestamp guard: skip ONLY if we ran within the last 200ms (prevents double-injection
  // race when injectIntoOpenTabs + tabs.onUpdated fire together).
  // Any gap > 200ms = new injection needed (extension reload, page reload, reconnect, etc.)
  const _now = Date.now();
  if (window.__claudePacerInjectedAt && _now - window.__claudePacerInjectedAt < 200) return;
  window.__claudePacerInjectedAt = _now;

  // Always restore the true original fetch before re-patching.
  // This unwinds any stale patch from a previous (dead) extension context.
  if (window.__claudePacerOrigFetch) {
    window.fetch = window.__claudePacerOrigFetch;
    window.__claudePacerOrigFetch = null;
  }

  console.log("[ClaudePacer] ✅ interceptor active — patched at", new Date(_now).toLocaleTimeString());

  // Signal content.js that the interceptor is live (used for connection indicator)
  window.postMessage({ source: "CLAUDEPACER_INTERCEPTOR", type: "INTERCEPTOR_READY" }, "*");

  const _fetch = window.fetch.bind(window);
  window.__claudePacerOrigFetch = _fetch;  // store for future restore

  window.fetch = async function (...args) {
    // Capture request body text BEFORE awaiting (body stream can only be read once).
    // Claude.ai may use fetch(Request, init?) OR fetch(url, { body }) — handle both.
    let reqBodyText = "";
    try {
      if (args[0] instanceof Request) {
        // fetch(Request) form — clone so original is still consumable by _fetch
        reqBodyText = await args[0].clone().text().catch(() => "");
      } else {
        const init = args[1];
        if (init?.body) {
          if (typeof init.body === "string")             reqBodyText = init.body;
          else if (init.body instanceof URLSearchParams) reqBodyText = init.body.toString();
          else if (init.body instanceof Blob)            reqBodyText = await init.body.text().catch(() => "");
        }
      }
    } catch (_) {}

    const response = await _fetch(...args);

    try {
      const url = typeof args[0] === "string" ? args[0]
                : (args[0]?.url ?? args[0]?.href ?? String(args[0]));

      const ct = response.headers?.get("content-type") || "";

      // ── SSE completion stream ─────────────────────────────────────────────
      // Detect by content-type OR by URL — claude.ai has changed API paths
      // and content-type values over time.  Since we're only ever injected
      // into claude.ai tabs, any streaming response from an API path IS the
      // completion stream we care about.
      const isSSEByType = ct.includes("text/event-stream");
      // URL patterns: catch all known claude.ai completion endpoints.
      // Since this script only ever runs on claude.ai, any SSE = our stream.
      const isSSEByUrl  = url.includes("/completion") ||
                          url.includes("chat_conversations") ||
                          url.includes("/append_message") ||
                          url.includes("/retry_completion") ||
                          url.includes("/append") ||
                          (url.includes("/api/") && isSSEByType);
      if (isSSEByType || isSSEByUrl) {
        const inputEst = estimateInputFromBody(reqBodyText);
        processStream(response.clone(), inputEst);
        return response;
      }

      // ── JSON endpoints that may carry real token data ─────────────────────
      if (ct.includes("application/json")) {
        processJSON(response.clone(), url);
      }

    } catch (_) {}

    return response;
  };

  // ── Stream processor ────────────────────────────────────────────────────────
  // Pulses the speedometer DURING streaming so the needle moves while Claude thinks,
  // not just after the full response arrives. Uses a separate STREAM_PULSE message
  // type so background can update burn rate without double-counting weekly totals.

  async function processStream(res, inputEst) {
    const reader = res.body?.getReader();
    if (!reader) return;

    const dec = new TextDecoder();
    let buf          = "";
    let outputText   = "";   // text_delta accumulation
    let inputTokens  = 0;   // from message_start if API provides it
    let outputTokens = 0;   // from message_delta if API provides it
    let pulsedToks   = 0;   // output tokens already pulsed (avoid double-count at end)

    // Send a "speedometer pulse" — updates burn rate in background but NOT weekly totals
    function pulse(tokens) {
      if (tokens <= 0) return;
      pulsedToks += tokens;
      window.postMessage({ source: "CLAUDEPACER_INTERCEPTOR", type: "STREAM_PULSE", tokens }, "*");
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;

          let obj;
          try { obj = JSON.parse(raw); } catch (_) { continue; }

          // message_start — spike the needle immediately with input (stream just began)
          if (obj.type === "message_start") {
            if (obj.message?.usage) {
              const u = obj.message.usage;
              // Count input + cache_creation, NOT cache_read (inflates count misleadingly)
              inputTokens = (u.input_tokens               || 0)
                          + (u.cache_creation_input_tokens || 0);
            }
            // Pulse input tokens up front so needle spikes the moment Claude starts thinking
            pulse(inputTokens > 0 ? inputTokens : inputEst);
          }

          // message_delta — exact output count from API if provided
          if (obj.type === "message_delta" && obj.usage?.output_tokens) {
            outputTokens = obj.usage.output_tokens;
          }

          // content_block_delta — accumulate text; pulse every ~50 output tokens (200 chars)
          if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
            outputText += obj.delta.text ?? "";
            const currentOutEst = Math.ceil(outputText.length / 4);
            if (currentOutEst - pulsedToks >= 50) {
              pulse(currentOutEst - pulsedToks);
            }
          }
        }
      }
    } finally {
      // Final relay for weekly/session TOTALS (stats bar, gas gauge).
      // Input was already pulsed above — don't relay it again.
      // Only relay output that wasn't pulsed yet.
      const finalOut = outputTokens > 0 ? outputTokens
                     : Math.max(1, Math.ceil(outputText.length / 4));
      const finalIn  = inputTokens  > 0 ? inputTokens  : inputEst;
      const unpulsedOut = Math.max(1, finalOut - pulsedToks);

      console.log("[ClaudePacer] 📡 stream done — in:", finalIn,
                  "total out:", finalOut, "pulsed:", pulsedToks, "remaining:", unpulsedOut);

      // Relay full input + remaining output for accurate stats
      // (input is counted once here for stats; the pulse above was speedometer-only)
      relay(finalIn, unpulsedOut, outputText);
    }
  }

  // ── JSON response processor ─────────────────────────────────────────────────
  // Some endpoints (conversation fetch, Anthropic billing) return usage data.

  async function processJSON(res, url) {
    try {
      const data = await res.json();
      if (!data) return;

      // Anthropic a-api usage endpoint (v1/billing or similar)
      // Shape: { usage: { input_tokens, output_tokens } }
      const u = data.usage ?? data.stats ?? data.token_usage;
      if (u?.input_tokens != null && u?.output_tokens != null) {
        console.log("[ClaudePacer] 💰 exact usage from JSON:", u);
        relay(
          (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
          u.output_tokens || 0
        );
      }
    } catch (_) {}
  }

  // ── Input token estimation ──────────────────────────────────────────────────
  // Parse the POST body JSON; sum only the text content fields
  // (excludes JSON structure, field names, and non-text params).

  function estimateInputFromBody(bodyText) {
    if (!bodyText) return 0;
    try {
      const body = JSON.parse(bodyText);
      let text = "";

      // Legacy /v1/complete format
      if (typeof body.prompt === "string") text += body.prompt;

      // Messages API format
      if (typeof body.system === "string") text += body.system;
      if (Array.isArray(body.messages)) {
        for (const msg of body.messages) {
          const c = msg.content;
          if (typeof c === "string") {
            text += c;
          } else if (Array.isArray(c)) {
            for (const block of c) {
              if (block.type === "text" && block.text) text += block.text;
            }
          }
        }
      }

      // claude.ai may send { human_turn, assistant_turn } or { text }
      if (typeof body.text === "string") text += body.text;

      const charCount = text.length;
      if (charCount > 0) {
        return Math.ceil(charCount / 4);
      }
      // Fallback: body length with heavy JSON overhead discount
      return Math.ceil(bodyText.length / 8);

    } catch (_) {
      return Math.ceil(bodyText.length / 8);
    }
  }

  // ── Relay ───────────────────────────────────────────────────────────────────

  function relay(inputTokens, outputTokens, responseText) {
    if ((inputTokens || 0) + (outputTokens || 0) <= 0) return;
    window.__cpLastRelay = Date.now();
    window.postMessage({
      source: "CLAUDEPACER_INTERCEPTOR",
      inputTokens:  inputTokens  || 0,
      outputTokens: outputTokens || 0,
      // Cap at 8k chars to keep storage reasonable (~2k tokens)
      responseText: (responseText || "").slice(0, 8000),
    }, "*");
  }

  // ── DOM MutationObserver fallback ───────────────────────────────────────────
  // Fires if fetch interception produced nothing within 6s of DOM changes.
  // Uses broad selectors that survive claude.ai DOM updates.

  let _lastObservedLen = 0;
  let _moDebounce = null;

  const mo = new MutationObserver(() => {
    // Debounce — only check 2s after mutations settle (streaming finished)
    clearTimeout(_moDebounce);
    _moDebounce = setTimeout(() => {
      const sinceRelay = Date.now() - (window.__cpLastRelay || 0);
      if (sinceRelay < 4000) return; // fetch interceptor already handled this

      // Grab all assistant message containers — try multiple selector strategies
      const selectors = [
        '[data-is-streaming="false"]',
        '[data-testid="assistant-message"]',
        '.font-claude-message',
        '[class*="claude-message"]',
        '[class*="assistant"]',
      ];

      let text = "";
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (!els.length) continue;
        const last = els[els.length - 1];
        const t = last?.textContent ?? "";
        if (t.length > text.length) text = t;
      }

      if (text.length > 30 && text.length !== _lastObservedLen) {
        _lastObservedLen = text.length;
        const est = Math.ceil(text.length / 4);
        console.log("[ClaudePacer] 🔄 DOM fallback triggered, chars:", text.length, "→ ~", est, "tokens");
        // Pass responseText so Pro Step 2 (memory detection) works even when SSE fails
        relay(0, est, text.slice(0, 8000));
      }
    }, 2000);
  });

  mo.observe(document.body, { childList: true, subtree: true });

})();
