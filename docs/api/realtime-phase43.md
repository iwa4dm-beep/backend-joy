# Realtime v3 — Phase 43 (CDC + NATS + RLS-aware channels + replay)

Phase 43 layers three production capabilities on top of the Phase 33 CDC pipeline:

1. **NATS backplane** — horizontal fan-out so any server instance can
   deliver an event published from any other instance.
2. **RLS-aware channels** — a small, safe predicate grammar evaluated
   server-side per subscriber so rows never leak beyond the RLS boundary.
3. **Durable replay** — every published event is written to a per-channel
   ring buffer (`rt3_backplane_log`) that survives NATS outages.

Enable with `PLUTO_ENABLE_REALTIME_V3=1`. NATS fan-out is separately
gated by `PLUTO_ENABLE_NATS=1` + `PLUTO_NATS_URL` — without them the
system falls back to the replay buffer only.

## Endpoints (`/rt/v3/*`)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/channels` | Create/update a channel. Admin only. |
| `GET` | `/channels` | List channels visible to the workspace. |
| `DELETE` | `/channels/:name` | Remove a channel. Admin only. |
| `POST` | `/publish` | Broadcast an event; fans out via NATS + logs to replay buffer. |
| `GET` | `/replay/:name` | Replay events with cursor + server-side RLS filter. |
| `POST` | `/subscriptions` | Register/update a subscriber cursor. |
| `GET` | `/nats` | Backplane status + last error. |

## Channel predicate grammar

```
expr    := clause ( ( 'AND' | 'OR' ) clause )*
clause  := column op value
op      := = | != | > | >= | < | <=
value   := ident | literal
ident   := auth.uid() | auth.role() | auth.workspace() | workspace_id | now()
literal := number | true | false | null | '...'
```

Examples:

| Predicate | Effect |
| --- | --- |
| `user_id = auth.uid()` | subscriber only sees their own rows |
| `workspace_id = auth.workspace() AND status != 'archived'` | workspace-scoped, hide archived |
| `priority >= 5` | high-priority events only |

Predicates are validated at channel creation — a bad expression returns
`400 invalid_predicate` up front instead of dropping every event silently.

## Role gating

Channels can require `authenticated` or `admin`. Replay + subscribe
enforce the gate before events are considered, so anonymous callers with
a valid apikey cannot pull authenticated-only history.

## Replay semantics

- Ring buffer retention is per-channel (`replay_window_s`, 60s–24h).
- `GET /rt/v3/replay/:name?since_id=&limit=` returns events in ascending
  id order with a `cursor` for the next call.
- The RLS predicate is applied to every returned row; failing rows are
  dropped rather than surfaced.

## NATS backplane

Fan-out subject: `${PLUTO_NATS_SUBJECT_PREFIX}.<channel-name>` (default
prefix `pluto.rt3`). Publishes degrade gracefully — if NATS is down the
event is still logged with `delivered_nats=false`, and replay picks it
up automatically once subscribers reconnect.

`GET /rt/v3/nats` reports current status:

```json
{ "enabled": true, "connected": true,
  "url": "nats://nats:4222", "subject_prefix": "pluto.rt3",
  "last_error": null }
```

## Tuning cheatsheet

| Symptom | Change |
| --- | --- |
| Subscribers missing events after redeploy | Widen `replay_window_s`; ensure clients POST `/subscriptions` with `last_event_id` |
| NATS disconnect storms | Check `GET /rt/v3/nats` `last_error`; verify network + creds |
| Predicate rejects everything | Test against `POST /channels` first — parser errors up front |
| High replay latency | Add index on `channel_name, id desc` (shipped in `0041_phase43_realtime.sql`) |
