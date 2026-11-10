import { BaixasList, PagamentoPanel } from "@/components/BancoPanels";
import { accountName, NO_ACCOUNT, registerPaymentBatch, coverTitleWithCard } from "@/lib/engine/banco";
import { createFileRoute } from "@tanstack/react-router";
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateInput, MoneyInput, PageHeader } from "@/components/kit";
import { ConditionPicker, DadosNotaPanel, Field, guardClose, NovaNota, type SaveAs, ParcelaPanel, ProrrogarPanel, Section, SidePanel, type NoteFields } from "@/components/NotaPanel";
import { applyNote, editCommittedNote, editPlannedParcel, extendPlannedParcel, parcelLabels, saveSupplierCondition } from "@/lib/notas";
import { committedDate, distributePlanned, expenseDate, paymentsFor, splitCents, titleStatus } from "@/lib/engine/engine";
import { closePlanned, confirmExtension, effectivate, linkLegacyTitle, plannedSummary, reopenPlanned, reverseEffectivation, reversePayment, setPlannedRemaining, suggestEffectivation, todaySP } from "@/lib/engine/actions";
import type { CategoryKind, ExtensionEvent, Planned, ScenarioData } from "@/lib/engine/types";
import { addDays, fmtDate, parseBRDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { uid, useApp } from "@/lib/store";
import { Consultas } from "@/components/Consultas";

export const Route = createFileRoute("/lancamentos")({
  head: () => ({
    meta: [
      { title: "Lançamentos · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Lançamentos planejados e efetivados de compras e despesas, com pagamentos." },
      { property: "og:title", content: "Lançamentos · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Planejado e efetivado de compras e despesas, com baixas de pagamento." },
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
  | { t: "eff"; id: string };

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
  const { active, update, changes, user } = useApp();
  const d = active.data;
  const [tab, setTab] = useState<Tab>("planned");
  const [err, setErr] = useState("");
  const [fKind, setFKind] = useState<"" | CategoryKind>("");
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
  const plannedRows = d.planned.filter((p) => !fKind || (kindOfCat(p.categoryId) || "compra") === fKind).flatMap((p) => {
    const r = distributePlanned(p, sup(p.supplierId), d.committed, d.params.profile, d.effectivations);
    const inst = p.installments?.length && !p.remainingOverride ? p.installments : null;
    const parts = r.parcels.length ? r.parcels : [null];
    return parts.map((pc, i) => ({ p, r, pc, i, n: parts.length, it: inst && pc ? inst[pc.idx ?? i] ?? null : null, idx: pc?.idx ?? i }));
  });
  // ---- Efetivado: títulos (já são parcelas) ----
  const efetivados = [...d.committed.map((c) => ({ t: "committed" as const, c, catId: c.categoryId })), ...d.expenses.map((e) => ({ t: "expense" as const, e, catId: e.categoryId }))]
    .filter((r) => !fKind || kindOfCat(r.catId) === fKind || (!r.catId && fKind === "despesa" && r.t === "expense"));

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
      {tab === "consultas" ? <Consultas d={d} /> : <div className="card overflow-auto">
        {tab === "planned" && (
          <table className="tbl"><thead><tr><th>Categoria</th><th>Subgrupo</th><th>Fornecedor</th><th>Código do pedido</th><th>Documento</th><th>Descrição</th><th>Parcela</th><th className="num">Valor da parcela</th><th>Vencimento</th><th>Prorrogar para</th><th>Situação do lançamento</th><th>Ações</th></tr></thead>
            <tbody>{plannedRows.flatMap(({ p, r, pc, i, n, it, idx }) => {
              const label = `${sup(p.supplierId)?.name ?? "—"} · ${p.document || p.purchaseCode || "sem documento"} · parcela ${i + 1}/${n}`;
              const baseAmt = it?.amount ?? distributePlanned(p, sup(p.supplierId), d.committed, d.params.profile, []).parcels[idx]?.amount ?? 0;
              const effs = d.effectivations.filter((e) => e.plannedId === p.id);
              const sit = p.status === "encerrado" ? "Encerrada" : p.status === "cancelado" ? "Cancelada" : r.effectivated > 0 ? "Efetivada parcialmente" : "Prevista";
              const out = [
                <tr key={p.id + i}>
                  <td>{kindL(p.categoryId)}</td><td>{catOf(p.categoryId)?.name ?? "—"}</td><td>{sup(p.supplierId)?.name ?? "—"}</td><td>{p.purchaseCode || "—"}</td><td>{p.document || "—"}</td><td className="max-w-48 truncate" title={p.notes}>{p.notes || "—"}</td>
                  <td>{pc ? `${i + 1}/${n}` : "—"}</td><td className="num">{pc ? fmtBRL(pc.amount) : "—"}</td>
                  <td>{pc ? fmtDate(it ? it.date : pc.date) : "—"}</td><td>{it?.extensionDate ? <span className="tag tag-warn">{fmtDate(it.extensionDate)}</span> : "—"}</td>
                  <td><span className={`tag ${r.health === "ok" ? "" : "tag-err"}`}>{sit}{r.health !== "ok" ? " · conciliação pendente" : ""}</span></td>
                  <td><Acoes>
                    {p.status === "ativo" && <button className="btn btn-primary" disabled={r.health !== "ok"} onClick={() => setPanel({ t: "eff", id: p.id })}>Efetivar (parcial/completa)</button>}
                    {pc && p.status === "ativo" && <button className="btn" onClick={() => setPanel({ t: "parcela", label, amount: baseAmt, date: it ? it.date : pc.date, save: (x, amount, date) => editPlannedParcel(x, p.id, idx, { amount, date }) })}>Editar esta parcela</button>}
                    <button className="btn" onClick={() => setPanel({ t: "nota", init: noteInit(p, "compra"), siblings: n, save: (x, f) => { const t = x.planned.find((y) => y.id === p.id); if (t) Object.assign(t, { categoryId: f.categoryId, supplierId: f.supplierId, purchaseCode: f.purchaseCode, document: f.document, notes: f.notes }); } })}>Editar dados da nota</button>
                    {pc && p.status === "ativo" && <button className="btn" onClick={() => setPanel({ t: "prorrogar", label, current: it?.extensionDate ?? null, original: it ? it.date : pc.date, history: it?.extensionHistory ?? [], save: (x, to, note) => extendPlannedParcel(x, p.id, idx, to, note, now()) })}>Prorrogar parcela</button>}
                    <button className="btn" onClick={() => toggle("tl", p.id)}>Detalhes ({effs.length})</button>
                    <button className="btn btn-danger" onClick={() => confirm("Excluir esta previsão (todas as parcelas)?") && del("planned", p.id)}>Excluir nota</button>
                  </Acoes></td>
                </tr>,
              ];
              if (i === n - 1) {
                if (isOpen("tl", p.id)) out.push(<tr key={p.id + "-e"}><td colSpan={12} className="bg-muted"><Timeline d={d} p={p} act={actAlone} /></td></tr>);
              }
              return out;
            })}
            {!plannedRows.length && <tr><td colSpan={12} className="text-center text-muted-foreground">Nenhum lançamento planejado.</td></tr>}</tbody></table>
        )}
        {tab === "committed" && (
          <table className="tbl"><thead><tr><th>Categoria</th><th>Subgrupo</th><th>Fornecedor</th><th>Código do pedido</th><th>Documento</th><th>Descrição</th><th>Parcela</th><th className="num">Valor da parcela</th><th>Vencimento</th><th>Prorrogar para</th><th>Situação do lançamento</th><th>Situação do pagamento</th><th className="num">Pago</th><th className="num">Saldo em aberto</th><th>Ações</th></tr></thead>
            <tbody>{efetivados.flatMap((r) => {
              if (r.t === "committed") {
                const c = r.c;
                const ts = titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id));
                const lb = labels.get(c.id) ?? "1/1";
                const label = `${sup(c.supplierId)?.name ?? "—"} · ${c.document || "sem documento"} · parcela ${lb}`;
                const sibs = c.noteId ? d.committed.filter((x) => x.noteId === c.noteId).length : 1;
                const pl = c.plannedId ? d.planned.find((p) => p.id === c.plannedId) : null;
                return [
                  <tr key={c.id}>
                    <td>{kindL(c.categoryId)}</td><td>{catOf(c.categoryId)?.name ?? "—"}</td><td>{sup(c.supplierId)?.name ?? "—"}</td><td>{c.purchaseCode || "—"}</td><td>{c.document || "—"}</td><td className="max-w-48 truncate" title={c.notes}>{c.notes || "—"}</td>
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
                      {c.status === "ativo" ? <button className="btn" onClick={() => act((x) => { const t = x.committed.find((y) => y.id === c.id); if (t) t.status = "cancelado"; })}>Cancelar parcela</button> : <button className="btn" onClick={() => act((x) => { const t = x.committed.find((y) => y.id === c.id); if (t) t.status = "ativo"; })}>Reativar parcela</button>}
                      <button className="btn btn-danger" onClick={() => confirm("Excluir esta parcela?") && del("committed", c.id)}>Excluir parcela</button>
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
              const label = `${sup(e.supplierId)?.name ?? "—"} · ${e.document || "sem documento"}`;
              return [
                <tr key={e.id}>
                  <td>{kindL(e.categoryId, "despesa")}</td><td>{catOf(e.categoryId)?.name ?? "—"}</td><td>{sup(e.supplierId)?.name ?? "—"}</td><td>—</td><td>{e.document || "—"}</td><td className="max-w-48 truncate" title={e.notes}>{e.notes || "—"}</td>
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
                    <button className="btn btn-danger" onClick={() => confirm("Excluir esta parcela?") && del("expenses", e.id)}>Excluir parcela</button>
                  </Acoes></td>
                </tr>,
                isOpen("det", e.id) && <tr key={e.id + "-d"}><td colSpan={15} className="bg-muted p-2"><div className="lbl mb-1">Baixas da parcela</div><BaixasList d={d} kind="expense" titleId={e.id} canReverse={active.isBase} onReverse={(id, n) => act((x) => reversePayment(x, id, n, now()))} />{e.cardId && <p className="mt-1">Compra no cartão — paga pela fatura{e.invoiceId ? "" : " (fatura ainda não fechada)"}.</p>}</td></tr>,
              ];
            })}
            {!efetivados.length && <tr><td colSpan={15} className="text-center text-muted-foreground">Nenhum lançamento efetivado.</td></tr>}</tbody></table>
        )}
        {tab === "payments" && (
          <table className="tbl"><thead><tr><th>Data</th><th>Título</th><th>Conta</th><th className="num">Valor</th><th>Obs.</th><th>Situação</th><th /></tr></thead>
            <tbody>{[...d.payments].sort((a, b) => a.date.localeCompare(b.date)).map((p) => {
              const t = p.titleKind === "committed" ? d.committed.find((c) => c.id === p.titleId) : d.expenses.find((e) => e.id === p.titleId);
              return <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{sup(t?.supplierId ?? "")?.name} · {t?.document || "sem documento"}{p.titleKind === "committed" && labels.get(p.titleId) ? ` · parcela ${labels.get(p.titleId)}` : ""}</td><td>{p.method === "cartao" ? <span className="tag tag-ok">Quitado com cartão</span> : p.accountId ? accountName(d, p.accountId) : <span className="tag tag-warn">{NO_ACCOUNT}</span>}</td><td className="num">{fmtBRL(p.amount)}</td><td>{p.note}</td>
                <td>{p.reversedAt ? <span className="tag tag-err">estornado {fmtDate(p.reversedAt.slice(0, 10))}: {p.reversalNote}</span> : <span className="tag tag-ok">ativo</span>}</td>
                <td>{!p.reversedAt && p.method !== "cartao" && <button className="btn" disabled={!active.isBase} onClick={() => { const n = prompt("Motivo do estorno (auditado):"); if (n) act((x) => reversePayment(x, p.id, n, now())); }}>Estornar</button>}</td></tr>;
            })}</tbody></table>
        )}
      </div>}
      <p className="mt-2 text-[11px] text-muted-foreground">Registrar pagamento é o registro de uma baixa já realizada (Pix, TED, DOC ou Boleto) — não executa transferência bancária. Boleto pago com cartão não debita conta: passa para a fatura.</p>

      {panel?.t === "pay" && <PagamentoPanel d={d} kind={panel.kind} titleId={panel.id} label={panel.label} onCancel={() => setPanel(null)} onConfirm={(r) => { const ok = act((x) => r.origin === "conta" ? registerPaymentBatch(x, { batchId: uid(), titleKind: panel.kind, titleId: panel.id, lines: r.lines, note: r.note, form: r.form }) : coverTitleWithCard(x, { id: uid(), at: now(), by: user?.email ?? "", titleKind: panel.kind, titleId: panel.id, cardId: r.cardId, date: r.date, amount: r.amount, fee: r.fee, installments: r.installments, form: "boleto" })); if (ok) setPanel(null); return ok; }} />}
      {panel?.t === "new" && <NovaNota d={d} isBase={active.isBase} onCancel={() => setPanel(null)} onConfirm={(n, sv) => { const ok = act((x) => { if (sv) saveSupplierCondition(x, n.supplierId, sv.terms, now(), sv.name, user?.email ?? ""); applyNote(x, n, { id: uid, at: now() }); }); if (ok) setPanel(null); return ok; }} />}
      {panel?.t === "parcela" && <ParcelaPanel label={panel.label} amount={panel.amount} date={panel.date} onCancel={() => setPanel(null)} onSave={(a, dt) => doPanel((x) => panel.save(x, a, dt))} />}
      {panel?.t === "nota" && <DadosNotaPanel d={d} init={panel.init} siblings={panel.siblings} onCancel={() => setPanel(null)} onSave={(f) => doPanel((x) => panel.save(x, f))} />}
      {panel?.t === "prorrogar" && <ProrrogarPanel label={panel.label} current={panel.current} original={panel.original} history={panel.history} isBase={active.isBase} onCancel={() => setPanel(null)} onSave={(to, note) => doPanel((x) => panel.save(x, to, note))} />}
      {panel?.t === "eff" && (() => { const p = d.planned.find((x) => x.id === panel.id); return p ? <EfetivarPanel data={d} planned={p} userEmail={user?.email ?? ""} onCancel={() => setPanel(null)} onDone={(fn) => { if (actAlone(fn, "a efetivação")) setPanel(null); }} /> : null; })()}
    </div>
  );
}

/** Efetivar: painel de conferência em duas partes — previsão de origem (somente consulta) e dados da
 *  efetivação (editáveis). O valor efetivado pode diferir da parte da previsão substituída. Confirma só após revisão. */
function EfetivarPanel({ data, planned, onDone, onCancel, userEmail }: { data: ScenarioData; planned: Planned; onDone: (fn: (x: ScenarioData) => void) => void; onCancel: () => void; userEmail: string }) {
  const [id] = useState(() => "ef" + uid()); // chave de idempotência por abertura do painel
  const base0 = suggestEffectivation(data, planned.id, 0);
  const sup = data.suppliers.find((s) => s.id === planned.supplierId);
  const cat = data.categories.find((c) => c.id === planned.categoryId);
  const [total, setTotal] = useState<number | null>(base0.remainingValue);
  const [base, setBase] = useState<string | null>(planned.baseDate);
  const [cond, setCond] = useState<{ name: string; terms: (number | null)[] } | null>(null);
  const [saveAs, setSaveAs] = useState<SaveAs | null>(null);
  const [inst, setInst] = useState<{ value: number; date: string; document: string }[]>([]);
  const [subst, setSubst] = useState<number | null>(null); // parte da previsão substituída (pode diferir do valor efetivado)
  const [substTouched, setSubstTouched] = useState(false);
  const [keepRest, setKeepRest] = useState(true);
  const [review, setReview] = useState(false);
  const [sent, setSent] = useState(false);
  const effTotal = inst.reduce((a, i) => a + i.value, 0);
  const substEff = substTouched ? subst : Math.min(base0.remainingValue, effTotal);
  const restAfter = keepRest ? Math.max(0, base0.remainingValue - (substEff ?? 0)) : 0;
  const gen = (c: { name: string; terms: (number | null)[] }, sv: SaveAs | null) => {
    setCond(c); setSaveAs(sv);
    const days = c.terms.filter((t): t is number => t !== null);
    if (!total || !base || !days.length) return;
    const { parts } = splitCents(total, days.length);
    setInst(days.map((t, i) => ({ value: parts[i]!, date: addDays(base, t), document: "" })));
  };
  const errs = [
    ...(effTotal <= 0 ? ["Gere as parcelas pela condição e informe valores positivos."] : []),
    ...(inst.some((i) => !(i.value > 0)) ? ["Toda parcela precisa de valor positivo."] : []),
    ...(inst.some((i) => !i.date) ? ["Toda parcela precisa de vencimento."] : []),
    ...(substEff === null || substEff < 0 ? ["Informe a parte da previsão substituída (zero é válido)."] : []),
    ...((substEff ?? 0) > base0.remainingValue ? ["A parte substituída não pode exceder o restante previsto."] : []),
  ];
  const dirty = inst.length > 0 || cond !== null;
  const cancel = guardClose(dirty, onCancel);
  const condTxt = cond ? `${cond.name} (${cond.terms.filter((t) => t !== null).join("/")} dias)` : "—";
  const confirm = () => {
    setSent(true);
    onDone((x) => {
      if (saveAs) saveSupplierCondition(x, planned.supplierId, saveAs.terms, new Date().toISOString(), saveAs.name, userEmail);
      effectivate(x, {
        id, plannedId: planned.id, kind: keepRest && restAfter > 0 ? "parcial" : "concluida", at: new Date().toISOString(),
        installments: inst, condition: cond, substituted: substEff ?? 0,
        remaining: keepRest && restAfter > 0 ? { value: restAfter, dates: base0.remainingDates } : null,
      });
    });
  };
  const footer = review
    ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" disabled={sent} onClick={confirm}>Confirmar esta efetivação</button></>
    : <><button className="btn" onClick={cancel}>Cancelar</button><button className="btn btn-primary" disabled={errs.length > 0} title={errs.join(" ")} onClick={() => setReview(true)}>Revisar e confirmar</button></>;
  return (
    <SidePanel wide title={review ? "Revisar efetivação" : "Efetivar previsão"} sub={`${sup?.name ?? "—"} · ${planned.purchaseCode || planned.document || "sem código"} — efetivar não registra pagamento`} onClose={onCancel} dirty={dirty} footer={footer}>
      <Section n={1} title="Previsão de origem (somente consulta)">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-muted p-4 md:grid-cols-3">
          {[["Fornecedor", sup?.name ?? "—"], ["Categoria / subgrupo", `${cat?.kind === "despesa" ? "Despesa" : "Compra"} · ${cat?.name ?? "—"}`], ["Código / documento", planned.purchaseCode || planned.document || "—"],
            ["Condição planejada", planned.condition ? `${planned.condition.name} (${planned.condition.terms.filter((t) => t !== null).join("/")} dias)` : `prazos ${base0.suggestedTerms.join("/") || "—"} dias`],
            ["Restante previsto atual", fmtBRL(base0.remainingValue)], ["Datas do restante", base0.remainingDates.map(fmtDate).join(", ") || "—"]].map(([k, v]) => <div key={k}><div className="lbl">{k}</div><div className="font-medium">{v}</div></div>)}
        </div>
      </Section>
      {!review ? <>
        <Section n={2} title="Dados da efetivação">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field l="Valor efetivado"><MoneyInput className="h-8 w-full" value={total} onChange={(v) => { setTotal(v); setInst([]); setCond(null); }} /></Field>
            <Field l="Data base"><DateInput value={base} onChange={(v) => { setBase(v); setInst([]); setCond(null); }} /></Field>
          </div>
          <div className="mt-3">
            <ConditionPicker d={data} supplierId={planned.supplierId} baseDate={base} hint="Confirme as condições reais desta efetivação — não presuma que as planejadas continuam corretas." disabled={!total || !base} disabledHint="Informe valor e data base" onConfirm={gen} />
          </div>
          {cond && <p className="mt-2 text-muted-foreground">Condição real: <b>{cond.name}</b>{saveAs ? ` — será salva como nova condição do fornecedor "${saveAs.name}".` : " — vale só para esta efetivação; não altera outros lançamentos nem o restante planejado."}</p>}
        </Section>
        {inst.length > 0 && <Section n={3} title="Parcelas efetivas (edite valores e vencimentos)">
          <table className="tbl w-auto"><thead><tr><th>#</th><th className="num">Valor</th><th>Vencimento</th><th>Documento</th></tr></thead><tbody>{inst.map((i, n) => <tr key={n}><td>{n + 1}</td><td className="num"><MoneyInput value={i.value} onChange={(v) => setInst(inst.map((x, k) => (k === n ? { ...x, value: v ?? 0 } : x)))} /></td><td><DateInput value={i.date} onChange={(v) => v && setInst(inst.map((x, k) => (k === n ? { ...x, date: v } : x)))} /></td><td><input className="inp w-28" value={i.document} onChange={(e) => setInst(inst.map((x, k) => (k === n ? { ...x, document: e.target.value } : x)))} /></td></tr>)}</tbody></table>
          <p className="mt-1">Total efetivado {fmtBRL(effTotal)} {inst.length > 1 && splitCents(effTotal, inst.length).residual !== 0 && "(resíduo na última parcela)"}</p>
        </Section>}
        {inst.length > 0 && <Section n={4} title="Parte da previsão substituída">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field l="Quanto da previsão esta efetivação substitui"><MoneyInput className="h-8 w-full" value={substEff} onChange={(v) => { setSubst(v); setSubstTouched(true); }} /></Field>
            <div className="flex flex-col justify-end gap-1">
              <label className="flex items-center gap-1"><input type="radio" checked={keepRest} onChange={() => setKeepRest(true)} /> Manter o restante planejado ({fmtBRL(restAfter)} nas datas da previsão)</label>
              <label className="flex items-center gap-1"><input type="radio" checked={!keepRest} onChange={() => setKeepRest(false)} /> Encerrar a previsão restante</label>
            </div>
          </div>
          <p className="mt-1 text-muted-foreground">O valor efetivado pode ser diferente da parte substituída. A mudança vale só para esta efetivação: não altera outros lançamentos nem recalcula efetivações anteriores.</p>
        </Section>}
        {errs.length > 0 && <ul className="list-disc pl-5 text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      </> : (
        <Section n={2} title="Resumo antes de confirmar">
          <table className="tbl w-auto"><tbody>
            <tr><td className="lbl">Planejado restante antes da operação</td><td className="num">{fmtBRL(base0.remainingValue)}</td></tr>
            <tr><td className="lbl">Parte da previsão substituída</td><td className="num">{fmtBRL(substEff)}</td></tr>
            <tr><td className="lbl">Valor efetivado</td><td className="num">{fmtBRL(effTotal)}</td></tr>
            <tr><td className="lbl">Planejado restante após a operação</td><td className="num">{keepRest ? fmtBRL(restAfter) : `${fmtBRL(0)} (previsão encerrada)`}</td></tr>
            <tr><td className="lbl">Condição efetiva</td><td>{condTxt}{saveAs ? ` — salva como nova condição "${saveAs.name}"` : ""}</td></tr>
            <tr><td className="lbl">Parcelas efetivas</td><td>{inst.map((i, n) => <div key={n}>{n + 1}. {fmtBRL(i.value)} em {fmtDate(i.date)}{i.document ? ` · doc. ${i.document}` : ""}</div>)}</td></tr>
          </tbody></table>
          <p className="mt-2 text-muted-foreground">Vínculos, efetivações anteriores e histórico são preservados; o fluxo não duplica saídas. Efetivar não registra pagamento.</p>
        </Section>
      )}
    </SidePanel>
  );
}

function Timeline({ d, p, act }: { d: ScenarioData; p: Planned; act: (fn: (x: ScenarioData) => void, what: string) => boolean }) {
  const s = plannedSummary(d, p.id);
  const [remV, setRemV] = useState<number | null>(s.remaining);
  const [remD, setRemD] = useState(s.remainingDates.map(fmtDate).join(", "));
  const [link, setLink] = useState("");
  const dates = remD.split(/[,;\s]+/).filter(Boolean).map(parseBRDate);
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
      <table className="tbl"><thead><tr><th>Evento</th><th>Data</th><th>Título</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Pago</th><th className="num">Aberto</th><th>Situação</th><th>Ação</th></tr></thead>
        <tbody>
          {s.timeline.flatMap(({ e, titles }) => titles.length ? titles.map((t, i) => <tr key={e.id + t.c.id}><td>{i === 0 ? `Efetivação ${e.linkedLegacy ? "(título legado vinculado)" : e.kind}` : ""}</td><td>{i === 0 ? fmtDate(e.at.slice(0, 10)) : ""}</td><td>{t.c.document}</td><td>{fmtDate(committedDate(t.c))}</td><td className="num">{fmtBRL(t.c.value)}</td><td className="num">{fmtBRL(t.paid)}</td><td className="num">{fmtBRL(Math.max(0, t.open))}</td><td>{e.reversedAt ? <span className="tag tag-err">revertida: {e.reversalNote}</span> : t.state}</td><td>{i === 0 && !e.reversedAt && <button className="btn" onClick={() => { const n = prompt("Motivo da reversão (auditado):"); if (n) act((x) => reverseEffectivation(x, e.id, n, at()), "a reversão"); }}>Reverter</button>}</td></tr>) : [])}
          {s.legacy.map((t) => <tr key={t.c.id}><td>Título legado distinto (M)</td><td>—</td><td>{t.c.document}</td><td>{fmtDate(committedDate(t.c))}</td><td className="num">{fmtBRL(t.c.value)}</td><td className="num">{fmtBRL(t.paid)}</td><td className="num">{fmtBRL(Math.max(0, t.open))}</td><td>{t.c.legacyAbatement === null ? <span className="tag tag-err">M ausente</span> : `M ${fmtBRL(t.c.legacyAbatement)}`}</td><td /></tr>)}
          {s.remainingDates.map((dt, i) => <tr key={"r" + i}><td>{i === 0 ? "Restante previsto" : ""}</td><td /><td>previsão</td><td>{fmtDate(dt)}</td><td className="num" colSpan={1}>{i === 0 ? fmtBRL(s.remaining) : ""}</td><td /><td /><td>{i === 0 ? `${s.remainingDates.length} data(s)` : ""}</td><td /></tr>)}
        </tbody></table>
      {p.status === "ativo" ? <div className="flex flex-wrap items-end gap-3">
        <span>Restante: valor <MoneyInput value={remV} onChange={setRemV} /> datas <input className="inp w-56" value={remD} onChange={(e) => setRemD(e.target.value)} /></span>
        <button className="btn" disabled={remV === null || !dates.length || !dates.every(Boolean)} onClick={() => act((x) => setPlannedRemaining(x, p.id, remV ?? 0, dates as string[]), "a edição do restante")}>Definir restante</button>
        <button className="btn btn-danger" onClick={() => { const n = prompt("Motivo do encerramento do restante previsto:"); if (n) act((x) => closePlanned(x, p.id, n), "o encerramento"); }}>Encerrar restante</button>
        {s.legacy.length > 0 && <span>Mesmo título que uma efetivação? <select className="inp" value={link} onChange={(e) => setLink(e.target.value)}><option value="">— título legado —</option>{s.legacy.map((t) => <option key={t.c.id} value={t.c.id}>{t.c.document} · {fmtBRL(t.c.value)}</option>)}</select> <button className="btn" disabled={!link} onClick={() => act((x) => linkLegacyTitle(x, { id: "lk" + uid(), plannedId: p.id, committedId: link, at: at() }), "o vínculo do título legado")}>Vincular (sem duplicar)</button></span>}
      </div> : p.status === "encerrado" && <button className="btn" onClick={() => { const n = prompt("Motivo da reabertura:"); if (n) act((x) => reopenPlanned(x, p.id, n), "a reabertura"); }}>Reabrir previsão</button>}
    </div>
  );
}
