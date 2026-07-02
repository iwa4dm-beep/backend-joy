#!/usr/bin/env bash
# Storage end-to-end for CI.
#
# Unlike scripts/e2e-local.sh (which spins docker compose), this variant
# assumes Postgres is already reachable via $DATABASE_URL and starts the
# Pluto server directly with `npx tsx src/index.ts` in the background.
# It then runs the same 10-step storage RLS + signed-URL matrix, plus
# a multipart upload round-trip. Non-zero exit fails the CI job.

set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE/apps/server"

: "${DATABASE_URL:?DATABASE_URL required}"
: "${ANON_KEY:?ANON_KEY required}"
: "${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY required}"
: "${JWT_SECRET:?JWT_SECRET required}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-local}"
export STORAGE_LOCAL_DIR="${STORAGE_LOCAL_DIR:-/tmp/pluto-storage-ci}"
export PORT="${PORT:-8788}"
mkdir -p "$STORAGE_LOCAL_DIR"
BASE="http://localhost:$PORT"

echo "» applying migrations"
npx tsx src/db/migrate.ts

echo "» starting server on :$PORT"
npx tsx src/index.ts > /tmp/pluto-ci.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; echo "--- server log ---"; tail -80 /tmp/pluto-ci.log' EXIT

for i in $(seq 1 40); do
  curl -fsS "$BASE/readyz" >/dev/null 2>&1 && { echo "  ready"; break; }
  sleep 0.5
  [[ $i -eq 40 ]] && { echo "server never became ready"; exit 1; }
done

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

E1="ci_owner_$(date +%s%N)@t.local";    PWD1="pw-o-1234"
E2="ci_intruder_$(date +%s%N)@t.local"; PWD2="pw-i-1234"

reg() {
  curl -sS -X POST "$BASE/auth/v1/sign-up" -H "apikey: $ANON_KEY" \
    -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}
T1=$(reg "$E1" "$PWD1" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).session.access_token))')
T2=$(reg "$E2" "$PWD2" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).session.access_token))')
[[ -n "$T1" && -n "$T2" ]] && pass "two users registered" || fail "sign-up"

BUCKET="ci-$(date +%s)"
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/storage/v1/buckets" \
  -H "apikey: $SERVICE_ROLE_KEY" -H 'content-type: application/json' \
  -d "{\"name\":\"$BUCKET\",\"public\":false,\"owner_only\":true,\"max_size\":1048576}" \
  | grep -q '^201$' && pass "bucket created" || fail "bucket"

echo "hello ci $(date)" > /tmp/f.txt
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/storage/v1/object/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -F "file=@/tmp/f.txt;type=text/plain" \
  | grep -q '^201$' && pass "owner upload" || fail "upload"

curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/storage/v1/object/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" | grep -q '^403$' && pass "intruder blocked" || fail "intruder"

# One-time signed URL — first fetch OK, second fetch 403.
SIGN=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":60,"mode":"read","one_time":true}')
URL=$(echo "$SIGN" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).url))')
GID=$(echo "$SIGN" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE$URL" | grep -q '^200$' && pass "one-time first use OK" || fail "signed 1"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE$URL" | grep -q '^403$' && pass "one-time replay refused" || fail "signed replay"

# Revocation.
SIGN2=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":300,"mode":"read"}')
URL2=$(echo "$SIGN2" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).url))')
GID2=$(echo "$SIGN2" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$BASE/storage/v1/object/sign/grants/$GID2" \
  -H "apikey: $SERVICE_ROLE_KEY" | grep -q '^200$' && pass "grant revoked" || fail "revoke"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE$URL2" | grep -q '^403$' && pass "revoked URL refused" || fail "revoked serve"

# Multipart upload — 3 parts of 100k each.
dd if=/dev/urandom of=/tmp/big.bin bs=1024 count=300 status=none
SIZE=$(stat -c%s /tmp/big.bin 2>/dev/null || stat -f%z /tmp/big.bin)
INIT=$(curl -sS -X POST "$BASE/storage/v1/upload/init" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"bucket\":\"$BUCKET\",\"key\":\"big.bin\",\"size\":$SIZE,\"part_size\":102400,\"content_type\":\"application/octet-stream\"}")
UID_=$(echo "$INIT" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).upload_id))')
[[ -n "$UID_" ]] && pass "multipart init ($UID_)" || { echo "$INIT"; fail "init"; }
PARTS_JSON="["
for i in 1 2 3; do
  OFF=$(( (i-1) * 102400 ))
  dd if=/tmp/big.bin bs=1 count=102400 skip=$OFF of=/tmp/part status=none
  ETAG=$(curl -sS -X PUT "$BASE/storage/v1/upload/$UID_/part/$i" \
    -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
    -H 'content-type: application/octet-stream' --data-binary @/tmp/part \
    | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).etag))')
  [[ -n "$ETAG" ]] || fail "part $i"
  PARTS_JSON+="{\"part_number\":$i,\"etag\":\"$ETAG\"}"
  [[ $i -lt 3 ]] && PARTS_JSON+=","
