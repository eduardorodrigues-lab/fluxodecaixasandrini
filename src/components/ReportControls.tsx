import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReportSort } from "@/lib/reportTable";
import { queryReport, type ReportValue } from "@/lib/reportTable";
import type { ReactNode } from "react";

export function useReportState() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReportSort | null>(null);
  const toggle = (column: number) => setSort((s) => ({ column, direction: s?.column === column && s.direction === "asc" ? "desc" : "asc" }));
  return { query, setQuery, sort, toggle };
}
export function ReportSearch({ value, onChange, count }: { value: string; onChange: (s: string) => void; count: number }) {
  return <div className="flex flex-wrap items-end gap-2 text-xs"><label><span className="lbl block">Buscar no relatório</span><input type="search" className="inp h-8 w-56" value={value} onChange={(e) => onChange(e.target.value)} /></label><span className="pb-2 text-muted-foreground" role="status">{count} resultado(s)</span></div>;
}
export function SortHead({ label, column, sort, onSort, numeric = false }: { label: string; column: number; sort: ReportSort | null; onSort: (n: number) => void; numeric?: boolean }) {
  const selected = sort?.column === column;
  return <th className={numeric ? "num" : ""} aria-sort={selected ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><Button variant="ghost" className="h-auto w-full justify-between gap-1 rounded-none px-0 py-0 text-[inherit] font-[inherit]" onClick={() => onSort(column)}><span>{label}</span><span aria-hidden="true" className={selected ? "text-primary" : "text-muted-foreground"}>{selected ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span></Button></th>;
}

export function DetailReport<T>({ rows, head, values, cells, rowKey, actions }: { rows: T[]; head: string[]; values: (r: T) => ReportValue[]; cells: (r: T) => ReactNode[]; rowKey: (r: T) => string; actions?: (r: T) => ReactNode }) {
  const report = useReportState();
  const result = queryReport(rows, report.query, report.sort, values, (r) => [...values(r), ...cells(r).filter((v): v is string => typeof v === "string")]);
  const numeric = (i: number) => /^(Valor|Pago|Aberto)/.test(head[i] ?? "");
  return <div className="space-y-1"><ReportSearch value={report.query} onChange={report.setQuery} count={result.length} /><Button variant="outline" size="sm" onClick={() => report.setQuery("")}>Limpar filtros</Button><table className="tbl"><thead><tr>{head.map((h, i) => <SortHead key={h} label={h} column={i} sort={report.sort} onSort={report.toggle} numeric={numeric(i)} />)}{actions && <th>Ações</th>}</tr></thead><tbody>{result.map((r) => <tr key={rowKey(r)}>{cells(r).map((c, i) => <td key={i} className={numeric(i) ? "num" : ""}>{c}</td>)}{actions && <td>{actions(r)}</td>}</tr>)}{!result.length && <tr><td colSpan={head.length + Number(!!actions)}>Nenhum resultado para os filtros informados</td></tr>}</tbody></table></div>;
}