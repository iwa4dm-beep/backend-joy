// Per-slug secret rotation + repair history + subdomain provisioning.
// All calls proxy to the authenticated sandbox worker admin surface.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getVpsBaseUrl } from "./vps-client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function envFirst(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function workerConfig() {
  const base = getVpsBaseUrl();
  const sandboxUrl = (envFirst("PLUTO_SANDBOX_URL") || `${base}/sandbox`).replace(/\/+$/, "");
  const secret = envFirst("PLUTO_SANDBOX_SECRET", "PLUTO_SANDBOX_WORKER_SECRET", "SANDBOX_SHARED_SECRET");
  return { sandboxUrl, secret };
}

async function workerFetch(pathAndQuery: string, init: RequestInit = {}) {
  const { sandboxUrl, secret } = workerConfig();
  if (!secret) throw new Error("PLUTO_SANDBOX_SECRET is not configured — set it in Lovable Cloud → Secrets.");
  const headers = new Headers(init.headers);
  headers.set("x-sandbox-secret", secret);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${sandboxUrl}${pathAndQuery}`, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const errMsg = (json && typeof json === "object" && "error" in (json as Record<string, unknown>))
      ? String((json as Record<string, unknown>).error) : `HTTP ${res.status}`;
    throw new Error(`Worker ${pathAndQuery} failed: ${errMsg}`);
  }
  return json as Record<string, unknown>;
}

const SlugInput = z.object({ slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i, "invalid slug"), note: z.string().max(200).optional() });

export const rotateSlugSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SlugInput.parse(d))
  .handler(async ({ data }) => workerFetch("/admin/secrets/rotate", {
    method: "POST", body: JSON.stringify({ slug: data.slug, note: data.note }),
  }));

export const revokeSlugSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SlugInput.pick({ slug: true }).parse(d))
  .handler(async ({ data }) => workerFetch("/admin/secrets/revoke", {
    method: "POST", body: JSON.stringify({ slug: data.slug }),
  }));

export const getSlugSecretStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SlugInput.pick({ slug: true }).parse(d))
  .handler(async ({ data }) => workerFetch(`/admin/secrets/status?slug=${encodeURIComponent(data.slug)}`));

const HistoryInput = z.object({
  slug: z.string().max(128).optional(),
  action: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const getRepairHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HistoryInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    const params = new URLSearchParams();
    if (data.slug) params.set("slug", data.slug);
    if (data.action) params.set("action", data.action);
    if (data.limit) params.set("limit", String(data.limit));
    return workerFetch(`/admin/repair/history${params.size ? `?${params}` : ""}`);
  });

const ProvisionInput = z.object({
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i, "invalid slug"),
  seed: z.boolean().optional(),
  rotateSecret: z.boolean().optional(),
  revealSecret: z.boolean().optional(),
  baseDomain: z.string().max(253).optional(),
});

export const provisionSubdomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProvisionInput.parse(d))
  .handler(async ({ data }) => workerFetch("/admin/provision", {
    method: "POST", body: JSON.stringify(data),
  }));

export type WorkerJson = Record<string, unknown>;

// Shared helper used by /api/public/provision-subdomain.ts.
export async function callProvisionSubdomain(input: z.infer<typeof ProvisionInput>): Promise<WorkerJson> {
  const parsed = ProvisionInput.parse(input);
  return workerFetch("/admin/provision", { method: "POST", body: JSON.stringify(parsed) });
}
