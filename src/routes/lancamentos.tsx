import { DetailReport, ReportSearch, SortHead, useReportState } from "@/components/ReportControls";
import { dateValue, parcelValue, queryReport } from "@/lib/reportTable";
import { Button } from "@/components/ui/button";
import { askConfirm, askText } from "@/lib/decisions";
import { BaixasList, PagamentoPanel } from "@/components/BancoPanels";
import { accountName, NO_ACCOUNT, registerPaymentBatch, coverTitleWithCard } from "@/lib/engine/banco";
import { createFileRoute } from "@tanstack/react-router";
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateInput, MoneyInput, PageHeader } from "@/components/kit";
import { ConditionPicker, DadosNotaPanel, Field, guardClose, NovaNota, ParcelaPanel, ProrrogarPanel, Section, SidePanel, type NoteFields } from "@/components/NotaPanel";
import { applyNote, editCommittedNote, editPlannedParcel, extendPlannedParcel, parcelLabels, saveSupplierCondition } from "@/lib/notas";
import { committedDate, distributePlanned, expenseDate, paymentsFor, splitCents, titleStatus } from "@/lib/engine/engine";
import { closePlanned, confirmExtension, linkLegacyTitle, plannedSummary, reopenPlanned, reverseEffectivation, reversePayment, todaySP } from "@/lib/engine/actions";
import type { CategoryKind, ExtensionEvent, Planned, ScenarioData } from "@/lib/engine/types";
import { addDays, fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { uid, useApp } from "@/lib/store";
import { adjustPlanned, applySuggestion, currentParcels, diffParcels, draftTotals, effectivateManual, initDraft, validateDraft, type EffLine, type RestLine, type Suggestion } from "@/lib/efetivacao";
import { Consultas } from "@/components/Consultas";
import { pendingSearch } from "@/lib/pendencias";
import { usePendingFocus } from "@/components/PendingFocus";

export const Route = createFileRoute("/lancamentos")({
  validateSearch: pendingSearch,
  head: () => ({
    meta: [
      { title: "Lançamentos · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Lançamentos planejados e efetivados de compras e despesas, com pagamentos." },
      { property: "og:title", content: "Lançamentos · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Planejado e efetivado de compras e despesas, com baixas de pagamento." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

// Duas etapas (Planejada/Efetivado) × duas categorias (Compra/Despesa). Pagamentos = controle separado (baixas).
// Tabelas: UMA LINHA POR PARCELA; identificadores da nota repetidos, sem somar o total da nota por linha.
type Tab = "planned" | "committed" | "payments" | "consultas";
const TABS: { k: Tab; l: string }[] = [{ k: "planned", l: "Planejada" }, { k: "committed", l: "Efetivado" }, { k: "payments", l: "Pagamentos (baixas)" }, { k: "consultas", l: "Consultas" }];
const now = () => new Date().toISOString();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

type Panel =
  | { t: "new" }
  | { t: "pay"; kind: "committed" | "expense"; id: string; label: string }
  | { t: "parcela"; label: string; amount: number; date: string; save: (x: ScenarioData, amount: number, date: string) => void }
  | { t: "nota"; init: NoteFields; siblings: number; save: (x: ScenarioData, f: NoteFields) => void }
  | { t: "prorrogar"; label: string; current: string | null; original: string | null; history: ExtensionEvent[]; save: (x: ScenarioData, to: string | null, note: string) => void }
  | { t: "eff"; id: string; mode: "parcela" | "documento" | "ajustar"; sel: string[] };

// Menu em portal (Radix): fora do overflow da tabela, ancorado ao botão, com colisão e rolagem só se necessário.
function Acoes({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{ disabled?: boolean; className?: string }>[];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><button className="btn" aria-label="Ações da linha">Ações ▾</button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="z-[60] flex w-52 flex-col gap-1 overflow-y-auto p-1" style={{ maxHeight: "var(--radix-dropdown-menu-content-available-height)" }}>
        {items.map((el, i) => <DropdownMenuItem key={i} asChild disabled={!!el.props.disabled} className="cursor-pointer justify-start text-left text-xs">{cloneElement(el, { className: `${el.props.className ?? ""} w-full justify-start text-left` })}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Page() {
  const target = Route.useSearch();
  const { active, update, changes, user } = useApp();
  const d = active.data;
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.k === target.tab)?.k ?? "planned");
  usePendingFocus(target.focus, tab);
  const [err, setErr] = useState("");
  const [kinds, setKinds] = useState<Record<string, "" | CategoryKind>>({ planned: "", committed: "" });
  const fKind = kinds[tab] ?? "";
  const setFKind = (v: "" | CategoryKind) => setKinds((k) => ({ ...k, [tab]: v }));
  const plannedReport = useReportState(), committedReport = useReportState(), paymentsReport = useReportState();
  const report = tab === "planned" ? plannedReport : tab === "committed" ? committedReport : paymentsReport;
  const [open, setOpen] = useState<{ kind: string; id: string } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const act = (fn: (x: ScenarioData) => void) => { const e = update(fn); setErr(e ?? ""); return !e; };
  const actAlone = (fn: (x: ScenarioData) => void, what: string) => {
    if (active.isBase && changes.length) { setErr(`Há outras alterações pendentes. Aguarde o salvamento antes de ${what}.`); return false; }
    return act(fn);
  };
  const doPanel = (fn: (x: ScenarioData) => void) => { if (act(fn)) setPanel(null); };
  const sup = (id: string) => d.suppliers.find((s) => s.id === id);
  const catOf = (id: string) => d.categories.find((c) => c.id === id);
  const kindOfCat = (id: string): CategoryKind | "" => catOf(id)?.kind ?? "";
  const kindL = (id: string, fb: CategoryKind = "compra") => ((kindOfCat(id) || fb) === "compra" ? "Compra" : "Despesa");
  const del = (k: "planned" | "committed" | "expenses", id: string) => act((x) => { (x[k] as { id: string }[]) = (x[k] as { id: string }[]).filter((i) => i.id !== id); });
  const isOpen = (kind: string, id: string) => open?.kind === kind && open.id === id;
  const toggle = (kind: string, id: string) => setOpen(isOpen(kind, id) ? null : { kind, id });
  const labels = parcelLabels(d);

  // ---- Planejada: uma linha por parcela ----
  const plannedSource = d.planned.filter((p) => !fKind || (kindOfCat(p.categoryId) || "compra") === fKind).flatMap((p) => {
    const r = distributePlanned(p, sup(p.supplierId), d.committed, d.params.profile, d.effectivations);
    const inst = p.installments?.length && !p.remainingOverride ? p.installments : null;
    const parts = r.parcels.length ? r.parcels : [null];
    return parts.map((pc, i) => ({ p, r, pc, i, n: parts.length, it: inst && pc ? inst[pc.idx ?? i] ?? null : null, idx: pc?.idx ?? i }));
  });
  // ---- Efetivado: títulos (já são parcelas) ----
  const committedSource = [...d.committed.map((c) => ({ t: "committed" as const, c, catId: c.categoryId })), ...d.expenses.map((e) => ({ t: "expense" as const, e, catId: e.categoryId }))]
    .filter((r) => !fKind || kindOfCat(r.catId) === fKind || (!r.catId && fKind === "despesa" && r.t === "expense"));

  const plannedValues = ({ p, r, pc, i, n, it }: (typeof plannedSource)[number]) => [kindL(p.categoryId), catOf(p.categoryId)?.name, (sup(p.supplierId)?.name ?? p.sourceSupplier), p.purchaseCode, p.document, p.notes, pc ? i + 1 : null, pc?.amount, dateValue(it?.date ?? pc?.date), dateValue(it?.extensionDate), p.status === "encerrado" ? "Encerrada" : p.status === "cancelado" ? "Cancelada" : r.effectivated > 0 ? "Efetivada parcialmente" : "Prevista"];
  const plannedRows = queryReport(plannedSource, plannedReport.query, plannedReport.sort, plannedValues, (row) => [...plannedValues(row), ...(sup(row.p.supplierId)?.aliases ?? []), row.pc ? `${row.i + 1}/${row.n}` : "", row.pc ? fmtBRL(row.pc.amount) : "", fmtDate(row.it?.date ?? row.pc?.date ?? null), fmtDate(row.it?.extensionDate ?? null), row.r.health !== "ok" ? "conciliação pendente" : ""]);
  const committedValues = (row: (typeof committedSource)[number]) => {
    const t = row.t === "committed" ? row.c : row.e;
    const ts = titleStatus(t.value, t.status, paymentsFor(d, row.t, t.id));
    const due = row.t === "committed" ? row.c.dueDate : row.e.termDays != null ? addDays(row.e.baseDate, row.e.termDays) : null;
    return [kindL(t.categoryId, row.t === "expense" ? "despesa" : "compra"), catOf(t.categoryId)?.name, (sup(t.supplierId)?.name ?? t.sourceSupplier), row.t === "committed" ? row.c.purchaseCode : null, t.document, t.notes, parcelValue(labels.get(t.id) ?? "1/1"), t.value, dateValue(due), dateValue(t.extensionDate), t.status === "cancelado" ? "Cancelado" : row.t === "committed" && row.c.origin === "efetivacao" ? "Efetivado (previsão)" : row.t === "committed" && row.c.origin === "legado" ? "Efetivado (legado)" : "Efetivado", ts.state === "Parcial" ? "Parcialmente pago" : ts.state, ts.paid, Math.max(0, ts.open)];
  };
  const efetivados = queryReport(committedSource, committedReport.query, committedReport.sort, committedValues, (row) => {
    const t = row.t === "committed" ? row.c : row.e;
    const v = committedValues(row);
    return [...v, ...(sup(t.supplierId)?.aliases ?? []), labels.get(t.id) ?? "1/1", ...[7, 12, 13].map((i) => fmtBRL(Number(v[i]))), ...[8, 9].map((i) => typeof v[i] === "number" ? fmtDate(new Date(v[i]).toISOString().slice(0, 10)) : ""), paymentsFor(d, row.t, t.id).some((p) => p.method === "cartao") ? "Quitado com cartão parte no cartão" : ""];
  });
  const paymentValues = (p: ScenarioData["payments"][number]) => {
    const t = p.titleKind === "committed" ? d.committed.find((c) => c.id === p.titleId) : d.expenses.find((e) => e.id === p.titleId);
    return [dateValue(p.date), `${(sup(t?.supplierId ?? "")?.name ?? t?.sourceSupplier) ?? ""} · ${t?.document || "sem documento"}${labels.get(p.titleId) ? ` · parcela ${labels.get(p.titleId)}` : ""}`, p.method === "cartao" ? "Quitado com cartão" : p.accountId ? accountName(d, p.accountId) : NO_ACCOUNT, p.amount, p.note, p.reversedAt ? `estornado ${fmtDate(p.reversedAt.slice(0, 10))}: ${p.reversalNote}` : "ativo"];
  };
  const paymentRows = queryReport(d.payments, paymentsReport.query, paymentsReport.sort, paymentValues, (p) => {
    const t = p.titleKind === "committed" ? d.committed.find((c) => c.id === p.titleId) : d.expenses.find((e) => e.id === p.titleId);
    return [...paymentValues(p), ...(sup(t?.supplierId ?? "")?.aliases ?? []), t?.notes, t?.categoryId ? catOf(t.categoryId)?.name : "", fmtDate(p.date), fmtBRL(p.amount)];
  });

  const noteInit = (o: { categoryId: string; supplierId: string; purchaseCode?: string; document: string; notes: string }, fb: CategoryKind): NoteFields => ({ kind: kindOfCat(o.categoryId) || fb, categoryId: o.categoryId, supplierId: o.supplierId, purchaseCode: o.purchaseCode ?? "", document: o.document, notes: o.notes });

  return (
    <div>
      <PageHeader title="Lançamentos" sub={active.isBase ? "" : "Simulação: alterações imediatas e apenas visuais."}>
        {(tab === "planned" || tab === "committed") && <button className="btn btn-primary" onClick={() => setPanel({ t: "new" })}>+ Novo lançamento</button>}
      </PageHeader>
      {err && <div className="mb-2 rounded border border-destructive p-2 text-xs text-destructive">{err}</div>}
      <div className="mb-2 flex overflow-x-auto border-b border-border">{TABS.map((t) => <button key={t.k} className={`tab whitespace-nowrap ${tab === t.k ? "tab-on" : ""}`} onClick={() => setTab(t.k)}>{t.l} {t.k === "consultas" ? "" : `(${t.k === "committed" ? d.committed.length + d.expenses.length : (d[t.k] as unknown[]).length})`}</button>)}</div>
      {(tab === "planned" || tab === "committed") && (
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="lbl">Categoria</span>
          <select className="inp" value={fKind} onChange={(e) => setFKind(e.target.value as "" | CategoryKind)}><option value="">Todas</option><option value="compra">Compra</option><option value="despesa">Despesa</option></select>
        </div>
      )}
      {tab !== "consultas" && <div className="mb-2 flex flex-wrap items-end gap-2"><ReportSearch value={report.query} onChange={report.setQuery} count={tab === "planned" ? plannedRows.length : tab === "committed" ? efetivados.length : paymentRows.length} /><Button variant="outline" size="sm" onClick={() => { report.setQuery(""); setFKind(""); }}>Limpar filtros</Button></div>}
      <div hidden={tab !== "consultas"}><Consultas d={d} /></div>
      {tab === "consultas" ? null : <div className="card overflow-auto">
        {tab === "planned" && (
          <table className="tbl"><thead><tr><SortHead label="Categoria" column={0} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Subgrupo" column={1} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Fornecedor" column={2} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Código do pedido" column={3} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Documento" column={4} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Descrição" column={5} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Parcela" column={6} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Valor da parcela" column={7} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={true} /><SortHead label="Vencimento" column={8} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Prorrogar para" column={9} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><SortHead label="Situação do lançamento" column={10} sort={plannedReport.sort} onSort={plannedReport.toggle} numeric={false} /><th>Ações</th></tr></thead>
            <tbody>{plannedRows.flatMap(({ p, r, pc, i, n, it, idx }) => {
              const label = `${(sup(p.supplierId)?.name ?? p.sourceSupplier) ?? "—"} · ${p.document || p.purchaseCode || "sem documento"} · parcela ${i + 1}/${n}`;
              const baseAmt = it?.amount ?? distributePlanned(p, sup(p.supplierId), d.committed, d.params.profile, []).parcels[idx]?.amount ?? 0;
              const effs = d.effectivations.filter((e) => e.plannedId === p.id);
              const sit = p.status === "encerrado" ? "Encerrada" : p.status === "cancelado" ? "Cancelada" : r.effectivated > 0 ? "Efetivada parcialmente" : "Prevista";
              const out = [
                <tr key={p.id + i} id={i === 0 ? `pending-${p.id}` : undefined} tabIndex={-1} className={target.focus === p.id ? "bg-warning-soft" : ""}>
                  <td>{kindL(p.categoryId)}</td><td>{catOf(p.categoryId)?.name ?? "—"}</td><td>{(sup(p.supplierId)?.name ?? p.sourceSupplier) ?? "—"}</td><td>{p.purchaseCode || "—"}</td><td>{p.document || "—"}</td><td className="max-w-48 truncate" title={p.notes}>{p.notes || "—"}</td>
                  <td>{pc ? `${i + 1}/${n}` : "—"}</td><td className="num">{pc ? fmtBRL(pc.amount) : "—"}</td>
                  <td>{pc ? fmtDate(it ? it.date : pc.date) : "—"}</td><td>{it?.extensionDate ? <span className="tag tag-warn">{fmtDate(it.extensionDate)}</span> : "—"}</td>
                  <td><span className={`tag ${r.health === "ok" ? "" : "tag-err"}`}>{sit}{r.health !== "ok" ? " · conciliação pendente" : ""}</span></td>
                  <td><Acoes>
                    {p.status === "ativo" && <button className="btn btn-primary" disabled={r.health !== "ok" || !pc} onClick={() => { const k = currentParcels(d, p.id)[i]?.key; if (k) setPanel({ t: "eff", id: p.id, mode: "parcela", sel: [k] }); }}>Efetivar esta parcela</button>}
                    {p.status === "ativo" && <button className="btn" disabled={r.health !== "ok" || !pc} onClick={() => setPanel({ t: "eff", id: p.id, mode: "documento", sel: [] })}>Efetivar documento</button>}
                    {p.status === "ativo" && pc && <button className="btn" disabled={r.health !== "ok"} onClick={() => setPanel({ t: "eff", id: p.id, mode: "ajustar", sel: [] })}>Ajustar planejamento</button>}
                    {pc && p.status === "ativo" && <button className="btn" onClick={() => setPanel({ t: "parcela", label, amount: baseAmt, date: it ? it.date : pc.date, save: (x, amount, date) => editPlannedParcel(x, p.id, idx, { amount, date }) })}>Editar esta parcela</button>}
                    <button className="btn" onClick={() => setPanel({ t: "nota", init: noteInit(p, "compra"), siblings: n, save: (x, f) => { const t = x.planned.find((y) => y.id === p.id); if (t) Object.assign(t, { categoryId: f.categoryId, supplierId: f.supplierId, purchaseCode: f.purchaseCode, document: f.document, notes: f.notes }); } })}>Editar dados da nota</button>
                    {pc && p.status === "ativo" && <button className="btn" onClick={() => setPanel({ t: "prorrogar", label, current: it?.extensionDate ?? null, original: it ? it.date : pc.date, history: it?.extensionHistory ?? [], save: (x, to, note) => extendPlannedParcel(x, p.id, idx, to, note, now()) })}>Prorrogar parcela</button>}
                    <button className="btn" onClick={() => toggle("tl", p.id + ":" + idx)}>Detalhes ({effs.length})</button>
                    <button className="btn btn-danger" onClick={async () => await askConfirm("Excluir esta previsão (todas as parcelas)?") && del("planned", p.id)}>Excluir nota</button>
                  </Acoes></td>
                </tr>,
              ];
              if (isOpen("tl", p.id + ":" + idx)) out.push(<tr key={p.id + ":" + idx + "-e"}><td colSpan={12} className="bg-muted"><Timeline d={d} p={p} act={actAlone} /></td></tr>);
              return out;
            })}
            {!plannedRows.length && <tr><td colSpan={12} className="text-center text-muted-foreground">Nenhum resultado para os filtros informados</td></tr>}</tbody></table>
        )}
        {tab === "committed" && (
          <table className="tbl"><thead><tr><SortHead label="Categoria" column={0} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Subgrupo" column={1} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Fornecedor" column={2} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Código do pedido" column={3} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Documento" column={4} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Descrição" column={5} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Parcela" column={6} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Valor da parcela" column={7} sort={committedReport.sort} onSort={committedReport.toggle} numeric={true} /><SortHead label="Vencimento" column={8} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Prorrogar para" column={9} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Situação do lançamento" column={10} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Situação do pagamento" column={11} sort={committedReport.sort} onSort={committedReport.toggle} numeric={false} /><SortHead label="Pago" column={12} sort={committedReport.sort} onSort={committedReport.toggle} numeric={true} /><SortHead label="Saldo em aberto" column={13} sort={committedReport.sort} onSort={committedReport.toggle} numeric={true} /><th>Ações</th></tr></thead>
            <tbody>{efetivados.flatMap((r) => {
              if (r.t === "committed") {
                const c = r.c;
                const ts = titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id));
                const lb = labels.get(c.id) ?? "1/1";
                const label = `${(sup(c.supplierId)?.name ?? c.sourceSupplier) ?? "—"} · ${c.document || "sem documento"} · parcela ${lb}`;
                const sibs = c.noteId ? d.committed.filter((x) => x.noteId === c.noteId).length : 1;
                const pl = c.plannedId ? d.planned.find((p) => p.id === c.plannedId) : null;
                return [
                  <tr key={c.id} id={`pending-${c.id}`} tabIndex={-1} className={target.focus === c.id ? "bg-warning-soft" : ""}>
                    <td>{kindL(c.categoryId)}</td><td>{catOf(c.categoryId)?.name ?? "—"}</td><td>{(sup(c.supplierId)?.name ?? c.sourceSupplier) ?? "—"}</td><td>{c.purchaseCode || "—"}</td><td>{c.document || "—"}</td><td className="max-w-48 truncate" title={c.notes}>{c.notes || "—"}</td>
                    <td>{lb}</td><td className="num">{fmtBRL(c.value)}</td><td>{fmtDate(c.dueDate)}</td><td>{c.extensionDate ? <span className="tag tag-warn">{fmtDate(c.extensionDate)}</span> : "—"}</td>
                    <td>{c.status === "cancelado" ? "Cancelado" : c.origin === "efetivacao" ? "Efetivado (previsão)" : c.origin === "legado" ? "Efetivado (legado)" : "Efetivado"}</td>
                    <td><span className={`tag ${ts.state === "Pago" ? "tag-ok" : ts.state === "Parcial" ? "tag-warn" : ""}`}>{ts.state === "Parcial" ? "Parcialmente pago" : ts.state}</span>{ts.payments.some((p) => p.method === "cartao") && <span className="tag tag-ok ml-1">{ts.payments.every((p) => p.method === "cartao") && ts.open <= 0 ? "Quitado com cartão" : "parte no cartão"}</span>}</td>
                    <td className="num">{fmtBRL(ts.paid)}</td><td className="num">{fmtBRL(Math.max(0, ts.open))}</td>
                    <td><Acoes>
                      {c.status === "ativo" && ts.open > 0 && <button className="btn btn-primary" disabled={!active.isBase} title={active.isBase ? "" : "Simulação não registra pagamentos"} onClick={() => setPanel({ t: "pay", kind: "committed", id: c.id, label })}>Registrar pagamento</button>}
                      <button className="btn" onClick={() => setPanel({ t: "parcela", label, amount: c.value, date: c.dueDate, save: (x, amount, date) => { const t = x.committed.find((y) => y.id === c.id); if (t) Object.assign(t, { value: amount, dueDate: date }); } })}>Editar esta parcela</button>
                      <button className="btn" onClick={() => setPanel({ t: "nota", init: noteInit(c, "compra"), siblings: sibs, save: (x, f) => editCommittedNote(x, c.id, { categoryId: f.categoryId, supplierId: f.supplierId, purchaseCode: f.purchaseCode, document: f.document, notes: f.notes }) })}>Editar dados da nota</button>
                      <button className="btn" onClick={() => setPanel({ t: "prorrogar", label, current: c.extensionDate, original: c.dueDate, history: c.extensionHistory, save: (x, to, note) => confirmExtension(x, "committed", c.id, to, note, now()) })}>Prorrogar parcela</button>
                      <button className="btn" onClick={() => toggle("det", c.id)}>Detalhes</button>
                      {c.status === "ativo" ? <button className="btn" onClick={async () => await askConfirm(`A parcela ${label} será cancelada. Pagamentos e histórico não serão desfeitos.`, { title: "Cancelar parcela?", action: "Cancelar parcela", destructive: true }) && act((x) => { const t = x.committed.find((y) => y.id === c.id); if (t) t.status = "cancelado"; })}>Cancelar parcela</button> : <button className="btn" onClick={async () => await askConfirm(`A parcela ${label} voltará a compor o fluxo. Pagamentos anteriores serão preservados.`, { title: "Reativar parcela?", action: "Reativar parcela" }) && act((x) => { const t = x.committed.find((y) => y.id === c.id); if (t) t.status = "ativo"; })}>Reativar parcela</button>}
                      <button className="btn btn-danger" onClick={async () => await askConfirm("Excluir esta parcela?") && del("committed", c.id)}>Excluir parcela</button>
                    </Acoes></td>
                  </tr>,
                  isOpen("det", c.id) && <tr key={c.id + "-d"}><td colSpan={15} className="bg-muted">
                    <div className="flex flex-wrap items-end gap-3 p-1 text-xs">
                      <span>Origem: <b>{c.origin === "efetivacao" ? `efetivação da previsão ${pl?.purchaseCode || pl?.document || ""}` : c.origin === "legado" ? "legado (vínculo por código + M)" : "manual"}</b></span>
                      {c.origin === "efetivacao" ? <span className="text-muted-foreground">Base abat. legado (M): não se aplica (vínculo explícito)</span> : <label>Base abat. legado (M)<br /><MoneyInput value={c.legacyAbatement} onChange={(v) => act((x) => { const t = x.committed.find((y) => y.id === c.id); if (t) { t.legacyAbatement = v; if (v !== null) t.origin = "legado"; } })} /></label>}
                      {c.extensionInfo && <span className="text-muted-foreground">Campo K (informativo): {c.extensionInfo}</span>}
                    </div>
                    <div className="lbl mb-1 mt-2">Baixas da parcela</div><BaixasList d={d} kind="committed" titleId={c.id} canReverse={active.isBase} onReverse={(id, n) => act((x) => reversePayment(x, id, n, now()))} />
                  </td></tr>,
                ];
              }
              const e = r.e;
              const orig = e.termDays != null ? addDays(e.baseDate, e.termDays) : null;
              const ts = titleStatus(e.value, e.status, paymentsFor(d, "expense", e.id));
              const label = `${(sup(e.supplierId)?.name ?? e.sourceSupplier) ?? "—"} · ${e.document || "sem documento"}`;
              return [
                <tr key={e.id} id={`pending-${e.id}`} tabIndex={-1} className={target.focus === e.id ? "bg-warning-soft" : ""}>
                  <td>{kindL(e.categoryId, "despesa")}</td><td>{catOf(e.categoryId)?.name ?? "—"}</td><td>{(sup(e.supplierId)?.name ?? e.sourceSupplier) ?? "—"}</td><td>—</td><td>{e.document || "—"}</td><td className="max-w-48 truncate" title={e.notes}>{e.notes || "—"}</td>
                  <td>1/1</td><td className="num">{fmtBRL(e.value)}</td><td>{orig ? fmtDate(orig) : <span className="tag tag-warn">não distribuída</span>}</td><td>{e.extensionDate ? <span className="tag tag-warn">{fmtDate(e.extensionDate)}</span> : "—"}</td>
                  <td>{e.status === "cancelado" ? "Cancelado" : "Efetivado"}</td>
                  <td><span className={`tag ${ts.state === "Pago" ? "tag-ok" : ts.state === "Parcial" ? "tag-warn" : ""}`}>{ts.state === "Parcial" ? "Parcialmente pago" : ts.state}</span>{ts.payments.some((p) => p.method === "cartao") && <span className="tag tag-ok ml-1">{ts.payments.every((p) => p.method === "cartao") && ts.open <= 0 ? "Quitado com cartão" : "parte no cartão"}</span>}</td>
                  <td className="num">{fmtBRL(ts.paid)}</td><td className="num">{fmtBRL(Math.max(0, ts.open))}</td>
                  <td><Acoes>
                    {e.status === "ativo" && ts.open > 0 && expenseDate(e) && <button className="btn btn-primary" disabled={!active.isBase} onClick={() => setPanel({ t: "pay", kind: "expense", id: e.id, label })}>Registrar pagamento</button>}
                    <button className="btn" onClick={() => setPanel({ t: "parcela", label, amount: e.value, date: orig ?? e.baseDate, save: (x, amount, date) => { const t = x.expenses.find((y) => y.id === e.id); if (t) Object.assign(t, { value: amount, termDays: daysBetween(t.baseDate, date) }); } })}>Editar esta parcela</button>
                    <button className="btn" onClick={() => setPanel({ t: "nota", init: noteInit(e, "despesa"), siblings: 1, save: (x, f) => { const t = x.expenses.find((y) => y.id === e.id); if (t) Object.assign(t, { categoryId: f.categoryId, supplierId: f.supplierId, document: f.document, notes: f.notes }); } })}>Editar dados da nota</button>
                    <button className="btn" onClick={() => setPanel({ t: "prorrogar", label, current: e.extensionDate, original: orig, history: e.extensionHistory, save: (x, to, note) => confirmExtension(x, "expense", e.id, to, note, now()) })}>Prorrogar parcela</button>
                    <button className="btn" onClick={() => toggle("det", e.id)}>Detalhes e baixas</button>
                    <button className="btn btn-danger" onClick={async () => await askConfirm("Excluir esta parcela?") && del("expenses", e.id)}>Excluir parcela</button>
                  </Acoes></td>
                </tr>,
                isOpen("det", e.id) && <tr key={e.id + "-d"}><td colSpan={15} className="bg-muted p-2"><div className="lbl mb-1">Baixas da parcela</div><BaixasList d={d} kind="expense" titleId={e.id} canReverse={active.isBase} onReverse={(id, n) => act((x) => reversePayment(x, id, n, now()))} />{e.cardId && <p className="mt-1">Compra no cartão — paga pela fatura{e.invoiceId ? "" : " (fatura ainda não fechada)"}.</p>}</td></tr>,
              ];
            })}
            {!efetivados.length && <tr><td colSpan={15} className="text-center text-muted-foreground">Nenhum resultado para os filtros informados</td></tr>}</tbody></table>
        )}
        {tab === "payments" && (
          <table className="tbl"><thead><tr><SortHead label="Data" column={0} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Título" column={1} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Conta" column={2} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Valor" column={3} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={true} /><SortHead label="Obs." column={4} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Situação" column={5} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><th>Ações</th></tr></thead>
            <tbody>{paymentRows.map((p) => {
              const t = p.titleKind === "committed" ? d.committed.find((c) => c.id === p.titleId) : d.expenses.find((e) => e.id === p.titleId);
              return <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{(sup(t?.supplierId ?? "")?.name ?? t?.sourceSupplier)} · {t?.document || "sem documento"}{p.titleKind === "committed" && labels.get(p.titleId) ? ` · parcela ${labels.get(p.titleId)}` : ""}</td><td>{p.method === "cartao" ? <span className="tag tag-ok">Quitado com cartão</span> : p.accountId ? accountName(d, p.accountId) : <span className="tag tag-warn">{NO_ACCOUNT}</span>}</td><td className="num">{fmtBRL(p.amount)}</td><td>{p.note}</td>
                <td>{p.reversedAt ? <span className="tag tag-err">estornado {fmtDate(p.reversedAt.slice(0, 10))}: {p.reversalNote}</span> : <span className="tag tag-ok">ativo</span>}</td>
                <td>{!p.reversedAt && p.method !== "cartao" && <button className="btn" disabled={!active.isBase} onClick={async () => { const n = await askText("Motivo do estorno (auditado):"); if (n) act((x) => reversePayment(x, p.id, n, now())); }}>Estornar</button>}</td></tr>;
            })}{!paymentRows.length && <tr><td colSpan={7} className="text-center text-muted-foreground">Nenhum resultado para os filtros informados</td></tr>}</tbody></table>
        )}
      </div>}
      <p className="mt-2 text-[11px] text-muted-foreground">Registrar pagamento é o registro de uma baixa já realizada (Pix, TED, DOC ou Boleto) — não executa transferência bancária. Boleto pago com cartão não debita conta: passa para a fatura.</p>

      {panel?.t === "pay" && <PagamentoPanel d={d} kind={panel.kind} titleId={panel.id} label={panel.label} onCancel={() => setPanel(null)} onConfirm={(r) => { const ok = act((x) => r.origin === "conta" ? registerPaymentBatch(x, { batchId: uid(), titleKind: panel.kind, titleId: panel.id, lines: r.lines, note: r.note, form: r.form }) : coverTitleWithCard(x, { id: uid(), at: now(), by: user?.email ?? "", titleKind: panel.kind, titleId: panel.id, cardId: r.cardId, date: r.date, amount: r.amount, fee: r.fee, installments: r.installments, form: "boleto" })); if (ok) setPanel(null); return ok; }} />}
      {panel?.t === "new" && <NovaNota d={d} isBase={active.isBase} onCancel={() => setPanel(null)} onConfirm={(n, sv) => { const ok = act((x) => { if (sv) saveSupplierCondition(x, n.supplierId, sv.terms, now(), sv.name, user?.email ?? ""); applyNote(x, n, { id: uid, at: now() }); }); if (ok) setPanel(null); return ok; }} />}
      {panel?.t === "parcela" && <ParcelaPanel label={panel.label} amount={panel.amount} date={panel.date} onCancel={() => setPanel(null)} onSave={(a, dt) => doPanel((x) => panel.save(x, a, dt))} />}
      {panel?.t === "nota" && <DadosNotaPanel d={d} init={panel.init} siblings={panel.siblings} onCancel={() => setPanel(null)} onSave={(f) => doPanel((x) => panel.save(x, f))} />}
      {panel?.t === "prorrogar" && <ProrrogarPanel label={panel.label} current={panel.current} original={panel.original} history={panel.history} isBase={active.isBase} onCancel={() => setPanel(null)} onSave={(to, note) => doPanel((x) => panel.save(x, to, note))} />}
      {panel?.t === "eff" && (() => { const p = d.planned.find((x) => x.id === panel.id); return p ? <EfetivarPanel key={panel.mode + panel.sel.join()} data={d} planned={p} mode={panel.mode} preselect={panel.sel} onCancel={() => setPanel(null)} onDone={(fn) => { if (actAlone(fn, panel.mode === "ajustar" ? "o ajuste" : "a efetivação")) setPanel(null); }} /> : null; })()}
    </div>
  );
}

/** Efetivação com edição manual (protótipo aprovado): parcelas selecionadas → Efetivado; demais continuam em Planejada,
 *  editáveis livremente. Sugestões só ao clicar "Aplicar sugestão". mode "ajustar" = só replanejar, sem efetivar. */
function EfetivarPanel({ data, planned, mode, preselect, onDone, onCancel }: { data: ScenarioData; planned: Planned; mode: "parcela" | "documento" | "ajustar"; preselect: string[]; onDone: (fn: (x: ScenarioData) => void) => void; onCancel: () => void }) {
  const [id] = useState(() => "ef" + uid()); // idempotência por abertura
  const parcels = currentParcels(data, planned.id);
  const sup = data.suppliers.find((s) => s.id === planned.supplierId);
  const cat = data.categories.find((c) => c.id === planned.categoryId);
  const [sel, setSel] = useState<string[]>(preselect);
  const init = initDraft(parcels, preselect);
  const [eff, setEff] = useState<EffLine[]>(init.eff);
  const [rest, setRest] = useState<RestLine[]>(init.rest);
  const selTotal = parcels.filter((p) => sel.includes(p.key)).reduce((a, p) => a + p.amount, 0);
  const [subst, setSubst] = useState<number | null>(selTotal);
  const [effDate, setEffDate] = useState<string | null>(todaySP());
  const [doc, setDoc] = useState(planned.document);
  const [code, setCode] = useState(planned.purchaseCode);
  const [custom, setCustom] = useState(false);
  const [rule, setRule] = useState("Valores previstos atuais mantidos");
  const [sug, setSug] = useState<Suggestion>("manter");
  const [review, setReview] = useState(false);
  const [sent, setSent] = useState(false);
  const [touched, setTouched] = useState(false);
  const t = draftTotals(eff, rest, parcels);
  const errs = mode === "ajustar" ? validateDraft([], rest, 0, 0, todaySP()).concat(rest.length ? [] : ["Mantenha ao menos uma parcela ou use Encerrar restante."])
    : [...(sel.length ? [] : ["Selecione ao menos uma parcela planejada."]), ...(eff.length ? [] : ["Inclua ao menos uma linha efetivada."]), ...validateDraft(eff, rest, subst, selTotal, effDate)];
  const dirty = touched;
  const edit = (fn: () => void) => { fn(); setTouched(true); };
  const editRest = (fn: (r: RestLine[]) => RestLine[]) => edit(() => { setRest(fn); setCustom(true); setRule("Valores personalizados (edição manual)"); });
  const changeSel = async (key: string) => {
    if (custom && !(await askConfirm("Alterar a seleção recarrega as parcelas a partir da previsão atual e descarta os valores personalizados.", { title: "Alterar parcelas selecionadas?", action: "Alterar seleção", destructive: true }))) return;
    const next = sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key];
    const dr = initDraft(parcels, next);
    edit(() => { setSel(next); setEff(dr.eff); setRest(dr.rest); setSubst(parcels.filter((p) => next.includes(p.key)).reduce((a, p) => a + p.amount, 0)); setCustom(false); setRule("Valores previstos atuais mantidos"); });
  };
  const SUG: Record<Suggestion, string> = { manter: "Manter valores previstos das restantes", igualar: "Igualar restantes ao valor efetivado", diferenca: "Aplicar a diferença também às restantes", total: "Manter o total original" };
  const applySug = async () => {
    if (custom && !(await askConfirm("A sugestão substituirá os valores personalizados das parcelas que continuam em Planejada. As datas serão preservadas.", { title: "Aplicar sugestão?", action: "Substituir valores", destructive: true }))) return;
    try {
      const next = applySuggestion(sug, rest, { parcels, selected: sel, substituted: subst ?? 0, effTotal: t.effTotal });
      edit(() => { setRest(next); setCustom(false); setRule(`${SUG[sug]}${rest.length !== parcels.length - sel.length ? ` (base: ${rest.length} parcela(s) atuais na tabela, quantidade alterada manualmente)` : ""}`); });
    } catch (e) { setTouched(true); void askConfirm((e as Error).message, { title: "Sugestão indisponível", action: "Entendi", notice: true }); }
  };
  const reparcel = async (c: { name: string; terms: (number | null)[] }) => {
    const days = c.terms.filter((x): x is number => x !== null);
    if (!days.length || !t.effTotal) return;
    if (touched && !(await askConfirm("Reparcelar pela condição substitui as linhas efetivadas e seus ajustes manuais.", { title: "Reparcelar efetivação?", action: "Reparcelar", destructive: true }))) return;
    const { parts } = splitCents(t.effTotal, days.length);
    edit(() => setEff(days.map((d, i) => ({ amount: parts[i]!, date: addDays(effDate ?? planned.baseDate, d) }))));
  };
  const diff = diffParcels(parcels, sel, rest);
  const pName = (k: string) => `${parcels.findIndex((p) => p.key === k) + 1}/${parcels.length}`;
  const confirm = () => {
    setSent(true);
    const clean = rest.map((r) => ({ id: r.id, amount: r.amount!, date: r.date! }));
    onDone(mode === "ajustar" ? (x) => adjustPlanned(x, planned.id, clean)
      : (x) => effectivateManual(x, { id, plannedId: planned.id, at: new Date().toISOString(), effectiveDate: effDate!, document: doc, purchaseCode: code, selected: sel, eff: eff.map((e) => ({ amount: e.amount!, date: e.date! })), rest: clean, substituted: subst ?? 0, rule }));
  };
  const title = mode === "ajustar" ? "Ajustar planejamento" : mode === "parcela" ? "Efetivar esta parcela" : "Efetivar documento";
  const footer = review
    ? <><button className="btn" onClick={() => setReview(false)}>Voltar</button><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={sent} onClick={confirm}>{mode === "ajustar" ? "Confirmar ajuste" : "Confirmar efetivação"}</button></>
    : <><button className="btn" onClick={guardClose(dirty, onCancel)}>Cancelar</button><button className="btn btn-primary" disabled={errs.length > 0} title={errs.join(" ")} onClick={() => setReview(true)}>Revisar alterações</button></>;
  const KIND: Record<string, string> = { efetivada: "Passa para Efetivado", mantida: "Sem alteração", alterada: "Alterada", removida: "Removida", adicionada: "Adicionada" };
  return (
    <SidePanel centered={review} wide title={review ? `Revisar — ${title.toLowerCase()}` : title} sub={`${sup?.name ?? "—"} · ${planned.purchaseCode || planned.document || "sem código"}${mode === "ajustar" ? "" : " — efetivar não registra pagamento"}`} onClose={onCancel} dirty={dirty} footer={footer}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-muted px-3 py-2 md:grid-cols-4">
        {[["Fornecedor", sup?.name ?? "—"], ["Categoria", `${cat?.kind === "despesa" ? "Despesa" : "Compra"} · ${cat?.name ?? "—"}`], ["Planejado atual", fmtBRL(t.before)], ["Parcelas planejadas", String(parcels.length)]].map(([k, v]) => <div key={k}><div className="lbl">{k}</div><div className="font-medium">{v}</div></div>)}
      </div>
      {!review ? <>
        {mode !== "ajustar" && <Section n={1} title="Dados da efetivação">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field l="Data da efetivação"><DateInput value={effDate} onChange={(v) => edit(() => setEffDate(v))} /></Field>
            <Field l="Documento"><input className="inp h-8 w-full" value={doc} onChange={(e) => edit(() => setDoc(e.target.value))} /></Field>
            <Field l="Código do pedido"><input className="inp h-8 w-full" value={code} onChange={(e) => edit(() => setCode(e.target.value))} /></Field>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Data em que o negócio foi efetivado — diferente do vencimento e do registro no histórico.</p>
          {mode === "documento" && <div className="mt-2"><div className="lbl mb-1">Parcelas ainda planejadas a efetivar</div><div className="flex flex-wrap gap-1">{parcels.map((p, i) => <label key={p.key} className={`flex items-center gap-1 rounded border px-2 py-1 ${sel.includes(p.key) ? "border-primary bg-primary/10" : "border-border"}`}><input type="checkbox" checked={sel.includes(p.key)} onChange={() => void changeSel(p.key)} />{i + 1}/{parcels.length} · {fmtBRL(p.amount)} · {fmtDate(p.date)}</label>)}</div></div>}
        </Section>}
        {mode !== "ajustar" && <Section n={2} title="O que passará para Efetivado">
          <table className="tbl w-auto"><thead><tr><th>#</th><th className="num">Valor</th><th>Vencimento</th><th /></tr></thead><tbody>
            {eff.map((l, n) => <tr key={n}><td>{n + 1}</td><td className="num"><MoneyInput value={l.amount} onChange={(v) => edit(() => setEff(eff.map((x, k) => k === n ? { ...x, amount: v } : x)))} /></td><td><DateInput value={l.date} onChange={(v) => edit(() => setEff(eff.map((x, k) => k === n ? { ...x, date: v } : x)))} /></td><td><button className="btn" disabled={eff.length < 2} onClick={() => edit(() => setEff(eff.filter((_, k) => k !== n)))}>Remover</button></td></tr>)}
          </tbody></table>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <button className="btn" onClick={() => edit(() => setEff([...eff, { amount: null, date: null }]))}>Adicionar linha</button>
            <Field l={`Previsão substituída (selecionadas: ${fmtBRL(selTotal)})`}><MoneyInput className="h-8" value={subst} onChange={(v) => edit(() => setSubst(v))} /></Field>
            {subst !== null && subst < selTotal && <button className="btn" onClick={() => editRest((r) => [...r, { id: `${id}-saldo-${r.length}`, amount: selTotal - subst, date: parcels.filter((p) => sel.includes(p.key)).at(-1)?.date ?? null, origin: null }])}>Manter saldo não substituído ({fmtBRL(selTotal - subst)}) em Planejada</button>}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Substituir integralmente a previsão por um valor menor não deixa saldo automático. Para manter saldo, use o botão acima (parcial explícito).</p>
          <details className="mt-2"><summary className="cursor-pointer text-xs">Alterar condição / reparcelar (opcional)</summary>
            <div className="mt-2"><ConditionPicker d={data} supplierId={planned.supplierId} baseDate={effDate} hint="Gera as linhas efetivadas pela condição escolhida, sobre o total efetivado." disabled={!t.effTotal} disabledHint="Informe valores" onConfirm={(c) => void reparcel(c)} /></div>
          </details>
        </Section>}
        <Section n={mode === "ajustar" ? 1 : 3} title="O que continuará em Planejada">
          <div className="mb-2 flex flex-wrap items-end gap-2">
            {custom && <span className="tag tag-warn">Valores personalizados</span>}
            {mode !== "ajustar" && <><select className="inp" value={sug} onChange={(e) => setSug(e.target.value as Suggestion)}>{(Object.keys(SUG) as Suggestion[]).filter((k) => k !== "igualar" || sel.length === 1).map((k) => <option key={k} value={k}>{SUG[k]}</option>)}</select>
              <button className="btn" disabled={!rest.length} onClick={() => void applySug()}>Aplicar sugestão</button></>}
          </div>
          {mode !== "ajustar" && sug === "diferenca" && <p className="mb-1 text-[11px] text-muted-foreground">Redução adicional de {fmtBRL(Math.max(0, (subst ?? 0) - t.effTotal))} nas restantes, além da redução da parcela efetivada.</p>}
          <table className="tbl w-auto"><thead><tr><th>Parcela</th><th className="num">Valor</th><th>Vencimento</th><th /></tr></thead><tbody>
            {rest.map((l, n) => <tr key={l.id}><td>{l.origin ? pName(l.origin) : "nova"}</td><td className="num"><MoneyInput value={l.amount} onChange={(v) => editRest((r) => r.map((x, k) => k === n ? { ...x, amount: v } : x))} /></td><td><DateInput value={l.date} onChange={(v) => editRest((r) => r.map((x, k) => k === n ? { ...x, date: v } : x))} /></td><td><button className="btn" onClick={() => editRest((r) => r.filter((_, k) => k !== n))}>Remover</button></td></tr>)}
            {!rest.length && <tr><td colSpan={4} className="text-muted-foreground">Nenhuma parcela continuará planejada{mode === "ajustar" ? "" : " — a previsão será encerrada"}.</td></tr>}
          </tbody></table>
          <button className="btn mt-2" onClick={() => editRest((r) => [...r, { id: `${id}-n${r.length}-${uid()}`, amount: null, date: null, origin: null }])}>Adicionar parcela planejada</button>
        </Section>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border p-2">
          {[["Efetivado", t.effTotal], ["Planejado restante", t.restTotal], ["Total após alteração", t.after]].map(([k, v]) => <div key={k as string}><div className="lbl">{k}</div><div className="num font-semibold">{fmtBRL(v as number)}</div></div>)}
        </div>
        {touched && errs.length > 0 && <ul className="mt-2 list-disc pl-5 text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      </> : <div className="space-y-3">
        <div className="overflow-x-auto"><table className="tbl w-full"><thead><tr><th>Parcela</th><th>Situação</th><th className="num">Antes</th><th>Venc. antes</th><th className="num">Depois</th><th>Venc. depois</th></tr></thead><tbody>
          {diff.map((r, i) => <tr key={i} className={r.kind === "mantida" ? "" : "font-medium"}><td>{r.before ? pName(r.before.key) : "nova"}</td><td>{KIND[r.kind]}</td><td className="num">{r.before ? fmtBRL(r.before.amount) : "—"}</td><td>{r.before ? fmtDate(r.before.date) : "—"}</td><td className="num">{r.after ? fmtBRL(r.after.amount) : "—"}</td><td>{r.after?.date ? fmtDate(r.after.date) : "—"}</td></tr>)}
        </tbody></table></div>
        {mode !== "ajustar" && <table className="tbl w-auto"><thead><tr><th colSpan={2}>Novos compromissos em Efetivado</th></tr></thead><tbody>{eff.map((l, n) => <tr key={n}><td>{n + 1}. vencimento {l.date ? fmtDate(l.date) : "—"}</td><td className="num">{fmtBRL(l.amount ?? 0)}</td></tr>)}</tbody></table>}
        <table className="tbl w-auto"><tbody>
          {mode !== "ajustar" && <><tr><td className="lbl">Data da efetivação</td><td>{effDate ? fmtDate(effDate) : "—"}</td></tr><tr><td className="lbl">Documento / código</td><td>{doc || "—"} / {code || "—"}</td></tr><tr><td className="lbl">Previsão substituída</td><td className="num">{fmtBRL(subst ?? 0)}</td></tr><tr><td className="lbl">Efetivado</td><td className="num">{fmtBRL(t.effTotal)}</td></tr></>}
          <tr><td className="lbl">Total planejado antes</td><td className="num">{fmtBRL(t.before)}</td></tr>
          <tr><td className="lbl">Planejado restante depois</td><td className="num">{fmtBRL(t.restTotal)}</td></tr>
          <tr><td className="lbl">Total após alteração</td><td className="num">{fmtBRL(t.after)}</td></tr>
          <tr><td className="lbl">Regra</td><td>{rule}</td></tr>
        </tbody></table>
        <p className="text-muted-foreground">A previsão original, parcelas já efetivadas, pagamentos e histórico são preservados. Efetivar não registra pagamento.</p>
      </div>}
    </SidePanel>
  );
}

function Timeline({ d, p, act }: { d: ScenarioData; p: Planned; act: (fn: (x: ScenarioData) => void, what: string) => boolean }) {
  const s = plannedSummary(d, p.id);
  const [link, setLink] = useState("");
  const at = () => new Date().toISOString();
  const K = ({ l, v, neg }: { l: string; v: number; neg?: boolean }) => <div><div className="lbl">{l}</div><div className={`num font-semibold ${neg ? "neg" : ""}`}>{fmtBRL(v)}</div></div>;
  return (
    <div className="space-y-2 p-1 text-xs">
      <div className="grid grid-cols-3 gap-2 md:grid-cols-7">
        <K l="Original (histórico)" v={s.original} /><K l="Efetivado" v={s.effectivated} /><K l="Abatido legado (M)" v={s.legacyAbated} />
        <K l="Restante previsto" v={s.remaining} neg={s.remaining < 0} /><K l="Pago" v={s.paid} /><K l="Aberto" v={s.open} />
        <div><div className="lbl">Situação</div><span className={`tag ${s.health === "ok" ? "tag-ok" : "tag-err"}`}>{s.status} · {s.health === "ok" ? "conciliado" : "conciliação pendente"}</span></div>
      </div>
      <p className="text-[11px] text-muted-foreground">Original + efetivações não somam de novo: fluxo = efetivados (títulos) + restante previsto. Conferência: efetivado {fmtBRL(s.effectivated)} + legado {fmtBRL(s.legacyAbated)} + restante {fmtBRL(s.remaining)} = {fmtBRL(s.effectivated + s.legacyAbated + s.remaining)}{s.status === "ativo" && !p.remainingOverride && s.effectivated + s.legacyAbated + s.remaining !== s.original ? " ⚠ diverge do original" : ""}.</p>
      <DetailReport rows={[
        ...s.timeline.flatMap(({ e, titles }) => titles.map((t) => ({ key: e.id + t.c.id, event: `Efetivação ${e.linkedLegacy ? "(título legado vinculado)" : e.kind}${e.manual ? ` · previsão substituída ${fmtBRL(e.substituted ?? 0)} · planejado ${fmtBRL(e.manual.before.reduce((a, x) => a + x.amount, 0))} → ${fmtBRL(e.manual.after.reduce((a, x) => a + x.amount, 0))} (${e.manual.before.length} → ${e.manual.after.length} parcelas) · ${e.manual.rule}` : ""}`, date: e.manual?.effectiveDate ?? e.at.slice(0, 10), title: t.c.document, due: committedDate(t.c), value: t.c.value, paid: t.paid, open: Math.max(0, t.open), state: e.reversedAt ? `revertida: ${e.reversalNote}` : t.state, action: titles[0] === t && !e.reversedAt ? <button className="btn" onClick={async () => { const n = await askText("Motivo da reversão (auditado):"); if (n) act((x) => reverseEffectivation(x, e.id, n, at()), "a reversão"); }}>Reverter</button> : null }))),
        ...s.legacy.map((t) => ({ key: t.c.id, event: "Título legado distinto (M)", date: null, title: t.c.document, due: committedDate(t.c), value: t.c.value, paid: t.paid, open: Math.max(0, t.open), state: t.c.legacyAbatement === null ? "M ausente" : `M ${fmtBRL(t.c.legacyAbatement)}`, action: null })),
        ...s.remainingDates.map((dt, i) => ({ key: "r" + i, event: "Restante previsto", date: null, title: "previsão", due: dt, value: i === 0 ? s.remaining : null, paid: null, open: null, state: `${s.remainingDates.length} data(s)`, action: null })),
      ]} head={["Evento", "Data", "Título", "Vencimento", "Valor", "Pago", "Aberto", "Situação"]} rowKey={(r) => r.key}
        values={(r) => [r.event, dateValue(r.date), r.title, dateValue(r.due), r.value, r.paid, r.open, r.state]}
        cells={(r) => [r.event, fmtDate(r.date), r.title, fmtDate(r.due), r.value == null ? "—" : fmtBRL(r.value), r.paid == null ? "—" : fmtBRL(r.paid), r.open == null ? "—" : fmtBRL(r.open), r.state]} actions={(r) => r.action} />
      {p.status === "ativo" ? <div className="flex flex-wrap items-end gap-3">
        <button className="btn btn-danger" onClick={async () => { const n = await askText("Motivo do encerramento do restante previsto:"); if (n) act((x) => closePlanned(x, p.id, n), "o encerramento"); }}>Encerrar restante</button>
        {s.legacy.length > 0 && <span>Mesmo título que uma efetivação? <select className="inp" value={link} onChange={(e) => setLink(e.target.value)}><option value="">— título legado —</option>{s.legacy.map((t) => <option key={t.c.id} value={t.c.id}>{t.c.document} · {fmtBRL(t.c.value)}</option>)}</select> <button className="btn" disabled={!link} onClick={() => act((x) => linkLegacyTitle(x, { id: "lk" + uid(), plannedId: p.id, committedId: link, at: at() }), "o vínculo do título legado")}>Vincular (sem duplicar)</button></span>}
      </div> : p.status === "encerrado" && <button className="btn" onClick={async () => { const n = await askText("Motivo da reabertura:"); if (n) act((x) => reopenPlanned(x, p.id, n), "a reabertura"); }}>Reabrir previsão</button>}
    </div>
  );
}
