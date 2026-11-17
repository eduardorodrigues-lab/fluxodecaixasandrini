import type { Committed, EditLog, Planned, ScenarioData } from "./engine/types";
import { paymentsFor, titleStatus } from "./engine/engine";
import { supplierIdentity } from "./supplierIdentity";

/**
 * Planejado × Efetivado — leitura pura, sem gravar.
 * Escopo = uma previsão (Planned) e somente vínculos explícitos: Committed.plannedId ou Effectivation.committedIds
 * de efetivações não revertidas. Nunca associa por código de pedido/fornecedor.
 * Total atual = efetivado acumulado + restante previsto CONFIRMADO; Diferença = Total atual − Planejado de referência.
 */
export type Comparison = "Acima" | "Abaixo" | "Sem diferença" | "Não comparável";
export type PvaSituation = "Parcial" | "Concluído" | "Previsão cancelada";
export interface PvaNote { boletoNumber?: string | null | undefined; id: string; document: string; noteId: string | null; parcel: string; value: number; due: string; extension: string | null; status: string; paid: number; effectivationAt: string | null; cancelled: boolean }
export interface PvaHistory { at: string; by: string; note: string; scope: string; before: EditLog["before"]; after: EditLog["after"] }
export interface PvaRow {
  plannedId: string; purchaseCode: string; document: string; supplierKey: string; supplier: string;
  category: string; subgroupId: string; subgroup: string;
  baseline: number | null; baselineSource: string; effective: number; remaining: number | null; remainingSource: string;
  total: number | null; diff: number | null; pct: number | null; pctNote: string | null;
  comparison: Comparison; reason: string | null; situation: PvaSituation;
  firstEffAt: string | null; lastEffAt: string | null; effDates: string[]; notes: PvaNote[]; cancelledValue: number;
  justification: string[]; history: PvaHistory[];
}

const eq = (a: number, b: number) => Math.abs(a - b) < 0.5; // tolerância < meio centavo (valores importados podem ter fração)

