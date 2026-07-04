// Browser-hosted API reference.
//
// Renders the auto-generated OpenAPI 3.1 document (served at
// /admin/v1/schema/openapi.json) inside RapiDoc — a lightweight
// single-file custom element that ships as one <script> tag. Users can
// browse every REST endpoint, try requests inline, and copy curl
// snippets without leaving the dashboard.
//
// The GraphQL surface is documented separately (see the info banner
// below) — RapiDoc only knows about REST/OpenAPI.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { ExternalLink, FileJson, Radio } from "lucide-react";

export const Route = createFileRoute("/docs/api")({
  head: () => ({
    meta: [
      { title: "Pluto API Reference" },
      { name: "description", content: "Interactive reference for the Pluto REST, GraphQL, and observability APIs." },
      { property: "og:title", content: "Pluto API Reference" },
      { property: "og:description", content: "Interactive reference for the Pluto REST, GraphQL, and observability APIs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApiDocsPage,
});

// Loads the RapiDoc web component from a CDN exactly once per page load.
function useRapiDoc() {
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (customElements.get("rapi-doc")) return;
    const s = document.createElement("script");
    s.src = "https://unpkg.com/rapidoc@9.3.4/dist/rapidoc-min.js";
    s.type = "module";
    s.async = true;
    document.head.appendChild(s);
  }, []);
}

function ApiDocsPage() {
  useRapiDoc();

  const specUrl = useMemo(() => {
    const base = import.meta.env.VITE_PLUTO_URL ?? "";
    // Prefer the admin OpenAPI (workspace-aware) — falls back to /rest/v1/
    return `${String(base).replace(/\/$/, "")}/admin/v1/schema/openapi.json`;
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileJson className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">API Reference</h1>
            <p className="text-[11px] text-muted-foreground">
              Auto-generated from your schema. Try requests inline; scopes come from the tokens dashboard.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link to="/dashboard/api" className="text-primary hover:underline">← Schema browser</Link>
          <a href={specUrl} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            openapi.json <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      <div className="border-b border-border bg-muted/30 px-6 py-2 text-[11px] text-muted-foreground flex flex-wrap gap-4">
        <span><strong className="text-foreground">GraphQL:</strong> <code>POST /graphql/v1</code> — same auth, RLS applied</span>
        <span><strong className="text-foreground">Prometheus:</strong> <code>GET /metrics</code> — text exposition, no auth</span>
        <span><strong className="text-foreground">Realtime:</strong> <code>WS /rt/v1</code> — see the Realtime dashboard</span>
      </div>

      <main className="flex-1 min-h-0">
        {/* @ts-expect-error — RapiDoc is a custom element loaded at runtime */}
        <rapi-doc
          spec-url={specUrl}
          render-style="focused"
          layout="row"
          theme="dark"
          bg-color="hsl(222 47% 11%)"
          text-color="hsl(210 40% 96%)"
          primary-color="hsl(217 91% 60%)"
          allow-authentication="true"
          allow-server-selection="true"
          allow-spec-url-load="false"
          allow-spec-file-load="false"
          persist-auth="true"
          show-header="false"
          style={{ height: "calc(100vh - 88px)", width: "100%" }}
        >
          <div slot="overview" className="p-4 text-sm">
            <Radio className="inline h-4 w-4 mr-1" />
            Pass <code>apikey: &lt;anon or service key&gt;</code> or
            <code className="ml-1">authorization: Bearer plt_…</code> on every request.
            Token scopes are managed in{" "}
            <Link to="/dashboard/tokens" className="text-primary hover:underline">Dashboard → Tokens</Link>.
          </div>
        </rapi-doc>
      </main>
    </div>
  );
}
