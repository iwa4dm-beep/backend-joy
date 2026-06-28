import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

async function main() {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  await client.query(`
    create table if not exists _pluto_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const exists = await client.query("select 1 from _pluto_migrations where name = $1", [file]);
    if (exists.rowCount) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`→ ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _pluto_migrations(name) values ($1)", [file]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  await client.end();
  console.log("✓ migrations done");
}

main().catch((e) => { console.error(e); process.exit(1); });