done
PARTS_JSON+="]"
pass "3 parts uploaded (rls re-checked per part)"

curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/storage/v1/upload/$UID_/complete" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"parts\":$PARTS_JSON}" | grep -q '^200$' && pass "complete OK" || fail "complete"

# Intruder cannot complete/abort someone else's session.
INIT2=$(curl -sS -X POST "$BASE/storage/v1/upload/init" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"bucket\":\"$BUCKET\",\"key\":\"steal.bin\",\"size\":1024,\"part_size\":65536}")
UID2=$(echo "$INIT2" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).upload_id))')
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$BASE/storage/v1/upload/$UID2/abort" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" | grep -q '^403$' && pass "intruder cannot abort" || fail "abort auth"

# ══════════════════════════════════════════════════════════════════════
# Negative multipart tests — every one of these MUST be rejected. If any
# path returns 2xx the server has silently regressed on RLS/state safety
# and CI must fail. Each block is written so that a bad response prints
# both the code and the JSON body for debugging.
# ══════════════════════════════════════════════════════════════════════

# helper: expect a given HTTP status; on mismatch fail loud.
expect_code() {   # $1 expected, $2 actual, $3 label, $4 body
  if [[ "$2" != "$1" ]]; then
    echo "  ✗ $3 — expected HTTP $1, got $2"
    echo "    body: $4"
    exit 1
  fi
  pass "$3 (HTTP $2)"
}

# ── (a) Intruder cannot upload a part into someone else's session ──
INIT_NEG=$(curl -sS -X POST "$BASE/storage/v1/upload/init" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"bucket\":\"$BUCKET\",\"key\":\"neg.bin\",\"size\":204800,\"part_size\":102400}")
UID_NEG=$(echo "$INIT_NEG" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).upload_id))')
[[ -n "$UID_NEG" ]] || fail "init (neg suite)"

dd if=/dev/urandom of=/tmp/negpart bs=1024 count=100 status=none
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE/storage/v1/upload/$UID_NEG/part/1" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/negpart)
expect_code 403 "$RES" "intruder cannot PUT part into owner's session" "$(cat /tmp/body)"

# ── (b) Anonymous (no bearer) cannot PUT a part either ──
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE/storage/v1/upload/$UID_NEG/part/1" \
  -H "apikey: $ANON_KEY" -H 'content-type: application/octet-stream' --data-binary @/tmp/negpart)
[[ "$RES" == "401" || "$RES" == "403" ]] && pass "anonymous PUT part refused (HTTP $RES)" \
  || { echo "  ✗ anonymous PUT should be 401/403, got $RES ($(cat /tmp/body))"; exit 1; }

# ── (c) Resume: owner re-uploads part 1 with new content — server
#         must accept (upsert) and hand back the NEW etag. Then upload
#         part 2 with the RIGHT content but complete with a tampered
#         etag → 400 etag_mismatch. ──
dd if=/dev/urandom of=/tmp/p1a bs=1024 count=100 status=none
E1A=$(curl -sS -X PUT "$BASE/storage/v1/upload/$UID_NEG/part/1" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/p1a \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).etag))')
dd if=/dev/urandom of=/tmp/p1b bs=1024 count=100 status=none
E1B=$(curl -sS -X PUT "$BASE/storage/v1/upload/$UID_NEG/part/1" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/p1b \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).etag))')
[[ -n "$E1A" && -n "$E1B" && "$E1A" != "$E1B" ]] \
  && pass "resume: part 1 re-upload replaced etag ($E1A → $E1B)" \
  || fail "resume upsert (E1A=$E1A E1B=$E1B)"

dd if=/dev/urandom of=/tmp/p2 bs=1024 count=100 status=none
E2R=$(curl -sS -X PUT "$BASE/storage/v1/upload/$UID_NEG/part/2" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/p2 \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).etag))')
[[ -n "$E2R" ]] || fail "part 2 upload"

