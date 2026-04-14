# ClaudePacer — CLAUDE.md

Resume context for AI coding sessions. Read this first.

---

## What this project is

A Chrome extension that gives Claude Pro/Max users a **speedometer** (token burn rate) and **gas gauge** (weekly budget) so they can see how fast they're burning through their plan limits — in real time, right beside claude.ai.

**Tagline:** "Stop driving Claude without a speedometer or gas gauge."

**The product lives in `extension/` — load that folder in Chrome as an unpacked extension.**

---

## Current state (April 2026)

### ✅ Working
- Extension loads and shows Live green dot after first message on claude.ai
- Side panel opens beside Claude (persistent, not a popup)
- Speedometer + gas gauge SVGs update with estimated token counts
- Background service worker auto-injects interceptor into open claude.ai tabs on startup
- Claude Code bridge (`claude-bridge/bridge.js`) watches `~/.claude/` and feeds desktop usage into the same gauges

### ⚠️ Limitations right now
- Token counts are **estimated**, not exact
  - claude.ai's SSE strips `usage` fields that the standard Anthropic API includes
  - Input: POST request body text content ÷ 4
  - Output: accumulated `content_block_delta` text ÷ 4
  - This is directionally accurate — in project-heavy chats, large input counts ARE real
- No PNG icons (puzzle piece shows — add 16/32/48/128px icons to `extension/icons/`)
- No payment backend (`upgrade` button links to claudepacer.com/upgrade — doesn't exist yet)

---

## Critical architecture decisions

### Why Chrome extension (not a proxy)
Claude Pro/Max users can't reroute through a proxy. They use claude.ai directly.
The extension intercepts `window.fetch()` on the page — no API key, no setup, no rerouting.

### Why `chrome.scripting.executeScript` (not content script injection)
Claude.ai's CSP blocks `chrome-extension://` URLs in `<script>` tags.
**Fix:** Background service worker injects `interceptor.js` with `world: "MAIN"` via the Scripting API — this bypasses page CSP entirely.
`content.js` must NOT inject via script tag. It only listens for `window.postMessage`.

### Why demo mode
The side panel shows realistic fake data (420 tok/min, 38% used) until real tokens arrive.
Switches to Live automatically. Makes the product look great immediately on install.

---

## File map

```
extension/
├── manifest.json       MV3. permissions: storage, alarms, sidePanel, tabs, scripting
├── background.js       Service worker: token storage, weekly reset, badge, bridge polling,
│                       CSP-bypass injection via chrome.scripting.executeScript
├── content.js          Runs on claude.ai. Listens for postMessage from interceptor,
│                       forwards to background. Does NOT inject scripts.
├── interceptor.js      Injected into MAIN world. Patches window.fetch.
│                       Parses SSE content_block_delta for output, request body for input.
├── sidepanel.html      Main product UI (persistent panel beside Claude)
├── sidepanel.css       Dark theme (#0D0D14 bg, #D97757 coral brand)
├── sidepanel.js        Dashboard logic. DEMO object, live data polling, gauge rendering
├── popup.html/css/js   Alternate popup (not primary — side panel takes over on icon click)
└── options.html/js     Settings: weekly limit, alerts, week start day

claude-bridge/
├── bridge.js           Node.js. Watches ~/.claude/projects/**/*.jsonl.
│                       Serves token deltas at http://127.0.0.1:7823/tokens
└── start-bridge.command  Double-click in Finder to start bridge

dashboard/              OLD Docker/LiteLLM proxy approach — ignore unless building "teams" version
```

---

## How to reload the extension after code changes

1. `chrome://extensions` → click **↺** on ClaudePacer
2. The background service worker will auto-inject into any open claude.ai tabs
3. No need to reload the claude.ai tab (unless testing content.js changes)

## How to start the Claude Code bridge

```bash
cd ~/Documents/ClaudePacer/claude-bridge
/usr/local/bin/node bridge.js
```
Or double-click `start-bridge.command` in Finder.
Extension polls it every minute. Shows "⌨️ Claude Code" chip in side panel when active.

---

## Token counting — the core technical challenge

Claude.ai's internal API is at `/api/organizations/{orgId}/chat_conversations/{convId}/completion`.
It uses SSE streaming but **strips usage fields** from events:
- `message_start` — no `usage` object (standard API has it)
- `message_delta` — no `usage.output_tokens` (standard API has it)
- Only text content arrives via `content_block_delta` events

**Current solution:** Estimate from text character lengths (÷ 4 chars/token).
**Better solution (future):** Try `chrome.debugger` API or intercept Network requests for exact counts.

The `message_limit` event does arrive and shows `resetsAt`/`remaining` — worth parsing for gas gauge.

---

## Business model

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Speedometer, gas gauge, session/weekly stats |
| Pro | $29 lifetime | + Memory Tools (Auto-Update Memory, Start Fresh + Save) |
| Referral | — | Both parties save $5 |

Memory tools work with Claude Code's MEMORY.md convention:
- Auto-Update Memory: compress current context → update MEMORY.md → saves 30-55% tokens
- Start Fresh + Save: save thread summary → open fresh chat

---

## What needs to happen before launch

- [ ] **Icons** — create 16/32/48/128px PNG icons and add to `extension/icons/`
- [ ] **Payment** — Stripe backend for $29 upgrade (scaffold exists in `dashboard/src/app/api/payment/`)
- [ ] **Domain** — claudepacer.com landing page
- [ ] **Store** — Chrome Web Store submission ($5 one-time developer fee, pack extension as .zip)
- [ ] **Token accuracy** — investigate `chrome.debugger` API for exact network-level token counts
- [ ] **ChatGPT** — same extension architecture works, add content script for chatgpt.com

---

## Go-to-market

- Launch: Product Hunt
- Communities: r/ClaudeAI, r/ChatGPTPromptEngineering, r/artificial, Twitter/X
- Hook: **"At this pace you'll hit your limit on Tuesday"** — the forward-looking prediction
- Competitive moat: first mover + viral referral + Anthropic probably won't build this natively
