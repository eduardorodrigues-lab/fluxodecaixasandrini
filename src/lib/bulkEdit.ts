import type { ScenarioData } from "./engine/types";
import { paymentsFor, titleStatus } from "./engine/engine";
import { documentGroups } from "./documentGroups";
import { addDays, parseBRDate } from "./dates";

/** Edição em massa de títulos efetivados (compras efetivadas e despesas) por seleção explícita.
 *  Só os IDs selecionados são afetados; cada item leva o estado visto na seleção para detectar alterações concorrentes. */
export type BulkKind = "committed" | "expense";
export interface BulkSnapshot { value: number; status: string; extensionDate: string | null; categoryId: string }
export interface BulkItem { kind: BulkKind; id: string; seen: BulkSnapshot }
export type BulkAction = { type: "cancel" } | { type: "extend"; date: string | null } | { type: "category"; categoryId: string } | { type: "value"; amount: number | null };
export interface BulkInput { items: BulkItem[]; action: BulkAction; reason: string; at: string; by: string }
export interface BulkRow { kind: BulkKind; id: string; document: string; due: string | null; before: BulkSnapshot; after: BulkSnapshot; paid: number; error: string | null }

export const bulkKey = (kind: BulkKind, id: string) => `${kind}:${id}`;
const record = (d: ScenarioData, kind: BulkKind, id: string) => kind === "committed" ? d.committed.find((c) => c.id === id) : d.expenses.find((e) => e.id === id);
export function snapshotOf(d: ScenarioData, kind: BulkKind, id: string): BulkSnapshot | null {
  const r = record(d, kind, id); return r ? { value: r.value, status: r.status, extensionDate: r.extensionDate, categoryId: r.categoryId } : null;
}
/** Amplia a seleção para o documento inteiro somente quando o vínculo de nota é comprovado (mesma regra da listagem). */
export function expandToDocuments(d: ScenarioData, keys: string[]): string[] {
  const groups = documentGroups(d), out = new Set(keys);
  for (const k of keys) { const [kind, id] = k.split(/:(.*)/s) as [BulkKind, string]; if (kind === "committed") groups.byId.get(id)?.titles.forEach((t) => out.add(bulkKey("committed", t.id))); }
  return [...out];
}

export function planBulk(d: ScenarioData, input: Omit<BulkInput, "at" | "by">) {
  const a = input.action;
  const rows: BulkRow[] = input.items.map(({ kind, id, seen }) => {
    const r = record(d, kind, id);
    if (!r) return { kind, id, document: "", due: null, before: seen, after: seen, paid: 0, error: "Registro não existe mais nesta base." };
    const now = snapshotOf(d, kind, id)!;
    const due = kind === "committed" ? (r as ScenarioData["committed"][number]).dueDate : (r as ScenarioData["expenses"][number]).termDays == null ? null : addDays((r as ScenarioData["expenses"][number]).baseDate, (r as ScenarioData["expenses"][number]).termDays!);
    const paid = titleStatus(r.value, r.status, paymentsFor(d, kind, id)).paid;
    const row: BulkRow = { kind, id, document: r.document, due, before: now, after: { ...now }, paid, error: null };
    if (JSON.stringify(now) !== JSON.stringify(seen)) { row.error = "Alterado por outra pessoa depois da seleção. Revise novamente."; return row; }
    if (a.type === "category") { row.after.categoryId = a.categoryId; return row; }
    if (r.status === "cancelado") { row.error = "Parcela já cancelada."; return row; }
    if (a.type === "cancel") { if (paid > 0) row.error = "Possui pagamento: registre o estorno antes de cancelar."; else row.after.status = "cancelado"; return row; }
    if (a.type === "value") { if (paid > 0) row.error = "Possui pagamento: valor protegido."; else if (a.amount === null || !Number.isInteger(a.amount) || a.amount <= 0) row.error = "Informe valor positivo; vazio não é zero."; else row.after.value = a.amount; return row; }
    if (paid >= r.value) { row.error = "Parcela quitada: vencimento protegido."; return row; }
    if (!due) { row.error = "Sem vencimento original para prorrogar."; return row; }
    if (a.date && (!parseBRDate(a.date) || a.date < due)) { row.error = "Prorrogação anterior ao vencimento original."; return row; }
    row.after.extensionDate = a.date; return row;
  });
  const sum = (f: (r: BulkRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const obligation = (s: BulkSnapshot) => s.status === "cancelado" ? 0 : s.value;
  return { rows, errors: rows.filter((r) => r.error), totals: { count: rows.length, before: sum((r) => obligation(r.before)), after: sum((r) => r.error ? obligation(r.before) : obligation(r.after)), paid: sum((r) => r.paid) } };
}

/** Aplica tudo ou nada: qualquer item com erro bloqueia o lote inteiro. */
export function applyBulk(d: ScenarioData, input: BulkInput) {
  if (!input.items.length) throw new Error("Nenhuma parcela selecionada.");
  if (!input.reason.trim()) throw new Error("Informe a justificativa.");
  if (input.action.type === "category" && !d.categories.some((c) => c.id === (input.action as { categoryId: string }).categoryId)) throw new Error("Subgrupo inexistente.");
  const plan = planBulk(d, input);
  if (plan.errors.length) throw new Error(`${plan.errors.length} item(ns) bloqueado(s): ${plan.errors.slice(0, 3).map((r) => `${r.document || r.id} — ${r.error}`).join("; ")}`);
  for (const row of plan.rows) {
    const r = record(d, row.kind, row.id)!;
    const b = row.before, n = row.after;
    if (n.categoryId !== b.categoryId) r.categoryId = n.categoryId;
    if (n.extensionDate !== b.extensionDate) { r.extensionHistory.push({ at: input.at, from: b.extensionDate, to: n.extensionDate, note: input.reason }); r.extensionDate = n.extensionDate; }
    if (n.value !== b.value) r.value = n.value;
    if (n.status !== b.status) r.status = n.status as typeof r.status;
    if (JSON.stringify(n) !== JSON.stringify(b)) (r.editLog ??= []).push({ at: input.at, by: input.by, note: `${input.reason} · edição em lote (${input.action.type})`, parcel: r.id, before: { amount: b.status === "cancelado" ? 0 : b.value, date: b.extensionDate ?? row.due }, after: { amount: n.status === "cancelado" ? 0 : n.value, date: n.extensionDate ?? row.due } });
  }
  return plan;
}
