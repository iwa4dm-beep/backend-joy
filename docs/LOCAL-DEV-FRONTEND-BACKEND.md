# Local dev: backend-joy + Lovable frontend side-by-side

Run backend-joy on `localhost:3000` and the Lovable frontend on `localhost:8080`,
with CORS + session flow wired end-to-end.

## 1. Start backend-joy

```bash
cd pluto-backend
cp .env.example .env         # if not already done
docker compose --env-file .env -f docker/docker-compose.yml up -d
curl -sS http://localhost:3000/livez   # → {"status":"ok"}
```

Add the frontend origin to the CORS allow-list (only needed once, hot-reloads
in 15 s):

```bash
psql "$DATABASE_URL" -c "
  insert into admin.cors_origins (origin, description)
  values ('http://localhost:8080', 'lovable local dev')
  on conflict (origin) do nothing;"
```

Or via the API once you have an admin JWT:

```bash
curl -X POST http://localhost:3000/admin/v1/cors \
  -H "authorization: Bearer $ADMIN_JWT" -H 'content-type: application/json' \
  -d '{"origin":"http://localhost:8080","description":"lovable local dev"}'
```

Apply the SQL bootstrap once (creates `profiles`, `notes`, `uploads` bucket,
RLS policies):

```bash
psql "$DATABASE_URL" -f ../examples/lovable-frontend/setup.sql
```

## 2. Start the Lovable frontend

```bash
# in a second terminal, from the Lovable project root
cat > .env <<'EOF'
VITE_PLUTO_URL=http://localhost:3000
VITE_PLUTO_ANON_KEY=pk_anon_xxxxxxxxx   # from Dashboard → Keys
EOF

bun install
bun run dev            # serves on http://localhost:8080
```

## 3. Verify CORS + session in one loop

Open the app at `http://localhost:8080`, then in DevTools console:

```js
// Preflight + auth headers land correctly
const r = await fetch('http://localhost:3000/auth/v1/settings', {
  headers: { apikey: import.meta.env.VITE_PLUTO_ANON_KEY, origin: location.origin },
});
console.log(r.status, r.headers.get('access-control-allow-origin'), r.headers.get('x-request-id'));

// Full flow: sign-up → RLS insert → upload
const { data: { user } } = await pluto.auth.signUp({ email: 'you@test.dev', password: 'Passw0rd!' });
await pluto.from('notes').insert({ title: 'local', body: 'hi', owner_id: user.id });
await pluto.storage.from('uploads').upload(`${user.id}/hi.txt`, new Blob(['hi']));
```

**Session strategy** — `@pluto/js` stores the JWT in `localStorage`
(`pluto.auth.token`) and sends it as `Authorization: Bearer …`. No cookies are
set, so `SameSite`/`Secure` are irrelevant across `localhost:8080` ↔
`localhost:3000`, and `Access-Control-Allow-Credentials` stays **off**.

If you switch to cookie sessions later, both origins must be the same
registrable domain, cookies must be `SameSite=None; Secure` (requires HTTPS —
run `caddy reverse-proxy` locally), and the API must set
`Access-Control-Allow-Credentials: true` with an exact origin.

## 4. Run the storage E2E against local

```bash
BASE_URL=http://localhost:3000 \
ANON_KEY=pk_anon_xxxxxxxxx \
TEST_EMAIL=dev@test.local TEST_PASSWORD='Passw0rd!' \
  bash pluto-backend/deploy/smoke-storage-e2e.sh
```

Every response now includes an `x-request-id`; on failure the script prints it
and you can `docker logs -f docker-api-1 | grep <trace-id>` to see the exact
Postgres error (RLS violations surface as `42501` with `hint:`).

## 5. Common local pitfalls

| Symptom | Fix |
| --- | --- |
| `CORS: origin http://localhost:8080 not allowed` | Insert into `admin.cors_origins` (see step 1) |
| `401 { code: "42501" }` on upload | Path must be `<user_id>/…`; check `uploads_owner_write` policy |
| Cookies not sent | Not applicable — client uses localStorage bearer tokens |
| `bun run dev` port collision | Set `PORT=8080` in Lovable `.env`, restart |
