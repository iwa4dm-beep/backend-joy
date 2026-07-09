import type { PageHelp } from "@/lib/help/types";

// /dashboard/pluto-search — hybrid text + vector search console.
export const dashboardPlutoSearchHelp: PageHelp = {
  slug: "dashboard.pluto-search",
  page: {
    title: { bn: "Search & Vector — hybrid full-text + semantic", en: "Search & Vector — hybrid full-text + semantic" },
    whatItDoes: {
      bn: "Postgres full-text search (tsvector) এবং pgvector-এর similarity একসাথে run করে hybrid ranking দেয়। Index inspect, query builder, ও analyzer preview এখানে।",
      en: "Combines Postgres full-text (tsvector) with pgvector similarity into a hybrid ranking. Inspect indexes, build queries, preview analyzers here.",
    },
    whyItMatters: {
      bn: "শুধু keyword search-এ 'plumber' খুঁজলে 'pipe fitting expert' মিস হয়। শুধু vector-এ product SKU exact match মিস হয়। Hybrid দুটোই ধরে।",
      en: "Keyword-only misses 'pipe fitting expert' when you search 'plumber'. Vector-only misses exact SKUs. Hybrid catches both.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "Tab: Indexes · Query builder · Analyzer preview · Rank tuning।", en: "Tabs: Indexes · Query builder · Analyzer preview · Rank tuning." },
    },
    {
      id: "index",
      title: { bn: "Index তৈরি ও sync", en: "Creating & syncing indexes" },
      whatItDoes: { bn: "Source table + text column(s) + optional vector column বাছাই করে one-click GIN + HNSW index build।", en: "Pick source table + text column(s) + optional vector column; one-click GIN + HNSW build." },
      howToUse: [
        { bn: "ধাপ ১: '+ New index' → schema.table বাছাই।", en: "Step 1: '+ New index' → pick schema.table." },
        { bn: "ধাপ ২: text column(s) select — multiple হলে `to_tsvector('english', col1 || ' ' || col2)`।", en: "Step 2: select text column(s) — for multiple, `to_tsvector('english', col1 || ' ' || col2)`." },
        { bn: "ধাপ ৩: vector column (optional) — না দিলে pure text search।", en: "Step 3: vector column (optional) — omit for pure text search." },
        { bn: "ধাপ ৪: analyzer language + stemming বাছাই → Build।", en: "Step 4: analyzer language + stemming → Build." },
      ],
    },
    {
      id: "query",
      title: { bn: "Hybrid query", en: "Hybrid query" },
      whatItDoes: { bn: "Text query + optional vector + weights → BM25-like text score ও cosine similarity combine করে rank return।", en: "Text query + optional vector + weights → combined BM25-style text score and cosine similarity ranking." },
      howToUse: [
        { bn: "ধাপ ১: 'Query builder' → text box-এ query।", en: "Step 1: 'Query builder' → text box." },
        { bn: "ধাপ ২: text weight vs vector weight slider (default 0.5/0.5)।", en: "Step 2: adjust text vs vector weight slider (default 0.5/0.5)." },
        { bn: "ধাপ ৩: limit + metadata filter → Run।", en: "Step 3: limit + metadata filter → Run." },
      ],
    },
    {
      id: "analyzer",
      title: { bn: "Analyzer preview", en: "Analyzer preview" },
      whatItDoes: { bn: "নির্দিষ্ট text-এ কোন token/stem বার হচ্ছে সেটা দেখা যায় — indexing debug করতে দরকারি।", en: "Shows which tokens/stems the analyzer produces for a given text — critical for debugging indexing." },
      troubleshooting: [
        { problem: { bn: "Query result irrelevant", en: "Query returns irrelevant results" }, solution: { bn: "Analyzer preview-এ token check — wrong language দিলে stemming ভুল হয়।", en: "Check tokens in Analyzer preview — wrong language stems poorly." } },
        { problem: { bn: "Index build timeout", en: "Index build times out" }, solution: { bn: "Table বড় হলে HNSW slow build — off-peak-এ চালান বা IVFFlat দিন।", en: "Large tables — HNSW builds slowly; run off-peak or switch to IVFFlat." } },
      ],
    },
  ],
  glossary: [
    { term: "tsvector", definition: { bn: "Postgres full-text search-এর tokenized representation।", en: "Postgres's tokenized full-text search representation." } },
    { term: "GIN", definition: { bn: "Generalized Inverted Index — text search-এ standard।", en: "Generalized Inverted Index — the standard for text search." } },
    { term: "hybrid rank", definition: { bn: "Text score + vector score-এর weighted combination।", en: "Weighted combination of text score and vector score." } },
    { term: "stemming", definition: { bn: "'running' → 'run' এর মতো word normalize করা।", en: "Normalizing words like 'running' → 'run'." } },
  ],
};
