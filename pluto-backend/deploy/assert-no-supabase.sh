#!/usr/bin/env bash
# assert-no-supabase.sh
# ---------------------------------------------------------------
# Fails (exit 1) if any file under dist/ still references
# supabase.co / supabase.in — including dns-prefetch/preconnect
# links in index.html and service-worker precache manifests.
#
# Usage:
#   bash pluto-backend/deploy/assert-no-supabase.sh [dist_dir]
set -euo pipefail

DIST="${1:-dist}"
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
pass() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

[[ -d "$DIST" ]] || die "dist dir not found: $DIST"

FAIL=0

# 1) supabase.co / supabase.in URLs anywhere
mapfile -t URL_HITS < <(grep -RIln -E 'https?://[a-z0-9-]+\.supabase\.(co|in)' "$DIST" 2>/dev/null || true)
if [[ ${#URL_HITS[@]} -gt 0 ]]; then
  warn "Supabase URLs still present in $DIST:"
  for f in "${URL_HITS[@]}"; do
    printf '   %s\n' "$f" >&2
    grep -oE 'https?://[a-z0-9-]+\.supabase\.(co|in)[^"'"'"' <>]*' "$f" 2>/dev/null | sort -u | sed 's/^/     → /' >&2
  done
  FAIL=1
fi

# 2) dns-prefetch / preconnect hints pointing at supabase
if grep -RIln -E '<link[^>]*rel=["'"'"'](dns-prefetch|preconnect)["'"'"'][^>]*supabase\.(co|in)' "$DIST" 2>/dev/null; then
  warn "Preconnect/dns-prefetch hints for Supabase still in HTML."
  FAIL=1
fi

# 3) leftover anon JWT literals (safety net)
if grep -RIln -E '"eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_.-]{20,}"' "$DIST" 2>/dev/null; then
  warn "Hardcoded Supabase-style anon JWT still in $DIST."
  FAIL=1
fi

if [[ $FAIL -ne 0 ]]; then
  die "cutover guard FAILED — bundle still contains Supabase references. Re-run migrate-frontend-to-pluto.sh, rebuild, and try again."
fi

pass "no Supabase references found in $DIST"
