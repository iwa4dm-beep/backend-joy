# Custom Domain & Subdomain Setup — Auto-Connect Studio (Pluto BaaS)

Lovable hosts the published site at `https://plutobaas.lovable.app`. To serve
Auto-Connect Studio from a custom domain (root + subdomains), follow this
runbook. DNS + SSL are handled by Lovable; you only edit records at your
registrar.

## 1. Prerequisites

- The project must already be published (`https://plutobaas.lovable.app` is live).
- You control DNS for the target domain (registrar or a DNS provider like
  Cloudflare, Route 53, Namecheap).
- Paid Lovable plan (custom domains require Pro or higher).

## 2. Root domain (example: `plutobaas.io`)

1. Open **Lovable → Project Settings → Project section → Domains**.
2. Click **Connect Domain** and enter `plutobaas.io`.
3. Lovable shows the DNS records to add. Add them at your registrar:

   | Type | Name          | Value                |
   |------|---------------|----------------------|
   | A    | `@`           | `185.158.133.1`      |
   | A    | `www`         | `185.158.133.1`      |
   | TXT  | `_lovable`    | `lovable_verify=…`   |

4. Wait for **Verifying → Setting up → Active**. Propagation can take up to
   72 hours; usually < 30 min.
5. Choose one entry (`plutobaas.io` or `www.plutobaas.io`) as **Primary**;
   the other automatically redirects.

## 3. Subdomains (example: `autoconnect.plutobaas.io`, `api.plutobaas.io`)

Each subdomain is added as a **separate entry** in Lovable — subdomains are
never auto-created.

1. In **Domains**, click **Connect Domain** again with the full subdomain,
   e.g. `autoconnect.plutobaas.io`.
2. Lovable will ask for an `A` record on that subdomain:

   | Type | Name           | Value             |
   |------|----------------|-------------------|
   | A    | `autoconnect`  | `185.158.133.1`   |
   | A    | `api`          | `185.158.133.1`   |
   | A    | `studio`       | `185.158.133.1`   |

3. Repeat verification. SSL is auto-provisioned per subdomain.

### Wildcard subdomains
Wildcard (`*.plutobaas.io`) is not supported by the Lovable custom-domain
flow — add each subdomain explicitly.

## 4. Cloudflare / proxied DNS

If DNS lives behind Cloudflare and you want to keep the orange-cloud proxy:

1. In the **Connect Domain** dialog, expand **Advanced**.
2. Check **"Domain uses Cloudflare or a similar proxy"**.
3. Lovable will issue a **CNAME**-based verification instead of A records.
4. Add the shown CNAME at your DNS provider and keep the record proxied.

Compliance note: proxied traffic passes through Cloudflare's edge, so cookie
scanners may report Cloudflare geolocation instead of your origin region.

## 5. Local subdomain routing (dev)

For local Auto-Connect Studio previews on subdomains, add to `/etc/hosts`:

```
127.0.0.1  plutobaas.local autoconnect.plutobaas.local api.plutobaas.local
```

Then run:

```bash
bun run dev
# open http://autoconnect.plutobaas.local:8080/dashboard/auto-connect
```

The Vite dev server ignores the hostname — subdomain routing here is purely
cosmetic until Nginx / Caddy is in front (see `pluto-backend/docs/LOCAL-DOCKER-RUNBOOK.md`).

## 6. VPS: multi-subdomain reverse proxy

If Auto-Connect Studio is deployed to a VPS with Nginx or Caddy, use the
`14-nginx-tls.sh` and `15-nginx-subdomains.sh` scripts in
`pluto-baas-deploy-kit-v2.zip`. Minimum records at your registrar:

```
A   autoconnect   → <VPS_IPV4>
A   api           → <VPS_IPV4>
A   studio        → <VPS_IPV4>
TXT _acme-challenge  (managed by certbot / caddy on first run)
```

Then run on the VPS:

```bash
sudo bash 14-nginx-tls.sh plutobaas.io admin@plutobaas.io
sudo bash 15-nginx-subdomains.sh plutobaas.io autoconnect api studio
```

## 7. Troubleshooting

- **Stuck on "Verifying" > 30 min:** re-check the TXT record spelling with
  `dig TXT _lovable.plutobaas.io`.
- **SSL "Failed":** check for a conflicting CAA record; must allow Let's
  Encrypt (`letsencrypt.org`).
- **Old A records elsewhere:** delete previous hosting's records; two A
  records on `@` will bounce SSL provisioning.
- **Subdomain 404s on refresh:** TanStack Start's file-based routing handles
  refresh natively on `.lovable.app`; on VPS make sure Nginx has
  `try_files $uri /index.html;` (already in `15-nginx-subdomains.sh`).

## 8. Publish checklist

- [ ] Root domain **Active** in Lovable Domains
- [ ] `www` connected and marked as redirect to Primary
- [ ] Every subdomain listed above shows **Active**
- [ ] `https://autoconnect.plutobaas.io/dashboard/auto-connect` renders the
      Auto-Connect Studio heading
- [ ] `/dashboard/ci-status` shows green Auto-Connect Guard runs

See the in-app **Dashboard → CI / Test Status** page for live workflow-run
health per commit and per PR.
