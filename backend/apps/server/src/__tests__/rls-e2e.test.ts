// End-to-end RLS verification against a REAL Postgres instance.
//
// Skipped unless PLUTO_E2E_DATABASE_URL is set — CI provides this. The
// test creates a scratch table, defines a row-level policy scoped to
// `pluto.user_id`, then proves:
//
//   • A non-admin user sees ONLY their own rows.
//   • Setting `pluto.role = 'admin'` (mirrors how the REST layer opens
//     a service-role transaction) reveals ALL rows.
//   • Insert-time WITH CHECK rejects rows owned by someone else.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const url = process.env.PLUTO_E2E_DATABASE_URL;
const d = url ? describe : describe.skip;

let pool: pg.Pool;
const alice = "11111111-1111-1111-1111-111111111111";
const bob   = "22222222-2222-2222-2222-222222222222";
const table = `rls_e2e_${Math.random().toString(36).slice(2, 8)}`;

d("RLS end-to-end (real Postgres)", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url!, max: 3 });
    const c = await pool.connect();
    try {
      // Fresh scratch table with the same policy shape our real
      // workspace-scoped tables use.
      await c.query(`create table if not exists public.${table} (
        id serial primary key,
        user_id uuid not null,
        note text
      )`);
      await c.query(`alter table public.${table} enable row level security`);
      await c.query(`drop policy if exists ${table}_owner on public.${table}`);
      await c.query(`create policy ${table}_owner on public.${table}
        for all
        using  (current_setting('pluto.role', true) = 'admin' or user_id::text = current_setting('pluto.user_id', true))
        with check (current_setting('pluto.role', true) = 'admin' or user_id::text = current_setting('pluto.user_id', true))`);
      await c.query(`insert into public.${table} (user_id, note) values ($1,'alice-1'),($1,'alice-2'),($2,'bob-1')`, [alice, bob]);
    } finally { c.release(); }
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`drop table if exists public.${table}`);
    await pool.end();
  });

  const asUser = async (uid: string, role: "user" | "admin") => {
    const c = await pool.connect();
    await c.query("begin");
    // The REST layer sets these GUCs at the top of every request.
    await c.query(`select set_config('pluto.user_id', $1, true), set_config('pluto.role', $2, true)`, [uid, role]);
    await c.query(`set local role authenticated`);
    return c;
  };

  it("alice sees only her rows", async () => {
    const c = await asUser(alice, "user");
    try {
      const r = await c.query(`select note from public.${table} order by id`);
      expect(r.rows.map((x) => x.note)).toEqual(["alice-1", "alice-2"]);
    } finally { await c.query("rollback"); c.release(); }
  });

  it("bob sees only his row", async () => {
    const c = await asUser(bob, "user");
    try {
      const r = await c.query(`select note from public.${table}`);
      expect(r.rows.map((x) => x.note)).toEqual(["bob-1"]);
    } finally { await c.query("rollback"); c.release(); }
  });

  it("admin JWT sees ALL rows", async () => {
    const c = await asUser(alice, "admin");
    try {
      const r = await c.query(`select count(*)::int as n from public.${table}`);
      expect(r.rows[0].n).toBe(3);
    } finally { await c.query("rollback"); c.release(); }
  });

  it("WITH CHECK rejects insert spoofing another user_id", async () => {
    const c = await asUser(alice, "user");
    let threw = false;
    try {
      await c.query(`insert into public.${table} (user_id, note) values ($1, 'spoof')`, [bob]);
    } catch (e) {
      threw = true;
      expect(String((e as Error).message)).toMatch(/row-level security|violates/i);
    } finally { await c.query("rollback"); c.release(); }
    expect(threw).toBe(true);
  });
});
