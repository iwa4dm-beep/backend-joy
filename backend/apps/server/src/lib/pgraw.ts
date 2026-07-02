// Small raw-SQL helper for the phase 15/16 modules whose tables are not
// in the Kysely type map. Uses the same pool as `db` under the hood.
import pg from "pg";
import { env } from "../config.js";

export const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string, params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return pgPool.query<T>(text, params as never);
}
