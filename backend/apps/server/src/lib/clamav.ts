// Phase 42 — ClamAV scan client.
//
// Talks to a `clamd` daemon over TCP using the INSTREAM command. Falls
// back to a "skipped" verdict when PLUTO_CLAMAV_HOST is unset so the
// upload path still works in dev/CI without a running scanner.

import net from "node:net";

export interface ScanResult {
  verdict: "clean" | "infected" | "error" | "skipped";
  signature?: string;
  scanner: string;
  error?: string;
}

export function clamavEnabled(): boolean {
  return !!process.env.PLUTO_CLAMAV_HOST;
}

/**
 * Stream `bytes` to clamd via INSTREAM and parse the reply.
 * Wire format: uint32 BE chunk size, chunk bytes, terminated by uint32 0.
 * Reply: `stream: OK\0` or `stream: Eicar-Test-Signature FOUND\0`.
 */
export async function scanBytes(bytes: Uint8Array): Promise<ScanResult> {
  const host = process.env.PLUTO_CLAMAV_HOST;
  const port = Number(process.env.PLUTO_CLAMAV_PORT ?? 3310);
  const timeoutMs = Number(process.env.PLUTO_CLAMAV_TIMEOUT_MS ?? 15_000);
  const scanner = `clamd@${host ?? "disabled"}:${port}`;
  if (!host) return { verdict: "skipped", scanner };

  return new Promise<ScanResult>((resolve) => {
    const sock = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { sock.destroy(); resolve({ verdict: "error", scanner, error: "timeout" }); }, timeoutMs);
    sock.on("error", (e) => { clearTimeout(timer); resolve({ verdict: "error", scanner, error: e.message }); });
    sock.on("data", (c) => chunks.push(c));
    sock.on("end", () => {
      clearTimeout(timer);
      const reply = Buffer.concat(chunks).toString("utf-8").replace(/\0$/, "").trim();
      if (/: OK$/.test(reply)) return resolve({ verdict: "clean", scanner });
      const m = reply.match(/: (.+) FOUND$/);
      if (m) return resolve({ verdict: "infected", signature: m[1], scanner });
      resolve({ verdict: "error", scanner, error: reply });
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      // Send in one chunk; production would stream.
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.byteLength, 0);
      sock.write(size);
      sock.write(Buffer.from(bytes));
      const zero = Buffer.alloc(4);
      zero.writeUInt32BE(0, 0);
      sock.write(zero);
    });
  });
}
