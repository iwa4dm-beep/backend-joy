import type { PageHelp } from "@/lib/help/types";

// /dashboard/scaling — job queue depth, cache, rate-limit policies.
export const dashboardScalingHelp: PageHelp = {
  slug: "dashboard.scaling",
  page: {
    title: { bn: "Scaling & Performance — queue, cache, rate-limit", en: "Scaling & Performance — queues, cache, rate-limits" },
    whatItDoes: {
      bn: "Backend-এর tuning knob: job queue concurrency, cache TTL/eviction, per-role/per-IP rate-limit policy — একই জায়গায় configure ও monitor।",
      en: "Backend tuning knobs: job queue concurrency, cache TTL/eviction, per-role/per-IP rate-limit policies — configure and monitor in one place.",
    },
    whyItMatters: {
      bn: "Traffic spike-এ কী bottleneck (worker/cache/rate-limit) সেটা এখান থেকেই বোঝা যায়। Default value সব সময় fit করে না — workload অনুযায়ী tune লাগে।",
      en: "During traffic spikes, this shows which bottleneck (worker/cache/rate-limit) is biting. Defaults don't fit every workload — tune to your traffic.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "Tab: Queues · Cache · Rate limits · Autoscale hints।", en: "Tabs: Queues · Cache · Rate limits · Autoscale hints." },
    },
    {
      id: "queues",
      title: { bn: "Queue concurrency", en: "Queue concurrency" },
      whatItDoes: { bn: "Per-queue worker count + prefetch → throughput নিয়ন্ত্রণ।", en: "Per-queue worker count + prefetch → controls throughput." },
      howToUse: [
        { bn: "ধাপ ১: queue বাছাই → 'Concurrency' edit।", en: "Step 1: pick queue → edit 'Concurrency'." },
        { bn: "ধাপ ২: value বাড়ালে throughput বাড়ে কিন্তু DB pool চাপে — 5-10 থেকে শুরু করে monitor।", en: "Step 2: raising throughput also strains the DB pool — start at 5-10 and watch." },
      ],
    },
    {
      id: "cache",
      title: { bn: "Cache management", en: "Cache management" },
      whatItDoes: { bn: "Per-key TTL, eviction policy (LRU/LFU), invalidation trigger।", en: "Per-key TTL, eviction policy (LRU/LFU), and invalidation triggers." },
      howToUse: [
        { bn: "ধাপ ১: 'Namespaces' → TTL edit বা 'Purge' চাপুন।", en: "Step 1: 'Namespaces' → edit TTL or 'Purge'." },
        { bn: "ধাপ ২: hit-rate < 60% হলে TTL বাড়ানো বা key strategy পুনর্বিবেচনা।", en: "Step 2: hit-rate < 60% — raise TTL or rethink key strategy." },
      ],
    },
    {
      id: "rate-limit",
      title: { bn: "Rate limit policy", en: "Rate-limit policies" },
      whatItDoes: { bn: "Per-role (anon/auth/service) ও per-IP token bucket rules।", en: "Per-role (anon/auth/service) and per-IP token-bucket rules." },
      howToUse: [
        { bn: "ধাপ ১: '+ New policy' → scope + limit (req/min) + burst।", en: "Step 1: '+ New policy' → scope + limit (req/min) + burst." },
        { bn: "ধাপ ২: 'Dry-run' দিয়ে current traffic-এ কত request block হতো preview।", en: "Step 2: 'Dry-run' shows how many current requests would be blocked." },
        { bn: "ধাপ ৩: Save → live enforce; violation log-এ যায়।", en: "Step 3: Save → live enforcement; violations land in logs." },
      ],
      troubleshooting: [
        { problem: { bn: "User 429 পাচ্ছে কিন্তু policy loose", en: "Users get 429 despite a loose policy" }, solution: { bn: "Per-IP policy check করুন — NAT-এর পিছনে বহু user share হলে aggregated hit বেশি হয়।", en: "Check per-IP policies — many users behind NAT aggregate hits." } },
      ],
    },
  ],
  glossary: [
    { term: "prefetch", definition: { bn: "Worker একবারে queue থেকে কত job নেবে।", en: "How many jobs a worker pulls from the queue at once." } },
    { term: "token bucket", definition: { bn: "Rate limit algorithm — bucket-এ token জমে, request token খায়।", en: "Rate-limit algorithm — tokens refill in a bucket, requests spend them." } },
    { term: "hit rate", definition: { bn: "Cache-এ পাওয়ার শতাংশ (higher = better)।", en: "Percentage of cache hits (higher = better)." } },
  ],
};
