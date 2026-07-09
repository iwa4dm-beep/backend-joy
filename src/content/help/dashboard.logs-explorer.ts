import type { PageHelp } from "@/lib/help/types";

// /dashboard/logs-explorer — advanced log query with aggregation & saved views.
export const dashboardLogsExplorerHelp: PageHelp = {
  slug: "dashboard.logs-explorer",
  page: {
    title: { bn: "Logs Explorer — advanced query & aggregation", en: "Logs Explorer — advanced query & aggregation" },
    whatItDoes: {
      bn: "Log-এর উপর SQL-like query, aggregation (count/avg/p95 by column), time bucket, ও saved view। /dashboard/logs-এর simple filter-এর চেয়ে অনেক বেশি powerful।",
      en: "SQL-like queries over logs, aggregations (count/avg/p95 by column), time bucketing, and saved views. Far more powerful than the /dashboard/logs filter bar.",
    },
    whyItMatters: {
      bn: "'গত 24h-এ কোন 5 টা endpoint সবচেয়ে বেশি 500 দিয়েছে?' — filter দিয়ে অসম্ভব, aggregate query দিয়ে ৫ সেকেন্ডে।",
      en: "'Which 5 endpoints threw the most 500s in the last 24h?' — impossible with plain filters, 5 seconds with an aggregate query.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "Editor উপরে (query DSL), result table + chart নিচে, বাঁ side-এ saved views + column dictionary।", en: "Editor on top (query DSL), results + chart below, left rail with saved views and column dictionary." },
    },
    {
      id: "query",
      title: { bn: "Query লেখা", en: "Writing a query" },
      whatItDoes: { bn: "WHERE / GROUP BY / ORDER BY / LIMIT সহ SQL-flavored DSL, plus `count()`, `avg()`, `p95()`, `bucket(time, '5m')`।", en: "SQL-flavored DSL with WHERE / GROUP BY / ORDER BY / LIMIT, plus `count()`, `avg()`, `p95()`, `bucket(time, '5m')`." },
      howToUse: [
        { bn: "ধাপ ১: 'New query' → template থেকে বা blank।", en: "Step 1: 'New query' → template or blank." },
        { bn: "ধাপ ২: WHERE clause-এ filter (status >= 500 AND service = 'rest')।", en: "Step 2: WHERE clause (status >= 500 AND service = 'rest')." },
        { bn: "ধাপ ৩: GROUP BY path + ORDER BY count() DESC।", en: "Step 3: GROUP BY path + ORDER BY count() DESC." },
        { bn: "ধাপ ৪: Run → table + auto-generated chart।", en: "Step 4: Run → table + auto-generated chart." },
      ],
    },
    {
      id: "saved-views",
      title: { bn: "Saved view ও share", en: "Saved views & sharing" },
      whatItDoes: { bn: "Team-এর সাথে reusable dashboard query share করার জায়গা।", en: "Share reusable dashboard queries with the team." },
      howToUse: [
        { bn: "ধাপ ১: query run করার পর 'Save' → নাম দিন।", en: "Step 1: after running, 'Save' → name it." },
        { bn: "ধাপ ২: URL copy করে teammate-কে দিন — permalink।", en: "Step 2: copy URL — it's a permalink." },
        { bn: "ধাপ ৩: 'Pin to dashboard' চাপলে overview-এ chart হিসেবে দেখাবে।", en: "Step 3: 'Pin to dashboard' surfaces the chart on the overview." },
      ],
      troubleshooting: [
        { problem: { bn: "Query timeout", en: "Query times out" }, solution: { bn: "Time range narrow করুন বা LIMIT কমান; aggregate ছাড়া raw scan expensive।", en: "Narrow the time range or lower LIMIT; raw scans without aggregation are expensive." } },
        { problem: { bn: "Chart auto-render হচ্ছে না", en: "Chart didn't render" }, solution: { bn: "Result-এ time column না থাকলে chart auto-generate হয় না — `bucket(time, '5m')` যোগ করুন।", en: "No time column → no auto-chart. Add `bucket(time, '5m')`." } },
      ],
    },
  ],
  glossary: [
    { term: "bucket", definition: { bn: "Time-কে fixed interval-এ group করা (5m/1h/1d)।", en: "Grouping time into fixed intervals (5m/1h/1d)." } },
    { term: "p95", definition: { bn: "95-th percentile — 95% row এই value-এর নিচে।", en: "95th percentile — 95% of rows fall below." } },
    { term: "saved view", definition: { bn: "নাম দিয়ে reuse-এর জন্য save করা query।", en: "A named query saved for reuse." } },
  ],
};
