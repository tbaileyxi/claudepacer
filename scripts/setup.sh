#!/usr/bin/env bash
# ClaudePacer — one-command setup script
# Usage: bash scripts/setup.sh

set -e

GREEN='\033[0;32m'
AMBER='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

banner() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()     { echo -e "  ${GREEN}✓${NC} $1"; }
warn()   { echo -e "  ${AMBER}!${NC} $1"; }

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║       ClaudePacer Setup           ║"
echo "  ║  Stop driving Claude blind  ⛽    ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# ── Check dependencies ────────────────────────────────────────────────────────
banner "Checking dependencies"

if ! command -v docker &>/dev/null; then
  echo "  ✗ Docker not found. Install it from https://docs.docker.com/get-docker/"
  exit 1
fi
ok "Docker found: $(docker --version | head -1)"

if ! docker compose version &>/dev/null 2>&1; then
  echo "  ✗ Docker Compose V2 not found. Update Docker Desktop or install the plugin."
  exit 1
fi
ok "Docker Compose found"

# ── Create .env if missing ────────────────────────────────────────────────────
banner "Configuring environment"

if [ -f .env ]; then
  ok ".env already exists — skipping"
else
  cp .env.example .env
  ok "Created .env from .env.example"
  warn "ACTION REQUIRED: Open .env and add your ANTHROPIC_API_KEY"
fi

# Check if API key is set
if grep -q "sk-ant-xxxx" .env 2>/dev/null; then
  warn "ANTHROPIC_API_KEY is still the placeholder value."
  warn "Edit .env and replace sk-ant-xxxx with your real key."
  echo ""
  read -p "  Continue anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "  Aborted. Edit .env first, then re-run this script."
    exit 1
  fi
fi

# Auto-generate LITELLM_MASTER_KEY if still placeholder
if grep -q "sk-litellm-xxxx" .env 2>/dev/null; then
  NEW_KEY="sk-litellm-$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-f0-9' | head -c 32)"
  # Use platform-compatible sed
  if sed --version &>/dev/null 2>&1; then
    sed -i "s/sk-litellm-xxxx/$NEW_KEY/" .env
  else
    sed -i '' "s/sk-litellm-xxxx/$NEW_KEY/" .env
  fi
  ok "Generated LITELLM_MASTER_KEY"
fi

# Auto-generate NEXTAUTH_SECRET if still placeholder
if grep -q "changeme-generate-a-real-secret" .env 2>/dev/null; then
  NEW_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)
  if sed --version &>/dev/null 2>&1; then
    sed -i "s/changeme-generate-a-real-secret/$NEW_SECRET/" .env
  else
    sed -i '' "s/changeme-generate-a-real-secret/$NEW_SECRET/" .env
  fi
  ok "Generated NEXTAUTH_SECRET"
fi

# ── Create data directories ───────────────────────────────────────────────────
banner "Preparing directories"
mkdir -p dashboard/data litellm/data
ok "Created data directories"

# ── Pull & build images ───────────────────────────────────────────────────────
banner "Building containers (this takes ~2 min on first run)"
docker compose pull --quiet litellm 2>/dev/null || true
docker compose build --quiet dashboard
ok "Images ready"

# ── Start services ────────────────────────────────────────────────────────────
banner "Starting ClaudePacer"
docker compose up -d

echo ""
echo -e "  ${GREEN}✓ ClaudePacer is running!${NC}"
echo ""
echo "  Dashboard → http://localhost:3000"
echo "  Proxy     → http://localhost:4000"
echo ""
echo "  ── Point Claude at the proxy ────────────────────────────────"
echo "  In Claude Code:  claude config set apiBaseUrl http://localhost:4000"
echo "  In .env.local:   ANTHROPIC_BASE_URL=http://localhost:4000"
echo "  ─────────────────────────────────────────────────────────────"
echo ""
echo "  To stop:   docker compose down"
echo "  To update: git pull && bash scripts/setup.sh"
echo ""