export function planVsActual(d: ScenarioData): PvaRow[] {
  const categories = new Map(d.categories.map((c) => [c.id, c]));
  const effsByPlan = new Map<string, ScenarioData["effectivations"]>();
  for (const e of d.effectivations) if (!e.reversedAt) effsByPlan.set(e.plannedId, [...(effsByPlan.get(e.plannedId) ?? []), e]);
  const owners = new Map<string, Set<string>>(); // título → previsões que o reivindicam explicitamente
  const claim = (cid: string, pid: string) => owners.set(cid, (owners.get(cid) ?? new Set()).add(pid));
  for (const c of d.committed) if (c.plannedId) claim(c.id, c.plannedId);
  for (const [pid, es] of effsByPlan) for (const e of es) for (const id of e.committedIds) claim(id, pid);
  const byId = new Map(d.committed.map((c) => [c.id, c]));
  const effOf = new Map<string, string>(); for (const es of effsByPlan.values()) for (const e of es) for (const id of e.committedIds) effOf.set(id, e.at);
  const rows: PvaRow[] = [];
  for (const p of d.planned) {
    const effs = [...(effsByPlan.get(p.id) ?? [])].sort((a, b) => a.at.localeCompare(b.at));
    const ids = new Set<string>(); for (const [cid, ps] of owners) if (ps.has(p.id)) ids.add(cid);
    if (!effs.length && !ids.size) continue; // sem efetivação nem vínculo: fora do comparativo
    const linked = [...ids].map((id) => byId.get(id)).filter((c): c is Committed => !!c);
    const ambiguous = linked.filter((c) => (owners.get(c.id)?.size ?? 0) > 1);
    const active = linked.filter((c) => c.status !== "cancelado");
    const effective = active.reduce((a, c) => a + c.value, 0); // valor do título; pagamentos não somam de novo
    const cancelledValue = linked.filter((c) => c.status === "cancelado").reduce((a, c) => a + c.value, 0);
    const notes: PvaNote[] = linked.map((c) => { const ts = titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id)); return { boletoNumber:c.boletoNumber, id: c.id, document: c.document, noteId: c.noteId ?? null, parcel: c.parcelNo && c.parcelCount ? `${c.parcelNo}/${c.parcelCount}` : "Não informado", value: c.value, due: c.dueDate, extension: c.extensionDate, status: ts.state, paid: ts.paid, effectivationAt: effOf.get(c.id) ?? null, cancelled: c.status === "cancelado" }; })
      .sort((a, b) => a.document.localeCompare(b.document) || a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
    // Referência: valor da previsão (a efetivação altera status/restante, nunca Planned.value). Revisão posterior à 1ª efetivação invalida a prova.
    const history: PvaHistory[] = [...(p.editLog ?? []).map((h) => ({ ...h, scope: "Previsão" })), ...linked.flatMap((c) => (c.editLog ?? []).map((h) => ({ ...h, scope: `Nota ${c.document || "sem documento"}` })))].sort((a, b) => a.at.localeCompare(b.at));
    const firstAt = effs[0]?.at ?? null;
    const revisedAfter = firstAt ? (p.editLog ?? []).some((h) => h.at > firstAt && h.before.amount !== h.after.amount) : false;
    let baseline: number | null = p.value, baselineSource = firstAt ? `Valor da previsão preservado na 1ª efetivação (${firstAt.slice(0, 10)})` : "Valor da previsão; vínculo sem evento de efetivação datado";
    if ((p.editLog ?? []).length && !revisedAfter) baselineSource += " · revisões anteriores registradas no histórico";
    let reason: string | null = null;
    if (revisedAfter) { baseline = null; baselineSource = "Não disponível: previsão revisada após a efetivação sem fotografia anterior"; }
    else if (!Number.isFinite(p.value)) { baseline = null; baselineSource = "Não disponível"; }
    let remaining: number | null = null, remainingSource = "Restante não confirmado";
    if (p.status === "encerrado") { remaining = 0; remainingSource = "Restante encerrado (confirmado)"; }
    else if (p.remainingOverride) { remaining = p.remainingOverride.value; remainingSource = "Restante previsto confirmado"; }
    const situation: PvaSituation = p.status === "cancelado" ? "Previsão cancelada" : p.status === "encerrado" || (remaining !== null && eq(remaining, 0)) ? "Concluído" : "Parcial";
    if (ambiguous.length) reason = `Vínculo ambíguo: ${ambiguous.length} título(s) reivindicados por mais de uma previsão`;
    else if (p.status === "cancelado") reason = "Previsão cancelada — não tratada como economia";
    else if (baseline === null) reason = baselineSource;
    else if (remaining === null) reason = "Restante previsto não confirmado";
    const total = reason ? null : effective + (remaining ?? 0);
    const diff = total === null || baseline === null ? null : total - baseline;
    const pct = diff === null || baseline === null || baseline === 0 ? null : diff / baseline;
    const pctNote = diff !== null && baseline === 0 ? "Não aplicável" : null;
    const comparison: Comparison = diff === null ? "Não comparável" : eq(diff, 0) ? "Sem diferença" : diff > 0 ? "Acima" : "Abaixo";
    const effDates = effs.map((e) => e.at.slice(0, 10));
    const identity = supplierIdentity(d, p as Planned);
    const category = categories.get(p.categoryId);
    rows.push({ plannedId: p.id, purchaseCode: p.purchaseCode, document: p.document, supplierKey: identity.key, supplier: identity.name, category: category?.kind ?? "", subgroupId: p.categoryId, subgroup: category?.name ?? "Não disponível", baseline, baselineSource, effective, remaining, remainingSource,
      total, diff, pct, pctNote, comparison, reason, situation, firstEffAt: firstAt, lastEffAt: effs.at(-1)?.at ?? null, effDates, notes, cancelledValue,
      justification: effs.map((e) => e.manual?.rule).filter((r): r is string => !!r), history });
  }
  return rows;
}

export interface PvaFilter { from: string | null; to: string | null; supplier: string; comparison: "" | Comparison; situation: "" | PvaSituation; category?: string; subgroup?: string }
export const EMPTY_PVA: PvaFilter = { from: null, to: null, supplier: "", comparison: "", situation: "", category: "", subgroup: "" };
/** Período corta pelo evento de efetivação datado; colunas continuam acumuladas sobre todos os vínculos. */
export function filterPva(rows: PvaRow[], f: PvaFilter) {
  return rows.filter((r) => (!f.category || r.category === f.category) && (!f.subgroup || r.subgroupId === f.subgroup) && (!f.supplier || r.supplierKey === f.supplier) && (!f.comparison || r.comparison === f.comparison) && (!f.situation || r.situation === f.situation)
    && (!(f.from || f.to) || r.effDates.some((x) => (!f.from || x >= f.from) && (!f.to || x <= f.to))));
}

/** All comparison indicators share exactly the comparable subset, before pagination. */
export function summarizePva(rows: PvaRow[]) {
  const comparable = rows.filter((r) => r.comparison !== "Não comparável" && r.baseline !== null && r.total !== null && r.remaining !== null);
  const sum = (key: "baseline" | "effective" | "remaining" | "total") => comparable.length ? comparable.reduce((a, r) => a + (r[key] ?? 0), 0) : null;
  const baseline = sum("baseline"), total = sum("total");
  const diff = baseline === null || total === null ? null : total - baseline;
  return { filtered: rows.length, comparable: comparable.length, unavailable: rows.length - comparable.length, baseline, effective: sum("effective"), remaining: sum("remaining"), total, diff, pct: diff === null || baseline === null || baseline === 0 ? null : diff / baseline };
}

export function pvaUndated(rows: PvaRow[], f: PvaFilter) {
  return f.from || f.to ? filterPva(rows, { ...f, from: null, to: null }).filter((r) => !r.effDates.length) : [];
}
