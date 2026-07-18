// Minimal MySQL DDL → PostgreSQL translator (regex-based, best-effort).
export function mysqlToPg(mysql: string): string {
  let s = mysql;
  // Strip ENGINE=, DEFAULT CHARSET=, COLLATE=, AUTO_INCREMENT=N
  s = s.replace(/\)\s*ENGINE\s*=\s*\w+[^;]*;/gi, ");");
  s = s.replace(/\s*DEFAULT\s+CHARSET\s*=\s*\w+/gi, "");
  s = s.replace(/\s*COLLATE\s*=?\s*\w+/gi, "");
  s = s.replace(/\s*AUTO_INCREMENT\s*=\s*\d+/gi, "");
  // Backticks → double-quotes
  s = s.replace(/`([^`]+)`/g, '"$1"');
  // Strip MySQL display-width annotations on integer types BEFORE matching
  // `UNSIGNED` / `AUTO_INCREMENT` — otherwise `int(11) unsigned` never
  // matches the `INT UNSIGNED` rule below and leaks invalid Postgres DDL.
  // Preserve `TINYINT(1)` (bool sentinel) which is handled explicitly next.
  s = s.replace(/\bTINYINT\s*\(\s*1\s*\)/gi, "__TINYINT_BOOL__");
  s = s.replace(/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\s*\(\s*\d+\s*\)/gi, "$1");
  s = s.replace(/__TINYINT_BOOL__/g, "TINYINT(1)");
  // Types
  s = s.replace(/\bINT\s+UNSIGNED\b/gi, "bigint");
  s = s.replace(/\bBIGINT\s+UNSIGNED\b/gi, "bigint");
  s = s.replace(/\bTINYINT\s*\(\s*1\s*\)/gi, "boolean");
  s = s.replace(/\bTINYINT\b/gi, "smallint");
  s = s.replace(/\bDATETIME\b/gi, "timestamptz");
  s = s.replace(/\bDOUBLE\b/gi, "double precision");
  s = s.replace(/\bLONGTEXT\b|\bMEDIUMTEXT\b|\bTINYTEXT\b/gi, "text");
  s = s.replace(/\bVARCHAR\s*\(\s*\d+\s*\)/gi, "text");
  s = s.replace(/\bJSON\b/gi, "jsonb");
  // AUTO_INCREMENT column → serial/bigserial (in-column)
  s = s.replace(/\bINT\b\s+AUTO_INCREMENT/gi, "serial");
  s = s.replace(/\bBIGINT\b\s+AUTO_INCREMENT/gi, "bigserial");
  s = s.replace(/\bAUTO_INCREMENT\b/gi, "");
  // ON UPDATE CURRENT_TIMESTAMP → drop (Postgres uses triggers)
  s = s.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, "");
  // Boolean 0/1 defaults — must anchor the digit so we don't match the
  // leading `1` of `DEFAULT 100` and produce `DEFAULT true00`.
  s = s.replace(/DEFAULT\s+b?'0'(?!\d)/gi, "DEFAULT false");
  s = s.replace(/DEFAULT\s+b?'1'(?!\d)/gi, "DEFAULT true");
  s = s.replace(/DEFAULT\s+0(?!\d)/gi, "DEFAULT false");
  s = s.replace(/DEFAULT\s+1(?!\d)/gi, "DEFAULT true");
  // KEY/INDEX inline → separate CREATE INDEX (drop for now)
  s = s.replace(/,\s*KEY\s+"[^"]+"\s*\([^)]+\)/gi, "");
  s = s.replace(/,\s*INDEX\s+"[^"]+"\s*\([^)]+\)/gi, "");
  return s;
}
