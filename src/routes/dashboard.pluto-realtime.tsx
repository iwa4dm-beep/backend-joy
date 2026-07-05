import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { plutoApi, pushUiHistory } from "@/lib/pluto/upstream";

export const Route = createFileRoute("/dashboard/pluto-realtime")({
  component: RealtimePage,
  head: () => ({ meta: [{ title: "Pluto Realtime & Presence" }] }),
});

function RealtimePage() {
  const [projectId, setProjectId] = useState("");
  const [channels, setChannels] = useState<any[]>([]);
  const [topic, setTopic] = useState("");
  const [presence, setPresence] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [pub, setPub] = useState({ event: "message", payload: '{"hello":"world"}', persist: true });
  const [err, setErr] = useState<string | null>(null);

  async function loadChannels() {
    if (!projectId) return;
    try { setChannels(await plutoApi(`/realtime/v1/channels?project_id=${projectId}`)); setErr(null); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { void loadChannels(); }, [projectId]);

  async function loadTopic() {
    if (!projectId || !topic) return;
    try {
      setPresence(await plutoApi(`/realtime/v1/presence?project_id=${projectId}&topic=${encodeURIComponent(topic)}`));
      setHistory(await plutoApi(`/realtime/v1/history?project_id=${projectId}&topic=${encodeURIComponent(topic)}&limit=50`));
    } catch (e: any) { setErr(e.message); }
  }

  async function createChannel() {
    try {
      await plutoApi("/realtime/v1/channels", { method: "POST", body: JSON.stringify({ project_id: projectId, topic, private: false }) });
      pushUiHistory({ action: "realtime.channel.create", detail: topic, ok: true });
      await loadChannels();
    } catch (e: any) { setErr(e.message); }
  }
  async function publish() {
    try {
      const payload = JSON.parse(pub.payload || "{}");
      await plutoApi("/realtime/v1/publish", { method: "POST", body: JSON.stringify({ project_id: projectId, topic, event: pub.event, payload, persist: pub.persist }) });
      pushUiHistory({ action: "realtime.publish", detail: `${topic}:${pub.event}`, ok: true });
      await loadTopic();
    } catch (e: any) { setErr(e.message); }
  }
  async function sweep() {
    try { const r = await plutoApi<any>("/realtime/v1/presence/sweep", { method: "POST" }); alert(`Removed ${r.removed} stale entries`); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Realtime & Presence</h1>
      {err && <div className="rounded-md bg-destructive/10 text-destructive p-3 text-sm">{err}</div>}
      <input className="border rounded px-2 py-1 bg-background w-full" placeholder="Project ID (uuid)" value={projectId} onChange={(e) => setProjectId(e.target.value)} />

      <section className="rounded-md border border-border p-4 space-y-2">
        <h2 className="font-medium">Channels</h2>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1 bg-background" placeholder="topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <button className="bg-primary text-primary-foreground rounded px-3 py-1" onClick={createChannel}>Register</button>
          <button className="border rounded px-3 py-1" onClick={loadTopic}>Inspect</button>
          <button className="border rounded px-3 py-1" onClick={sweep}>Sweep presence</button>
        </div>
        <ul className="text-sm">
          {channels.map((c) => (
            <li key={c.id}>
              <button className="underline" onClick={() => { setTopic(c.topic); }}>{c.topic}</button> — max {c.max_presence} {c.private && "(private)"}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-border p-4 space-y-2">
        <h2 className="font-medium">Publish to <code>{topic || "…"}</code></h2>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1 bg-background" placeholder="event" value={pub.event} onChange={(e) => setPub({ ...pub, event: e.target.value })} />
          <label className="text-sm flex gap-1 items-center"><input type="checkbox" checked={pub.persist} onChange={(e) => setPub({ ...pub, persist: e.target.checked })} />persist</label>
          <button className="bg-primary text-primary-foreground rounded px-3 py-1" onClick={publish} disabled={!topic}>Publish</button>
        </div>
        <textarea className="w-full border rounded p-2 font-mono text-xs bg-background" rows={4} value={pub.payload} onChange={(e) => setPub({ ...pub, payload: e.target.value })} />
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="font-medium">Presence ({presence.length})</h2>
        <ul className="text-xs font-mono">
          {presence.map((p) => (<li key={p.presence_key}>{p.presence_key} — {p.user_id ?? "anon"} — {new Date(p.last_seen_at).toLocaleTimeString()}</li>))}
        </ul>
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="font-medium">Recent broadcasts</h2>
        <ul className="text-xs font-mono space-y-1">
          {history.map((h) => (<li key={h.id}>{new Date(h.sent_at).toLocaleTimeString()} · {h.event} · {JSON.stringify(h.payload).slice(0, 120)}</li>))}
        </ul>
      </section>
    </div>
  );
}
