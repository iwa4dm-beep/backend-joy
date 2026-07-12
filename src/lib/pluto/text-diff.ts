// Minimal LCS-based line diff for deployment compare view.
export type DiffLine = { type: "ctx" | "add" | "del"; text: string };

export function diffLines(a: string, b: string): DiffLine[] {
  const A = (a ?? "").split(/\r?\n/);
  const B = (b ?? "").split(/\r?\n/);
  const n = A.length, m = B.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: "ctx", text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: A[i] }); i++; }
    else { out.push({ type: "add", text: B[j] }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: A[i++] }); }
  while (j < m) { out.push({ type: "add", text: B[j++] }); }
  return out;
}

export function diffCounts(lines: DiffLine[]) {
  let add = 0, del = 0;
  for (const l of lines) { if (l.type === "add") add++; else if (l.type === "del") del++; }
  return { add, del };
}
