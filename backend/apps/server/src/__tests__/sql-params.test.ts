// Unit tests for server-side bind-parameter typing.
//
// Guarantees the runner catches malformed or malicious bind values
// BEFORE they can reach Postgres, even when the browser validator is
// bypassed by a modified client.

import { describe, it, expect } from "vitest";
import { coerceParams } from "../lib/sql-params.js";

describe("coerceParams — typed envelopes", () => {
  it("accepts a well-typed mix", () => {
    const r = coerceParams([
      { type: "int",         value: 42 },
      { type: "bigint",      value: "9007199254740993" },   // beyond Number.MAX_SAFE_INTEGER
      { type: "text",        value: "hello" },
      { type: "uuid",        value: "11111111-2222-3333-4444-555555555555" },
      { type: "bool",        value: true },
      { type: "timestamptz", value: "2025-01-01T00:00:00Z" },
      { type: "jsonb",       value: { nested: [1, 2, 3] } },
      { type: "int",         value: null },                  // null is always allowed
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values[1]).toBe("9007199254740993");
    expect(r.values[6]).toBe(JSON.stringify({ nested: [1, 2, 3] }));
    expect(r.declared[3]).toBe("uuid");
  });

  it("rejects mismatched primitives", () => {
    const cases: Array<[string, unknown, string]> = [
      ["int",         "42",        "not_integer"],
      ["int",         1.5,         "not_integer"],
      ["int",         999_999_999_999, "int4_out_of_range"],
      ["bool",        "true",      "not_boolean"],
      ["uuid",        "not-a-uuid","not_uuid"],
      ["timestamptz", "yesterday", "invalid_timestamp"],
      ["date",        "2025/01/01","not_date"],
      ["bytea",       "hello",     "not_hex_bytea"],
      ["numeric",     "abc",       "not_numeric"],
    ];
    for (const [type, value, expected] of cases) {
      const r = coerceParams([{ type, value }]);
      expect(r.ok, `${type}=${JSON.stringify(value)} should be rejected`).toBe(false);
      if (!r.ok) expect(r.error).toBe(expected);
    }
  });

  it("rejects unknown declared types", () => {
    const r = coerceParams([{ type: "hstore", value: "k=>v" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("unknown_type");
  });

  it("rejects unsupported JS values in untyped mode", () => {
    for (const bad of [undefined, () => 1, Symbol("x")]) {
      const r = coerceParams([bad as unknown]);
      expect(r.ok).toBe(false);
    }
  });

  it("passes plain scalars through untyped", () => {
    const r = coerceParams([1, "x", true, null]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.types.every((t) => t === null)).toBe(true);
  });
});
