import type { PageHelp } from "@/lib/help/types";

export const dashboardDevexHelp: PageHelp = {
  slug: "dashboard.devex",
  page: {
    title: { bn: "Developer Experience — templates, tokens, webhooks, plugins", en: "Developer Experience — templates, tokens, webhooks, plugins" },
    whatItDoes: {
      bn: "Project templates, personal access tokens (scoped/expiring), outbound webhooks ও installed plugins এক জায়গা থেকে manage করুন।",
      en: "Manage project templates, personal access tokens (scoped/expiring), outbound webhooks, and installed plugins in one place.",
    },
    whyItMatters: {
      bn: "Developer productivity tooling scattered থাকলে onboarding slow হয়; এখানে সবকিছু এক surface-এ।",
      en: "Scattered developer tooling slows onboarding; this centralizes everything on one surface.",
    },
  },
  sections: [
    {
      id: "templates",
      title: { bn: "Project templates", en: "Project templates" },
      whatItDoes: { bn: "Pre-configured schema + seed + policies bundle যা নতুন প্রজেক্টে এক ক্লিকে apply হয়।", en: "Pre-configured schema + seed + policies bundle applied to a new project in one click." },
    },
    {
      id: "tokens",
      title: { bn: "Personal access tokens", en: "Personal access tokens" },
      whatItDoes: { bn: "Scoped ও expiring token mint করুন CLI/CI ব্যবহারের জন্য।", en: "Mint scoped and expiring tokens for CLI/CI use." },
      howToUse: [
        { bn: "Scope বেছে expiry preset নির্বাচন করুন।", en: "Pick scopes and an expiry preset." },
        { bn: "Mint চাপুন এবং plaintext token সঙ্গে সঙ্গে সেভ করুন — পরে দেখানো হবে না।", en: "Click Mint and save the plaintext token immediately — it won't be shown again." },
      ],
      troubleshooting: [
        { problem: { bn: "CI 401 হচ্ছে", en: "CI hitting 401" }, solution: { bn: "Token expired অথবা scope-এ missing action — regenerate করুন।", en: "Token expired or missing the needed scope — regenerate." } },
      ],
    },
    {
      id: "webhooks",
      title: { bn: "Outbound webhooks", en: "Outbound webhooks" },
      whatItDoes: { bn: "Event subscription তৈরি করুন এবং failed delivery replay করুন।", en: "Create event subscriptions and replay failed deliveries." },
    },
    {
      id: "plugins",
      title: { bn: "Installed plugins", en: "Installed plugins" },
      whatItDoes: { bn: "Workspace-এ enabled plugins দেখুন এবং toggle করুন।", en: "See enabled plugins for the workspace and toggle them." },
    },
  ],
  glossary: [
    { term: "scope", definition: { bn: "Token কোন কোন API-তে access পাবে তার সীমা।", en: "The set of APIs a token is allowed to access." } },
  ],
};
