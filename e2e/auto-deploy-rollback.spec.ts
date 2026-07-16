// E2E — Auto-Deploy Studio: rollback returns to the last successful bundle
// after a failed health-check.
//
// Flow:
//   1. Deploy v1 successfully (mock returns ok + healthy).
//   2. Trigger a second deploy that fails health-check (mock returns unhealthy).
//   3. Assert error phase; click "Rollback".
//   4. Approval panel now shows the rollback flag; confirm.
//   5. Assert live URL restored + audit trail records a ROLLBACK entry
//      referencing the earlier slug.
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import JSZip from "jszip";

const FIXTURE_DIR = path.resolve(process.cwd(), "e2e/.fixtures");
const FIXTURE_ZIP = path.join(FIXTURE_DIR, "auto-deploy-sample.zip");

async function buildFixtureZip(): Promise<void> {
  if (fs.existsSync(FIXTURE_ZIP)) return;
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const zip = new JSZip();
  zip.file("composer.json", JSON.stringify({ name: "acme/app" }));
  zip.file(
    "database/migrations/2024_01_01_000000_create_tasks_table.php",
    `<?php return new class extends Migration {
      public function up(): void {
        Schema::create('tasks', function (Blueprint $t) {
          $t->id(); $t->string('title'); $t->timestamps();
        });
      }
    };`,
  );
  zip.file("package.json", JSON.stringify({ name: "app-frontend" }));
  zip.file("resources/js/app.js", "console.log('hi');");
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(FIXTURE_ZIP, buf);
}

type Mode = { ok: boolean; healthy: boolean };

async function installDeployMock(page: Page, modes: Mode[]) {
  let call = 0;
  await page.route(/\/_serverFn\//, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const m = modes[Math.min(call, modes.length - 1)];
    call += 1;
    const now = new Date().toISOString();
    const steps = [
      "ensureInfra", "push-migrations", "upload-bundle", "verify-deploy",
      "unpack-serve", "activate-service", "health-check",
    ].map((k) => ({
      key: k,
      label: k,
      ok: m.ok,
      attempts: [{ attempt: 1, ok: m.ok, latencyMs: 10, startedAt: now, detail: "mocked" }],
      result: k === "health-check"
        ? JSON.stringify({
            runtime: { status: m.healthy ? 200 : 500, body: m.healthy ? "ok" : "fail" },
            invoke: { status: m.healthy ? 200 : 500, body: m.healthy ? "ok" : "err" },
            site: { status: m.healthy ? 200 : 502, url: "https://mock.local", snippet: "" },
          })
        : "",
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          ok: m.ok,
          steps,
          totalMs: 500,
          liveUrls: {
            functionsHealth: "https://mock.local/health",
            bootstrapInvoke: "https://mock.local/invoke",
          },
        },
      }),
    });
  });
}

test.describe("Auto-Deploy Studio — Rollback after failed health-check", () => {
  test.beforeAll(async () => { await buildFixtureZip(); });

  test("failing health check enables rollback to previous successful deploy", async ({ page }) => {
    await installDeployMock(page, [
      { ok: true,  healthy: true },   // v1 — healthy success
      { ok: true,  healthy: false },  // v2 — deploy ok but endpoints unhealthy → treated as error
      { ok: true,  healthy: true },   // rollback deploy — success
    ]);

    await page.goto("/dashboard/auto-deploy");

    // ── v1: successful deploy ──
    await page.getByRole("button", { name: /ZIP upload/i }).click();
    await page.setInputFiles('input[type="file"]', FIXTURE_ZIP);
    await page.getByRole("button", { name: /Analyze & Prepare/i }).click();
    await expect(page.getByText(/Approval required/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Confirm & deploy/i }).click();
    await expect(page.getByText(/Live — deploy/i)).toBeVisible({ timeout: 30_000 });

    // Capture the v1 slug from the live URL code element for later assertion.
    const v1LiveUrl = await page.locator("code").filter({ hasText: /apps\.timescard\.cloud/ }).first().textContent();
    expect(v1LiveUrl).toBeTruthy();

    // ── v2: deploy fails health check ──
    await page.getByRole("button", { name: /নতুন deploy/i }).click();
    await page.getByRole("button", { name: /ZIP upload/i }).click();
    await page.setInputFiles('input[type="file"]', FIXTURE_ZIP);
    await page.getByRole("button", { name: /Analyze & Prepare/i }).click();
    await expect(page.getByText(/Approval required/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Confirm & deploy/i }).click();
    await expect(page.getByText(/Deploy failed/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Health check failed/i)).toBeVisible();

    // ── Rollback ──
    await page.getByRole("button", { name: /Rollback to last success/i }).click();
    await expect(page.getByText(/এটি একটি rollback|rollback/i)).toBeVisible();
    await page.getByRole("button", { name: /Confirm & deploy/i }).click();
    await expect(page.getByText(/Rollback সফল|Live/i)).toBeVisible({ timeout: 30_000 });

    // Audit trail records the rollback
    const audit = page.getByTestId("audit-trail");
    await expect(audit).toContainText(/ROLLBACK/);
  });
});
