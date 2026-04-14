#!/bin/bash
# Double-click this file in Finder to start the ClaudePacer Claude Code bridge.
# Watches ~/.claude/ for new Claude Code activity and feeds it to the extension.

# Source shell profile so node/nvm are on PATH
[ -f "$HOME/.zshrc"   ] && source "$HOME/.zshrc"   2>/dev/null
[ -f "$HOME/.bashrc"  ] && source "$HOME/.bashrc"  2>/dev/null
[ -f "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null

# Try common node locations if still not found
NODE=$(command -v node || echo "/usr/local/bin/node")

cd "$(dirname "$0")"
echo "Starting ClaudePacer bridge..."
"$NODE" bridge.js
