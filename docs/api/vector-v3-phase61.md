# Vector v3 — Phase 61

Hybrid rerankers, per-tenant HNSW tuning, and streaming embeddings.
Enable with `PLUTO_ENABLE_VECTOR_V3=1`. All endpoints require
`x-workspace-id`.

## Capability scope

| Capability                    | Endpoint                              | Notes                                         |
| ----------------------------- | ------------------------------------- | --------------------------------------------- |
| Set HNSW config               | `POST /vec/v3/hnsw/config`            | Validates `m`, `ef_construction`, `ef_search` |
| List HNSW configs             | `GET  /vec/v3/hnsw/config`            | Workspace-scoped                              |
| Emit DDL for index            | `GET  /vec/v3/hnsw/:index/ddl`        | `?table=&column=embedding`                    |
| Hybrid search (rerank)        | `POST /vec/v3/hybrid/search`          | `linear` or `rrf`                             |
| Streaming embeddings          | `POST /vec/v3/embeddings/stream`      | NDJSON, per-input row frames                  |

## Per-tenant HNSW tuning

```
POST /vec/v3/hnsw/config
{
  "index_name": "docs_idx",
  "m": 24,
  "ef_construction": 300,
  "ef_search": 128,
  "metric": "cosine"
}
```

Bounds: `m ∈ [2,64]`, `ef_construction ∈ [4,1024]`, `ef_search ∈
[1,2048]`, `metric ∈ {cosine,l2,ip}`. Config is per (workspace,
index_name) so a noisy tenant cannot degrade another tenant's recall.

`GET /vec/v3/hnsw/:index/ddl?table=documents&column=embedding` returns
the exact `CREATE INDEX` statement — operators run it during index
build/rebuild.

## Hybrid search

Combines lexical and vector scores. Callers provide already-scored
candidates (typically the top-N from a lexical index and a vector
index). Two strategies:

- **`linear`**: `score = alpha * vector + (1 - alpha) * lexical`, both
  min-max normalized. Default `alpha = 0.5`.
- **`rrf`**: reciprocal-rank fusion, `sum(1 / (k + rank_i))`, default
  `k = 60`. Robust to score-scale mismatches.

Tie-breaking is deterministic: higher score → lower `id` → lower
insertion index. Reruns with the same input return byte-identical
ordering.

```
POST /vec/v3/hybrid/search
{
  "candidates": [
    { "id": "a", "vector_score": 0.90, "lexical_score": 0.10 },
    { "id": "b", "vector_score": 0.20, "lexical_score": 0.95 }
  ],
  "strategy": "linear",
  "alpha": 0.6,
  "limit": 20
}
→ { "results": [{ "id": "a", "score": 0.7, "vector_score": 0.9, "lexical_score": 0.1 }, ...] }
```

## Streaming embeddings

`POST /vec/v3/embeddings/stream` accepts up to 5000 inputs (each up to
50 000 chars) and yields NDJSON frames — meta, per-input rows, then
end — so clients can consume progressively without buffering the full
response. Backpressure is honored: `streamNdjson` pauses on
`writable.write() === false` and waits for `drain` before emitting the
next row.

```
POST /vec/v3/embeddings/stream
{ "inputs": ["chunk 1", "chunk 2", ...], "batch_size": 32 }
```

Response (NDJSON):

```
{"type":"meta","total":2,"schema":"embeddings"}
{"type":"row","data":{"index":0,"embedding":[...],"model":"...","token_estimate":9}}
{"type":"row","data":{"index":1,"embedding":[...],"model":"...","token_estimate":11}}
{"type":"end","count":2,"next_cursor":null}
```

The bundled embedder is a deterministic pseudo-vector generator so tests
and local dev do not consume Lovable AI Gateway credits. In production,
inject a real embedder that proxies to
`POST https://ai.gateway.lovable.dev/v1/embeddings` with model
`google/gemini-embedding-001` (default) or `openai/text-embedding-3-large`.
Batches are automatically kept ≤ 100 to stay within the Google per-batch
cap.
