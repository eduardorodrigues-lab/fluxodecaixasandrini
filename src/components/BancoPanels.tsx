import { askText } from "@/lib/decisions";
import { DetailReport } from "@/components/ReportControls";
import { dateValue } from "@/lib/reportTable";
import { useState } from "react";
import { DateInput, MoneyInput } from "@/components/kit";
import { Field, guardClose, Section, SidePanel } from "@/components/NotaPanel";
import { accountName, cardInstallments, invoiceMonthFor, NO_ACCOUNT, titleOpen, type PayLine } from "@/lib/engine/banco";
import { todaySP } from "@/lib/engine/actions";
import type { Payment, PaymentForm, ScenarioData } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";

/** Conta com busca por digitação (só contas ativas, salvo `includeInactive`). */
export function AccountSearch({ d, value, onChange, includeInactive, label = "Conta" }: { d: ScenarioData; value: string; onChange: (id: string) => void; includeInactive?: boolean; label?: string }) {
  const opts = d.bankAccounts.filter((a) => includeInactive || a.active || a.id === value);
  const [t, setT] = useState(value ? accountName(d, value) : "");
  const id = `acc-${label.replace(/\W/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
  return <>
    <input aria-label={label} className="inp h-8 w-full" list={id} placeholder="Digite para buscar a conta" value={t} onChange={(e) => { setT(e.target.value); onChange(opts.find((a) => accountName(d, a.id) === e.target.value)?.id ?? ""); }} />
    <datalist id={id}>{opts.map((a) => <option key={a.id} value={accountName(d, a.id)} />)}</datalist>
  </>;
}

export const FORM_LABEL: Record<PaymentForm, string> = { pix: "Pix", ted: "TED", doc: "DOC", boleto: "Boleto" };
export type PayResult =
  | { origin: "conta"; form: PaymentForm; lines: PayLine[]; note: string }
  | { origin: "cartao"; form: "boleto"; cardId: string; amount: number; date: string; fee: number; installments: number };
const cardName = (d: ScenarioData, id: string) => { const c = d.cards.find((x) => x.id === id); return c ? `${c.name} ••${c.last4}` : "—"; };
const fmtMonth = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/** Registrar pagamento: forma (Pix/TED/DOC/Boleto) + origem (contas, divisível; ou cartão, só Boleto). Revisão e confirmação única. */
export function PagamentoPanel({ d, kind, titleId, label, onCancel, onConfirm }: { d: ScenarioData; kind: Payment["titleKind"]; titleId: string; label: string; onCancel: () => void; onConfirm: (r: PayResult) => boolean }) {
  const { open } = titleOpen(d, kind, titleId);
  const [form, setForm] = useState<PaymentForm | "">("");
  const [origin, setOrigin] = useState<"conta" | "cartao">("conta");
  const [lines, setLines] = useState<{ accountId: string; amount: number | null; date: string | null }[]>([{ accountId: "", amount: open, date: todaySP() }]);
  const [cc, setCc] = useState<{ cardId: string; amount: number | null; date: string | null; fee: number | null; n: number }>({ cardId: "", amount: open, date: todaySP(), fee: null, n: 1 });
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const [tried, setTried] = useState(false);
  const isCard = origin === "cartao";
  const sum = isCard ? (cc.amount ?? 0) : lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  const rest = open - sum;
  const card = d.cards.find((c) => c.id === cc.cardId);
  const inst = card && cc.date && cc.amount && cc.n >= 1 ? cardInstallments(card, cc.date, cc.amount + (cc.fee ?? 0), cc.n) : [];
  const errs = [
    ...(!form ? ["Selecione a forma de pagamento."] : []),
    ...(isCard
      ? [!cc.cardId && "Selecione o cartão.", !(cc.amount && cc.amount > 0) && "Informe o valor.", !cc.date && "Informe a data da operação.", !(cc.n >= 1 && cc.n <= 360) && "Parcelamento no cartão: de 1 a 360.", !d.cards.some((c) => c.active) && "Cadastre um cartão em Bancos."].filter(Boolean) as string[]
      : [...lines.flatMap((l, i) => [!l.accountId && `Linha ${i + 1}: selecione a conta.`, !(l.amount && l.amount > 0) && `Linha ${i + 1}: informe o valor.`, !l.date && `Linha ${i + 1}: informe a data.`]).filter(Boolean) as string[],
        ...(!d.bankAccounts.some((a) => a.active) ? ["Cadastre uma conta em Bancos antes de registrar pagamentos."] : [])]),
    ...(sum > open ? ["Valor excede o saldo pendente (juros, multa e desconto não são suportados)."] : []),
  ];
  const set = (i: number, p: Partial<(typeof lines)[number]>) => setLines(lines.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const result = (): PayResult => isCard
    ? { origin: "cartao", form: "boleto", cardId: cc.cardId, amount: cc.amount!, date: cc.date!, fee: cc.fee ?? 0, installments: cc.n }
    : { origin: "conta", form: form as PaymentForm, lines: lines.map((l) => ({ accountId: l.accountId, amount: l.amount!, date: l.date! })), note };
  const dirty = form !== "" || !!note.trim();
  const cancel = guardClose(dirty, onCancel);
  const footer = review
    ? <><button className="btn" onClick={() => setReview(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => onConfirm(result())}>Confirmar pagamento</button></>
    : <><button className="btn" onClick={cancel}>Cancelar</button><button className="btn btn-primary" onClick={() => { setTried(true); if (!errs.length) setReview(true); }}>Revisar e confirmar</button></>;
  const formL = form ? FORM_LABEL[form] : "—";
  return (
    <SidePanel centered={review} wide title={review ? "Revisar pagamento" : "Registrar pagamento"} sub={label} onClose={onCancel} dirty={dirty} footer={footer}>
      <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3">
        <div><div className="lbl">Saldo pendente</div><div className="text-sm font-semibold tabular-nums">{fmtBRL(open)}</div></div>
        <div><div className="lbl">{isCard ? "Quitado com cartão" : "Soma informada"}</div><div className="text-sm font-semibold tabular-nums">{fmtBRL(sum)}</div></div>
        <div><div className="lbl">Restante após baixa</div><div className={`text-sm font-semibold tabular-nums ${rest < 0 ? "text-destructive" : ""}`}>{fmtBRL(rest)}</div></div>
      </div>
      {review ? (
        <Section title="Pagamento a confirmar">
          <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-3">
            <div><div className="lbl">Forma de pagamento</div><div className="font-medium">{formL}</div></div>
            <div><div className="lbl">Origem dos recursos</div><div className="font-medium">{isCard ? `Cartão de crédito · ${cardName(d, cc.cardId)}` : "Conta bancária"}</div></div>
            <div><div className="lbl">Título</div><div className="font-medium">{label}</div></div>
          </div>
          {isCard ? <>
            <p className="mb-2">Boleto {rest === 0 ? "quitado" : "parcialmente quitado"} com cartão em {fmtDate(cc.date)}: {fmtBRL(cc.amount)}{cc.fee ? ` + tarifa ${fmtBRL(cc.fee)}` : ""} em {cc.n}x. Nenhuma conta é debitada agora; o compromisso passa para a(s) fatura(s) abaixo e a saída bancária ocorre ao pagar a fatura.{rest > 0 && ` Restam ${fmtBRL(rest)} no vencimento original.`}</p>
            <table className="tbl"><thead><tr><th>Parcela do cartão</th><th className="num">Valor</th><th>Fatura</th><th>Vencimento da fatura</th></tr></thead>
              <tbody>{inst.map((p) => <tr key={p.n}><td>{p.n}/{cc.n}</td><td className="num">{fmtBRL(p.amount)}</td><td>{fmtMonth(p.month)}</td><td>{fmtDate(p.due)}</td></tr>)}</tbody></table>
          </> : <>
            <table className="tbl"><thead><tr><th>Conta debitada</th><th className="num">Valor</th><th>Data</th></tr></thead>
              <tbody>{lines.map((l, i) => <tr key={i}><td>{accountName(d, l.accountId)}</td><td className="num">{fmtBRL(l.amount)}</td><td>{fmtDate(l.date)}</td></tr>)}</tbody></table>
            <p className="mt-2">{rest === 0 ? "A parcela ficará quitada." : `A parcela ficará parcialmente paga; restam ${fmtBRL(rest)}.`}{note && ` Observação: ${note}`}</p>
          </>}
        </Section>
      ) : <>
        <Section title="Forma e origem">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field l="Forma de pagamento"><select aria-label="Forma de pagamento" className="inp h-8" value={form} onChange={(e) => { const f = e.target.value as PaymentForm | ""; setForm(f); if (f !== "boleto") setOrigin("conta"); }}><option value="">Selecione</option>{(Object.keys(FORM_LABEL) as PaymentForm[]).map((k) => <option key={k} value={k}>{FORM_LABEL[k]}</option>)}</select></Field>
            <Field l="Origem dos recursos"><select aria-label="Origem dos recursos" className="inp h-8" value={origin} onChange={(e) => setOrigin(e.target.value as "conta" | "cartao")}><option value="conta">Conta bancária</option><option value="cartao" disabled={form !== "boleto"}>Cartão de crédito{form !== "boleto" ? " (somente Boleto)" : ""}</option></select></Field>
          </div>
        </Section>
        {isCard ? (
          <Section title="Cartão de crédito">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field l="Cartão"><select aria-label="Cartão" className="inp h-8" value={cc.cardId} onChange={(e) => setCc({ ...cc, cardId: e.target.value })}><option value="">Selecione</option>{d.cards.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name} ••{c.last4}</option>)}</select></Field>
              <Field l="Valor do boleto pago"><MoneyInput value={cc.amount} onChange={(v) => setCc({ ...cc, amount: v })} /></Field>
              <Field l="Data da operação"><DateInput value={cc.date} onChange={(v) => setCc({ ...cc, date: v })} /></Field>
              <Field l="Tarifas (opcional)"><MoneyInput value={cc.fee} onChange={(v) => setCc({ ...cc, fee: v })} /></Field>
              <Field l="Parcelamento no cartão"><input aria-label="Parcelamento no cartão" type="number" min={1} max={360} className="inp h-8" value={cc.n} onChange={(e) => setCc({ ...cc, n: Number(e.target.value) || 1 })} /></Field>
            </div>
            {inst.length > 0 && <div className="mt-2"><table className="tbl"><thead><tr><th>Parcela</th><th className="num">Valor</th><th>Fatura</th><th>Vencimento</th></tr></thead><tbody>{inst.map((p) => <tr key={p.n}><td>{p.n}/{cc.n}</td><td className="num">{fmtBRL(p.amount)}</td><td>{fmtMonth(p.month)}</td><td>{fmtDate(p.due)}</td></tr>)}</tbody></table></div>}
            <p className="mt-2 text-muted-foreground">Não debita conta bancária agora; o valor (com tarifas) passa para a fatura do cartão.</p>
          </Section>
        ) : (
          <Section title="Contas de origem">
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-md border border-border p-2 md:grid-cols-[1fr_auto_auto_auto]">
                  <Field l={`Conta origem ${lines.length > 1 ? i + 1 : ""}`}><AccountSearch d={d} label={`Conta origem ${i + 1}`} value={l.accountId} onChange={(v) => set(i, { accountId: v })} /></Field>
                  <Field l="Valor"><MoneyInput value={l.amount} onChange={(v) => set(i, { amount: v })} /></Field>
                  <Field l="Data"><DateInput value={l.date} onChange={(v) => set(i, { date: v })} /></Field>
                  <button className="btn btn-danger" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))}>Remover</button>
                </div>
              ))}
              <button className="btn" onClick={() => setLines([...lines, { accountId: "", amount: rest > 0 ? rest : null, date: lines.at(-1)?.date ?? todaySP() }])}>+ Adicionar outra conta</button>
              <Field l="Observação" full><input className="inp h-8 w-full" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
          </Section>
        )}
        {tried && errs.length > 0 && <ul className="text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      </>}
    </SidePanel>
  );
}

/** Lista de baixas da parcela (todas, inclusive estornadas), com a conta de cada uma. */
export function BaixasList({ d, kind, titleId, canReverse, onReverse }: { d: ScenarioData; kind: Payment["titleKind"]; titleId: string; canReverse: boolean; onReverse: (id: string, note: string) => void }) {
  const ps = d.payments.filter((p) => p.titleKind === kind && p.titleId === titleId);
  const origin = (p: Payment) => p.method === "cartao" ? cardName(d, d.cardOps.find((o) => o.id === p.cardOpId)?.cardId ?? "") : p.accountId ? accountName(d, p.accountId) : NO_ACCOUNT;
  return <DetailReport rows={ps} head={["Data", "Forma", "Origem", "Valor", "Situação", "Observação"]} rowKey={(p) => p.id}
    values={(p) => [dateValue(p.date), p.form ? FORM_LABEL[p.form] : null, origin(p), p.amount, p.reversedAt ? "Estornada" : "Ativa", p.reversedAt ? p.reversalNote : p.note]}
    cells={(p) => [fmtDate(p.date), p.form ? FORM_LABEL[p.form] : "—", p.method === "cartao" ? <CardLink d={d} p={p} /> : origin(p), fmtBRL(p.amount), p.reversedAt ? `Estornada em ${fmtDate(p.reversedAt.slice(0, 10))}` : "Ativa", p.reversedAt ? p.reversalNote : p.note]}
    actions={(p) => !p.reversedAt && canReverse && p.method !== "cartao" && <button className="btn" onClick={async () => { const n = await askText("Motivo do estorno desta baixa:"); if (n) onReverse(p.id, n); }}>Estornar</button>} />;
}

/** Vínculo boleto → operação no cartão → fatura(s). */
function CardLink({ d, p }: { d: ScenarioData; p: Payment }) {
  const op = d.cardOps.find((o) => o.id === p.cardOpId);
  if (!op) return <span className="tag tag-ok">Quitado com cartão</span>;
  const parts = d.expenses.filter((e) => op.expenseIds.includes(e.id));
  const card = d.cards.find((c) => c.id === op.cardId);
  const fat = parts.map((e) => { const inv = d.expenses.find((f) => f.id === e.invoiceId); return inv?.invoiceOf ? `fatura ${fmtMonth(inv.invoiceOf.month)}` : card ? `fatura prevista ${fmtMonth(invoiceMonthFor(card, e.baseDate))}` : ""; });
  return <span><span className="tag tag-ok">Cartão {cardName(d, op.cardId)}</span> <span className="text-muted-foreground">{op.installments}x{op.fee ? ` · tarifa ${fmtBRL(op.fee)}` : ""} → {[...new Set(fat)].join(", ")}</span></span>;
}
