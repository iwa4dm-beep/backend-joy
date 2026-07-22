#!/usr/bin/env bash
# install-deploy-scripts.sh
# -----------------------------------------------------------------------------
# Mirrors the current repo's deploy helpers to /opt/pluto/deploy so VPS commands
# like `bash /opt/pluto/deploy/build-and-cutover.sh ...` keep working after a
# fresh git pull, without requiring a full worker reinstall.
# -----------------------------------------------------------------------------
set -euo pipefail

DEST="${DEST:-/opt/pluto/deploy}"
HERE="$(cd -P "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
pass() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
info() { printf '\033[1;36m→ %s\033[0m\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || die "run as root: sudo bash deploy/install-deploy-scripts.sh"
[[ -f "$HERE/build-and-cutover.sh" ]] || die "run this from the current pluto-backend/deploy checkout"

info "Installing deploy scripts → $DEST"
install -d -m 0755 "$DEST"
cp -a "$HERE"/. "$DEST"/
find "$DEST" -maxdepth 2 -type f -name '*.sh' -exec chmod 0755 {} +

pass "deploy scripts installed"
echo "Run: bash $DEST/build-and-cutover.sh <project-dir>"