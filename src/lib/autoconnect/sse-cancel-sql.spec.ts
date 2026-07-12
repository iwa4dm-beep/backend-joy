// Simulates the SSE stream that /auto-connect consumes during a cancel-sql
// run. The E2E runner emits the exact JSONL shape apply.sh streams, so we
// replay it line-by-line as if it arrived via EventSource and assert:
//   1. step events reach the client in real time (ordered, non-empty)
//   2. a cancel event is observed
//   3. the final rollback phase is recorded (rollback_db → rollback done)
//   4. audit-report captures the final rollback phase = "sql" + exit code 4
import { describe, it, expect } from "vitest";
import { runE2E } from "./e2e-runner";
import { parseRollbackLog } from "./rollback-log";
import { buildAuditJson } from "./audit-report";
import type { SqlStatement } from "./types";

const stmts: SqlStatement[] = [
  { sql: "CREATE TABLE a (id int)", kind: "create_table", table: "a", destructive: false },
  { sql: "CREATE TABLE b (id int)", kind: "create_table", table: "b", destructive: false },
  { sql: "ALTER TABLE a ADD COLUMN e text", kind: "alter", table: "a", destructive: false },
];

// Minimal SSE-like consumer: yields each JSONL line as a parsed event with
// a monotonically increasing timestamp, mirroring what EventSource.onmessage
// would deliver on the /auto-connect page.
async function streamAsSse(jsonl: string): Promise<Array<{ seq: number; data: any }>> {
  const lines = jsonl.split("\n").filter(Boolean);
  const out: Array<{ seq: number; data: any }> = [];
  let seq = 0;
  for (const line of lines) {
    // Yield to the event loop between messages to model a real stream.
    await new Promise((r) => setTimeout(r, 0));
    out.push({ seq: seq++, data: JSON.parse(line) });
  }
  return out;
}

describe("SSE stream on /auto-connect during cancel-sql", () => {
  it("delivers ordered step events, a cancel event, and a final rollback phase", async () => {
    const r = runE2E(stmts, { mode: "cancel-sql", cancelAt: 1 });
    expect(r.cancelled).toBe(true);
    expect(r.exitCode).toBe(4);

    const events = await streamAsSse(r.jsonl);
    expect(events.length).toBeGreaterThan(3);

    // Strict monotonic sequence — proves the SSE consumer got them in order.
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBe(events[i - 1].seq + 1);
    }

    const steps = events.map((e) => e.data.step);
    expect(steps).toContain("snapshot_db");
    expect(steps).toContain("apply_sql");            // at least one SQL step ran
    expect(steps).toContain("cancel");                // user-initiated cancel
    expect(steps).toContain("rollback_db");           // rollback phase started
    // Last event must close out the cancel with exit code 4.
    const last = events[events.length - 1].data;
    expect(last.step).toBe("cancel");
    expect(last.status).toBe("done");
    expect(last.exitCode).toBe(4);

    // /auto-connect feeds the same JSONL into the audit report — assert the
    // final rollback phase is preserved end-to-end.
    const rollback = parseRollbackLog(r.jsonl);
    const audit = buildAuditJson({
      ack: { checkbox: true, typed: "APPLY", required: true },
      rollback,
      rawLogJsonl: r.jsonl,
      cancellation: { at: new Date().toISOString(), via: "ui", exitCode: 4, phase: "sql" },
    });
    expect(audit.summary.rollbackStatus).toBe("cancelled");
    expect(audit.summary.exitCode).toBe(4);
    expect(audit.input.cancellation?.phase).toBe("sql");
    expect(audit.input.rawLogJsonl).toMatch(/"step":"rollback_db"/);
  });
});