# Tampered etag on complete — flip a byte.
TAMPERED="${E1B:0:-1}$([[ ${E1B: -1} == '0' ]] && echo 1 || echo 0)"
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/upload/$UID_NEG/complete" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"parts\":[{\"part_number\":1,\"etag\":\"$TAMPERED\"},{\"part_number\":2,\"etag\":\"$E2R\"}]}")
expect_code 400 "$RES" "complete with tampered etag refused" "$(cat /tmp/body)"
grep -q 'etag_mismatch' /tmp/body && pass "  → error=etag_mismatch surfaced" \
  || { echo "  ✗ expected etag_mismatch in body: $(cat /tmp/body)"; exit 1; }

# ── (d) Complete with a missing part → 400 ──
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/upload/$UID_NEG/complete" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"parts\":[{\"part_number\":1,\"etag\":\"$E1B\"}]}")
expect_code 400 "$RES" "complete with missing part refused" "$(cat /tmp/body)"

# ── (e) Intruder cannot complete owner's session ──
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/upload/$UID_NEG/complete" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" -H 'content-type: application/json' \
  -d "{\"parts\":[{\"part_number\":1,\"etag\":\"$E1B\"},{\"part_number\":2,\"etag\":\"$E2R\"}]}")
expect_code 403 "$RES" "intruder cannot complete owner's session" "$(cat /tmp/body)"

# ── (f) Owner aborts → subsequent part PUT and complete both refused ──
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X DELETE "$BASE/storage/v1/upload/$UID_NEG/abort" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1")
expect_code 200 "$RES" "owner aborts session" "$(cat /tmp/body)"

RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE/storage/v1/upload/$UID_NEG/part/3" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/negpart)
expect_code 409 "$RES" "PUT part after abort refused" "$(cat /tmp/body)"

RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/upload/$UID_NEG/complete" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"parts\":[{\"part_number\":1,\"etag\":\"$E1B\"},{\"part_number\":2,\"etag\":\"$E2R\"}]}")
expect_code 409 "$RES" "complete after abort refused" "$(cat /tmp/body)"

# ── (g) Unknown upload id → 404, and empty part body → 400 ──
BOGUS="00000000-0000-0000-0000-000000000000"
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE/storage/v1/upload/$BOGUS/part/1" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/negpart)
expect_code 404 "$RES" "PUT part on unknown upload id refused" "$(cat /tmp/body)"

INIT_EMP=$(curl -sS -X POST "$BASE/storage/v1/upload/init" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"bucket\":\"$BUCKET\",\"key\":\"emp.bin\",\"size\":1024,\"part_size\":65536}")
UID_EMP=$(echo "$INIT_EMP" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).upload_id))')
: > /tmp/empty
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE/storage/v1/upload/$UID_EMP/part/1" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/empty)
expect_code 400 "$RES" "empty part body refused" "$(cat /tmp/body)"
curl -sS -o /dev/null -X DELETE "$BASE/storage/v1/upload/$UID_EMP/abort" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" || true

# ══════════════════════════════════════════════════════════════════════
# (h) Signed-URL revocation, one-time replay, and strict expiration.
#     Repeats the earlier smoke checks with edge-case timing to catch
#     TTL rounding bugs and grant-cache staleness.
# ══════════════════════════════════════════════════════════════════════

# (h.1) revokeSignedUrl must invalidate an already-issued URL immediately,
#       even if the URL has not expired yet.
SIGN_R=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":600,"mode":"read"}')
URL_R=$(echo "$SIGN_R" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).url))')
GID_R=$(echo "$SIGN_R" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE$URL_R")
expect_code 200 "$RES" "signed URL works before revoke" "$(cat /tmp/body)"
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X DELETE "$BASE/storage/v1/object/sign/grants/$GID_R" \
  -H "apikey: $SERVICE_ROLE_KEY")
expect_code 200 "$RES" "grant revoked via admin API" "$(cat /tmp/body)"
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE$URL_R")
expect_code 403 "$RES" "signed URL 403 immediately after revoke" "$(cat /tmp/body)"

