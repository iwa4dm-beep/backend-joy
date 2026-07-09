import type { PageHelp } from "@/lib/help/types";

export const dashboardSdkDemoHelp: PageHelp = {
  slug: "dashboard.sdk-demo",
  page: {
    title: { bn: "SDK Demo — লগইন → CRUD → realtime", en: "SDK Demo — login → CRUD → realtime" },
    whatItDoes: {
      bn: "Typed `@pluto/client` SDK-এর end-to-end flow — sign in, table list/insert, এবং realtime subscription — একটি playground-এ।",
      en: "End-to-end playground for the typed `@pluto/client` SDK: sign in, list/insert rows, and subscribe to realtime.",
    },
    whyItMatters: {
      bn: "Docs না পড়েই SDK-এর behaviour hands-on বুঝে নেওয়ার সবচেয়ে দ্রুত উপায়।",
      en: "Fastest way to learn the SDK's behaviour hands-on without reading docs first.",
    },
  },
  sections: [
    {
      id: "config",
      title: { bn: "Base URL ও anon key", en: "Base URL & anon key" },
      whatItDoes: { bn: "SDK কোন backend-এ connect করবে সেটি configure করুন।", en: "Configure which backend the SDK connects to." },
      howToUse: [
        { bn: "Base URL এবং anon key দিন (ডিফল্ট env থেকে আসে)।", en: "Enter Base URL and anon key (defaults come from env)." },
      ],
    },
    {
      id: "auth",
      title: { bn: "Sign in", en: "Sign in" },
      whatItDoes: { bn: "Email + password দিয়ে সাইন-ইন করে session বসান।", en: "Sign in with email + password to establish a session." },
    },
    {
      id: "table",
      title: { bn: "Table CRUD", en: "Table CRUD" },
      whatItDoes: { bn: "Table name দিয়ে rows list ও insert করুন — RLS enforce হবে।", en: "List and insert rows for the chosen table — RLS is enforced." },
    },
    {
      id: "realtime",
      title: { bn: "Realtime subscription", en: "Realtime subscription" },
      whatItDoes: { bn: "Channel-এ subscribe করে live payload frames দেখুন।", en: "Subscribe to a channel and inspect live payload frames." },
    },
  ],
};
