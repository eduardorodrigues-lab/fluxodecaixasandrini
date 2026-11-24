import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { documentGroups } from "@/lib/documentGroups";
import type { LaunchRef } from "@/lib/manageLaunch";
import { supplierIdentity } from "@/lib/supplierIdentity";
import { ColumnFilter, columnTest, DetailReport, Pager, ReportSearch, SortHead, suggestFrom, useColumnFilter, usePager, useReportState, type FilterCol } from "@/components/ReportControls";
import { dateValue, parcelValue, queryReport, reportCSV } from "@/lib/reportTable";
import { PagamentosDia } from "@/components/PagamentosDia";
import { useMemo, useRef, useState } from "react";
import { DateInput } from "@/components/kit";
import { committedByCode, distributePlanned, NO_TITLES, titleStatus } from "@/lib/engine/engine";
import type { ExtensionEvent, Payment, ScenarioData } from "@/lib/engine/types";
import { addDays, fmtDate } from "@/lib/dates";
import { SupplierSearch } from "@/components/NotaPanel";
import { fmtBRL } from "@/lib/money";

export interface ConsultaRow {
  launch?: LaunchRef; search?: string[]; key: string; supplierId: string; supplier: string; document: string; parcel: string; category: string; sub: string;
  boletoNumber?: string | null | undefined; value: number; due: string | null; extended: string | null; effective: string | null;
  paid: number; open: number; state: string; lastPay: string | null; payments: Payment[]; history: ExtensionEvent[];
}

