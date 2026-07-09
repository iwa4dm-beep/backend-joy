import type { PageHelp } from "@/lib/help/types";

export const dashboardPlutoSdkHelp: PageHelp = {
  slug: "dashboard.pluto-sdk",
  page: {
    title: { bn: "CLI ও Typed SDK", en: "CLI & Typed SDK" },
    whatItDoes: {
      bn: "প্রজেক্টের schema থেকে fully-typed TypeScript SDK generate করুন এবং CLI ব্যবহারের নির্দেশনা দেখুন।",
      en: "Generate a fully-typed TypeScript SDK from your project's schema and see CLI usage instructions.",
    },
    whyItMatters: {
      bn: "Hand-written client code drift করে; auto-generated typed SDK schema-এর সাথে সিঙ্ক থাকে, ফলে compile-time-এ bug ধরা পড়ে।",
      en: "Hand-written client code drifts from the schema; an auto-generated typed SDK stays in sync so bugs surface at compile time.",
    },
  },
  sections: [
    {
      id: "generate",
      title: { bn: "SDK generate", en: "Generate SDK" },
      whatItDoes: { bn: "Project ID ও schema list দিয়ে TypeScript SDK ফাইল তৈরি করুন।", en: "Produce a TypeScript SDK file from a project ID and schema list." },
      howToUse: [
        { bn: "Project ID পেস্ট করুন।", en: "Paste the Project ID." },
        { bn: "Schema names (comma-separated) দিন — ডিফল্ট `public`।", en: "Enter comma-separated schema names — defaults to `public`." },
        { bn: "Preview চাপে output দেখুন, Download চাপে `.ts` ফাইল save করুন।", en: "Click Preview to inspect, Download to save the `.ts` file." },
      ],
      troubleshooting: [
        { problem: { bn: "401/403 error", en: "401/403 error" }, solution: { bn: "Upstream URL এবং admin token সঠিকভাবে configure আছে কিনা Settings-এ verify করুন।", en: "Verify the upstream URL and admin token are configured in Settings." } },
      ],
    },
    {
      id: "cli",
      title: { bn: "Pluto CLI", en: "Pluto CLI" },
      whatItDoes: { bn: "`pluto` CLI দিয়ে migration, deploy, seed ইত্যাদি terminal থেকে চালানো যায়।", en: "The `pluto` CLI runs migrations, deploys, seeds, and more from the terminal." },
      howToUse: [
        { bn: "npm বা bun দিয়ে `@pluto/cli` install করুন।", en: "Install `@pluto/cli` via npm or bun." },
        { bn: "`pluto login` চালিয়ে personal token দিন।", en: "Run `pluto login` and paste a personal token." },
      ],
    },
  ],
  glossary: [
    { term: "schema", definition: { bn: "Postgres schema namespace, যেমন `public`।", en: "A Postgres schema namespace, e.g. `public`." } },
  ],
};
