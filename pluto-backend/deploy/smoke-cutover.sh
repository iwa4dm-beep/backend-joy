#!/usr/bin/env bash
# smoke-cutover.sh
# ---------------------------------------------------------------
# End-to-end cutover smoke test:
#   1. Scans a dist/ dir (or a live URL) for supabase.co URLs
#   2. Probes Pluto /health
#   3. Probes Pluto /auth/v1/settings
#   4. Prints ONE-LINE status: CUTOVER=OK|FAIL <reasons>
#
# Usage:
#   bash smoke-cutover.sh [--dist ./dist] [--url https://app.timescard.cloud] \
#                        [--api https://api.timescard.cloud]
#
# Env fallbacks: DIST, SITE_URL, PLUTO_API
set -euo pipefail

DIST="${DIST:-}"
SITE_URL="${SITE_URL:-}"
PLUTO_API="${PLUTO_API:-https://api.timescard.cloud}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist) DIST="$2"; shift 2;;
    --url)  SITE_URL="$2"; shift 2;;
    --api)  PLUTO_API="$2"; shift 2;;
    -h|--help)
      sed -n '2,15p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

[[ -n "$DIST" || -n "$SITE_URL" ]] || DIST="dist"

REASONS=()
FAIL=0

scan_dir() {
  local d="$1"
  [[ -d "$d" ]] || { REASONS+=("dist:$d missing"); FAIL=1; return; }
  if grep -RIlq -E 'https?://[a-z0-9-]+\.supabase\.(co|in)' "$d" 2>/dev/null; then
    REASONS+=("supabase-url-in-dist")
    FAIL=1
  fi
  if [[ ! -f "$d/env.js" ]] || ! grep -q 'VITE_PLUTO_URL' "$d/env.js" 2>/dev/null; then
    REASONS+=("env.js-missing-or-empty")
    FAIL=1
  elif grep -q 'pk_anon_REPLACE_ME' "$d/env.js" 2>/dev/null; then
    REASONS+=("env.js-placeholder-anon-key")
    FAIL=1
  fi
}

scan_url() {
  local base="$1" tmp
  tmp="$(mktemp -d)"
  trap "rm -rf $tmp" RETURN
  curl -sSL --max-time 10 "$base/" -o "$tmp/index.html" 2>/dev/null || { REASONS+=("site-unreachable"); FAIL=1; return; }
  mapfile -t ASSETS < <(grep -oE '/assets/[A-Za-z0-9._/-]+\.js' "$tmp/index.html" | sort -u | head -20)
  for a in "${ASSETS[@]}"; do curl -sSL --max-time 10 "$base$a" >> "$tmp/all.js" 2>/dev/null || true; done
  curl -sSL --max-time 5 "$base/env.js" -o "$tmp/env.js" 2>/dev/null || true
  cat "$tmp/index.html" "$tmp/all.js" "$tmp/env.js" > "$tmp/all.txt" 2>/dev/null || true
  if grep -qE 'https?://[a-z0-9-]+\.supabase\.(co|in)' "$tmp/all.txt" 2>/dev/null; then
    REASONS+=("supabase-url-in-live-bundle"); FAIL=1
  fi
  if ! grep -qE 'api\.timescard\.cloud|VITE_PLUTO_URL' "$tmp/all.txt" 2>/dev/null; then
    REASONS+=("pluto-url-missing-in-live-bundle"); FAIL=1
  fi
  if ! grep -qE 'pk_anon_[A-Za-z0-9]+' "$tmp/all.txt" 2>/dev/null; then
    REASONS+=("pluto-anon-key-missing-in-live-bundle"); FAIL=1
  fi
}

[[ -n "$DIST"     ]] && scan_dir "$DIST"
[[ -n "$SITE_URL" ]] && scan_url "$SITE_URL"

# API probes
health="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$PLUTO_API/health" || echo 000)"
[[ "$health" =~ ^2 ]] || { REASONS+=("pluto-health-$health"); FAIL=1; }

settings="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$PLUTO_API/auth/v1/settings" || echo 000)"
[[ "$settings" =~ ^[23] ]] || { REASONS+=("pluto-auth-settings-$settings"); FAIL=1; }

if [[ $FAIL -eq 0 ]]; then
  echo "CUTOVER=OK dist=${DIST:-skip} site=${SITE_URL:-skip} api=$PLUTO_API health=$health settings=$settings"
  exit 0
else
  IFS=,; echo "CUTOVER=FAIL reasons=${REASONS[*]} api=$PLUTO_API health=$health settings=$settings"
  exit 1
fi
