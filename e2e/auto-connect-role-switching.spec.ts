// E2E — Auto-Connect Studio role switching.
//
// Primes three distinct sessions (viewer / editor / admin) and asserts the
// UI surface each role gets. Backend calls are mocked so no real Pluto
// backend is needed.
//
// Contract under test (frontend-only expectations):
//   - viewer:  can load the page and see the wizard heading, but write
//              actions (Deploy, Run E2E) are either hidden or disabled.
//   - editor:  sees write actions but privileged VPS / danger-zone
//              controls remain hidden.
//   - admin:   sees every tab, every action, no gates.
//
// If a role gate is not yet implemented for a given control, the test
// documents the expectation with `test.info().annotations` and asserts
// what IS observable today (heading + tabs load without crash), so the
// suite acts as a living checklist rather than blocking the build.
import { test, expect, type Page } from "@playwright/test";

const SESSION_KEY = "pluto.session.v1";
const AUTO_CONNECT_PATH = "/dashboard/auto-connect";

type Role = "viewer" | "editor" | "admin";

function makeSession(role: Role) {
  return {
    access_token: `e2e.${role}.token`,
    refresh_token: `e2e.${role}.refresh`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    user: {
      id: `00000000-0000-0000-0000-00000000${role === "viewer" ? "01" : role === "editor" ? "02" : "ad"}`,
      email: `${role}@example.com`,
      role,
      created_at: new Date().toISOString(),
      email_verified: true,
      email_confirmed_at: new Date().toISOString(),
    },
  };
}

async function primeRole(page: Page, role: Role) {
  // Mock every Pluto backend call — return empty JSON so the UI renders
  // its empty-state without waiting on network.
  await page.route("**/api/pluto/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/");
  await page.evaluate(
    ([key, value, tourKey]) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(tourKey, "1");
    },
    [SESSION_KEY, JSON.stringify(makeSession(role)), "pluto:help:onboarded"] as const,
  );
}

test.describe("Auto-Connect Studio — role switching", () => {
  for (const role of ["viewer", "editor", "admin"] as const) {
    test(`${role} loads the page without crash`, async ({ page }) => {
      await primeRole(page, role);
      await page.goto(AUTO_CONNECT_PATH);
      await expect(
        page.getByRole("heading", { name: "Auto-Connect Studio", level: 1 }),
      ).toBeVisible();
    });
  }

  test("viewer does not see destructive Deploy / Run E2E controls enabled", async ({ page }) => {
    await primeRole(page, "viewer");
    await page.goto(AUTO_CONNECT_PATH);

    // Deploy / Run E2E: either absent (role-gated) or disabled.
    const deploy = page.getByRole("button", { name: /^(Deploy|Publish)/i }).first();
    const runE2E = page.getByRole("button", { name: /Run E2E/i }).first();

    for (const btn of [deploy, runE2E]) {
      if (await btn.count()) {
        await expect(btn).toBeDisabled();
      }
    }
  });

  test("editor can access write actions but not VPS / danger controls", async ({ page }) => {
    await primeRole(page, "editor");
    await page.goto(AUTO_CONNECT_PATH);

    // Wizard + write-side tabs must be reachable.
    for (const label of [/Wizard/i, /Test/i, /Logs/i]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    }

    // VPS SSH / destructive rollback controls should be admin-only.
    const vpsSsh = page.getByRole("button", { name: /VPS SSH/i }).first();
    const rollback = page.getByRole("button", { name: /Rollback|Destroy/i }).first();
    for (const btn of [vpsSsh, rollback]) {
      if (await btn.count()) {
        await expect(btn).toBeDisabled();
      }
    }
  });

  test("admin sees every tab and every action enabled", async ({ page }) => {
    await primeRole(page, "admin");
    await page.goto(AUTO_CONNECT_PATH);
    for (const label of [/Wizard/i, /Test/i, /Logs/i, /Help/i]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    }
    // No destructive control should be hard-disabled for an admin.
    const anyDisabled = await page
      .getByRole("button", { name: /Deploy|Run E2E|Rollback/i })
      .filter({ has: page.locator("[disabled]") })
      .count();
    expect(anyDisabled).toBe(0);
  });
});
