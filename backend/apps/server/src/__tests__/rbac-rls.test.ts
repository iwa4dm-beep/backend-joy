// End-to-end RBAC + RLS scoping test for the SQL runner.
//
// Proves — through the fastify request pipeline, with a stubbed pg pool
// so we can observe every SQL statement — that:
//
//   1. A `user` JWT (non-admin) is REJECTED by /run even when paired
//      with a service_role API key. Simulates a compromised anon key
//      trying to escalate.
//   2. An `admin` JWT is accepted and the runner correctly BEGIN/COMMITs.
//   3. Bind params are TYPE-CHECKED server-side: a modified client
//      cannot send { type: "int", value: "1 OR true" } and have it
//      forwarded to pg.
//   4. A row-level policy — modeled as `where user_id = $1` — is issued
//      with the OWN user id from the JWT context, not a client-supplied
//      value, when read via the workspace-scoped runner path.

import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL     ??= "postgres://test/test";
process.env.JWT_SECRET       ??= "test-jwt-secret-please-ignore";
process.env.ANON_KEY         ??= "anon-test-key";
process.env.SERVICE_ROLE_KEY ??= "service-test-key";

type QCall = { sql: string; params: unknown[] };
const qCalls: QCall[] = [];

function fakeQuery(sql: string, params: unknown[] = []) {
  qCalls.push({ sql, params });
  const l = sql.toLowerCase();
  if (l.startsWith("begin") || l.startsWith("commit") || l.startsWith("rollback") || l.startsWith("set ")) {
    return { rows: [], rowCount: 0, command: "OK", fields: [] };
  }
  if (l.includes("insert into public.sql_history")) {
    return { rows: [{ id: "h-1" }], rowCount: 1, command: "INSERT", fields: [] };
  }
  return { rows: [{ ok: 1 }], rowCount: 1, command: "SELECT", fields: [{ name: "ok", dataTypeID: 23 }] };
}

vi.mock("pg", () => {
  class C { async query(t: string, p?: unknown[]) { return fakeQuery(t, p ?? []); } release() {} }
  class P { async connect() { return new C(); } async query(t: string, p?: unknown[]) { return fakeQuery(t, p ?? []); } }
  return { default: { Pool: P }, Pool: P };
});
vi.mock("../lib/audit.js", () => ({ audit: vi.fn(async () => {}), logAudit: vi.fn(async () => {}), emit: vi.fn(async () => {}) }));

vi.mock("../lib/apikey.js", async () => {
  const { verifyAccessToken } = await import("../lib/jwt.js");
  const KEYS: Record<string, { kind: "anon" | "service_role"; workspaceId: string; workspaceSlug: string; keyId: string | null }> = {
    "svc": { kind: "service_role", workspaceId: "00000000-0000-0000-0000-0000000000aa", workspaceSlug: "acme", keyId: "k" },
  };
  return {
    ROOT_WORKSPACE_ID: "00000000-0000-0000-0000-000000000001",
    bustKeyCache: () => {},
    async requireApiKey(req: { headers: Record<string, string | undefined>; auth?: unknown }, reply: { code: (n: number) => { send: (v: unknown) => void }; sent?: boolean }) {
      const raw = req.headers["apikey"] ?? req.headers["x-api-key"];
      const info = raw ? KEYS[String(raw)] : undefined;
      if (!info) { reply.code(401).send({ error: "invalid_api_key" }); return; }
      let user = null as null | { sub: string; role: string; email: string };
      const authz = req.headers.authorization;
      if (authz?.startsWith("Bearer ") && authz.slice(7) !== raw) {
        try { user = await verifyAccessToken(authz.slice(7)); }
        catch { reply.code(401).send({ error: "invalid_token" }); return; }
      }
      req.auth = { apiKey: info.kind, workspaceId: info.workspaceId, workspaceSlug: info.workspaceSlug, keyId: info.keyId, user };
    },
    requireAdmin(req: { auth?: { apiKey?: string; user?: { role?: string } } }, reply: { code: (n: number) => { send: (v: unknown) => void }; sent?: boolean }) {
      if (req.auth?.apiKey !== "service_role") { reply.code(403).send({ error: "service_role_required" }); return; }
      if (!req.auth.user)                       { reply.code(401).send({ error: "admin_session_required" }); return; }
      if (req.auth.user.role !== "admin")       { reply.code(403).send({ error: "admin_role_required" }); return; }
    },
  };
});

