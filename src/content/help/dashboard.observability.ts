import type { PageHelp } from "@/lib/help/types";

// /dashboard/observability — metrics, traces, GDPR data-subject requests.
export const dashboardObservabilityHelp: PageHelp = {
  slug: "dashboard.observability",
  page: {
    title: { bn: "Observability — metric, trace, GDPR request", en: "Observability — metrics, traces, GDPR requests" },
    whatItDoes: {
      bn: "Backend-এর health metric (RPS, error rate, p50/p95/p99 latency), distributed trace, এবং GDPR data-subject request (export/delete) — সব এক dashboard-এ।",
      en: "Backend health metrics (RPS, error rate, p50/p95/p99 latency), distributed traces, and GDPR data-subject requests (export/delete) — one dashboard.",
    },
    whyItMatters: {
      bn: "Production incident-এ 'কী broken?' এর answer এখান থেকেই আসে। GDPR request 30 দিনের SLA-তে fulfill করতে হয়, তাই central tracker না থাকলে fine risk।",
      en: "Production incidents get diagnosed here. GDPR requests carry a 30-day SLA — without a central tracker you risk fines.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "Tab: Metrics · Traces · SLO · GDPR requests। প্রতিটি tab-এ time range + filter।", en: "Tabs: Metrics · Traces · SLO · GDPR requests. Each has a time range + filters." },
    },
    {
      id: "metrics",
      title: { bn: "Metric ও SLO", en: "Metrics & SLOs" },
      whatItDoes: { bn: "Per-endpoint RPS, error %, latency histogram; SLO target (99.9% availability) violation flag হয়।", en: "Per-endpoint RPS, error %, latency histogram; SLO target (99.9% availability) breaches are flagged." },
      howToUse: [
        { bn: "ধাপ ১: time range বাছাই (1h/24h/7d)।", en: "Step 1: pick time range (1h/24h/7d)." },
        { bn: "ধাপ ২: endpoint filter → graph zoom করে spike inspect।", en: "Step 2: filter endpoint → zoom the graph to inspect spikes." },
        { bn: "ধাপ ৩: SLO tab-এ error budget consumed % দেখুন।", en: "Step 3: SLO tab shows error-budget consumption %." },
      ],
    },
    {
      id: "traces",
      title: { bn: "Distributed trace", en: "Distributed traces" },
      whatItDoes: { bn: "একটা request-এর সব span (auth → db → external call) waterfall-এ; slow span highlight।", en: "All spans (auth → db → external call) for a single request as a waterfall; slow spans highlighted." },
      howToUse: [
        { bn: "ধাপ ১: trace id / request id দিয়ে search বা slow trace list থেকে বাছাই।", en: "Step 1: search by trace / request id, or pick from the slow-trace list." },
        { bn: "ধাপ ২: waterfall-এ longest span find করুন — সেটাই bottleneck।", en: "Step 2: the longest span in the waterfall is your bottleneck." },
      ],
    },
    {
      id: "gdpr",
      title: { bn: "GDPR data-subject request", en: "GDPR data-subject requests" },
      whatItDoes: { bn: "User-এর 'আমার data export করুন' বা 'আমার data delete করুন' request track ও fulfill করার UI।", en: "Track and fulfill user 'export my data' / 'delete my data' requests." },
      howToUse: [
        { bn: "ধাপ ১: incoming request row-এ 'Verify identity' চাপুন।", en: "Step 1: click 'Verify identity' on the incoming request." },
        { bn: "ধাপ ২: type = Export হলে 'Generate archive' → download link।", en: "Step 2: Export → 'Generate archive' → download link." },
        { bn: "ধাপ ৩: type = Delete হলে 'Preview scope' দেখে 'Confirm delete'।", en: "Step 3: Delete → 'Preview scope' → 'Confirm delete'." },
        { bn: "ধাপ ৪: SLA (30 দিন) countdown badge-এ দেখা যায়।", en: "Step 4: SLA (30 days) countdown shown as a badge." },
      ],
      troubleshooting: [
        { problem: { bn: "Latency spike হঠাৎ", en: "Sudden latency spike" }, solution: { bn: "Trace tab-এ ঐ time-এর slow trace বাছাই → বাইরের API/DB query কোনটা slow দেখুন।", en: "Use Traces tab for that window — inspect which external API / DB query slowed down." } },
      ],
    },
  ],
  glossary: [
    { term: "SLO", definition: { bn: "Service Level Objective — যেমন 99.9% success rate।", en: "Service Level Objective — e.g. 99.9% success." } },
    { term: "p95 latency", definition: { bn: "৯৫% request এর নিচে যে latency।", en: "The latency 95% of requests come in under." } },
    { term: "trace", definition: { bn: "একটা request-এর সব service call-এর causal chain।", en: "The causal chain of every service call in one request." } },
    { term: "error budget", definition: { bn: "SLO-এর নিচে যতটুকু error allowable, তার consumed %।", en: "Consumed % of the errors allowed under the SLO." } },
  ],
};
