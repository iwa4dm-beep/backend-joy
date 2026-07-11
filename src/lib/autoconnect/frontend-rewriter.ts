// Rewrite common frontend API call patterns to Pluto endpoints and inject
// the Pluto client. Runs entirely on original file text (client-side).
import JSZip from "jszip";
import type { AnalyzeResult } from "./types";

export type RewriteReport = {
  file: string;
  changes: number;
  notes: string[];
};

const PLUTO_CLIENT_STUB = `// AUTO-INJECTED by Pluto Auto-Connect Studio.
// Do not commit provider keys — read from Vite env only.
import { createPlutoClient } from "@pluto/client";

export const pluto = createPlutoClient({
  url: import.meta.env.VITE_PLUTO_URL!,
  apiKey: import.meta.env.VITE_PLUTO_ANON_KEY!,
  getToken: () => localStorage.getItem("pluto_access_token"),
});

// axios shim → forwards to Pluto REST base
export const plutoBaseUrl = import.meta.env.VITE_PLUTO_URL + "/rest/v3";
`;

const ENV_STUB = `# AUTO-INJECTED by Pluto Auto-Connect Studio
VITE_PLUTO_URL=https://api.your-pluto.example
VITE_PLUTO_ANON_KEY=replace-with-anon-key
`;

export async function rewriteFrontend(
  zip: JSZip,
  analyze: AnalyzeResult,
): Promise<{ zip: JSZip; reports: RewriteReport[] }> {
  const reports: RewriteReport[] = [];
  const out = new JSZip();

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) { out.folder(path); continue; }
    if (shouldDrop(path)) continue;

    const isText = /\.(ts|tsx|js|jsx|json|env|md|html|css)$/.test(path);
    if (!isText) {
      out.file(path, await entry.async("uint8array"));
      continue;
    }

    let text = await entry.async("string");
    const report: RewriteReport = { file: path, changes: 0, notes: [] };

    // 1) Replace axios baseURL
    text = text.replace(
      /baseURL\s*:\s*(['"`])[^'"`]+\1/g,
      (m) => { report.changes++; report.notes.push("axios baseURL → Pluto"); return `baseURL: import.meta.env.VITE_PLUTO_URL + "/rest/v3"`; },
    );

    // 2) Replace fetch('/api/...') → fetch(`${plutoBaseUrl}/...`)
    text = text.replace(
      /fetch\(\s*(['"`])\/api\/([^'"`]+)\1/g,
      (_m, _q, path2) => { report.changes++; report.notes.push(`fetch /api/${path2} → Pluto`); return `fetch(\`\${import.meta.env.VITE_PLUTO_URL}/rest/v3/${path2}\``; },
    );

    // 3) Sanctum token header → Pluto bearer
    text = text.replace(
      /Authorization:\s*(['"`])Bearer\s+\$?\{?[^'"`}]+\}?\1/g,
      () => { report.changes++; report.notes.push("Auth header → Pluto bearer"); return `Authorization: \`Bearer \${localStorage.getItem("pluto_access_token") ?? ""}\``; },
    );

    if (report.changes > 0) reports.push(report);
    out.file(path, text);
  }

  // Inject Pluto client + env template
  out.file("src/lib/pluto-client.ts", PLUTO_CLIENT_STUB);
  out.file(".env.pluto.example", ENV_STUB);
  out.file("PLUTO_CONNECT_README.md", buildReadme(analyze, reports));

  return { zip: out, reports };
}

function shouldDrop(path: string): boolean {
  return [
    "node_modules/", "vendor/", ".git/", "dist/", "build/",
    ".next/", ".cache/", "storage/framework/cache/",
  ].some((d) => path.includes(d));
}

function buildReadme(analyze: AnalyzeResult, reports: RewriteReport[]): string {
  return `# Pluto Auto-Connect — Integration Report

Generated: ${new Date().toISOString()}

## Frontend
- Framework: ${analyze.frontend.framework ?? "unknown"}
- Vite: ${analyze.frontend.hasVite ? "yes" : "no"}
- API call sites detected: ${analyze.frontend.apiCallSites.length}
- Rewrites applied to ${reports.length} files (${reports.reduce((s, r) => s + r.changes, 0)} edits)

## Backend
- Laravel: ${analyze.backend.laravelVersion ?? "unknown"}
- Tables extracted: ${analyze.backend.tables.length}
- Routes extracted: ${analyze.backend.routes.length}
- Models: ${analyze.backend.models.length}
- Controllers: ${analyze.backend.controllers.length}

## Next steps
1. Copy \`.env.pluto.example\` → \`.env\` and set \`VITE_PLUTO_URL\` + \`VITE_PLUTO_ANON_KEY\`.
2. Apply the generated \`migrations.sql\` to your Pluto Postgres instance.
3. Install the Pluto client: \`npm i @pluto/client\`.
4. Import from \`src/lib/pluto-client.ts\` where you previously imported axios.

## Files rewritten
${reports.map((r) => `- \`${r.file}\` (${r.changes})`).join("\n") || "- (none)"}
`;
}
