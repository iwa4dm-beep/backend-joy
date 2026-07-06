# Lovable.dev Frontend → Pluto BaaS Backend

Lovable.dev-এ তৈরি যেকোনো frontend project-কে এই Pluto BaaS instance
(`https://api.timescard.cloud`) এর সাথে backend হিসেবে যুক্ত করার
step-by-step guide।

---

## 🎯 মূল ধারণা

Pluto BaaS = Supabase-compatible backend। যেকোনো Lovable frontend
(TanStack Start, Vite, Next.js) এটাকে HTTP API হিসেবে call করতে পারে।
লাগবে শুধু ২টা env var:

```env
VITE_PLUTO_URL=https://api.timescard.cloud
VITE_PLUTO_ANON_KEY=pk_anon_xxxxxxxxxxxx
```

> **⚠️ Never expose `service_role` key in browser code.** সেটা শুধু
> server function-এ (`createServerFn`) use করবেন।

Pluto SDK-র API surface intentionally Supabase-এর মতো, তাই আপনি চাইলে
`@supabase/supabase-js` থেকে migrate করতে পারবেন প্রায় zero code change-এ।

---

## 📋 Scenario 1 & 3: Cloud নেই এমন project → Pluto যুক্ত

আপনার Lovable project GitHub-এ আছে, Lovable Cloud enabled নেই (বা
কোনো backend নেই)। এই সেটআপ সবচেয়ে সহজ।

### ধাপ ১ — Pluto-তে project + keys
1. `https://backend-joy.lovable.app/dashboard` → **Projects → New Project**
2. **Settings → API Keys** → `anon` (publishable) key copy করুন
3. **Dashboard → CORS** → frontend-এর origin add করুন:
   - `http://localhost:8080` (Lovable preview)
   - `http://localhost:5173` (local Vite)
   - `https://<your-project>.lovable.app` (published)
   - custom domain থাকলে সেটাও

### ধাপ ২ — SDK install
Lovable editor chat-এ বলুন:
```
bun add @pluto/js
```

### ধাপ ৩ — Env vars
`.env` ফাইলে (Lovable Cloud enabled হলে **Cloud → Secrets** এ):
```env
VITE_PLUTO_URL=https://api.timescard.cloud
VITE_PLUTO_ANON_KEY=pk_anon_xxxxxxxxxxxx
```

### ধাপ ৪ — Client setup
`src/lib/pluto.ts` create করুন — [examples/lovable-frontend/pluto-client.ts](../examples/lovable-frontend/pluto-client.ts) দেখুন।

### ধাপ ৫ — Database schema
Pluto Dashboard → **SQL Editor**:
```sql
CREATE TABLE public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own posts" ON public.posts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### ধাপ ৬ — Auth + Data + Storage
[examples/lovable-frontend/auth-example.tsx](../examples/lovable-frontend/auth-example.tsx)
এবং [data-example.tsx](../examples/lovable-frontend/data-example.tsx) দেখুন।

---

## 📋 Scenario 2: Lovable Cloud **on করা** project → Pluto যুক্ত

Project-এ Lovable Cloud (Supabase) already enabled। ২টা approach:

### Approach A — Hybrid (recommended, no migration)
Lovable Cloud যা আছে থাক, Pluto শুধু নতুন feature-এর জন্য।

| Use case | Cloud (Supabase) | Pluto |
|---|---|---|
| User auth | ✅ existing | — |
| App tables | ✅ existing | — |
| নতুন Realtime channel | — | ✅ |
| Vector search / AI | — | ✅ |
| Multi-tenant admin data | — | ✅ |

**ধাপ:**
1. Scenario 1-এর ধাপ ১-৪ follow করুন
2. Existing `src/integrations/supabase/client.ts` কিছুই পরিবর্তন করবেন না
3. নতুন `src/lib/pluto.ts` add করুন
4. যেখানে Pluto চান শুধু `pluto.*` call করুন
5. Pluto Dashboard → CORS-এ আপনার Lovable published URL + preview URL add করুন

### Approach B — Full migration (Cloud → Pluto)
সব Cloud থেকে Pluto-তে move।

**ধাপ:**
1. **Cloud data export:** Cloud tab → Advanced settings → Export data (SQL dump)
2. **Pluto-তে import:** SQL Editor-এ dump paste করে run করুন
3. **User migration:** Supabase `auth.users` → Pluto `auth.users` (bulk import API-এর জন্য Pluto support docs দেখুন)
4. **Code refactor:**
   ```ts
   // আগে
   import { supabase } from "@/integrations/supabase/client";
   const { data } = await supabase.from("posts").select("*");

   // পরে
   import { pluto } from "@/lib/pluto";
   const { data } = await pluto.from("posts").select("*");
   ```
   API surface প্রায় identical, তাই সাধারণত শুধু import path change লাগে।
5. **Cloud disable:** Cloud tab → Disconnect

---

## 🛠️ GitHub থেকে existing Lovable project import

Lovable এখনো existing GitHub repo সরাসরি import করে না। Workaround:

1. Lovable-এ নতুন blank project তৈরি করুন
2. **Plus (+) → GitHub → Connect project** → নতুন empty repo তৈরি হবে
3. Local-এ পুরানো repo clone, তারপর নতুন repo-তে code push:
   ```bash
   git clone <old-repo> && cd <old-repo>
   git remote set-url origin <new-lovable-repo-url>
   git push -u origin main --force
   ```
4. Lovable auto-sync করে code load করবে
5. উপরের Scenario 1/2 follow করে Pluto connect করুন

---

## ✅ Quick verify

Frontend থেকে console-এ:
```ts
import { pluto } from "@/lib/pluto";
const { data, error } = await pluto.from("posts").select("*").limit(1);
console.log({ data, error });
```

Success = Pluto connected. `error.status: 401` = key/CORS issue। `error.status: 404` = table নেই।

---

## 📚 আরও দেখুন

- SDK reference: `pluto-backend/packages/sdk-js/README.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Dashboard integration page: `/dashboard/integrations/lovable-frontend`
