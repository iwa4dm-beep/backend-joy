// Server functions: push migrations SQL + upload deployment bundle to VPS storage.
//
// Each fn returns a `debug` field with the raw request URL/method/status/body
// (request body redacted-truncated) so the UI can render live per-step logs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getVpsBaseUrl, getServiceRoleKey } from "./vps-client";

export type StepDebug = {
  url: string;
  method: string;
  status: number;
  latencyMs: number;
  reqBodyPreview: string | null;
  resBodyPreview: string;
};

function truncate(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + `\n… (+${s.length - n} chars)` : s;
}

async function rawFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | null,
  reqBodyForPreview: string | null,
  timeoutMs = 60_000,
): Promise<{ status: number; text: string; debug: StepDebug; ok: boolean }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { method, headers, body, signal: ac.signal });
    const text = await res.text();
    const debug: StepDebug = {
      url,
      method,
      status: res.status,
      latencyMs: Date.now() - started,
      reqBodyPreview: reqBodyForPreview ? truncate(reqBodyForPreview) : null,
      resBodyPreview: truncate(text || "(empty)"),
    };
    return { status: res.status, text, debug, ok: res.ok };
  } catch (e) {
    const debug: StepDebug = {
      url,
      method,
      status: 0,
      latencyMs: Date.now() - started,
      reqBodyPreview: reqBodyForPreview ? truncate(reqBodyForPreview) : null,
      resBodyPreview: (e as Error).message,
    };
    return { status: 0, text: (e as Error).message, debug, ok: false };
  } finally {
    clearTimeout(t);
  }
}

function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> | { error: string } {
  const key = getServiceRoleKey();
  if (!key) return { error: "PLUTO_SERVICE_ROLE_KEY not configured" };
  return { apikey: key, authorization: `Bearer ${key}`, accept: "application/json", ...extra };
}

// ---------- Step 1: push migrations ----------
const MigrationInput = z.object({
  workspaceId: z.string().min(1),
  sql: z.string().min(1).max(2 * 1024 * 1024),
  label: z.string().max(120).optional(),
});

export type PushMigrationResult =
  | { ok: true; migrationId: string; applied: number; debug: StepDebug }
  | { ok: false; error: string; status: number; debug: StepDebug | null };

export const pushMigrations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => MigrationInput.parse(d))
  .handler(async ({ data }): Promise<PushMigrationResult> => {
    const headers = serviceHeaders({ "content-type": "application/json" });
    if ("error" in headers) return { ok: false, error: headers.error, status: 500, debug: null };
    const url = `${getVpsBaseUrl()}/admin/v1/migrations`;
    const body = JSON.stringify({
      workspace_id: data.workspaceId,
      sql: data.sql,
      label: data.label ?? `auto-connect-${new Date().toISOString()}`,
    });
    const r = await rawFetch(url, "POST", headers, body, body, 60_000);
    if (!r.ok) return { ok: false, error: r.text || `HTTP ${r.status}`, status: r.status, debug: r.debug };
    let parsed: { id?: string; applied?: number } = {};
    try { parsed = JSON.parse(r.text); } catch { /* keep empty */ }
    return { ok: true, migrationId: parsed.id ?? "", applied: parsed.applied ?? 0, debug: r.debug };
  });

// ---------- Step 2: upload bundle to storage ----------
const UploadInput = z.object({
  workspaceId: z.string().min(1),
  bucket: z.string().min(1).max(64).default("deployments"),
  path: z.string().min(1).max(255),
  contentBase64: z.string().min(1),
  contentType: z.string().max(120).default("application/zip"),
});

export type UploadBundleResult =
  | { ok: true; key: string; size: number; debug: StepDebug }
  | { ok: false; error: string; status: number; debug: StepDebug | null };

export const uploadBundle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data }): Promise<UploadBundleResult> => {
    const headers = serviceHeaders({
      "content-type": data.contentType,
      "x-workspace-id": data.workspaceId,
      "x-upsert": "true",
    });
    if ("error" in headers) return { ok: false, error: headers.error, status: 500, debug: null };

    const bin = atob(data.contentBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const cleanPath = data.path.replace(/^\/+/, "");
    const url = `${getVpsBaseUrl()}/storage/v1/object/${encodeURIComponent(data.bucket)}/${cleanPath}`;
    const preview = `(binary upload ${bytes.length} bytes, content-type ${data.contentType})`;
    const r = await rawFetch(url, "POST", headers, bytes, preview, 120_000);
    if (!r.ok) return { ok: false, error: r.text || `HTTP ${r.status}`, status: r.status, debug: r.debug };
    return { ok: true, key: `${data.bucket}/${cleanPath}`, size: bytes.length, debug: r.debug };
  });

// ---------- Step 3: verify latest deployment ----------
const VerifyInput = z.object({ workspaceId: z.string().min(1) });

export type VerifyDeployResult =
  | { ok: true; latest: { id: string; createdAt?: string; status?: string } | null; debug: StepDebug }
  | { ok: false; error: string; status: number; debug: StepDebug | null };

export const verifyDeploy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data }): Promise<VerifyDeployResult> => {
    const headers = serviceHeaders();
    if ("error" in headers) return { ok: false, error: headers.error, status: 500, debug: null };
    const url = `${getVpsBaseUrl()}/admin/v1/workspaces/${encodeURIComponent(data.workspaceId)}/deployments?limit=1`;
    const r = await rawFetch(url, "GET", headers, null, null, 15_000);
    if (!r.ok) return { ok: false, error: r.text || `HTTP ${r.status}`, status: r.status, debug: r.debug };
    let parsed: { items?: Array<{ id: string; created_at?: string; status?: string }> } = {};
    try { parsed = JSON.parse(r.text); } catch { /* keep empty */ }
    const top = parsed.items?.[0];
    return {
      ok: true,
      latest: top ? { id: top.id, createdAt: top.created_at, status: top.status } : null,
      debug: r.debug,
    };
  });