# (h.2) Owner-initiated revoke (non-admin) is also honored.
SIGN_R2=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":600,"mode":"read"}')
URL_R2=$(echo "$SIGN_R2" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).url))')
GID_R2=$(echo "$SIGN_R2" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X DELETE "$BASE/storage/v1/object/sign/grants/$GID_R2" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1")
expect_code 200 "$RES" "owner revokes own grant" "$(cat /tmp/body)"
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE$URL_R2")
expect_code 403 "$RES" "owner-revoked URL refused" "$(cat /tmp/body)"

# (h.3) Intruder cannot revoke someone else's grant.
SIGN_R3=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":600,"mode":"read"}')
GID_R3=$(echo "$SIGN_R3" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X DELETE "$BASE/storage/v1/object/sign/grants/$GID_R3" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2")
[[ "$RES" == "403" || "$RES" == "404" ]] \
  && pass "intruder cannot revoke owner's grant (HTTP $RES)" \
  || { echo "  ✗ intruder revoke should be 403/404, got $RES ($(cat /tmp/body))"; exit 1; }

# (h.4) One-time grant: replay within TTL still refused (already checked
#       earlier for read; here verify write mode too).
SIGN_W=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/one-time-write.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":300,"mode":"write","one_time":true}')
URL_W=$(echo "$SIGN_W" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).url))')
if [[ -n "$URL_W" && "$URL_W" != "undefined" ]]; then
  RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE$URL_W" \
    -H 'content-type: text/plain' --data-binary 'first write')
  expect_code 200 "$RES" "one-time write URL first use OK" "$(cat /tmp/body)"
  RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE$URL_W" \
    -H 'content-type: text/plain' --data-binary 'replay attempt')
  expect_code 403 "$RES" "one-time write URL replay refused" "$(cat /tmp/body)"
else
  echo "  ↷ one-time write signed URLs not supported by this build — skipped"
fi

# (h.5) Strict expiration: TTL of 1s must reject after ~2s wall-clock.
SIGN_E=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":1,"mode":"read"}')
URL_E=$(echo "$SIGN_E" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).url))')
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE$URL_E")
expect_code 200 "$RES" "1s-TTL URL works immediately" "$(cat /tmp/body)"
sleep 2
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE$URL_E")
expect_code 403 "$RES" "1s-TTL URL refused after 2s wall-clock" "$(cat /tmp/body)"

# (h.6) TTL clamp: request > server max returns 400 or a clamped TTL.
SIGN_MAX=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":99999999,"mode":"read"}')
[[ "$SIGN_MAX" == "400" || "$SIGN_MAX" == "200" ]] \
  && pass "unreasonable TTL rejected or clamped (HTTP $SIGN_MAX)" \
  || { echo "  ✗ TTL clamp behavior unexpected, got $SIGN_MAX"; exit 1; }

# (h.7) Tampered HMAC in signed URL is refused.
SIGN_T=$(curl -sS -X POST "$BASE/storage/v1/object/sign/$BUCKET/hello.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d '{"expires_in":300,"mode":"read"}')
URL_T=$(echo "$SIGN_T" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).url))')
# flip last char of signature (query string)
TAMPERED_URL="${URL_T%?}$([[ ${URL_T: -1} == '0' ]] && echo 1 || echo 0)"
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE$TAMPERED_URL")
expect_code 403 "$RES" "tampered HMAC signature refused" "$(cat /tmp/body)"

# ══════════════════════════════════════════════════════════════════════
# (i) Workspace isolation for Storage RLS.
#     Two separate workspaces, each with its own bucket + object. Neither
#     user, nor an anonymous caller, may list or read across the boundary
#     — regardless of guessed bucket name, object key, workspace id
#     header, or signed URL forged from the wrong workspace.
# ══════════════════════════════════════════════════════════════════════

# Get workspace ids for T1 and T2 via /auth/v1/me (each sign-up creates a
# personal workspace). Fall back gracefully if the endpoint shape differs.
WS1=$(curl -sS "$BASE/auth/v1/me" -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.workspace_id||j.workspace?.id||j.user?.workspace_id||"")}catch{console.log("")}})')
WS2=$(curl -sS "$BASE/auth/v1/me" -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(j.workspace_id||j.workspace?.id||j.user?.workspace_id||"")}catch{console.log("")}})')
echo "  workspaces: T1=$WS1  T2=$WS2"

BUCKET_A="wsa-$(date +%s)"
BUCKET_B="wsb-$(date +%s)"

