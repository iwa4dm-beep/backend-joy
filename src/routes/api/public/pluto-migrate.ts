// Public endpoint to push the tenant migration bundle to the VPS Pluto
// backend using the service role key. Called from the sandbox / Lovable
// via `stack_modern--invoke-server-function`. Reads the SQL from the
// server bundle (embedded at build time via ?raw import).
import { createFileRoute } from "@tanstack/react-router";
import { vpsFetch } from "@/lib/pluto/vps-client";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — vite ?raw import
import migrationSql from "@/../pluto-backend/migrations/tenants/0001_dbh_dubaiborkahouse.sql?raw";

type ExecResult = {
  ok?: boolean;
  row_count?: number;
  duration_ms?: number;
  error?: string;
  message?: string;
  classifications?: unknown;
};

export const Route = createFileRoute("/api/public/pluto-migrate")({
  server: {
    handlers: {
      GET: async () => {
        const sql = String(migrationSql);
        const bytes = sql.length;
        try {
          const res = await vpsFetch<ExecResult>("/admin/v1/sql/exec", {
            method: "POST",
            mode: "service",
            timeoutMs: 120_000,
            body: {
              sql,
              read_only: false,
              allow_dangerous: true,
              confirm_destructive: true,
            },
          });
          return new Response(
            JSON.stringify({ ok: true, bytes, result: res }, null, 2),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (e: unknown) {
          const err = e as { status?: number; body?: unknown; message?: string };
          return new Response(
            JSON.stringify(
              { ok: false, bytes, status: err.status ?? 0, error: err.message, body: err.body },
              null, 2,
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
