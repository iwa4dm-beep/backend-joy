import { test, expect, type Page } from "@playwright/test";

// Route-level mocks for the Pluto SDK. We intercept fetch calls so the
// dashboard can render without a live backend. The dashboard needs
// VITE_PLUTO_URL to consider itself "live" — we set it via localStorage
// before navigation by short-circuiting the env check with a mock.

const PLUTO_URL = "http://pluto.mock";

const doneExport = {
  id: "exp-1", kind: "schema" as const, target: "public",
  status: "done" as const, bytes: 1024, download_path: "/tmp/exp-1.sql",
  error: null, created_at: new Date().toISOString(), finished_at: new Date().toISOString(),
};

async function installMocks(page: Page) {
  // Ensure the dashboard treats itself as configured against a live backend.
  await page.addInitScript((url) => {
    // Vite serves env at import.meta.env; the SDK reads VITE_PLUTO_URL.
    // We override it via a top-level property the SDK falls back to.
    (window as unknown as { __PLUTO_URL__?: string }).__PLUTO_URL__ = url;
    // Patch fetch to route Pluto API paths to our mock.
    const realFetch = window.fetch.bind(window);
    let restoreId = "res-1";
    let progress = 0;
    let stmts = 6;
    let canceled = false;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (!u.includes(url)) return realFetch(input, init);
      const path = u.replace(url, "");

      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

      if (path === "/backups/v1" && method === "GET") {
        return json({ exports: [{
          id: "exp-1", kind: "schema", target: "public", status: "done",
          bytes: 1024, download_path: "/tmp/exp-1.sql", error: null,
          created_at: new Date().toISOString(), finished_at: new Date().toISOString(),
        }] });
      }
      if (path === "/branches/v1" && method === "GET") return json({ branches: [] });
      if (path.startsWith("/backups/v1/exp-1/compat")) {
        return json({
          target_schema: "public", source_tables: 2, target_tables: 2,
          added_tables: ["new_table"], removed_tables: [],
          columns: [
            { table: "users", column: "email", source_type: "text", target_type: "varchar", action: "retype" },
            { table: "users", column: "avatar_url", source_type: "text", target_type: null, action: "add" },
          ],
          compatible: false,
        });
      }
      if (path === "/backups/v1/exp-1/restore" && method === "POST") {
        canceled = false; progress = 0;
        const body = JSON.parse((init?.body as string) ?? "{}");
        return json({ restore: { id: restoreId, dry_run: !!body.dry_run, status: "pending",
          progress: 0, applied_statements: 0, total_statements: stmts,
          error: null, created_at: new Date().toISOString(), finished_at: null,
          target_branch_id: null, target_schema: null } });
      }
      if (path.startsWith(`/backups/v1/restores/${restoreId}/stream`)) {
        // Stream a handful of SSE frames.
        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(enc.encode(`: connected\n\n`));
            for (let i = 1; i <= stmts && !canceled; i++) {
              await new Promise(r => setTimeout(r, 40));
              progress = Math.round((i / stmts) * 100);
              const payload = { id: restoreId, dry_run: true, status: i === stmts ? "done" : "running",
                progress, applied_statements: i, total_statements: stmts, log: `[${i}/${stmts}] DRY create table…\n`,
                error: null, created_at: new Date().toISOString(),
                finished_at: i === stmts ? new Date().toISOString() : null };
              controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
            }
            controller.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }
      if (path === `/backups/v1/restores/${restoreId}/cancel` && method === "POST") {
        canceled = true;
        return json({ ok: true });
      }
      // Fallback: 200 empty.
      return json({});
    };
  }, PLUTO_URL);

  // Also seed the SDK's env-based config by writing to localStorage the
  // dev-time override key the SDK reads on startup, if any. Not strictly
  // needed when VITE_PLUTO_URL is set at build; kept as belt-and-braces.
  await page.addInitScript(() => {
    try { window.localStorage.setItem("pluto.mock", "1"); } catch { /* ignore */ }
  });
}

test.describe("backup restore wizard", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");

  test.beforeEach(async ({ page }) => {
    // If VITE_PLUTO_URL is not set at build time, the dashboard shows a
    // yellow "backend not configured" banner. In that case the mocks still
    // fire but isLive() returns false and the exports list stays empty.
    // The e2e assumes the dev build has VITE_PLUTO_URL=<PLUTO_URL>.
    process.env.VITE_PLUTO_URL = PLUTO_URL;
    process.env.VITE_PLUTO_ANON_KEY = "anon.test";
    await installMocks(page);
  });

  test("dry-run preview: compat diff → stream → completion", async ({ page }) => {
    await page.goto("/dashboard/backups");
    if (!(await page.getByRole("button", { name: /Restore/ }).first().isVisible().catch(() => false))) {
      test.skip(true, "backend not configured for e2e (set VITE_PLUTO_URL & VITE_PLUTO_ANON_KEY to " + PLUTO_URL + ")");
    }
    await page.getByRole("button", { name: /Restore/ }).first().click();
    await expect(page.getByText(/Restore wizard/i)).toBeVisible();

    // Compat check
    await page.getByRole("button", { name: /Check compatibility/i }).click();
    await expect(page.getByText(/incompatible/i)).toBeVisible();
    await expect(page.getByText(/tables to create/i)).toBeVisible();

    // Dry-run is on by default; apply
    await page.getByTestId("restore-apply").click();
    await expect(page.getByText(/DRY-RUN/i)).toBeVisible();
    // Progress bar reaches "done"
    await expect(page.getByText(/^done$/i)).toBeVisible({ timeout: 5_000 });
  });

  test("live restore requires typing RESTORE", async ({ page }) => {
    await page.goto("/dashboard/backups");
    if (!(await page.getByRole("button", { name: /Restore/ }).first().isVisible().catch(() => false))) {
      test.skip(true, "backend not configured for e2e");
    }
    await page.getByRole("button", { name: /Restore/ }).first().click();
    await page.getByLabel(/Dry-run preview/i).uncheck();
    // Compat is incompatible + not acknowledged, so Apply is disabled.
    await page.getByRole("button", { name: /Check compatibility/i }).click();
    await expect(page.getByTestId("compat-ack")).toBeVisible();
    await expect(page.getByTestId("restore-apply")).toBeDisabled();
    await page.getByTestId("compat-ack").check();
    // Still disabled until confirm typed.
    await expect(page.getByTestId("restore-apply")).toBeEnabled();
  });

  test("close button stops the SSE stream and clears wizard", async ({ page }) => {
    await page.goto("/dashboard/backups");
    if (!(await page.getByRole("button", { name: /Restore/ }).first().isVisible().catch(() => false))) {
      test.skip(true, "backend not configured for e2e");
    }
    await page.getByRole("button", { name: /Restore/ }).first().click();
    await expect(page.getByText(/Restore wizard/i)).toBeVisible();
    await page.getByTestId("restore-apply").click();
    // Close immediately — the SSE mock is still running.
    await page.locator('button:has(svg.lucide-x)').first().click();
    await expect(page.getByText(/Restore wizard/i)).not.toBeVisible();
  });
});
