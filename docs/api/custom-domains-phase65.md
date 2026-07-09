# Custom Domains API — Phase 64/65

Workspace-scoped custom domain management, including wildcard (DNS-01) support,
per-workspace primary flag, real-time status broadcasts, external cert-issuer
webhooks, workspace-admin RBAC, and a dedicated **domain-admin** permission
(Phase 65) that grants domain lifecycle rights without full workspace-admin.

- Base path: `/enterprise/v1/domains`
- Auth: Bearer JWT + `x-workspace-id: <uuid>` header
- Realtime channel: `custom_domains:<workspace_id>`
- Audit action prefix: `domain.*`

---

## Permission model

Any of the following can call the domain mutation endpoints (`add`,
`verify`, `primary`, `remove`, `webhook secret rotate`):

| Role                            | Source                          | Manage domains | Manage domain-admins |
| ------------------------------- | ------------------------------- | -------------- | -------------------- |
| Workspace owner / admin         | `workspace_members.role`        | ✅              | ✅                    |
| Domain-admin (Phase 65)         | `workspace_domain_admins`       | ✅              | ❌                    |
| Workspace member                | `workspace_members.role`        | ❌ (read-only)  | ❌                    |
| Service role / superadmin       | JWT / `auth.users.is_superadmin`| ✅              | ✅                    |

Enforcement middleware: `requireDomainAdmin` (mutations) and
`requireWorkspaceAdmin` (domain-admin grant/revoke).

Non-authorized callers receive `403 Forbidden` with body
`{ "error": "forbidden", "reason": "requires domain-admin" }`.

---

## Endpoints

### `GET /enterprise/v1/domains`

List domains for the current workspace. Available to any workspace member.

```json
{
  "domains": [
    {
      "id": "uuid",
      "hostname": "api.yourbrand.com",
      "is_wildcard": false,
      "is_primary": true,
      "verified": true,
      "verify_token": "…",
      "dns_txt_record": "_pluto-verify.api.yourbrand.com",
      "dns_txt_value": "…",
      "cert_status": "issued",
      "last_error": null,
      "created_at": "2026-07-01T12:00:00Z",
      "verified_at": "2026-07-01T12:04:12Z",
      "updated_at": "2026-07-01T12:04:12Z"
    }
  ]
}
```

### `POST /enterprise/v1/domains` *(domain-admin)*

Add a domain. Wildcards (`*.tenants.example.com`) auto-set `is_wildcard: true`
and use ACME **DNS-01** validation via `_acme-challenge.<host>`.

```jsonc
// request
{ "hostname": "api.yourbrand.com" }

// response 201
{
  "id": "uuid", "hostname": "api.yourbrand.com",
  "verify_token": "…", "dns_txt_record": "_pluto-verify.api.yourbrand.com",
  "dns_txt_value": "…", "is_wildcard": false, "is_primary": false,
  "cert_status": "pending"
}
```

Broadcasts `domain.added` on `custom_domains:<ws>`. Audit: `domain.add`.

### `POST /enterprise/v1/domains/:id/verify` *(domain-admin)*

Runs DNS lookup for the TXT record (or `_acme-challenge` for wildcards) and,
on success, transitions the record to `verified: true, cert_status: issuing`.

```json
{ "ok": true, "verified": true }
```

Broadcasts `domain.verified` (or `domain.verify_failed` with `last_error`).
Audit: `domain.verify` with metadata `{ retry: boolean }`.

### `POST /enterprise/v1/domains/:id/primary` *(domain-admin)*

Marks the domain as the workspace's primary. Enforced by partial unique index
`custom_domains_primary_unique(workspace_id) WHERE is_primary`. Wildcards
cannot be primary — request returns `400 { "error": "wildcard_not_primary" }`.

Broadcasts `domain.primary_changed`. Audit: `domain.primary`.

### `DELETE /enterprise/v1/domains/:id` *(domain-admin)*

Removes the domain and revokes any issued cert. Broadcasts `domain.removed`.
Audit: `domain.remove`.

### `POST /webhooks/v1/domains/status` *(public, HMAC-signed)*

Public endpoint called by external cert issuers (Caddy on-demand,
cert-manager, ACME hooks). Verified using the per-workspace HMAC secret in
`domain_webhooks.secret`.

Headers:

