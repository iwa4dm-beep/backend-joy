// Small raw-SQL helper for the phase 15/16 modules whose tables are not
// in the Kysely type map. Uses the same pool as `db` under the hood.
//
// Return-shape design: some modules were authored against pg's
// `QueryResult<T>` (they read `.rows[0]` / `.rowCount`), while others
// treat the return value as a plain array (they call `.filter`,
// `.length`, iterate via `for..of`). To keep both surfaces working
// during Wave 1 we return a hybrid: an array of rows with `rows` and
// `rowCount` attached as extra properties.
import pg from "pg";
import { env } from "../config.js";

export const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });

export type Rows<T> = T[] & { rows: T[]; rowCount: number };

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string, params: unknown[] = []
): Promise<Rows<T>> {
  const r = await pgPool.query<T>(text, params as never);
  const arr = r.rows.slice() as Rows<T>;
  Object.defineProperty(arr, "rows", { value: r.rows, enumerable: false });
  Object.defineProperty(arr, "rowCount", { value: r.rowCount ?? r.rows.length, enumerable: false });
  return arr;
}

// Back-compat alias: some modules import { pgraw }.
export const pgraw = q;


