#!/usr/bin/env node
/**
 * ClaudePacer — Claude Code Bridge
 *
 * Watches ~/.claude/projects/ for new JSONL entries written by Claude Code.
 * Parses token usage from each entry and serves totals on http://localhost:7823
 * so the ClaudePacer Chrome extension can include Claude Code activity.
 *
 * Zero npm dependencies — runs with plain Node.js (v18+).
 *
 * Usage:
 *   node bridge.js
 *   # or install as a background service — see README.md
 */

"use strict";

const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const os    = require("os");

// ── Config ────────────────────────────────────────────────────────────────────

const BRIDGE_VERSION = "1.1.0";
const PORT         = 7823;
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const POLL_MS      = 2_000;   // how often to scan for new JSONL bytes

// ── State ─────────────────────────────────────────────────────────────────────

// file path → byte offset (how far we've already read)
const fileOffsets = new Map();

// accumulated since bridge started
let totalInput  = 0;
let totalOutput = 0;
let totalMsgs   = 0;

// delta since last GET /tokens request
let deltaInput  = 0;
let deltaOutput = 0;
let deltaMsgs   = 0;

const startedAt = Date.now();

function findNewestSessionFile() {
  let newestFile = null, newestMtime = 0;
  let projectDirs = [];
  try { projectDirs = fs.readdirSync(PROJECTS_DIR); } catch { return null; }
  for (const dir of projectDirs) {
    const full = path.join(PROJECTS_DIR, dir);
    let entries;
    try { entries = fs.readdirSync(full); } catch { continue; }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const fp = path.join(full, entry);
      try {
        const st = fs.statSync(fp);
        if (st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newestFile = fp; }
      } catch {}
    }
  }
  return newestFile;
}

// ── JSONL scanner ─────────────────────────────────────────────────────────────

function scanProjects() {
  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch { return; }

  for (const dir of dirs) {
    const full = path.join(PROJECTS_DIR, dir);
    let entries;
    try { entries = fs.readdirSync(full); } catch { continue; }

    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const filePath = path.join(full, entry);
      processNewLines(filePath);
    }
  }
}

function processNewLines(filePath) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return; }

  const known = fileOffsets.get(filePath) || 0;
  if (stat.size <= known) return;

  // Read only the new bytes
  let fd;
  try { fd = fs.openSync(filePath, "r"); } catch { return; }

  const buf = Buffer.alloc(stat.size - known);
  let bytesRead = 0;
  try {
    bytesRead = fs.readSync(fd, buf, 0, buf.length, known);
  } finally {
    fs.closeSync(fd);
  }

  fileOffsets.set(filePath, known + bytesRead);

  const text  = buf.slice(0, bytesRead).toString("utf8");
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      consumeEntry(obj);
    } catch { /* malformed line, skip */ }
  }
}

