import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput, MoneyInput } from "@/components/kit";
import { Field, SidePanel } from "@/components/NotaPanel";
import { askConfirm } from "@/lib/decisions";
import { applyBulk, expandToDocuments, planBulk, snapshotOf, type BulkAction, type BulkItem, type BulkKind } from "@/lib/bulkEdit";
import { supplierIdentity } from "@/lib/supplierIdentity";
import { fmtBRL } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import type { ScenarioData } from "@/lib/engine/types";

type ActionType = BulkAction["type"];
const ACTIONS: [ActionType, string][] = [["extend", "Prorrogar vencimento"], ["value", "Alterar valor de cada parcela"], ["category", "Alterar subgrupo"], ["cancel", "Cancelar parcelas"]];

/** Edição em massa das parcelas marcadas: escopo explícito, revisão antes/depois com totais e confirmação única. */
export function BulkEditPanel({ d, keys, by, canEdit, isBase, saving, saveLabel, saveError, onSave, onClose }: { d: ScenarioData; keys: string[]; by: string; canEdit: boolean; isBase: boolean; saving: boolean; saveLabel: string; saveError: string; onSave: (fn: (x: ScenarioData) => void) => Promise<boolean>; onClose: () => void }) {
  const [scope, setScope] = useState<"parcelas" | "documento">("parcelas");
  const [type, setType] = useState<ActionType>("extend");
  const [date, setDate] = useState<string | null>(null), [amount, setAmount] = useState<number | null>(null), [categoryId, setCategoryId] = useState("");
  const [reason, setReason] = useState(""), [review, setReview] = useState(false), [error, setError] = useState("");
  const scoped = useMemo(() => scope === "documento" ? expandToDocuments(d, keys) : keys, [d, keys, scope]);
  // Estado visto no momento da seleção: qualquer alteração concorrente posterior vira conflito na confirmação.
  const [seen] = useState(() => new Map(expandToDocuments(d, keys).map((k) => { const [kind, id] = k.split(/:(.*)/s) as [BulkKind, string]; return [k, snapshotOf(d, kind, id)]; })));
  const items: BulkItem[] = scoped.flatMap((k) => { const [kind, id] = k.split(/:(.*)/s) as [BulkKind, string]; const s = seen.get(k); return s ? [{ kind, id, seen: s }] : []; });
  const action: BulkAction = type === "extend" ? { type, date } : type === "value" ? { type, amount } : type === "category" ? { type, categoryId } : { type };
  const plan = useMemo(() => planBulk(d, { items, action, reason }), [d, items, action, reason]);
  const dirty = !!reason.trim() || date !== null || amount !== null || !!categoryId || review;
  const close = async () => { if (saving || !dirty || await askConfirm("O lote ainda não foi gravado. Descartar esta edição em massa?", { title: "Fechar edição em massa?", action: "Descartar", cancelLabel: "Continuar editando" })) onClose(); };
  const prepare = () => { if (!reason.trim()) return setError("Informe a justificativa."); if (type === "category" && !categoryId) return setError("Escolha o subgrupo."); setError(""); setReview(true); };
  const confirm = async () => { try { if (await onSave((x) => applyBulk(x, { items, action, reason, at: new Date().toISOString(), by }))) onClose(); } catch (e) { setError((e as Error).message); } };
  const label = (c: string) => d.categories.find((x) => x.id === c)?.name ?? "Não informado";
  const rec = (kind: BulkKind, id: string) => kind === "committed" ? d.committed.find((c) => c.id === id) : d.expenses.find((e) => e.id === id);
  return <SidePanel expanded wide title={review ? "Revisar edição em massa" : "Editar parcelas selecionadas"} sub={`${items.length} parcela(s) no escopo · ${keys.length} marcada(s)`} dirty={false} onClose={() => void close()} footer={<>
    {review && <Button variant="outline" disabled={saving} onClick={() => setReview(false)}>Voltar</Button>}
    <Button variant="outline" onClick={() => void close()}>Cancelar</Button>
    {review ? <Button disabled={!canEdit || saving || plan.errors.length > 0} onClick={confirm}>{isBase ? saveLabel : saving ? "Salvando…" : "Confirmar na simulação"}</Button> : <Button disabled={!canEdit} onClick={prepare}>Revisar antes de salvar</Button>}
  </>}>
    {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!review && <div className="launch-card space-y-3">
      <fieldset className="flex flex-wrap gap-4" aria-label="Escopo"><label className="flex gap-2"><input type="radio" checked={scope === "parcelas"} onChange={() => setScope("parcelas")} />Somente as parcelas marcadas ({keys.length})</label><label className="flex gap-2"><input type="radio" checked={scope === "documento"} onChange={() => setScope("documento")} />Documento inteiro das marcadas ({expandToDocuments(d, keys).length}) — só notas com vínculo comprovado</label></fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field l="Ação"><select className="inp" value={type} onChange={(e) => setType(e.target.value as ActionType)}>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {type === "extend" && <Field l="Prorrogar para (vazio = volta ao vencimento original)"><DateInput allowEmpty value={date} onChange={setDate} /></Field>}
        {type === "value" && <Field l="Novo valor de cada parcela"><MoneyInput value={amount} onChange={setAmount} /></Field>}
        {type === "category" && <Field l="Subgrupo"><select className="inp" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Escolha…</option>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.kind === "compra" ? "Compra" : "Despesa"} / {c.name}</option>)}</select></Field>}
        <Field l="Justificativa (obrigatória, registrada no histórico)" full><textarea className="inp w-full" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <p className="text-muted-foreground">Somente os itens listados na revisão são alterados; filtros e páginas não acrescentam itens. Parcelas com pagamento ficam protegidas para valor e cancelamento; o estorno continua sendo uma ação própria.</p>
    </div>}
    <p className="font-medium" role="status">Obrigação vigente: {fmtBRL(plan.totals.before)} → <b>{fmtBRL(plan.totals.after)}</b> · Pago (inalterado): {fmtBRL(plan.totals.paid)}{plan.errors.length > 0 && <span className="text-destructive"> · {plan.errors.length} bloqueada(s): o lote só grava sem bloqueios</span>}</p>
    <table className="tbl" aria-label="Revisão da edição em massa"><thead><tr><th>Fornecedor</th><th>Documento</th><th>Vencimento</th><th>Prorrogação antes → depois</th><th>Valor antes → depois</th><th>Situação antes → depois</th><th>Subgrupo antes → depois</th><th>Pago</th><th>Bloqueio</th></tr></thead>
      <tbody>{plan.rows.map((r) => { const x = rec(r.kind, r.id); return <tr key={r.kind + r.id} className={r.error ? "text-destructive" : ""}><td>{x ? supplierIdentity(d, x).name : "—"}</td><td>{r.document || "Não informado"}</td><td>{fmtDate(r.due) || "Não informado"}</td><td>{fmtDate(r.before.extensionDate) || "—"} → {fmtDate(r.after.extensionDate) || "—"}</td><td className="num">{fmtBRL(r.before.value)} → {fmtBRL(r.after.value)}</td><td>{r.before.status} → {r.after.status === "cancelado" ? "cancelado (obrigação zero)" : r.after.status}</td><td>{label(r.before.categoryId)} → {label(r.after.categoryId)}</td><td className="num">{fmtBRL(r.paid)}</td><td>{r.error ?? ""}</td></tr>; })}</tbody></table>
    {review && <p>Justificativa: {reason}. A confirmação grava somente este lote, uma única vez; outras pendências permanecem como estão.</p>}
  </SidePanel>;
}
