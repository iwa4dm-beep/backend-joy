# Jobs v2 — Phase 62

Durable DAG workflows with topological scheduling, per-step retry, and
exactly-once side effects. Enable with `PLUTO_ENABLE_JOBS_V2=1`. All
endpoints require `x-workspace-id`.

## Capability scope

| Capability            | Endpoint                      | Notes                                     |
| --------------------- | ----------------------------- | ----------------------------------------- |
| List workflows        | `GET  /jobs/v2/workflows`     | Workspace-scoped                          |
| Start run             | `POST /jobs/v2/runs`          | `{ workflow, input, run_id? }`            |
| Get run + step ledger | `GET  /jobs/v2/runs/:id`      | Includes attempts, outputs, errors        |
| List runs             | `GET  /jobs/v2/runs`          |                                           |

## Workflow declaration

```ts
import { registerWorkflow } from "@/lib/workflow-registry";

registerWorkflow(WORKSPACE, {
  name: "onboard_user",
  version: 1,
  steps: [
    { id: "create_row",
      run: async ({ input, sideEffect }) => sideEffect("db_insert",
        async () => db.users.insert(input)) },

    { id: "send_email", deps: ["create_row"],
      retry: { max_attempts: 5, backoff_ms: 250 },
      run: async ({ outputs, sideEffect }) => sideEffect("welcome_email",
        async () => mailer.send({ to: (outputs.create_row as { email: string }).email })) },

    { id: "audit", deps: ["create_row"],
      run: async ({ outputs }) => audit.log("user_onboarded", outputs.create_row) },
  ],
});
```

Steps with disjoint dependencies (like `send_email` and `audit` above)
run concurrently in a single scheduling wave.

## Retry semantics

Every step declares `{ max_attempts, backoff_ms }`. On failure the
engine sleeps `backoff_ms` and retries; on the final attempt it marks
the step `failed` and cascades — every downstream step transitions to
`skipped`, and the run is `failed`.

## Exactly-once side effects

Inside a step body, wrap outbound side effects with `ctx.sideEffect(key,
fn)`. The engine keys the memoized result on
`(run_id, step_id, key)` so:

- if the fn already committed on a prior attempt, it is **not**
  re-executed — the cached result is returned immediately
- if the surrounding step later fails and retries, the side effect is
  observed once at most

This is the classic durable-execution pattern: outer computation may
retry freely, but external writes (payments, emails, third-party API
calls) are guaranteed at-most-once and, together with the retry loop,
exactly-once in the successful path.

## Run response shape

```json
{
  "run": {
    "run_id": "run_1751600000000_abc123",
    "workflow": "onboard_user",
    "version": 1,
    "status": "succeeded",
    "steps": {
      "create_row": { "status": "succeeded", "attempts": 1, "output": {...} },
      "send_email": { "status": "succeeded", "attempts": 3 },
      "audit":      { "status": "succeeded", "attempts": 1 }
    },
    "started_at": 1751600000000,
    "ended_at":   1751600000045
  }
}
```

Failure surface: `steps.<id>.status = "failed"` with `error` populated,
downstream steps `"skipped"`, and top-level `run.status = "failed"`. The
run is still returned with 200 so callers can inspect it — HTTP errors
are reserved for bad requests (400) and missing workflows (404).
