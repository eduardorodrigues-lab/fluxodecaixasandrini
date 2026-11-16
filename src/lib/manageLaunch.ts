import type { ScenarioData } from "./engine/types";
import { documentGroups } from "./documentGroups";
import { computeFlow, distributePlanned, paymentsFor, splitCents, titleStatus } from "./engine/engine";
import { confirmExtension } from "./engine/actions";
import { parseBRDate, addDays } from "./dates";

export interface LaunchRef { kind: "planned" | "committed" | "expense"; id: string; parcel?: string | undefined }
export interface ManagedParcel { key: string; id: string; label: string; original: number; amount: number | null; date: string | null; extension: string | null; status: string; paid: number }
export interface DocumentFields { supplierId: string; categoryId: string; purchaseCode: string; document: string; notes: string }
export function managedDocument(d: ScenarioData, ref: LaunchRef) {
  const record = ref.kind === "planned" ? d.planned.find((x) => x.id === ref.id) : ref.kind === "committed" ? d.committed.find((x) => x.id === ref.id) : d.expenses.find((x) => x.id === ref.id);
  if (!record) throw new Error("Lançamento não encontrado nesta organização.");
  const group = ref.kind === "committed" ? documentGroups(d).byId.get(ref.id) : undefined;
  const records = group?.titles ?? [record];
  const pl = ref.kind === "planned" ? d.planned.find((x) => x.id === ref.id) : undefined;
  const plannedParcels = pl ? distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations).parcels : [];
  const parcels: ManagedParcel[] = ref.kind === "planned" ? plannedParcels.map((p, i, all) => {
    const key = pl?.remainingOverride?.items?.[i]?.id ?? `${ref.id}#${p.idx ?? i}`;
    const last = [...(record.editLog ?? [])].reverse().find((l) => l.parcel === key);
    const cancelled = last?.after.amount === 0 ? last : undefined;
    const installment = pl?.installments?.[p.idx ?? i];
    const ext = last?.note.includes("prorrogação") ? last.after.date : !pl?.remainingOverride ? installment?.extensionDate ?? null : null;
    return { key, id: ref.id, label: `${i + 1}/${all.length}`, original: cancelled?.before.amount ?? p.amount, amount: p.amount, date: ext ? last?.before.date ?? installment?.date ?? p.date : p.date, extension: ext, status: cancelled || record.status === "cancelado" ? "cancelado" : record.status, paid: 0 };
  }) : records.map((r) => {
    const ts = titleStatus(r.value, r.status, paymentsFor(d, ref.kind === "expense" ? "expense" : "committed", r.id));
    const date = "dueDate" in r ? r.dueDate : "termDays" in r ? r.termDays === null ? null : addDays(r.baseDate, r.termDays) : null;
    return { key: r.id, id: r.id, label: group?.labels.get(r.id) ?? "1/1", original: r.value, amount: r.value, date, extension: "extensionDate" in r ? r.extensionDate : null, status: r.status, paid: ts.paid };
  });
  const fields: DocumentFields = { supplierId: record.supplierId, categoryId: record.categoryId, purchaseCode: record.purchaseCode ?? "", document: group?.document ?? record.document, notes: record.notes };
  return { record, records, parcels, fields };
}
export interface ManageInput { ref: LaunchRef; before: ManagedParcel[]; parcels: ManagedParcel[]; fields: DocumentFields; initialFields: DocumentFields; reason: string; at: string; by: string }
export function applyManaged(d: ScenarioData, input: ManageInput) {
  const { ref, parcels, fields, initialFields, before, reason, at, by } = input;
  const current = managedDocument(d, ref);
  if (JSON.stringify(current.parcels) !== JSON.stringify(before) || JSON.stringify(current.fields) !== JSON.stringify(initialFields)) throw new Error("O documento mudou. Reabra para conferir os dados atuais.");
  if (parcels.length !== before.length || parcels.some((p) => !before.some((b) => b.key === p.key))) throw new Error("Reparcelamento exige revisão específica.");
  const changed = parcels.filter((p) => JSON.stringify(p) !== JSON.stringify(before.find((b) => b.key === p.key)));
  if (changed.length && ref.kind === "planned" && current.record.status !== "ativo") throw new Error("Previsão encerrada ou cancelada está protegida.");
  if (changed.length && ref.kind === "planned") {
    const pl = d.planned.find((p) => p.id === ref.id);
    if (pl && distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations).health !== "ok") throw new Error("Previsão com abatimento pendente: confira os vínculos antes de alterar parcelas.");
  }
  if (changed.length && !reason.trim()) throw new Error("Informe a justificativa.");
  for (const p of changed) {
    const b = before.find((x) => x.key === p.key); if (!b) throw new Error("Parcela inexistente.");
    if (b.paid > 0) throw new Error("Parcela com pagamento protegida. Confira o estorno próprio do pagamento antes de alterar.");
    if (p.amount === null || !Number.isFinite(p.amount) || p.amount < 0 || (p.status !== "cancelado" && p.amount <= 0)) throw new Error("Informe valor positivo; vazio não é zero.");
    if (!p.date || !parseBRDate(p.date) || (p.extension && (!parseBRDate(p.extension) || p.extension < p.date))) throw new Error("Confira os vencimentos e prorrogações.");
  }
  if (ref.kind === "planned") {
    const pl = d.planned.find((p) => p.id === ref.id); if (!pl) throw new Error("Previsão inexistente.");
    if (changed.length) {
      const items = parcels.map((p) => ({ id: p.key, amount: p.status === "cancelado" ? 0 : p.amount ?? 0, date: p.extension ?? p.date ?? "" }));
      pl.remainingOverride = { value: items.reduce((s, p) => s + p.amount, 0), dates: items.map((p) => p.date), items };
      if (parcels.every((p) => p.status === "cancelado")) pl.status = "cancelado";
      for (const p of changed) { const b = before.find((x) => x.key === p.key); if (b) (pl.editLog ??= []).push({ at, by, note: `${reason} · ${b.status} → ${p.status}${p.extension ? ` · prorrogação ${p.extension}; original ${b.date}` : ""}`, parcel: p.key, before: { amount: b.original, date: b.date }, after: { amount: p.status === "cancelado" ? 0 : p.amount ?? 0, date: p.extension ?? p.date } }); }
    }
  } else {
    for (const p of changed) {
      const r = ref.kind === "committed" ? d.committed.find((c) => c.id === p.id) : d.expenses.find((e) => e.id === p.id);
      const b = before.find((x) => x.key === p.key); if (!r || !b || !p.date || p.amount === null) throw new Error("Parcela inexistente.");
      r.value = p.amount; r.status = p.status === "cancelado" ? "cancelado" : "ativo";
      if (p.date !== b.date) { if ("dueDate" in r) r.dueDate = p.date; else { r.termDays = Math.round((Date.parse(p.date) - Date.parse(r.baseDate)) / 86400000); } }
      if (p.extension !== b.extension) confirmExtension(d, ref.kind, p.id, p.extension, reason, at);
      (r.editLog ??= []).push({ at, by, note: `${reason} · ${b.status} → ${p.status}`, parcel: p.key, before: { amount: b.original, date: b.date }, after: { amount: p.status === "cancelado" ? 0 : p.amount, date: p.extension ?? p.date } });
    }
  }
  for (const source of current.records) {
    const r = ref.kind === "planned" ? d.planned.find((x) => x.id === source.id) : ref.kind === "committed" ? d.committed.find((x) => x.id === source.id) : d.expenses.find((x) => x.id === source.id);
    if (!r) continue;
    if (ref.kind === "planned" && fields.supplierId !== initialFields.supplierId && "terms" in r && !r.terms && !r.installments?.length && !r.remainingOverride) r.terms = [...(d.suppliers.find((s) => s.id === initialFields.supplierId)?.terms ?? [])];
    for (const k of ["supplierId", "categoryId", "purchaseCode", "document", "notes"] as const) if (fields[k] !== initialFields[k]) Object.assign(r, { [k]: fields[k] });
  }
}
export function validateManualRemaining(value: number | null, confirmed: boolean, parcels: { amount: number | null; date: string | null }[]) {
  if (value === null || !confirmed || value < 0) return "Informe e confirme o saldo restante previsto (R$ 0,00 para encerrar).";
  if (parcels.some((p) => p.amount === null || p.amount <= 0 || !p.date || !parseBRDate(p.date))) return "Confira valores e vencimentos do restante.";
  if (parcels.reduce((s, p) => s + (p.amount ?? 0), 0) !== value) return "As parcelas restantes devem somar o saldo informado manualmente.";
  return "";
}
export function redistributeSelected(parcels: ManagedParcel[], selected: string[], total: number | null) {
  const chosen = parcels.filter((p) => selected.includes(p.key));
  if (!chosen.length || total === null || !Number.isInteger(total) || total <= 0) throw new Error("Informe total positivo e selecione as parcelas.");
  if (chosen.some((p) => p.paid > 0 || p.status === "cancelado")) throw new Error("Parcelas pagas ou canceladas estão protegidas.");
  const parts = splitCents(total, chosen.length).parts;
  return parcels.map((p) => { const i = chosen.findIndex((c) => c.key === p.key); return i < 0 ? p : { ...p, amount: parts[i] ?? p.amount }; });
}
export function flowImpact(before: ScenarioData, after: ScenarioData) {
  const opt = { start: "2025-01-01", end: "2030-12-31" };
  const a = computeFlow(before, opt).days, b = computeFlow(after, opt).days;
  return b.flatMap((day, i) => { const old = a[i]; return old && (old.saidas !== day.saidas || old.saldoFinal !== day.saldoFinal) ? [{ date: day.date, before: old.saidas, after: day.saidas, balanceBefore: old.saldoFinal, balanceAfter: day.saldoFinal }] : []; });
}