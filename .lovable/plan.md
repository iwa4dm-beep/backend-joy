# Auto-Deploy Studio — 6 new panels

Delivered as tabs on `/dashboard/auto-deploy` so the current pipeline UI stays intact. Each phase ships end-to-end (data + UI + tests) before the next.

## Phase 1 — Deployment Summary & Deployment Checks
Read-only surfaces over the existing deploy report; no new server work.

- **Summary tab**: last deploy status, total ms, step count (ok/warn/fail), served-site URL, SSL cert issuer + days-to-expiry, resolved bundle sha, workspace/slug — sourced from `auto-deploy-history` + `liveUrls`.
- **Checks tab**: enumerated rule list (SSL valid, SSL >30d, served-site 2xx, health probe ok, migrations applied, worker version marker, DNS resolves). Each check derived from the last deploy result; badge = pass/warn/fail with a "why" tooltip and a "re-run" button that re-hits the relevant server fn.

## Phase 2 — Build Logs
Structured, filterable log viewer for the current deploy.

- Reuse the existing `steps[].attempts[].debug` stream and surface it as a virtualized log list with per-step collapsers, level filter (info/warn/error), copy-to-clipboard, and a "download .log" export.
- Add `stepStartedAt`/`stepEndedAt` to each row so timing is visible.
- Live tail via existing polling of `getDeployStatus`.

## Phase 3 — Deployment Settings
Per-workspace persisted settings (new `deployment_settings` table).

Fields:
- `auto_deploy_on_push` (bool)
- `strict_served_site` (bool — flips warning→fatal)
- `strict_ssl` (bool)
- `served_site_url_override` (text, nullable)
- `notify_email` (text, nullable)
- `default_branch` (text, default `main`)

Server fns: `getDeploymentSettings` + `updateDeploymentSettings` (both `requireSupabaseAuth`, RLS scoped to workspace admins). UI: settings form with dirty-check + save.

## Phase 4 — Recommendations
Deterministic advisor over the last deploy + settings.

Rules (each returns severity + suggested action + one-click apply where safe):
- SSL cert expiring <30 days → run `fix-wildcard-ssl.sh` hint.
- Served-site 404 → open Diagnostics panel.
- `strict_served_site=false` but 5+ consecutive warnings → prompt to enable.
- No `notify_email` set → prompt to add.
- Worker version marker older than repo → prompt to run `refresh-worker.sh`.
- Migrations drift detected → link to migration console.

Rendered as dismissible cards; dismissals stored per-workspace.

## Phase 5 — Assigning Custom Domains
Manage `<slug>.app.timescard.cloud` overrides and user-supplied apex domains.

- New table `custom_domains` (workspace_id, slug, hostname, status, verify_token, cert_status, last_checked_at).
- Server fns: `listCustomDomains`, `addCustomDomain`, `removeCustomDomain`, `verifyCustomDomain` (checks A record → 185.158.133.1 pattern via DNS-over-HTTPS, then triggers wildcard cert issuance via existing `fix-wildcard-ssl.sh` on the VPS through the sandbox worker).
- UI: table with hostname input, status pill (Pending DNS → Verifying → Active → Failed), copy-DNS-record helper, remove action.
- Wire nginx installer to include per-hostname server block when domain is Active.

## Technical notes

- All new tables include `GRANT` + RLS policies scoped via `has_role(auth.uid(), 'admin')` where writes are admin-only; reads scoped to workspace members via existing `workspace_members` join.
- All new server fns use `requireSupabaseAuth` and never load `supabaseAdmin` at module scope.
- UI added as new tabs in `dashboard.auto-deploy.tsx` under an existing `<Tabs>` structure; each tab is a separate component file under `src/components/auto-deploy/` to keep the route file small.
- E2E tests per phase: history-seeded render tests for Summary/Checks/Logs, form-round-trip test for Settings, rule-fires test for Recommendations, add-remove-verify flow for Custom Domains.

## Execution order
Phase 1 → 2 → 3 → 4 → 5, one phase per turn. Confirm after each phase before continuing.

Shall I start with **Phase 1 (Summary + Checks)** now?
