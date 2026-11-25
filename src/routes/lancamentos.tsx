import { UnifiedLaunchList } from "@/components/UnifiedLaunchList";
import { LaunchSummaryChips } from "@/components/LaunchSummaryChips";
import { launchLocation } from "@/lib/unifiedLaunch";
import type { LaunchTotals } from "@/lib/unifiedLaunch";
import { applyNewLaunch } from "@/lib/newLaunch";
import { useOperationSave } from "@/components/useOperationSave";
import { LaunchFilterPanel, useLaunchFilters } from "@/components/LaunchFilters";
import { filterLaunchRows, formatLaunchTime } from "@/lib/launchFilters";
import { reportCSV } from "@/lib/reportTable";
import { ManageLaunchPanel } from "@/components/ManageLaunchPanel";
import { BulkEditPanel } from "@/components/BulkEditPanel";
import { createLaunchPresentation } from "@/lib/launchPresentation";
import type { LaunchRef } from "@/lib/manageLaunch";
import { supplierIdentity } from "@/lib/supplierIdentity";
import { ColumnFilter, columnTest, DetailReport, Pager, ReportSearch, SortHead, suggestFrom, useColumnFilter, usePager, useReportState, type FilterCol } from "@/components/ReportControls";
import { dateValue, queryIndexedReport } from "@/lib/reportTable";
import { Button } from "@/components/ui/button";
import { askConfirm, askText } from "@/lib/decisions";
import { BaixasList, PagamentoPanel } from "@/components/BancoPanels";
import { accountName, NO_ACCOUNT, registerPaymentBatch, coverTitleWithCard } from "@/lib/engine/banco";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Children, cloneElement, isValidElement, useMemo, useRef, memo, useState, useEffect, type ReactElement, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateInput, MoneyInput, PageHeader } from "@/components/kit";
import { ConditionPicker, DadosNotaPanel, Field, guardClose, NovaNota, ParcelaPanel, ProrrogarPanel, Section, SidePanel, type NoteFields } from "@/components/NotaPanel";
import { editCommittedNote, editPlannedParcel, extendPlannedParcel, parcelLabels, saveSupplierCondition } from "@/lib/notas";
import { committedDate, distributePlanned, expenseDate, paymentsFor, splitCents, titleStatus } from "@/lib/engine/engine";
import { closePlanned, confirmExtension, linkLegacyTitle, plannedSummary, reopenPlanned, reverseEffectivation, reversePayment, todaySP } from "@/lib/engine/actions";
import type { CategoryKind, EditLog, ExtensionEvent, Planned, ScenarioData } from "@/lib/engine/types";
import { addDays, fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { uid, useApp, useAuditHistory } from "@/lib/store";
import { adjustPlanned, applySuggestion, currentParcels, diffParcels, draftTotals, effectivateManual, initDraft, validateDraft, type EffLine, type RestLine, type Suggestion } from "@/lib/efetivacao";
import { Consultas } from "@/components/Consultas";
import { PlanVsActual } from "@/components/PlanVsActual";
import { pendingSearch } from "@/lib/pendencias";
import { usePendingFocus } from "@/components/PendingFocus";

export const Route = createFileRoute("/lancamentos")({
  validateSearch: launchLocation,
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
const T = (label: string, type: FilterCol["type"] = "text"): FilterCol => ({ label, type });
const PLANNED_COLS = [T("Categoria"), T("Subgrupo"), T("Fornecedor"), T("Código do pedido"), T("Documento"), T("Descrição"), T("Parcela"), T("Valor da parcela", "money"), T("Vencimento", "date"), T("Prorrogar para", "date"), T("Situação do lançamento")];
const COMMITTED_COLS = [...PLANNED_COLS.slice(0, 10), T("Situação do lançamento"), T("Situação do pagamento"), T("Pago", "money"), T("Saldo em aberto", "money"), T("Número do boleto")];
const PAYMENT_COLS = [T("Data", "date"), T("Título"), T("Conta"), T("Valor", "money"), T("Obs."), T("Situação")];
type Tab = "launches" | "payments" | "consultas" | "pva";
const TABS: { k: Tab; l: string }[] = [{ k: "launches", l: "Lançamentos" }, { k: "payments", l: "Pagamentos (baixas)" }, { k: "consultas", l: "Consultas" }, { k: "pva", l: "Planejado × Efetivado" }];
const now = () => new Date().toISOString();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

type Panel =
  | { t: "new" }
  | { t: "pay"; kind: "committed" | "expense"; id: string; label: string }
  | { t: "parcela"; label: string; amount: number; date: string; save: (x: ScenarioData, amount: number, date: string) => void; log: (x: ScenarioData) => { editLog?: EditLog[] } | undefined }
  | { t: "nota"; init: NoteFields; siblings: number; save: (x: ScenarioData, f: NoteFields) => void }
  | { t: "prorrogar"; label: string; current: string | null; original: string | null; history: ExtensionEvent[]; save: (x: ScenarioData, to: string | null, note: string) => void }
  | { t: "eff"; id: string; mode: "parcela" | "documento" | "ajustar"; sel: string[] };

/** Texto longo: largura limitada com reticências; o conteúdo completo fica na dica (title).
 *  Sem janela ao clicar: o clique na linha abre somente o lançamento (evita duas janelas sobrepostas). */
function Txt({ v }: { v: string | null | undefined }) {
  if (!v) return <td>—</td>;
  return <td className="txt" title={v}>{v}</td>;
}
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

const CachedConsultas = memo(Consultas);
const CachedPva = memo(PlanVsActual);
/** Hidden report tabs keep their filters but stop recomputing: they receive the base seen while visible and catch up when shown. */
function useWhileVisible<T>(value: T, visible: boolean): T {
  const last = useRef(value);
  if (visible) last.current = value;
  return visible ? value : last.current;
}
const EMPTY_ROWS: never[] = [];
const EMPTY_GROUPS = { byId: new Map(), ambiguous: [] };
const AmbiguousDocuments = memo(function AmbiguousDocuments({ d, groups, onManage }: { d: ScenarioData; groups: ReturnType<typeof createLaunchPresentation>["groups"]; onManage: (ref: LaunchRef) => void }) {
  if (!groups.ambiguous.length) return null;
  const titles = new Map(d.committed.map(c => [c.id, c]));
  return <div className="space-y-1"><p>Identificações mantidas individualmente:</p><div className="max-h-52 overflow-auto"><table className="tbl"><thead><tr><th>Fornecedor</th><th>Identificação</th><th>Motivo</th><th /></tr></thead><tbody>{groups.ambiguous.map(a => <tr key={a.id}><td>{supplierIdentity(d, titles.get(a.id)).name}</td><td>{a.document}</td><td>{a.reason}</td><td><Button size="sm" variant="outline" onClick={() => onManage({ kind: "committed", id: a.id, parcel: a.id })}>Gerenciar lançamento</Button></td></tr>)}</tbody></table></div></div>;
});

function Page() {
  const target = Route.useSearch();
  const { active, update, changes, user, allSims, official, canEdit } = useApp();
  const [auditDates, setAuditDates] = useState(false);
  const auditH = useAuditHistory(active.isBase && auditDates);
  const audit = auditH.entries;
  const operation = useOperationSave();
  const d = active.data;
  const tab = TABS.find((t) => t.k === target.tab)?.k ?? "launches";
  const navigate = Route.useNavigate();
  const [launchVisited, setLaunchVisited] = useState(tab === "launches");
  useEffect(() => { if(tab === "launches")setLaunchVisited(true); },[tab]);
  const [pvaVisited, setPvaVisited] = useState(tab === "pva");
  const [consultasVisited, setConsultasVisited] = useState(tab === "consultas");
  useEffect(() => { if (tab === "consultas") setConsultasVisited(true); }, [tab]);
  const consultasData = useWhileVisible(d, tab === "consultas"), pvaData = useWhileVisible(d, tab === "pva");
  useEffect(() => { if (tab === "pva") setPvaVisited(true); }, [tab]);
  usePendingFocus(target.focus, tab);
  const [err, setErr] = useState("");
  const paymentsReport = useReportState();
  const paymentsCF = useColumnFilter();
  const cf = paymentsCF, report = paymentsReport;
  const [open, setOpen] = useState<{ kind: string; id: string } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [managed, setManaged] = useState<LaunchRef | null>(null);
  const [bulk, setBulk] = useState<string[]>([]), [bulkOpen, setBulkOpen] = useState(false);
  const toggleBulk = (k: string) => setBulk((all) => all.includes(k) ? all.filter((x) => x !== k) : [...all, k]);
  const act = (fn: (x: ScenarioData) => void) => { const e = update(fn); setErr(e ?? ""); return !e; };
  const actAlone = (fn: (x: ScenarioData) => void, what: string) => {
    void operation.saveMutation(d,fn);
    return true;
  };
  const savePanel = async (fn: (x: ScenarioData) => void, directInclusion = false) => {
    try { const ok=await operation.saveMutation(d,fn,[],directInclusion); if(ok)setPanel(null); return ok; }
    catch(e) { setErr((e as Error).message); return false; }
  };
  const doPanel = (fn: (x: ScenarioData) => void) => { void savePanel(fn); };
  const sup = (id: string) => d.suppliers.find((s) => s.id === id);
  const catOf = (id: string) => d.categories.find((c) => c.id === id);
  const kindOfCat = (id: string): CategoryKind | "" => catOf(id)?.kind ?? "";
  const kindL = (id: string, fb: CategoryKind = "compra") => ((kindOfCat(id) || fb) === "compra" ? "Compra" : "Despesa");
  const isOpen = (kind: string, id: string) => open?.kind === kind && open.id === id;
  const toggle = (kind: string, id: string) => setOpen(isOpen(kind, id) ? null : { kind, id });
  const sourceHistory = active.isBase ? audit.map(a => ({ at: a.at, user: a.user_email ?? "", changes: a.changes })) : allSims.find(s => s.id === active.id)?.history ?? [];
  const historyKey = sourceHistory.map(a => a.at).join("|") + (active.isBase ? audit.map(a => a.id).join("|") : "");
  const model = useMemo(() => createLaunchPresentation(d, sourceHistory), [d, historyKey, official.orgId, active.id]);
  const launchModel = useWhileVisible(model, tab === "launches"), launchData = useWhileVisible(d, tab === "launches");
  const paymentIndex = tab === "payments" ? model.payments : EMPTY_ROWS;
  const groups = tab === "payments" ? model.groups : EMPTY_GROUPS;
  const labels = useMemo(() => new Map([...groups.byId].map(([id, group]) => [id, group.labels.get(id) ?? "1/1"])), [groups]);
  const paymentRows = useMemo(() => queryIndexedReport(paymentIndex.filter(r => columnTest(paymentsCF.f, PAYMENT_COLS, r.values)), paymentsReport.query, paymentsReport.sort).map(r => r.row), [paymentIndex, paymentsCF.f, paymentsReport.query, paymentsReport.sort]);
  const suggestions = useMemo(() => suggestFrom(paymentIndex, r => r.values), [paymentIndex]);
  const paymentsPager = usePager(paymentRows.length, paymentRows.length + paymentsReport.query + JSON.stringify(paymentsReport.sort) + paymentsCF.key);
  const noteInit = (o: { categoryId: string; supplierId: string; purchaseCode?: string; document: string; notes: string }, fb: CategoryKind): NoteFields => ({ kind: kindOfCat(o.categoryId) || fb, categoryId: o.categoryId, supplierId: o.supplierId, purchaseCode: o.purchaseCode ?? "", document: o.document, notes: o.notes });
  const reviewCount = target.etapa !== "planned" ? groups.ambiguous.length : 0;
  const launchReview = <details className="mb-2 text-xs"><summary className="cursor-pointer select-none font-medium">Auditoria e identificações para revisão{reviewCount ? ` (${reviewCount})` : ""}</summary><div className="mt-2 space-y-2">
    {active.isBase && auditH.status !== "ready" && <p className="text-muted-foreground" role="status">Colunas de cadastro/alteração: {auditH.status === "loading" ? "carregando auditoria…" : auditH.status === "error" ? auditH.error : "datas do próprio registro (auditoria carregada sob demanda)."} {auditH.status === "idle" && <button className="underline" onClick={() => setAuditDates(true)}>Incluir datas da auditoria</button>}</p>}
    {target.etapa !== "planned" && <AmbiguousDocuments d={d} groups={model.groups} onManage={setManaged} />}
  </div></details>;

  // Resumo financeiro lido da própria listagem filtrada; a chave evita exibir totais de outra organização/cenário.
  const listKey = `${official.orgId}:${active.id}`;
  const [totals, setTotals] = useState<{ t: LaunchTotals; k: string } | null>(null);

  return (
    <div>
      <PageHeader title="Lançamentos" sub={active.isBase ? "" : "Simulação: alterações imediatas e apenas visuais."}>
        {tab === "launches" && <LaunchSummaryChips totals={totals?.k === listKey ? totals.t : null} />}
        {tab === "launches" && <Button disabled={!canEdit} onClick={() => {operation.reset();setPanel({ t: "new" });}}>+ Novo lançamento</Button>}
      </PageHeader>
      {operation.error && <p role="alert" className="text-destructive">{operation.error}</p>}
      {err && <div className="mb-2 rounded border border-destructive p-2 text-xs text-destructive">{err}</div>}
      <div className="mb-2 flex flex-wrap border-b border-border" aria-label="Abas de Lançamentos">{TABS.map(t=><Link key={t.k} to="/lancamentos" search={prev=>({...prev,tab:t.k,etapa:t.k==="launches"?"":prev.etapa})} resetScroll={false} className={`tab whitespace-nowrap ${tab===t.k?"tab-on":""}`} aria-current={tab===t.k?"page":undefined}>{t.l}{t.k==="payments"?` (${d.payments.length})`:""}</Link>)}</div>
      {tab === "payments" && <div className="filter-bar"><ReportSearch value={report.query} onChange={report.setQuery} count={paymentRows.length} /><ColumnFilter cols={PAYMENT_COLS} filter={cf} suggest={suggestions} /><Button variant="outline" size="sm" onClick={() => { report.setQuery(""); cf.clear(); }}>Limpar filtros</Button></div>}
      {(consultasVisited || tab === "consultas") && <div hidden={tab !== "consultas"}><CachedConsultas d={consultasData} onManage={setManaged} /></div>}
      {(pvaVisited || tab === "pva") && <div hidden={tab !== "pva"}><CachedPva key={`${official.orgId}:${active.id}`} d={pvaData} /></div>}
      {bulkOpen && <BulkEditPanel d={d} keys={bulk} by={user?.email ?? ""} canEdit={canEdit} isBase={active.isBase} saving={operation.saving} saveLabel={operation.saveLabel} saveError={operation.error} onSave={async (fn) => { const ok = await operation.saveMutation(d, fn); if (ok) setBulk([]); return ok; }} onClose={() => setBulkOpen(false)} />}
      {(launchVisited || tab === "launches") && <div hidden={tab !== "launches"}><UnifiedLaunchList key={listKey} d={launchData} model={launchModel} stage={target.etapa ?? ''} onStage={etapa=>void navigate({search:prev=>({...prev,tab:"launches",etapa,focus:undefined}),resetScroll:false})} focus={target.focus} onManage={setManaged} canEdit={canEdit} bulk={bulk} setBulk={setBulk} onBulk={keys=>{setBulk(keys);operation.reset();setBulkOpen(true);}} afterFilters={launchReview} onTotals={t=>setTotals({t,k:listKey})}/></div>}
      {tab === "payments" && <div className="card overflow-auto launch-table">
        {tab === "payments" && (
          <table className="tbl"><thead><tr><SortHead label="Data" column={0} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Título" column={1} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Conta" column={2} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Valor" column={3} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={true} /><SortHead label="Obs." column={4} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><SortHead label="Situação" column={5} sort={paymentsReport.sort} onSort={paymentsReport.toggle} numeric={false} /><th>Ações</th></tr></thead>
            <tbody>{paymentsPager.slice(paymentRows).map((p) => {
              const t = p.titleKind === "committed" ? d.committed.find((c) => c.id === p.titleId) : d.expenses.find((e) => e.id === p.titleId);
              return <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{(supplierIdentity(d, t).name)} · {t?.document || "sem documento"}{p.titleKind === "committed" && labels.get(p.titleId) ? ` · parcela ${labels.get(p.titleId)}` : ""}</td><td>{p.method === "cartao" ? <span className="tag tag-ok">Quitado com cartão</span> : p.accountId ? accountName(d, p.accountId) : <span className="tag tag-warn">{NO_ACCOUNT}</span>}</td><td className="num">{fmtBRL(p.amount)}</td><Txt v={p.note} />
                <td>{p.reversedAt ? <span className="tag tag-err">estornado {fmtDate(p.reversedAt.slice(0, 10))}: {p.reversalNote}</span> : <span className="tag tag-ok">ativo</span>}</td>
                <td>{!p.reversedAt && p.method !== "cartao" && <button className="btn" disabled={!active.isBase} onClick={async () => { const n = await askText("Motivo do estorno (auditado):"); if (n) await operation.saveMutation(d,x=>reversePayment(x,p.id,n,now())); }}>Estornar</button>}</td></tr>;
            })}{!paymentRows.length && <tr><td colSpan={7} className="text-center text-muted-foreground">Nenhum resultado para os filtros informados</td></tr>}</tbody></table>
        )}
      </div>}
      {tab === "payments" && <Pager pager={paymentsPager} />}
      {tab !== "pva" && <p className="mt-2 text-[11px] text-muted-foreground">Registrar pagamento é o registro de uma baixa já realizada (Pix, TED, DOC ou Boleto) — não executa transferência bancária. Boleto pago com cartão não debita conta: passa para a fatura.</p>}

      {managed && <ManageLaunchPanel key={`${managed.kind}:${managed.id}`} launch={managed} onClose={() => setManaged(null)} />}
      {panel?.t === "pay" && <PagamentoPanel d={d} kind={panel.kind} titleId={panel.id} label={panel.label} saving={operation.saving} saveError={operation.error} saveLabel={operation.saveLabel} onCancel={() => {operation.reset();setPanel(null);}} onConfirm={async (r) => { const ok = await operation.saveMutation(d,(x) => r.origin === "conta" ? registerPaymentBatch(x, { batchId: uid(), titleKind: panel.kind, titleId: panel.id, lines: r.lines, note: r.note, form: r.form }) : coverTitleWithCard(x, { id: uid(), at: now(), by: user?.email ?? "", titleKind: panel.kind, titleId: panel.id, cardId: r.cardId, date: r.date, amount: r.amount, fee: r.fee, installments: r.installments, form: "boleto" })); if (ok) setPanel(null); return ok; }} />}
      {panel?.t === "new" && <NovaNota d={d} isBase={active.isBase} onManagePlanned={(id) => { setPanel(null); setManaged({ kind: "planned", id }); }} onCancel={() => {operation.reset();setPanel(null);}} saving={operation.saving} saveError={operation.error} saveLabel={active.isBase ? operation.saveLabel : undefined} onConfirm={(n, sv, creationId) => savePanel((x) => { applyNewLaunch(x, n, creationId, now()); if (sv) saveSupplierCondition(x, n.supplierId, sv.terms, now(), sv.name, user?.email ?? ""); }, !n.plannedId)} />}
      {panel?.t === "parcela" && <ParcelaPanel saving={operation.saving} saveError={operation.error} saveLabel={active.isBase ? operation.saveLabel : undefined} label={panel.label} amount={panel.amount} date={panel.date} onCancel={() => {operation.reset();setPanel(null);}} onSave={(a, dt, note) => doPanel((x) => { panel.save(x, a, dt); const r = panel.log(x); if (r) (r.editLog ??= []).push({ at: now(), by: user?.email ?? "", note, parcel: panel.label, before: { amount: panel.amount, date: panel.date }, after: { amount: a, date: dt } }); })} />}
      {panel?.t === "nota" && <DadosNotaPanel saving={operation.saving} saveError={operation.error} saveLabel={active.isBase ? operation.saveLabel : undefined} d={d} init={panel.init} siblings={panel.siblings} onCancel={() => {operation.reset();setPanel(null);}} onSave={(f) => doPanel((x) => panel.save(x, f))} />}
      {panel?.t === "prorrogar" && <ProrrogarPanel saving={operation.saving} saveError={operation.error} saveLabel={active.isBase ? operation.saveLabel : undefined} label={panel.label} current={panel.current} original={panel.original} history={panel.history} isBase={active.isBase} onCancel={() => {operation.reset();setPanel(null);}} onSave={(to, note) => doPanel((x) => panel.save(x, to, note))} />}
      {panel?.t === "eff" && (() => { const p = d.planned.find((x) => x.id === panel.id); return p ? <EfetivarPanel key={panel.mode + panel.sel.join()} data={d} planned={p} mode={panel.mode} preselect={panel.sel} saving={operation.saving} saveError={operation.error} saveLabel={active.isBase ? operation.saveLabel : undefined} onCancel={() => {operation.reset();setPanel(null);}} onDone={savePanel} /> : null; })()}
    </div>
  );
}

/** Efetivação com edição manual (protótipo aprovado): parcelas selecionadas → Efetivado; demais continuam em Planejada,
 *  editáveis livremente. Sugestões só ao clicar "Aplicar sugestão". mode "ajustar" = só replanejar, sem efetivar. */
function EfetivarPanel({ data, planned, mode, preselect, onDone, onCancel, saving=false, saveError, saveLabel }: { data: ScenarioData; planned: Planned; mode: "parcela" | "documento" | "ajustar"; preselect: string[]; saving?:boolean; saveError?:string; saveLabel?:string | undefined; onDone: (fn: (x: ScenarioData) => void) => Promise<boolean>; onCancel: () => void }) {
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
  const confirm = async () => {
    setSent(true);
    const clean = rest.map((r) => { if(r.amount === null || !r.date)throw new Error("Confira parcela");return { id:r.id,amount:r.amount,date:r.date,boletoNumber:r.boletoNumber }; });
    await onDone(mode === "ajustar" ? (x) => adjustPlanned(x, planned.id, clean)
      : (x) => effectivateManual(x, { id, plannedId: planned.id, at: new Date().toISOString(), effectiveDate: effDate!, document: doc, purchaseCode: code, selected: sel, eff: eff.map((e) => { if(e.amount===null || !e.date)throw new Error("Confira parcela");return {amount:e.amount,date:e.date,boletoNumber:e.boletoNumber}; }), rest: clean, substituted: subst ?? 0, rule }));
    setSent(false);
  };
  const title = mode === "ajustar" ? "Ajustar planejamento" : mode === "parcela" ? "Efetivar esta parcela" : "Efetivar documento";
  const footer = review
    ? <><button className="btn" onClick={() => setReview(false)}>Voltar</button><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={sent || saving} onClick={confirm}>{saveLabel ?? (saving ? "Salvando…" : "Confirmar e salvar")}</button></>
    : <><button className="btn" onClick={guardClose(dirty, onCancel)}>Cancelar</button><button className="btn btn-primary" disabled={errs.length > 0} title={errs.join(" ")} onClick={() => setReview(true)}>Revisar alterações</button></>;
  const KIND: Record<string, string> = { efetivada: "Passa para Efetivado", mantida: "Sem alteração", alterada: "Alterada", removida: "Removida", adicionada: "Adicionada" };
  return (
    <SidePanel expanded centered={review} wide title={review ? `Revisar — ${title.toLowerCase()}` : title} sub={`${sup?.name ?? "—"} · ${planned.purchaseCode || planned.document || "sem código"}${mode === "ajustar" ? "" : " — efetivar não registra pagamento"}`} onClose={onCancel} dirty={dirty} footer={footer}>
      {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
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
          <table className="tbl w-auto"><thead><tr><th>#</th><th>Número do boleto</th><th className="num">Valor</th><th>Vencimento</th><th /></tr></thead><tbody>
            {eff.map((l, n) => <tr key={n}><td>{n + 1}</td><td><input className="inp w-full" aria-label={`Número do boleto parcela ${n+1}`} value={l.boletoNumber ?? ""} onChange={e=>edit(()=>setEff(eff.map((x,k)=>k===n ? {...x,boletoNumber:e.target.value || null} : x)))}/></td><td className="num"><MoneyInput value={l.amount} onChange={(v) => edit(() => setEff(eff.map((x, k) => k === n ? { ...x, amount: v } : x)))} /></td><td><DateInput value={l.date} onChange={(v) => edit(() => setEff(eff.map((x, k) => k === n ? { ...x, date: v } : x)))} /></td><td><button className="btn" disabled={eff.length < 2} onClick={() => edit(() => setEff(eff.filter((_, k) => k !== n)))}>Remover</button></td></tr>)}
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
          <table className="tbl w-auto"><thead><tr><th>Parcela</th><th>Número do boleto</th><th className="num">Valor</th><th>Vencimento</th><th /></tr></thead><tbody>
            {rest.map((l, n) => <tr key={l.id}><td>{l.origin ? pName(l.origin) : "nova"}</td><td><input className="inp w-full" aria-label={`Número do boleto restante ${n+1}`} value={l.boletoNumber ?? ""} onChange={e=>editRest(r=>r.map((x,k)=>k===n ? {...x,boletoNumber:e.target.value || null} : x))}/></td><td className="num"><MoneyInput value={l.amount} onChange={(v) => editRest((r) => r.map((x, k) => k === n ? { ...x, amount: v } : x))} /></td><td><DateInput value={l.date} onChange={(v) => editRest((r) => r.map((x, k) => k === n ? { ...x, date: v } : x))} /></td><td><button className="btn" onClick={() => editRest((r) => r.filter((_, k) => k !== n))}>Remover</button></td></tr>)}
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
          {diff.filter(r=>r.kind!=="mantida").map((r, i) => <tr key={i} className="font-medium"><td>{r.before ? pName(r.before.key) : "nova"}</td><td>{KIND[r.kind]}</td><td className="num">{r.before ? fmtBRL(r.before.amount) : "—"}</td><td>{r.before ? fmtDate(r.before.date) : "—"}</td><td className="num">{r.after ? fmtBRL(r.after.amount) : "—"}</td><td>{r.after?.date ? fmtDate(r.after.date) : "—"}</td></tr>)}
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
        <K l="Original (histórico)" v={s.original} /><K l="Efetivado" v={s.effectivated} /><K l="Abatido pelo histórico" v={s.legacyAbated} />
        <K l="Restante previsto" v={s.remaining} neg={s.remaining < 0} /><K l="Pago" v={s.paid} /><K l="Aberto" v={s.open} />
        <div><div className="lbl">Situação</div><span className={`tag ${s.health === "ok" ? "tag-ok" : "tag-err"}`}>{s.status} · {s.health === "ok" ? "conciliado" : "conciliação pendente"}</span></div>
      </div>
      <p className="text-[11px] text-muted-foreground">Original + efetivações não somam de novo: fluxo = efetivados (títulos) + Saldo restante previsto. Conferência: efetivado {fmtBRL(s.effectivated)} + histórico {fmtBRL(s.legacyAbated)} + restante {fmtBRL(s.remaining)} = {fmtBRL(s.effectivated + s.legacyAbated + s.remaining)}{s.status === "ativo" && !p.remainingOverride && s.effectivated + s.legacyAbated + s.remaining !== s.original ? " ⚠ diverge do original" : ""}.</p>
      <DetailReport rows={[
        ...s.timeline.flatMap(({ e, titles }) => titles.map((t) => ({ key: e.id + t.c.id, event: `Efetivação ${e.linkedLegacy ? "(título do histórico vinculado)" : e.kind}${e.manual ? ` · previsão substituída ${fmtBRL(e.substituted ?? 0)} · planejado ${fmtBRL(e.manual.before.reduce((a, x) => a + x.amount, 0))} → ${fmtBRL(e.manual.after.reduce((a, x) => a + x.amount, 0))} (${e.manual.before.length} → ${e.manual.after.length} parcelas) · ${e.manual.rule}` : ""}`, date: e.manual?.effectiveDate ?? e.at.slice(0, 10), title: t.c.document, boletoNumber: t.c.boletoNumber, due: committedDate(t.c), value: t.c.value, paid: t.paid, open: Math.max(0, t.open), state: e.reversedAt ? `revertida: ${e.reversalNote}` : t.state, action: titles[0] === t && !e.reversedAt ? <button className="btn" onClick={async () => { const n = await askText("Motivo da reversão (auditado):"); if (n) act((x) => reverseEffectivation(x, e.id, n, at()), "a reversão"); }}>Reverter</button> : null }))),
        ...s.legacy.map((t) => ({ key: t.c.id, event: "Título do histórico distinto", date: null, title: t.c.document, boletoNumber: t.c.boletoNumber, due: committedDate(t.c), value: t.c.value, paid: t.paid, open: Math.max(0, t.open), state: t.c.legacyAbatement === null ? "M ausente" : `M ${fmtBRL(t.c.legacyAbatement)}`, action: null })),
        ...s.remainingDates.map((dt, i) => ({ key: "r" + i, event: "Restante previsto", date: null, title: "previsão", boletoNumber: null, due: dt, value: i === 0 ? s.remaining : null, paid: null, open: null, state: `${s.remainingDates.length} data(s)`, action: null })),
      ]} head={["Evento", "Data", "Título", "Vencimento", "Valor", "Pago", "Aberto", "Situação", "Número do boleto"]} rowKey={(r) => r.key}
        values={(r) => [r.event, dateValue(r.date), r.title, dateValue(r.due), r.value, r.paid, r.open, r.state, r.boletoNumber]}
        cells={(r) => [r.event, fmtDate(r.date), r.title, fmtDate(r.due), r.value == null ? "—" : fmtBRL(r.value), r.paid == null ? "—" : fmtBRL(r.paid), r.open == null ? "—" : fmtBRL(r.open), r.state, r.boletoNumber || "Não informado"]} actions={(r) => r.action} />
      {p.status === "ativo" ? <div className="flex flex-wrap items-end gap-3">
        <button className="btn btn-danger" onClick={async () => { const n = await askText("Motivo do encerramento do restante previsto:"); if (n) act((x) => closePlanned(x, p.id, n), "o encerramento"); }}>Encerrar restante</button>
        {s.legacy.length > 0 && <span>Mesmo título que uma efetivação? <select className="inp" value={link} onChange={(e) => setLink(e.target.value)}><option value="">— título do histórico —</option>{s.legacy.map((t) => <option key={t.c.id} value={t.c.id}>{t.c.document} · {fmtBRL(t.c.value)}</option>)}</select> <button className="btn" disabled={!link} onClick={() => act((x) => linkLegacyTitle(x, { id: "lk" + uid(), plannedId: p.id, committedId: link, at: at() }), "o vínculo do título do histórico")}>Vincular (sem duplicar)</button></span>}
      </div> : p.status === "encerrado" && <button className="btn" onClick={async () => { const n = await askText("Motivo da reabertura:"); if (n) act((x) => reopenPlanned(x, p.id, n), "a reabertura"); }}>Reabrir previsão</button>}
    </div>
  );
}
