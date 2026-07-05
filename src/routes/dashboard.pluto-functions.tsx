import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/pluto/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Plus, RefreshCw, Rocket, Save, Server, Trash2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/pluto-functions")({
  component: PlutoFunctionsPage,
});

const LS_URL = "pluto.upstream.url";
const LS_TOKEN = "pluto.upstream.token";

type Project = { id: string; name: string; slug: string };
type FnRow = {
  id: string; slug: string; project_id?: string;
  memory_mb: number; timeout_ms: number; verify_jwt: boolean;
  code?: string; env?: Record<string, string>;
  created_at: string; updated_at?: string;
};

async function api<T>(url: string, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new Error((data && (data as any).error) || (data as any)?.message || res.statusText);
  return data as T;
}

const STARTER = `// Pluto Edge Function
// export default async ({ req, claims, env }) => Response
export default async ({ req, claims }) => {
  return new Response(JSON.stringify({ ok: true, user: claims?.sub ?? null, method: req.method }), {
    headers: { "content-type": "application/json" }
  });
};
`;

function PlutoFunctionsPage() {
  const [url] = useState(() => (typeof window !== "undefined" && localStorage.getItem(LS_URL)) || "");
  const [token] = useState(() => (typeof window !== "undefined" && localStorage.getItem(LS_TOKEN)) || "");
  const configured = useMemo(() => url.length > 0 && token.length > 0, [url, token]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [fns, setFns] = useState<FnRow[]>([]);
  const [selected, setSelected] = useState<FnRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editor state
  const [slug, setSlug] = useState("");
  const [code, setCode] = useState(STARTER);
  const [memory, setMemory] = useState(128);
  const [timeout, setTimeoutMs] = useState(10_000);
  const [verifyJwt, setVerifyJwt] = useState(true);
  const [envText, setEnvText] = useState("");

  // Invoke state
  const [invMethod, setInvMethod] = useState<"GET" | "POST" | "PUT" | "DELETE" | "PATCH">("POST");
  const [invBody, setInvBody] = useState(`{ "hello": "world" }`);
  const [invHeaders, setInvHeaders] = useState(`{ "content-type": "application/json" }`);
  const [invAsUser, setInvAsUser] = useState(true);
  const [invResult, setInvResult] = useState<{ status: number; body: string; headers: Record<string, string>; ms?: string } | null>(null);

  async function loadProjects() {
    setErr(null);
    try {
      const list = await api<Project[]>(url, token, "/admin/v1/projects");
      setProjects(list);
      if (list.length && !projectId) setProjectId(list[0].id);
    } catch (e: any) { setErr(e.message); }
  }
  async function loadFns(pid: string) {
    setErr(null);
    try { setFns(await api<FnRow[]>(url, token, `/functions/v1?project_id=${pid}`)); }
    catch (e: any) { setErr(e.message); }
  }
  async function openFn(id: string) {
    setErr(null);
    try {
      const row = await api<FnRow>(url, token, `/functions/v1/${id}`);
      setSelected(row);
      setSlug(row.slug);
      setCode(row.code ?? STARTER);
      setMemory(row.memory_mb);
      setTimeoutMs(row.timeout_ms);
      setVerifyJwt(row.verify_jwt);
      setEnvText(JSON.stringify(row.env ?? {}, null, 2));
      setInvResult(null);
    } catch (e: any) { setErr(e.message); }
  }
  function newDraft() {
    setSelected(null); setSlug(""); setCode(STARTER);
    setMemory(128); setTimeoutMs(10_000); setVerifyJwt(true); setEnvText("{}");
    setInvResult(null);
  }
  function parseEnv(): Record<string, string> {
    if (!envText.trim()) return {};
    const parsed = JSON.parse(envText);
    if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("env must be a JSON object");
    return parsed as Record<string, string>;
  }
  async function deploy() {
    if (!projectId || !slug) { setErr("project + slug required"); return; }
    setBusy(true); setErr(null);
    try {
      let env: Record<string, string>;
      try { env = parseEnv(); } catch (e: any) { throw new Error("env JSON invalid: " + e.message); }
      if (selected) {
        const row = await api<FnRow>(url, token, `/functions/v1/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ code, memory_mb: memory, timeout_ms: timeout, verify_jwt: verifyJwt, env }),
        });
        setSelected({ ...selected, ...row, code, env, memory_mb: memory, timeout_ms: timeout, verify_jwt: verifyJwt });
      } else {
        const row = await api<FnRow>(url, token, "/functions/v1", {
          method: "POST",
          body: JSON.stringify({ project_id: projectId, slug, code, memory_mb: memory, timeout_ms: timeout, verify_jwt: verifyJwt, env }),
        });
        setSelected({ ...row, code, env });
      }
      await loadFns(projectId);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!selected) return;
    if (!confirm(`Delete function ${selected.slug}?`)) return;
    try {
      await api(url, token, `/functions/v1/${selected.id}`, { method: "DELETE" });
      newDraft(); await loadFns(projectId);
    } catch (e: any) { setErr(e.message); }
  }
  async function invoke() {
    if (!selected && !slug) { setErr("Deploy or select a function first"); return; }
    const project = projects.find(p => p.id === projectId);
    if (!project) { setErr("Pick a project"); return; }
    const targetSlug = selected?.slug || slug;
    setBusy(true); setErr(null); setInvResult(null);
    try {
      let headers: Record<string, string> = {};
      if (invHeaders.trim()) headers = JSON.parse(invHeaders);
      if (invAsUser && token) headers["authorization"] = `Bearer ${token}`;
      const path = `/functions/v1/p/${project.slug}/${targetSlug}`;
      const res = await fetch(`${url.replace(/\/+$/, "")}${path}`, {
        method: invMethod,
        headers,
        body: invMethod === "GET" ? undefined : invBody,
      });
      const bodyText = await res.text();
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { respHeaders[k] = v; });
      setInvResult({ status: res.status, body: bodyText, headers: respHeaders, ms: respHeaders["x-pluto-fn-duration-ms"] });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (configured) loadProjects(); /* eslint-disable-next-line */ }, [configured]);
  useEffect(() => { if (projectId) loadFns(projectId); /* eslint-disable-next-line */ }, [projectId]);

  return (
    <div className="space-y-6">
      <PageHeader title="Pluto Functions" description="Deploy, edit, and invoke Edge Functions per project" />

      {!configured && (
        <Alert>
          <AlertDescription>
            Set upstream URL + JWT on the <b>Pluto Admin</b> page first.
          </AlertDescription>
        </Alert>
      )}

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      {configured && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Sidebar list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4"/> Project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project"/></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · /{p.slug}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" onClick={newDraft} className="flex-1"><Plus className="h-4 w-4 mr-1"/>New</Button>
                <Button size="sm" variant="ghost" onClick={() => projectId && loadFns(projectId)}><RefreshCw className="h-4 w-4"/></Button>
              </div>
              <ul className="space-y-1">
                {fns.map(f => (
                  <li key={f.id}>
                    <button
                      onClick={() => openFn(f.id)}
                      className={
                        "w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-accent " +
                        (selected?.id === f.id ? "bg-accent font-medium" : "")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono truncate">{f.slug}</span>
                        {f.verify_jwt
                          ? <Badge variant="outline" className="text-[10px]">JWT</Badge>
                          : <Badge variant="secondary" className="text-[10px]">public</Badge>}
                      </div>
                    </button>
                  </li>
                ))}
                {fns.length === 0 && <li className="text-xs text-muted-foreground px-2">No functions.</li>}
              </ul>
            </CardContent>
          </Card>

          {/* Editor + Invoker */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Rocket className="h-4 w-4"/>
                {selected ? <>Editing <span className="font-mono">{selected.slug}</span></> : "New function"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="edit">
                <TabsList>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="invoke" disabled={!selected}>Invoke</TabsTrigger>
                  <TabsTrigger value="config">Config</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-3 pt-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label>Slug</Label>
                      <Input placeholder="my-fn" value={slug} onChange={e => setSlug(e.target.value)} disabled={!!selected}/>
                    </div>
                    <Button onClick={deploy} disabled={busy}><Save className="h-4 w-4 mr-1"/>{selected ? "Save" : "Deploy"}</Button>
                    {selected && (
                      <Button variant="ghost" onClick={del}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    )}
                  </div>
                  <Textarea
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    spellCheck={false}
                    className="font-mono text-xs min-h-[360px]"
                  />
                  <div className="text-xs text-muted-foreground">
                    Handler: <code>export default async ({"{ req, claims, env }"}) =&gt; Response</code>
                  </div>
                </TabsContent>

                <TabsContent value="invoke" className="space-y-3 pt-3">
                  {selected && projects.find(p => p.id === projectId) && (
                    <div className="text-xs text-muted-foreground font-mono break-all">
                      {invMethod} {url.replace(/\/+$/, "")}/functions/v1/p/{projects.find(p => p.id === projectId)!.slug}/{selected.slug}
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <div className="w-32">
                      <Label>Method</Label>
                      <Select value={invMethod} onValueChange={(v) => setInvMethod(v as any)}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>{["GET","POST","PUT","PATCH","DELETE"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                      <Switch id="asuser" checked={invAsUser} onCheckedChange={setInvAsUser}/>
                      <Label htmlFor="asuser" className="text-xs">Send admin JWT</Label>
                    </div>
                    <Button className="ml-auto" onClick={invoke} disabled={busy}><Play className="h-4 w-4 mr-1"/>Invoke</Button>
                  </div>
                  <div>
                    <Label>Headers (JSON)</Label>
                    <Textarea value={invHeaders} onChange={e => setInvHeaders(e.target.value)} className="font-mono text-xs min-h-[70px]"/>
                  </div>
                  {invMethod !== "GET" && (
                    <div>
                      <Label>Body</Label>
                      <Textarea value={invBody} onChange={e => setInvBody(e.target.value)} className="font-mono text-xs min-h-[100px]"/>
                    </div>
                  )}
                  {invResult && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={invResult.status < 400 ? "default" : "destructive"}>{invResult.status}</Badge>
                        {invResult.ms && <span className="text-xs text-muted-foreground">{invResult.ms} ms</span>}
                      </div>
                      <pre className="rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all max-h-[300px] overflow-auto">
{invResult.body}
                      </pre>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="config" className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Memory (MB)</Label>
                      <Input type="number" min={32} max={1024} value={memory} onChange={e => setMemory(parseInt(e.target.value || "0", 10))}/>
                    </div>
                    <div>
                      <Label>Timeout (ms)</Label>
                      <Input type="number" min={100} max={60000} value={timeout} onChange={e => setTimeoutMs(parseInt(e.target.value || "0", 10))}/>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Verify JWT</div>
                      <div className="text-xs text-muted-foreground">Require a valid bearer token to invoke this function.</div>
                    </div>
                    <Switch checked={verifyJwt} onCheckedChange={setVerifyJwt}/>
                  </div>
                  <div>
                    <Label>Env (JSON)</Label>
                    <Textarea value={envText} onChange={e => setEnvText(e.target.value)} className="font-mono text-xs min-h-[120px]" placeholder='{"KEY":"value"}'/>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={deploy} disabled={busy}><Save className="h-4 w-4 mr-1"/>Save config</Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
