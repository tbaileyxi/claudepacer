# ClaudePacer — Project Notes

## What this is
A Chrome extension that shows Claude Pro/Max users their live token burn rate
and weekly budget — like a speedometer and gas gauge for Claude usage.

**Tagline:** "Stop driving Claude without a speedometer or gas gauge."

---

## Why the pivot happened
- Original build used a LiteLLM proxy (Docker-based, requires API key rerouting)
- That approach only works for API key users — NOT Claude Pro/Max subscribers
- Most paid Claude users are on claude.ai (web) or Claude Desktop
- **Correct approach: Chrome extension that reads usage directly from claude.ai**

---

## Current state (as of April 2026)

### ✅ Built and working
- `extension/` — Complete Chrome extension (Manifest V3)
  - Intercepts fetch() on claude.ai to count tokens in real time
  - Beautiful popup: speedometer + gas gauge SVG gauges
  - Badge on toolbar icon showing live % used
  - Weekly budget tracking with projected days remaining
  - Settings page (weekly limit, alerts, week reset day)
  - Referral system UI built in

### ⚠️ Docker/proxy version (ignore for now)
- `dashboard/` + `docker-compose.yml` — old LiteLLM proxy approach
- Works but targets API key users only (developers)
- Not the right product for most users
- Keep it — could be useful for a "teams" version later

---

## How to load the extension in Chrome RIGHT NOW
1. Open `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select `Documents/ClaudePacer/extension`
5. Pin the CP icon to your toolbar
6. Go to claude.ai — start chatting — click the icon to see data

---

## Extension file map
| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, permissions |
| `background.js` | Aggregates token counts, weekly storage, badge |
| `content.js` | Runs on claude.ai, relays data to background |
| `interceptor.js` | Injected into page to intercept fetch() calls |
| `popup.html/css/js` | The dashboard popup UI |
| `options.html/js` | Settings page |

---

## Business model
- **Free:** Speedometer + gas gauge + stats. Anyone installs.
- **Pro ($29 lifetime):** Unlocks Memory Tools (Auto-Update Memory + Start Fresh + Save)
- **Referral:** Share link → friend pays $24 (saves $5) → you get $5 credit
- **Future:** Team/business multi-seat version

## Why $29 lifetime works
- Low enough to be an impulse buy (no subscription anxiety)
- Memory tools save real tokens = real money = pays for itself
- Lifetime = no churn, no support overhead

---

## Go-to-market thinking
- Launch on Product Hunt
- Post on Reddit: r/ClaudeAI, r/ChatGPTPromptEngineering, r/artificial
- Twitter/X: Claude power users
- The "pacer" angle (predicting future) > just showing history
- "At this pace you'll hit your limit Tuesday" is the killer feature

## Competitive moat
- Anthropic could build this natively — but they probably won't (bigger fish)
- More likely they'd acquire if it gets traction
- First mover + viral referral system matters

## Future platforms
- Firefox extension (easy port)
- Safari extension (more work but big audience)
- ChatGPT support (same extension, different content script)
- iOS/Android app

---

## Things still needed before launch
- [ ] Icon PNG files (16x16, 32x32, 48x48, 128x128) — any orange/coral CP logo
- [ ] Test token interception on real claude.ai conversations
- [ ] Stripe/payment backend for the $29 upgrade
- [ ] Landing page at claudepacer.com
- [ ] Chrome Web Store submission ($5 one-time developer fee)

---

## Key decisions made
- **No backend needed for free tier** — all data in chrome.storage.local
- **Token counting:** intercept fetch() SSE stream, parse Anthropic API format
- **Fallback:** DOM observation if fetch interception misses anything
- **Weekly limit default:** 1,000,000 tokens (Claude Pro estimate)
- **User configurable** in settings to match their actual plan

---

## Important context for next session
- The proxy/Docker version still exists but is NOT the priority
- Extension folder is: `~/Documents/ClaudePacer/extension/`
- The extension needs PNG icons before it will load without warnings
- Token interception may need tuning as claude.ai updates its API
- The referral URL in popup.js points to `claudepacer.com` — update when domain is live
