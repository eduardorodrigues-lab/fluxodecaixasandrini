import type { ScenarioData } from "./engine/types";
import { documentGroups } from "./documentGroups";
import { computeFlow, distributePlanned, paymentsFor, splitCents, titleStatus } from "./engine/engine";
import { confirmExtension } from "./engine/actions";
import { parseBRDate, addDays } from "./dates";

export interface LaunchRef { kind: "planned" | "committed" | "expense"; id: string; parcel?: string | undefined }
export interface ManagedParcel { key: string; id: string; label: string; original: number; amount: number | null; date: string | null; extension: string | null; status: string; paid: number; boletoNumber?: string | null | undefined }
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
    const originIndex = key.startsWith(`${ref.id}#`) ? Number(key.split("#").at(-1)) : pl?.remainingOverride ? -1 : p.idx ?? i;
    const installment = pl?.installments?.[originIndex];
    const extensionLog = [...(record.editLog ?? [])].reverse().find(l => l.parcel === key && l.note.includes("prorrogação"));
    const ext = extensionLog && extensionLog.after.date === p.date ? extensionLog.after.date : !pl?.remainingOverride ? installment?.extensionDate ?? null : null;
    const first = (record.editLog ?? []).find(l => l.parcel === key);
    const originalAmount = first?.before.date ? first.before.amount : installment?.amount ?? cancelled?.before.amount ?? p.amount;
    const originalIndex = key.startsWith(`${ref.id}#`) ? Number(key.split("#").at(-1)) + 1 : i + 1;
    return { key, id: ref.id, label: `${originalIndex}/${Math.max(all.length, pl?.installments?.length ?? 0)}`, original: originalAmount, amount: p.amount, date: ext ? extensionLog?.before.date ?? installment?.date ?? p.date : p.date, extension: ext, status: cancelled || record.status === "cancelado" ? "cancelado" : record.status, paid: 0, boletoNumber: pl?.boletoNumbers && key in pl.boletoNumbers ? pl.boletoNumbers[key] : pl?.remainingOverride?.items?.[i]?.boletoNumber ?? installment?.boletoNumber ?? null };
  }) : records.map((r) => {
    const ts = titleStatus(r.value, r.status, paymentsFor(d, ref.kind === "expense" ? "expense" : "committed", r.id));
    const date = "dueDate" in r ? r.dueDate : "termDays" in r ? r.termDays === null ? null : addDays(r.baseDate, r.termDays) : null;
    return { key: r.id, id: r.id, label: group?.labels.get(r.id) ?? "1/1", original: r.value, amount: r.value, date, extension: "extensionDate" in r ? r.extensionDate : null, status: r.status, paid: ts.paid, boletoNumber: "boletoNumber" in r ? r.boletoNumber ?? null : null };
  });
  const fields: DocumentFields = { supplierId: record.supplierId, categoryId: record.categoryId, purchaseCode: record.purchaseCode ?? "", document: group?.document ?? record.document, notes: record.notes };
  return { record, records, parcels, fields };
}
export interface ManageInput { ref: LaunchRef; plannedBaseDate?: string | null; beforeRecords?: ReturnType<typeof managedDocument>["records"]; before: ManagedParcel[]; parcels: ManagedParcel[]; fields: DocumentFields; initialFields: DocumentFields; reason: string; at: string; by: string }
export function applyManaged(d: ScenarioData, input: ManageInput) {
  const { ref, parcels, fields, initialFields, before, reason, at, by } = input;
  const current = managedDocument(d, ref);
  if (JSON.stringify(current.parcels) !== JSON.stringify(before) || JSON.stringify(current.fields) !== JSON.stringify(initialFields)) throw new Error("O documento mudou. Reabra para conferir os dados atuais.");
  const newRows = parcels.filter(p=>!before.some(b=>b.key===p.key));
  if (ref.kind !== "planned" && (before.some(b=>!parcels.some(p=>p.key===b.key)) || (newRows.length && (ref.kind !== "committed" || !("noteId" in current.record) || !current.record.noteId || current.records.some(r=>!("noteId" in r) || r.noteId!==("noteId" in current.record ? current.record.noteId : undefined)))))) throw new Error("Reparcelamento exige nota com vínculo explícito; conserve as parcelas existentes.");
  if (ref.kind === "planned" && (before.some((b) => !parcels.some((p) => p.key === b.key)) || new Set(parcels.map((p) => p.key)).size !== parcels.length)) throw new Error("Conserve os IDs existentes; cancele a parcela em vez de removê-la.");
  if (JSON.stringify(current.records) !== JSON.stringify(input.beforeRecords ?? current.records)) throw new Error("O documento mudou. Seu rascunho foi preservado; confira as alterações concorrentes.");
  const changed = parcels.filter((p) => JSON.stringify(p) !== JSON.stringify(before.find((b) => b.key === p.key)));
  const metadataOnly = (p: ManagedParcel) => { const b = before.find(b => b.key === p.key); return !!b && JSON.stringify({ ...p, boletoNumber: null }) === JSON.stringify({ ...b, boletoNumber: null }); };
  const financial = changed.filter(p => !metadataOnly(p));
  for (const p of changed) if (p.boletoNumber !== null && p.boletoNumber !== undefined && typeof p.boletoNumber !== "string") throw new Error("Número do boleto deve ser texto.");
  if (financial.length && ref.kind === "planned" && current.record.status !== "ativo") throw new Error("Previsão encerrada ou cancelada está protegida.");
  if (financial.length && ref.kind === "planned") {
    const pl = d.planned.find((p) => p.id === ref.id);
    if (pl && distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations).health !== "ok") throw new Error("Previsão com abatimento pendente: confira os vínculos antes de alterar parcelas.");
  }
  if (financial.length && !reason.trim()) throw new Error("Informe a justificativa.");
  for (const p of financial) {
    const b = before.find((x) => x.key === p.key);
    if (!b && ((ref.kind !== "planned" && ref.kind !== "committed") || (ref.kind === "planned" ? p.id !== ref.id : p.id !== p.key || d.committed.some(c=>c.id===p.id)) || p.paid !== 0 || p.original !== 0)) throw new Error("Nova parcela inválida.");
    if (b && (b.paid > 0 || b.status === "cancelado")) throw new Error("Parcela com pagamento protegida ou cancelada. Confira o estorno próprio do pagamento antes de alterar.");
    if (p.amount === null || !Number.isFinite(p.amount) || p.amount < 0 || (p.status !== "cancelado" && p.amount <= 0)) throw new Error("Informe valor positivo; vazio não é zero.");
    if (!p.date || !parseBRDate(p.date) || (p.extension && (!parseBRDate(p.extension) || p.extension < p.date))) throw new Error("Confira os vencimentos e prorrogações.");
  }
  if (ref.kind === "planned") {
    const pl = d.planned.find((p) => p.id === ref.id); if (!pl) throw new Error("Previsão inexistente.");
    if (input.plannedBaseDate !== undefined && input.plannedBaseDate !== pl.baseDate) {
      if (!input.plannedBaseDate || !parseBRDate(input.plannedBaseDate)) throw new Error("Informe uma data base válida.");
      if (!reason.trim()) throw new Error("Informe a justificativa.");
      if (!pl.remainingOverride && !changed.length) {
        const items = before.map(p => ({ id:p.key, amount:p.status === "cancelado" ? 0 : p.amount ?? 0, date:p.extension ?? p.date ?? "" }));
        pl.remainingOverride = { value:items.reduce((s,p)=>s+p.amount,0), dates:items.map(p=>p.date), items };
      }
      pl.baseDate = input.plannedBaseDate;
    }
    if (financial.length) {
      const items = parcels.map((p) => ({ id: p.key, amount: p.status === "cancelado" ? 0 : p.amount ?? 0, date: p.extension ?? p.date ?? "", boletoNumber: p.boletoNumber }));
      pl.remainingOverride = { value: items.reduce((s, p) => s + p.amount, 0), dates: items.map((p) => p.date), items };
      if (parcels.every((p) => p.status === "cancelado")) pl.status = "cancelado";
      for (const p of financial) { const b = before.find((x) => x.key === p.key); (pl.editLog ??= []).push({ at, by, note: `${reason} · ${b?.status ?? "Nova parcela"} → ${p.status}${p.extension ? ` · prorrogação ${p.extension}; original ${p.date}` : ""}`, parcel: p.key, before: { amount: b?.amount ?? 0, date: b?.date ?? null }, after: { amount: p.status === "cancelado" ? 0 : p.amount ?? 0, date: p.extension ?? p.date } }); }
    }
  } else {
    if(ref.kind === "committed" && newRows.length) {
      const source=d.committed.find(c=>c.id===ref.id); if(!source?.noteId)throw new Error("Nota sem vínculo explícito.");
      let no=Math.max(0,...current.records.map(r=>"parcelNo" in r ? r.parcelNo ?? 0 : 0));
      for(const p of newRows) {
        if(p.amount===null || !p.date)throw new Error("Confira nova parcela.");
        const n=++no;
        d.committed.push({id:p.id,supplierId:fields.supplierId,categoryId:fields.categoryId,purchaseCode:fields.purchaseCode,document:fields.document,value:p.amount,dueDate:p.date,extensionDate:p.extension,extensionHistory:p.extension ? [{at,from:null,to:p.extension,note:reason}] : [],extensionInfo:"",legacyAbatement:null,origin:"manual",plannedId:source.plannedId,effectivationId:null,noteId:source.noteId,parcelNo:n,parcelCount:no,notes:fields.notes,status:"ativo",condition:null,editLog:[{at,by,note:`${reason} · Nova parcela`,parcel:p.key,before:{amount:0,date:null},after:{amount:p.amount,date:p.extension??p.date}}]});
      }
      // Existing parcel numbers/counts and payments remain untouched, including paid history.
    }
    for (const p of financial) {
      if(newRows.some(n=>n.key===p.key))continue;
      const r = ref.kind === "committed" ? d.committed.find((c) => c.id === p.id) : d.expenses.find((e) => e.id === p.id);
      const b = before.find((x) => x.key === p.key); if (!r || !b || !p.date || p.amount === null) throw new Error("Parcela inexistente.");
      r.value = p.amount; r.status = p.status === "cancelado" ? "cancelado" : "ativo";
      if (p.date !== b.date) { if ("dueDate" in r) r.dueDate = p.date; else { r.termDays = Math.round((Date.parse(p.date) - Date.parse(r.baseDate)) / 86400000); } }
      if (p.extension !== b.extension) confirmExtension(d, ref.kind, p.id, p.extension, reason, at);
      (r.editLog ??= []).push({ at, by, note: `${reason} · ${b.status} → ${p.status}`, parcel: p.key, before: { amount: b.original, date: b.date }, after: { amount: p.status === "cancelado" ? 0 : p.amount, date: p.extension ?? p.date } });
    }
  }
  for (const p of changed) {
    const b = before.find(b => b.key === p.key);
    if ((b?.boletoNumber ?? null) === (p.boletoNumber ?? null)) continue;
    const r = ref.kind === "planned" ? d.planned.find(r => r.id === ref.id) : ref.kind === "committed" ? d.committed.find(r => r.id === p.id) : d.expenses.find(r => r.id === p.id);
    if (!r) throw new Error("Parcela inexistente.");
    if (ref.kind === "planned" && "baseDate" in r && "remainingOverride" in r) (r.boletoNumbers ??= {})[p.key] = p.boletoNumber ?? null;
    else Object.assign(r, { boletoNumber: p.boletoNumber ?? null });
    (r.editLog ??= []).push({ at, by, note: `Número do boleto · ${reason || "Identificação da parcela"}`, parcel: p.key, before: { amount: b?.amount ?? 0, date: b?.date ?? null, boletoNumber: b?.boletoNumber ?? null }, after: { amount: p.amount ?? 0, date: p.date, boletoNumber: p.boletoNumber ?? null } });
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