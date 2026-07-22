#!/usr/bin/env bash
# repair-realtime-ws.sh
# -----------------------------------------------------------------------------
# One-shot VPS repair for browser errors like:
#   WebSocket connection to wss://api.timescard.cloud/realtime/v1?... failed: 404
#
# It fixes the two common causes:
#   1) stale Pluto API code only registered /realtime/v1/websocket
#   2) nginx lacks an explicit WebSocket upgrade location for /realtime/v1
#
# Usage on VPS from repo root:
#   sudo bash pluto-backend/deploy/repair-realtime-ws.sh
#
# Optional env:
#   DOMAIN=api.timescard.cloud API_PORT=3000 API_WAIT_SECONDS=90 PLUTO_ANON_KEY=pk_anon_...
set -euo pipefail

DOMAIN="${DOMAIN:-api.timescard.cloud}"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-}"
API_WAIT_SECONDS="${API_WAIT_SECONDS:-90}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROUTE="$ROOT/packages/api/src/routes/realtime.ts"
NGINX_CONF="${NGINX_CONF:-}"
SUDO=""; [ "$(id -u)" != "0" ] && SUDO="sudo"

green() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
blue()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
red()   { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }
die()   { red "$*"; exit 1; }

compose_cmd() {
  $SUDO docker compose --env-file "$ROOT/.env" -f "$ROOT/docker/docker-compose.yml" "$@"
}

detect_api_port() {
  if [ -n "$API_PORT" ]; then return; fi
  API_PORT="3000"
  if [ -f "$ROOT/docker/docker-compose.yml" ] && [ -f "$ROOT/.env" ] && command -v docker >/dev/null 2>&1; then
    local published
    published="$(compose_cmd port api 3000 2>/dev/null | tail -1 || true)"
    if [ -n "$published" ]; then
      API_HOST="${published%:*}"
      API_PORT="${published##*:}"
      [ "$API_HOST" = "0.0.0.0" ] && API_HOST="127.0.0.1"
      [ "$API_HOST" = "[::]" ] && API_HOST="127.0.0.1"
    fi
  fi
}

api_logs_tail() {
  if [ -f "$ROOT/docker/docker-compose.yml" ] && [ -f "$ROOT/.env" ] && command -v docker >/dev/null 2>&1; then
    echo "--- docker compose ps ---" >&2
    compose_cmd ps api >&2 || true
    echo "--- docker compose logs api (last 80 lines) ---" >&2
    compose_cmd logs --tail=80 api >&2 || true
  fi
}

nginx_logs_tail() {
  echo "--- nginx error log (last realtime/upstream lines) ---" >&2
  if [ -f /var/log/nginx/error.log ]; then
    $SUDO sh -c "grep -Ei 'realtime|upstream|connect\(\)|bad gateway|websocket' /var/log/nginx/error.log | tail -40" >&2 || true
  fi
  $SUDO journalctl -u nginx --no-pager -n 40 >&2 2>/dev/null || true
}

find_nginx_conf() {
  if [ -n "$NGINX_CONF" ] && [ -f "$NGINX_CONF" ]; then printf '%s' "$NGINX_CONF"; return; fi
  for c in \
    "/etc/nginx/sites-enabled/${DOMAIN}.conf" \
    "/etc/nginx/sites-available/${DOMAIN}.conf" \
    "/etc/nginx/conf.d/${DOMAIN}.conf"; do
    [ -f "$c" ] && { printf '%s' "$c"; return; }
  done
}

patch_realtime_route() {
  [ -f "$ROUTE" ] || die "realtime route not found: $ROUTE"
  blue "patch API realtime route"
  cp -a "$ROUTE" "${ROUTE}.bak.$(date +%s)"
  python3 - "$ROUTE" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path, 'r', encoding='utf-8').read()

changed = False

# Old deployments often had only /realtime/v1/websocket. Register both the
# Supabase-style base path and explicit websocket path.
if "app.get('/realtime/v1', { websocket: true }, websocketHandler);" not in text:
    text = text.replace(
        "app.get('/realtime/v1/websocket', { websocket: true }, websocketHandler);",
        "// Support both Supabase-style /realtime/v1 and explicit /realtime/v1/websocket.\n"
        "  app.get('/realtime/v1', { websocket: true }, websocketHandler);\n"
        "  app.get('/realtime/v1/websocket', { websocket: true }, websocketHandler);",
    )
    changed = True

# Ensure clients that pass ?channel=<topic> are attached immediately after the
# handshake, matching the currently deployed frontend SDK behavior.
if "url.searchParams.get('channel')" not in text:
    text = text.replace(
        "send({ type: 'connected', connId, role, userId });",
        "send({ type: 'connected', connId, role, userId });\n"
        "    const initialChannel = url.searchParams.get('channel');\n"
        "    if (initialChannel) addSubscription(initialChannel, { broadcast: { self: true } }, 'query');",
    )
    changed = True

open(path, 'w', encoding='utf-8').write(text)
print('patched' if changed else 'already-current')
PY
}

