// RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) using node:crypto.
import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  s = s.replace(/=+$/g, "").toUpperCase().replace(/\s+/g, "");
  let bits = 0, val = 0;
  const bytes: number[] = [];
  for (const c of s) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("bad_base32");
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): { secret_b32: string; secret_bytes: Buffer } {
  const bytes = randomBytes(20); // 160-bit per RFC 4226
  return { secret_b32: base32Encode(bytes), secret_bytes: bytes };
}

export function totpCode(secret: Buffer, step = 30, digits = 6, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const off = hmac[hmac.length - 1]! & 0xf;
  const code = ((hmac[off]! & 0x7f) << 24) | ((hmac[off + 1]! & 0xff) << 16)
             | ((hmac[off + 2]! & 0xff) << 8) | (hmac[off + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

// Verify with ±1 step window to tolerate clock skew.
export function verifyTotp(secret: Buffer, code: string): boolean {
  const now = Date.now();
  for (const drift of [-1, 0, 1]) {
    if (totpCode(secret, 30, 6, now + drift * 30_000) === code) return true;
  }
  return false;
}

export function otpauthUrl(secret_b32: string, label: string, issuer: string): string {
  const l = encodeURIComponent(`${issuer}:${label}`);
  const i = encodeURIComponent(issuer);
  return `otpauth://totp/${l}?secret=${secret_b32}&issuer=${i}&algorithm=SHA1&digits=6&period=30`;
}
