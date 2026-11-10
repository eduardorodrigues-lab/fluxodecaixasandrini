import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, IntInput, MoneyInput, PageHeader, ProfileBadge } from "@/components/kit";
import { committedDate, distributePlanned, expenseDate, paymentsFor, splitCents, titleStatus } from "@/lib/engine/engine";
import { closePlanned, confirmExtension, effectivate, linkLegacyTitle, plannedSummary, registerPayment, reopenPlanned, reverseEffectivation, reversePayment, setPlannedRemaining, suggestEffectivation, todaySP } from "@/lib/engine/actions";
import type { CategoryKind, Committed, Expense, Planned, ScenarioData } from "@/lib/engine/types";
import { addDays, fmtDate, parseBRDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { uid, useApp } from "@/lib/store";

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
type Tab = "planned" | "committed" | "payments";
const TABS: { k: Tab; l: string }[] = [{ k: "planned", l: "Planejada" }, { k: "committed", l: "Efetivado" }, { k: "payments", l: "Pagamentos (baixas)" }];
const now = () => new Date().toISOString();

function Page() {
  const { active, update, changes } = useApp();
  const d = active.data;
  const [tab, setTab] = useState<Tab>("planned");
  const [err, setErr] = useState("");
  const [fKind, setFKind] = useState<"" | CategoryKind>("");
  const [open, setOpen] = useState<{ kind: string; id: string } | null>(null);
  const act = (fn: (x: ScenarioData) => void) => { const e = update(fn); setErr(e ?? ""); return !e; };
  // Cada efetivação/vínculo/encerramento é revisado e confirmado INDIVIDUALMENTE (sem lote misturando pedidos).
  const actAlone = (fn: (x: ScenarioData) => void, what: string) => {
    if (active.isBase && changes.length) { setErr(`Há outras alterações no rascunho. Confirme ou descarte antes de ${what}: cada efetivação é revisada sozinha.`); return false; }
    const ok = act(fn); if (ok && active.isBase) setErr(`${what[0]!.toUpperCase()}${what.slice(1)} no rascunho — revise e confirme na barra superior (ou cancele).`); return ok;
  };
  const sup = (id: string) => d.suppliers.find((s) => s.id === id);
  const catOf = (id: string) => d.categories.find((c) => c.id === id);
  const kindOfCat = (id: string): CategoryKind | "" => catOf(id)?.kind ?? "";
  const subs = (kind: CategoryKind) => d.categories.filter((c) => c.kind === kind);
  const firstSub = (kind: CategoryKind) => subs(kind)[0]?.id ?? "";
  type K = "planned" | "committed" | "expenses";
  const set = <T extends K>(k: T, id: string, patch: Partial<ScenarioData[T][number]>) => act((x) => { const it = (x[k] as { id: string }[]).find((i) => i.id === id); if (it) Object.assign(it, patch); });
  const del = (k: K, id: string) => act((x) => { (x[k] as { id: string }[]) = (x[k] as { id: string }[]).filter((i) => i.id !== id); });
  const add = () => act((x) => {
    const s0 = x.suppliers[0]?.id ?? "";
    const today = x.params.startDate;
    if (tab === "planned") x.planned.push({ id: uid(), supplierId: s0, purchaseCode: "", document: "", value: 0, baseDate: today, categoryId: firstSub("compra"), notes: "", status: "ativo", remainingOverride: null });
    if (tab === "committed") x.committed.push({ id: uid(), supplierId: s0, purchaseCode: "", document: "", value: 0, dueDate: today, extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null, origin: "manual", plannedId: null, effectivationId: null, categoryId: firstSub("compra"), notes: "", status: "ativo" });
  });
  const SupSel = ({ v, on }: { v: string; on: (v: string) => void }) => <select className="inp w-40" value={v} onChange={(e) => on(e.target.value)}>{d.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
  // Categoria (Compra/Despesa) + Subgrupo correspondente. Trocar a categoria move o lançamento para o 1º subgrupo dela.
  const CatSub = ({ v, on }: { v: string; on: (catId: string) => void }) => {
    const kind = kindOfCat(v) || "compra";
    return (
      <span className="flex gap-1">
        <select className="inp w-24" aria-label="Categoria" value={kind} onChange={(e) => on(firstSub(e.target.value as CategoryKind))}><option value="compra">Compra</option><option value="despesa">Despesa</option></select>
        <select className="inp w-36" aria-label="Subgrupo" value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{subs(kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </span>
    );
  };
  const StSel = ({ v, on }: { v: string; on: (v: "ativo" | "cancelado") => void }) => v === "encerrado" ? <span className="tag">encerrado</span> : <select className="inp" value={v} onChange={(e) => on(e.target.value as "ativo" | "cancelado")}><option value="ativo">ativo</option><option value="cancelado">cancelado</option></select>;
  const Txt = ({ v, on, w = "w-24", ph }: { v: string; on: (v: string) => void; w?: string; ph?: string }) => <input className={`inp ${w}`} placeholder={ph} defaultValue={v} onBlur={(e) => e.target.value !== v && on(e.target.value)} />;
  const isOpen = (kind: string, id: string) => open?.kind === kind && open.id === id;
  const toggle = (kind: string, id: string) => setOpen(isOpen(kind, id) ? null : { kind, id });

  const effRows: { t: "committed"; c: Committed }[] = d.committed.map((c) => ({ t: "committed" as const, c }));
  const expRows: { t: "expense"; e: Expense }[] = d.expenses.map((e) => ({ t: "expense" as const, e }));
  const efetivados = [...effRows.map((r) => ({ ...r, catId: r.c.categoryId })), ...expRows.map((r) => ({ ...r, catId: r.e.categoryId }))]
    .filter((r) => !fKind || kindOfCat(r.catId) === fKind || (!r.catId && fKind === "despesa" && r.t === "expense"));

  return (
    <div>
      <PageHeader title="Lançamentos" sub={active.isBase ? "Planejada = previsão; Efetivado = compra/pedido ou despesa real; Pagamento = baixa registrada. Categoria (Compra/Despesa) e Subgrupo organizam o fluxo." : "Simulação: alterações imediatas e apenas visuais."}>
        <ProfileBadge />{tab !== "payments" && <button className="btn btn-primary" onClick={add}>+ Novo</button>}
      </PageHeader>
      {err && <div className="mb-2 rounded border border-destructive p-2 text-xs text-destructive">{err}</div>}
      <div className="mb-2 flex border-b border-border">{TABS.map((t) => <button key={t.k} className={`tab ${tab === t.k ? "tab-on" : ""}`} onClick={() => setTab(t.k)}>{t.l} ({t.k === "committed" ? d.committed.length + d.expenses.length : (d[t.k] as unknown[]).length})</button>)}</div>
      <div className="card overflow-auto">
        {tab === "planned" && (
          <table className="tbl"><thead><tr><th>Fornecedor</th><th>Cód. compra</th><th>Documento</th><th className="num">Valor previsto</th><th>Data base</th><th>Categoria / Subgrupo</th><th>Descrição</th><th>Restante previsto / parcelas</th><th>Estado</th><th>Ações</th></tr></thead>
            <tbody>{d.planned.map((p: Planned) => {
              const r = distributePlanned(p, sup(p.supplierId), d.committed, d.params.profile, d.effectivations);
              const effs = d.effectivations.filter((e) => e.plannedId === p.id);
              return [
                <tr key={p.id}>
                  <td><SupSel v={p.supplierId} on={(v) => set("planned", p.id, { supplierId: v })} /></td>
                  <td><Txt v={p.purchaseCode} on={(v) => set("planned", p.id, { purchaseCode: v })} /></td>
                  <td><Txt v={p.document} on={(v) => set("planned", p.id, { document: v })} /></td>
                  <td className="num"><MoneyInput value={p.value} onChange={(v) => set("planned", p.id, { value: v ?? 0 })} /></td>
                  <td><DateInput value={p.baseDate} onChange={(v) => v && set("planned", p.id, { baseDate: v })} /></td>
                  <td><CatSub v={p.categoryId} on={(v) => set("planned", p.id, { categoryId: v })} /></td>
                  <td><Txt v={p.notes} w="w-36" ph="finalidade" on={(v) => set("planned", p.id, { notes: v })} /></td>
                  <td className="text-[11px]">
                    <span className={`tag ${r.health === "ok" ? "tag-ok" : r.health === "erro" ? "tag-err" : "tag-warn"}`}>{r.health}</span> efetivado {fmtBRL(r.effectivated)} · {r.mode === "encerrado" ? "encerrada" : r.mode === "restante_confirmado" ? "restante confirmado" : "padrão"}
                    <div className="text-muted-foreground">{r.parcels.map((pc) => `${fmtDate(pc.date)} ${fmtBRL(pc.amount)}`).join(" · ") || "sem parcelas"}</div>
                    {d.params.profile === "legado" && r.mode === "padrao" && <div className={r.R < 0 ? "neg" : "text-muted-foreground"}>P {fmtBRL(r.P)} − Q {fmtBRL(r.Q)} (M, {r.linked} vínc. legado) = R {fmtBRL(r.R)}{r.roundingDiff ? ` · ajuste última parcela ${r.roundingDiff}¢` : ""}</div>}
                  </td>
                  <td><StSel v={p.status} on={(v) => set("planned", p.id, { status: v })} /></td>
                  <td className="space-x-1 whitespace-nowrap">
                    <button className="btn" aria-expanded={isOpen("tl", p.id)} onClick={() => toggle("tl", p.id)}>Detalhes ({effs.length})</button>
                    {p.status === "ativo" && <button className="btn btn-primary" disabled={r.health !== "ok"} title={r.health !== "ok" ? "Conciliação pendente (M ausente/prazos) — resolva antes" : ""} onClick={() => toggle("eff", p.id)}>Efetivar</button>}
                    <button className="btn btn-danger" onClick={() => confirm("Excluir previsão? (recuperável pelo histórico após confirmar)") && del("planned", p.id)}>Excluir</button>
                  </td>
                </tr>,
                isOpen("tl", p.id) && <tr key={p.id + "-e"}><td colSpan={10} className="bg-muted"><Timeline d={d} p={p} act={actAlone} /></td></tr>,
                isOpen("eff", p.id) && <tr key={p.id + "-f"}><td colSpan={10}><EffectivateForm data={d} planned={p} onDone={(fn) => { if (actAlone(fn, "a efetivação")) setOpen(null); }} /></td></tr>,
              ];
            })}</tbody></table>
        )}
        {tab === "committed" && (
          <>
            <div className="flex items-center gap-2 border-b border-border p-2 text-xs">
              <span className="lbl">Categoria</span>
              <select className="inp" value={fKind} onChange={(e) => setFKind(e.target.value as "" | CategoryKind)}><option value="">Todas</option><option value="compra">Compra</option><option value="despesa">Despesa</option></select>
              <span className="text-muted-foreground">Compras/pedidos efetivados e despesas efetuadas na mesma lista; efetivação e pagamento continuam controles separados.</span>
            </div>
            <table className="tbl"><thead><tr><th>Tipo</th><th>Categoria / Subgrupo</th><th>Descrição</th><th>Fornecedor</th><th>Documento</th><th className="num">Valor</th><th>Venc. vigente</th><th>Pagamento</th><th>Estado</th><th>Ações</th></tr></thead>
              <tbody>{efetivados.map((r) => r.t === "committed" ? <CommittedRow key={r.c.id} c={r.c} d={d} set={set} del={del} act={act} CatSub={CatSub} Txt={Txt} StSel={StSel} isBase={active.isBase} isOpen={isOpen} toggle={toggle} /> : <ExpenseRow key={r.e.id} e={r.e} d={d} set={set} del={del} act={act} CatSub={CatSub} Txt={Txt} StSel={StSel} isBase={active.isBase} isOpen={isOpen} toggle={toggle} />)}</tbody></table>
          </>
        )}
        {tab === "payments" && (
          <table className="tbl"><thead><tr><th>Data</th><th>Título</th><th className="num">Valor</th><th>Obs.</th><th>Situação</th><th /></tr></thead>
            <tbody>{[...d.payments].sort((a, b) => a.date.localeCompare(b.date)).map((p) => {
              const t = p.titleKind === "committed" ? d.committed.find((c) => c.id === p.titleId) : d.expenses.find((e) => e.id === p.titleId);
              return <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.titleKind === "committed" ? "Efetivado" : "Despesa"} · {sup(t?.supplierId ?? "")?.name} · {t?.document ?? p.titleId}</td><td className="num">{fmtBRL(p.amount)}</td><td>{p.note}</td>
                <td>{p.reversedAt ? <span className="tag tag-err">estornado {fmtDate(p.reversedAt.slice(0, 10))}: {p.reversalNote}</span> : <span className="tag tag-ok">ativo</span>}</td>
                <td>{!p.reversedAt && <button className="btn" disabled={!active.isBase} onClick={() => { const n = prompt("Motivo do estorno (auditado):"); if (n) act((x) => reversePayment(x, p.id, n, now())); }}>Estornar</button>}</td></tr>;
            })}</tbody></table>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Registrar pagamento é apenas o registro de uma baixa já realizada — não executa transferência bancária. Pagamentos nunca são apagados por prorrogação; estornos ficam no histórico.</p>
    </div>
  );
}

type RowProps = {
  d: ScenarioData;
  set: <T extends "planned" | "committed" | "expenses">(k: T, id: string, patch: Partial<ScenarioData[T][number]>) => boolean;
  del: (k: "planned" | "committed" | "expenses", id: string) => boolean;
  act: (fn: (x: ScenarioData) => void) => boolean;
  CatSub: (p: { v: string; on: (catId: string) => void }) => JSX.Element;
  Txt: (p: { v: string; on: (v: string) => void; w?: string; ph?: string }) => JSX.Element;
  StSel: (p: { v: string; on: (v: "ativo" | "cancelado") => void }) => JSX.Element;
  isBase: boolean; isOpen: (kind: string, id: string) => boolean; toggle: (kind: string, id: string) => void;
};

function CommittedRow({ c, d, sup, set, del, act, CatSub, Txt, StSel, isBase, isOpen, toggle }: RowProps & { c: Committed }) {
  const ts = titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id));
  const pl = c.plannedId ? d.planned.find((p) => p.id === c.plannedId) : null;
  const tipo = c.origin === "efetivacao" ? "Efetivação" : c.origin === "legado" ? "Legado" : "Manual";
  return [
    <tr key={c.id}>
      <td><span className="tag">{tipo}</span></td>
      <td><CatSub v={c.categoryId} on={(v) => set("committed", c.id, { categoryId: v })} /></td>
      <td><Txt v={c.notes} w="w-36" ph="finalidade" on={(v) => set("committed", c.id, { notes: v })} /></td>
      <td><select className="inp w-40" value={c.supplierId} onChange={(e) => set("committed", c.id, { supplierId: e.target.value })}>{d.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
      <td><Txt v={c.document} on={(v) => set("committed", c.id, { document: v })} /></td>
      <td className="num"><MoneyInput value={c.value} onChange={(v) => set("committed", c.id, { value: v ?? 0 })} /></td>
      <td>{fmtDate(committedDate(c))}{c.extensionDate && <div className="tag tag-warn">prorrogado ({c.extensionHistory.length})</div>}</td>
      <td className="text-[11px]"><span className={`tag ${ts.state === "Pago" ? "tag-ok" : ts.state === "Parcial" ? "tag-warn" : ""}`}>{ts.state}</span> pago {fmtBRL(ts.paid)} · aberto {fmtBRL(ts.open)}</td>
      <td><StSel v={c.status} on={(v) => set("committed", c.id, { status: v })} /></td>
      <td className="space-x-1 whitespace-nowrap">
        {c.status === "ativo" && ts.open > 0 && <button className="btn btn-primary" disabled={!isBase} title={isBase ? "" : "Simulação não registra pagamentos"} onClick={() => toggle("pay", c.id)}>Registrar pagamento</button>}
        <button className="btn" aria-expanded={isOpen("det", c.id)} onClick={() => toggle("det", c.id)}>Detalhes</button>
        <button className="btn btn-danger" onClick={() => confirm("Excluir? (recuperável pelo histórico)") && del("committed", c.id)}>Excluir</button>
      </td>
    </tr>,
    isOpen("pay", c.id) && <tr key={c.id + "-p"}><td colSpan={10}><PayForm open={ts.open} onSave={(amount, date, note) => { if (act((x) => registerPayment(x, { id: uid(), titleKind: "committed", titleId: c.id, amount, date, note }))) toggle("pay", c.id); }} /></td></tr>,
    isOpen("det", c.id) && <tr key={c.id + "-d"}><td colSpan={10} className="bg-muted">
      <div className="flex flex-wrap items-end gap-3 p-1 text-xs">
        <label>Cód. compra<br /><Txt v={c.purchaseCode} on={(v) => set("committed", c.id, { purchaseCode: v })} /></label>
        <label>Venc. original<br /><DateInput value={c.dueDate} onChange={(v) => v && set("committed", c.id, { dueDate: v })} /></label>
        <span>Origem: <b>{c.origin === "efetivacao" ? <>efetivação de <b>{pl?.purchaseCode ?? c.plannedId}</b></> : c.origin === "legado" ? "legado (vínculo por código + M)" : "manual"}</b></span>
        {c.origin === "efetivacao" ? <span className="text-muted-foreground">Base abat. legado (M): n/a (vínculo explícito)</span> : <label>Base abat. legado (M)<br /><MoneyInput value={c.legacyAbatement} onChange={(v) => set("committed", c.id, { legacyAbatement: v, origin: v === null ? c.origin : "legado" })} /></label>}
        {c.legacyAbatement === null && c.purchaseCode && c.origin !== "efetivacao" && <span className="tag tag-err">M ausente</span>}
      </div>
      <ExtForm current={c.extensionDate} history={c.extensionHistory} info={c.extensionInfo} onSave={(to, note) => { if (act((x) => confirmExtension(x, "committed", c.id, to, note, now()))) toggle("det", c.id); }} />
    </td></tr>,
  ];
}

function ExpenseRow({ e, d, set, del, act, CatSub, Txt, StSel, isBase, isOpen, toggle }: RowProps & { e: Expense }) {
  const dt = expenseDate(e);
  const ts = titleStatus(e.value, e.status, paymentsFor(d, "expense", e.id));
  return [
    <tr key={e.id}>
      <td><span className="tag">Despesa</span></td>
      <td><CatSub v={e.categoryId} on={(v) => set("expenses", e.id, { categoryId: v })} /></td>
      <td><Txt v={e.notes} w="w-36" ph="finalidade" on={(v) => set("expenses", e.id, { notes: v })} /></td>
      <td><select className="inp w-40" value={e.supplierId} onChange={(ev) => set("expenses", e.id, { supplierId: ev.target.value })}>{d.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
      <td><Txt v={e.document} on={(v) => set("expenses", e.id, { document: v })} /></td>
      <td className="num"><MoneyInput value={e.value} onChange={(v) => set("expenses", e.id, { value: v ?? 0 })} /></td>
      <td>{dt ? fmtDate(dt) : <span className="tag tag-warn">não distribuída</span>}{e.extensionDate && <div className="tag tag-warn">prorrogado</div>}</td>
      <td className="text-[11px]"><span className={`tag ${ts.state === "Pago" ? "tag-ok" : ts.state === "Parcial" ? "tag-warn" : ""}`}>{ts.state}</span> aberto {fmtBRL(ts.open)}</td>
      <td><StSel v={e.status} on={(v) => set("expenses", e.id, { status: v })} /></td>
      <td className="space-x-1 whitespace-nowrap">
        {e.status === "ativo" && ts.open > 0 && dt && <button className="btn btn-primary" disabled={!isBase} onClick={() => toggle("pay", e.id)}>Registrar pagamento</button>}
        <button className="btn" aria-expanded={isOpen("det", e.id)} onClick={() => toggle("det", e.id)}>Detalhes</button>
        <button className="btn btn-danger" onClick={() => confirm("Excluir? (recuperável pelo histórico)") && del("expenses", e.id)}>Excluir</button>
      </td>
    </tr>,
    isOpen("pay", e.id) && <tr key={e.id + "-p"}><td colSpan={10}><PayForm open={ts.open} onSave={(amount, date, note) => { if (act((x) => registerPayment(x, { id: uid(), titleKind: "expense", titleId: e.id, amount, date, note }))) toggle("pay", e.id); }} /></td></tr>,
    isOpen("det", e.id) && <tr key={e.id + "-d"}><td colSpan={10} className="bg-muted">
      <div className="flex flex-wrap items-end gap-3 p-1 text-xs">
        <label>Data base<br /><DateInput value={e.baseDate} onChange={(v) => v && set("expenses", e.id, { baseDate: v })} /></label>
        <label>Prazo G (dias; vazio = não distribui)<br /><IntInput value={e.termDays} onChange={(v) => set("expenses", e.id, { termDays: v })} /></label>
      </div>
      <ExtForm current={e.extensionDate} history={e.extensionHistory} info="" onSave={(to, note) => { if (act((x) => confirmExtension(x, "expense", e.id, to, note, now()))) toggle("det", e.id); }} />
    </td></tr>,
  ];
}

function PayForm({ open, onSave }: { open: number; onSave: (amount: number, date: string, note: string) => void }) {
  const [amount, setAmount] = useState<number | null>(open);
  const [date, setDate] = useState<string | null>(todaySP());
  const [note, setNote] = useState("");
  return <div className="flex flex-wrap items-end gap-2 bg-muted p-2 text-xs"><b>Registrar pagamento</b> Valor <MoneyInput value={amount} onChange={setAmount} /> Data real <DateInput value={date} onChange={setDate} /> <input className="inp w-48" placeholder="observação" value={note} onChange={(e) => setNote(e.target.value)} />
    <button className="btn btn-primary" disabled={!amount || !date} onClick={() => amount && date && onSave(amount, date, note)}>Adicionar ao rascunho</button><span className="text-muted-foreground">saldo pendente {fmtBRL(open)}</span></div>;
}
function ExtForm({ current, history, info, onSave }: { current: string | null; history: { from: string | null; to: string | null; at: string; note: string }[]; info: string; onSave: (to: string | null, note: string) => void }) {
  const [to, setTo] = useState<string | null>(current);
  const [note, setNote] = useState("");
  return <div className="bg-muted p-2 text-xs"><div className="flex flex-wrap items-end gap-2"><b>Prorrogação confirmada</b> Nova data <DateInput allowEmpty value={to} onChange={setTo} /><input className="inp w-48" placeholder="motivo" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn btn-primary" onClick={() => onSave(to, note)}>Confirmar prorrogação (rascunho)</button></div>
    <p className="mt-1 text-muted-foreground">Altera a programação real ao gravar; vencimento original preservado. Testes de prorrogação devem ser feitos em Simulação.{info && ` Campo K (informativo, não altera cálculo): "${info}".`}</p>
    {history.length > 0 && <ul className="mt-1">{history.map((h, i) => <li key={i}>{h.at ? fmtDate(h.at.slice(0, 10)) : "—"}: {fmtDate(h.from) || "original"} → {fmtDate(h.to) || "original"} {h.note}</li>)}</ul>}</div>;
}

function EffectivateForm({ data, planned, onDone }: { data: ScenarioData; planned: Planned; onDone: (fn: (x: ScenarioData) => void) => void }) {
  const [id] = useState(() => "ef" + uid()); // chave de idempotência por abertura do formulário
  const base0 = suggestEffectivation(data, planned.id, 0);
  const [total, setTotal] = useState<number | null>(base0.remainingValue);
  const [base, setBase] = useState<string | null>(planned.baseDate);
  const [terms, setTerms] = useState(base0.suggestedTerms.join(", "));
  const [inst, setInst] = useState<{ value: number; date: string; document: string }[]>([]);
  const [kind, setKind] = useState<"auto" | "parcial" | "concluida">("auto");
  const [rem, setRem] = useState<number | null>(null);
  const [remDates, setRemDates] = useState("");
  const [sent, setSent] = useState(false);
  const gen = () => {
    const days = terms.split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
    if (!total || !base || !days.length) return;
    const { parts } = splitCents(total, days.length);
    setInst(days.map((t, i) => ({ value: parts[i]!, date: addDays(base, t), document: "" })));
    const s = suggestEffectivation(data, planned.id, total);
    setRem(s.remainingValue); setRemDates(s.remainingDates.map(fmtDate).join(", "));
  };
  const effTotal = inst.reduce((a, i) => a + i.value, 0);
  const dates = remDates.split(/[,;\s]+/).filter(Boolean).map(parseBRDate);
  const datesOk = dates.every(Boolean);
  return (
    <div className="space-y-2 bg-muted p-2 text-xs">
      <b>Efetivar a previsão {planned.purchaseCode}</b> — restante previsto atual {fmtBRL(base0.remainingValue)}. Valores e vencimentos podem diferir totalmente da previsão; o subgrupo da previsão é mantido.
      <div className="flex flex-wrap items-end gap-2">Valor efetivado <MoneyInput value={total} onChange={setTotal} /> Data base <DateInput value={base} onChange={setBase} /> Prazos (dias, sugeridos do fornecedor) <input className="inp w-32" value={terms} onChange={(e) => setTerms(e.target.value)} /><button className="btn" onClick={gen}>Gerar parcelas</button></div>
      {inst.length > 0 && <>
        <table className="tbl w-auto"><thead><tr><th>#</th><th className="num">Valor</th><th>Vencimento</th><th>Documento</th></tr></thead><tbody>{inst.map((i, n) => <tr key={n}><td>{n + 1}</td><td className="num"><MoneyInput value={i.value} onChange={(v) => setInst(inst.map((x, k) => (k === n ? { ...x, value: v ?? 0 } : x)))} /></td><td><DateInput value={i.date} onChange={(v) => v && setInst(inst.map((x, k) => (k === n ? { ...x, date: v } : x)))} /></td><td><input className="inp w-28" value={i.document} onChange={(e) => setInst(inst.map((x, k) => (k === n ? { ...x, document: e.target.value } : x)))} /></td></tr>)}</tbody></table>
        <div>Total efetivado {fmtBRL(effTotal)} {inst.length > 1 && splitCents(effTotal, inst.length).residual !== 0 && "(resíduo na última parcela)"}</div>
        <div className="flex flex-wrap items-end gap-3">
          <label><input type="radio" checked={kind === "auto"} onChange={() => setKind("auto")} /> Parcial — restante continua previsto automaticamente ({fmtBRL(rem ?? base0.remainingValue)} nos prazos da previsão)</label>
          <label><input type="radio" checked={kind === "parcial"} onChange={() => setKind("parcial")} /> Parcial — definir restante:</label>
          <label><input type="radio" checked={kind === "concluida"} onChange={() => setKind("concluida")} /> Concluída — encerra o saldo previsto restante</label>
          {kind === "parcial" && <>Valor <MoneyInput value={rem} onChange={setRem} /> Datas próprias <input className={`inp w-64 ${datesOk ? "" : "ring-1 ring-destructive"}`} placeholder="dd/mm/aaaa, dd/mm/aaaa" value={remDates} onChange={(e) => setRemDates(e.target.value)} /></>}
        </div>
        <button className="btn btn-primary" disabled={sent || !effTotal || (kind === "parcial" && (!datesOk || rem === null))} onClick={() => { setSent(true); onDone((x) => effectivate(x, { id, plannedId: planned.id, kind: kind === "concluida" ? "concluida" : "parcial", at: new Date().toISOString(), installments: inst, remaining: kind === "parcial" ? { value: rem ?? 0, dates: dates as string[] } : null })); }}>Adicionar esta efetivação ao rascunho</button>
      </>}
    </div>
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
