# Lovable.dev Frontend Project → Pluto BaaS Backend যুক্ত করার Guide

দুঃখিত, আগে ভুল বুঝেছিলাম। এখন clear: আপনার **Lovable.dev-এ তৈরি frontend project** (GitHub-এ আছে) — এই Pluto BaaS-কে backend হিসেবে ব্যবহার করতে চান।

আপনার ৩টা scenario আছে, সবগুলোর জন্য common concept + আলাদা ধাপ নিচে।

---

## 🎯 মূল ধারণা

আপনার Pluto BaaS (`api.timescard.cloud`) = Supabase-এর মতো একটা backend। যেকোনো Lovable frontend project এটাকে HTTP API হিসেবে call করতে পারবে — শুধু ৩টা env var লাগবে:

```env
VITE_PLUTO_URL=https://api.timescard.cloud
VITE_PLUTO_ANON_KEY=pk_anon_xxxxx
# service_role key শুধু server function-এ, browser-এ কখনোই না
PLUTO_SERVICE_ROLE_KEY=sk_svc_xxxxx
```

Frontend থেকে call হবে Pluto JS SDK (`@pluto/client` — `pluto-backend/packages/sdk-js/`) দিয়ে।

---

## 📋 Scenario 1: GitHub-এ থাকা Lovable project → সরাসরি Pluto backend যুক্ত

আপনার Lovable project GitHub-এ আছে, কোনো Cloud নেই। শুধু frontend।

### ধাপ ১: Pluto-তে API keys তৈরি
1. `https://backend-joy.lovable.app/dashboard` → **Projects → New Project** (frontend app-এর জন্য একটা project)
2. **Settings → API Keys** → `anon` key copy করুন
3. **Dashboard → CORS** → frontend-এর domain add করুন (যেমন `https://myapp.lovable.app`, `http://localhost:8080`)

### ধাপ ২: Frontend project-এ Pluto SDK install
Lovable editor-এ chat-এ লিখুন:
```
bun add @pluto/client
```
অথবা local-এ:
```bash
git clone https://github.com/<you>/<lovable-repo>.git
cd <lovable-repo>
bun add @pluto/client
```

### ধাপ ৩: Env vars যোগ
Lovable project-এ `.env` ফাইলে (বা Lovable Cloud secrets-এ):
```env
VITE_PLUTO_URL=https://api.timescard.cloud
VITE_PLUTO_ANON_KEY=pk_anon_xxxxx
```

### ধাপ ৪: Pluto client setup
`src/lib/pluto.ts`:
```ts
import { createClient } from "@pluto/client";
export const pluto = createClient({
  baseUrl: import.meta.env.VITE_PLUTO_URL,
  apikey:  import.meta.env.VITE_PLUTO_ANON_KEY,
});
```

### ধাপ ৫: Auth + Data + Storage ব্যবহার
```ts
// Auth
await pluto.auth.signUp(email, password);
await pluto.auth.signIn(email, password);
const user = pluto.auth.user();

// Data
const { rows } = await pluto.data.query({ table: "posts", limit: 20 });
await pluto.data.insert("posts", { title: "hi" });

// Storage
await pluto.storage.upload("public", "cover.jpg", file);

// Realtime
pluto.realtime.channel("posts").on("INSERT", (row) => console.log(row));
```

### ধাপ ৬: Database schema তৈরি
Pluto Dashboard → **SQL Editor**-এ:
```sql
CREATE TABLE public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text, body text,
  created_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own posts" ON public.posts FOR ALL TO authenticated
  USING (user_id = auth.uid());
```

---

## 📋 Scenario 2: **Lovable Cloud on করা** project → Pluto যুক্ত

আপনার frontend project-এ Lovable Cloud (Supabase) ইতিমধ্যে enabled। এখন Pluto-ও যুক্ত করতে চান।

### গুরুত্বপূর্ণ সিদ্ধান্ত: কোনটা কীসের জন্য?
| Feature | Lovable Cloud | Pluto BaaS |
|---|---|---|
| Auth | ✅ রাখুন | অথবা migrate |
| DB | ✅ রাখুন | অথবা migrate |
| Storage | ✅ রাখুন | অথবা migrate |