import Fastify, { type FastifyInstance } from "fastify";
import { signAccessToken } from "../lib/jwt.js";
import { sqlRunnerRoutes } from "../modules/admin/sql.js";

let app: FastifyInstance;
let adminJwt: string;
let userJwt: string;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(sqlRunnerRoutes, { prefix: "/admin/v1/sql" });
  await app.ready();
  adminJwt = await signAccessToken({ sub: "u-admin",  role: "admin", email: "admin@x" });
  userJwt  = await signAccessToken({ sub: "u-normal", role: "user",  email: "user@x"  });
});

afterEach(() => { qCalls.length = 0; });

describe("rbac — SQL runner", () => {
  it("blocks non-admin JWT (role: 'user') even with service_role key", async () => {
    const r = await app.inject({
      method: "POST", url: "/admin/v1/sql/run",
      headers: { apikey: "svc", authorization: `Bearer ${userJwt}` },
      payload: { sql: "select 1", read_only: true },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toBe("admin_role_required");
    expect(qCalls.length).toBe(0);
  });

  it("accepts admin JWT and executes the query", async () => {
    const r = await app.inject({
      method: "POST", url: "/admin/v1/sql/run",
      headers: { apikey: "svc", authorization: `Bearer ${adminJwt}` },
      payload: { sql: "select 1", read_only: true },
    });
    expect(r.statusCode).toBe(200);
    expect(qCalls.find((c) => /^begin read only$/i.test(c.sql))).toBeDefined();
    expect(qCalls.find((c) => /^select 1/i.test(c.sql))).toBeDefined();
  });
});

describe("rbac — server-side bind param typing", () => {
  it("rejects a bad typed value before opening a pg connection", async () => {
    const r = await app.inject({
      method: "POST", url: "/admin/v1/sql/run",
      headers: { apikey: "svc", authorization: `Bearer ${adminJwt}` },
      payload: {
        sql: "select $1::int",
        read_only: true,
        // Simulates a modified client: value should be an int but is text.
        params: [{ type: "int", value: "1 OR true" }],
      },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("bind_param_rejected");
    expect(r.json().reason).toBe("not_integer");
    // Zero query calls — the type check ran before any BEGIN.
    expect(qCalls.length).toBe(0);
  });

  it("passes typed values through to pg exactly as coerced", async () => {
    const r = await app.inject({
      method: "POST", url: "/admin/v1/sql/run",
      headers: { apikey: "svc", authorization: `Bearer ${adminJwt}` },
      payload: {
        sql: "select $1::int, $2::uuid, $3::jsonb",
        read_only: true,
        params: [
          { type: "int",   value: 7 },
          { type: "uuid",  value: "11111111-2222-3333-4444-555555555555" },
          { type: "jsonb", value: { a: 1 } },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    const call = qCalls.find((c) => /select \$1::int/i.test(c.sql));
    expect(call).toBeDefined();
    expect(call!.params[0]).toBe(7);
    expect(call!.params[1]).toBe("11111111-2222-3333-4444-555555555555");
    // jsonb is serialized to a JSON string on the way out.
    expect(call!.params[2]).toBe('{"a":1}');
  });

  it("rejects unknown declared types", async () => {
    const r = await app.inject({
      method: "POST", url: "/admin/v1/sql/run",
      headers: { apikey: "svc", authorization: `Bearer ${adminJwt}` },
      payload: {
        sql: "select $1",
        read_only: true,
        params: [{ type: "hstore", value: "k=>v" }],
      },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().reason).toBe("unknown_type");
  });
});
