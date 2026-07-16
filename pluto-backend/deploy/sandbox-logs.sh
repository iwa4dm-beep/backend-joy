#!/usr/bin/env bash
# Convenience wrapper around `journalctl` for pluto services.
#
# Subcommands:
#   tail            follow all pluto services (default)
#   worker          follow only the detected sandbox worker unit
#   api             follow only the detected Pluto API unit
#   errors          show last hour of errors from all pluto services
#   since <spec>    e.g. `since "10 min ago"` or `since 2026-07-16`
#   grep <pattern>  filter recent logs by regex
#   health          curl worker /healthz with pretty output
#
# Examples:
#   bash deploy/sandbox-logs.sh              # follow everything
#   bash deploy/sandbox-logs.sh worker
#   bash deploy/sandbox-logs.sh errors
#   bash deploy/sandbox-logs.sh since "30 min ago"
#   bash deploy/sandbox-logs.sh grep "unpack"
#   bash deploy/sandbox-logs.sh health

set -uo pipefail
SUDO=""; [ "$(id -u)" != "0" ] && SUDO="sudo"

unit_exists() { $SUDO systemctl list-unit-files "$1.service" >/dev/null 2>&1 || $SUDO systemctl status "$1.service" >/dev/null 2>&1; }

WORKER_UNIT="pluto-sandbox-worker"
unit_exists "$WORKER_UNIT" || WORKER_UNIT="pluto-sandbox"

API_UNIT="pluto-api"
unit_exists "$API_UNIT" || API_UNIT="pluto-backend"

UNITS=()
unit_exists "$WORKER_UNIT" && UNITS+=("$WORKER_UNIT")
unit_exists "$API_UNIT" && UNITS+=("$API_UNIT")
[ ${#UNITS[@]} -eq 0 ] && UNITS=(pluto-sandbox-worker pluto-api)
UNIT_ARGS=(); for u in "${UNITS[@]}"; do UNIT_ARGS+=(-u "$u"); done

cmd="${1:-tail}"; shift || true

case "$cmd" in
  tail|"")
    $SUDO journalctl "${UNIT_ARGS[@]}" -f -n 200 --output=short-iso
    ;;
  worker)
    $SUDO journalctl -u "$WORKER_UNIT" -f -n 200 --output=short-iso
    ;;
  api)
    $SUDO journalctl -u "$API_UNIT" -f -n 200 --output=short-iso
    ;;
  errors)
    $SUDO journalctl "${UNIT_ARGS[@]}" --since "1 hour ago" -p err --no-pager
    ;;
  since)
    spec="${1:?Usage: sandbox-logs.sh since \"10 min ago\"}"
    $SUDO journalctl "${UNIT_ARGS[@]}" --since "$spec" --no-pager --output=short-iso
    ;;
  grep)
    pat="${1:?Usage: sandbox-logs.sh grep <pattern>}"
    $SUDO journalctl "${UNIT_ARGS[@]}" --since "1 hour ago" --no-pager --output=short-iso \
      | grep -Ei --color=always "$pat"
    ;;
  health)
    port="${SANDBOX_WORKER_PORT:-8787}"
    echo "▶ GET http://127.0.0.1:${port}/healthz"
    if command -v jq >/dev/null 2>&1; then
      curl -sS "http://127.0.0.1:${port}/healthz" | jq .
    else
      curl -sS "http://127.0.0.1:${port}/healthz"
      echo
    fi
    ;;
  *)
    sed -n '2,20p' "$0"; exit 2 ;;
esac
