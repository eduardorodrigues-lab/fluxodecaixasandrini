import { DetailReport, ReportSearch, SortHead, useReportState } from "@/components/ReportControls";
import { dateValue, parcelValue, queryReport, reportCSV } from "@/lib/reportTable";
import { PagamentosDia } from "@/components/PagamentosDia";
import { useMemo, useState } from "react";
import { DateInput } from "@/components/kit";
import { paymentsFor, titleStatus } from "@/lib/engine/engine";
import type { ExtensionEvent, Payment, ScenarioData } from "@/lib/engine/types";
import { addDays, fmtDate } from "@/lib/dates";
import { SupplierSearch } from "@/components/NotaPanel";
import { fmtBRL } from "@/lib/money";

export interface ConsultaRow {
  search?: string[]; key: string; supplierId: string; supplier: string; document: string; parcel: string; category: string; sub: string;
  value: number; due: string | null; extended: string | null; effective: string | null;
  paid: number; open: number; state: string; lastPay: string | null; payments: Payment[]; history: ExtensionEvent[];
}

/** Uma linha por título (parcela/boleto) a partir dos lançamentos existentes — sem duplicar dados. */
export function buildConsulta(d: ScenarioData): ConsultaRow[] {
  const sup = (id: string) => d.suppliers.find((s) => s.id === id)?.name ?? "—";
  const cat = (id: string) => d.categories.find((c) => c.id === id);
  const rows: ConsultaRow[] = [];
  const push = (kind: "committed" | "expense", id: string, supplierId: string, document: string, groupKey: string, value: number, status: string, due: string | null, ext: string | null, categoryId: string, history: ExtensionEvent[]) => {
    const ts = titleStatus(value, status, paymentsFor(d, kind, id));
    const c = cat(categoryId);
    const pays = [...ts.payments].sort((a, b) => a.date.localeCompare(b.date));
    rows.push({ key: `${kind}:${id}|${groupKey}`, supplierId, supplier: sup(supplierId), document, parcel: "", category: c ? (c.kind === "compra" ? "Compra" : "Despesa") : "—", sub: c?.name ?? "—", value, due, extended: ext, effective: ext || due, paid: ts.paid, open: Math.max(0, ts.open), state: ts.state === "Parcial" ? "Parcialmente pago" : ts.state, lastPay: pays.at(-1)?.date ?? null, payments: pays, history });
  };
  for (const c of d.committed) push("committed", c.id, c.supplierId, c.document, `${c.supplierId}|${c.purchaseCode}|${c.document}`, c.value, c.status, c.dueDate, c.extensionDate, c.categoryId, c.extensionHistory ?? []);
  for (const e of d.expenses) {
    const orig = e.termDays != null ? addDays(e.baseDate, e.termDays) : null;
    push("expense", e.id, e.supplierId, e.document, `${e.supplierId}||${e.document}`, e.value, e.status, orig, e.extensionDate, e.categoryId, e.extensionHistory ?? []);
  }
  // número da parcela: ordem por vencimento dentro de fornecedor+código+documento
  const groups = new Map<string, ConsultaRow[]>();
  for (const r of rows) { const g = r.key.split("|").slice(1).join("|"); groups.set(g, [...(groups.get(g) ?? []), r]); }
  for (const g of groups.values()) {
    g.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
    g.forEach((r, i) => (r.parcel = `${i + 1}/${g.length}`));
  }
  for (const r of rows) {
    const titleId = r.key.split("|")[0]?.split(":")[1];
    const t = d.committed.find((c) => c.id === titleId) ?? d.expenses.find((e) => e.id === titleId);
    r.search = [...(d.suppliers.find((s) => s.id === r.supplierId)?.aliases ?? []), t?.notes ?? "", t && "purchaseCode" in t ? t.purchaseCode : ""];
  }
  return rows;
}

export interface ConsultaFilter { from: string | null; to: string | null; by: "venc" | "pag"; supplier: string; pay: "" | "Em aberto" | "Parcialmente pago" | "Pago"; ext: "" | "sim" | "nao" }
export const EMPTY_FILTER: ConsultaFilter = { from: null, to: null, by: "venc", supplier: "", pay: "", ext: "" };

export function filterConsulta(rows: ConsultaRow[], f: ConsultaFilter): ConsultaRow[] {
  const inRange = (x: string | null) => !!x && (!f.from || x >= f.from) && (!f.to || x <= f.to);
  return rows.filter((r) => {
    if (f.supplier && r.supplierId !== f.supplier) return false;
    if (f.pay && r.state !== f.pay) return false;
    if (f.ext === "sim" && !r.extended) return false;
    if (f.ext === "nao" && r.extended) return false;
    if (f.from || f.to) {
      if (f.by === "venc" ? !inRange(r.effective) : !r.payments.some((p) => inRange(p.date))) return false;
    }
    return true;
  });
}

