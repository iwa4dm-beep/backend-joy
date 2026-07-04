# Phase 35 — Edge Functions v3 (hardened isolate)

v3 runs user code inside a **dedicated Node worker thread** with a
`vm.createContext` sandbox. Each invocation gets a fresh worker that is
terminated on completion or deadline.

Enable with `PLUTO_ENABLE_EDGE_V3=1`.

## Hardening

- No `process`, `require`, `Buffer`, `setImmediate`, `globalThis`.
- `codeGeneration.strings = false` — no `eval` / `new Function` / template `Function`.
- `codeGeneration.wasm = false` — no runtime WASM compile.
- Wall-clock deadline enforced by `worker.terminate()`.
- Heap cap via `resourceLimits.maxOldGenerationSizeMb`.
- `fetch` is wrapped with a per-deployment host allow-list — anything
  outside the list rejects with `fetch_blocked:<host>`.
- Only these globals are provided: `console`, `fetch`, `URL`,
  `URLSearchParams`, `TextEncoder`, `TextDecoder`, `crypto`, `atob`,
  `btoa`, `Promise`, `JSON`, `Math`, `Date`, `Response`, `Request`,
  `Headers`, and a capped `setTimeout` (≤ 5s).

## Endpoints

```
POST /fn/v3/deployments             { slug, code, timeout_ms?, memory_mb?, allow_hosts? }
GET  /fn/v3/deployments
POST /fn/v3/deployments/:id/rollback
POST /fn/v3/invoke/:slug            → { result, logs, duration_ms }
GET  /fn/v3/invocations?slug=&limit=50
```

Uploading a new version deactivates prior versions of the same slug;
`/rollback` marks a specific deployment inactive so the previous active
version takes over on the next invoke.

## Handler shape

```js
export default async ({ req, ctx }) => {
  const r = await fetch("https://api.example.com/ping");
  return { ok: true, echo: req.method, workspace: ctx.workspace_id };
};
```

`req` has `{ method, url, headers, body }`. `ctx` has
`{ workspace_id, user_id }`. Return any JSON-serialisable value.
