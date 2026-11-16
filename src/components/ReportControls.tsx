import { useId, useMemo, useState } from "react";
import { DateInput, MoneyInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import type { ReportSort } from "@/lib/reportTable";
import { normalizeSearch, queryReport, type ReportValue } from "@/lib/reportTable";
import type { ReactNode } from "react";

export function useReportState() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReportSort | null>(null);
  const toggle = (column: number) => setSort((s) => ({ column, direction: s?.column === column && s.direction === "asc" ? "desc" : "asc" }));
  return { query, setQuery, sort, setSort, toggle };
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
/** Paginação de apresentação (50 linhas): busca/ordenação já consideraram todos os registros; impressão/exportação usam o resultado completo. */
export const PAGE_SIZE = 50;
export function usePager(total: number, resetKey: unknown) {
  const [page, setPage] = useState(0);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) { setKey(resetKey); setPage(0); }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  return { page: p, pages, total, setPage, slice: <T,>(rows: T[]) => rows.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE) };
}
export function Pager({ pager }: { pager: ReturnType<typeof usePager> }) {
  const { page, pages, total, setPage } = pager;
  if (total <= PAGE_SIZE) return null;
  return <div className="flex items-center justify-end gap-2 p-2 text-xs"><span className="text-muted-foreground">{page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} de {total}</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(0)}>«</Button><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button><span>Página {page + 1} de {pages}</span><Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</Button><Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>»</Button></div>;
}

/** "Filtrar por" uma coluna da subaba: texto com sugestões, intervalo de datas ou de valores. Aplica antes da paginação. */
export interface FilterCol { label: string; type: "text" | "date" | "money" }
export interface ColFilterState { col: number; text: string; from: string | null; to: string | null; min: number | null; max: number | null }
const EMPTY_CF: ColFilterState = { col: -1, text: "", from: null, to: null, min: null, max: null };
export function useColumnFilter() {
  const [f, setF] = useState<ColFilterState>(EMPTY_CF);
  return { f, setF, clear: () => setF(EMPTY_CF), key: JSON.stringify(f) };
}
export function columnTest(f: ColFilterState, cols: FilterCol[], values: ReportValue[]): boolean {
  const c = cols[f.col];
  if (!c) return true;
  const v = values[f.col];
  if (c.type === "text") { const q = normalizeSearch(f.text); return !q || normalizeSearch(String(v ?? "")).includes(q); }
  if (c.type === "date") {
    if (!f.from && !f.to) return true;
    if (typeof v !== "number") return false;
    const a = f.from ? Date.parse(f.from) : -Infinity, b = f.to ? Date.parse(f.to) : Infinity;
    return v >= a && v <= b;
  }
  if (f.min == null && f.max == null) return true;
  const n = typeof v === "number" ? v : null;
  return n != null && (f.min == null || n >= f.min) && (f.max == null || n <= f.max);
}
export function ColumnFilter({ cols, filter, suggest }: { cols: FilterCol[]; filter: ReturnType<typeof useColumnFilter>; suggest: (col: number) => string[] }) {
  const { f, setF } = filter;
  const c = cols[f.col];
  const listId = useId();
  const opts = useMemo(() => (c?.type === "text" ? suggest(f.col) : []), [c, f.col, suggest]);
  const active = c && (f.text.trim() || f.from || f.to || f.min != null || f.max != null);
  return <div className="flex min-w-0 flex-wrap items-end gap-2 text-xs">
    <label><span className="lbl block">Filtrar por</span><select className="inp h-8" value={f.col} onChange={(e) => setF({ ...EMPTY_CF, col: Number(e.target.value) })}><option value={-1}>—</option>{cols.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}</select></label>
    {c?.type === "text" && <label><span className="lbl block">Pesquisar em {c.label}</span><input className="inp h-8 w-56" list={listId} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /><datalist id={listId}>{opts.map((o) => <option key={o} value={o} />)}</datalist></label>}
    {c?.type === "date" && <><label><span className="lbl block">De</span><DateInput allowEmpty value={f.from} maxDate={f.to} onChange={(v) => setF({ ...f, from: v })} /></label><label><span className="lbl block">Até</span><DateInput allowEmpty value={f.to} minDate={f.from} onChange={(v) => setF({ ...f, to: v })} /></label></>}
    {c?.type === "money" && <><label><span className="lbl block">Valor mínimo</span><MoneyInput value={f.min} onChange={(v) => setF({ ...f, min: v })} /></label><label><span className="lbl block">Valor máximo</span><MoneyInput value={f.max} onChange={(v) => setF({ ...f, max: v })} /></label></>}
    {active && <span className="filter-active">{c.label}<Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Limpar filtro ${c.label}`} onClick={filter.clear}>×</Button></span>}
  </div>;
}
export const suggestFrom = <T,>(rows: T[], values: (r: T) => ReportValue[]) => (col: number) => {
  const s = new Set<string>();
  for (const r of rows) { const v = values(r)[col]; if (v != null && v !== "" && typeof v === "string") s.add(v); if (s.size >= 2000) break; }
  return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
};
