// Phase 43 — RLS-aware channel predicate evaluator.
//
// Channels can carry a simple predicate expression that filters events
// per-subscriber based on their session claims (auth.uid(), workspace_id,
// role). We deliberately support a small, safe grammar — NOT arbitrary
// SQL — so predicates can be evaluated inside the server without
// round-tripping to Postgres for every event.
//
// Grammar (whitespace-insensitive):
//
//   expr        := clause ( ( 'AND' | 'OR' ) clause )*
//   clause      := column op value
//   op          := '=' | '!=' | '>' | '>=' | '<' | '<='
//   value       := ident | literal
//   ident       := 'auth.uid()' | 'auth.role()' | 'workspace_id' | 'now()'
//   literal     := number | 'true' | 'false' | 'null' | "'...'"
//
// Examples:
//   user_id = auth.uid()
//   workspace_id = auth.workspace() AND status != 'archived'
//   priority >= 5

export type PredicateContext = {
  userId?: string | null;
  role?: string | null;
  workspaceId?: string | null;
};

type Clause = { col: string; op: string; rhs: { kind: "ident"|"literal"; value: unknown } };

const OPS = new Set(["=", "!=", ">", ">=", "<", "<="]);
const IDENTS: Record<string, (ctx: PredicateContext) => unknown> = {
  "auth.uid()":       (c) => c.userId ?? null,
  "auth.role()":      (c) => c.role ?? "anon",
  "auth.workspace()": (c) => c.workspaceId ?? null,
  "workspace_id":     (c) => c.workspaceId ?? null,
  "now()":            () => new Date().toISOString(),
};

function parseValue(tok: string): { kind: "ident"|"literal"; value: unknown } {
  if (tok in IDENTS) return { kind: "ident", value: tok };
  if (tok === "true" || tok === "false") return { kind: "literal", value: tok === "true" };
  if (tok === "null") return { kind: "literal", value: null };
  if (/^-?\d+(\.\d+)?$/.test(tok)) return { kind: "literal", value: Number(tok) };
  const m = tok.match(/^'(.*)'$/);
  if (m) return { kind: "literal", value: m[1] };
  throw new Error(`invalid value: ${tok}`);
}

export function parsePredicate(expr: string): { evaluate: (row: Record<string, unknown>, ctx: PredicateContext) => boolean } {
  const tokens = expr.match(/'[^']*'|[A-Za-z_][A-Za-z0-9_.()]*|!=|>=|<=|=|>|<|\S/g) ?? [];
  const clauses: Array<{ join: "AND" | "OR" | null; clause: Clause }> = [];
  let i = 0;
  let join: "AND" | "OR" | null = null;

  while (i < tokens.length) {
    const col = tokens[i++];
    const op  = tokens[i++];
    const val = tokens[i++];
    if (!col || !op || !val) throw new Error("incomplete clause");
    if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(col)) throw new Error(`invalid column: ${col}`);
    if (!OPS.has(op)) throw new Error(`invalid op: ${op}`);
    clauses.push({ join, clause: { col, op, rhs: parseValue(val) } });
    if (i < tokens.length) {
      const next = tokens[i++].toUpperCase();
      if (next !== "AND" && next !== "OR") throw new Error(`expected AND/OR, got ${next}`);
      join = next as "AND" | "OR";
    }
  }

  return {
    evaluate(row, ctx) {
      let result = true;
      for (const { join, clause } of clauses) {
        const lhs = row[clause.col] ?? null;
        const rhs = clause.rhs.kind === "ident"
          ? IDENTS[clause.rhs.value as string](ctx)
          : clause.rhs.value;
        const cmp = compare(lhs, clause.op, rhs);
        if (join === null) result = cmp;
        else if (join === "AND") result = result && cmp;
        else result = result || cmp;
      }
      return result;
    },
  };
}

function compare(lhs: unknown, op: string, rhs: unknown): boolean {
  switch (op) {
    case "=":  return lhs == rhs;
    case "!=": return lhs != rhs;
    case ">":  return (lhs as number) >  (rhs as number);
    case ">=": return (lhs as number) >= (rhs as number);
    case "<":  return (lhs as number) <  (rhs as number);
    case "<=": return (lhs as number) <= (rhs as number);
    default:   return false;
  }
}
