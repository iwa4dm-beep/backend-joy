// Phase 42 — imgproxy signed URL builder.
//
// When PLUTO_IMGPROXY_URL is set the render route can hand back a signed
// imgproxy URL instead of decoding + re-encoding in-process, offloading
// CPU-heavy pipelines to the sidecar. Signature format follows the
// canonical imgproxy scheme: `sha256_hmac(key, salt + path)` truncated to
// the configured length, urlsafe-base64 encoded.

import { createHmac } from "node:crypto";
import type { TransformParams } from "./image-transform.js";

export interface ImgproxyConfig {
  baseUrl: string;      // e.g. https://imgproxy.internal
  key: string;          // hex-encoded HMAC key
  salt: string;         // hex-encoded salt
  signatureLen?: number;
}

export function imgproxyEnabled(): boolean {
  return !!(process.env.PLUTO_IMGPROXY_URL && process.env.PLUTO_IMGPROXY_KEY && process.env.PLUTO_IMGPROXY_SALT);
}

export function imgproxyConfig(): ImgproxyConfig | null {
  if (!imgproxyEnabled()) return null;
  return {
    baseUrl: process.env.PLUTO_IMGPROXY_URL!.replace(/\/$/, ""),
    key: process.env.PLUTO_IMGPROXY_KEY!,
    salt: process.env.PLUTO_IMGPROXY_SALT!,
    signatureLen: Number(process.env.PLUTO_IMGPROXY_SIG_LEN ?? 32),
  };
}

function urlsafeB64(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Build a signed imgproxy URL for the given source URL + transform params. */
export function signImgproxyUrl(sourceUrl: string, params: TransformParams, cfg = imgproxyConfig()): string | null {
  if (!cfg) return null;
  const parts: string[] = [];
  if (params.resize && (params.width || params.height)) {
    parts.push(`rs:${params.resize === "cover" ? "fill" : params.resize === "contain" ? "fit" : "force"}:${params.width ?? 0}:${params.height ?? 0}:0`);
  }
  if (params.quality) parts.push(`q:${params.quality}`);
  const ext = params.format && params.format !== "original" ? `.${params.format}` : "";
  const encodedSrc = urlsafeB64(Buffer.from(sourceUrl));
  const path = `/${parts.join("/")}/${encodedSrc}${ext}`;
  const key = Buffer.from(cfg.key, "hex");
  const salt = Buffer.from(cfg.salt, "hex");
  const sig = urlsafeB64(
    createHmac("sha256", key).update(salt).update(path).digest().subarray(0, cfg.signatureLen ?? 32),
  );
  return `${cfg.baseUrl}/${sig}${path}`;
}
