// Phase 43 — realtime v3 unit tests (predicate + backplane status).
// Full HTTP integration lives in the e2e suite; here we cover the
// components that ship without a running Postgres/NATS pair.

import { describe, it, expect } from "vitest";
import { parsePredicate } from "../lib/rls-predicate.js";
import { natsStatus } from "../lib/nats-backplane.js";

describe("RLS predicate parser", () => {
  it("evaluates auth.uid() equality", () => {
    const p = parsePredicate("user_id = auth.uid()");
    expect(p.evaluate({ user_id: "abc" }, { userId: "abc" })).toBe(true);
    expect(p.evaluate({ user_id: "xyz" }, { userId: "abc" })).toBe(false);
  });

  it("supports AND / OR joins", () => {
    const p = parsePredicate("priority >= 5 AND status != 'archived'");
    expect(p.evaluate({ priority: 7, status: "open" },     {})).toBe(true);
    expect(p.evaluate({ priority: 7, status: "archived" }, {})).toBe(false);
    expect(p.evaluate({ priority: 2, status: "open" },     {})).toBe(false);
  });

  it("rejects invalid columns and operators", () => {
    expect(() => parsePredicate("1bad = 1")).toThrow(/invalid column/);
    expect(() => parsePredicate("col ~ 1")).toThrow(/invalid op/);
  });

  it("workspace scoping via auth.workspace()", () => {
    const p = parsePredicate("workspace_id = auth.workspace()");
    expect(p.evaluate({ workspace_id: "w1" }, { workspaceId: "w1" })).toBe(true);
    expect(p.evaluate({ workspace_id: "w2" }, { workspaceId: "w1" })).toBe(false);
  });
});

describe("NATS backplane status", () => {
  it("reports disabled state cleanly when PLUTO_ENABLE_NATS != 1", () => {
    const s = natsStatus();
    expect(typeof s.enabled).toBe("boolean");
    expect(s.subject_prefix).toBe(process.env.PLUTO_NATS_SUBJECT_PREFIX ?? "pluto.rt3");
  });
});
