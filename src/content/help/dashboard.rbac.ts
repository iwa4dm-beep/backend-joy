import type { PageHelp } from "@/lib/help/types";

// /dashboard/rbac — workspace-level RBAC (team & access).
export const dashboardRbacHelp: PageHelp = {
  slug: "dashboard.rbac",
  page: {
    title: { bn: "RBAC — Team ও access control", en: "RBAC — team & access control" },
    whatItDoes: {
      bn: "এই পেইজ থেকে Pluto workspace-এর admin/collaborator invite করা, তাদের workspace role (owner/admin/developer/viewer) set করা, এবং custom RLS policy তৈরি/edit করা যায়।",
      en: "Invite Pluto workspace admins/collaborators, set their workspace role (owner/admin/developer/viewer), and create/edit custom RLS policies.",
    },
    whyItMatters: {
      bn: "কে dashboard-এ কী করতে পারবে (SQL run, migration deploy, secret দেখা) এবং কোন data কে পড়তে/লিখতে পারবে — দুটোই এখান থেকে নিয়ন্ত্রিত হয়।",
      en: "Governs both who can do what in the dashboard (SQL, migrations, secrets) and who can read/write which data.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: {
        bn: "দুই ট্যাব — 'Members' (workspace admin/dev/viewer) এবং 'RLS policies' (data-level rule)।",
        en: "Two tabs — 'Members' (workspace admin/dev/viewer) and 'RLS policies' (data-level rules).",
      },
    },
    {
      id: "invite",
      title: { bn: "Workspace member invite", en: "Invite a workspace member" },
      whatItDoes: {
        bn: "এই invite end-user নয়, dashboard access-এর জন্য। Role চার ধরনের — owner, admin, developer, viewer।",
        en: "This invite is for dashboard access, not end-users. Four roles — owner, admin, developer, viewer.",
      },
      howToUse: [
        { bn: "ধাপ ১: 'Members' → '+ Invite member'।", en: "Step 1: 'Members' → '+ Invite member'." },
        { bn: "ধাপ ২: email + role দিন।", en: "Step 2: enter email + role." },
        { bn: "ধাপ ৩: 'Send invite' → email link দিয়ে join করবে।", en: "Step 3: 'Send invite' — they join via the emailed link." },
        { bn: "ধাপ ৪: role বদলাতে row-এর dropdown ব্যবহার করুন; remove করতে trash।", en: "Step 4: change role via row dropdown; trash to remove." },
      ],
      fields: [
        { name: "owner", purpose: { bn: "সব কিছু + workspace delete + billing।", en: "Everything + delete workspace + billing." } },
        { name: "admin", purpose: { bn: "সব কিছু কিন্তু workspace delete/billing না।", en: "Everything except delete/billing." } },
        { name: "developer", purpose: { bn: "SQL, migration, deploy কিন্তু member invite না।", en: "SQL, migrations, deploys — but no member invites." } },
        { name: "viewer", purpose: { bn: "শুধু read-only — কিছু edit বা delete করতে পারবে না।", en: "Read-only — no edits." } },
      ],
    },
    {
      id: "policies",
      title: { bn: "RLS policy তৈরি", en: "Creating RLS policies" },
      whatItDoes: {
        bn: "প্রতিটা টেবিলে কোন row কে দেখাবে/edit করাবে সেটা SQL expression দিয়ে define হয়। Pluto template দেয় (own rows only, org member only, public read)।",
        en: "SQL expressions decide which rows are visible/editable per table. Pluto ships templates (own rows only, org member only, public read).",
      },
      howToUse: [
        { bn: "ধাপ ১: 'RLS policies' → target table বাছাই।", en: "Step 1: 'RLS policies' → pick target table." },
        { bn: "ধাপ ২: '+ Add policy' → template বাছাই অথবা custom।", en: "Step 2: '+ Add policy' → template or custom." },
        { bn: "ধাপ ৩: name, command (SELECT/INSERT/UPDATE/DELETE/ALL), USING expression, WITH CHECK expression দিন।", en: "Step 3: name, command (SELECT/INSERT/UPDATE/DELETE/ALL), USING, WITH CHECK expressions." },
        { bn: "ধাপ ৪: 'Dry-run' চাপে sample rows-এ effect দেখুন।", en: "Step 4: 'Dry-run' to preview effect on sample rows." },
        { bn: "ধাপ ৫: 'Enable policy' → live হবে।", en: "Step 5: 'Enable policy' — it goes live." },
      ],
      troubleshooting: [
        {
          problem: { bn: "Policy add-এর পর সব row অদৃশ্য", en: "All rows vanish after adding a policy" },
          solution: { bn: "USING expression সবসময় false return করছে — auth.uid() বা auth.role() ঠিক আছে কিনা check করুন।", en: "USING always returns false — check auth.uid() / auth.role() work as expected." },
        },
        {
          problem: { bn: "INSERT fail, SELECT কাজ করছে", en: "INSERT fails but SELECT works" },
          solution: { bn: "WITH CHECK expression missing বা wrong — INSERT-এর জন্য আলাদা check লাগে।", en: "WITH CHECK expression is missing or wrong — INSERT needs its own check." },
        },
      ],
    },
    {
      id: "audit",
      title: { bn: "Audit trail", en: "Audit trail" },
      whatItDoes: { bn: "প্রতিটা role change ও policy edit /dashboard/audit-এ log হয়।", en: "Every role change and policy edit is logged in /dashboard/audit." },
    },
  ],
  glossary: [
    { term: "RLS", definition: { bn: "Row-Level Security — DB-এর ভিতরেই কোন user কোন row দেখবে সেটা enforce করে।", en: "Row-Level Security — the DB itself enforces which rows a user sees." } },
    { term: "USING vs WITH CHECK", definition: { bn: "USING → পড়ার নিয়ম; WITH CHECK → লেখার নিয়ম।", en: "USING → read rule; WITH CHECK → write rule." } },
  ],
};
