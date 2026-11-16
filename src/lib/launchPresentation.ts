import { documentGroups } from "./documentGroups";
import { supplierIdentity } from "./supplierIdentity";
import { accountName, NO_ACCOUNT } from "./engine/banco";
import { distributePlanned, titleStatus } from "./engine/engine";
import type { ScenarioData, CategoryKind } from "./engine/types";
import { addDays, fmtDate } from "./dates";
import { fmtBRL } from "./money";
import { dateValue, parcelValue, indexReport } from "./reportTable";

/** Read-only, per-data-snapshot lazy models. No shared cache across organizations/scenarios. */
export function createLaunchPresentation(d: ScenarioData) {
  const suppliers = new Map(d.suppliers.map(s => [s.id, s]));
  const categories = new Map(d.categories.map(c => [c.id, c]));
  const titles = { committed: new Map(d.committed.map(c => [c.id, c])), expense: new Map(d.expenses.map(e => [e.id, e])) };
  const payments = new Map<string, ScenarioData["payments"]>();
  for (const p of d.payments) { const key = JSON.stringify([p.titleKind, p.titleId]); const list = payments.get(key) ?? []; list.push(p); payments.set(key, list); }
  const paymentsFor = (_: ScenarioData, kind: string, id: string) => payments.get(JSON.stringify([kind, id])) ?? [];
  const sup = (id: string) => suppliers.get(id);
  const catOf = (id: string) => categories.get(id);
  const kindOfCat = (id: string): CategoryKind | "" => catOf(id)?.kind ?? "";
  const kindL = (id: string, fb: CategoryKind = "compra") => ((kindOfCat(id) || fb) === "compra" ? "Compra" : "Despesa");
  let cachedGroups: ReturnType<typeof documentGroups> | undefined;
  const getGroups = () => cachedGroups ??= documentGroups(d);
  const buildPlanned = () => {
  // ---- Planejada: uma linha por parcela ----
  const plannedSource = d.planned.flatMap((p) => {
    const r = distributePlanned(p, sup(p.supplierId), d.committed, d.params.profile, d.effectivations);
    const inst = p.installments?.length && !p.remainingOverride ? p.installments : null;
    const parts = r.parcels.length ? r.parcels : [null];
    return parts.map((pc, i) => ({ p, r, pc, i, n: parts.length, it: inst && pc ? inst[pc.idx ?? i] ?? null : null, idx: pc?.idx ?? i }));
  });
  const plannedValues = ({ p, r, pc, i, n, it }: (typeof plannedSource)[number]) => [kindL(p.categoryId), catOf(p.categoryId)?.name, (supplierIdentity(d, p).name), p.purchaseCode, p.document, p.notes, pc ? i + 1 : null, pc?.amount, dateValue(it?.date ?? pc?.date), dateValue(it?.extensionDate), p.status === "encerrado" ? "Encerrada" : p.status === "cancelado" ? "Cancelada" : r.effectivated > 0 ? "Efetivada parcialmente" : "Prevista"];
    return indexReport(plannedSource, plannedValues, (row) => [...plannedValues(row), ...(sup(row.p.supplierId)?.aliases ?? []), row.pc ? `${row.i + 1}/${row.n}` : "", row.pc ? fmtBRL(row.pc.amount) : "", fmtDate(row.it?.date ?? row.pc?.date ?? null), fmtDate(row.it?.extensionDate ?? null), row.r.health !== "ok" ? "conciliação pendente" : ""]);
  };
  const buildCommitted = () => {
  const groups = getGroups();
  const labels = new Map([...groups.byId].map(([id, group]) => [id, group.labels.get(id) ?? "1/1"]));
  // ---- Efetivado: títulos (já são parcelas) ----
  const committedSource = [...d.committed.map((c) => ({ t: "committed" as const, c, catId: c.categoryId })), ...d.expenses.map((e) => ({ t: "expense" as const, e, catId: e.categoryId }))];

  const committedValues = (row: (typeof committedSource)[number]) => {
    const t = row.t === "committed" ? row.c : row.e;
    const ts = titleStatus(t.value, t.status, paymentsFor(d, row.t, t.id));
    const due = row.t === "committed" ? row.c.dueDate : row.e.termDays != null ? addDays(row.e.baseDate, row.e.termDays) : null;
    return [kindL(t.categoryId, row.t === "expense" ? "despesa" : "compra"), catOf(t.categoryId)?.name, (supplierIdentity(d, t).name), row.t === "committed" ? row.c.purchaseCode : null, row.t === "committed" ? groups.byId.get(t.id)?.document ?? t.document : t.document, t.notes, parcelValue(labels.get(t.id) ?? "1/1"), t.value, dateValue(due), dateValue(t.extensionDate), t.status === "cancelado" ? "Cancelado" : row.t === "committed" && row.c.origin === "efetivacao" ? "Efetivado (previsão)" : row.t === "committed" && row.c.origin === "legado" ? "Efetivado (histórico)" : "Efetivado", ts.state === "Parcial" ? "Parcialmente pago" : ts.state, ts.paid, Math.max(0, ts.open)];
  };
    return indexReport(committedSource, committedValues, (row) => {
    const t = row.t === "committed" ? row.c : row.e;
    const v = committedValues(row);
    return [...v, t.document, ...(sup(t.supplierId)?.aliases ?? []), labels.get(t.id) ?? "1/1", ...[7, 12, 13].map((i) => fmtBRL(Number(v[i]))), ...[8, 9].map((i) => typeof v[i] === "number" ? fmtDate(new Date(v[i]).toISOString().slice(0, 10)) : ""), paymentsFor(d, row.t, t.id).some((p) => p.method === "cartao") ? "Quitado com cartão parte no cartão" : ""];
  });
  };
  const buildPayments = () => {
  const groups = getGroups();
  const labels = new Map([...groups.byId].map(([id, group]) => [id, group.labels.get(id) ?? "1/1"]));
  const paymentValues = (p: ScenarioData["payments"][number]) => {
    const t = titles[p.titleKind].get(p.titleId);
    return [dateValue(p.date), `${(supplierIdentity(d, t).name) ?? ""} · ${t?.document || "sem documento"}${labels.get(p.titleId) ? ` · parcela ${labels.get(p.titleId)}` : ""}`, p.method === "cartao" ? "Quitado com cartão" : p.accountId ? accountName(d, p.accountId) : NO_ACCOUNT, p.amount, p.note, p.reversedAt ? `estornado ${fmtDate(p.reversedAt.slice(0, 10))}: ${p.reversalNote}` : "ativo"];
  };
    return indexReport(d.payments, paymentValues, (p) => {
    const t = titles[p.titleKind].get(p.titleId);
    return [...paymentValues(p), ...(sup(t?.supplierId ?? "")?.aliases ?? []), t?.notes, t?.categoryId ? catOf(t.categoryId)?.name : "", fmtDate(p.date), fmtBRL(p.amount)];
  });
  };
  let planned: ReturnType<typeof buildPlanned> | undefined;
  let committed: ReturnType<typeof buildCommitted> | undefined;
  let paymentRows: ReturnType<typeof buildPayments> | undefined;
  return {
    get planned() { return planned ??= buildPlanned(); },
    get committed() { return committed ??= buildCommitted(); },
    get payments() { return paymentRows ??= buildPayments(); },
    get groups() { return getGroups(); },
    paymentsFor: (kind: string, id: string) => paymentsFor(d, kind, id),
  };
}
