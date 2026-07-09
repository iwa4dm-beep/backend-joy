import type { PageHelp } from "@/lib/help/types";

// /dashboard/vector — pgvector-backed vector search UI.
export const dashboardVectorHelp: PageHelp = {
  slug: "dashboard.vector",
  page: {
    title: { bn: "Vector search — embedding ও similarity", en: "Vector search — embeddings & similarity" },
    whatItDoes: {
      bn: "pgvector-এর উপর তৈরি vector collection browse, embedding upsert, k-NN similarity query, এবং index (HNSW/IVFFlat) config — সব এক UI-তে।",
      en: "Browse pgvector collections, upsert embeddings, run k-NN similarity queries, and tune indexes (HNSW/IVFFlat) — all in one UI.",
    },
    whyItMatters: {
      bn: "RAG chatbot, semantic search, recommendation — সব কিছুতে vector similarity লাগে। আলাদা vector DB না রেখে Postgres-এই রাখলে transaction ও RLS একই থাকে।",
      en: "RAG chatbots, semantic search, recommendations — all lean on vector similarity. Keeping vectors in Postgres preserves transactions and RLS.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: { bn: "উপরে collection list + '+ New', প্রতিটির জন্য rows tab (id, metadata, vector preview) ও Query tab।", en: "Top: collection list + '+ New'. Each has a Rows tab (id, metadata, vector preview) and a Query tab." },
    },
    {
      id: "collection",
      title: { bn: "Collection তৈরি", en: "Creating a collection" },
      whatItDoes: { bn: "Collection মানে (name, dimension, distance metric) সহ একটা pgvector table।", en: "A collection is a pgvector table with (name, dimension, distance metric)." },
      howToUse: [
        { bn: "ধাপ ১: '+ New collection' → নাম (`docs`, `products`)।", en: "Step 1: '+ New collection' → name (`docs`, `products`)." },
        { bn: "ধাপ ২: dimension দিন (OpenAI ada-002 = 1536, mini-lm = 384)।", en: "Step 2: dimension (OpenAI ada-002 = 1536, mini-lm = 384)." },
        { bn: "ধাপ ৩: distance metric — cosine (text), l2 (image), inner_product (specialized)।", en: "Step 3: distance metric — cosine (text), l2 (images), inner_product (specialized)." },
        { bn: "ধাপ ৪: index type — HNSW default (fast query, slow build), IVFFlat বড় dataset-এ।", en: "Step 4: index — HNSW default (fast query, slow build), IVFFlat for large datasets." },
      ],
    },
    {
      id: "upsert",
      title: { bn: "Embedding upsert", en: "Upserting embeddings" },
      whatItDoes: { bn: "Row = (id, vector, metadata JSON)। Same id দিলে overwrite; new id হলে insert।", en: "Row = (id, vector, metadata JSON). Same id overwrites; new id inserts." },
      howToUse: [
        { bn: "ধাপ ১: 'Upsert' → JSON body (single or array)।", en: "Step 1: 'Upsert' → JSON body (single or array)." },
        { bn: "ধাপ ২: SDK-তে `pluto.vector('docs').upsert([{id, vector, metadata}])`।", en: "Step 2: from SDK, `pluto.vector('docs').upsert([{id, vector, metadata}])`." },
        { bn: "ধাপ ৩: batch size 100-500 সবচেয়ে fast।", en: "Step 3: batch size 100-500 is fastest." },
      ],
    },
    {
      id: "query",
      title: { bn: "Similarity query", en: "Similarity query" },
      whatItDoes: { bn: "Query vector + k → nearest neighbors রি returns; metadata filter দিয়ে narrow করা যায়।", en: "Query vector + k → nearest neighbours; metadata filter narrows it." },
      howToUse: [
        { bn: "ধাপ ১: 'Query' tab → vector paste অথবা 'Embed text' দিয়ে auto-embed।", en: "Step 1: 'Query' tab → paste a vector or use 'Embed text' to embed inline." },
        { bn: "ধাপ ২: k (top-N) এবং optional metadata filter (`{ lang: 'bn' }`) দিন।", en: "Step 2: pick k (top-N) and optional metadata filter (`{ lang: 'bn' }`)." },
        { bn: "ধাপ ৩: Run → distance score সহ result table।", en: "Step 3: Run → results with distance scores." },
      ],
      troubleshooting: [
        { problem: { bn: "Query slow (> 1s)", en: "Query slow (> 1s)" }, solution: { bn: "Index missing — Collection settings-এ HNSW বা IVFFlat build করুন; IVFFlat হলে `lists` ~ sqrt(rowcount)।", en: "Missing index — build HNSW or IVFFlat in Collection settings; for IVFFlat, `lists` ≈ √row-count." } },
        { problem: { bn: "Dimension mismatch error", en: "Dimension mismatch error" }, solution: { bn: "Collection-এ যে dimension সেট করেছেন সেটাই upsert/query-তে দিন — different model use করলে collection আলাদা।", en: "Use the exact dimension the collection was created with — different models mean different collections." } },
      ],
    },
  ],
  glossary: [
    { term: "embedding", definition: { bn: "Text/image-কে fixed-length numeric vector-এ convert।", en: "Text/image converted into a fixed-length numeric vector." } },
    { term: "HNSW", definition: { bn: "Hierarchical Navigable Small World — fast approximate nearest-neighbor index।", en: "Hierarchical Navigable Small World — a fast approximate nearest-neighbour index." } },
    { term: "IVFFlat", definition: { bn: "Inverted-file flat index — বড় dataset-এ efficient।", en: "Inverted-file flat index — efficient on large datasets." } },
    { term: "k-NN", definition: { bn: "K-Nearest Neighbours — সবচেয়ে কাছের k টা vector।", en: "K-Nearest Neighbours — the closest k vectors." } },
  ],
};