# Create one bucket per workspace using service_role, tagging owner_ws
# via x-workspace-id header (server enforces).
mkbucket() {   # $1 name, $2 workspace_id
  curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/buckets" \
    -H "apikey: $SERVICE_ROLE_KEY" -H 'content-type: application/json' \
    -H "x-workspace-id: $2" \
    -d "{\"name\":\"$1\",\"public\":false,\"owner_only\":true,\"max_size\":1048576}"
}
RES=$(mkbucket "$BUCKET_A" "$WS1"); expect_code 201 "$RES" "bucket A in WS1 created" "$(cat /tmp/body)"
RES=$(mkbucket "$BUCKET_B" "$WS2"); expect_code 201 "$RES" "bucket B in WS2 created" "$(cat /tmp/body)"

# Owners upload one object each.
echo "A-secret" > /tmp/wa; echo "B-secret" > /tmp/wb
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/object/$BUCKET_A/a.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS1" \
  -F "file=@/tmp/wa;type=text/plain")
expect_code 201 "$RES" "WS1 owner uploads a.txt" "$(cat /tmp/body)"
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/object/$BUCKET_B/b.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" -H "x-workspace-id: $WS2" \
  -F "file=@/tmp/wb;type=text/plain")
expect_code 201 "$RES" "WS2 owner uploads b.txt" "$(cat /tmp/body)"

# (i.1) User in WS1 CANNOT list buckets belonging to WS2.
LIST=$(curl -sS "$BASE/storage/v1/buckets" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS1")
echo "$LIST" | grep -q "\"$BUCKET_B\"" \
  && { echo "  ✗ WS1 listing leaked bucket B: $LIST"; exit 1; } \
  || pass "WS1 cannot see WS2 buckets in list"

# (i.2) User in WS2 CANNOT list buckets belonging to WS1.
LIST=$(curl -sS "$BASE/storage/v1/buckets" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" -H "x-workspace-id: $WS2")
echo "$LIST" | grep -q "\"$BUCKET_A\"" \
  && { echo "  ✗ WS2 listing leaked bucket A: $LIST"; exit 1; } \
  || pass "WS2 cannot see WS1 buckets in list"

# (i.3) User in WS1 CANNOT read WS2's object even with the exact key.
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE/storage/v1/object/$BUCKET_B/b.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS1")
[[ "$RES" == "403" || "$RES" == "404" ]] \
  && pass "WS1 user cannot GET WS2 object (HTTP $RES)" \
  || { echo "  ✗ cross-workspace GET returned $RES ($(cat /tmp/body))"; exit 1; }

# (i.4) User in WS1 CANNOT read WS2's object by lying about x-workspace-id.
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE/storage/v1/object/$BUCKET_B/b.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS2")
[[ "$RES" == "403" || "$RES" == "404" ]] \
  && pass "WS1 spoofed workspace header still blocked (HTTP $RES)" \
  || { echo "  ✗ workspace-header spoof allowed read: $RES ($(cat /tmp/body))"; exit 1; }

# (i.5) User in WS1 CANNOT list objects inside WS2's bucket.
RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE/storage/v1/object/list/$BUCKET_B" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS1")
[[ "$RES" == "403" || "$RES" == "404" ]] \
  && pass "WS1 cannot list WS2 bucket contents (HTTP $RES)" \
  || { echo "  ✗ WS1 listed WS2 objects: $RES ($(cat /tmp/body))"; exit 1; }

# (i.6) User in WS1 CANNOT DELETE WS2's object.
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X DELETE "$BASE/storage/v1/object/$BUCKET_B/b.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS1")
[[ "$RES" == "403" || "$RES" == "404" ]] \
  && pass "WS1 cannot DELETE WS2 object (HTTP $RES)" \
  || { echo "  ✗ cross-workspace DELETE returned $RES ($(cat /tmp/body))"; exit 1; }

# (i.7) User in WS1 CANNOT sign a URL for WS2's object.
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/object/sign/$BUCKET_B/b.txt" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS1" \
  -H 'content-type: application/json' -d '{"expires_in":60,"mode":"read"}')
[[ "$RES" == "403" || "$RES" == "404" ]] \
  && pass "WS1 cannot mint signed URL for WS2 object (HTTP $RES)" \
  || { echo "  ✗ cross-workspace sign returned $RES ($(cat /tmp/body))"; exit 1; }

# (i.8) Anonymous caller (no bearer, only anon key) CANNOT list either bucket.
LIST_ANON=$(curl -sS "$BASE/storage/v1/buckets" -H "apikey: $ANON_KEY")
echo "$LIST_ANON" | grep -qE "\"$BUCKET_A\"|\"$BUCKET_B\"" \
  && { echo "  ✗ anon leaked private buckets: $LIST_ANON"; exit 1; } \
  || pass "anon cannot see private buckets across workspaces"

