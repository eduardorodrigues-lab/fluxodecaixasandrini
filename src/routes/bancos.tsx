import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DateInput, MoneyInput, PageHeader } from "@/components/kit";
import { CatSubFields, Field, Section, SidePanel, SupplierSearch } from "@/components/NotaPanel";
import { AccountSearch } from "@/components/BancoPanels";
import {
  accountBalance, accountName, addAccount, addCard, addTransfer, cardPurchases, confirmBankTransition, consolidatedBalance, createInvoice,
  addCardPurchase, cancelInvoice, cardInstallments, coverTitleWithCard, invoiceDueDate, invoiceMonthFor, reverseCardOp, titleOpen, movements, NO_ACCOUNT, previewBankTransition, reverseTransfer, revertBankTransition, updateAccount, type AccountInput,
} from "@/lib/engine/banco";
import { todaySP } from "@/lib/engine/actions";
import type { BankAccount, CategoryKind, ScenarioData } from "@/lib/engine/types";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/bancos")({
  head: () => ({ meta: [
    { title: "Bancos · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Contas bancárias, cartões, transferências, extratos e saldos realizados por conta." },
    { property: "og:title", content: "Bancos · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Controle bancário integrado ao fluxo de caixa." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

type Tab = "contas" | "extrato" | "transf" | "cartoes" | "saldo";
const TABS: { k: Tab; l: string }[] = [{ k: "contas", l: "Contas" }, { k: "extrato", l: "Extrato e saldos" }, { k: "transf", l: "Transferências" }, { k: "cartoes", l: "Cartões e faturas" }, { k: "saldo", l: "Saldo inicial do fluxo" }];
const now = () => new Date().toISOString();

function Page() {
  const { active, update, user } = useApp();
  const d = active.data;
  const [tab, setTab] = useState<Tab>("contas");
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState<null | { t: "conta"; acc?: BankAccount } | { t: "cartao"; accountId: string } | { t: "transf" } | { t: "compra" } | { t: "cobrir" } | { t: "fatura" }>(null);
  const act = (fn: (x: ScenarioData) => void) => { const e = update(fn); setErr(e ?? ""); return !e; };
  const done = (fn: (x: ScenarioData) => void) => { if (act(fn)) setPanel(null); };
  return (
    <div className="space-y-3">
      <PageHeader title="Bancos">
        {tab === "contas" && <button className="btn btn-primary" onClick={() => setPanel({ t: "conta" })}>+ Conta</button>}
        {tab === "transf" && <button className={`btn ${active.isBase ? "btn-primary" : "btn-danger"}`} onClick={() => setPanel({ t: "transf" })}>{active.isBase ? "+ Transferência" : "+ Transferência simulada"}</button>}
        {tab === "cartoes" && <><button className="btn btn-primary" onClick={() => setPanel({ t: "cobrir" })}>Pagar lançamento existente</button><button className="btn" onClick={() => setPanel({ t: "compra" })}>Adicionar nova compra</button><button className="btn btn-primary" onClick={() => setPanel({ t: "fatura" })}>Fechar fatura</button></>}
      </PageHeader>
      <div className="flex flex-wrap gap-1 border-b border-border">{TABS.map((t) => <button key={t.k} className={`px-3 py-1.5 text-xs ${tab === t.k ? "border-b-2 border-primary font-semibold text-primary" : "text-muted-foreground"}`} onClick={() => setTab(t.k)}>{t.l}</button>)}</div>
      {err && <div className="rounded border border-destructive p-2 text-xs text-destructive">{err}</div>}
      {tab === "contas" && <Contas d={d} onEdit={(acc) => setPanel({ t: "conta", acc })} onCard={(accountId) => setPanel({ t: "cartao", accountId })} onToggle={(a) => act((x) => updateAccount(x, a.id, { active: !a.active }, a.active ? "inativada" : "reativada", now()))} />}
      {tab === "extrato" && <Extrato d={d} />}
      {tab === "transf" && <Transfers d={d} sim={!active.isBase} canReverse onReverse={(id, n) => act((x) => reverseTransfer(x, id, n, now()))} />}
      {tab === "cartoes" && <Cartoes d={d} onReverse={(id, n) => act((x) => reverseCardOp(x, id, n, now()))} onCancelInvoice={(id, n) => act((x) => cancelInvoice(x, id, n))} />}
      {tab === "saldo" && <SaldoInicial d={d} isBase={active.isBase} onConfirm={(note) => act((x) => confirmBankTransition(x, user?.email ?? "", note, now()))} onRevert={() => confirm("Voltar a usar o saldo inicial legado no fluxo?") && act((x) => revertBankTransition(x))} />}

      {panel?.t === "conta" && <ContaPanel d={d} acc={panel.acc} onCancel={() => setPanel(null)} onSave={(a, note) => done((x) => (panel.acc ? updateAccount(x, panel.acc.id, a, note, now()) : addAccount(x, uid(), a, now())))} />}
      {panel?.t === "cartao" && <CartaoPanel onCancel={() => setPanel(null)} onSave={(c) => done((x) => addCard(x, { id: uid(), accountId: panel.accountId, active: true, ...c }))} />}
      {panel?.t === "transf" && <TransfPanel d={d} sim={!active.isBase} onCancel={() => setPanel(null)} onSave={(t) => done((x) => addTransfer(x, { id: uid(), ...t, at: now(), by: user?.email ?? "" }))} />}
      {panel?.t === "compra" && <CompraCartaoPanel d={d} onCancel={() => setPanel(null)} onSave={(e) => done((x) => addCardPurchase(x, { id: uid(), at: now(), by: user?.email ?? "", ...e }))} />}
      {panel?.t === "cobrir" && <CoberturaPanel d={d} onCancel={() => setPanel(null)} onSave={(e) => done((x) => coverTitleWithCard(x, { id: uid(), at: now(), by: user?.email ?? "", ...e }))} />}
      {panel?.t === "fatura" && <FaturaPanel d={d} onCancel={() => setPanel(null)} onSave={(f) => done((x) => createInvoice(x, { id: uid(), ...f }))} />}
    </div>
  );
}

function Contas({ d, onEdit, onCard, onToggle }: { d: ScenarioData; onEdit: (a: BankAccount) => void; onCard: (id: string) => void; onToggle: (a: BankAccount) => void }) {
  const today = todaySP();
  const ms = useMemo(() => movements(d), [d]);
  if (!d.bankAccounts.length) return <p className="text-xs text-muted-foreground">Nenhuma conta cadastrada. Use “+ Conta”.</p>;
  return (
    <div className="card overflow-auto"><table className="tbl">
      <thead><tr><th>Banco</th><th>Identificação</th><th>Empresa/titular</th><th>Agência</th><th>Conta</th><th>Situação</th><th className="num">Saldo inicial</th><th>Referência</th><th className="num">Saldo realizado hoje</th><th>Cartões</th><th>Ações</th></tr></thead>
      <tbody>{d.bankAccounts.map((a) => {
        const b = accountBalance(d, a.id, today, ms);
        const cards = d.cards.filter((c) => c.accountId === a.id);
        return <tr key={a.id} className={a.active ? "" : "opacity-60"}>
          <td>{a.bank}</td><td>{a.label}</td><td>{a.holder || "—"}</td><td>{a.agency || "—"}</td><td>{a.account || "—"}</td>
          <td><span className={`tag ${a.active ? "tag-ok" : "tag-warn"}`}>{a.active ? "Ativa" : "Inativa"}</span></td>
          <td className="num">{a.openingBalance === null ? <span className="tag tag-warn">não informado</span> : fmtBRL(a.openingBalance)}</td><td>{fmtDate(a.openingDate) || "—"}</td>
          <td className="num">{b.realized === null ? "—" : fmtBRL(b.realized)}</td>
          <td>{cards.map((c) => <div key={c.id}>{c.name} ••{c.last4} · fecha {c.closingDay} · vence {c.dueDay}</div>)}</td>
          <td className="space-x-1 whitespace-nowrap"><button className="btn" onClick={() => onEdit(a)}>Editar</button><button className="btn" onClick={() => onCard(a.id)}>+ Cartão</button><button className="btn" onClick={() => onToggle(a)}>{a.active ? "Inativar" : "Reativar"}</button></td>
        </tr>;
      })}</tbody>
    </table></div>
  );
}

function ContaPanel({ d, acc, onCancel, onSave }: { d: ScenarioData; acc?: BankAccount | undefined; onCancel: () => void; onSave: (a: AccountInput, note: string) => void }) {
  const [a, setA] = useState<AccountInput>(acc ? { bank: acc.bank, label: acc.label, holder: acc.holder, agency: acc.agency, account: acc.account, openingBalance: acc.openingBalance, openingDate: acc.openingDate } : { bank: "", label: "", holder: "", agency: "", account: "", openingBalance: null, openingDate: null });
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const up = (p: Partial<AccountInput>) => setA({ ...a, ...p });
  const correcting = !!acc && acc.openingBalance !== null && (a.openingBalance !== acc.openingBalance || a.openingDate !== acc.openingDate);
  const errs = [!a.bank.trim() && "Informe o banco.", !a.label.trim() && "Informe a identificação.", (a.openingBalance === null) !== (a.openingDate === null) && "Saldo inicial e data de referência juntos.", correcting && !note.trim() && "Correção de saldo inicial exige justificativa."].filter(Boolean) as string[];
  const footer = review
    ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" onClick={() => onSave(a, note)}>Confirmar</button></>
    : <><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={errs.length > 0} title={errs.join(" ")} onClick={() => setReview(true)}>Revisar e confirmar</button></>;
  return (
    <SidePanel title={acc ? "Editar conta" : "Nova conta"} sub={review ? "Revise os dados antes de confirmar" : ""} onClose={onCancel} footer={footer}>
      {review ? <Section title="Resumo"><ul className="space-y-1">
        <li>{a.bank} · {a.label} {a.holder && `· ${a.holder}`}</li><li>Agência {a.agency || "—"} · Conta {a.account || "—"}</li>
        <li>Saldo inicial: {a.openingBalance === null ? "não informado" : `${fmtBRL(a.openingBalance)} ao fim de ${fmtDate(a.openingDate)}`}</li>
        {correcting && <li className="text-destructive">Correção do saldo inicial (antes {fmtBRL(acc!.openingBalance)} em {fmtDate(acc!.openingDate)}). Motivo: {note}</li>}
      </ul></Section> : <>
        <Section n={1} title="Dados da conta"><div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field l="Banco"><input className="inp h-8" value={a.bank} onChange={(e) => up({ bank: e.target.value })} /></Field>
          <Field l="Identificação"><input className="inp h-8" placeholder="ex.: Conta movimento" value={a.label} onChange={(e) => up({ label: e.target.value })} /></Field>
          <Field l="Empresa/titular" full><input className="inp h-8" value={a.holder} onChange={(e) => up({ holder: e.target.value })} /></Field>
          <Field l="Agência"><input className="inp h-8" value={a.agency} onChange={(e) => up({ agency: e.target.value })} /></Field>
          <Field l="Conta com dígito"><input className="inp h-8" value={a.account} onChange={(e) => up({ account: e.target.value })} /></Field>
        </div></Section>
        <Section n={2} title="Saldo inicial"><div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field l="Saldo ao fim do dia"><MoneyInput className="w-full" value={a.openingBalance} onChange={(v) => up({ openingBalance: v })} /></Field>
          <Field l="Data de referência"><DateInput allowEmpty value={a.openingDate} onChange={(v) => up({ openingDate: v })} /></Field>
          {correcting && <Field l="Justificativa da correção" full><input className="inp h-8" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
        </div><p className="mt-2 text-muted-foreground">Somente movimentos com data posterior à referência entram no saldo — os anteriores já estão no saldo informado.</p></Section>
        {acc && acc.history.length > 1 && <Section title="Histórico"><ul>{acc.history.slice(1).map((h, i) => <li key={i}>{fmtDate(h.at.slice(0, 10))} · {h.field}: {String(h.from ?? "—")} → {String(h.to ?? "—")} {h.note && `(${h.note})`}</li>)}</ul></Section>}
        {d.bankAccounts.length === 0 && <p className="text-muted-foreground">Nenhum saldo é criado automaticamente.</p>}
      </>}
    </SidePanel>
  );
}

function CartaoPanel({ onCancel, onSave }: { onCancel: () => void; onSave: (c: { name: string; last4: string; closingDay: number; dueDay: number }) => void }) {
  const [c, setC] = useState({ name: "", last4: "", closingDay: 0, dueDay: 0 });
  const ok = c.name.trim() && /^\d{4}$/.test(c.last4) && c.closingDay >= 1 && c.closingDay <= 31 && c.dueDay >= 1 && c.dueDay <= 31;
  return <SidePanel title="Novo cartão" onClose={onCancel} footer={<><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={!ok} onClick={() => onSave(c)}>Confirmar</button></>}>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field l="Nome" full><input className="inp h-8" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
      <Field l="Últimos 4 dígitos"><input className="inp h-8" maxLength={4} value={c.last4} onChange={(e) => setC({ ...c, last4: e.target.value.replace(/\D/g, "") })} /></Field>
      <span />
      <Field l="Dia de fechamento"><input className="inp h-8" type="number" min={1} max={31} value={c.closingDay || ""} onChange={(e) => setC({ ...c, closingDay: Number(e.target.value) })} /></Field>
      <Field l="Dia de vencimento"><input className="inp h-8" type="number" min={1} max={31} value={c.dueDay || ""} onChange={(e) => setC({ ...c, dueDay: Number(e.target.value) })} /></Field>
    </div>
  </SidePanel>;
}

function TransfPanel({ d, sim, onCancel, onSave }: { d: ScenarioData; sim: boolean; onCancel: () => void; onSave: (t: { fromAccountId: string; toAccountId: string; amount: number; date: string; note: string }) => void }) {
  const [f, setF] = useState(""); const [t, setT] = useState(""); const [amount, setAmount] = useState<number | null>(null); const [date, setDate] = useState<string | null>(todaySP()); const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const errs = [!f && "Selecione a origem.", !t && "Selecione o destino.", f && f === t && "Origem e destino devem ser diferentes.", !(amount && amount > 0) && "Valor positivo.", !date && "Informe a data."].filter(Boolean) as string[];
  const footer = review ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" onClick={() => onSave({ fromAccountId: f, toAccountId: t, amount: amount!, date: date!, note })}>Confirmar transferência</button></>
    : <><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={errs.length > 0} title={errs.join(" ")} onClick={() => setReview(true)}>Revisar e confirmar</button></>;
  return <SidePanel title={`${sim ? "SIMULAÇÃO · " : ""}${review ? "Revisar transferência" : "Transferir entre contas"}`} sub={sim ? "Transferência de teste: altera só este cenário; nenhum dado real é gravado" : "Grava nas contas reais ao confirmar"} onClose={onCancel} footer={footer}>
    {review ? <Section title="Resumo"><p>Sai {fmtBRL(amount)} de <b>{accountName(d, f)}</b> e entra em <b>{accountName(d, t)}</b> em {fmtDate(date)}. Movimento neutro no consolidado (não é receita nem despesa).{note && ` Observação: ${note}`}</p></Section>
      : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field l="Conta de origem" full><AccountSearch d={d} label="Conta de origem" value={f} onChange={setF} /></Field>
        <Field l="Conta de destino" full><AccountSearch d={d} label="Conta de destino" value={t} onChange={setT} /></Field>
        <Field l="Valor"><MoneyInput className="w-full" value={amount} onChange={setAmount} /></Field>
        <Field l="Data"><DateInput value={date} onChange={setDate} /></Field>
        <Field l="Observação" full><input className="inp h-8" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {errs.length > 0 && <ul className="text-destructive md:col-span-2">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        <p className="text-muted-foreground md:col-span-2">Tarifas bancárias devem ser lançadas como despesa separada.</p>
      </div>}
  </SidePanel>;
}

function Transfers({ d, sim, canReverse, onReverse }: { d: ScenarioData; sim: boolean; canReverse: boolean; onReverse: (id: string, note: string) => void }) {
  if (!d.transfers.length) return <p className="text-xs text-muted-foreground">Nenhuma transferência.</p>;
  return <div className="card overflow-auto"><table className="tbl"><thead><tr><th>Data</th><th>Origem</th><th>Destino</th><th className="num">Valor</th><th>Observação</th><th>Registrada por</th><th>Situação</th><th /></tr></thead>
    <tbody>{[...d.transfers].sort((a, b) => b.date.localeCompare(a.date)).map((t) => <tr key={t.id}><td>{fmtDate(t.date)}</td><td>{accountName(d, t.fromAccountId)}</td><td>{accountName(d, t.toAccountId)}</td><td className="num">{fmtBRL(t.amount)}</td><td>{t.note}</td><td>{t.by}</td>
      <td>{sim && <span className="tag tag-err mr-1">simulação</span>}{t.reversedAt ? <span className="tag tag-err" title={t.reversalNote}>Estornada {fmtDate(t.reversedAt.slice(0, 10))}</span> : <span className="tag tag-ok">Ativa</span>}</td>
      <td>{!t.reversedAt && canReverse && <button className="btn" onClick={() => { const n = prompt("Motivo do estorno da transferência:"); if (n) onReverse(t.id, n); }}>Estornar</button>}</td></tr>)}</tbody></table></div>;
}

function Extrato({ d }: { d: ScenarioData }) {
  const [acc, setAcc] = useState<string>("*");
  const [from, setFrom] = useState<string | null>(todaySP().slice(0, 8) + "01");
  const [to, setTo] = useState<string | null>(todaySP());
  const ms = useMemo(() => movements(d), [d]);
  const f = from ?? "0000-00-00", t = to ?? "9999-12-31";
  const cons = consolidatedBalance(d, t);
  const sel = acc === "*" ? null : acc === "none" ? null : d.bankAccounts.find((a) => a.id === acc) ?? null;
  const list = ms.filter((m) => m.date >= f && m.date <= t && (acc === "*" ? true : acc === "none" ? !m.accountId : m.accountId === acc) && (!sel?.openingDate || m.date > sel.openingDate));
  let running = sel && sel.openingBalance !== null ? (accountBalance(d, sel.id, prevDay(f), ms).realized ?? 0) : null;
  return <div className="space-y-3">
    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
      {d.bankAccounts.map((a) => { const b = accountBalance(d, a.id, t, ms); return <div key={a.id} className="card p-3"><div className="lbl">{accountName(d, a.id)}</div><div className="text-sm font-semibold tabular-nums">{b.realized === null ? "sem saldo inicial" : fmtBRL(b.realized)}</div>{b.pending !== 0 && <div className="text-[11px] text-muted-foreground">+ {fmtBRL(b.pending)} informado, a confirmar</div>}</div>; })}
      <div className="card border-primary p-3"><div className="lbl">Consolidado realizado em {fmtDate(t)}</div><div className="text-sm font-semibold tabular-nums">{fmtBRL(cons.value)}</div>{cons.pending.length > 0 && <div className="text-[11px] text-destructive">{cons.pending.length} pendência(s)</div>}{cons.unassigned > 0 && <div className="text-[11px] text-warning-foreground">{cons.unassigned} movimento(s) em “{NO_ACCOUNT}” fora das contas</div>}</div>
    </div>
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label>Conta<br /><select className="inp" value={acc} onChange={(e) => setAcc(e.target.value)}><option value="*">Todas</option>{d.bankAccounts.map((a) => <option key={a.id} value={a.id}>{accountName(d, a.id)}</option>)}<option value="none">{NO_ACCOUNT}</option></select></label>
      <label>De<br /><DateInput value={from} onChange={setFrom} /></label><label>Até<br /><DateInput value={to} onChange={setTo} /></label>
    </div>
    <div className="card max-h-[65vh] overflow-auto"><table className="tbl"><thead><tr><th>Data</th><th>Conta</th><th>Tipo</th><th>Descrição</th><th>Situação</th><th className="num">Valor</th>{running !== null && <th className="num">Saldo realizado</th>}</tr></thead>
      <tbody>{list.length === 0 ? <tr><td colSpan={7} className="text-muted-foreground">Sem movimentos no período.</td></tr> : list.map((m, i) => { if (running !== null && m.realized) running += m.amount; return <tr key={i}><td>{fmtDate(m.date)}</td><td>{m.accountId ? accountName(d, m.accountId) : <span className="tag tag-warn">{NO_ACCOUNT}</span>}</td><td>{m.kind}</td><td>{m.desc}</td><td>{m.realized ? <span className="tag tag-ok">Realizado</span> : <span className="tag tag-warn">Informado, a confirmar</span>}</td><td className={`num ${m.amount < 0 ? "neg" : ""}`}>{fmtBRL(m.amount)}</td>{running !== null && <td className="num">{fmtBRL(running)}</td>}</tr>; })}</tbody></table></div>
    <p className="text-[11px] text-muted-foreground">Realizado = recebimentos confirmados em conta, pagamentos registrados e transferências. Estimativas entram só no fluxo projetado.</p>
  </div>;
}
const prevDay = (s: string) => new Date(Date.parse(s + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);

function Cartoes({ d, onReverse, onCancelInvoice }: { d: ScenarioData; onReverse: (id: string, note: string) => void; onCancelInvoice: (id: string, note: string) => void }) {
  if (!d.cards.length) return <p className="text-xs text-muted-foreground">Nenhum cartão. Cadastre em Contas → “+ Cartão”.</p>;
  const sup = (id: string) => d.suppliers.find((s) => s.id === id)?.name ?? "—";
  return <div className="space-y-3">{d.cards.map((c) => {
    const ops = d.cardOps.filter((o) => o.cardId === c.id);
    const invs = d.expenses.filter((e) => e.invoiceOf?.cardId === c.id);
    return <div key={c.id} className="card space-y-2 p-3"><div className="font-semibold">{c.name} ••{c.last4} · {accountName(d, c.accountId)}</div>
      {!ops.length ? <p className="text-xs text-muted-foreground">Sem operações.</p> : <table className="tbl"><thead><tr><th>Data</th><th>Operação</th><th>Origem</th><th className="num">Valor</th><th>Parcelas / faturas</th><th>Situação</th><th /></tr></thead>
        <tbody>{ops.map((o) => {
          const t = o.titleId ? (o.titleKind === "committed" ? d.committed.find((x) => x.id === o.titleId) : d.expenses.find((x) => x.id === o.titleId)) : null;
          const ps = d.expenses.filter((e) => o.expenseIds.includes(e.id));
          return <tr key={o.id}><td>{fmtDate(o.date)}</td><td>{o.kind === "cobertura" ? "Pagamento de lançamento existente" : "Nova compra"}</td>
            <td>{t ? `${sup(t.supplierId)} · ${t.document || "sem documento"}` : ps[0] ? sup(ps[0].supplierId) : "—"}</td><td className="num">{fmtBRL(o.amount)}</td>
            <td>{ps.map((e) => { const inv = e.invoiceId ? d.expenses.find((x) => x.id === e.invoiceId) : null; return <div key={e.id}>{fmtBRL(e.value)} · fatura {fmtMonth(invoiceMonthFor(c, e.baseDate))} {inv ? (inv.status === "cancelado" ? "" : "· fechada") : "· projetada"}</div>; })}</td>
            <td>{o.reversedAt ? <span className="tag tag-err" title={o.reversalNote}>Estornada</span> : o.kind === "cobertura" ? <span className="tag tag-ok">Quitado com cartão</span> : <span className="tag tag-ok">Ativa</span>}</td>
            <td>{!o.reversedAt && <button className="btn" onClick={() => { const n = prompt("Motivo do estorno da operação no cartão:"); if (n) onReverse(o.id, n); }}>Estornar</button>}</td></tr>;
        })}</tbody></table>}
      {invs.length > 0 && <table className="tbl"><thead><tr><th>Fatura</th><th>Vencimento</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
        <tbody>{invs.map((f) => { const paid = d.payments.filter((p) => p.titleKind === "expense" && p.titleId === f.id && !p.reversedAt).reduce((a, p) => a + p.amount, 0);
          return <tr key={f.id}><td>{fmtMonth(f.invoiceOf!.month)}</td><td>{fmtDate(f.baseDate)}</td><td className="num">{fmtBRL(f.value)}</td><td>{f.status === "cancelado" ? "Cancelada" : paid >= f.value ? "Paga" : paid ? `Parcial (${fmtBRL(paid)})` : "Em aberto — pagar em Lançamentos → Efetivado"}</td>
            <td>{f.status !== "cancelado" && !paid && <button className="btn" onClick={() => { const n = prompt("Motivo para reabrir (cancelar) a fatura:"); if (n) onCancelInvoice(f.id, n); }}>Reabrir fatura</button>}</td></tr>; })}</tbody></table>}
    </div>;
  })}<p className="text-[11px] text-muted-foreground">Compras e lançamentos pagos no cartão não debitam o banco. Antes do fechamento entram no fluxo como projeção da fatura; ao fechar, a fatura as substitui (sem duplicar) e o banco só é debitado ao pagar a fatura (uma ou mais contas).</p></div>;
}

function CardInstPreview({ d, cardId, date, amount, n }: { d: ScenarioData; cardId: string; date: string | null; amount: number | null; n: number }) {
  const card = d.cards.find((c) => c.id === cardId);
  if (!card || !date || !amount || !(n >= 1)) return null;
  return <table className="tbl"><thead><tr><th>Parcela</th><th className="num">Valor</th><th>Fatura</th><th>Vencimento previsto</th></tr></thead>
    <tbody>{cardInstallments(card, date, amount, n).map((p) => <tr key={p.n}><td>{p.n}/{n}</td><td className="num">{fmtBRL(p.amount)}</td><td>{fmtMonth(p.month)}</td><td>{fmtDate(p.due)}</td></tr>)}</tbody></table>;
}

function CoberturaPanel({ d, onCancel, onSave }: { d: ScenarioData; onCancel: () => void; onSave: (e: { cardId: string; titleKind: "committed" | "expense"; titleId: string; date: string; amount: number; installments: number }) => void }) {
  const sup = (id: string) => d.suppliers.find((s) => s.id === id)?.name ?? "—";
  const opts = [
    ...d.committed.filter((c) => c.status === "ativo").map((c) => ({ kind: "committed" as const, t: c, due: c.extensionDate ?? c.dueDate, label: `${sup(c.supplierId)} · ${c.purchaseCode || ""} ${c.document || ""}${c.parcelNo ? ` · parcela ${c.parcelNo}/${c.parcelCount}` : ""}` })),
    ...d.expenses.filter((e) => e.status === "ativo" && !e.cardId && !e.invoiceOf).map((e) => ({ kind: "expense" as const, t: e, due: e.extensionDate ?? e.baseDate, label: `${sup(e.supplierId)} · ${e.document || "despesa"}` })),
  ].map((o) => ({ ...o, open: titleOpen(d, o.kind, o.t.id).open })).filter((o) => o.open > 0).map((o) => ({ ...o, text: `${o.label.trim()} · venc. ${fmtDate(o.due)} · em aberto ${fmtBRL(o.open)}` }));
  const [q, setQ] = useState(""); const sel = opts.find((o) => o.text === q);
  const [cardId, setCard] = useState(d.cards.find((c) => c.active)?.id ?? "");
  const [date, setDate] = useState<string | null>(todaySP()); const [amount, setAmount] = useState<number | null>(null); const [n, setN] = useState(1);
  const [review, setReview] = useState(false);
  const amt = amount ?? sel?.open ?? null;
  const cat = sel ? d.categories.find((c) => c.id === sel.t.categoryId) : null;
  const errs = [!sel && "Selecione o lançamento em aberto.", !cardId && "Selecione o cartão.", !date && "Informe a data.", !(amt && amt > 0) && "Informe o valor.", sel && amt && amt > sel.open && "Valor excede o saldo em aberto do lançamento.", !(n >= 1 && n <= 24) && "Parcelas de 1 a 24."].filter(Boolean) as string[];
  const footer = review ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" onClick={() => onSave({ cardId, titleKind: sel!.kind, titleId: sel!.t.id, date: date!, amount: amt!, installments: n })}>Confirmar pagamento no cartão</button></>
    : <><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={errs.length > 0} title={errs.join(" ")} onClick={() => setReview(true)}>Revisar e confirmar</button></>;
  return <SidePanel wide title={review ? "Revisar pagamento no cartão" : "Pagar lançamento existente com cartão"} sub="Liquidação do fornecedor pelo cartão — não debita banco; a dívida fica no cartão até pagar a fatura" onClose={onCancel} footer={footer}>
    {!review && <Section n={1} title="Lançamento efetivado em aberto">
      <input aria-label="Buscar lançamento" className="inp h-8 w-full" list="cob-titles" placeholder="Digite fornecedor ou documento" value={q} onChange={(e) => { setQ(e.target.value); setAmount(null); }} />
      <datalist id="cob-titles">{opts.map((o) => <option key={o.kind + o.t.id} value={o.text} />)}</datalist>
      <p className="mt-1 text-muted-foreground">Previsões (Planejada) precisam ser efetivadas antes, com revisão, em Lançamentos.</p>
    </Section>}
    {sel && <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 md:grid-cols-4">
      <div><div className="lbl">Fornecedor</div>{sup(sel.t.supplierId)}</div><div><div className="lbl">Categoria / subgrupo</div>{cat ? `${cat.kind === "compra" ? "Compra" : "Despesa"} · ${cat.name}` : "—"}</div>
      <div><div className="lbl">Vencimento</div>{fmtDate(sel.due)}</div><div><div className="lbl">Em aberto</div>{fmtBRL(sel.open)}</div></div>}
    {!review && <Section n={2} title="Cartão e condição"><div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Field l="Cartão"><select className="inp h-8" value={cardId} onChange={(e) => setCard(e.target.value)}>{d.cards.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name} ••{c.last4}</option>)}</select></Field>
      <Field l="Data da compra"><DateInput value={date} onChange={setDate} /></Field>
      <Field l="Valor no cartão"><MoneyInput className="w-full" value={amt} onChange={setAmount} /></Field>
      <Field l="Parcelas no cartão"><input className="inp h-8" type="number" min={1} max={24} value={n} onChange={(e) => setN(Number(e.target.value))} /></Field>
    </div></Section>}
    <Section title="Parcelas nas faturas"><CardInstPreview d={d} cardId={cardId} date={date} amount={amt} n={n} />
      {sel && amt && amt <= sel.open && <p className="mt-2">{amt === sel.open ? "O lançamento ficará “Quitado com cartão”." : `Restam ${fmtBRL(sel.open - amt)} em aberto no vencimento original (${fmtDate(sel.due)}).`}</p>}</Section>
    {!review && errs.length > 0 && <ul className="text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
  </SidePanel>;
}

function CompraCartaoPanel({ d, onCancel, onSave }: { d: ScenarioData; onCancel: () => void; onSave: (e: { cardId: string; supplierId: string; categoryId: string; document: string; amount: number; date: string; notes: string; installments: number }) => void }) {
  const [n, setN] = useState(1);
  const [e, setE] = useState({ cardId: d.cards[0]?.id ?? "", supplierId: "", categoryId: "", document: "", value: null as number | null, baseDate: todaySP() as string | null, notes: "" });
  const [kind, setKind] = useState<CategoryKind>("despesa");
  const ok = e.cardId && e.supplierId && e.categoryId && e.value && e.value > 0 && e.baseDate;
  return <SidePanel wide title="Adicionar nova compra no cartão" sub="Entra no fluxo só pelas faturas do cartão — sem obrigação duplicada" onClose={onCancel} footer={<><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={!ok} onClick={() => onSave({ cardId: e.cardId, supplierId: e.supplierId, categoryId: e.categoryId, document: e.document, notes: e.notes, amount: e.value!, date: e.baseDate!, installments: n })}>Confirmar compra</button></>}>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field l="Cartão" full><select className="inp h-8" value={e.cardId} onChange={(x) => setE({ ...e, cardId: x.target.value })}>{d.cards.map((c) => <option key={c.id} value={c.id}>{c.name} ••{c.last4}</option>)}</select></Field>
      <Field l="Fornecedor" full><SupplierSearch d={d} value={e.supplierId} onChange={(v) => setE({ ...e, supplierId: v })} /></Field>
      <CatSubFields d={d} kind={kind} categoryId={e.categoryId} onChange={(k, c) => { setKind(k); setE({ ...e, categoryId: c }); }} />
      <Field l="Documento"><input className="inp h-8" value={e.document} onChange={(x) => setE({ ...e, document: x.target.value })} /></Field>
      <Field l="Valor"><MoneyInput className="w-full" value={e.value} onChange={(v) => setE({ ...e, value: v })} /></Field>
      <Field l="Data da compra"><DateInput value={e.baseDate} onChange={(v) => setE({ ...e, baseDate: v })} /></Field>
      <Field l="Parcelas no cartão"><input className="inp h-8" type="number" min={1} max={24} value={n} onChange={(x) => setN(Number(x.target.value))} /></Field>
      <Field l="Descrição" full><input className="inp h-8" value={e.notes} onChange={(x) => setE({ ...e, notes: x.target.value })} /></Field>
    </div>
    <CardInstPreview d={d} cardId={e.cardId} date={e.baseDate} amount={e.value} n={n} />
  </SidePanel>;
}

function FaturaPanel({ d, onCancel, onSave }: { d: ScenarioData; onCancel: () => void; onSave: (f: { cardId: string; month: string; dueDate: string; supplierId: string; categoryId: string }) => void }) {
  const [cardId, setCardId] = useState(d.cards[0]?.id ?? "");
  const card = d.cards.find((c) => c.id === cardId);
  const months = card ? [...new Set(cardPurchases(d, card.id).filter((e) => !e.invoiceId).map((e) => invoiceMonthFor(card, e.baseDate)))].sort() : [];
  const [month, setMonth] = useState(months[0] ?? "");
  const m = months.includes(month) ? month : months[0] ?? "";
  const items = card && m ? cardPurchases(d, card.id, m).filter((e) => !e.invoiceId) : [];
  const due = card && m ? invoiceDueDate(card, m) : null;
  const [dueDate, setDue] = useState<string | null>(null);
  const [supplierId, setSup] = useState(""); const [categoryId, setCat] = useState("");
  const ok = card && m && items.length && (dueDate ?? due) && supplierId && categoryId;
  return <SidePanel title="Fechar fatura" onClose={onCancel} footer={<><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={!ok} onClick={() => onSave({ cardId, month: m, dueDate: (dueDate ?? due)!, supplierId, categoryId })}>Confirmar fatura</button></>}>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field l="Cartão"><select className="inp h-8" value={cardId} onChange={(x) => setCardId(x.target.value)}>{d.cards.map((c) => <option key={c.id} value={c.id}>{c.name} ••{c.last4}</option>)}</select></Field>
      <Field l="Mês da fatura"><select className="inp h-8" value={m} onChange={(x) => setMonth(x.target.value)}>{months.map((x) => <option key={x} value={x}>{fmtMonth(x)}</option>)}</select></Field>
      <Field l="Vencimento"><DateInput value={dueDate ?? due} onChange={setDue} /></Field>
      <Field l="Subgrupo da fatura"><select className="inp h-8" value={categoryId} onChange={(x) => setCat(x.target.value)}><option value="">Selecione</option>{d.categories.filter((c) => c.kind === "despesa").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field l="Fornecedor (emissor)" full><SupplierSearch d={d} value={supplierId} onChange={setSup} /></Field>
    </div>
    <p>{items.length} compra(s) · total {fmtBRL(items.reduce((a, e) => a + e.value, 0))}. A fatura vira uma despesa única; pague-a em Lançamentos → Efetivado.</p>
  </SidePanel>;
}

function SaldoInicial({ d, isBase, onConfirm, onRevert }: { d: ScenarioData; isBase: boolean; onConfirm: (note: string) => void; onRevert: () => void }) {
  const p = previewBankTransition(d);
  const [note, setNote] = useState("");
  const mode = d.params.openingMode ?? "legado";
  return <div className="card max-w-3xl space-y-3 p-4 text-xs">
    <div>Regra em uso no fluxo: <b>{mode === "contas" ? "soma dos saldos das contas" : "saldo inicial legado (Referências)"}</b>. Nunca as duas ao mesmo tempo.</div>
    <table className="tbl"><tbody>
      <tr><td>Saldo inicial legado</td><td className="num">{fmtBRL(p.legacyValue)}</td></tr>
      <tr><td>Soma das contas ao fim de {fmtDate(p.refDate)} (véspera do início do fluxo)</td><td className="num">{fmtBRL(p.accountsValue)}</td></tr>
      <tr><td>Diferença</td><td className={`num ${p.diff ? "neg" : ""}`}>{fmtBRL(p.diff)}</td></tr>
    </tbody></table>
    {p.pending.length > 0 && <ul className="text-destructive">{p.pending.map((x) => <li key={x}>{x}</li>)}</ul>}
    {p.unassigned > 0 && <p className="text-warning-foreground">{p.unassigned} movimento(s) realizados sem conta (“{NO_ACCOUNT}”) não entram na soma das contas.</p>}
    {d.params.bankTransition && <p className="text-muted-foreground">Transição confirmada em {fmtDate(d.params.bankTransition.at.slice(0, 10))} por {d.params.bankTransition.by}: legado {fmtBRL(d.params.bankTransition.legacyValue)} → contas {fmtBRL(d.params.bankTransition.accountsValue)}. {d.params.bankTransition.note}</p>}
    {mode === "legado" ? <div className="flex flex-wrap items-end gap-2">
      <label className="flex-1">Observação da transição<br /><input className="inp h-8 w-full" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={!isBase || p.pending.length > 0 || !note.trim()} onClick={() => confirm(`Passar o saldo inicial do fluxo de ${fmtBRL(p.legacyValue)} para ${fmtBRL(p.accountsValue)}?`) && onConfirm(note)}>Confirmar transição</button>
    </div> : <button className="btn" disabled={!isBase} onClick={onRevert}>Voltar à regra legado</button>}
  </div>;
}
