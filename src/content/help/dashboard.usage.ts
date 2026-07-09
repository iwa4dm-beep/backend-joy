import type { PageHelp } from "@/lib/help/types";

// /dashboard/usage — metered usage + quota enforcement per workspace.
export const dashboardUsageHelp: PageHelp = {
  slug: "dashboard.usage",
  page: {
    title: { bn: "Usage & Quotas — metered consumption + soft/hard limit", en: "Usage & Quotas — metered consumption + soft/hard limits" },
    whatItDoes: {
      bn: "Workspace-per metered usage (DB storage, egress bandwidth, function invocation, AI token, active user) track ও soft/hard quota enforce। Environment-aware billing label সহ।",
      en: "Per-workspace metered usage (DB storage, egress, function invocations, AI tokens, MAU) tracked with soft/hard quota enforcement and environment-aware billing labels.",
    },
    whyItMatters: {
      bn: "Bill shock এড়াতে soft quota → notify, hard quota → throttle লাগে। এই page-ই একমাত্র জায়গা যেখানে current consumption vs limit real-time দেখা যায়।",
      en: "Avoid bill shock — soft quota notifies, hard quota throttles. This is the only place with real-time consumption vs limit.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "উপরে meter cards (DB/egress/functions/AI/MAU), নিচে quota policy list ও usage timeline chart।", en: "Meter cards (DB/egress/functions/AI/MAU) on top; quota policies + usage timeline chart below." },
    },
    {
      id: "meters",
      title: { bn: "Meter reading", en: "Reading the meters" },
      whatItDoes: { bn: "প্রতিটি card-এ current period consumption + last period comparison + projection।", en: "Each card shows current-period consumption + last-period comparison + a projection." },
      howToUse: [
        { bn: "ধাপ ১: meter card চাপুন → hourly/daily breakdown chart।", en: "Step 1: click a card → hourly/daily breakdown chart." },
        { bn: "ধাপ ২: 'Attribute' চাপলে কোন endpoint/user/token সবচেয়ে বেশি consume করছে।", en: "Step 2: 'Attribute' shows which endpoint/user/token consumes most." },
      ],
    },
    {
      id: "quota",
      title: { bn: "Quota policy set", en: "Setting quota policies" },
      whatItDoes: { bn: "Metric + threshold + action (notify / throttle / hard-block) দিয়ে policy। Soft = warn, hard = enforce।", en: "Metric + threshold + action (notify / throttle / hard-block). Soft = warn, hard = enforce." },
      howToUse: [
        { bn: "ধাপ ১: '+ Add policy' → metric বাছাই।", en: "Step 1: '+ Add policy' → pick metric." },
        { bn: "ধাপ ২: soft (80%) → email; hard (100%) → 429 return।", en: "Step 2: soft (80%) → email; hard (100%) → return 429." },
        { bn: "ধাপ ৩: dev/staging/prod environment tag → billing label আলাদা হবে।", en: "Step 3: dev/staging/prod tags → distinct billing labels." },
      ],
      troubleshooting: [
        { problem: { bn: "Meter শূন্য দেখাচ্ছে কিন্তু traffic আছে", en: "Meter shows zero despite traffic" }, solution: { bn: "Ingestion lag ~5 min; refresh → check timezone → workspace scope correct কিনা।", en: "~5 min ingestion lag; refresh, check timezone, confirm workspace scope." } },
        { problem: { bn: "Hard quota trigger করেছে কিন্তু block হচ্ছে না", en: "Hard quota triggered but nothing blocked" }, solution: { bn: "Policy enabled toggle off আছে কিনা দেখুন; environment mismatch হলে wrong scope।", en: "Check the policy's enabled toggle; environment mismatch = wrong scope." } },
      ],
    },
  ],
  glossary: [
    { term: "MAU", definition: { bn: "Monthly Active Users — মাসে unique login-করা user।", en: "Monthly Active Users — unique logins per month." } },
    { term: "egress", definition: { bn: "Server থেকে বাইরে পাঠানো bytes (bandwidth)।", en: "Outbound bytes from the server (bandwidth)." } },
    { term: "soft/hard quota", definition: { bn: "Soft = warn only; hard = block/throttle।", en: "Soft = warn only; hard = block/throttle." } },
  ],
};
