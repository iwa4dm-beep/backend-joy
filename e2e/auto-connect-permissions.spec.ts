// E2E — Auto-Connect Studio, admin permission and full-access surface.
//
// Boots the dashboard with an admin session primed in localStorage, mocks
// the Pluto backend so no real backend is needed, and asserts that every
// major action (wizard steps, deploy card, VPS card, E2E test tab, logs
// tab, help tab) is visible and reachable for the admin role.
import { test, expect, type Page } from "@playwright/test";

const SESSION_KEY = "pluto.session.v1";
const AUTO_CONNECT_PATH = "/dashboard/auto-connect";

const adminSession = {
  access_token: "e2e.admin.token",
  refresh_token: "e2e.admin.refresh",
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  user: {
    id: "00000000-0000-0000-0000-0000000000ad",
    email: "admin@example.com",
    role: "admin",
    created_at: new Date().toISOString(),
    email_verified: true,
    email_confirmed_at: new Date().toISOString(),
  },
};

async function primeAdmin(page: Page) {
  await page.route("**/api/pluto/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/");
  await page.evaluate(
    ([key, value, tourKey]) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(tourKey, "1");
    },
    [SESSION_KEY, JSON.stringify(adminSession), "pluto:help:onboarded"] as const,
  );
}

test.describe("Auto-Connect Studio — admin full access", () => {
  test("admin loads the page and sees the wizard heading + tabs", async ({ page }) => {
    await primeAdmin(page);
    await page.goto(AUTO_CONNECT_PATH);
    await expect(page.getByRole("heading", { name: "Auto-Connect Studio", level: 1 })).toBeVisible();
    // Tabs (wizard / test / logs / help) are the top-level admin surface.
    for (const label of [/Wizard/i, /Test/i, /Logs/i, /Help/i]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    }
  });

  test("admin can switch to Test, Logs, and Help tabs without permission errors", async ({ page }) => {
    await primeAdmin(page);
    await page.goto(AUTO_CONNECT_PATH);

    for (const label of ["Test", "Logs", "Help"]) {
      await page.getByRole("button", { name: new RegExp(label, "i") }).first().click();
      await expect(page).toHaveURL(new RegExp(AUTO_CONNECT_PATH));
      await expect(page.getByText(/permission denied|unauthori[sz]ed|forbidden/i)).toHaveCount(0);
    }
  });

  test("admin has the sidebar item flagged as current page", async ({ page }) => {
    await primeAdmin(page);
    await page.goto(AUTO_CONNECT_PATH);
    const link = page.getByRole("link", { name: "Auto-Connect Studio" }).first();
    await expect(link).toHaveAttribute("aria-current", "page");
  });

  test("admin sees deploy / VPS / provisioning cards (privileged actions)", async ({ page }) => {
    await primeAdmin(page);
    await page.goto(AUTO_CONNECT_PATH);
    // These cards are only rendered for admins on the Auto-Connect page.
    // Match by loose text so refactors don't break the check.
    await expect(page.getByText(/Deploy to VPS|VPS Deploy|Provision/i).first()).toBeVisible();
  });

  test("unauthenticated visitor is redirected to /auth (permission gate)", async ({ page }) => {
    await page.route("**/api/pluto/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    // Ensure no session in storage.
    await page.goto("/");
    await page.evaluate((key) => window.localStorage.removeItem(key), SESSION_KEY);
    await page.goto(AUTO_CONNECT_PATH);
    // Either the app redirects to /auth OR renders an inline sign-in prompt.
    // Both are acceptable — assert one of the two.
    const url = page.url();
    if (!/\/auth(\?|$)/.test(url)) {
      await expect(page.getByText(/sign in|log ?in|authenticate/i).first()).toBeVisible();
    } else {
      expect(url).toMatch(/\/auth/);
    }
  });
});
