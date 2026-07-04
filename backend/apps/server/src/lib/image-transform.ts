// Phase 32 — Image transformation provider abstraction.
//
// The default "passthrough" provider returns the source bytes unchanged
// and echoes back the requested params so callers can wire real WASM
// pipelines (e.g. @jsquash/*, @resvg/resvg-wasm) as drop-in replacements
// without touching the render route.
//
// A WASM provider should implement `transform` to actually decode/encode
// and honor the `format`, `resize`, `width`, `height`, and `quality`
// params. The `passthrough` provider is safe for Cloudflare Workers and
// leaves the door open for build-time-swap image processors.

export type TransformParams = {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;    // 1..100
  format?: "webp" | "jpeg" | "png" | "avif" | "original";
};

export type TransformInput = {
  bytes: Uint8Array;
  contentType: string;
  params: TransformParams;
};

export type TransformResult = {
  bytes: Uint8Array;
  contentType: string;
  actual: TransformParams;    // what the provider ended up applying
};

export interface ImageTransformProvider {
  name: string;
  supports(contentType: string): boolean;
  transform(input: TransformInput): Promise<TransformResult>;
}

class PassthroughProvider implements ImageTransformProvider {
  readonly name = "passthrough";
  supports(contentType: string): boolean {
    return contentType.startsWith("image/");
  }
  async transform({ bytes, contentType, params }: TransformInput): Promise<TransformResult> {
    // Real providers would decode + resize + re-encode here. Passthrough
    // preserves the original bytes and reports which params it applied
    // (none, unless the caller asked for `format: original`).
    return {
      bytes,
      contentType,
      actual: { format: "original", ...(params.width ? { width: params.width } : {}) },
    };
  }
}

let _provider: ImageTransformProvider | null = null;
export function imageTransformProvider(): ImageTransformProvider {
  if (_provider) return _provider;
  _provider = new PassthroughProvider();
  return _provider;
}

/** Register a real transform provider at boot (e.g. inside a WASM init). */
export function setImageTransformProvider(p: ImageTransformProvider) { _provider = p; }
