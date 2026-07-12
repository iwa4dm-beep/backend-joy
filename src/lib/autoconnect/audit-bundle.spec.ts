// E2E: run Test Mode (via runE2E) → build the exact audit bundle ZIP the
// "Download audit .zip" button in TestModePanel produces → unzip it and
// assert every advertised file is present with meaningful content.
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { runE2E } from "./e2e-runner";
import { parseRollbackLog } from "./rollback-log";
import { buildAuditBundle } from "./audit-report";
import type { SqlStatement } from "./types";

const stmts: SqlStatement[] = [
  { sql: "CREATE TABLE users (id int)", kind: "create_table", table: "users", destructive: false },
  { sql: "ALTER TABLE users ADD COLUMN email text", kind: "alter", table: "users", destructive: false },
];

async function bundleFor(mode: "cancel-sql") {
  const r = runE2E(stmts, { mode, cancelAt: 1 });
  const rollback = parseRollbackLog(r.jsonl);
  const blob = await buildAuditBundle({
    ack: { checkbox: true, typed: "APPLY", required: true },
    rollback,
    rawLogJsonl: r.jsonl,
    // Non-empty verification so verification-mismatches.csv is emitted.
    verification: {
      hasManifest: true,
      ok: true,
      message: "ok",
      entries: [
        { path: "sql/0001.sql", expected: "a".repeat(64), actual: "a".repeat(64), ok: true },
        { path: "scripts/apply.sh", expected: "b".repeat(64), actual: "b".repeat(64), ok: true },
      ],
    },
    cancellation: { at: new Date().toISOString(), via: "ui", exitCode: 4, phase: "sql" },
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return { r, zip };
}

describe("Test Mode → audit bundle .zip contents", () => {
  it("contains audit-report.json/html, raw JSONL, mismatch CSV, cancellation.json", async () => {
    const { r, zip } = await bundleFor("cancel-sql");

    const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
    // All files live under audit-<jobId>-<stamp>/…
    const dir = paths[0].split("/")[0];
    expect(dir).toMatch(/^audit-/);

    const required = [
      "audit-report.json",
      "audit-report.html",
      "verification-mismatches.csv",
      "cancellation.json",
      "README.txt",
    ];
    for (const name of required) {
      expect(paths, `missing ${name}`).toContain(`${dir}/${name}`);
    }
    // Raw JSONL is named after the job id — assert one *.jsonl file exists.
    const jsonl = paths.find((p) => p.endsWith(".jsonl"));
    expect(jsonl, "no raw JSONL in bundle").toBeTruthy();

    // audit-report.json is well-formed and carries the cancel outcome.
    const report = JSON.parse(await zip.file(`${dir}/audit-report.json`)!.async("string"));
    expect(report.summary.exitCode).toBe(4);
    expect(report.summary.rollbackStatus).toBe("cancelled");
    expect(report.input.cancellation.phase).toBe("sql");

    // HTML is a real document.
    const html = await zip.file(`${dir}/audit-report.html`)!.async("string");
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/Auto-Connect Studio/);

    // Raw JSONL matches what runE2E produced (proves nothing was lost).
    const raw = await zip.file(jsonl!)!.async("string");
    expect(raw).toBe(r.jsonl);
    expect(raw).toMatch(/"step":"cancel"/);

    // CSV has header + one row per verification entry.
    const csv = await zip.file(`${dir}/verification-mismatches.csv`)!.async("string");
    expect(csv.split("\n")[0]).toBe("path,ok,expected,actual,note");
    expect(csv).toMatch(/sql\/0001\.sql/);

    // cancellation.json records phase + exit code.
    const cancel = JSON.parse(await zip.file(`${dir}/cancellation.json`)!.async("string"));
    expect(cancel.phase).toBe("sql");
    expect(cancel.exitCode).toBe(4);
  });
});
