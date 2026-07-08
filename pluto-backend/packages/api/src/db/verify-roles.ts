// Startup Postgres role verification.
//
// On boot we probe pg_roles for the four roles Pluto's Data API depends on:
//   anon, authenticated, service_role, admin (compat)
// Missing roles are logged as WARN (admin) or ERROR (anon/authenticated/
// service_role — the Data API cannot function without them).
//
// Non-fatal: the API still boots so /livez stays green, but operators see a
// clear, greppable line in `docker logs api` such as:
//   startup.role_check missing=[authenticated] — run deploy/ensure-pg-roles.sql

import { getSql } from './pool.js';
import type { Config } from '../config.js';

export const REQUIRED_PG_ROLES = ['anon', 'authenticated', 'service_role'] as const;
export const OPTIONAL_PG_ROLES = ['admin'] as const;

export interface RoleCheckResult {
  ok: boolean;
  present: string[];
  missingRequired: string[];
  missingOptional: string[];
  error?: string;
}

export async function verifyPgRoles(cfg: Config): Promise<RoleCheckResult> {
  try {
    const sql = getSql(cfg);
    const wanted = [...REQUIRED_PG_ROLES, ...OPTIONAL_PG_ROLES];
    const rows: Array<{ rolname: string }> = await sql`
      SELECT rolname FROM pg_roles WHERE rolname = ANY(${wanted as unknown as string[]})
    `;
    const present = rows.map((r) => r.rolname);
    const missingRequired = REQUIRED_PG_ROLES.filter((r) => !present.includes(r));
    const missingOptional = OPTIONAL_PG_ROLES.filter((r) => !present.includes(r));
    return { ok: missingRequired.length === 0, present, missingRequired, missingOptional };
  } catch (e: any) {
    return { ok: false, present: [], missingRequired: [...REQUIRED_PG_ROLES], missingOptional: [...OPTIONAL_PG_ROLES], error: e?.message || String(e) };
  }
}

export async function runStartupRoleCheck(
  cfg: Config,
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void },
): Promise<RoleCheckResult> {
  const result = await verifyPgRoles(cfg);
  const hint = 'run: psql -U $POSTGRES_USER -d $POSTGRES_DB < deploy/ensure-pg-roles.sql';
  if (result.error) {
    log.error({ startupRoleCheck: true, error: result.error, hint }, 'startup.role_check probe failed');
    return result;
  }
  if (result.missingRequired.length > 0) {
    log.error(
      { startupRoleCheck: true, missing: result.missingRequired, present: result.present, hint },
      `startup.role_check missing required Postgres roles [${result.missingRequired.join(',')}] — Data API will fail`,
    );
  }
  if (result.missingOptional.length > 0) {
    log.warn(
      { startupRoleCheck: true, missing: result.missingOptional, present: result.present, hint },
      `startup.role_check missing optional compatibility roles [${result.missingOptional.join(',')}] — old SQL/dumps referencing them may fail`,
    );
  }
  if (result.ok && result.missingOptional.length === 0) {
    log.info({ startupRoleCheck: true, present: result.present }, '✓ startup.role_check all Postgres roles present');
  }
  return result;
}
