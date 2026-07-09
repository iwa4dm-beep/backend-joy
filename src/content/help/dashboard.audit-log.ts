import type { PageHelp } from "@/lib/help/types";

// /dashboard/audit-log — write-only append-only audit ledger.
export const dashboardAuditLogHelp: PageHelp = {
  slug: "dashboard.audit-log",
  page: {
    title: { bn: "Audit Log — append-only actor trail", en: "Audit Log — append-only actor trail" },
    whatItDoes: {
      bn: "কোন actor (user/service token) কোন resource-এ কী করলো তার immutable, tamper-evident log। Write-only, admin-view-only।",
      en: "Immutable, tamper-evident record of which actor (user/service token) did what to which resource. Write-only, admin-viewable.",
    },
    whyItMatters: {
      bn: "SOC 2 / GDPR / HIPAA compliance-এ কে data access/modify করলো সেটা প্রমাণ করতে হয়। Log-এ থাকা মানে audit prove করা যায়; log না থাকলে fine বা customer trust-loss।",
      en: "SOC 2 / GDPR / HIPAA require proving who touched what. Log present = provable; log absent = fines and lost customer trust.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "Filter bar (actor, action, resource type, time) + row list — প্রতিটি row-এ before/after diff।", en: "Filter bar (actor, action, resource type, time) + row list — each row has a before/after diff." },
    },
    {
      id: "search",
      title: { bn: "Search ও filter", en: "Search & filter" },
      whatItDoes: { bn: "Search ও filter", en: "Search & filter" },
      howToUse: [
        { bn: "ধাপ ১: actor = user@email বা token prefix দিন।", en: "Step 1: actor = user@email or token prefix." },
        { bn: "ধাপ ২: action dropdown (create/update/delete/access/config_change)।", en: "Step 2: action dropdown (create/update/delete/access/config_change)." },
        { bn: "ধাপ ৩: resource type/id (`table:users:42`)।", en: "Step 3: resource type/id (`table:users:42`)." },
        { bn: "ধাপ ৪: time range → Apply।", en: "Step 4: time range → Apply." },
      ],
    },
    {
      id: "diff",
      title: { bn: "Before/after diff", en: "Before/after diff" },
      whatItDoes: { bn: "Update event-এ কোন column change হয়েছে সেটা JSON diff-এ দেখা যায়।", en: "For update events, JSON diff shows which columns changed." },
      howToUse: [
        { bn: "ধাপ ১: row expand → 'Diff' tab।", en: "Step 1: expand a row → 'Diff' tab." },
        { bn: "ধাপ ২: sensitive value redacted হলে elevated role লাগবে unredact-এ।", en: "Step 2: redacted sensitive values need an elevated role to unredact." },
      ],
    },
    {
      id: "export",
      title: { bn: "Compliance export", en: "Compliance export" },
      whatItDoes: { bn: "Auditor-কে দেওয়ার জন্য CSV/JSONL-এ range export, HMAC-signed manifest সহ।", en: "Export a date range as CSV/JSONL with an HMAC-signed manifest for auditors." },
      howToUse: [
        { bn: "ধাপ ১: 'Export' → format + date range।", en: "Step 1: 'Export' → format + date range." },
        { bn: "ধাপ ২: download link + manifest hash pair auditor-কে দিন।", en: "Step 2: hand the download link + manifest hash to the auditor." },
      ],
      troubleshooting: [
        { problem: { bn: "Event missing — expected একটা log আসেনি", en: "Missing event — expected log never appeared" }, solution: { bn: "Action ঐ resource type-এ instrumented কিনা check করুন; RLS bypass path হতে পারে (audit trigger missing)।", en: "Verify the action is instrumented on that resource type — RLS bypass paths may miss triggers." } },
      ],
    },
  ],
  glossary: [
    { term: "tamper-evident", definition: { bn: "পরিবর্তন হলে detect হয় এমন structure (hash chain)।", en: "Structure (hash chain) where any tampering is detectable." } },
    { term: "actor", definition: { bn: "Action-এর subject — user, service token, বা automated job।", en: "Subject of an action — user, service token, or automated job." } },
    { term: "resource", definition: { bn: "Action-এর object — table row, bucket file, config key ইত্যাদি।", en: "Object of an action — table row, bucket file, config key, etc." } },
  ],
};
