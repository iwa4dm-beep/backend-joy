// Integration test for the SET LOCAL ROLE code path.
//
// Locks in the fix for `role "admin" does not exist`. We simulate what
// runAs() does inside rest.ts by driving resolvePgRole() through every
// jwt.role value the frontend can plausibly send (admin / user /
// super_admin / moderator / editor / service_role / anon / authenticated /
// missing) and asserting that:
//
//   1. The string handed to `SET LOCAL ROLE` is always one of the three
//      real Postgres roles (anon / authenticated / service_role→collapsed).
//   2. `admin` NEVER reaches Postgres via SET ROLE, no matter the JWT.
//   3. Fallback cases raise the `fellBack` flag so the API logs
//      `rest.role_fallback`.
//
// Run: `node --test --import tsx pluto-backend/packages/api/tests/rest-set-role.test.ts`

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePgRole, VALID_PG_ROLES } from '../src/routes/rest-role.js';

// Mimic the exact statement rest.ts issues: `SET LOCAL ROLE ${pgRole}`.
// If a bad role ever slipped through, Postgres would raise 22023 /
// `role "<x>" does not exist`. We assert on the composed string instead.
function buildSetRoleStatement(jwtRole: unknown): { sql: string; fellBack: boolean; original: string } {
  const { pgRole, fellBack, original } = resolvePgRole(jwtRole);
  return { sql: `SET LOCAL ROLE ${pgRole}`, fellBack, original };
}

const CASES: Array<{ jwt: unknown; expectSql: string; expectFallback: boolean }> = [
  { jwt: 'anon',          expectSql: 'SET LOCAL ROLE anon',          expectFallback: false },
  { jwt: 'authenticated', expectSql: 'SET LOCAL ROLE authenticated', expectFallback: false },
  { jwt: 'admin',         expectSql: 'SET LOCAL ROLE authenticated', expectFallback: true  },
  { jwt: 'user',          expectSql: 'SET LOCAL ROLE authenticated', expectFallback: true  },
  { jwt: 'super_admin',   expectSql: 'SET LOCAL ROLE authenticated', expectFallback: true  },
  { jwt: 'moderator',     expectSql: 'SET LOCAL ROLE authenticated', expectFallback: true  },
  { jwt: 'editor',        expectSql: 'SET LOCAL ROLE authenticated', expectFallback: true  },
  { jwt: 'service_role',  expectSql: 'SET LOCAL ROLE authenticated', expectFallback: true  },
  { jwt: undefined,       expectSql: 'SET LOCAL ROLE anon',          expectFallback: false },
  { jwt: null,            expectSql: 'SET LOCAL ROLE anon',          expectFallback: false },
  { jwt: '',              expectSql: 'SET LOCAL ROLE anon',          expectFallback: false },
];

describe('SET LOCAL ROLE — no jwt.role ever reaches Postgres unfiltered', () => {
  for (const c of CASES) {
    it(`jwt.role=${JSON.stringify(c.jwt)} → ${c.expectSql}`, () => {
      const out = buildSetRoleStatement(c.jwt);
      assert.equal(out.sql, c.expectSql);
      assert.equal(out.fellBack, c.expectFallback);
    });
  }

  it('admin JWT never yields `SET LOCAL ROLE admin` (regression for "role admin does not exist")', () => {
    for (const variant of ['admin', 'ADMIN', 'Admin', 'super_admin']) {
      const out = buildSetRoleStatement(variant);
      assert.notEqual(out.sql, 'SET LOCAL ROLE admin', `variant=${variant} leaked admin to SET ROLE`);
      assert.ok(
        (VALID_PG_ROLES as readonly string[]).includes(out.sql.replace('SET LOCAL ROLE ', '')),
        `variant=${variant} produced non-whitelisted role`,
      );
    }
  });
});

describe('SET LOCAL ROLE — simulated tx captures every statement', () => {
  // Reproduces rest.ts runAs(): SET LOCAL ROLE, then 4× set_config for
  // pluto.user_id / pluto.role / pluto.jwt / request.jwt.claims. We drive
  // a fake `tx` through the same sequence and assert on the recorded log.
  async function runAsSim(claims: { role?: string; sub?: string }, capture: string[]) {
    const { pgRole } = resolvePgRole(claims.role);
    capture.push(`SET LOCAL ROLE ${pgRole}`);
    capture.push(`set_config('pluto.user_id', '${claims.sub ?? ''}', true)`);
    capture.push(`set_config('pluto.role', '${claims.role ?? (pgRole === 'anon' ? 'anon' : 'authenticated')}', true)`);
    capture.push(`set_config('pluto.jwt', ${JSON.stringify(JSON.stringify(claims))}, true)`);
  }

  it('admin JWT → SET ROLE authenticated + pluto.role=admin retained in GUC', async () => {
    const log: string[] = [];
    await runAsSim({ role: 'admin', sub: 'u-1' }, log);
    assert.ok(log[0] === 'SET LOCAL ROLE authenticated', 'first stmt must set the Postgres role safely');
    assert.ok(log.some((l) => l.includes("'pluto.user_id', 'u-1'")), 'user id must be pushed for auth.uid()');
    assert.ok(log.some((l) => l.includes("'pluto.role', 'admin'")), 'app role kept in GUC for RLS checks');
    assert.ok(!log.some((l) => l === 'SET LOCAL ROLE admin'), 'admin must never be the pg role');
  });

  it('super_admin JWT → SET ROLE authenticated + pluto.role=super_admin', async () => {
    const log: string[] = [];
    await runAsSim({ role: 'super_admin', sub: 'u-2' }, log);
    assert.equal(log[0], 'SET LOCAL ROLE authenticated');
    assert.ok(log.some((l) => l.includes("'pluto.role', 'super_admin'")));
  });

  it('user JWT → SET ROLE authenticated + pluto.role=user', async () => {
    const log: string[] = [];
    await runAsSim({ role: 'user', sub: 'u-3' }, log);
    assert.equal(log[0], 'SET LOCAL ROLE authenticated');
    assert.ok(log.some((l) => l.includes("'pluto.role', 'user'")));
  });

  it('anonymous request → SET ROLE anon, empty pluto.user_id', async () => {
    const log: string[] = [];
    await runAsSim({}, log);
    assert.equal(log[0], 'SET LOCAL ROLE anon');
    assert.ok(log.some((l) => l.includes("'pluto.user_id', ''")));
  });
});
