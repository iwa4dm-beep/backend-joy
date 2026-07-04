# Storage API — Phase 32

## Feature flags

| Variable | Effect |
| --- | --- |
| `PLUTO_ENABLE_IMAGE_TRANSFORM=1` | Enable `/storage/v1/render/*` |
| `PLUTO_ENABLE_TUS=1` | Enable `/storage/v1/upload/resumable*` |

Without these flags the plugin registers no routes — existing endpoints in `storageRoutes` are unchanged.

---

## 32.1 Image transformations

### `GET /storage/v1/render/image/:bucket/*`

Query params (all optional):

| Param | Type | Notes |
| --- | --- | --- |
| `width` | int 1..4000 | |
| `height` | int 1..4000 | |
| `resize` | `cover` \| `contain` \| `fill` | |
| `quality` | int 1..100 | applied by encoders that support quality |
| `format` | `webp` \| `jpeg` \| `png` \| `avif` \| `original` | output encoding |

The route returns the transformed bytes with:
- `content-type` set by the provider
- `x-cache: hit` or `miss`
- `x-transform-provider` naming the active provider
- `cache-control: public, max-age=86400, immutable`

**Errors:**
- `400 invalid_key` — bucket/key regex failed
- `400 bad_query` — Zod issues surfaced
- `400 output_too_large` — width×height > 10 MP
- `404 source_not_found`
- `415 unsupported_source_type`

### `DELETE /storage/v1/render/cache/:bucket` — service_role
Purges every cached derivative for the bucket. Returns `{ ok, purged }`.

### Provider abstraction
The default `passthrough` provider returns source bytes unchanged so the
route is safe to enable on Cloudflare Workers where native `sharp` is
unavailable. Swap in a WASM provider (`@jsquash/*`, `@resvg/resvg-wasm`)
at boot with `setImageTransformProvider()` in `lib/image-transform.ts`.

---

## 32.2 TUS 1.0.0 resumable uploads

Standard [tus.io](https://tus.io/protocols/resumable-upload) protocol —
compatible with `tus-js-client`, `uppy`, and every other TUS client.

Discovery: `OPTIONS /storage/v1/upload/resumable` → `204` with:
- `Tus-Resumable: 1.0.0`
- `Tus-Version: 1.0.0`
- `Tus-Extension: creation,termination,expiration`
- `Tus-Max-Size: 5368709120` (5 GiB)

### Create

```
POST /storage/v1/upload/resumable
Tus-Resumable: 1.0.0
Upload-Length: 12582912
Upload-Metadata: bucket YXZhdGFycw==,filename cGljLnBuZw==,contentType aW1hZ2UvcG5n
```

`Upload-Metadata` is a comma-separated `key base64value` list. `bucket`
and `filename` (aliased to `key`) are required. Response:

```
201 Created
Location: /storage/v1/upload/resumable/<uuid>
Upload-Expires: <RFC 1123 date, 24h from creation>
```

### Probe offset

```
HEAD /storage/v1/upload/resumable/<uuid>
Tus-Resumable: 1.0.0
→ 200
  Upload-Offset: 2097152
  Upload-Length: 12582912
```

### Append chunk

```
PATCH /storage/v1/upload/resumable/<uuid>
Tus-Resumable: 1.0.0
Content-Type: application/offset+octet-stream
Upload-Offset: 2097152

<binary chunk bytes>
→ 204 No Content
  Upload-Offset: 4194304
```

**Conflict** returns `409 { error: "offset_conflict", expected: <n> }` —
the client should probe with `HEAD` and retry from the reported offset.

**Chunk exceeds total** returns `413 chunk_exceeds_total`.

### Abort

```
DELETE /storage/v1/upload/resumable/<uuid>
→ 204 No Content
```

### Completion

When `Upload-Offset` equals `Upload-Length`, the server concatenates all
staged chunks under `.tus/<id>/<offset>` and writes the final object to
`<bucket>/<key>`. Staged chunks are cleaned up best-effort. The row's
`completed_at` is set — subsequent HEADs return `410 Gone`.

### Client SDK

```ts
import { storageV2 } from "@/lib/pluto/live";

await storageV2.uploadResumable({
  bucket: "avatars",
  key: `${userId}/pic.png`,
  file,                         // Blob | File
  chunkSize: 5 * 1024 * 1024,   // 5 MiB default
  onProgress: (u, t) => setPct((u / t) * 100),
});
```

The SDK auto-resumes on `409 offset_conflict` by probing the server
offset. Bigger chunks = fewer round-trips but longer retry cost; **5 MiB
is a good default** for HTTP/2 origins, **1 MiB** for high-latency clients.

---

## Retention & sweeper

The plugin runs a 5-minute sweeper that marks `tus_uploads` rows past
`expires_at` as aborted. Staged chunk cleanup is best-effort; disk usage
under `.tus/` should be trimmed by your storage driver's LRU or a cron.
