// Server function: send analyzer summary to Lovable AI Gateway and receive
// an Integration Plan. Structured output via strict JSON prompt +
// defensive parse (no schema bounds — see ai-sdk-lovable-gateway rules).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AnalyzeResult, IntegrationPlan } from "./types";

const InputSchema = z.object({
  analyze: z.custom<AnalyzeResult>(),
});

export const planIntegration = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }): Promise<{ plan: IntegrationPlan; model: string; raw?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      // Fall back to a deterministic local plan so the UI still works.
      return { plan: heuristicPlan(data.analyze), model: "heuristic" };
    }

    const model = "google/gemini-2.5-flash";
    const summary = summarize(data.analyze);
    const prompt = `You are Pluto BaaS integration planner. Given this Laravel + React/Vite project summary, output an Integration Plan JSON with this exact shape:
{
  "tables":[{"name":"...","columns":[{"name":"...","type":"pg type","nullable":false}],"rls":"owner|public|admin_only","reason":"..."}],
  "endpoints":[{"laravel":"GET /api/x","pluto":"GET /rest/v3/x","kind":"rest|rpc","rpcName":"?","notes":"?"}],
  "frontendRewrites":[{"file":"...","from":"...","to":"...","reason":"..."}],
  "envMap":{"OLD":"NEW"},
  "storageBuckets":[{"name":"...","public":false}],
  "auth":{"source":"sanctum|passport|session","target":"pluto_jwt","notes":"..."},
  "risks":[{"severity":"low|med|high","message":"..."}]
}

Rules:
- Only output valid JSON, no markdown, no commentary.
- Prefer /rest/v3/<table> for resource controllers.
- Custom controller methods become RPCs.
- Every table needs an owner column (user_id or owner_id) for RLS.
- Keep table & column names snake_case.

PROJECT SUMMARY:
${JSON.stringify(summary, null, 2)}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[ai-planner] gateway error", res.status, errText);
        return { plan: heuristicPlan(data.analyze), model: "heuristic-fallback", raw: errText };
      }
      const j = await res.json() as { choices?: { message?: { content?: string } }[] };
      const content = j.choices?.[0]?.message?.content ?? "";
      const plan = safeParsePlan(content) ?? heuristicPlan(data.analyze);
      return { plan, model, raw: content.slice(0, 500) };
    } catch (e) {
      console.error("[ai-planner] exception", e);
      return { plan: heuristicPlan(data.analyze), model: "heuristic-fallback" };
    }
  });

function summarize(a: AnalyzeResult) {
  return {
    frontend: {
      framework: a.frontend.framework,
      hasVite: a.frontend.hasVite,
      apiCallSites: a.frontend.apiCallSites.slice(0, 30),
      envKeys: a.frontend.envKeys.slice(0, 40),
      baseUrls: a.frontend.baseUrls.slice(0, 5),
    },
    backend: {
      laravelVersion: a.backend.laravelVersion,
      authGuard: a.backend.authGuard,
      storageDisks: a.backend.storageDisks,
      tables: a.backend.tables.map((t) => ({
        name: t.name,
        columns: t.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
      })).slice(0, 40),
      routes: a.backend.routes.slice(0, 80),
      models: a.backend.models.slice(0, 40),
      controllers: a.backend.controllers.map((c) => ({ name: c.name, methods: c.methods })).slice(0, 40),
      envKeys: a.backend.envKeys.slice(0, 40),
    },
    stats: a.stats,
  };
}

function safeParsePlan(text: string): IntegrationPlan | null {
  try {
    // Some models still add ```json fences.
    const trimmed = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    const p = JSON.parse(trimmed) as IntegrationPlan;
    if (!p.tables || !p.endpoints) return null;
    return p;
  } catch {
    return null;
  }
}

function heuristicPlan(a: AnalyzeResult): IntegrationPlan {
  return {
    tables: a.backend.tables.map((t) => ({
      name: t.name,
      columns: t.columns,
      rls: "owner",
      reason: "Owner-scoped RLS applied by default.",
    })),
    endpoints: a.backend.routes.map((r) => ({
      laravel: `${r.method} ${r.uri}`,
      pluto: `${r.method} /rest/v3${r.uri.replace(/^\/api/, "")}`,
      kind: "rest" as const,
      notes: r.controller,
    })),
    frontendRewrites: a.frontend.apiCallSites.slice(0, 50).map((h) => ({
      file: h.file,
      from: h.snippet,
      to: "Pluto REST v3",
      reason: "Redirect to Pluto base URL.",
    })),
    envMap: {
      DB_HOST: "VITE_PLUTO_URL",
      APP_KEY: "VITE_PLUTO_ANON_KEY",
    },
    storageBuckets: a.backend.storageDisks.map((d) => ({
      name: d === "public" ? "public" : "private",
      public: d === "public",
    })),
    auth: {
      source: a.backend.authGuard ?? "session",
      target: "pluto_jwt",
      notes: "Sanctum tokens → Pluto refresh token flow.",
    },
    risks: [
      ...(a.backend.rawMigrationFiles === 0
        ? [{ severity: "med" as const, message: "No Laravel migrations detected — schema may be incomplete." }]
        : []),
      ...(a.frontend.apiCallSites.length === 0
        ? [{ severity: "low" as const, message: "No axios/fetch call sites found — rewrites limited." }]
        : []),
    ],
  };
}
