# Connect Your Existing Project — Setup Guide

আপনার existing PostgreSQL + React/Vite project কে এই Pluto BaaS-এ যুক্ত করার জন্য একটি নতুন sidebar menu group **"Connect Project"** যোগ করব, যার under-এ একটি বিস্তারিত step-by-step guide page থাকবে (বাংলা + English)।

## Sidebar-এ নতুন Menu

**Group:** `Getting Started` (Platform group-এর উপরে, top-এ)
- **Connect Your Project** → `/dashboard/connect-project` (icon: `Plug`)

## Page Structure — `/dashboard/connect-project`

একটি tabbed/stepper layout, প্রতিটি step-এ code snippet + copy button + বাংলা ব্যাখ্যা:

### Step 1 — Prerequisites Check
- Existing Postgres DB URL, React/Vite project, Node 18+
- Checklist UI (interactive checkboxes)

### Step 2 — Create Workspace & Project
- Dashboard → Workspaces → New workspace
- Project create → API keys (anon + service_role) copy করার instruction
- Screenshot placeholder + "Open Workspaces" button

### Step 3 — Migrate Your Postgres Schema
দুইটি option:
- **A. Fresh start** — Pluto managed Postgres ব্যবহার (recommended)
- **B. Bring Your Own DB (BYOD)** — existing DB-এর `DATABASE_URL` configure করা
  - `pluto-backend/deploy/*` scripts এবং migrations কিভাবে run করবে
  - `pg_dump` → restore instruction
  - RLS enable করার SQL snippet

### Step 4 — Install SDK in Frontend
```bash
bun add @pluto/js
```
`.env` setup:
```
VITE_PLUTO_URL=https://api.timescard.cloud
VITE_PLUTO_ANON_KEY=pk_anon_xxx
```

### Step 5 — Initialize Client
`src/lib/pluto.ts` file তৈরি (examples/lovable-frontend/pluto-client.ts থেকে template)

### Step 6 — Wire Features (Tab per feature)
প্রতিটি feature-এর জন্য mini-tab, ready-to-paste code:
1. **Auth** — sign up / sign in / OAuth (Google, GitHub)
2. **Database (REST + GraphQL)** — CRUD example, `pluto.from("todos").select()`
3. **Realtime** — subscribe to table changes + presence
4. **Storage** — file upload/download + presigned URL
5. **Edge Functions** — deploy + invoke
6. **Vector / AI** — embedding + search
7. **Users / MFA / SSO** — role management

### Step 7 — RLS & Security Setup
- `has_role()` function SQL snippet
- Basic policy examples (owner-only, public-read)
- Link to existing Audit & Compliance pages

### Step 8 — Verify Connection
- Built-in "Test Connection" button — API call করে auth + db + storage ping করবে
- Success/error status card

### Step 9 — Deploy Checklist
- CORS origins add
- Production API keys rotate
- Custom domain setup link
- Monitoring/observability link

## Additional Features on the Page
- **Language toggle** (বাংলা / English) — HelpPanel-এর pattern reuse
- **Copy-to-clipboard** সব code block-এ
- **Progress tracker** — localStorage-এ কোন step complete track
- **PageHelp integration** — ⌘K search-এ discoverable
- **Downloadable starter kit** link (`examples/lovable-frontend/`)

## Technical Implementation

**Files to create:**
1. `src/routes/dashboard.connect-project.tsx` — main page (tabs, steppers, code blocks)
2. `src/content/help/dashboard.connect-project.ts` — bilingual PageHelp entry
3. `src/components/pluto/connect/` — sub-components:
   - `PrerequisiteChecklist.tsx`
   - `CodeBlock.tsx` (with copy button)
   - `ConnectionTester.tsx` (calls `/v1/health` endpoint)
   - `StepProgress.tsx` (localStorage-backed)
4. `src/content/connect/` — MDX-style content data (bilingual snippets)

**Files to edit:**
1. `src/components/pluto/Sidebar.tsx` — new "Getting Started" group + "Connect Your Project" item
2. `src/content/help/registry.ts` — register new help entry for ⌘K search

**Tests:**
- `registry.spec.ts` will auto-cover the new help entry (existing test loops all entries)

## Out of Scope (Later Phases)
- CLI wizard (`npx @pluto/init`)
- One-click DB migration tool
- Automatic schema introspection from user's existing DB

---

Approve করলে page + sidebar entry + PageHelp সব তৈরি করে দিব।
