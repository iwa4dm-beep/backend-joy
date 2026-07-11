// Package the rewritten frontend + generated SQL into two downloadable ZIPs.
import JSZip from "jszip";
import type { AnalyzeResult, IntegrationPlan } from "./types";
import { buildMigrationBundle } from "./migration-converter";
import { rewriteFrontend } from "./frontend-rewriter";

export async function buildBundle(
  originalZip: JSZip,
  analyze: AnalyzeResult,
  plan: IntegrationPlan,
): Promise<{ frontend: Blob; migrations: Blob; report: Blob }> {
  // Merge AI-planned tables into the SQL if provided
  const tables = plan.tables.length
    ? plan.tables.map((t) => ({
        name: t.name,
        columns: t.columns,
        timestamps: true,
      }))
    : analyze.backend.tables;

  const sql = buildMigrationBundle(tables);
  const { zip: rewritten } = await rewriteFrontend(originalZip, analyze);

  const migZip = new JSZip();
  migZip.file("001_pluto_auto.sql", sql);
  migZip.file("README.md", `# Pluto Auto-generated Migrations\n\nApply with:\n\n\`\`\`\npsql "$DATABASE_URL" -f 001_pluto_auto.sql\n\`\`\``);

  const report = buildReport(analyze, plan);

  return {
    frontend: await rewritten.generateAsync({ type: "blob", compression: "DEFLATE" }),
    migrations: await migZip.generateAsync({ type: "blob", compression: "DEFLATE" }),
    report: new Blob([report], { type: "text/markdown" }),
  };
}

function buildReport(a: AnalyzeResult, p: IntegrationPlan): string {
  return `# Integration Report

Generated: ${new Date().toISOString()}

## Summary
- Files scanned: ${a.stats.totalFiles}
- Tables planned: ${p.tables.length}
- Endpoints mapped: ${p.endpoints.length}
- Frontend rewrites planned: ${p.frontendRewrites.length}
- Risks flagged: ${p.risks.length}

## Tables
${p.tables.map((t) => `- **${t.name}** — ${t.columns.length} cols, RLS: ${t.rls}`).join("\n") || "- none"}

## Endpoints
${p.endpoints.slice(0, 40).map((e) => `- \`${e.laravel}\` → \`${e.pluto}\` (${e.kind})`).join("\n") || "- none"}

## Risks
${p.risks.map((r) => `- **[${r.severity.toUpperCase()}]** ${r.message}`).join("\n") || "- none"}

## Next steps
1. Download and unzip \`frontend-connected.zip\` — replaces your existing frontend.
2. Apply \`pluto-migrations.zip/001_pluto_auto.sql\` to your Pluto Postgres.
3. Set \`VITE_PLUTO_URL\` and \`VITE_PLUTO_ANON_KEY\` in \`.env\`.
4. \`npm i @pluto/client && npm run dev\`.
`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