const HEAD = ["Fornecedor", "Documento", "Parcela", "Categoria", "Subgrupo", "Valor", "Vencimento", "Prorrogado para", "Pago", "Em aberto", "Situação", "Última baixa"];
export const consultaCells = (r: ConsultaRow) => [r.supplier, r.document || "—", r.parcel, r.category, r.sub, fmtBRL(r.value), r.due ? fmtDate(r.due) : "—", r.extended ? fmtDate(r.extended) : "—", fmtBRL(r.paid), fmtBRL(r.open), r.state, r.lastPay ? fmtDate(r.lastPay) : "—"];

export function consultaReport(all: ConsultaRow[], f: ConsultaFilter, byDoc: boolean, query: string, sort: import("@/lib/reportTable").ReportSort | null) {
  const filtered = filterConsulta(all, f);
  // Group filtered source parcels first: displayed aggregate fields are searchable without partial document totals.
  return queryReport(byDoc ? groupByDocument(filtered) : filtered, query, sort, (r) => [r.supplier, r.document, parcelValue(r.parcel), r.category, r.sub, r.value, dateValue(r.due), dateValue(r.extended), r.paid, r.open, r.state, dateValue(r.lastPay)], (r) => [...consultaCells(r), ...(r.search ?? [])]);
}

/** Agrupa por documento (fornecedor+documento): soma valores, pago e aberto das parcelas. */
export function groupByDocument(rows: ConsultaRow[]): ConsultaRow[] {
  const m = new Map<string, ConsultaRow[]>();
  for (const r of rows) { const k = `${r.supplierId}|${r.document}`; m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m.entries()].map(([k, g]) => {
    const paid = g.reduce((a, r) => a + r.paid, 0), open = g.reduce((a, r) => a + r.open, 0), value = g.reduce((a, r) => a + r.value, 0);
    const first = [...g].sort((a, b) => (a.effective ?? "").localeCompare(b.effective ?? ""))[0];
    if (!first) throw new Error("Grupo vazio");
    const pays = g.flatMap((r) => r.payments).sort((a, b) => a.date.localeCompare(b.date));
    return { ...first, search: g.flatMap((r) => [...consultaCells(r), ...(r.search ?? [])]), key: "doc:" + k, parcel: `${g.length} parcela(s)`, value, paid, open, state: paid <= 0 ? "Em aberto" : open > 0 ? "Parcialmente pago" : "Pago", lastPay: pays.at(-1)?.date ?? null, payments: pays, history: g.flatMap((r) => r.history), extended: g.some((r) => r.extended) ? first.extended ?? g.find((r) => r.extended)?.extended ?? null : null };
  });
}