patch_nginx() {
  local conf
  conf="$(find_nginx_conf || true)"
  [ -n "$conf" ] || die "nginx vhost not found for $DOMAIN; set NGINX_CONF=/path/to/${DOMAIN}.conf"
  blue "patch nginx websocket location: $conf"
  $SUDO cp -a "$conf" "${conf}.bak.$(date +%s)"
  $SUDO python3 - "$conf" "$API_PORT" <<'PY'
import os, re, sys, tempfile
path, port = sys.argv[1], sys.argv[2]
text = open(path, 'r', encoding='utf-8').read()

block = f'''
    # Pluto realtime WebSocket compatibility (/realtime/v1 and /realtime/v1/websocket)
    location ^~ /realtime/v1 {{
        proxy_pass         http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
        proxy_buffering     off;
    }}
'''

if 'location ^~ /realtime/v1' in text:
    text = re.sub(r'\n\s*# Pluto realtime WebSocket compatibility.*?\n\s*location \^~ /realtime/v1 \{.*?\n\s*\}', '\n' + block.rstrip(), text, flags=re.S)
else:
    m = re.search(r'\n\s*location\s+/\s*\{', text)
    if not m:
        raise SystemExit('could not find generic location / block')
    text = text[:m.start()] + '\n' + block + text[m.start():]

fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write(text)
os.replace(tmp, path)
print('nginx-patched')
PY
  $SUDO nginx -t
  $SUDO systemctl reload nginx
  green "nginx reloaded"
}

restart_api() {
  blue "restart/rebuild Pluto API"
  if [ -f "$ROOT/docker/docker-compose.yml" ] && command -v docker >/dev/null 2>&1; then
    if [ -f "$ROOT/.env" ]; then
      compose_cmd build api
      compose_cmd up -d api
      detect_api_port
      green "docker api rebuilt + restarted"
      return
    fi
  fi
  if command -v systemctl >/dev/null 2>&1; then
    unit="$(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -Ei 'pluto(-|_)?api' | head -1 || true)"
    if [ -n "$unit" ]; then
      $SUDO systemctl restart "$unit"
      green "systemd restarted: $unit"
      return
    fi
  fi
  if command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -qi pluto; then
    name="$(pm2 jlist | python3 -c 'import sys,json; print(next((p["name"] for p in json.load(sys.stdin) if "pluto" in p["name"].lower()), ""))' 2>/dev/null || true)"
    [ -n "$name" ] && { pm2 restart "$name"; green "pm2 restarted: $name"; return; }
  fi
  die "could not restart API automatically; run deploy/detect-pluto-api.sh --restart"
}

wait_api_ready() {
  detect_api_port
  blue "wait for local Pluto API on http://${API_HOST}:${API_PORT}"
  local deadline=$(( $(date +%s) + API_WAIT_SECONDS )) code path
  while [ "$(date +%s)" -lt "$deadline" ]; do
    for path in /livez /readyz /healthz /v1/health; do
      code="$(curl -s -o /tmp/pluto-api-ready.$$ -w '%{http_code}' --max-time 3 "http://${API_HOST}:${API_PORT}${path}" || echo 000)"
      rm -f /tmp/pluto-api-ready.$$
      if [[ "$code" =~ ^2 ]]; then
        green "local API ready (${path} → ${code})"
        return 0
      fi
    done
    sleep 2
  done
  red "local API did not become ready on http://${API_HOST}:${API_PORT} within ${API_WAIT_SECONDS}s"
  api_logs_tail
  exit 1
}

normalise_smoke_key() {
  local key="${PLUTO_ANON_KEY:-smoke_key}"
  case "$key" in
    pk_anon_xxx|pk_anon_XXX|pk_xxx|pk_XXX|REPLACE_ME|CHANGE_ME|YOUR_KEY|YOUR_ANON_KEY) key="smoke_key";;
  esac
  printf '%s' "$key"
}

probe_ws_url() {
  local url="$1" headers ws_key code
  headers="$(mktemp)"
  ws_key="$(openssl rand -base64 16 2>/dev/null || date +%s | sha256sum | awk '{print $1}')"
  curl -sS -D "$headers" -o /dev/null --http1.1 --max-time 8 \
    -H 'Connection: Upgrade' \
    -H 'Upgrade: websocket' \
    -H "Sec-WebSocket-Key: $ws_key" \
    -H 'Sec-WebSocket-Version: 13' \
    "$url" >/dev/null 2>&1 || true
  code="$(awk 'toupper($0) ~ /^HTTP\// {print $2}' "$headers" | tail -1)"
  cat "$headers" | sed -n '1,8p'
  rm -f "$headers"
  [ "$code" = "101" ]
}

verify_ws() {
  blue "verify realtime websocket handshake"
  local key local_url public_url
  key="$(normalise_smoke_key)"
  local_url="http://${API_HOST}:${API_PORT}/realtime/v1?apikey=${key}&channel=home-content-all"
  public_url="https://${DOMAIN}/realtime/v1?apikey=${key}&channel=home-content-all"

  blue "local WS probe: ${local_url%%\?*}?apikey=***&channel=home-content-all"
  if ! probe_ws_url "$local_url"; then
    red "local WebSocket handshake failed — API route/container is the problem, not nginx"
    api_logs_tail
    exit 1
  fi
  green "local WebSocket handshake OK (101)"

  blue "public WS probe: https://${DOMAIN}/realtime/v1?apikey=***&channel=home-content-all"
  if ! probe_ws_url "$public_url"; then
    red "public WebSocket handshake failed — nginx/proxy path is the problem"
    nginx_logs_tail
    exit 1
  fi
  green "WebSocket handshake OK (101)"
}

patch_realtime_route
restart_api
wait_api_ready
patch_nginx
verify_ws

green "realtime repair completed for https://${DOMAIN}/realtime/v1"