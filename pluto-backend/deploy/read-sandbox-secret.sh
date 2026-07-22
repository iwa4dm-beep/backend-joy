#!/usr/bin/env bash
# read-sandbox-secret.sh
# ---------------------------------------------------------------
# Resolves the sandbox-worker shared secret from the standard/profile
# locations and prints it on stdout. Exits non-zero with a clear
# message when nothing is found or the value is empty.
#
# Sourced by other deploy scripts:
#   SANDBOX_SECRET="$(bash deploy/read-sandbox-secret.sh)" || exit 1
#   SANDBOX_SECRET="$(bash deploy/read-sandbox-secret.sh --profile prod)" || exit 1
#   eval "$(bash deploy/read-sandbox-secret.sh --profile prod --export)"
#
# Search order:
#   1. $SANDBOX_SECRET / $SECRET already in env
#   2. profile files (if --profile/PLUTO_PROFILE is set)
#   3. /etc/pluto/sandbox-worker.env
#   4. /etc/pluto-sandbox-worker.env
#   5. /etc/default/pluto-sandbox-worker
#   6. /opt/pluto-sandbox-worker/.env
#   7. systemctl show pluto-sandbox-worker -p Environment
#
# Accepts any of these key names (first non-empty wins):
#   SANDBOX_SHARED_SECRET, PLUTO_SANDBOX_WORKER_SECRET,
#   PLUTO_SANDBOX_SECRET, SANDBOX_SECRET, SECRET
set -euo pipefail

KEYS=(SANDBOX_SHARED_SECRET PLUTO_SANDBOX_WORKER_SECRET PLUTO_SANDBOX_SECRET SANDBOX_SECRET SECRET)
PROFILE="${PLUTO_PROFILE:-${DEPLOY_PROFILE:-}}"
MODE="value"

usage() {
  sed -n '2,24p' "$0" >&2
  cat >&2 <<'EOF'

Options:
  --profile <dev|staging|prod|name>   Read profile-specific env files first
  --export                            Print shell exports instead of only value
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2;;
    --profile=*) PROFILE="${1#*=}"; shift;;
    --export|--exports|--print-env) MODE="export"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "unknown arg: $1" >&2; usage; exit 2;;
  esac
done

case "$PROFILE" in
  ""|dev|development|staging|stage|prod|production|local|vps) ;;
  *[!A-Za-z0-9_.-]*) echo "invalid profile: $PROFILE" >&2; exit 2;;
esac

_clean() {
  sed -e 's/^[[:space:]]*//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" -e 's/[[:space:]]*$//'
}

_emit() {
  val="$1"
  if [ "$MODE" = "export" ]; then
    q="$(printf '%s' "$val" | sed "s/'/'\\''/g")"
    printf "export SECRET='%s'\n" "$q"
    printf "export SANDBOX_SECRET='%s'\n" "$q"
    printf "export SANDBOX_SHARED_SECRET='%s'\n" "$q"
    [ -n "$PROFILE" ] && printf "export PLUTO_PROFILE='%s'\n" "$PROFILE"
  else
    printf '%s' "$val"
  fi
  exit 0
}

# 1) already in env
for k in "${KEYS[@]}"; do
  v="${!k:-}"
  if [ -n "$v" ]; then _emit "$v"; fi
done

# 2-5) env files
ENVFILES=()
if [ -n "$PROFILE" ]; then
  ENVFILES+=(
    "/etc/pluto/${PROFILE}/sandbox-worker.env"
    "/etc/pluto/sandbox-worker.${PROFILE}.env"
    "/etc/pluto/sandbox-worker-${PROFILE}.env"
    "/etc/default/pluto-sandbox-worker-${PROFILE}"
    "/opt/pluto-${PROFILE}/sandbox-worker.env"
    "/opt/pluto-sandbox-worker/.env.${PROFILE}"
  )
  case "$PROFILE" in
    prod|production)
      ENVFILES+=("/etc/pluto/prod/sandbox-worker.env" "/etc/pluto/production/sandbox-worker.env")
      ;;
    dev|development|local)
      ENVFILES+=("/etc/pluto/dev/sandbox-worker.env" "/etc/pluto/local/sandbox-worker.env")
      ;;
    staging|stage)
      ENVFILES+=("/etc/pluto/staging/sandbox-worker.env" "/etc/pluto/stage/sandbox-worker.env")
      ;;
  esac
fi
ENVFILES+=(
  /etc/pluto/sandbox-worker.env
  /etc/pluto-sandbox-worker.env
  /etc/default/pluto-sandbox-worker
  /opt/pluto-sandbox-worker/.env
)

for envfile in "${ENVFILES[@]}"; do
  [ -r "$envfile" ] || continue
  for k in "${KEYS[@]}"; do
    line="$(grep -E "^[[:space:]]*${k}[[:space:]]*=" "$envfile" 2>/dev/null | tail -n1 || true)"
    [ -n "$line" ] || continue
    val="$(printf '%s' "$line" | cut -d= -f2- | _clean)"
    if [ -n "$val" ]; then _emit "$val"; fi
  done
done

# 6) systemd Environment=
if command -v systemctl >/dev/null 2>&1; then
  envline="$(systemctl show pluto-sandbox-worker -p Environment 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "$envline" ]; then
    for k in "${KEYS[@]}"; do
      val="$(printf '%s\n' "$envline" | tr ' ' '\n' | grep -E "^${k}=" | tail -n1 | cut -d= -f2- | _clean)"
      if [ -n "$val" ]; then _emit "$val"; fi
    done
  fi
fi

cat >&2 <<'ERR'
✗ sandbox secret not found or empty.
  Tried: $SANDBOX_SECRET, $SECRET, profile-specific /etc/pluto/<profile>/sandbox-worker.env,
  /etc/pluto/sandbox-worker.<profile>.env, /etc/pluto/sandbox-worker.env,
  /etc/pluto-sandbox-worker.env, /etc/default/pluto-sandbox-worker,
  /opt/pluto-sandbox-worker/.env, systemd Environment=.

  Fix:
    cd /root/backend-joy && git pull
    sudo bash pluto-backend/deploy/install-deploy-scripts.sh
    sudo bash /opt/pluto/deploy/print-sandbox-secret.sh   # bootstrap/print
    # or export it explicitly:
    export SANDBOX_SECRET='<value>'
ERR
exit 1
