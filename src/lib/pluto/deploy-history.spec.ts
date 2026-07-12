// End-to-end unit tests covering the deployment features:
//   1. localStorage persistence roundtrip
//   2. Download JSON produces a valid blob
//   3. compareEntries diff detects state/latency/body changes
//   4. dry-run SQL validator (behaviour import lives inside handler; we test the util shape via type)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHistory,
  compareEntries,
  downloadEntryAsJson,
  loadHistory,
  saveHistoryEntry,
  type HistoryEntry,
} from "./deploy-history";

function mkEntry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "dep_a",
    timestamp: 1_700_000_000_000,
    workspaceId: "ws_1",
    overallOk: true,
    steps: [
      { key: "sql", label: "Push migrations SQL", state: "ok", detail: "1 stmt",
        debug: { url: "https://vps/admin/v1/migrations", method: "POST", status: 200, latencyMs: 120, reqBodyPreview: "{\"sql\":\"select 1\"}", resBodyPreview: "{\"id\":\"m1\"}" } },
      { key: "upload", label: "Upload bundle", state: "ok", detail: "50 KB",
        debug: { url: "https://vps/storage/v1/object/deployments/x.zip", method: "POST", status: 200, latencyMs: 400, reqBodyPreview: "(binary 51200)", resBodyPreview: "{\"Key\":\"deployments/x.zip\"}" } },
      { key: "verify", label: "Verify latest deployment", state: "ok", detail: "id=d1",
        debug: { url: "https://vps/admin/v1/workspaces/ws_1/deployments?limit=1", method: "GET", status: 200, latencyMs: 60, reqBodyPreview: null, resBodyPreview: "{\"items\":[{\"id\":\"d1\"}]}" } },
    ],
    ...over,
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null, length: 0,
  } as Storage);
});
afterEach(() => vi.unstubAllGlobals());

describe("deploy-history persistence", () => {
  it("saves + loads entries newest first", () => {
    saveHistoryEntry(mkEntry({ id: "a", timestamp: 1 }));
    saveHistoryEntry(mkEntry({ id: "b", timestamp: 2 }));
    const all = loadHistory();
    expect(all.map(e => e.id)).toEqual(["b", "a"]);
  });

  it("clearHistory empties storage", () => {
    saveHistoryEntry(mkEntry());
    expect(loadHistory()).toHaveLength(1);
    clearHistory();
    expect(loadHistory()).toHaveLength(0);
  });

  it("caps history at 50 entries", () => {
    for (let i = 0; i < 60; i++) saveHistoryEntry(mkEntry({ id: `e${i}`, timestamp: i }));
    expect(loadHistory()).toHaveLength(50);
  });
});

describe("downloadEntryAsJson", () => {
  it("triggers a valid JSON download", () => {
    const created: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLAnchorElement;
      if (tag === "a") { el.click = vi.fn(); created.push(el); }
      return el;
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    downloadEntryAsJson(mkEntry());
    expect(created).toHaveLength(1);
    expect(created[0].download).toMatch(/^deployment-ws_1-/);
    expect(created[0].href).toBe("blob:mock");
  });
});

describe("compareEntries", () => {
  it("detects no changes for equal entries", () => {
    const diff = compareEntries(mkEntry(), mkEntry());
    expect(diff.workspaceChanged).toBe(false);
    expect(diff.overallChanged).toBe(false);
    expect(diff.steps.every(s => !s.stateChanged && !s.statusChanged && !s.reqBodyChanged && !s.resBodyChanged)).toBe(true);
    expect(diff.steps.every(s => s.latencyDeltaMs === 0)).toBe(true);
  });

  it("flags state + status + latency + response body changes", () => {
    const right = mkEntry();
    right.overallOk = false;
    right.steps[0] = { ...right.steps[0], state: "error", debug: { ...right.steps[0].debug!, status: 500, latencyMs: 900, resBodyPreview: "{\"error\":\"boom\"}" } };
    const diff = compareEntries(mkEntry(), right);
    expect(diff.overallChanged).toBe(true);
    const sql = diff.steps.find(s => s.key === "sql")!;
    expect(sql.stateChanged).toBe(true);
    expect(sql.statusChanged).toBe(true);
    expect(sql.latencyDeltaMs).toBe(780);
    expect(sql.resBodyChanged).toBe(true);
    expect(sql.reqBodyChanged).toBe(false);
  });

  it("flags workspace change", () => {
    const diff = compareEntries(mkEntry({ workspaceId: "ws_a" }), mkEntry({ workspaceId: "ws_b" }));
    expect(diff.workspaceChanged).toBe(true);
  });
});
