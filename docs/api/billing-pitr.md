# Phase 36 — Billing (Stripe) + Plan Enforcement

Enable with `PLUTO_ENABLE_BILLING=1`. Requires `STRIPE_SECRET_KEY`
and `STRIPE_WEBHOOK_SECRET` for live mode; without them the module
runs in **dev mode** where checkout returns a stub URL and marks the
subscription active immediately (useful for local + tests).

## Plans

Seeded in migration `0035_billing.sql`:

| code | monthly | features | rows | storage_gb | fn_invocations | ai_tokens |
|------|---------|----------|------|------------|---------------|-----------|
| free       | $0    | –                     | 50k    | 1     | 100k    | 100k    |
| pro        | $25   | branching             | 5M     | 100   | 5M      | 5M      |
| team       | $99   | branching, sso        | 50M    | 1000  | 50M     | 50M     |
| enterprise | quote | +custom               | ∞      | ∞     | ∞       | ∞       |

Attach a Stripe price id to a plan with a manual UPDATE on
`billing_plans.stripe_price_id`.

## Endpoints

```
GET  /billing/v1/plans
GET  /billing/v1/subscription
POST /billing/v1/checkout    { plan_code, success_url, cancel_url }  → { url }
POST /billing/v1/portal      { return_url }                          → { url }
POST /billing/v1/webhook     (Stripe raw-body, HMAC verified)
POST /billing/v1/admin/set-plan  (service-role only)
```

## Enforcement helpers

```ts
import { getWorkspacePlan, planAllows, planLimit } from "modules/billing/plugin";
if (!(await planAllows(ws, "branching"))) throw new Error("upgrade_required");
const cap = await planLimit(ws, "storage_gb");
```

Cache TTL: 60 s per workspace, busted on checkout / webhook / admin set.

# Phase 36 — PITR + Cross-Region Backup Replication

Enable with `PLUTO_ENABLE_PITR=1`.

`wal_archive_config` records the archive target (S3, GCS, or file://).
`pitr_snapshots` is the durable ledger of every base backup and WAL
segment shipped off-box. `backup_replicas` records each cross-region
copy with checksum verification state. `pitr_restores` records target
timestamps and outcome — set `dry_run=true` to validate WAL coverage
without touching the running instance.

## Endpoints

```
GET  /pitr/v1/config
POST /pitr/v1/config             { enabled, archive_url, retention_days }
GET  /pitr/v1/snapshots
POST /pitr/v1/snapshots          { storage_url, kind, lsn?, bytes? }
POST /pitr/v1/restore            { target_time, dry_run }
GET  /pitr/v1/restore/:id
GET  /pitr/v1/replicas
POST /pitr/v1/replicas           { source_id, source_kind, region, target_url, status }
POST /pitr/v1/replicas/:id/verify
```

The physical WAL archive / basebackup capture is out of process — see
`backend/scripts/backup.sh`. This module is the control plane + audit
log; the restore path picks the most recent basebackup on or before
`target_time` and, in prod, hands off to a worker that runs
`pg_basebackup` + WAL replay to that timestamp.
