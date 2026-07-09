import type { PageHelp } from "@/lib/help/types";

export const dashboardPlutoAiHelp: PageHelp = {
  slug: "dashboard.pluto-ai",
  page: {
    title: { bn: "AI Gateway — models, keys, usage", en: "AI Gateway — models, keys, usage" },
    whatItDoes: {
      bn: "একটি gateway-এর মাধ্যমে multiple LLM providers (OpenAI, Anthropic, Google ইত্যাদি) কল করুন; per-workspace API key, model routing এবং usage/cost tracking এক জায়গায়।",
      en: "Call multiple LLM providers (OpenAI, Anthropic, Google, etc.) through a single gateway; per-workspace API keys, model routing, and usage/cost tracking in one place.",
    },
    whyItMatters: {
      bn: "প্রতিটি provider-এর SDK আলাদা integrate করা tedious ও risky; gateway-এ unified interface, key rotation ও spend visibility পাওয়া যায়। এটি `/dashboard/ai` (AI & Vector) থেকে আলাদা — সেখানে embedding + vector search, এখানে chat/completion gateway।",
      en: "Integrating each provider's SDK separately is tedious and risky; the gateway gives a unified interface, key rotation, and spend visibility. Distinct from `/dashboard/ai` (AI & Vector) which handles embeddings + vector search — this page is the chat/completion gateway.",
    },
  },
  sections: [
    {
      id: "providers",
      title: { bn: "Provider keys", en: "Provider keys" },
      whatItDoes: { bn: "প্রতিটি provider-এর API key যোগ করুন — gateway calls এইগুলো ব্যবহার করে।", en: "Add each provider's API key — the gateway uses them for calls." },
      howToUse: [
        { bn: "Provider বেছে key paste করে Save চাপুন।", en: "Pick a provider, paste the key, click Save." },
        { bn: "Test button দিয়ে key valid কিনা যাচাই করুন।", en: "Use the Test button to verify the key is valid." },
      ],
    },
    {
      id: "routing",
      title: { bn: "Model routing", en: "Model routing" },
      whatItDoes: { bn: "Default model, fallback chain এবং per-route override configure করুন।", en: "Configure default model, fallback chain, and per-route overrides." },
    },
    {
      id: "usage",
      title: { bn: "Usage & cost", en: "Usage & cost" },
      whatItDoes: { bn: "Prompt/completion tokens এবং estimated cost per model/day দেখুন।", en: "See prompt/completion tokens and estimated cost per model/day." },
      troubleshooting: [
        { problem: { bn: "429 rate-limit", en: "429 rate-limit" }, solution: { bn: "Provider console-এ quota বাড়ান অথবা fallback model যোগ করুন।", en: "Raise quota in the provider console or add a fallback model." } },
      ],
    },
  ],
  glossary: [
    { term: "fallback", definition: { bn: "Primary model fail করলে যে model automatic ব্যবহৃত হবে।", en: "The model automatically used when the primary fails." } },
  ],
};
