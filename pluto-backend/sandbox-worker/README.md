# Pluto Sandbox Worker

Small VPS-side helper that turns an uploaded ZIP bundle into a **live served
frontend** at `app.timescard.cloud` (or any other subdomain). This is the
missing piece of Pluto BaaS v0.1 — the storage bucket only stores the ZIP;
the worker unpacks it and lets nginx serve it.

## What it does

1. Runs a tiny HTTP API on `127.0.0.1:8787` (protected by a shared secret).
2. On `POST /unpack { workspaceId, bucket, key }`:
   - Downloads the ZIP from the Pluto storage API (using the service-role key).
   - Unzips into `/var/lib/pluto/sites/<workspaceId>/release-<timestamp>/`.
   - Auto-detects a `dist/` / `build/` / `public/` folder if present.
   - Atomically flips the `current` symlink so nginx picks up the new build
     with **zero downtime**.
   - Prunes releases older than the last 5.
3. `GET /status/<workspaceId>` — reports the currently-served bundle.
4. `GET /healthz` — process liveness (no auth required).

## Install on the VPS

```bash
# From this repo on the VPS
cd pluto-backend/sandbox-worker
sudo bash install.sh
```

The script installs Node 20 + `unzip`, drops the worker under `/opt/pluto/`,
creates `/var/lib/pluto/sites/` (owned by `www-data`), writes
`/etc/pluto/sandbox-worker.env` with your service key + a generated shared
secret, and starts `pluto-sandbox.service` via systemd.

## Wire nginx for `app.timescard.cloud`

```bash
sudo cp pluto-backend/sandbox-worker/nginx-app.conf /etc/nginx/sites-available/app.timescard.cloud
sudo sed -i "s|<WORKSPACE_ID>|02504262-b997-408d-bdc7-f50c3066238b|g" /etc/nginx/sites-available/app.timescard.cloud
sudo ln -s /etc/nginx/sites-available/app.timescard.cloud /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.timescard.cloud
```

DNS: add an **A record** `app` → your VPS IP at your registrar (Hostinger).
No TXT records or Lovable-owned IPs are needed for this path.

## Wire Lovable

In **Lovable Cloud → Secrets** add:

| Secret | Value |
| ------ | ----- |
| `PLUTO_SANDBOX_URL` | `http://127.0.0.1:8787` if the Lovable server also runs on this VPS; otherwise the reverse-proxied HTTPS URL (`https://sandbox.<host>`) |
| `PLUTO_SANDBOX_SECRET` | the value the installer printed (also stored in `/etc/pluto/sandbox-worker.env`) |

After adding the secrets, re-run **Deploy to VPS** in the dashboard — the new
`unpack-serve` step will download the just-uploaded bundle, unpack it, and
flip the live symlink. The health-check step then probes
`https://app.timescard.cloud/` to prove the site is really live.

If the two `PLUTO_SANDBOX_*` secrets are absent, the pipeline still runs
without a hard failure — the `unpack-serve` step is skipped with a clear
"worker not configured" message so nothing else breaks.

## Troubleshooting

- `systemctl status pluto-sandbox` — service state
- `journalctl -u pluto-sandbox -f` — live logs
- `curl http://127.0.0.1:8787/healthz` — liveness
- `ls -la /var/lib/pluto/sites/<workspace>/` — releases + `current` symlink
- `cat /var/lib/pluto/sites/<workspace>/current.json` — last-served manifest
