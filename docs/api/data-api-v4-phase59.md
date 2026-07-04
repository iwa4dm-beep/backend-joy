# Data API v4 — Phase 59

RPC-style typed functions, cursor-based pagination, and streaming JSON.
Enable with `PLUTO_ENABLE_DATA_API_V4=1`. All endpoints require an API key
and an `x-workspace-id` header so RPCs and demo data stay tenant-scoped.

## Capability scope

| Capability            | Endpoint                        | Auth      | Notes                                           |
| --------------------- | ------------------------------- | --------- | ----------------------------------------------- |
| Invoke RPC            | `POST /rest/v4/rpc/:name`       | api key   | Zod-validated input + output                    |
| List RPCs             | `GET  /rest/v4/rpc`             | api key   | Workspace-scoped                                |
| OpenAPI 3.1 contract  | `GET  /rest/v4/openapi`         | api key   | Regenerated from live registry                  |
| Cursor pagination     | `GET  /rest/v4/query`           | api key   | Opaque cursors, stable order + id tiebreak      |
| Streaming NDJSON      | `GET  /rest/v4/stream`          | api key   | `application/x-ndjson`, backpressure-aware      |

## RPC registration

RPCs are declared in code using Zod schemas and registered per workspace:

```ts
import { z } from "zod";
import { registerRpc } from "@/lib/rpc-registry";

registerRpc({
  workspace_id: WS,
  name: "invoice.total",
  description: "Compute an invoice total in cents.",
  input: z.object({ items: z.array(z.object({ qty: z.number().int(), cents: z.number().int() })) }),
  output: z.object({ total_cents: z.number().int() }),
  handler: async ({ items }) => ({
    total_cents: items.reduce((s, i) => s + i.qty * i.cents, 0),
  }),
});
```

Invocation:

```
POST /rest/v4/rpc/invoice.total
{ "items": [{ "qty": 2, "cents": 500 }] }
→ { "ok": true, "data": { "total_cents": 1000 } }
```

Errors: `invalid_input` (400), `invalid_output` (400 — handler contract
violation), `rpc_not_found` (404).

## Cursor pagination

Cursors are opaque base64url-encoded records tied to `(order_by,
direction, id_column)`. A cursor built for `created_at asc` is rejected
if the caller then requests `desc` (`cursor_spec_mismatch`) — this
prevents skipping rows across direction changes.

```
GET /rest/v4/query?order_by=created_at&direction=asc&limit=50
→ { "items": [...], "next_cursor": "...", "has_more": true }
GET /rest/v4/query?order_by=created_at&direction=asc&limit=50&cursor=...
```

The id column is always used as a tiebreaker so pages remain stable
across duplicate order-key values.

## Streaming JSON

`/rest/v4/stream` responds with `application/x-ndjson` and three frame
kinds:

```
{"type":"meta","total":250,"schema":"demo_rows"}
{"type":"row","data":{...}}
...
{"type":"end","count":250,"next_cursor":"row_..."}
```

Writes respect Node's `writable.write()` backpressure signal — when a
chunk returns `false` the producer waits for `drain` before yielding the
next row. Clients should parse line-by-line and never buffer the full
body.

## OpenAPI contract

`GET /rest/v4/openapi` emits an OpenAPI 3.1 document with a path per
registered RPC. Input and output schemas are derived from the Zod
definitions via a lightweight `zodToJsonSchema` walker (objects,
records, arrays, enums, literals, primitives, and optional/nullable
wrappers).