function consumeEntry(obj) {
  // Claude Code JSONL: { message: { role: "assistant", usage: { ... } } }
  const usage = obj?.message?.usage;
  if (!usage) return;
  if (obj?.message?.role !== "assistant") return;

  // Count input + cache_creation (new work), but NOT cache_read (cheap re-reads).
  // cache_read tokens can be millions for large codebases and inflate the gauge misleadingly.
  const input  = (usage.input_tokens               || 0)
               + (usage.cache_creation_input_tokens || 0);
  const output = (usage.output_tokens || 0);

  if (input + output === 0) return;

  totalInput  += input;
  totalOutput += output;
  totalMsgs   += 1;

  deltaInput  += input;
  deltaOutput += output;
  deltaMsgs   += 1;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

// ── Dashboard HTML ────────────────────────────────────────────────────────────
// Served at http://127.0.0.1:7823/ — bookmark this for a desktop token gauge.

function dashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="refresh" content="5"/>
<title>ClaudePacer — Claude Code Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0D0D14;color:#e0e0f0;font-family:Inter,system-ui,sans-serif;
       display:flex;flex-direction:column;align-items:center;padding:32px 16px;min-height:100vh}
  h1{font-size:1.4rem;font-weight:800;color:#D97757;margin-bottom:4px}
  .sub{font-size:.8rem;color:#555570;margin-bottom:32px}
  .cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;width:100%;max-width:640px}
  .card{background:#13131E;border:1px solid #1e1e30;border-radius:14px;padding:24px;
        flex:1;min-width:180px;text-align:center}
  .card-lbl{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:#555570;margin-bottom:8px}
  .card-val{font-size:2.2rem;font-weight:800;line-height:1}
  .card-unit{font-size:.75rem;color:#555570;margin-top:4px}
  .green{color:#22C55E} .amber{color:#F59E0B} .red{color:#EF4444} .coral{color:#D97757}
  .bar-wrap{width:100%;max-width:640px;margin-top:24px}
  .bar-label{font-size:.75rem;color:#555570;margin-bottom:6px;display:flex;justify-content:space-between}
  .bar-bg{background:#1A1A2E;border-radius:99px;height:10px;overflow:hidden}
  .bar-fill{height:100%;border-radius:99px;transition:width .5s ease}
  .hint{font-size:.75rem;color:#333350;margin-top:32px;text-align:center;line-height:1.6}
  .live{display:inline-block;width:8px;height:8px;border-radius:50%;
        background:#22C55E;box-shadow:0 0 6px #22C55E;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
</style>
</head>
<body>
<h1>⛽ ClaudePacer</h1>
<div class="sub">Claude Code desktop gauge &nbsp;<span class="live"></span> live</div>
<div id="content">Loading…</div>
<div class="hint">Auto-refreshes every 5 seconds.<br>
Keep <code>bridge.js</code> running in Terminal while using Claude Code.</div>
<script>
async function refresh() {
  try {
    const r = await fetch('/stats');
    const d = await r.json();
    const pct = Math.min(d.weeklyTokens / d.weeklyLimit, 1);
    const col = pct >= 0.8 ? 'red' : pct >= 0.5 ? 'amber' : 'green';
    const barCol = pct >= 0.8 ? '#EF4444' : pct >= 0.5 ? '#F59E0B' : '#22C55E';
    const fmt = n => n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(Math.round(n));
    const days = d.burnRatePerMin>0
      ? Math.max(d.weeklyLimit-d.weeklyTokens,0)/d.burnRatePerMin/1440
      : Infinity;
    const daysStr = isFinite(days)&&days<180 ? '~'+days.toFixed(1)+' days left' : '∞ runway';
    document.getElementById('content').innerHTML = \`
      <div class="cards">
        <div class="card">
          <div class="card-lbl">Burn Rate</div>
          <div class="card-val coral">\${Math.round(d.burnRatePerMin)}</div>
          <div class="card-unit">tokens / min</div>
        </div>
        <div class="card">
          <div class="card-lbl">Session Tokens</div>
          <div class="card-val green">\${fmt(d.sessionTokens)}</div>
          <div class="card-unit">\${d.sessionMessages} messages</div>
        </div>
        <div class="card">
          <div class="card-lbl">Weekly Used</div>
          <div class="card-val \${col}">\${fmt(d.weeklyTokens)}</div>
          <div class="card-unit">of \${fmt(d.weeklyLimit)}</div>
        </div>
      </div>
      <div class="bar-wrap">
        <div class="bar-label">
          <span>Weekly budget</span>
          <span>\${Math.round(pct*100)}% — \${daysStr}</span>
        </div>
        <div class="bar-bg"><div class="bar-fill" style="width:\${Math.round(pct*100)}%;background:\${barCol}"></div></div>
      </div>
    \`;
  } catch(e) {
    document.getElementById('content').innerHTML = '<p style="color:#EF4444;margin-top:16px">Bridge not responding</p>';
  }
}
refresh();
</script>
</body>
</html>`;
}

// ── /stats endpoint — snapshot without consuming delta ────────────────────────

function getStatsSnapshot() {
  const now = Date.now();
  // Approximate burn rate from recent events tracked by bridge
  // (bridge doesn't have a rolling window, so we use a simple rate: total/uptime)
  const uptimeMin = (now - startedAt) / 60_000;
  const burnRatePerMin = uptimeMin > 0
    ? (totalInput + totalOutput) / uptimeMin
    : 0;

  // Weekly limit default (1M); bridge doesn't persist user's custom limit
  const weeklyLimit = 1_000_000;

  return {
    weeklyTokens:   totalInput + totalOutput,
    weeklyLimit,
    sessionTokens:  totalInput + totalOutput,
    sessionMessages: totalMsgs,
    burnRatePerMin: Math.round(burnRatePerMin * 10) / 10,
    uptimeMin:      Math.round(uptimeMin),
  };
}

const server = http.createServer((req, res) => {
  // CORS — allow any origin (Chrome extension pages need this)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  // Private Network Access — Chrome 104+ blocks localhost fetches from
  // extension pages unless the server explicitly opts in with this header.
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") {
    // PNA preflight also needs the response header on the OPTIONS reply
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.writeHead(204);
    res.end();
    return;
  }

  // ── HTML dashboard ─────────────────────────────────────────────────────────
  if ((req.url === "/" || req.url === "/dashboard") && req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.writeHead(200);
    res.end(dashboardHTML());
    return;
  }

  // ── Stats snapshot (used by dashboard HTML) ───────────────────────────────
  if (req.url === "/stats" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify(getStatsSnapshot()));
    return;
  }

  res.setHeader("Content-Type", "application/json");

  res.setHeader("Content-Type", "application/json");

  if (req.url === "/tokens" && req.method === "GET") {
    const payload = {
      source: "claude-code-bridge",
      version: 1,
      startedAt,
      // Session totals (since bridge launched)
      total: { inputTokens: totalInput, outputTokens: totalOutput, messages: totalMsgs },
      // Delta since last poll — consumed on read
      delta: { inputTokens: deltaInput, outputTokens: deltaOutput, messages: deltaMsgs },
    };

    // Reset delta after serving it
    deltaInput  = 0;
    deltaOutput = 0;
    deltaMsgs   = 0;

    res.writeHead(200);
    res.end(JSON.stringify(payload));
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({
      ok: true,
      uptime: Date.now() - startedAt,
      startedAt,
      version: BRIDGE_VERSION,
      projectsDir: PROJECTS_DIR,
      // Capabilities let the extension detect "old bridge" installs.
      supports: {
        tokens: true,
        conversation: true,
        stats: true,
        dashboard: true,
      },
    }));
    return;
  }

  // ── /conversation — last N messages from the most-recently-active session ──
  // Used by the extension's "Compress This Chat" feature to include actual
  // Claude Code conversation content in the compression prompt.
  if (req.url?.startsWith("/conversation") && req.method === "GET") {
    const maxMsgs = 60; // last 60 messages is plenty for compression
    try {
      const newestFile = findNewestSessionFile();
      if (!newestFile) { res.writeHead(404); res.end(JSON.stringify({ error: "no sessions" })); return; }

      // Read all lines, extract user/assistant messages
      const raw = fs.readFileSync(newestFile, "utf8");
      const messages = [];
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          const msg = obj?.message;
          if (!msg || !["user","assistant"].includes(msg.role)) continue;
          const content = msg.content;
          let text = "";
          if (typeof content === "string") {
            text = content;
          } else if (Array.isArray(content)) {
            text = content.filter(b => b.type === "text").map(b => b.text || "").join(" ");
          }
          text = text.trim();
          if (text.length > 20) messages.push({ role: msg.role, text: text.slice(0, 2000) });
        } catch {}
      }
      // Return last maxMsgs messages
      const recent = messages.slice(-maxMsgs);
      res.writeHead(200);
      res.end(JSON.stringify({ messages: recent, total: messages.length, file: path.basename(newestFile) }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // ── /write_memory — writes MEMORY.md into the active project folder ─────────
  // Body: { text: string, archive?: boolean }
  if (req.url === "/write_memory" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 2_000_000) req.destroy(); });
    req.on("end", () => {
      try {
        const j = JSON.parse(body || "{}");
        const text = (j.text || "").toString();
        const archive = j.archive !== false; // default true
        if (!text.trim()) { res.writeHead(400); res.end(JSON.stringify({ error: "empty" })); return; }

        const newestFile = findNewestSessionFile();
        if (!newestFile) { res.writeHead(404); res.end(JSON.stringify({ error: "no sessions" })); return; }
        const projectDir = path.dirname(newestFile);

        const memPath = path.join(projectDir, "MEMORY.md");
        fs.writeFileSync(memPath, text, "utf8");

        let archivePath = null;
        if (archive) {
          const cpDir = path.join(projectDir, ".claudepacer");
          try { fs.mkdirSync(cpDir, { recursive: true }); } catch {}
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          archivePath = path.join(cpDir, `memory-${ts}.md`);
          fs.writeFileSync(archivePath, text, "utf8");
        }

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, projectDir, memoryPath: memPath, archivePath }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ClaudePacer bridge running on http://127.0.0.1:${PORT}`);
  console.log(`📊 Dashboard: http://127.0.0.1:${PORT}/`);
  console.log(`Watching: ${PROJECTS_DIR}`);
  console.log("Keep this terminal open while using Claude Code.");
  console.log("Press Ctrl+C to stop.\n");
});

// ── Polling loop ──────────────────────────────────────────────────────────────

// Initial scan (pick up everything already written since bridge started)
// Only track offsets — don't count existing history as new activity
function initOffsets() {
  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR); } catch { return; }
  for (const dir of dirs) {
    const full = path.join(PROJECTS_DIR, dir);
    let entries;
    try { entries = fs.readdirSync(full); } catch { continue; }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const filePath = path.join(full, entry);
      try {
        const stat = fs.statSync(filePath);
        fileOffsets.set(filePath, stat.size); // skip all existing lines
      } catch {}
    }
  }
}

initOffsets();

// Poll for new lines every POLL_MS
setInterval(scanProjects, POLL_MS);

// Handle shutdown gracefully
process.on("SIGINT",  () => { console.log("\nBridge stopped."); process.exit(0); });
process.on("SIGTERM", () => { process.exit(0); });
