// Phase 43 — NATS backplane for realtime v3.
//
// A thin publisher used to fan realtime events out across horizontally
// scaled server instances. When NATS is unreachable, publishes degrade
// gracefully: the event is still recorded in `rt3_backplane_log` (with
// delivered_nats=false + delivery_error), which subscribers can replay
// through the HTTP replay endpoint until the backplane recovers.
//
// We deliberately load `nats` via dynamic import so the dependency stays
// optional — deployments without the package installed still boot.

import type { FastifyBaseLogger } from "fastify";

type NatsClientLike = {
  publish: (subject: string, data: Uint8Array) => void;
  drain: () => Promise<void>;
  closed: () => Promise<void | Error>;
};

let client: NatsClientLike | null = null;
let connecting: Promise<NatsClientLike | null> | null = null;
let lastError: string | null = null;

const enabled = process.env.PLUTO_ENABLE_NATS === "1";

export function natsStatus() {
  return {
    enabled,
    connected: client !== null,
    url: process.env.PLUTO_NATS_URL ?? null,
    subject_prefix: process.env.PLUTO_NATS_SUBJECT_PREFIX ?? "pluto.rt3",
    last_error: lastError,
  };
}

export async function connectNats(log: FastifyBaseLogger): Promise<NatsClientLike | null> {
  if (!enabled) return null;
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      // Dynamic import — package is optional at build time.
      const mod = (await import("nats" as string).catch(() => null)) as
        | { connect: (opts: { servers: string }) => Promise<NatsClientLike> }
        | null;
      if (!mod) {
        lastError = "nats package not installed";
        log.warn({ msg: "nats disabled: package missing" });
        return null;
      }
      const nc = await mod.connect({ servers: process.env.PLUTO_NATS_URL ?? "nats://localhost:4222" });
      client = nc;
      lastError = null;
      log.info({ msg: "nats backplane connected" });
      void nc.closed().then((err) => {
        client = null;
        lastError = err instanceof Error ? err.message : "closed";
        log.warn({ msg: "nats backplane closed", err: lastError });
      });
      return nc;
    } catch (e) {
      lastError = (e as Error).message;
      log.warn({ msg: "nats connect failed", err: lastError });
      return null;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

export async function publishBackplane(
  subject: string,
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<{ delivered: boolean; error: string | null }> {
  if (!enabled) return { delivered: false, error: "nats_disabled" };
  const nc = client ?? (await connectNats(log));
  if (!nc) return { delivered: false, error: lastError ?? "nats_unavailable" };
  try {
    nc.publish(subject, new TextEncoder().encode(JSON.stringify(payload)));
    return { delivered: true, error: null };
  } catch (e) {
    return { delivered: false, error: (e as Error).message };
  }
}