**২টা approach:**

**Approach A (Hybrid — সহজ, no migration):**
- Lovable Cloud যা আছে থাক
- Pluto যুক্ত করুন শুধু **নতুন feature**-এর জন্য (যেমন Realtime, Edge functions, Vector search)
- ২টা client পাশাপাশি থাকবে: `supabase` (Cloud) + `pluto` (BaaS)

**Approach B (Full migration to Pluto):**
- Lovable Cloud থেকে data export → Pluto-তে import
- সব `supabase.*` call → `pluto.*` call-এ replace
- Lovable Cloud disable করুন Cloud tab থেকে

### ধাপ (Approach A — recommended):
1. Scenario 1-এর ধাপ ১-৪ follow করুন — Pluto SDK install + env + client setup
2. Existing `src/integrations/supabase/client.ts` অপরিবর্তিত রাখুন
3. নতুন `src/lib/pluto.ts` add করুন
4. যে feature-এর জন্য Pluto চান শুধু সেখানে `pluto.*` call করুন
5. Pluto Dashboard-এ CORS-এ আপনার Lovable published URL add করুন (যেমন `https://myapp.lovable.app`, preview URL-ও)

### ধাপ (Approach B — full migration):
1. Lovable Cloud → Advanced settings → **Export data** (SQL dump)
2. Pluto Dashboard → SQL Editor-এ dump import করুন
3. Users migrate: Supabase Auth → Pluto Auth (API দিয়ে script)
4. Code refactor: সব `supabase.from(...).select()` → `pluto.data.query(...)`
5. Lovable Cloud disable করুন

---

## 📋 Scenario 3: **Lovable Cloud on করা নেই** এমন project → Pluto যুক্ত

এটাই আসলে **Scenario 1**-এর মতো — কোনো backend নেই, Pluto add করলেই backend পেয়ে যাবেন।

Scenario 1-এর সব ধাপ follow করুন। কোনো Cloud disable/migrate করতে হবে না।

**অতিরিক্ত সুবিধা:** যেহেতু Cloud নেই, tokens/pricing conflict নেই — সবকিছু directly Pluto-তে যাবে।

---

## 🛠️ GitHub থেকে project Lovable-এ import করা

মনে রাখবেন: **Lovable এখনো existing GitHub repo সরাসরি import করে না।** ৩টা option:

1. **নতুন project তৈরি → GitHub sync → code paste**
   - Lovable-এ নতুন blank project
   - **Plus (+) → GitHub → Connect project** → নতুন repo তৈরি
   - GitHub-এ manually আপনার পুরানো code push করুন সেই নতুন repo-তে
   - Lovable auto-sync করবে

2. **Local clone → Lovable editor-এ chat-এ paste**
   - GitHub থেকে repo clone
   - Lovable-এ file-by-file paste (ছোট project-এর জন্য)

3. **Remix + manual copy**
   - পুরানো Lovable project থেকে থাকলে **Remix** করুন
   - তারপর Pluto যুক্ত করুন

তারপর উপরের Scenario 1/2/3 follow করে Pluto connect করুন।

---

## 🎁 আমি এখন যা তৈরি করতে পারি

আপনি চাইলে এই files তৈরি করে দেব:

1. **`docs/CONNECT-LOVABLE-FRONTEND.md`** — এই পুরো guide markdown ফাইল
2. **`examples/lovable-frontend/pluto-client.ts`** — ready copy-paste SDK setup
3. **`examples/lovable-frontend/.env.example`** — env template
4. **`examples/lovable-frontend/auth-example.tsx`** — sign in/up component
5. **`examples/lovable-frontend/data-example.tsx`** — CRUD + realtime example
6. **Dashboard-এ নতুন page** `/dashboard/integrations/lovable-frontend` — copy-paste ready keys, CORS UI, SDK snippets, tester button

## ❓ পরের ধাপ কী?

আপনি জানান:
- **আপনার এখন কোন scenario?** (1 / 2 / 3)
- **উপরের ৬টা file তৈরি করব?** (yes/select)
- **আপনার GitHub repo-এর নাম কী?** (আমি সেটাকে target করে specific guide বানাতে পারব)
