// AES-256-GCM helper — key derived from JWT_SECRET (HKDF-lite via SHA-256).
// Used to protect stored TOTP secrets and OIDC client_secret at rest.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config.js";

const key = createHash("sha256").update("pluto.aes." + env.JWT_SECRET).digest();

export function aesEncrypt(plain: Buffer): { ct: Buffer; nonce: Buffer } {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  const tag = c.getAuthTag();
  return { ct: Buffer.concat([enc, tag]), nonce };
}

export function aesDecrypt(ct: Buffer, nonce: Buffer): Buffer {
  const tag = ct.subarray(ct.length - 16);
  const enc = ct.subarray(0, ct.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]);
}
