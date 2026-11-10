import { useState } from "react";
import { DateInput, MoneyInput } from "@/components/kit";
import { Field, Section, SidePanel } from "@/components/NotaPanel";
import { accountName, NO_ACCOUNT, titleOpen, type PayLine } from "@/lib/engine/banco";
import { todaySP } from "@/lib/engine/actions";
import type { Payment, ScenarioData } from "@/lib/engine/types";
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

/** Registrar pagamento multicontas: uma ou mais linhas, revisão e confirmação única (todas ou nenhuma). */
export function PagamentoPanel({ d, kind, titleId, label, onCancel, onConfirm }: { d: ScenarioData; kind: Payment["titleKind"]; titleId: string; label: string; onCancel: () => void; onConfirm: (lines: PayLine[], note: string) => boolean }) {
  const { open } = titleOpen(d, kind, titleId);
  const [lines, setLines] = useState<{ accountId: string; amount: number | null; date: string | null }[]>([{ accountId: "", amount: open, date: todaySP() }]);
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const sum = lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  const rest = open - sum;
  const errs = [
    ...lines.flatMap((l, i) => [!l.accountId && `Linha ${i + 1}: selecione a conta.`, !(l.amount && l.amount > 0) && `Linha ${i + 1}: informe o valor.`, !l.date && `Linha ${i + 1}: informe a data.`]).filter(Boolean) as string[],
    ...(sum > open ? ["Soma excede o saldo pendente (juros, multa e desconto não são suportados)."] : []),
    ...(!d.bankAccounts.some((a) => a.active) ? ["Cadastre uma conta em Bancos antes de registrar pagamentos."] : []),
  ];
  const set = (i: number, p: Partial<(typeof lines)[number]>) => setLines(lines.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const footer = review
    ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" onClick={() => onConfirm(lines.map((l) => ({ accountId: l.accountId, amount: l.amount!, date: l.date! })), note)}>Confirmar pagamento</button></>
    : <><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={errs.length > 0} title={errs.join(" ")} onClick={() => setReview(true)}>Revisar e confirmar</button></>;
  return (
    <SidePanel wide title={review ? "Revisar pagamento" : "Registrar pagamento"} sub={label} onClose={onCancel} footer={footer}>
      <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3">
        <div><div className="lbl">Saldo pendente</div><div className="text-sm font-semibold tabular-nums">{fmtBRL(open)}</div></div>
        <div><div className="lbl">Soma informada</div><div className="text-sm font-semibold tabular-nums">{fmtBRL(sum)}</div></div>
        <div><div className="lbl">Restante após baixa</div><div className={`text-sm font-semibold tabular-nums ${rest < 0 ? "text-destructive" : ""}`}>{fmtBRL(rest)}</div></div>
      </div>
      {review ? (
        <Section title="Baixas a confirmar">
          <table className="tbl"><thead><tr><th>Conta de origem</th><th className="num">Valor</th><th>Data</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={i}><td>{accountName(d, l.accountId)}</td><td className="num">{fmtBRL(l.amount)}</td><td>{fmtDate(l.date)}</td></tr>)}</tbody></table>
          <p className="mt-2">{rest === 0 ? "A parcela ficará quitada." : `A parcela ficará parcialmente paga; restam ${fmtBRL(rest)}.`}{note && ` Observação: ${note}`}</p>
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
            {errs.length > 0 && <ul className="text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        </Section>
      )}
    </SidePanel>
  );
}

/** Lista de baixas da parcela (todas, inclusive estornadas), com a conta de cada uma. */
export function BaixasList({ d, kind, titleId, canReverse, onReverse }: { d: ScenarioData; kind: Payment["titleKind"]; titleId: string; canReverse: boolean; onReverse: (id: string, note: string) => void }) {
  const ps = d.payments.filter((p) => p.titleKind === kind && p.titleId === titleId);
  if (!ps.length) return <span className="text-muted-foreground">Sem baixas.</span>;
  return <table className="tbl"><thead><tr><th>Data</th><th>Conta</th><th className="num">Valor</th><th>Situação</th><th>Observação</th><th /></tr></thead>
    <tbody>{ps.map((p) => <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.method === "cartao" ? <span className="tag tag-ok">Quitado com cartão</span> : p.accountId ? accountName(d, p.accountId) : <span className="tag tag-warn">{NO_ACCOUNT}</span>}</td><td className="num">{fmtBRL(p.amount)}</td>
      <td>{p.reversedAt ? <span className="tag tag-err" title={p.reversalNote}>Estornada em {fmtDate(p.reversedAt.slice(0, 10))}</span> : <span className="tag tag-ok">Ativa</span>}</td><td>{p.reversedAt ? p.reversalNote : p.note}</td>
      <td>{!p.reversedAt && canReverse && p.method !== "cartao" && <button className="btn" onClick={() => { const n = prompt("Motivo do estorno desta baixa:"); if (n) onReverse(p.id, n); }}>Estornar</button>}</td></tr>)}</tbody></table>;
}
