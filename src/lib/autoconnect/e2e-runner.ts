// Lightweight in-browser simulator for dry-run → apply → rollback flow.
// Models schema state from parsed SQL without spinning up a real DB, so users
// can iterate the entire safety flow (including induced failures) fast.
import type { SqlStatement } from "./types";

export type StepResult = {
  index: number;
  sql: string;
  status: "ok" | "skipped" | "failed";
  message?: string;
};

export type E2EReport = {
  mode: "dry-run" | "apply" | "induced-fail";
  steps: StepResult[];
  finalTables: string[];
  rolledBack: boolean;
  passed: boolean;
  durationMs: number;
};

type Sim = { tables: Set<string> };

function applyToSim(sim: Sim, s: SqlStatement): StepResult {
  if (s.kind === "create_table" && s.table) {
    if (sim.tables.has(s.table)) return { index: -1, sql: s.sql, status: "failed", message: `relation "${s.table}" already exists` };
    sim.tables.add(s.table);
  } else if (s.kind === "drop" && s.table) {
    if (!sim.tables.has(s.table)) return { index: -1, sql: s.sql, status: "failed", message: `relation "${s.table}" does not exist` };
    sim.tables.delete(s.table);
  } else if ((s.kind === "alter" || s.kind === "rls" || s.kind === "grant" || s.kind === "policy") && s.table) {
    if (!sim.tables.has(s.table)) return { index: -1, sql: s.sql, status: "failed", message: `relation "${s.table}" does not exist` };
  }
  return { index: -1, sql: s.sql, status: "ok" };
}

export function runE2E(
  stmts: SqlStatement[],
  opts: { mode: "dry-run" | "apply" | "induced-fail"; failAt?: number } = { mode: "dry-run" },
): E2EReport {
  const t0 = performance.now();
  const sim: Sim = { tables: new Set() };
  const snap = new Set(sim.tables); // rollback point
  const steps: StepResult[] = [];
  let rolledBack = false;

  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (opts.mode === "induced-fail" && opts.failAt === i) {
      steps.push({ index: i, sql: s.sql, status: "failed", message: "induced failure" });
      // rollback
      sim.tables = new Set(snap);
      rolledBack = true;
      break;
    }
    const r = applyToSim(sim, s);
    r.index = i;
    steps.push(r);
    if (r.status === "failed") {
      sim.tables = new Set(snap);
      rolledBack = true;
      break;
    }
  }

  const passed = opts.mode === "induced-fail"
    ? rolledBack && steps.some((s) => s.status === "failed")
    : steps.every((s) => s.status !== "failed");

  return {
    mode: opts.mode,
    steps,
    finalTables: Array.from(sim.tables),
    rolledBack,
    passed,
    durationMs: Math.round(performance.now() - t0),
  };
}
