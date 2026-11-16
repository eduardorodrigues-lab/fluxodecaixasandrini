import { normalizeSearch, queryIndexedReport, type IndexedReportRow, type ReportSort } from './reportTable';
import type { Change } from './diff';
import type { Planned, Committed, Expense } from './engine/types';

export interface LaunchFilters {
  suppliers: string[]; category: string; subgroup: string; period: 'due' | 'extended' | 'created' | 'updated';
  from: string | null; to: string | null; document: string; order: string; situation: string; payment: string;
  min: number | null; max: number | null; description: string; extendedOnly: boolean;
}
export const emptyLaunchFilters = (): LaunchFilters => ({ suppliers: [], category: '', subgroup: '', period: 'due', from: null, to: null, document: '', order: '', situation: '', payment: '', min: null, max: null, description: '', extendedOnly: false });
export type LaunchOrder = 'created' | 'updated' | 'due' | 'value';
export interface RecordDates { created: string | null; updated: string | null; createdBy: string; updatedBy: string }
export interface LaunchFacets extends RecordDates {
  key: string; supplier: string; supplierName: string; supplierText: string; category: string; subgroup: string;
  document: string; order: string; description: string; due: string | null; extended: string | null;
  createdDay: string | null; updatedDay: string | null;
}
export type FilteredLaunch<T> = IndexedReportRow<T> & { facets: LaunchFacets };
export const launchFilterErrors = (f: LaunchFilters) => [
  ...(f.from && f.to && f.from > f.to ? ['A data De deve ser anterior ou igual à data Até.'] : []),
  ...(f.min !== null && f.max !== null && f.min > f.max ? ['O valor mínimo deve ser menor ou igual ao máximo.'] : []),
];
const spDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const spTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });
export const formatLaunchTime = (at: string | null) => at ? spTime.format(new Date(at)) : 'Não disponível';
const validTime = (at: string) => /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(at) && Number.isFinite(Date.parse(at));
const day = (at: string | null) => at ? spDay.format(new Date(at)) : null;

/** No calculations: combine cached facets, then sort the FULL result before any visual slice. */
export function filterLaunchRows<T>(rows: FilteredLaunch<T>[], f: LaunchFilters, query: string, order: LaunchOrder, columnSort: ReportSort | null = null) {
  // Invalid intervals are visible errors, not silently empty reports; ignore only that interval.
  const datesValid = !(f.from && f.to && f.from > f.to), moneyValid = !(f.min !== null && f.max !== null && f.min > f.max);
  const doc = normalizeSearch(f.document), code = normalizeSearch(f.order), description = normalizeSearch(f.description);
  const suppliers = new Set(f.suppliers);
  const filtered = rows.filter(({ facets: x, values: v }) => {
    if (suppliers.size && !suppliers.has(x.supplier)) return false;
    if (f.category && x.category !== f.category || f.subgroup && x.subgroup !== f.subgroup) return false;
    if (doc && !x.document.includes(doc) || code && !x.order.includes(code) || description && !x.description.includes(description)) return false;
    if (f.situation && v[10] !== f.situation || f.payment && v[11] !== f.payment || f.extendedOnly && !x.extended) return false;
    if (moneyValid && (f.min !== null || f.max !== null) && (typeof v[7] !== 'number' || f.min !== null && v[7] < f.min || f.max !== null && v[7] > f.max)) return false;
    if (datesValid && (f.from || f.to)) {
      const date = f.period === 'due' ? x.due : f.period === 'extended' ? x.extended : f.period === 'created' ? x.createdDay : x.updatedDay;
      if (!date || f.from && date < f.from || f.to && date > f.to) return false;
    }
    return true;
  });
  const result = queryIndexedReport(filtered, query, columnSort);
  if (columnSort) return result as FilteredLaunch<T>[];
  const value = (r: FilteredLaunch<T>) => order === 'value' ? r.values[7] : order === 'due' ? r.facets.extended ?? r.facets.due : r.facets[order];
  return (result as FilteredLaunch<T>[]).sort((a, b) => {
    const x = value(a), y = value(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null) || a.facets.key.localeCompare(b.facets.key);
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : order === 'created' || order === 'updated' ? Date.parse(String(x)) - Date.parse(String(y)) : String(x).localeCompare(String(y));
    return (order === 'due' ? cmp : -cmp) || a.facets.key.localeCompare(b.facets.key);
  });
}

