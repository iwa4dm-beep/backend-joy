// Phase 62 integration tests — Jobs v2 HTTP surface.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { _resetJobsForTests } from "../lib/workflow-engine.js";
import { _resetRegistryForTests, registerWorkflow } from "../lib/workflow-registry.js";

const WS = "00000000-0000-0000-0000-000000000062";
let app: FastifyInstance;

beforeAll(async () => {
  process.env.PLUTO_ENABLE_JOBS_V2 = "1";
  const { jobsV2Plugin } = await import("../modules/jobs_v2/plugin.js");
  app = Fastify();
  await app.register(jobsV2Plugin);
  await app.ready();
});

beforeEach(() => { _resetJobsForTests(); _resetRegistryForTests(); });

const H = { "content-type": "application/json", "x-workspace-id": WS };
const post = (url: string, body: unknown) => app.inject({ method: "POST", url, headers: H, payload: JSON.stringify(body) });
const get = (url: string) => app.inject({ method: "GET", url, headers: H });

describe("jobs v2 HTTP", () => {
  it("lists the built-in echo workflow after preHandler seed", async () => {
    const res = await get("/jobs/v2/workflows");
    const body = JSON.parse(res.body);
    expect(body.workflows.map((w: { name: string }) => w.name)).toContain("echo");
  });

  it("runs the echo workflow end-to-end", async () => {
    const res = await post("/jobs/v2/runs", { workflow: "echo", input: "hi" });
    expect(res.statusCode).toBe(200);
    const run = JSON.parse(res.body).run;
    expect(run.status).toBe("succeeded");
    expect(run.steps.shout.output.shout).toBe("{\"HELLO\":\"HI\"}");
  });

  it("returns 404 for an unknown workflow", async () => {
    const res = await post("/jobs/v2/runs", { workflow: "does_not_exist" });
    expect(res.statusCode).toBe(404);
  });

  it("persists runs in the in-memory ledger and returns them by id", async () => {
    const created = JSON.parse((await post("/jobs/v2/runs", { workflow: "echo", input: 1 })).body).run;
    const fetched = JSON.parse((await get(`/jobs/v2/runs/${created.run_id}`)).body).run;
    expect(fetched.run_id).toBe(created.run_id);
    expect(fetched.status).toBe("succeeded");
  });

  it("surfaces failed runs with per-step diagnostics", async () => {
    registerWorkflow(WS, {
      name: "bad",
      version: 1,
      steps: [{ id: "s", run: async () => { throw new Error("oops"); } }],
    });
    const res = await post("/jobs/v2/runs", { workflow: "bad" });
    const run = JSON.parse(res.body).run;
    expect(run.status).toBe("failed");
    expect(run.steps.s.status).toBe("failed");
    expect(run.steps.s.error).toBe("oops");
  });
});