export function Consultas({ d }: { d: ScenarioData }) {
  const [rep, setRep] = useState<"boletos" | "dia">("boletos");
  return <div>
    <div className="mb-2 flex gap-1 text-xs">{([["boletos", "Boletos e pagamentos"], ["dia", "Relatório de Pagamentos do Dia"]] as const).map(([k, l]) => <button key={k} className={`btn ${rep === k ? "btn-primary" : ""}`} onClick={() => setRep(k)}>{l}</button>)}</div>
    <div hidden={rep !== "dia"}><PagamentosDia /></div><div hidden={rep !== "boletos"}><ConsultaBoletos d={d} /></div>
  </div>;
}
function ConsultaBoletos({ d }: { d: ScenarioData }) {
  const all = useMemo(() => buildConsulta(d), [d]);
  const [f, setF] = useState<ConsultaFilter>(EMPTY_FILTER);
  const [sel, setSel] = useState<ConsultaRow | null>(null);
  const [byDoc, setByDoc] = useState(false);
  const report = useReportState();
  const rows = useMemo(() => consultaReport(all, f, byDoc, report.query, report.sort), [all, f, byDoc, report.query, report.sort]);
  const tot = rows.reduce((a, r) => ({ v: a.v + r.value, p: a.p + r.paid, o: a.o + r.open }), { v: 0, p: 0, o: 0 });
  const up = (p: Partial<ConsultaFilter>) => setF({ ...f, ...p });

  const exportXls = () => {
    const csv = reportCSV(HEAD, rows.map(consultaCells));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `consulta-boletos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const th = HEAD.map((h) => `<th>${h}</th>`).join("");
    const tb = rows.map((r) => `<tr>${consultaCells(r).map((c, i) => `<td class="${[5, 8, 9].includes(i) ? "n" : ""}">${c}</td>`).join("")}</tr>`).join("");
    w.document.write(`<html><head><title>Consulta de boletos e pagamentos</title><style>@page{size:A4 landscape;margin:10mm}body{font:9px sans-serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:2px 4px;text-align:left}.n{text-align:right}</style></head><body><h3>Consulta de boletos e pagamentos</h3><p>Títulos ${fmtBRL(tot.v)} · Pago ${fmtBRL(tot.p)} · Em aberto ${fmtBRL(tot.o)} · ${rows.length} linhas</p><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end gap-2 text-xs">
        <label><span className="lbl block">De</span><DateInput allowEmpty value={f.from} maxDate={f.to} onChange={(v) => up({ from: v })} /></label>
        <label><span className="lbl block">Até</span><DateInput allowEmpty value={f.to} minDate={f.from} onChange={(v) => up({ to: v })} /></label>
        <label><span className="lbl block">Filtrar data por</span><select className="inp" value={f.by} onChange={(e) => up({ by: e.target.value as ConsultaFilter["by"] })}><option value="venc">Vencimento</option><option value="pag">Data do pagamento</option></select></label>
        <label><span className="lbl block">Fornecedor</span><span className="block w-56"><SupplierSearch d={d} value={f.supplier} onChange={(v) => up({ supplier: v })} existing allowAll placeholder="Todos" /></span></label>
        <label><span className="lbl block">Pagamento</span><select className="inp" value={f.pay} onChange={(e) => up({ pay: e.target.value as ConsultaFilter["pay"] })}><option value="">Todos</option><option>Em aberto</option><option>Parcialmente pago</option><option>Pago</option></select></label>
        <label><span className="lbl block">Prorrogação</span><select className="inp" value={f.ext} onChange={(e) => up({ ext: e.target.value as ConsultaFilter["ext"] })}><option value="">Todos</option><option value="sim">Prorrogados</option><option value="nao">Não prorrogados</option></select></label>
        <label><span className="lbl block">Agrupar por</span><select className="inp" value={byDoc ? "doc" : "parc"} onChange={(e) => setByDoc(e.target.value === "doc")}><option value="parc">Parcela</option><option value="doc">Documento</option></select></label>
        <button className="btn" onClick={() => { setF(EMPTY_FILTER); report.setQuery(""); }}>Limpar filtros</button>
        <button className="btn" onClick={print}>Imprimir</button>
        <button className="btn" onClick={exportXls}>Exportar para Excel</button>
      </div>
      <div className="mb-2"><ReportSearch value={report.query} onChange={report.setQuery} count={rows.length} /></div>
      <div className="mb-2 flex gap-4 text-xs">
        <span>Valor dos títulos <b className="tabular-nums">{fmtBRL(tot.v)}</b></span>
        <span>Valor pago <b className="tabular-nums">{fmtBRL(tot.p)}</b></span>
        <span>Saldo em aberto <b className="tabular-nums">{fmtBRL(tot.o)}</b></span>
        <span className="text-muted-foreground">{rows.length} {byDoc ? "documentos" : "parcelas"}</span>
      </div>
      <div className="card overflow-auto">
        <table className="tbl"><thead><tr>{HEAD.map((h, i) => <SortHead key={h} label={h} column={i} sort={report.sort} onSort={report.toggle} numeric={[5, 8, 9].includes(i)} />)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="cursor-pointer hover:bg-muted" onClick={() => setSel(r)}>{consultaCells(r).map((c, i) => <td key={i} className={[5, 8, 9].includes(i) ? "num" : ""}>{c}</td>)}</tr>)}
            {!rows.length && <tr><td colSpan={HEAD.length} className="text-center text-muted-foreground">Nenhum resultado para os filtros informados</td></tr>}</tbody></table>
      </div>
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20">
          <div className="h-full w-[min(560px,95vw)] overflow-auto bg-background p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between"><div><div className="text-sm font-semibold">{sel.supplier} — {sel.document || "sem documento"}</div><div className="text-xs text-muted-foreground">Parcela {sel.parcel} · {sel.category} / {sel.sub}</div></div><button className="btn" onClick={() => setSel(null)}>Fechar</button></div>
            <table className="tbl mb-3"><tbody>
              {[["Valor da parcela", fmtBRL(sel.value)], ["Vencimento", sel.due ? fmtDate(sel.due) : "—"], ["Prorrogado para", sel.extended ? fmtDate(sel.extended) : "—"], ["Valor pago", fmtBRL(sel.paid)], ["Saldo em aberto", fmtBRL(sel.open)], ["Situação", sel.state]].map(([k, v]) => <tr key={k}><td className="lbl">{k}</td><td className="num">{v}</td></tr>)}
            </tbody></table>
            <div className="mb-1 text-xs font-semibold">Pagamentos</div>
            <DetailReport rows={sel.payments} head={["Data", "Valor", "Observação"]} values={(p) => [dateValue(p.date), p.amount, p.note]} cells={(p) => [fmtDate(p.date), fmtBRL(p.amount), p.note || "—"]} rowKey={(p) => p.id} />
            <div className="mb-1 text-xs font-semibold">Histórico de prorrogações</div>
            <DetailReport rows={sel.history} head={["Registrado em", "De", "Para", "Observação"]} values={(h) => [dateValue(h.at), dateValue(h.from), dateValue(h.to), h.note]} cells={(h) => [fmtDate(h.at.slice(0, 10)), fmtDate(h.from), fmtDate(h.to), h.note || "—"]} rowKey={(h) => String(sel.history.indexOf(h))} />
          </div>
        </div>
      )}
    </div>
  );
}