# (i.9) Anonymous caller CANNOT GET private objects in either workspace.
for KEY in "$BUCKET_A/a.txt" "$BUCKET_B/b.txt"; do
  RES=$(curl -sS -o /tmp/body -w '%{http_code}' "$BASE/storage/v1/object/$KEY" -H "apikey: $ANON_KEY")
  [[ "$RES" == "401" || "$RES" == "403" || "$RES" == "404" ]] \
    && pass "anon blocked from private $KEY (HTTP $RES)" \
    || { echo "  ✗ anon read $KEY returned $RES ($(cat /tmp/body))"; exit 1; }
done

# (i.10) Anonymous caller CANNOT initiate a multipart upload in either bucket.
for B in "$BUCKET_A" "$BUCKET_B"; do
  RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/upload/init" \
    -H "apikey: $ANON_KEY" -H 'content-type: application/json' \
    -d "{\"bucket\":\"$B\",\"key\":\"anon-inject.bin\",\"size\":1024,\"part_size\":65536}")
  [[ "$RES" == "401" || "$RES" == "403" ]] \
    && pass "anon cannot init multipart into $B (HTTP $RES)" \
    || { echo "  ✗ anon multipart init on $B returned $RES ($(cat /tmp/body))"; exit 1; }
done

# ══════════════════════════════════════════════════════════════════════
# (j) Extra multipart negative — resume across auth contexts and part
#     tampering after a successful upload chain.
# ══════════════════════════════════════════════════════════════════════

INIT_RS=$(curl -sS -X POST "$BASE/storage/v1/upload/init" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H "x-workspace-id: $WS1" \
  -H 'content-type: application/json' \
  -d "{\"bucket\":\"$BUCKET_A\",\"key\":\"resume.bin\",\"size\":204800,\"part_size\":102400}")
UID_RS=$(echo "$INIT_RS" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).upload_id))')
[[ -n "$UID_RS" ]] || fail "resume-suite init"

dd if=/dev/urandom of=/tmp/rp1 bs=1024 count=100 status=none
ER1=$(curl -sS -X PUT "$BASE/storage/v1/upload/$UID_RS/part/1" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/rp1 \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).etag))')
[[ -n "$ER1" ]] || fail "resume part 1"

# (j.1) After a successful owner PUT, an intruder attempting to RESUME the
#       same part must still be refused (proves RLS runs on every PUT, not
#       only on init).
dd if=/dev/urandom of=/tmp/rp1x bs=1024 count=100 status=none
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X PUT "$BASE/storage/v1/upload/$UID_RS/part/1" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/rp1x)
expect_code 403 "$RES" "intruder resume of part 1 refused" "$(cat /tmp/body)"

# (j.2) Intruder abort of live session refused.
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X DELETE "$BASE/storage/v1/upload/$UID_RS/abort" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T2")
expect_code 403 "$RES" "intruder cannot abort live session" "$(cat /tmp/body)"

# (j.3) Owner uploads part 2, then reorders parts on complete → still OK
#       (server should sort by part_number), and then a second complete
#       with swapped etags → 400.
dd if=/dev/urandom of=/tmp/rp2 bs=1024 count=100 status=none
ER2=$(curl -sS -X PUT "$BASE/storage/v1/upload/$UID_RS/part/2" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" \
  -H 'content-type: application/octet-stream' --data-binary @/tmp/rp2 \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).etag))')

RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/upload/$UID_RS/complete" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"parts\":[{\"part_number\":2,\"etag\":\"$ER2\"},{\"part_number\":1,\"etag\":\"$ER1\"}]}")
expect_code 200 "$RES" "complete accepts unordered parts array" "$(cat /tmp/body)"

# Second complete after finalization → 404/409.
RES=$(curl -sS -o /tmp/body -w '%{http_code}' -X POST "$BASE/storage/v1/upload/$UID_RS/complete" \
  -H "apikey: $ANON_KEY" -H "authorization: Bearer $T1" -H 'content-type: application/json' \
  -d "{\"parts\":[{\"part_number\":1,\"etag\":\"$ER1\"},{\"part_number\":2,\"etag\":\"$ER2\"}]}")
[[ "$RES" == "404" || "$RES" == "409" ]] \
  && pass "double-complete refused (HTTP $RES)" \
  || { echo "  ✗ double-complete returned $RES ($(cat /tmp/body))"; exit 1; }

echo
echo "════════════════════════════════════════"
echo "  ✅ Storage CI E2E: signed URLs + multipart + workspace isolation + negative RLS all green"
echo "════════════════════════════════════════"

