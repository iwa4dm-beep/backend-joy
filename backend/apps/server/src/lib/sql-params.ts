// Server-side bind-parameter typing for the admin SQL runner.
//
// The runner accepts params in two shapes:
//   1. Plain JSON values         : [42, "x", true]
//   2. Typed envelopes           : [{ type: "int", value: 42 }, ...]
//
// Typed envelopes are enforced strictly — mismatched values are rejected
// BEFORE the query hits Postgres. This protects against a modified client
// sending, e.g. `"1 OR true"` where the developer expected an integer, or
// exploding a bind slot with an oversized string.
//
// Supported types (mapped to Postgres via explicit OIDs for the
// extended-query protocol; pg-node then serializes them safely):
//
//   int / integer    -> int4   (32-bit signed)
//   bigint / int8    -> int8   (as string on wire; JS number allowed if safe)
//   float / double   -> float8
//   numeric          -> numeric (string in/out)
//   bool / boolean   -> bool
//   text / string    -> text
//   uuid             -> uuid   (format-checked)
//   timestamptz      -> timestamptz (ISO-8601)
//   date             -> date   (YYYY-MM-DD)
//   json / jsonb     -> jsonb  (serialized here)
//   bytea            -> bytea  (hex string, "\\x…")
//
// Also supported: `null` as a value with any declared type.

const OID: Record<string, number> = {
  int:         23,  int4: 23,  integer: 23,
  bigint:      20,  int8: 20,
  smallint:    21,  int2: 21,
  float:      701,  float8: 701, double: 701, "double precision": 701,
  real:       700,  float4: 700,
  numeric:   1700,
  bool:        16,  boolean: 16,
  text:        25,  string: 25,  varchar: 1043,
  uuid:      2950,
  timestamptz: 1184,
  timestamp:   1114,
  date:        1082,
  json:        114,
  jsonb:      3802,
  bytea:       17,
};

export type TypedParam = { type: string; value: unknown };
export type ParamInput = unknown | TypedParam;

export type CoerceResult =
  | { ok: true; values: unknown[]; types: (number | null)[]; declared: (string | null)[] }
  | { ok: false; error: string; index: number; details?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_BYTEA_RE = /^\\x[0-9a-fA-F]*$/;

// Safe-integer window for int4/int8 coming in as JS number.
const INT32_MIN = -2_147_483_648;
const INT32_MAX =  2_147_483_647;

function isTyped(p: unknown): p is TypedParam {
  return typeof p === "object" && p !== null && "type" in p && "value" in p
      && typeof (p as { type: unknown }).type === "string";
}

function coerceOne(idx: number, declared: string, raw: unknown): { ok: true; value: unknown; oid: number } | { ok: false; error: string; details?: string } {
  const t = declared.toLowerCase().trim();
  const oid = OID[t];
  if (oid === undefined) return { ok: false, error: "unknown_type", details: declared };
  if (raw === null || raw === undefined) return { ok: true, value: null, oid };

  switch (t) {
    case "int": case "integer": case "int4": {
      if (typeof raw !== "number" || !Number.isInteger(raw)) return { ok: false, error: "not_integer" };
      if (raw < INT32_MIN || raw > INT32_MAX) return { ok: false, error: "int4_out_of_range" };
      return { ok: true, value: raw, oid };
    }
    case "smallint": case "int2": {
      if (typeof raw !== "number" || !Number.isInteger(raw)) return { ok: false, error: "not_integer" };
      if (raw < -32768 || raw > 32767) return { ok: false, error: "int2_out_of_range" };
      return { ok: true, value: raw, oid };
    }
    case "bigint": case "int8": {
      if (typeof raw === "string" && /^-?\d+$/.test(raw)) return { ok: true, value: raw, oid };
      if (typeof raw === "number" && Number.isInteger(raw) && Number.isSafeInteger(raw)) return { ok: true, value: String(raw), oid };
      return { ok: false, error: "not_bigint" };
    }
    case "float": case "float8": case "double": case "double precision":
    case "real": case "float4": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return { ok: false, error: "not_float" };
      return { ok: true, value: raw, oid };
    }
    case "numeric": {
      if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, value: String(raw), oid };
      if (typeof raw === "string" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return { ok: true, value: raw, oid };
      return { ok: false, error: "not_numeric" };
    }
    case "bool": case "boolean": {
      if (typeof raw !== "boolean") return { ok: false, error: "not_boolean" };
      return { ok: true, value: raw, oid };
    }
    case "text": case "string": case "varchar": {
      if (typeof raw !== "string") return { ok: false, error: "not_string" };
      if (raw.length > 1_000_000) return { ok: false, error: "string_too_long" };
      return { ok: true, value: raw, oid };
    }
    case "uuid": {
      if (typeof raw !== "string" || !UUID_RE.test(raw)) return { ok: false, error: "not_uuid" };
      return { ok: true, value: raw, oid };
    }
    case "timestamptz": case "timestamp": {
      if (typeof raw !== "string") return { ok: false, error: "not_timestamp_string" };
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return { ok: false, error: "invalid_timestamp" };
      return { ok: true, value: d.toISOString(), oid };
    }
    case "date": {
      if (typeof raw !== "string" || !DATE_RE.test(raw)) return { ok: false, error: "not_date" };
      return { ok: true, value: raw, oid };
    }
    case "json": case "jsonb": {
      try { return { ok: true, value: JSON.stringify(raw), oid }; }
      catch { return { ok: false, error: "not_json_serializable" }; }
    }
    case "bytea": {
      if (typeof raw !== "string" || !HEX_BYTEA_RE.test(raw)) return { ok: false, error: "not_hex_bytea" };
      return { ok: true, value: raw, oid };
    }
    default:
      // Unreachable: OID lookup above already ensured `t` is known.
      return { ok: false, error: "unhandled_type", details: t };
  }
}

export function coerceParams(input: ParamInput[]): CoerceResult {
  const values: unknown[] = [];
  const types:  (number | null)[] = [];
  const declared: (string | null)[] = [];

  for (let i = 0; i < input.length; i++) {
    const p = input[i];
    if (isTyped(p)) {
      const r = coerceOne(i, p.type, p.value);
      if (!r.ok) return { ok: false, error: r.error, index: i, details: r.details };
      values.push(r.value); types.push(r.oid); declared.push(p.type.toLowerCase());
    } else {
      // Untyped — pass through to pg's default inference. We still reject
      // shapes pg can't serialize (functions, symbols, undefined).
      if (p === undefined) return { ok: false, error: "undefined_value", index: i };
      if (typeof p === "function" || typeof p === "symbol") return { ok: false, error: "unsupported_value", index: i };
      values.push(p as unknown); types.push(null); declared.push(null);
    }
  }
  return { ok: true, values, types, declared };
}