export interface LaunchAudit { at: string; user: string; changes: Change[] }
type RecordSource = Planned | Committed | Expense;
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const shared = ['supplierId', 'categoryId', 'purchaseCode', 'document', 'notes', 'status'];
function parcelState(v: unknown, key: string, index: number) {
  const r = object(v), remaining = object(r["remainingOverride"]);
  if (Array.isArray(remaining["items"])) return remaining["items"].find((v) => object(v)["id"] === key) ?? null;
  if (Array.isArray(r["installments"]) && key.startsWith(`${String(r['id'])}#`)) return r["installments"][index] ?? null;
  return null;
}
/** Index existing audit once. Imported inclusions never imply historical creation. */
export function createLaunchDates(entries: LaunchAudit[]) {
  const index = new Map<string, { entry: LaunchAudit; change: Change }[]>();
  for (const entry of entries) {
    if (!validTime(entry.at)) continue;
    for (const change of entry.changes) {
      const key = JSON.stringify([change.entity, change.id]); const list = index.get(key) ?? [];
      list.push({ entry, change }); index.set(key, list);
    }
  }
  return (kind: 'planned' | 'committed' | 'expense', record: RecordSource, parcelKey = record.id, parcelIndex = 0): RecordDates => {
    const entity = kind === 'planned' ? 'Previsão (planejada)' : kind === 'committed' ? 'Efetivado (compra/pedido)' : 'Despesa';
    let created: string | null = null, updated: string | null = null, createdBy = '', updatedBy = '';
    const setCreated = (at: string, by: string) => { if (!created || Date.parse(at) < Date.parse(created)) { created = at; createdBy = by; } };
    const setUpdated = (at: string, by: string) => { if (!updated || Date.parse(at) > Date.parse(updated)) { updated = at; updatedBy = by; } };
    for (const { entry, change } of index.get(JSON.stringify([entity, record.id])) ?? []) {
      const after = object(change.after);
      const imported = kind === 'planned' ? !!after["origin"] : !!after["importOrigin"] || after["origin"] === 'legado';
      if (change.kind === 'inclusão') {
        const originalParcel = kind !== 'planned' || parcelKey.startsWith(`${record.id}#`) || object(parcelState(after, parcelKey, parcelIndex))["id"] === parcelKey;
        if (!imported && originalParcel) setCreated(entry.at, entry.user); continue;
      }
      if (change.kind !== 'alteração') continue;
      const before = object(change.before);
      if (kind !== 'planned') { setUpdated(entry.at, entry.user); continue; }
      const beforeParcel = parcelState(before, parcelKey, parcelIndex), afterParcel = parcelState(after, parcelKey, parcelIndex);
      const sharedChanged = shared.some((f) => change.fields.includes(f) && !same(before[f], after[f]));
      const logs = Array.isArray(after["editLog"]) ? after["editLog"] : [];
      const logChanged = logs.some((v) => object(v)["parcel"] === parcelKey && !((Array.isArray(before["editLog"]) ? before["editLog"] : []).some((old) => same(v, old))));
      const transitionedToRemaining = before["remainingOverride"] == null && after["remainingOverride"] != null;
      const changed = !same(beforeParcel, afterParcel) && (!transitionedToRemaining || !parcelKey.startsWith(`${record.id}#`) || logChanged);
      // If parcel arrays were replaced without changing this parcel, do not stamp siblings.
      const legacyChanged = beforeParcel === null && afterParcel === null && change.fields.some((f) => ['value', 'baseDate', 'terms', 'condition'].includes(f));
      if (sharedChanged || changed || logChanged || legacyChanged) setUpdated(entry.at, entry.user);
      // Newly added remaining parcel is not the original parcel with a new date.
      if (beforeParcel === null && afterParcel !== null && object(afterParcel)["id"] === parcelKey && !parcelKey.startsWith(`${record.id}#`) && !imported) setCreated(entry.at, entry.user);
    }
    for (const log of record.editLog ?? []) if (validTime(log.at) && (kind !== 'planned' || log.parcel === parcelKey)) setUpdated(log.at, log.by);
    if (kind !== 'planned' && 'extensionHistory' in record) for (const log of record.extensionHistory ?? []) if (validTime(log.at) && !log.note.includes('na criação')) setUpdated(log.at, '');
    if (kind === 'planned' && 'installments' in record) for (const log of record.installments?.[parcelIndex]?.extensionHistory ?? []) if (validTime(log.at) && !log.note.includes('na criação')) setUpdated(log.at, '');
    return { created, updated, createdBy, updatedBy };
  };
}
export const launchDays = (dates: RecordDates) => ({ createdDay: day(dates.created), updatedDay: day(dates.updated) });