/** Uma linha por título (parcela/boleto) a partir dos lançamentos existentes — sem duplicar dados. */
export function buildConsulta(d: ScenarioData): ConsultaRow[] {
  const index = documentGroups(d);
  // Indexes built once per base: same rows as scanning, without O(títulos × baixas) on every rebuild.
  const cats = new Map(d.categories.map((c) => [c.id, c]));
  const cat = (id: string) => cats.get(id);
  const paymentsByTitle = new Map<string, Payment[]>();
  for (const p of d.payments ?? []) { const k = `${p.titleKind}:${p.titleId}`; const l = paymentsByTitle.get(k); if (l) l.push(p); else paymentsByTitle.set(k, [p]); }
  const committedById = new Map(d.committed.map((c) => [c.id, c])), expenseById = new Map(d.expenses.map((e) => [e.id, e]));
  const suppliersById = new Map(d.suppliers.map((x) => [x.id, x]));
  const byCode = committedByCode(d.committed);
  const rows: ConsultaRow[] = [];
  const push = (kind: "committed" | "expense", id: string, supplierId: string, document: string, groupKey: string, value: number, status: string, due: string | null, ext: string | null, categoryId: string, history: ExtensionEvent[], srcName?: string) => {
    const ts = titleStatus(value, status, paymentsByTitle.get(`${kind}:${id}`) ?? []);
    const c = cat(categoryId);
    const pays = [...ts.payments].sort((a, b) => a.date.localeCompare(b.date));
    const source = kind === "committed" ? committedById.get(id) : expenseById.get(id);
    const identity = supplierIdentity(d, source);
    rows.push({ launch: { kind, id, parcel: id }, key: `${kind}:${id}|${groupKey}`, supplierId: identity.key, supplier: identity.name, document, boletoNumber: source?.boletoNumber ?? null, parcel: "", category: c ? (c.kind === "compra" ? "Compra" : "Despesa") : "—", sub: c?.name ?? "—", value, due, extended: ext, effective: ext || due, paid: ts.paid, open: Math.max(0, ts.open), state: ts.state === "Parcial" ? "Parcialmente pago" : ts.state, lastPay: pays.at(-1)?.date ?? null, payments: pays, history });
  };
  // Importados sem vínculo cadastral: agrupa pelo nome da fonte; documento vazio = título independente.
  for (const c of d.committed) push("committed", c.id, c.supplierId, index.byId.get(c.id)?.document ?? c.document, index.byId.get(c.id)?.key ?? c.id, c.value, c.status, c.dueDate, c.extensionDate, c.categoryId, c.extensionHistory ?? [], c.sourceSupplier);
  for (const e of d.expenses) {
    const orig = e.termDays != null ? addDays(e.baseDate, e.termDays) : null;
    push("expense", e.id, e.supplierId, e.document, e.supplierId || e.document ? `${e.supplierId || e.sourceSupplier}||${e.document}` : e.id, e.value, e.status, orig, e.extensionDate, e.categoryId, e.extensionHistory ?? [], e.sourceSupplier);
  }
  // número da parcela: ordem por vencimento dentro de fornecedor+código+documento
  const groups = new Map<string, ConsultaRow[]>();
  for (const r of rows) { const g = r.key.split("|").slice(1).join("|"); const l = groups.get(g); if (l) l.push(r); else groups.set(g, [r]); }
  for (const g of groups.values()) {
    g.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
    g.forEach((r, i) => (r.parcel = `${i + 1}/${g.length}`));
  }
  for (const r of rows) {
    const titleId = r.key.split("|")[0]?.split(":")[1];
    if (titleId && index.byId.has(titleId)) r.parcel = index.byId.get(titleId)?.labels.get(titleId) ?? "1/1";
    const t = titleId ? committedById.get(titleId) ?? expenseById.get(titleId) : undefined;
    r.search = [t?.boletoNumber ?? "", t?.document ?? "",...(suppliersById.get(r.supplierId)?.aliases ?? []), t?.notes ?? "", t && "purchaseCode" in t ? t.purchaseCode : ""];
  }
  for(const p of d.planned ?? []){
    const dist=distributePlanned(p,suppliersById.get(p.supplierId),byCode.get(p.purchaseCode) ?? NO_TITLES,d.params.profile,d.effectivations);
    const identity=supplierIdentity(d,p), category=cat(p.categoryId);
    dist.parcels.forEach((part,i)=>{
      const item=p.remainingOverride?.items?.[i], own=p.installments?.[part.idx??i];
      const key=item?.id??`${p.id}#${part.idx??i}`, note=item?.note;
      const document=note?.document??p.document, due=note?.dueDate??own?.date??part.date, extended=note?.extension??own?.extensionDate??null;
      rows.push({launch:{kind:"planned",id:p.id,parcel:key},key:`planned:${key}|planned:${p.id}:${note?.noteId??"saldo"}`,supplierId:identity.key,supplier:identity.name,document,boletoNumber:p.boletoNumbers?.[key]??item?.boletoNumber??own?.boletoNumber??null,parcel:note?`${note.parcelNo}/${note.parcelCount}`:`${i+1}/${dist.parcels.length}`,category:category?.kind==="despesa"?"Despesa":"Compra",sub:category?.name??"—",value:part.amount,due,extended,effective:extended??due,paid:0,open:0,state:"Planejada",lastPay:null,payments:[],history:[],search:[document,p.purchaseCode,p.notes,...(d.suppliers.find(s=>s.id===p.supplierId)?.aliases??[])]});
    });
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

const HEAD = ["Fornecedor", "Documento", "Parcela", "Categoria", "Subgrupo", "Valor", "Vencimento", "Prorrogado para", "Pago", "Em aberto", "Situação", "Última baixa", "Número do boleto"];
export const consultaCells = (r: ConsultaRow) => [r.supplier, r.document || "—", r.parcel, r.category, r.sub, fmtBRL(r.value), r.due ? fmtDate(r.due) : "—", r.extended ? fmtDate(r.extended) : "—", fmtBRL(r.paid), fmtBRL(r.open), r.state, r.lastPay ? fmtDate(r.lastPay) : "—", r.boletoNumber || "Não informado"];

export function consultaReport(all: ConsultaRow[], f: ConsultaFilter, byDoc: boolean, query: string, sort: import("@/lib/reportTable").ReportSort | null) {
  const filtered = filterConsulta(all, f);
  // Group filtered source parcels first: displayed aggregate fields are searchable without partial document totals.
  return queryReport(byDoc ? groupByDocument(filtered) : filtered, query, sort, (r) => [r.supplier, r.document, parcelValue(r.parcel), r.category, r.sub, r.value, dateValue(r.due), dateValue(r.extended), r.paid, r.open, r.state, dateValue(r.lastPay), r.boletoNumber], (r) => [...consultaCells(r), ...(r.search ?? [])]);
}

/** Agrupa por documento (fornecedor+documento): soma valores, pago e aberto das parcelas. */
export function groupByDocument(rows: ConsultaRow[]): ConsultaRow[] {
  const m = new Map<string, ConsultaRow[]>();
  for (const r of rows) { const k = r.document ? r.key.split("|").slice(1).join("|") || `${r.supplierId}|${r.document}` : r.key; m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m.entries()].map(([k, g]) => {
    const paid = g.reduce((a, r) => a + r.paid, 0), open = g.reduce((a, r) => a + r.open, 0), value = g.reduce((a, r) => a + r.value, 0);
    const first = [...g].sort((a, b) => (a.effective ?? "").localeCompare(b.effective ?? ""))[0];
    if (!first) throw new Error("Grupo vazio");
    const pays = g.flatMap((r) => r.payments).sort((a, b) => a.date.localeCompare(b.date));
    return { ...first, boletoNumber: g.map(r=>r.boletoNumber).filter(Boolean).join("; ") || null, search: g.flatMap((r) => [...consultaCells(r), ...(r.search ?? [])]), key: "doc:" + k, parcel: `${g.length} parcela(s)`, value, paid, open, state: g.every(r=>r.state==="Planejada") ? "Planejada" : g.every(r=>r.state==="Cancelado") ? "Cancelado" : paid <= 0 ? "Em aberto" : open > 0 ? "Parcialmente pago" : "Pago", lastPay: pays.at(-1)?.date ?? null, payments: pays, history: g.flatMap((r) => r.history), extended: g.some((r) => r.extended) ? first.extended ?? g.find((r) => r.extended)?.extended ?? null : null };
  });
}

export function Consultas({ d, onManage }: { d: ScenarioData; onManage?: ((ref: LaunchRef) => void) | undefined }) {
  const [rep, setRep] = useState<"boletos" | "dia">("boletos");
  // Hidden sub-report keeps its filters but does not rebuild after saves; it catches up when shown again.
  const lastBoletos = useRef(d); if (rep === "boletos") lastBoletos.current = d;
  const boletosData = rep === "boletos" ? d : lastBoletos.current;
  return <div>
    <div className="mb-2 flex flex-wrap gap-1 text-xs">{([["boletos", "Boletos e pagamentos"], ["dia", "Relatório de Pagamentos do Dia"]] as const).map(([k, l]) => <Button key={k} variant={rep === k ? "default" : "outline"} onClick={() => setRep(k)}>{l}</Button>)}<Button asChild variant="outline"><Link to="/lancamentos" search={(prev) => ({ ...prev, tab: "pva" })}>Planejado × Efetivado</Link></Button></div>
    <div hidden={rep !== "dia"}><PagamentosDia /></div><div hidden={rep !== "boletos"}><ConsultaBoletos d={boletosData} onManage={onManage} /></div>
  </div>;
}
const cT = (label: string, type: FilterCol["type"] = "text"): FilterCol => ({ label, type });
const C_COLS = [cT("Fornecedor"), cT("Documento"), cT("Parcela"), cT("Categoria"), cT("Subgrupo"), cT("Valor", "money"), cT("Vencimento", "date"), cT("Prorrogado para", "date"), cT("Pago", "money"), cT("Saldo", "money"), cT("Situação"), cT("Última baixa", "date"), cT("Número do boleto")];
const cVals = (r: ConsultaRow) => [r.supplier, r.document, r.parcel, r.category, r.sub, r.value, dateValue(r.due), dateValue(r.extended), r.paid, r.open, r.state, dateValue(r.lastPay), r.boletoNumber];
function ConsultaBoletos({ d, onManage }: { d: ScenarioData; onManage?: ((ref: LaunchRef) => void) | undefined }) {
  const all = useMemo(() => buildConsulta(d), [d]);
  const [f, setF] = useState<ConsultaFilter>(EMPTY_FILTER);
  const [sel, setSel] = useState<ConsultaRow | null>(null);
  const [byDoc, setByDoc] = useState(false);
  const report = useReportState();
  const cf = useColumnFilter();
  const allF = useMemo(() => all.filter((r) => columnTest(cf.f, C_COLS, cVals(r))), [all, cf.f]);
  const rows = useMemo(() => consultaReport(allF, f, byDoc, report.query, report.sort), [allF, f, byDoc, report.query, report.sort]);
  const pager = usePager(rows.length, rows);
  const tot = rows.reduce((a, r) => { const c = r.state === "Cancelado"; return { v: a.v + (c ? 0 : r.value), c: a.c + (c ? r.value : 0), p: a.p + r.paid, o: a.o + r.open }; }, { v: 0, c: 0, p: 0, o: 0 });
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
    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
    const tb = rows.map((r) => `<tr>${consultaCells(r).map((c, i) => `<td class="${[5, 8, 9].includes(i) ? "n" : ""}">${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
    w.document.write(`<html><head><title>Consulta de boletos e pagamentos</title><style>@page{size:A4 landscape;margin:10mm}body{font:9px sans-serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:2px 4px;text-align:left}.n{text-align:right}</style></head><body><h3>Consulta de boletos e pagamentos</h3><p>Obrigação vigente ${fmtBRL(tot.v)}${tot.c ? ` · Cancelado ${fmtBRL(tot.c)}` : ""} · Pago ${fmtBRL(tot.p)} · Em aberto ${fmtBRL(tot.o)} · ${rows.length} linhas</p><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  };

  return (
    <div>
      <div className="filter-bar text-xs">
        <label><span className="lbl block">De</span><DateInput allowEmpty value={f.from} maxDate={f.to} onChange={(v) => up({ from: v })} /></label>
        <label><span className="lbl block">Até</span><DateInput allowEmpty value={f.to} minDate={f.from} onChange={(v) => up({ to: v })} /></label>
        <label><span className="lbl block">Filtrar data por</span><select className="inp" value={f.by} onChange={(e) => up({ by: e.target.value as ConsultaFilter["by"] })}><option value="venc">Vencimento</option><option value="pag">Data do pagamento</option></select></label>
        <label><span className="lbl block">Fornecedor</span><span className="block w-56"><SupplierSearch d={d} value={f.supplier} onChange={(v) => up({ supplier: v })} existing historical allowAll placeholder="Todos" /></span></label>
        <label><span className="lbl block">Pagamento</span><select className="inp" value={f.pay} onChange={(e) => up({ pay: e.target.value as ConsultaFilter["pay"] })}><option value="">Todos</option><option>Em aberto</option><option>Parcialmente pago</option><option>Pago</option></select></label>
        <label><span className="lbl block">Prorrogação</span><select className="inp" value={f.ext} onChange={(e) => up({ ext: e.target.value as ConsultaFilter["ext"] })}><option value="">Todos</option><option value="sim">Prorrogados</option><option value="nao">Não prorrogados</option></select></label>
        <label><span className="lbl block">Agrupar por</span><select className="inp" value={byDoc ? "doc" : "parc"} onChange={(e) => setByDoc(e.target.value === "doc")}><option value="parc">Parcela</option><option value="doc">Documento</option></select></label>
        <button className="btn" onClick={() => { setF(EMPTY_FILTER); report.setQuery(""); cf.clear(); }}>Limpar filtros</button>
        <button className="btn" onClick={print}>Imprimir</button>
        <button className="btn" onClick={exportXls}>Exportar planilha</button>
      </div>
      <div className="filter-bar"><ReportSearch value={report.query} onChange={report.setQuery} count={rows.length} /><ColumnFilter cols={C_COLS} filter={cf} suggest={suggestFrom(all, cVals)} /></div>
      <div className="mb-2 flex gap-4 text-xs">
        <span>Obrigação vigente <b className="tabular-nums">{fmtBRL(tot.v)}</b></span>{tot.c > 0 && <span>Cancelado (valor original) <b className="tabular-nums">{fmtBRL(tot.c)}</b></span>}
        <span>Valor pago <b className="tabular-nums">{fmtBRL(tot.p)}</b></span>
        <span>Saldo em aberto <b className="tabular-nums">{fmtBRL(tot.o)}</b></span>
        <span className="text-muted-foreground">{rows.length} {byDoc ? "documentos" : "parcelas"}</span>
      </div>
      <div className="card overflow-auto">
        <table className="tbl"><thead><tr>{[0,1,12,2,3,4,5,6,7,8,9,10,11].map((i) => <SortHead key={HEAD[i]} label={HEAD[i] ?? ""} column={i} sort={report.sort} onSort={report.toggle} numeric={[5, 8, 9].includes(i)} />)}</tr></thead>
          <tbody>{pager.slice(rows).map((r) => <tr key={r.key} className="cursor-pointer hover:bg-muted" onClick={() => { if (onManage && r.launch) onManage(r.launch); else setSel(r); }}>{[0,1,12,2,3,4,5,6,7,8,9,10,11].map(i => <td key={i} className={[5,8,9].includes(i) ? "num" : ""}>{consultaCells(r)[i]}</td>)}</tr>)}
            {!rows.length && <tr><td colSpan={HEAD.length} className="text-center text-muted-foreground">Nenhum resultado para os filtros informados</td></tr>}</tbody></table><Pager pager={pager} />
      </div>
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20">
          <div className="h-full w-[min(560px,95vw)] overflow-auto bg-background p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between"><div><div className="text-sm font-semibold">{sel.supplier} — {sel.document || "sem documento"}</div><div className="text-xs text-muted-foreground">Parcela {sel.parcel} · {sel.category} / {sel.sub}{sel.supplierId.startsWith("pending:") && " · vínculo pendente"}</div></div><button className="btn" onClick={() => setSel(null)}>Fechar</button></div>
            <table className="tbl mb-3"><tbody>
              {[["Número do boleto", sel.boletoNumber || "Não informado"], ["Valor da parcela", fmtBRL(sel.value)], ["Vencimento", sel.due ? fmtDate(sel.due) : "—"], ["Prorrogado para", sel.extended ? fmtDate(sel.extended) : "—"], ["Valor pago", fmtBRL(sel.paid)], ["Saldo em aberto", fmtBRL(sel.open)], ["Situação", sel.state]].map(([k, v]) => <tr key={k}><td className="lbl">{k}</td><td className="num">{v}</td></tr>)}
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
