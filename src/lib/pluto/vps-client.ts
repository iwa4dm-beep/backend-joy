// Server-side typed fetch wrapper for the Pluto VPS backend (api.timescard.cloud).
//
// Reads PLUTO_UPSTREAM_URL + PLUTO_SERVICE_ROLE_KEY from process.env inside
// server functions / route handlers. Never import this from client bundles.
import { createHmac } from "node:crypto";

export type VpsMode = "service" | "user" | "anon";

export type VpsFetchOpts = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  mode?: VpsMode;
  token?: string; // user bearer, required when mode === "user"
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export function getVpsBaseUrl(): string {
  return (process.env.PLUTO_UPSTREAM_URL ?? "https://api.timescard.cloud").replace(/\/+$/, "");
}

/** True when `s` looks like a compact JWT — three base64url parts separated by dots. */
function looksLikeJwt(s: string): boolean {
  const parts = s.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

/** Mint an HS256 service-role JWT from PLUTO_JWT_SECRET. Payload matches the
 *  upstream admin API expectations (see pluto-backend/scripts/mint-and-probe-admin.sh). */
function mintServiceRoleJwt(secret: string, ttlSeconds = 3600): string {
  const b64url = (s: string) =>
    Buffer.from(s).toString("base64")
      .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    sub: "00000000-0000-0000-0000-000000000000",
    role: "service_role",
    iss: process.env.PLUTO_JWT_ISSUER ?? "pluto",
    aud: "authenticated",
    iat: now,
    exp: now + ttlSeconds,
  }));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`)
    .digest("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

// Cache a self-minted JWT for its TTL so we don't re-hash on every request.
let cachedMintedJwt: { token: string; exp: number } | null = null;

/** Return a service-role token usable against the Pluto admin API.
 *
 *  Priority:
 *   1. If PLUTO_SERVICE_ROLE_KEY looks like a compact JWT, use it as-is.
 *   2. Otherwise (blank / opaque `sk_service_…` / anything else), auto-mint
 *      an HS256 JWT from PLUTO_JWT_SECRET so deploys don't hit
 *      "Authorization token is invalid: The token is malformed." at runtime.
 *   3. Fall back to whatever was stored (best-effort) so misconfig surfaces
 *      as a clean 401 instead of a silent "undefined" header.
 */
export function getServiceRoleKey(): string | undefined {
  const stored = (process.env.PLUTO_SERVICE_ROLE_KEY ?? "").trim();
  if (stored && looksLikeJwt(stored)) return stored;

  const secret = (process.env.PLUTO_JWT_SECRET ?? "").trim();
  if (secret) {
    const now = Math.floor(Date.now() / 1000);
    if (cachedMintedJwt && cachedMintedJwt.exp - now > 60) return cachedMintedJwt.token;
    const token = mintServiceRoleJwt(secret, 3600);
    cachedMintedJwt = { token, exp: now + 3600 };
    return token;
  }
  return stored || undefined;
}

export function getAnonKey(): string | undefined {
  return process.env.PLUTO_ANON_KEY || undefined;
}

export class VpsError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function vpsFetch<T = unknown>(path: string, opts: VpsFetchOpts = {}): Promise<T> {
  const base = getVpsBaseUrl();
  const method = opts.method ?? "GET";
  const mode = opts.mode ?? "service";

  const headers: Record<string, string> = { accept: "application/json", ...(opts.headers ?? {}) };
  if (opts.body != null) headers["content-type"] = "application/json";

  if (mode === "service") {
    const key = getServiceRoleKey();
    if (!key) throw new VpsError("PLUTO_SERVICE_ROLE_KEY not configured", 500, null);
    headers.apikey = key;
    headers.authorization = `Bearer ${key}`;
  } else if (mode === "anon") {
    const key = getAnonKey();
    if (key) headers.apikey = key;
  } else if (mode === "user") {
    if (!opts.token) throw new VpsError("user token required", 401, null);
    headers.authorization = `Bearer ${opts.token}`;
    const anon = getAnonKey();
    if (anon) headers.apikey = anon;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 30_000);
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: ac.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!res.ok) {
      const msg = (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as { error?: unknown }).error === "string")
        ? (parsed as { error: string }).error
        : `HTTP ${res.status}`;
      throw new VpsError(`${method} ${path} → ${msg}`, res.status, parsed);
    }
    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}
