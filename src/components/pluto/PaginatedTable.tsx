import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { downloadCsv, rowsToCsv } from "@/lib/pluto/csv";
import type { SortDir } from "@/lib/pluto/usePaginatedTable";

interface Column<T> {
  key: keyof T;
  label: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface Props<T extends Record<string, unknown>> {
  rows: T[];
  sorted: T[];
  columns: Column<T>[];
  page: number;
  pageSize: number;
  totalPages: number;
  sortKey: keyof T | null;
  sortDir: SortDir;
  onPage: (n: number) => void;
  onSort: (k: keyof T) => void;
  csvFilename?: string;
  csvColumns?: (keyof T)[];
  empty?: React.ReactNode;
}

// Small reusable table shell for the dashboard grids that share
// pagination, sortable headers, and one-click CSV export.
export function PaginatedTable<T extends Record<string, unknown>>({
  rows, sorted, columns, page, pageSize, totalPages,
  sortKey, sortDir, onPage, onSort, csvFilename, csvColumns, empty,
}: Props<T>) {
  const total = sorted.length;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{from}–{to} of {total.toLocaleString()}</span>
        {csvFilename && (
          <Button size="sm" variant="outline" disabled={sorted.length === 0}
            onClick={() => downloadCsv(csvFilename, rowsToCsv(sorted, csvColumns))}>
            <Download className="h-3 w-3 mr-1" /> Export CSV
          </Button>
        )}
      </div>
      <div className="border border-border rounded-md overflow-hidden">
        <div className="grid gap-2 text-[11px] font-medium bg-muted/40 px-2 py-1.5"
             style={{ gridTemplateColumns: columns.map(c => c.className ? "auto" : "1fr").join(" ") }}>
          {columns.map(c => {
            const active = sortKey === c.key;
            return (
              <button key={String(c.key)} onClick={() => onSort(c.key)}
                      className={"flex items-center gap-1 text-left hover:text-foreground " + (c.className ?? "")}>
                <span>{c.label}</span>
                {active
                  ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                  : <ArrowUpDown className="h-3 w-3 opacity-40" />}
              </button>
            );
          })}
        </div>
        <div>
          {rows.length === 0
            ? <div className="text-xs text-muted-foreground p-3 text-center">{empty ?? "No rows."}</div>
            : rows.map((r, i) => (
              <div key={i} className="grid gap-2 text-[11px] px-2 py-1.5 border-t border-border"
                   style={{ gridTemplateColumns: columns.map(c => c.className ? "auto" : "1fr").join(" ") }}>
                {columns.map(c => (
                  <div key={String(c.key)} className={"truncate " + (c.className ?? "")}>
                    {c.render ? c.render(r) : (r[c.key] as React.ReactNode)}
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3 w-3 mr-1" /> Prev
        </Button>
        <span className="text-muted-foreground">page {page} / {totalPages}</span>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}
