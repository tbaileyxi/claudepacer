#!/bin/bash
# ClaudePacer — Bridge Auto-Start Installer
# Double-click this file in Finder to run it.
# It registers the bridge as a Mac background service so it starts
# automatically every time you log in — no Terminal window needed.

set -e

PLIST_LABEL="com.claudepacer.bridge"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
BRIDGE_PATH="$HOME/Documents/ClaudePacer/claude-bridge/bridge.js"
LOG_PATH="$HOME/Library/Logs/claudepacer-bridge.log"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ClaudePacer Bridge Installer       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────────────

NODE_PATH=$(which node 2>/dev/null || echo "")

if [ -z "$NODE_PATH" ]; then
  # Try common install locations
  for p in /usr/local/bin/node /opt/homebrew/bin/node ~/.nvm/versions/node/*/bin/node; do
    if [ -f "$p" ]; then
      NODE_PATH="$p"
      break
    fi
  done
fi

if [ -z "$NODE_PATH" ]; then
  echo "❌  Node.js not found."
  echo ""
  echo "  Please install it first:"
  echo "  1. Go to https://nodejs.org"
  echo "  2. Download and install the LTS version"
  echo "  3. Double-click this file again"
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

NODE_VER=$("$NODE_PATH" --version 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo "❌  Node.js $NODE_VER found, but version 18+ is required."
  echo "    Please update at https://nodejs.org"
  read -p "Press Enter to close..."
  exit 1
fi

echo "✅  Node.js $NODE_VER found at $NODE_PATH"

# ── Check bridge.js exists ─────────────────────────────────────────────────────

if [ ! -f "$BRIDGE_PATH" ]; then
  echo ""
  echo "❌  bridge.js not found at:"
  echo "    $BRIDGE_PATH"
  echo ""
  echo "    Make sure the ClaudePacer folder is in ~/Documents/ClaudePacer/"
  read -p "Press Enter to close..."
  exit 1
fi

echo "✅  bridge.js found"

# ── Unload existing service if running ────────────────────────────────────────

if launchctl list | grep -q "$PLIST_LABEL" 2>/dev/null; then
  echo "↻   Stopping existing bridge service..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# ── Write plist ───────────────────────────────────────────────────────────────

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${BRIDGE_PATH}</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>

  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>

  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
PLIST

echo "✅  Service registered"

# ── Load it now ───────────────────────────────────────────────────────────────

launchctl load "$PLIST_PATH"
sleep 2

# Quick health check
if curl -s --max-time 3 http://127.0.0.1:7823/health > /dev/null 2>&1; then
  echo "✅  Bridge is running!"
else
  echo "⚠   Bridge registered but not responding yet — it may take a few seconds."
  echo "    Check logs at: $LOG_PATH"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Installation complete!             ║"
echo "║                                      ║"
echo "║   The bridge now starts              ║"
echo "║   automatically when you log in.     ║"
echo "║   No Terminal window needed.         ║"
echo "║                                      ║"
echo "║   You'll see '🖥️ Claude Desktop' in   ║"
echo "║   ClaudePacer Chrome panel when      ║"
echo "║   it's active.                       ║"
echo "╚══════════════════════════════════════╝"
echo ""
read -p "Press Enter to close..."
