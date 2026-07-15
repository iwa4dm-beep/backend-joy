// E2E — auth redirects and session persistence across custom domain and
// subdomain.
//
// Verifies that:
//   1. Hitting a protected route unauthenticated redirects to /auth on
//      BOTH the apex custom domain and the configured subdomain.
//   2. After signing in on the apex, the session persists when the user
//      navigates to the subdomain (shared parent-domain cookie / auth
//      broadcast) — or, if cross-subdomain persistence is intentionally
//      disabled, the user is cleanly redirected back to /auth on the
//      subdomain rather than seeing a broken half-authed shell.
//   3. Reloading a protected page after sign-in on either host keeps the
//      session (localStorage / cookie survives a hard reload).
//
// Configuration (opt-in — the whole suite self-skips otherwise):
//
//   PLUTO_APEX_URL=https://plutobaas.example.com
//   PLUTO_SUBDOMAIN_URL=https://api.plutobaas.example.com
//   PLUTO_E2E_EMAIL=test-user@example.com
//   PLUTO_E2E_PASSWORD=...
//
// Without those, the fast smoke test runs against http://localhost:8080
// with a primed localStorage session, covering redirect + reload
// persistence on a single host as a floor.
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const APEX = process.env.PLUTO_APEX_URL;
const SUB = process.env.PLUTO_SUBDOMAIN_URL;
const EMAIL = process.env.PLUTO_E2E_EMAIL;
const PASSWORD = process.env.PLUTO_E2E_PASSWORD;

const SESSION_KEY = "pluto.session.v1";
const PROTECTED_PATH = "/dashboard/auto-connect";
const AUTH_PATH = "/auth";

async function signIn(page: Page, host: string) {
  await page.goto(`${host}${AUTH_PATH}`);
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(AUTH_PATH), { timeout: 15_000 });
}

test.describe("Auth redirects on protected routes (localhost floor)", () => {
  test("unauthenticated hit on protected route redirects to /auth", async ({ page }) => {
    await page.goto(PROTECTED_PATH);
    // TanStack redirect() may resolve either during SSR or client bootstrap.
    await page.waitForURL(/\/auth(\?|$)/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/auth/);
  });

  test("primed session survives a hard reload on the same host", async ({ page }) => {
    const session = {
      access_token: "e2e.persist.token",
      refresh_token: "e2e.persist.refresh",
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
    await page.route("**/api/pluto/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto("/");
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k, v),
      [SESSION_KEY, JSON.stringify(session)] as const,
    );
    await page.goto(PROTECTED_PATH);
    await expect(
      page.getByRole("heading", { name: "Auto-Connect Studio", level: 1 }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Auto-Connect Studio", level: 1 }),
    ).toBeVisible();
    // URL must not have bounced to /auth on reload.
    expect(page.url()).not.toMatch(/\/auth/);
  });
});

test.describe("Cross-host auth persistence (apex ↔ subdomain)", () => {
  test.skip(
    !APEX || !SUB || !EMAIL || !PASSWORD,
    "Set PLUTO_APEX_URL, PLUTO_SUBDOMAIN_URL, PLUTO_E2E_EMAIL, PLUTO_E2E_PASSWORD to run.",
  );

  test("unauthenticated hit on protected path redirects to /auth on apex", async ({ page }) => {
    await page.goto(`${APEX}${PROTECTED_PATH}`);
    await page.waitForURL(new RegExp(`${AUTH_PATH}(\\?|$)`), { timeout: 15_000 });
    expect(page.url()).toContain(AUTH_PATH);
  });

  test("unauthenticated hit on protected path redirects to /auth on subdomain", async ({ page }) => {
    await page.goto(`${SUB}${PROTECTED_PATH}`);
    await page.waitForURL(new RegExp(`${AUTH_PATH}(\\?|$)`), { timeout: 15_000 });
    expect(page.url()).toContain(AUTH_PATH);
  });

  test("session started on apex either persists on subdomain or cleanly redirects", async ({
    browser,
  }) => {
    // Fresh context so cookies/localStorage from previous tests don't leak.
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();

    await signIn(page, APEX!);
    await page.goto(`${APEX}${PROTECTED_PATH}`);
    await expect(
      page.getByRole("heading", { name: "Auto-Connect Studio", level: 1 }),
    ).toBeVisible();

    // Hop to subdomain. Same browser context carries any parent-domain
    // cookies; localStorage does NOT cross hosts.
    await page.goto(`${SUB}${PROTECTED_PATH}`);

    // Two acceptable outcomes:
    //   (a) auth persisted → heading visible on subdomain
    //   (b) auth is host-scoped → we land on /auth cleanly (no error page)
    await page
      .waitForFunction(
        () =>
          document.querySelector('h1')?.textContent?.includes("Auto-Connect Studio") ||
          location.pathname.startsWith("/auth"),
        { timeout: 15_000 },
      );
    const settledPath = new URL(page.url()).pathname;
    expect(
      settledPath.startsWith("/auth") || settledPath.startsWith("/dashboard"),
    ).toBe(true);

    await context.close();
  });

  test("hard reload on subdomain after sign-in keeps the session", async ({ browser }) => {
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, SUB!);
    await page.goto(`${SUB}${PROTECTED_PATH}`);
    await expect(
      page.getByRole("heading", { name: "Auto-Connect Studio", level: 1 }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Auto-Connect Studio", level: 1 }),
    ).toBeVisible();
    expect(page.url()).not.toContain(AUTH_PATH);
    await context.close();
  });
});
