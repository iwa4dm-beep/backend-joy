import type { PageHelp } from "@/lib/help/types";

// /dashboard/api — auto-generated REST endpoints from live SQL schema.
export const dashboardApiHelp: PageHelp = {
  slug: "dashboard.api",
  page: {
    title: { bn: "REST Endpoints — auto-generated API", en: "REST endpoints — auto-generated API" },
    whatItDoes: {
      bn: "আপনার live SQL schema থেকে auto-generate হওয়া REST endpoint এখানে দেখানো হয়। প্রতিটা workspace-scoped টেবিলের জন্য /rest/v1/-এর নিচে PostgREST-style resource তৈরি হয় — SELECT, INSERT, UPDATE, DELETE, RPC সব সাপোর্ট।",
      en: "Auto-generated REST endpoints derived from your live SQL schema. Each workspace-scoped table becomes a PostgREST-style resource under /rest/v1/ with SELECT, INSERT, UPDATE, DELETE, and RPC support.",
    },
    whyItMatters: {
      bn: "নতুন table/column যোগ করলে migration চালানোর পর এখান থেকেই curl example, OpenAPI spec, এবং typed TypeScript client পাওয়া যাবে — আলাদা docs লিখতে হবে না।",
      en: "After each migration, get a copy-ready curl, OpenAPI spec, and typed TypeScript client here — no separate docs to maintain.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: {
        bn: "গ্রিডে প্রতিটা table কার্ড হিসেবে দেখাবে — উপরে endpoint URL, RLS badge, method list, নিচে 'curl', 'Typed client', 'OpenAPI', 'Try it' বাটন।",
        en: "Grid of table cards — endpoint URL + RLS badge + methods on top; 'curl', 'Typed client', 'OpenAPI', 'Try it' buttons below.",
      },
    },
    {
      id: "workflow",
      title: { bn: "ধাপে ধাপে ব্যবহার", en: "Step-by-step usage" },
      whatItDoes: {
        bn: "একটা table-এর জন্য curl বা typed client পাওয়ার সহজ flow।",
        en: "The simple flow to grab a curl or typed client for a table.",
      },
      howToUse: [
        { bn: "ধাপ ১: উপরে workspace ও schema (সাধারণত `public`) নিশ্চিত করুন।", en: "Step 1: confirm workspace + schema (usually `public`) on top." },
        { bn: "ধাপ ২: 'Refresh schema' চাপুন যদি সম্প্রতি migration চালিয়ে থাকেন।", en: "Step 2: hit 'Refresh schema' if you just ran a migration." },
        { bn: "ধাপ ৩: target table card খুঁজুন (search box ব্যবহার করতে পারেন)।", en: "Step 3: find the target table card (use the search box)." },
        { bn: "ধাপ ৪: 'curl' চাপুন → snippet clipboard-এ copy হবে; Authorization header-এ token বসিয়ে terminal-এ চালান।", en: "Step 4: click 'curl' → snippet copied to clipboard; paste your token into Authorization and run in a terminal." },
        { bn: "ধাপ ৫: 'Try it' চাপলে inline form খুলবে — filter/query দিয়ে সরাসরি call করে response দেখুন।", en: "Step 5: 'Try it' opens an inline form — set filters, call live, inspect the response." },
        { bn: "ধাপ ৬: 'Typed client' চাপলে .ts file download হবে; frontend project-এ drop-in করুন।", en: "Step 6: 'Typed client' downloads a .ts file — drop it into your frontend." },
      ],
    },
    {
      id: "auth",
      title: { bn: "Authentication ও token", en: "Authentication & tokens" },
      whatItDoes: {
        bn: "তিন ধরনের token — anon (public, RLS-এর মাধ্যমে সীমাবদ্ধ), authenticated (user-token, RLS-এর সাথে), service_role (RLS bypass, backend-only)।",
        en: "Three token kinds — anon (public, gated by RLS), authenticated (user token + RLS), service_role (bypasses RLS, backend-only).",
      },
      howToUse: [
        { bn: "ধাপ ১: /dashboard/tokens-এ গিয়ে token mint করুন।", en: "Step 1: mint a token at /dashboard/tokens." },
        { bn: "ধাপ ২: request-এ header দিন — `Authorization: Bearer <token>` এবং `apikey: <token>`।", en: "Step 2: send headers — `Authorization: Bearer <token>` and `apikey: <token>`." },
        { bn: "ধাপ ৩: service_role শুধু server-side জব-এ (edge function, cron) ব্যবহার করুন — কখনোই browser-এ না।", en: "Step 3: use service_role only server-side (edge functions, cron) — never in the browser." },
      ],
    },
    {
      id: "filters",
      title: { bn: "Filter / sort / paginate", en: "Filtering, sorting, pagination" },
      whatItDoes: {
        bn: "PostgREST convention follow করে — query string দিয়ে filter (?age=gt.18), sort (?order=name.asc), pagination (Range header বা ?limit=&offset=)।",
        en: "Follows PostgREST — filter via query string (?age=gt.18), sort (?order=name.asc), paginate via Range header or ?limit=&offset=.",
      },
      fields: [
        { name: "eq", purpose: { bn: "সমান হওয়া।", en: "Equals." }, example: "?status=eq.active" },
        { name: "gt / lt / gte / lte", purpose: { bn: "বড়/ছোট comparison।", en: "Comparison operators." }, example: "?age=gte.18" },
        { name: "in", purpose: { bn: "list-এর মধ্যে।", en: "In a list." }, example: "?id=in.(1,2,3)" },
        { name: "like / ilike", purpose: { bn: "Pattern match (ilike = case-insensitive)।", en: "Pattern match (ilike = case-insensitive)." }, example: "?name=ilike.*john*" },
        { name: "order", purpose: { bn: "Sort করা।", en: "Sort results." }, example: "?order=created_at.desc" },
      ],
    },
    {
      id: "policies",
      title: { bn: "Row-level policies", en: "Row-level policies" },
      whatItDoes: {
        bn: "প্রতিটা row-তে যে RLS policy active সেটা 🔒 icon দিয়ে দেখানো হয়; hover করলে policy expression দেখাবে। Policy না থাকলে anon token কিছুই দেখবে না।",
        en: "The 🔒 badge shows the active RLS policy; hover for the expression. With no policy, anon tokens see nothing.",
      },
      troubleshooting: [
        {
          problem: { bn: "কোনো endpoint দেখাচ্ছে না", en: "No endpoints shown" },
          solution: {
            bn: "Workspace select করা আছে কিনা দেখুন এবং /dashboard/verify থেকে backend health check করুন।",
            en: "Ensure a workspace is selected and check backend health at /dashboard/verify.",
          },
        },
        {
          problem: { bn: "'permission denied for table'", en: "'permission denied for table'" },
          solution: {
            bn: "RLS policy সেই role-কে allow করেনি — /dashboard/rbac-এ policy যোগ করুন অথবা service_role ব্যবহার করুন।",
            en: "RLS doesn't allow that role — add a policy at /dashboard/rbac or use service_role.",
          },
        },
        {
          problem: { bn: "OpenAPI spec download হচ্ছে না", en: "OpenAPI spec won't download" },
          solution: { bn: "Backend up আছে কিনা এবং /openapi endpoint reachable কিনা যাচাই করুন।", en: "Confirm backend is up and /openapi is reachable." },
        },
      ],
    },
  ],
  glossary: [
    { term: "PostgREST", definition: { bn: "PostgreSQL schema থেকে auto REST API convention — Pluto একই follow করে।", en: "Convention for generating a REST API from a PostgreSQL schema; Pluto follows the same shape." } },
    { term: "OpenAPI", definition: { bn: "REST API describe করার standard JSON/YAML spec।", en: "Standard JSON/YAML spec for describing REST APIs." } },
    { term: "RPC", definition: { bn: "Postgres function-কে POST endpoint হিসেবে expose করা।", en: "Exposing a Postgres function as a POST endpoint." } },
  ],
};
