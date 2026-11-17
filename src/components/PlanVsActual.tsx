import { Fragment, useMemo, useState } from "react";
import type { ScenarioData } from "@/lib/engine/types";
import { EMPTY_PVA, filterPva, planVsActual, summarizePva, pvaUndated, type PvaFilter, type PvaRow } from "@/lib/planVsActual";
import { DateInput } from "@/components/kit";
import { Pager, usePager } from "@/components/ReportControls";
import { reportCSV } from "@/lib/reportTable";
import { fmtBRL } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const NA = "Não disponível";
const money = (v: number | null) => (v === null ? NA : fmtBRL(v));
const signed = (v: number | null) => (v === null ? "Não comparável" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtBRL(Math.abs(v))}`);
const pct = (r: Pick<PvaRow, "pct" | "pctNote">) => r.pctNote ?? (r.pct === null ? "Não comparável" : `${r.pct > 0 ? "+" : r.pct < 0 ? "−" : ""}${Math.abs(r.pct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
export const PVA_HEAD = ["Pedido", "Fornecedor", "Planejado de referência", "Efetivado acumulado", "Restante previsto confirmado", "Total atual", "Diferença R$", "Diferença %", "Comparação", "Situação", "Motivo / referência", "Notas vinculadas"];
export const pvaCells = (r: PvaRow) => [r.purchaseCode || "Não informado", r.supplier, money(r.baseline), fmtBRL(r.effective), r.remaining === null ? "Não confirmado" : fmtBRL(r.remaining), money(r.total), signed(r.diff), pct(r), r.comparison, r.situation, r.reason ?? r.baselineSource,
  r.notes.map((n) => `${n.document || "sem documento"} ${n.parcel} ${fmtBRL(n.value)} ${n.status}`).join("; ")];
const tone = (r: PvaRow) => (r.comparison === "Acima" ? "bg-warning-soft text-warning-foreground" : r.comparison === "Não comparável" ? "text-muted-foreground" : "");

/** Export keeps all filtered rows, with the same comparable-only indicator scope. */
export function pvaExport(rows: PvaRow[], excludedUndated = 0) {
  const k = summarizePva(rows);
  return reportCSV([...PVA_HEAD, "Categoria", "Subgrupo", "Cobertura comparável", "Não comparáveis", "Excluídos sem data", "Escopo dos valores", "KPI referência", "KPI efetivado", "KPI restante", "KPI total atual", "KPI diferença R$", "KPI diferença %"], rows.map(r => [...pvaCells(r), r.category === "compra" ? "Compra" : r.category === "despesa" ? "Despesa" : NA, r.subgroup, `${k.comparable}/${k.filtered}`, String(k.unavailable), String(excludedUndated), "Acumulados integrais dos pedidos; KPIs somente comparáveis", money(k.baseline), money(k.effective), money(k.remaining), money(k.total), k.diff === null ? NA : signed(k.diff), pct({ pct: k.pct, pctNote: k.diff === null ? NA : k.baseline === 0 ? "Não aplicável" : null })]));
}

/** Detalhe do pedido: notas, parcelas, referência e histórico comprovado. */
export function PvaDetail({ r }: { r: PvaRow }) {
  const docs = [...new Set(r.notes.map((n) => n.document || "Sem documento"))];
  return <div className="space-y-2 text-xs">
    <p><b>Referência:</b> {r.baselineSource}. <b>Restante:</b> {r.remainingSource}. Total atual é compromisso do pedido, não saldo de caixa.</p>
    {r.cancelledValue > 0 && <p>Notas canceladas vinculadas: {fmtBRL(r.cancelledValue)} (fora do efetivado; não tratado como economia).</p>}
    {docs.map((doc) => <div key={doc} className="rounded border border-border p-2"><p className="font-semibold">Nota / documento: {doc}</p>
      <table className="tbl"><thead><tr><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Prorrogado</th><th>Pago</th><th>Situação</th><th>Efetivado em</th></tr></thead><tbody>
        {r.notes.filter((n) => (n.document || "Sem documento") === doc).map((n) => <tr key={n.id}><td>{n.parcel}</td><td>{fmtBRL(n.value)}</td><td>{fmtDate(n.due)}</td><td>{n.extension ? fmtDate(n.extension) : "Não informado"}</td><td>{fmtBRL(n.paid)}</td><td>{n.status}</td><td>{n.effectivationAt ? fmtDate(n.effectivationAt.slice(0, 10)) : NA}</td></tr>)}
      </tbody></table></div>)}
    <p><b>Justificativa:</b> {r.justification.length ? r.justification.join(" · ") : NA}. <b>Responsável pela efetivação:</b> {NA} (não registrado no evento).</p>
    <div><b>Histórico antes/depois:</b> {r.history.length ? r.history.map((h, i) => <p key={i}>{fmtDate(h.at.slice(0, 10))} {h.at.slice(11, 16)} · {h.by || NA} · {h.scope} · {fmtBRL(h.before.amount)} → {fmtBRL(h.after.amount)} · {h.note || "sem justificativa"}</p>) : NA}</div>
  </div>;
}

/** Acesso pelo detalhe do pedido (Gerenciar). */
export function PlanVsActualDetail({ d, plannedId }: { d: ScenarioData; plannedId: string | null | undefined }) {
  const r = useMemo(() => (plannedId ? planVsActual(d).find((x) => x.plannedId === plannedId) : undefined), [d, plannedId]);
  if (!r) return null;
  return <details className="rounded border border-border p-2 text-xs"><summary className="cursor-pointer font-semibold">Planejado × Efetivado do pedido {r.purchaseCode || "Não informado"}: {r.comparison} {signed(r.diff)}</summary>
    <p className="py-1">Referência {money(r.baseline)} · Efetivado {fmtBRL(r.effective)} · Restante {r.remaining === null ? "Não confirmado" : fmtBRL(r.remaining)} · Total atual {money(r.total)} · {r.situation}</p><PvaDetail r={r} /></details>;
}

export function PlanVsActual({ d }: { d: ScenarioData }) {
  const all = useMemo(() => planVsActual(d), [d]);
  const [f, setF] = useState<PvaFilter>(EMPTY_PVA);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => filterPva(all, f), [all, f]);
  const pager = usePager(rows.length, rows);
  const k = useMemo(() => summarizePva(rows), [rows]);
  const undated = useMemo(() => pvaUndated(all, f), [all, f]);
  const subgroups = useMemo(() => [...new Map(all.filter(r => !f.category || r.category === f.category).filter(r => r.subgroupId).map(r => [r.subgroupId, r.subgroup])).entries()].sort((a,b) => a[1].localeCompare(b[1])), [all, f.category]);
  const suppliers = useMemo(() => [...new Map(all.map((r) => [r.supplierKey, r.supplier])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const up = (p: Partial<PvaFilter>) => setF(prev => ({ ...prev, ...p }));
  const invalid = f.from && f.to && f.from > f.to;
  const exportCsv = () => { const a = document.createElement("a"); const url = URL.createObjectURL(new Blob([pvaExport(rows, undated.length)], { type: "text/csv;charset=utf-8" })); a.href = url; a.download = `planejado-x-efetivado-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); };
  return <div className="pva-report space-y-3">
    <h2 className="text-base font-semibold">Planejado × Efetivado</h2>
    <p className="text-sm text-muted-foreground">Pedidos com efetivação no período · valores acumulados dos pedidos</p>
    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col">Efetivação de<DateInput value={f.from} onChange={(v) => up({ from: v })} /></label>
      <label className="flex flex-col">Até<DateInput value={f.to} onChange={(v) => up({ to: v })} /></label>
      <label>Fornecedor<select className="inp w-full" value={f.supplier} onChange={(e) => up({ supplier: e.target.value })}><option value="">Todos</option>{suppliers.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      <label>Categoria<select className="inp w-full" value={f.category} onChange={e => up({ category: e.target.value, subgroup: "" })}><option value="">Todas</option><option value="compra">Compra</option><option value="despesa">Despesa</option></select></label>
      <label>Subgrupo<select className="inp w-full" value={f.subgroup} onChange={e => up({ subgroup: e.target.value })}><option value="">Todos</option>{subgroups.map(([id,n]) => <option key={id} value={id}>{n}</option>)}</select></label>
      <label>Comparação<select className="inp w-full" value={f.comparison} onChange={(e) => up({ comparison: e.target.value as PvaFilter["comparison"] })}><option value="">Todas</option><option>Acima</option><option>Abaixo</option><option>Sem diferença</option><option>Não comparável</option></select></label>
      <label>Situação<select className="inp w-full" value={f.situation} onChange={(e) => up({ situation: e.target.value as PvaFilter["situation"] })}><option value="">Todas</option><option>Parcial</option><option>Concluído</option><option>Previsão cancelada</option></select></label>
    </div>
    {invalid && <p className="text-xs text-destructive">Data inicial maior que a final.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Inclui todas as notas vinculadas e o restante atual confirmado, não apenas o valor efetivado no mês. Total atual é compromisso, não saldo de caixa.</p>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setF({ ...EMPTY_PVA })}>Limpar filtros</Button><Button variant="outline" size="sm" onClick={exportCsv} disabled={!!invalid}><Download size={16} />Exportar relatório</Button></div>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores Planejado × Efetivado">
      {[["Planejado de referência", money(k.baseline)], ["Efetivado acumulado", money(k.effective)], ["Restante previsto confirmado", money(k.remaining)], ["Diferença R$ / %", `${k.diff === null ? NA : signed(k.diff)} · ${pct({ pct: k.pct, pctNote: k.diff === null ? NA : k.baseline === 0 ? "Não aplicável" : null })}`]].map(([label,value]) => <div key={label} className="min-w-0 rounded border border-border bg-card p-3"><p className="text-sm text-muted-foreground">{label}</p><strong className={`block break-words text-base tabular-nums ${label === "Diferença R$ / %" && k.diff !== null && k.diff > 0 ? "text-warning-foreground" : ""}`}>{value}</strong></div>)}
    </div>
    <div className="border-y border-border py-2 text-sm" aria-label="Cobertura da comparação">
      <b>{k.comparable}/{k.filtered} pedidos comparáveis</b> · {k.unavailable} não comparáveis. KPIs somente desse mesmo conjunto comparável · Total atual: <b>{money(k.total)}</b>.
      {k.unavailable > 0 && <details className="mt-1"><summary className="cursor-pointer">Revisar motivos de não comparação ({k.unavailable})</summary>{rows.filter(r => r.comparison === "Não comparável").map(r => <p key={r.plannedId}><b>{r.purchaseCode || "Não informado"}</b> · {r.supplier} · {r.reason || NA}</p>)}</details>}
      {(f.from || f.to) && <details className="mt-1"><summary className="cursor-pointer">{undated.length} pedidos excluídos por falta de data de efetivação (demais filtros atuais)</summary>{undated.map(r => <p key={r.plannedId}>{r.purchaseCode || "Não informado"} · {r.supplier} · Data: {NA}</p>)}</details>}
    </div>
    <div className="overflow-x-auto"><table className="tbl pva-table"><thead><tr>{PVA_HEAD.slice(0, 10).map((h) => <th key={h} className="whitespace-normal">{h}</th>)}</tr></thead><tbody>
      {pager.slice(rows).map((r) => <Fragment key={r.plannedId}><tr className="cursor-pointer" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setOpen(open === r.plannedId ? null : r.plannedId); }} onClick={() => setOpen(open === r.plannedId ? null : r.plannedId)} aria-expanded={open === r.plannedId}>
        {pvaCells(r).slice(0, 10).map((c, i) => <td key={i} className={`${i >= 2 && i <= 7 ? "num" : ""} ${i >= 6 && i <= 8 ? tone(r) : ""}`} title={i === 8 ? r.reason ?? "" : undefined}>{c}</td>)}</tr>
        {open === r.plannedId && <tr><td colSpan={10}><PvaDetail r={r} /></td></tr>}</Fragment>)}
      {!rows.length && <tr><td colSpan={10}>Nenhum pedido com efetivação vinculada nos filtros.</td></tr>}
    </tbody></table></div>
    <Pager pager={pager} />
  </div>;
}
