import type { PageHelp } from "@/lib/help/types";

// /dashboard/logs — Auth / REST / Storage / Admin API request logs.
export const dashboardLogsHelp: PageHelp = {
  slug: "dashboard.logs",
  page: {
    title: { bn: "Logs — Auth, REST, Storage, Admin API", en: "Logs — Auth, REST, Storage, Admin API" },
    whatItDoes: {
      bn: "Backend-এর সব incoming request-এর raw log: method, path, status, latency, user_id, IP, user-agent। Filter দিয়ে quickly slice।",
      en: "Raw logs for every backend request: method, path, status, latency, user_id, IP, user-agent. Filter to slice quickly.",
    },
    whyItMatters: {
      bn: "'User bলছে fail করে' — এটাই একমাত্র source of truth। এখানে না দেখলে kya broken জানা যাবে না।",
      en: "'A user says it's failing' — this is the only source of truth. If it's not here, you can't tell what broke.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "উপরে filter bar (service, method, status, path, time), নিচে log row list।", en: "Top: filter bar (service, method, status, path, time). Below: log rows." },
    },
    {
      id: "filter",
      title: { bn: "Filter দিয়ে খোঁজা", en: "Filtering" },
      whatItDoes: { bn: "Filter combine করে narrow করুন — যেমন status=5xx + service=auth + last 1h।", en: "Combine filters — e.g. status=5xx + service=auth + last 1h." },
      howToUse: [
        { bn: "ধাপ ১: service dropdown → auth/rest/storage/admin।", en: "Step 1: service dropdown → auth/rest/storage/admin." },
        { bn: "ধাপ ২: status = 4xx বা 5xx দিয়ে error isolate।", en: "Step 2: status = 4xx or 5xx to isolate errors." },
        { bn: "ধাপ ৩: path contains দিয়ে specific endpoint।", en: "Step 3: 'path contains' for a specific endpoint." },
        { bn: "ধাপ ৪: time range picker → live tail / historic।", en: "Step 4: time range picker → live tail or historic." },
      ],
    },
    {
      id: "row-detail",
      title: { bn: "Row detail", en: "Row detail" },
      whatItDoes: { bn: "Row expand করলে headers, request body (redacted), response body, downstream trace link।", en: "Expand a row: headers, request body (redacted), response body, downstream trace link." },
      howToUse: [
        { bn: "ধাপ ১: row চাপুন → detail panel।", en: "Step 1: click a row → detail panel." },
        { bn: "ধাপ ২: 'Open trace' → /dashboard/observability-এর waterfall।", en: "Step 2: 'Open trace' → waterfall in /dashboard/observability." },
        { bn: "ধাপ ৩: 'Copy curl' → CLI-তে reproduce করুন।", en: "Step 3: 'Copy curl' to reproduce on the CLI." },
      ],
      troubleshooting: [
        { problem: { bn: "Log পাচ্ছি না — 'no results'", en: "'No results'" }, solution: { bn: "Retention 7 দিন default; time range widen বা filter loosen করুন।", en: "Default retention 7 days — widen the time range or loosen filters." } },
        { problem: { bn: "Body redacted দেখাচ্ছে", en: "Body shows [redacted]" }, solution: { bn: "PII/secret pattern detect হলে auto-redact; unredacted access needs elevated role।", en: "PII/secret patterns auto-redact; unredacted access needs an elevated role." } },
      ],
    },
  ],
  glossary: [
    { term: "structured log", definition: { bn: "JSON key/value log যাতে filter সহজ।", en: "JSON key/value log easy to filter." } },
    { term: "redaction", definition: { bn: "PII/secret pattern log-এ mask করা।", en: "Masking PII/secret patterns in logs." } },
    { term: "live tail", definition: { bn: "Real-time incoming log stream (like `tail -f`)।", en: "Real-time incoming stream (like `tail -f`)." } },
  ],
};
