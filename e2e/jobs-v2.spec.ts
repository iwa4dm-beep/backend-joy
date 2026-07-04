// Phase 62 — Playwright e2e for Jobs v2.
// Skips unless PLUTO_ENABLE_JOBS_V2=1.
import { test, expect } from "@playwright/test";

const BASE = process.env.PLUTO_API_BASE ?? "http://localhost:8080";
const API_KEY = process.env.PLUTO_API_KEY ?? "dev-anon";
const enabled = process.env.PLUTO_ENABLE_JOBS_V2 === "1";
const WS = "00000000-0000-0000-0000-000000000062";
const H = { apikey: API_KEY, "x-workspace-id": WS, "content-type": "application/json" };

test.describe("jobs v2 e2e", () => {
  test.skip(!enabled, "PLUTO_ENABLE_JOBS_V2=1 required");

  test("built-in echo workflow runs to success", async ({ request }) => {
    const list = await (await request.get(`${BASE}/jobs/v2/workflows`, { headers: H })).json();
    expect(list.workflows.map((w: { name: string }) => w.name)).toContain("echo");

    const started = await request.post(`${BASE}/jobs/v2/runs`, {
      headers: H, data: { workflow: "echo", input: "hi" },
    });
    expect(started.ok()).toBeTruthy();
    const run = (await started.json()).run;
    expect(run.status).toBe("succeeded");

    const fetched = await (await request.get(`${BASE}/jobs/v2/runs/${run.run_id}`, { headers: H })).json();
    expect(fetched.run.steps.start.status).toBe("succeeded");
    expect(fetched.run.steps.shout.status).toBe("succeeded");
  });

  test("unknown workflow returns 404", async ({ request }) => {
    const r = await request.post(`${BASE}/jobs/v2/runs`, { headers: H, data: { workflow: "nope" } });
    expect(r.status()).toBe(404);
  });
});