- `x-pluto-workspace: <uuid>`
- `x-pluto-signature: sha256=<hex(HMAC(secret, raw_body))>`
- `x-pluto-timestamp: <unix seconds>` (±5 min tolerance)

```json
{
  "hostname": "api.yourbrand.com",
  "cert_status": "issued" | "failed" | "renewed" | "revoked",
  "last_error": null
}
```

Broadcasts the matching `domain.cert_*` event and writes an audit row with
`actor_role: "webhook"`. Rotate the secret via
`POST /enterprise/v1/domains/webhook-secret` *(workspace-admin only)*.

---

## Domain-admin management (Phase 65)

All three endpoints require **workspace-admin** (owner/admin in
`workspace_members`); a domain-admin cannot grant or revoke the role.

### `GET /enterprise/v1/domains/admins`

```json
{
  "admins": [
    {
      "user_id": "uuid",
      "email": "alice@corp.com",
      "granted_by": "uuid",
      "granted_at": "2026-07-01T12:00:00Z",
      "note": "on-call SRE"
    }
  ]
}
```

### `POST /enterprise/v1/domains/admins`

```jsonc
// request
{ "user_id": "uuid", "note": "on-call SRE" }

// response 201 → same shape as list row
```

The target user must already be a member of the workspace, otherwise
`400 { "error": "not_a_member" }`. Broadcasts
`domain.admin_grant`, audit action `domain.admin_grant`.

### `DELETE /enterprise/v1/domains/admins/:userId`

Revokes the domain-admin role. Idempotent: returns `204` whether or not the
grant existed. Broadcasts `domain.admin_revoke`, audit action
`domain.admin_revoke`.

---

## Realtime events (`custom_domains:<workspace_id>`)

| Event                    | Payload                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `domain.added`           | full domain row                                            |
| `domain.verified`        | `{ id, hostname, verified_at }`                            |
| `domain.verify_failed`   | `{ id, hostname, last_error }`                             |
| `domain.primary_changed` | `{ id, hostname, is_primary }`                             |
| `domain.removed`         | `{ id, hostname }`                                         |
| `domain.cert_issued`     | `{ id, hostname, cert_status }`                            |
| `domain.cert_failed`     | `{ id, hostname, last_error }`                             |
| `domain.admin_grant`     | `{ user_id, granted_by, note }`                            |
| `domain.admin_revoke`    | `{ user_id, revoked_by }`                                  |

---

## Audit log

Every mutation persists to the workspace audit log with:

```json
{
  "action": "domain.verify",
  "actor_id": "uuid | null",
  "actor_email": "…",
  "actor_role": "workspace_admin | domain_admin | webhook | service_role",
  "ts": "2026-07-01T12:04:12Z",
  "metadata": { "workspace_id": "uuid", "hostname": "…", "retry": false }
}
```

Query via `GET /admin/v1/audit?action=domain.*&workspace_id=<uuid>`.

---

## Frontend UI (`/dashboard/custom-domains`)

Behavior is driven by `me.workspaceRole()` which now returns
`{ role, can_admin, is_domain_admin }`.

**Read-only banner** — visible when `!can_admin && !is_domain_admin`:
> *"Only workspace admins or domain-admins can manage custom domains.
> Ask an admin to grant you the domain-admin role."*

**Row-level controls** (Add, Verify, Test endpoint, Make primary, Remove)
are enabled when `can_admin || is_domain_admin`. Each is wrapped in a
`RetryStatus` component that surfaces manual retry with exponential backoff
(1s → 16s, ±25% jitter, ≤5 attempts) and a **Cancel** button; retries are
recorded in the audit log as `{ retry: true }`.

**Domain-admin permission panel** — visible only when `can_admin`:
- Lists current domain-admins (email + granted_at + note).
- Search-and-add member picker calls `POST /enterprise/v1/domains/admins`.
- Per-row **Revoke** button calls `DELETE /enterprise/v1/domains/admins/:id`.
- Panel subscribes to `domain.admin_grant` / `domain.admin_revoke` for
  live updates across sessions.

**Audit page** (`/dashboard/custom-domains/audit`) reads from
`GET /admin/v1/audit?action=domain.*` and merges any locally-recorded
optimistic entries. Filters by actor role (`workspace_admin`,
`domain_admin`, `webhook`) and action.

**Test endpoint button** (per row) probes DNS TXT + `https://<host>/health`
before allowing "Make primary" and surfaces partial failures inline.
