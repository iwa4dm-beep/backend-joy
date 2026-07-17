#!/usr/bin/env bash
# print-sandbox-secret.sh
#
# Prints the VPS sandbox-worker shared secret so you can paste it into
# Lovable Cloud → Secrets → PLUTO_SANDBOX_SECRET.
#
# Auto-detects its own location so it works regardless of which directory
# you invoke it from. Safe to run as:
#   sudo bash deploy/print-sandbox-secret.sh
#   sudo bash pluto-backend/deploy/print-sandbox-secret.sh
#   sudo /root/backend-joy/pluto-backend/deploy/print-sandbox-secret.sh
#
# If /etc/pluto/sandbox-worker.env has no SANDBOX_SHARED_SECRET, a new one
# is generated, appended, and the pluto-sandbox-worker service is restarted.

set -euo pipefail

# --- resolve real script path (follow symlinks) -----------------------------
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
REPO_ROOT="$(cd -P "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="${ENV_FILE:-/etc/pluto/sandbox-worker.env}"
UNIT="${UNIT:-pluto-sandbox-worker}"

# --- must be root -----------------------------------------------------------
if [ "$(id -u)" != "0" ]; then
  echo "✗ This script must run as root (it reads $ENV_FILE)."
  echo "  Try:  sudo bash $SCRIPT_DIR/$(basename "$0")"
  exit 1
fi

echo "▶ script dir : $SCRIPT_DIR"
echo "▶ repo root  : $REPO_ROOT"
echo "▶ env file   : $ENV_FILE"
echo "▶ unit       : $UNIT"
echo

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"
chmod 0640 "$ENV_FILE" 2>/dev/null || true

# --- read or generate the secret --------------------------------------------
SECRET="$(grep -E '^SANDBOX_SHARED_SECRET=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
GENERATED=0

if [ -z "$SECRET" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "✗ openssl not found — install it (apt-get install -y openssl) and re-run."
    exit 1
  fi
  SECRET="$(openssl rand -hex 32)"
  echo "SANDBOX_SHARED_SECRET=${SECRET}" >> "$ENV_FILE"
  GENERATED=1
  if systemctl list-unit-files "${UNIT}.service" >/dev/null 2>&1; then
    systemctl restart "$UNIT" 2>/dev/null || true
    echo "▶ generated new SANDBOX_SHARED_SECRET and restarted ${UNIT}"
  else
    echo "▶ generated new SANDBOX_SHARED_SECRET (unit ${UNIT} not installed — skip restart)"
  fi
  echo
fi

# --- print result -----------------------------------------------------------
echo "==================== COPY THIS ===================="
echo "PLUTO_SANDBOX_SECRET=${SECRET}"
echo "==================================================="
echo
echo "Copy-paste one-liner (prints the value only):"
echo "  echo '${SECRET}'"
echo
echo "Next steps:"
echo "  1. Open Lovable Cloud → Secrets"
echo "  2. Set (or update) PLUTO_SANDBOX_SECRET to the value above"
echo "  3. Save, then re-run Auto Deploy from your project dashboard"
if [ "$GENERATED" = "1" ]; then
  echo
  echo "ℹ A new secret was just generated on this VPS. Any previous value in"
  echo "  Lovable Cloud is now stale and MUST be updated for deploys to work."
fi
