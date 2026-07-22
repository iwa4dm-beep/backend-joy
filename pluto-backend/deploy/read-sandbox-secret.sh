#!/usr/bin/env bash
# read-sandbox-secret.sh
# ---------------------------------------------------------------
# Resolves the sandbox-worker shared secret from the standard
# locations and prints it on stdout. Exits non-zero with a clear
# message when nothing is found or the value is empty.
#
# Sourced by other deploy scripts:
#   SANDBOX_SECRET="$(bash deploy/read-sandbox-secret.sh)" || exit 1
#
# Search order:
#   1. $SANDBOX_SECRET / $SECRET already in env
#   2. /etc/pluto/sandbox-worker.env
#   3. /etc/pluto-sandbox-worker.env
#   4. /etc/default/pluto-sandbox-worker
#   5. /opt/pluto-sandbox-worker/.env
#   6. systemctl show pluto-sandbox-worker -p Environment
#
# Accepts any of these key names (first non-empty wins):
#   SANDBOX_SHARED_SECRET, PLUTO_SANDBOX_WORKER_SECRET,
#   PLUTO_SANDBOX_SECRET, SANDBOX_SECRET, SECRET
set -euo pipefail

KEYS=(SANDBOX_SHARED_SECRET PLUTO_SANDBOX_WORKER_SECRET PLUTO_SANDBOX_SECRET SANDBOX_SECRET SECRET)

_clean() {
  sed -e 's/^[[:space:]]*//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" -e 's/[[:space:]]*$//'
}

# 1) already in env
for k in "${KEYS[@]}"; do
  v="${!k:-}"
  if [ -n "$v" ]; then printf '%s' "$v"; exit 0; fi
done

# 2-5) env files
for envfile in \
  /etc/pluto/sandbox-worker.env \
  /etc/pluto-sandbox-worker.env \
  /etc/default/pluto-sandbox-worker \
  /opt/pluto-sandbox-worker/.env
do
  [ -r "$envfile" ] || continue
  for k in "${KEYS[@]}"; do
    line="$(grep -E "^[[:space:]]*${k}[[:space:]]*=" "$envfile" 2>/dev/null | tail -n1 || true)"
    [ -n "$line" ] || continue
    val="$(printf '%s' "$line" | cut -d= -f2- | _clean)"
    if [ -n "$val" ]; then printf '%s' "$val"; exit 0; fi
  done
done

# 6) systemd Environment=
if command -v systemctl >/dev/null 2>&1; then
  envline="$(systemctl show pluto-sandbox-worker -p Environment 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "$envline" ]; then
    for k in "${KEYS[@]}"; do
      val="$(printf '%s\n' "$envline" | tr ' ' '\n' | grep -E "^${k}=" | tail -n1 | cut -d= -f2- | _clean)"
      if [ -n "$val" ]; then printf '%s' "$val"; exit 0; fi
    done
  fi
fi

cat >&2 <<'ERR'
✗ sandbox secret not found or empty.
  Tried: $SANDBOX_SECRET, $SECRET, /etc/pluto/sandbox-worker.env,
  /etc/pluto-sandbox-worker.env, /etc/default/pluto-sandbox-worker,
  /opt/pluto-sandbox-worker/.env, systemd Environment=.

  Fix:
    sudo bash /opt/pluto/deploy/print-sandbox-secret.sh   # bootstrap/print
    # or export it explicitly:
    export SANDBOX_SECRET='<value>'
ERR
exit 1
