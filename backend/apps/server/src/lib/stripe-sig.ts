// Stripe webhook signature verification, extracted so plugin + tests share it.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a `Stripe-Signature` header per
 * https://stripe.com/docs/webhooks#verify-manually.
 *
 * The header looks like `t=1699999999,v1=abcdef...`. We recompute
 * HMAC-SHA256 over `${t}.${payload}` using the endpoint secret and
 * compare in constant time.
 */
export function verifyStripeSig(sigHeader: string, payload: string, secret: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSec) return false;
  const mac = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(mac), b = Buffer.from(v1);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

/** Sign a payload the way Stripe would — test helper. */
export function signStripePayload(payload: string, secret: string, tsSec = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${tsSec}.${payload}`).digest("hex");
  return `t=${tsSec},v1=${mac}`;
}
