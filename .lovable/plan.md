# Supabase → Pluto Migration Toolkit

`timesn` কোডবেসটি VPS-এ (`/opt/timesn`) — এই Lovable প্রজেক্টে সরাসরি এডিট করা যাবে না। তাই আমি `pluto-backend/deploy/`-এ **তিনটি স্ক্রিপ্ট** যোগ করব যেগুলো VPS-এ চালিয়ে সম্পূর্ণ migration করা যাবে।

## কী তৈরি হবে

### 1. `migrate-frontend-to-pluto.sh`
Codebase স্ক্যান করে Supabase → Pluto rewrite:
- `@supabase/supabase-js` → `@pluto/js` (package.json + imports)
- `createClient(...)` কল-সাইট patch
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` → `VITE_PLUTO_URL` / `VITE_PLUTO_ANON_KEY`
- `src/integrations/supabase/client.ts` → `src/lib/pluto.ts` shim (backward-compatible export)
- `.env` template তৈরি
- Dry-run mode (`--dry`) — কোন file বদলাবে তার diff দেখাবে

### 2. `extract-supabase-schema.sh`
Supabase project থেকে schema+RLS extract:
- `pg_dump --schema-only --no-owner` চালিয়ে `schema.sql`
- RLS policies, functions, triggers আলাদা করে dump
- Pluto migrator-compatible bundle (`pluto-backend/migrations/tenants/<slug>.sql`)
- Supabase-specific জিনিস (`auth.uid()` etc.) auto-translate করে Pluto equivalent-এ

### 3. `verify-pluto-cutover.sh`
Cutover verify:
- Deployed bundle scan → `api.timescard.cloud` + `pk_anon_` উপস্থিত কিনা
- `/auth/v1/token` probe (Pluto login endpoint)
- Sample data query
- Red/Green report

## Workflow (VPS-এ)

```text
1. bash migrate-frontend-to-pluto.sh --dry     # preview
2. bash migrate-frontend-to-pluto.sh           # apply
3. bash extract-supabase-schema.sh <SUPABASE_DB_URL> timesn
4. Push schema via Dashboard → Auto Deploy → Migrations (or migrator CLI)
5. Edit /opt/timesn/.env → VITE_PLUTO_URL, VITE_PLUTO_ANON_KEY
6. cd /opt/timesn && bun install && bun run build
7. zip + deploy via existing flow
8. bash verify-pluto-cutover.sh app.timescard.cloud
```

## Prerequisites (আপনার লাগবে)

- **Pluto anon key** — Pluto Dashboard → Workspace → API Keys → `pk_anon_...`
- **Supabase DB URL** — Supabase Dashboard → Project Settings → Database → Connection string (schema extract-এর জন্য এক-বার)
- **User data migration** — schema-only extract করব; user rows / auth.users আলাদা flow লাগবে (script-এ warning দেব, চাইলে পরে data-migration step যোগ করব)

## ঝুঁকি / সীমাবদ্ধতা

- Supabase Auth users (`auth.users` table) সরাসরি Pluto-তে move হয় না — password hash format আলাদা হতে পারে; ব্যবহারকারীদের password reset লাগতে পারে (verify-cutover script warning দেবে)
- Storage bucket থাকলে আলাদা migration লাগবে (এই toolkit-এ নেই — চাইলে পরে যোগ করব)
- Edge Functions (Supabase) → Pluto Edge Functions মানুয়ালি port করতে হবে
- `auth.uid()` → Pluto equivalent (`current_setting('pluto.user_id')`) auto-translate করব, কিন্তু জটিল RLS policy manual review লাগতে পারে

## Approve করলে

স্ক্রিপ্ট ৩টা `pluto-backend/deploy/`-এ commit করব। তারপর আপনি VPS-এ পুল করে চালাবেন — আমি step-by-step guide করব এবং verify script-এর আউটপুট দেখে যেকোনো mismatch fix করব।

চাইলে **user data migration** আর **storage migration**-ও আজই এই প্ল্যানে যোগ করতে পারি — জানান।
