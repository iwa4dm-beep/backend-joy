// Verify an uploaded ZIP against a manifest.json + SHA256SUMS shipped inside it.
import JSZip from "jszip";

export type VerifyEntry = { path: string; expected: string; actual: string; ok: boolean };
export type VerifyResult = {
  hasManifest: boolean;
  manifest?: { generatedAt?: string; files: { path: string; sha256: string; size: number }[] };
  entries: VerifyEntry[];
  ok: boolean;
  message: string;
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const buf = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseSums(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m) out[m[2].replace(/^\.\//, "")] = m[1].toLowerCase();
  }
  return out;
}

export async function verifyZip(zip: JSZip): Promise<VerifyResult> {
  const manifestFile = zip.file("manifest.json");
  const sumsFile = zip.file("SHA256SUMS");
  if (!manifestFile && !sumsFile) {
    return { hasManifest: false, entries: [], ok: true, message: "manifest.json / SHA256SUMS পাওয়া যায়নি — integrity check skipped (raw project ZIP)।" };
  }

  let manifest: VerifyResult["manifest"];
  const expected: Record<string, string> = {};

  if (manifestFile) {
    try {
      manifest = JSON.parse(await manifestFile.async("string"));
      manifest?.files.forEach((f) => { expected[f.path] = f.sha256.toLowerCase(); });
    } catch { /* ignore */ }
  }
  if (sumsFile) Object.assign(expected, parseSums(await sumsFile.async("string")));

  const entries: VerifyEntry[] = [];
  for (const [path, hash] of Object.entries(expected)) {
    const f = zip.file(path);
    if (!f) { entries.push({ path, expected: hash, actual: "", ok: false }); continue; }
    const actual = await sha256Hex(await f.async("uint8array"));
    entries.push({ path, expected: hash, actual, ok: actual === hash });
  }

  const bad = entries.filter((e) => !e.ok).length;
  return {
    hasManifest: true,
    manifest,
    entries,
    ok: bad === 0,
    message: bad === 0
      ? `✓ ${entries.length}/${entries.length} ফাইল অক্ষত`
      : `✘ ${bad}/${entries.length} ফাইল mismatch / missing`,
  };
}

// Build manifest + SHA256SUMS for artifacts we emit ourselves.
export async function buildManifest(files: { path: string; content: Uint8Array | string }[]) {
  const enc = new TextEncoder();
  const rows: { path: string; sha256: string; size: number }[] = [];
  const sumsLines: string[] = [];
  for (const f of files) {
    const bytes = typeof f.content === "string" ? enc.encode(f.content) : f.content;
    const sha = await sha256Hex(bytes);
    rows.push({ path: f.path, sha256: sha, size: bytes.byteLength });
    sumsLines.push(`${sha}  ${f.path}`);
  }
  const manifest = { generatedAt: new Date().toISOString(), files: rows };
  return { manifest: JSON.stringify(manifest, null, 2), sums: sumsLines.join("\n") + "\n" };
}
