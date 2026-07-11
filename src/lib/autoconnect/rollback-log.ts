// Parse JSONL rollback logs produced by apply.sh into a step timeline.
export type LogEntry = {
  ts: string;
  jobId?: string;
  step: string;
  status: "start" | "ok" | "fail" | "skip" | "done";
  error?: string;
  file?: string;
  volume?: string;
  snapDir?: string;
  reason?: string;
};

export type LogSummary = {
  jobId: string;
  entries: LogEntry[];
  ok: boolean;
  failedStep?: LogEntry;
  rolledBack: boolean;
  startedAt?: string;
  endedAt?: string;
};

export function parseRollbackLog(text: string): LogSummary {
  const entries: LogEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { entries.push(JSON.parse(t)); } catch { /* skip malformed */ }
  }
  const failed = entries.find((e) => e.status === "fail" && e.step.startsWith("apply"));
  const rolledBack = entries.some((e) => e.step === "rollback" && e.status === "done");
  const ok = entries.some((e) => e.step === "done" && e.status === "ok");
  return {
    jobId: entries[0]?.jobId ?? "unknown",
    entries,
    ok,
    failedStep: failed,
    rolledBack,
    startedAt: entries[0]?.ts,
    endedAt: entries[entries.length - 1]?.ts,
  };
}
