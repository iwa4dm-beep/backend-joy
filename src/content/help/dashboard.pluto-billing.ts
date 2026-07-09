import type { PageHelp } from "@/lib/help/types";

// /dashboard/pluto-billing — billing plan, invoices, spend alerts.
export const dashboardPlutoBillingHelp: PageHelp = {
  slug: "dashboard.pluto-billing",
  page: {
    title: { bn: "Billing & Alerts — plan, invoice, spend limit", en: "Billing & Alerts — plans, invoices, spend limits" },
    whatItDoes: {
      bn: "Current plan (free/pro/team/enterprise), invoice history, payment method, এবং spend alert (email/webhook) configure করার UI।",
      en: "Current plan (free/pro/team/enterprise), invoice history, payment method, and spend alerts (email/webhook) configuration.",
    },
    whyItMatters: {
      bn: "Usage vs cost mismatch দ্রুত ধরতে না পারলে end-of-month surprise। Alert set করলে threshold cross-এ notify পাবেন, আপনি যা expect করেছিলেন সেটাই charge হবে।",
      en: "Without early alerts, usage-vs-cost surprises hit at month-end. Alerts fire on thresholds so charges match your expectations.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "Tab: Plan · Invoices · Payment methods · Spend alerts · Tax info।", en: "Tabs: Plan · Invoices · Payment methods · Spend alerts · Tax info." },
    },
    {
      id: "plan",
      title: { bn: "Plan upgrade / downgrade", en: "Upgrading / downgrading plan" },
      whatItDoes: { bn: "Plan upgrade / downgrade", en: "Upgrading / downgrading plan" },
      howToUse: [
        { bn: "ধাপ ১: 'Change plan' → target plan বাছাই।", en: "Step 1: 'Change plan' → pick target." },
        { bn: "ধাপ ২: proration preview দেখুন (mid-cycle change হলে prorated invoice)।", en: "Step 2: check proration preview (mid-cycle changes prorate)." },
        { bn: "ধাপ ৩: Confirm → এই cycle থেকে effective, next invoice-এ reflect।", en: "Step 3: Confirm → effective this cycle, reflects on next invoice." },
      ],
    },
    {
      id: "invoices",
      title: { bn: "Invoice ও receipt", en: "Invoices & receipts" },
      whatItDoes: { bn: "All past invoice PDF ও line-item breakdown; accounting-এর জন্য CSV export।", en: "All past invoices as PDF plus line-item breakdowns; CSV export for accounting." },
      howToUse: [
        { bn: "ধাপ ১: 'Invoices' → row চাপুন → PDF download।", en: "Step 1: 'Invoices' → click a row → download PDF." },
        { bn: "ধাপ ২: 'Line items' → dispute করার জন্য detail।", en: "Step 2: 'Line items' shows detail for disputes." },
      ],
    },
    {
      id: "alerts",
      title: { bn: "Spend alert", en: "Spend alerts" },
      whatItDoes: { bn: "Monthly spend threshold set → email / webhook fire। Multiple threshold (50% / 80% / 100%)।", en: "Set monthly spend thresholds → email / webhook fires. Multiple thresholds (50% / 80% / 100%)." },
      howToUse: [
        { bn: "ধাপ ১: 'Spend alerts' → '+ Add threshold'।", en: "Step 1: 'Spend alerts' → '+ Add threshold'." },
        { bn: "ধাপ ২: amount + channel (email/webhook/Slack) দিন → Save।", en: "Step 2: amount + channel (email/webhook/Slack) → Save." },
        { bn: "ধাপ ৩: 'Test' চাপে dummy event fire — receiver-এ পৌঁছাচ্ছে confirm।", en: "Step 3: 'Test' fires a dummy event to confirm receiver connectivity." },
      ],
      troubleshooting: [
        { problem: { bn: "Card declined", en: "Card declined" }, solution: { bn: "Payment methods → new card যোগ করে default করুন; issuer-কে recurring charge unblock করতে বলুন।", en: "Add a new card and mark it default; ask the issuer to unblock recurring charges." } },
        { problem: { bn: "Alert fire করছে না", en: "Alert never fires" }, solution: { bn: "Threshold cross হয়েছে কিনা /dashboard/usage-এ verify; test event দিয়ে channel check।", en: "Verify the threshold has crossed on /dashboard/usage; fire a test event to check the channel." } },
      ],
    },
  ],
  glossary: [
    { term: "proration", definition: { bn: "Mid-cycle plan change হলে অবশিষ্ট দিনের অনুপাতে বিল adjust।", en: "Bill adjusted for the remaining days on mid-cycle plan changes." } },
    { term: "line item", definition: { bn: "Invoice-এর individual charge row (যেমন `Egress GB × 42`)।", en: "Individual charge row on an invoice (e.g. `Egress GB × 42`)." } },
    { term: "MRR", definition: { bn: "Monthly Recurring Revenue — subscription-এর মাসিক আয়।", en: "Monthly Recurring Revenue — subscription's monthly income." } },
  ],
};
