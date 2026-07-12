// E2E: forge a bundle whose manifest SHA-256 disagrees with the file bytes,
// run verifyZip → feed the result into buildAuditJson, and assert the audit
// report carries a clear failure reason plus per-file mismatch details.
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { verifyZip, buildManifest } from "./zip-verify";
import { buildAuditJson, buildAuditHtml } from "./audit-report";

async function makeTamperedBundle() {
  const zip = new JSZip();
  const good = "SELECT 1;\n";
  const other = "SELECT 2;\n";
  zip.file("sql/0001.sql", good);
  zip.file("scripts/apply.sh", "#!/bin/sh\necho hi\n");
  // Build a manifest against the ORIGINAL bytes, then overwrite one file
  // so its actual hash no longer matches — a real tampered/corrupt upload.
  const { manifest, sums } = await buildManifest([
    { path: "sql/0001.sql", content: good },
    { path: "scripts/apply.sh", content: "#!/bin/sh\necho hi\n" },
    { path: "docs/README.md", content: "hello" }, // will be MISSING from zip
  ]);
  zip.file("manifest.json", manifest);
  zip.file("SHA256SUMS", sums);
  zip.file("sql/0001.sql", other); // tamper — hash-mismatch
  // docs/README.md deliberately omitted → "missing"
  return zip;
}

describe("bundle checksum mismatch → audit-report failure reason", () => {
  it("verifyZip flags mismatch + missing, and audit-report reflects it", async () => {
    const zip = await makeTamperedBundle();
    const verification = await verifyZip(zip);

    expect(verification.hasManifest).toBe(true);
    expect(verification.ok).toBe(false);
    // Clear, human-readable failure reason on the top-level message.
    expect(verification.message).toMatch(/mismatch|missing/i);
    expect(verification.message).toMatch(/2\/3/); // "2/3 mismatch / missing"

    const tampered = verification.entries.find((e) => e.path === "sql/0001.sql")!;
    expect(tampered.ok).toBe(false);
    expect(tampered.actual).not.toBe(tampered.expected);
    expect(tampered.actual.length).toBe(64);   // hash present → hash-mismatch

    const missing = verification.entries.find((e) => e.path === "docs/README.md")!;
    expect(missing.ok).toBe(false);
    expect(missing.actual).toBe("");           // no bytes → missing

    // Feed into the audit report the way /auto-connect does.
    const audit = buildAuditJson({
      ack: { checkbox: true, typed: "APPLY", required: true },
      verification,
    });
    expect(audit.summary.verified).toBe(false);
    expect(audit.input.verification?.ok).toBe(false);
    expect(audit.input.verification?.message).toMatch(/mismatch|missing/i);

    const badRows = (audit.input.verification?.entries ?? []).filter((e) => !e.ok);
    expect(badRows.length).toBe(2);
    expect(badRows.map((e) => e.path).sort()).toEqual(["docs/README.md", "sql/0001.sql"]);

    // Serializable + HTML renders the failure summary.
    const html = buildAuditHtml(audit);
    expect(html).toMatch(/failed/);
    expect(html).toMatch(/sql\/0001\.sql/);
    expect(html).toMatch(/docs\/README\.md/);
  });
});
