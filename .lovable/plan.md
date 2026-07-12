# VPS Full-Connect Plan — Auto-Connect Studio ↔ api.timescard.cloud

লক্ষ্য: ব্যবহারকারী Auto-Connect Studio-তে project দিলে সেটি automatic ভাবে VPS-এ deploy হবে, workspace + admin user auto-provision হবে, এবং সব file/data VPS-এ persist হবে।

## বর্তমান অবস্থা (সংক্ষেপে)
- ✅ Frontend ↔ VPS proxy কাজ করছে (`/api/pluto/*` → `https://api.timescard.cloud`)
- ✅ VPS healthy (Postgres, S3, JWT সব OK)
- ❌ Auto-Connect শুধু ZIP তৈরি করে — VPS-এ push হয় না
- ❌ Workspace + admin user auto-provision নেই
- ❌ File/asset upload VPS storage-এ যায় না

---

## Phase 1 — Auth ও Base Connection Layer (foundation)
1. `src/lib/pluto/vps-client.ts` তৈরি: `apikey` + `Bearer` header সহ typed fetch wrapper (service-role এবং user-token দুই mode)।
2. Service-role key `PLUTO_SERVICE_ROLE_KEY` secret হিসেবে সংরক্ষণ (server-only)।
3. Server function `checkVpsHealth()` — `/livez`, `/readyz`, `/health/deps` একসাথে probe করে UI-তে live status দেখাবে।

## Phase 2 — Workspace + Admin User Auto-Provision
1. Server function `provisionWorkspace({ projectName, adminEmail })`:
   - `POST /admin/v1/workspaces` — workspace তৈরি
   - `POST /auth/v1/admin/users` — auto email + generated password সহ admin user
   - `POST /admin/v1/workspaces/:id/members` — admin role assign
   - Generated credentials encrypted করে DB-তে সংরক্ষণ + একবার UI-তে দেখানো
2. Auto-Connect wizard-এ নতুন step "Workspace Provision" যোগ (project name → auto email/password display)।

## Phase 3 — Direct VPS Deployment (ZIP → API push)
1. `src/lib/autoconnect/vps-deployer.ts`:
   - Migration SQL → `POST /admin/v1/migrations` (dry-run first, তারপর apply)
   - Static asset/file → `POST /storage/v1/object/{bucket}/{path}` (multipart)
   - Progress SSE consume করে UI progress bar-এ দেখাবে
2. Auto-Connect Studio-তে "Deploy to VPS" button যোগ (existing "Download ZIP" এর পাশে)।
3. Rollback endpoint `POST /admin/v1/migrations/:version/rollback` UI থেকে trigger।

## Phase 4 — File/Folder Sync ("লেনদেন")
1. Auto-Connect-এ upload হওয়া প্রতিটি file VPS `pluto_storage` bucket-এ mirror।
2. Manifest table `project_assets` (VPS-side) — file path, SHA256, size, uploaded_by track।
3. Studio dashboard-এ "Synced with VPS" badge (green/red) প্রতিটি file-এ।

## Phase 5 — Verification ও Observability
1. Post-deploy smoke: `/admin/v1/migrations/last-boot`, `/health/deps`, tables list check।
2. Audit log stream: `/admin/v1/logs?workspace_id=…` — Studio-তে live tail।
3. E2E test (`e2e/vps-full-flow.spec.ts`): project create → provision → deploy → verify tables/storage → rollback।

## Phase 6 — Failure Handling
- Timeout 30s + retry with exponential backoff (`retry-backoff.ts` already exists)
- Deploy failure → auto rollback trigger + user-facing error banner
- Credential leak protection: password শুধু একবার দেখানো, তারপর mask

---

## Technical Details

**নতুন files:**
- `src/lib/pluto/vps-client.ts` — typed VPS API client
- `src/lib/autoconnect/vps-deployer.ts` — ZIP → API push logic
- `src/lib/autoconnect/workspace-provisioner.functions.ts` — server fn
- `src/routes/dashboard.vps-status.tsx` — health + audit dashboard
- `e2e/vps-full-flow.spec.ts`

**Modified files:**
- `src/routes/dashboard.auto-connect.tsx` — Deploy button + Provision step
- `src/components/pluto/Sidebar.tsx` — "VPS Status" menu item
- `src/routes/api/pluto.$.ts` — already OK

**Secrets:**
- `PLUTO_SERVICE_ROLE_KEY` (add via `add_secret`)
- `PLUTO_UPSTREAM_URL` (already set)

**Estimate:** ~6 phases, incremental — Phase 1-2 সবচেয়ে জরুরি (foundation), Phase 3 core value, Phase 4-6 polish।

---

## কোথা থেকে শুরু করব?
প্রথমে Phase 1 + 2 (auth layer + workspace provisioning) implement করব, কারণ এই দুটি ছাড়া deploy step কাজ করবে না। আপনি approve করলে শুরু করছি।
