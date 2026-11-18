import type { ScenarioData, Supplier, SupplierCondition } from "./engine/types";
import { condPeriods, currentCondition, supplierConditions, syncTerms } from "./notas";
import { copyValue } from './copyValue';

export type ConditionChange =
  | { kind: "edit"; name: string; note: string; terms: (number | null)[] }
  | { kind: "cancel"; reason: string; replacementId: string | null; acknowledge: boolean }
  | { kind: "period"; index: number; reason: string; replacementId: string | null; acknowledge: boolean }
  | { kind: "delete" };

export function conditionImpact(s: Supplier, id: string, today: string, periodIndex?: number): string[] {
  const c = supplierConditions(s).find((x) => x.id === id);
  if (!c || c.cancelled) return [];
  const periods = condPeriods(c);
  const starts = periodIndex === undefined ? periods.filter((p) => !p.cancelled).map((p) => p.from ?? today) : periods[periodIndex] && !periods[periodIndex]?.cancelled ? [periods[periodIndex]?.from ?? today] : [];
  return [...new Set([today, ...starts.filter((date) => date >= today)])].filter((date) => {
    if (currentCondition(s, date)?.id !== id) return false;
    if (periodIndex === undefined) return true;
    const winner = periods.filter((p) => (p.from ?? "") <= date).sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "") || a.at.localeCompare(b.at)).at(-1);
    return winner === periods[periodIndex];
  }).sort();
}

export function conditionLinked(d: ScenarioData, supplierId: string, c: SupplierCondition): boolean {
  const versions = [c, ...(c.history ?? [])];
  return [...d.planned, ...d.committed].some((r) => r.supplierId === supplierId && (
    r.condition && versions.some((v) => r.condition?.name === v.name && JSON.stringify(r.condition.terms) === JSON.stringify(v.terms))
    || !r.condition // vínculo legado sem identificação: bloquear conservadoramente
  )) || d.importLog.some((r) => r.refId === c.id || r.refId === supplierId);
}

export function changeCondition(d: ScenarioData, supplierId: string, id: string, change: ConditionChange, at: string, by: string, today: string) {
  const s = d.suppliers.find((x) => x.id === supplierId);
  if (!s) throw new Error("Fornecedor não encontrado.");
  const list = supplierConditions(s);
  const original = list.find((x) => x.id === id);
  if (!original) throw new Error("Condição não encontrada.");
  if (change.kind === "delete") {
    if (conditionLinked(d, supplierId, original) || condPeriods(original).length || original.history?.length || original.cancelled) throw new Error("Exclusão bloqueada: condição possui utilização, histórico ou períodos de vigência. Use Cancelar condição.");
    s.conditions = list.filter((x) => x.id !== id);
    return;
  }
  if (original.cancelled) throw new Error("Condição já cancelada.");
  if (change.kind === "edit") {
    if (!change.name.trim() || !change.terms.some((t) => t !== null) || change.terms.some((t) => t !== null && (!Number.isInteger(t) || t < 0))) throw new Error("Informe nome e prazos inteiros não negativos.");
  } else {
    if (!change.reason.trim()) throw new Error("Informe o motivo do cancelamento.");
    if (change.kind === "period" && (!condPeriods(original)[change.index] || condPeriods(original)[change.index]?.cancelled)) throw new Error("Ativação não disponível para cancelamento.");
    const impact = conditionImpact(s, id, today, change.kind === "period" ? change.index : undefined);
    if (impact.length && !change.acknowledge) throw new Error("Confirme a substituta ou a ausência de condição padrão nos períodos afetados.");
    if (change.replacementId && !list.some((c) => c.id === change.replacementId && c.id !== id && !c.cancelled)) throw new Error("Selecione uma condição substituta válida.");
  }
  const impact = change.kind === "edit" ? [] : conditionImpact(s, id, today, change.kind === "period" ? change.index : undefined);
  // Materializa o cadastro legado e congela previsões por prazos ANTES de mudar o padrão.
  s.conditions = list.map(copyValue);
  const c = s.conditions.find((x) => x.id === id);
  if (!c) return;
  const oldTerms = [...s.terms];
  if (change.kind === "edit" && JSON.stringify(c.terms) !== JSON.stringify(change.terms)) {
    for (const p of d.planned) if (p.supplierId === supplierId && !p.terms && !p.installments?.length) p.terms = [...oldTerms];
  }
  c.history = [...(c.history ?? []), { at, by, action: change.kind === "edit" ? "Edição" : change.kind === "cancel" ? "Cancelamento da condição" : "Cancelamento de ativação", name: c.name, terms: [...c.terms], note: c.note ?? "", reason: change.kind === "edit" ? "" : change.reason }];
  if (change.kind === "edit") Object.assign(c, { name: change.name.trim(), note: change.note.trim(), terms: [...change.terms] });
  else {
    const event = { at, by, reason: change.reason.trim() };
    if (change.kind === "cancel") c.cancelled = event;
    else { c.periods = condPeriods(c).map(copyValue); const period = c.periods[change.index]; if (period) period.cancelled = event; }
    if (change.replacementId) {
      const replacement = s.conditions.find((x) => x.id === change.replacementId);
      if (replacement) replacement.periods = [...condPeriods(replacement), ...impact.map((from) => ({ from, at, by }))];
    }
  }
  syncTerms(d, s, today);
}