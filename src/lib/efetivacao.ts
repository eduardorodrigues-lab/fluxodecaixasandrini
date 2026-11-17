// Efetivação com edição manual: rascunho puro (parcelas selecionadas → Efetivado; demais → Planejada editável).
// Sugestões automáticas só ao chamar applySuggestion; nunca recalculam sobre edições sem pedido explícito.
import type { Committed, RemainingItem, ScenarioData } from "@/lib/engine/types";
import { distributePlanned, splitCents } from "@/lib/engine/engine";
import { parseBRDate } from "@/lib/dates";

export interface Parcel { key: string; amount: number; date: string; boletoNumber?: string | null | undefined } // parcela atual planejada, chave estável
export interface EffLine { amount: number | null; date: string | null; boletoNumber?: string | null | undefined }
export interface RestLine { id: string; amount: number | null; date: string | null; origin: string | null; boletoNumber?: string | null | undefined } // origin = key da parcela atual (null = nova)
export type Suggestion = "manter" | "igualar" | "diferenca" | "total";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Parcelas atuais ainda planejadas com chave estável (ID do restante, ou índice da parcela própria/prazo). */
export function currentParcels(d: ScenarioData, plannedId: string): Parcel[] {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl || pl.status !== "ativo") return [];
  const items = pl.remainingOverride?.items;
  if (items?.length) return items.map((i) => ({ key: i.id, amount: i.amount, date: i.date, boletoNumber: pl.boletoNumbers && i.id in pl.boletoNumbers ? pl.boletoNumbers[i.id] : i.boletoNumber }));
  const r = distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations);
  return r.parcels.map((p, i) => { const key = `${pl.id}#${p.idx ?? i}`; return { key, amount: p.amount, date: p.date, boletoNumber: pl.boletoNumbers && key in pl.boletoNumbers ? pl.boletoNumbers[key] : pl.installments?.[p.idx ?? i]?.boletoNumber }; });
}

export function initDraft(parcels: Parcel[], selected: string[]) {
  const sel = parcels.filter((p) => selected.includes(p.key));
  return {
    eff: sel.map((p): EffLine => ({ amount: p.amount, date: p.date, boletoNumber: p.boletoNumber })),
    rest: parcels.filter((p) => !selected.includes(p.key)).map((p): RestLine => ({ id: p.key, amount: p.amount, date: p.date, origin: p.key, boletoNumber: p.boletoNumber })),
  };
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

/** Sugestão explícita. origTotal = total planejado antes; substituted = previsão substituída; effTotal = efetivado. Preserva datas. */
export function applySuggestion(mode: Suggestion, rest: RestLine[], ctx: { parcels: Parcel[]; selected: string[]; substituted: number; effTotal: number }): RestLine[] {
  if (!rest.length) return rest; // sem restantes: nada a redistribuir
  const orig = (l: RestLine) => ctx.parcels.find((p) => p.key === l.origin)?.amount ?? l.amount ?? 0;
  const spread = (target: number) => { const { parts } = splitCents(target, rest.length); return rest.map((l, i) => ({ ...l, amount: parts[i]! })); };
  const restOrig = rest.reduce((a, l) => a + orig(l), 0);
  if (mode === "manter") return rest.map((l) => ({ ...l, amount: orig(l) }));
  if (mode === "igualar") {
    if (ctx.selected.length !== 1) throw new Error("Igualar valor só se aplica quando uma única parcela de origem é efetivada.");
    return rest.map((l) => ({ ...l, amount: ctx.effTotal }));
  }
  if (mode === "diferenca") return spread(restOrig - (ctx.substituted - ctx.effTotal));
  const origTotal = ctx.parcels.reduce((a, p) => a + p.amount, 0);
  return spread(origTotal - ctx.effTotal);
}

export function draftTotals(eff: EffLine[], rest: RestLine[], parcels: Parcel[]) {
  const effTotal = sum(eff.map((e) => e.amount)), restTotal = sum(rest.map((r) => r.amount));
  return { before: parcels.reduce((a, p) => a + p.amount, 0), effTotal, restTotal, after: effTotal + restTotal };
}

export function validateDraft(eff: EffLine[], rest: RestLine[], substituted: number | null, selectedTotal: number, effectiveDate: string | null): string[] {
  const e: string[] = [];
  if ([...eff, ...rest].some(p => p.boletoNumber !== undefined && p.boletoNumber !== null && typeof p.boletoNumber !== "string")) e.push("Número do boleto deve ser texto.");
  if (!effectiveDate || !ISO.test(effectiveDate)) e.push("Informe a data da efetivação.");
  if (eff.length && eff.some((l) => !(l.amount !== null && Number.isInteger(l.amount) && l.amount > 0))) e.push("Toda linha efetivada precisa de valor positivo.");
  if (eff.some((l) => !l.date || !ISO.test(l.date))) e.push("Toda linha efetivada precisa de vencimento.");
  if (rest.some((l) => !(l.amount !== null && Number.isInteger(l.amount) && l.amount > 0))) e.push("Parcelas planejadas precisam de valor positivo (remova as que não devem continuar).");
  if (rest.some((l) => !l.date || !ISO.test(l.date))) e.push("Parcelas planejadas precisam de vencimento.");
  if (eff.length) {
    if (substituted === null || substituted < 0) e.push("Informe a previsão substituída (zero é válido).");
    else if (substituted > selectedTotal) e.push("A previsão substituída não pode exceder as parcelas selecionadas.");
  }
  return e;
}

/** Comparação antes/depois por parcela (estável por chave). */
export function diffParcels(parcels: Parcel[], selected: string[], rest: RestLine[]) {
  const rows: { kind: "efetivada" | "mantida" | "alterada" | "removida" | "adicionada"; before: Parcel | null; after: RestLine | null }[] = [];
  for (const p of parcels) {
    if (selected.includes(p.key)) { rows.push({ kind: "efetivada", before: p, after: null }); continue; }
    const r = rest.find((l) => l.origin === p.key);
    rows.push({ kind: !r ? "removida" : r.amount === p.amount && r.date === p.date ? "mantida" : "alterada", before: p, after: r ?? null });
  }
  for (const r of rest) if (!r.origin || !parcels.some((p) => p.key === r.origin)) rows.push({ kind: "adicionada", before: null, after: r });
  return rows;
}

export interface ManualEffInput {
  id: string; plannedId: string; at: string; effectiveDate: string; document: string; purchaseCode: string;
  selected: string[]; eff: { amount: number; date: string; boletoNumber?: string | null | undefined }[]; rest: { id: string; amount: number; date: string; boletoNumber?: string | null | undefined }[];
  substituted: number; rule: string;
}
/** Aplicação ATÔMICA (sobre rascunho): cria títulos efetivados e redefine o restante por parcela com IDs estáveis. Não paga. */
export function effectivateManual(d: ScenarioData, inp: ManualEffInput): void {
  if (d.effectivations.some((e) => e.id === inp.id)) return; // idempotente
  const pl = d.planned.find((p) => p.id === inp.plannedId);
  if (!pl || pl.status !== "ativo") throw new Error("Previsão não está ativa.");
  const r = distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations);
  if (r.health !== "ok") throw new Error("Conciliação pendente nesta previsão: resolva antes de efetivar.");
  const parcels = currentParcels(d, pl.id);
  if (inp.selected.some((k) => !parcels.some((p) => p.key === k))) throw new Error("Parcela selecionada não está mais planejada.");
  const errs = validateDraft(inp.eff, inp.rest.map((x) => ({ ...x, origin: null })), inp.substituted, parcels.filter((p) => inp.selected.includes(p.key)).reduce((a, p) => a + p.amount, 0), inp.effectiveDate);
  if (errs.length) throw new Error(errs[0]);
  const ids = inp.eff.map((_, n) => `${inp.id}-${n + 1}`);
  inp.eff.forEach((l, n) => {
    const c: Committed = {
      id: ids[n]!, supplierId: pl.supplierId, purchaseCode: inp.purchaseCode || pl.purchaseCode, document: inp.document || pl.document || `${pl.purchaseCode}/${n + 1}`, value: l.amount,
      dueDate: l.date, extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null,
      origin: "efetivacao", plannedId: pl.id, effectivationId: inp.id, categoryId: pl.categoryId, notes: `Efetivada em ${inp.effectiveDate.split("-").reverse().join("/")}`, status: "ativo", condition: null,
      noteId: inp.id, parcelNo: n + 1, parcelCount: inp.eff.length,
      ...(l.boletoNumber !== undefined ? { boletoNumber: l.boletoNumber } : {}),
    };
    d.committed.push(c);
  });
  const before: RemainingItem[] = parcels.map((p) => ({ id: p.key, amount: p.amount, date: p.date, ...(p.boletoNumber !== undefined ? { boletoNumber: p.boletoNumber } : {}) }));
  const after: RemainingItem[] = inp.rest.map((x) => ({ id: x.id, amount: x.amount, date: x.date, ...(x.boletoNumber !== undefined ? { boletoNumber: x.boletoNumber } : {}) }));
  const value = inp.eff.reduce((a, x) => a + x.amount, 0);
  d.effectivations.push({ id: inp.id, plannedId: pl.id, at: inp.at, kind: after.length ? "parcial" : "concluida", value, substituted: inp.substituted, committedIds: ids,
    prev: { status: pl.status, remainingOverride: pl.remainingOverride ? structuredClone(pl.remainingOverride) : null }, manual: { effectiveDate: inp.effectiveDate, before, after, selected: [...inp.selected], rule: inp.rule }, reversedAt: null, reversalNote: "" });
  if (!after.length) { pl.status = "encerrado"; pl.remainingOverride = null; }
  else pl.remainingOverride = { value: after.reduce((a, x) => a + x.amount, 0), dates: after.map((x) => x.date), items: after };
}

/** "Ajustar planejamento": redefine as parcelas ainda planejadas (valores/datas/quantidade), sem efetivar. */
export function adjustPlanned(d: ScenarioData, plannedId: string, rest: { id: string; amount: number; date: string; boletoNumber?: string | null | undefined }[]): void {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl || pl.status !== "ativo") throw new Error("Previsão não está ativa.");
  if (!rest.length) throw new Error("Mantenha ao menos uma parcela ou use Encerrar restante.");
  const errs = validateDraft([], rest.map((x) => ({ ...x, origin: null })), 0, 0, "2000-01-01");
  if (errs.length) throw new Error(errs[0]);
  const items = rest.map((x) => ({ ...x }));
  pl.remainingOverride = { value: items.reduce((a, x) => a + x.amount, 0), dates: items.map((x) => x.date), items };
}

export interface BatchNote {
  id: string; document: string; total: number | null; effectiveDate: string | null; baseDate: string | null;
  condition: Committed["condition"];
  parcels: (EffLine & { id: string; extension: string | null; selected?: boolean })[];
}
export interface BatchInput {
  id: string; plannedId: string; at: string; by: string; selected: string[]; notes: BatchNote[];
  rest: RestLine[]; remaining: number | null; confirmed: boolean; reason: string;
  scopeConfirmed: boolean; duplicateConfirmed: boolean;
  /** Valor de referência do pedido no rascunho; só preenche previsão salva com valor 0 (nunca reescreve uma referência existente). */
  reference?: number | null;
}
/** Prévia do saldo: referência − efetivado anterior comprovado − novo selecionado. Negativo vira excedente separado, nunca previsão negativa. */
export function batchPreview(reference: number | null, prior: number, selectedNew: number) {
  if (reference === null) return { remaining: null, excess: null };
  const r = reference - prior - selectedNew;
  return { remaining: Math.max(0, r), excess: Math.max(0, -r) };
}
const documentKey = (s: string) => s.trim().toLocaleLowerCase("pt-BR");
export function duplicateBatchDocuments(d: ScenarioData, plannedId: string, notes: BatchNote[]): string[] {
  const supplier = d.planned.find(p => p.id === plannedId)?.supplierId;
  const seen = new Set(d.committed.filter(c => c.supplierId === supplier).map(c => documentKey(c.document)));
  const duplicates = new Set<string>();
  for (const n of notes) { const key = documentKey(n.document); if (key && seen.has(key)) duplicates.add(n.document); seen.add(key); }
  return [...duplicates];
}
/** Validate the entire operation before publishing any of its changes to the draft. One event reverses the whole batch. */
export function effectivateBatch(d: ScenarioData, input: BatchInput): void {
  if (d.effectivations.some(e => e.id === input.id)) return;
  const pl = d.planned.find(p => p.id === input.plannedId);
  if (!pl || pl.status === "cancelado") throw new Error("Pedido inexistente ou cancelado.");
  const origins = currentParcels(d, pl.id).filter(p => p.amount >= 0);
  if (distributePlanned(pl, d.suppliers.find(s => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations).health !== "ok") throw new Error("Conciliação pendente neste pedido.");
  if (new Set(input.selected).size !== input.selected.length || input.selected.some(id => !origins.some(p => p.key === id))) throw new Error("Previsão selecionada mudou; confira o escopo.");
  if (!input.notes.length || !input.reason.trim()) throw new Error("Informe notas e justificativa.");
  const reference = pl.value > 0 ? pl.value : input.reference ?? null;
  if (reference !== null && (!Number.isInteger(reference) || reference < 0)) throw new Error("Valor de referência inválido.");
  const prior = d.committed.filter(c => c.status !== "cancelado" && (c.plannedId === pl.id || d.effectivations.some(e => e.plannedId === pl.id && !e.reversedAt && e.committedIds.includes(c.id)))).reduce((s,c) => s+c.value,0);
  const newTotal = input.notes.reduce((s,n) => s+(n.total ?? 0),0);
  const exceeds = reference === null ? !input.selected.length : prior + newTotal > reference;
  if ((exceeds || pl.status === "encerrado") && !input.scopeConfirmed) throw new Error("Confirme a ampliação do escopo deste pedido.");
  if (duplicateBatchDocuments(d, pl.id, input.notes).length && !input.duplicateConfirmed) throw new Error("Confira o documento potencialmente duplicado neste fornecedor.");
  if (input.remaining === null || !Number.isInteger(input.remaining) || input.remaining < 0 || !input.confirmed) throw new Error("Informe e confirme o restante manual; vazio não é zero.");
  const substituted = origins.filter(p => input.selected.includes(p.key)).reduce((s,p) => s+p.amount,0);
  const restErrors = validateDraft([], input.rest, 0, 0, "2000-01-01");
  if (restErrors.length) throw new Error(restErrors.join(" "));
  if (input.rest.some(p => !p.date || !parseBRDate(p.date) || input.selected.includes(p.id))) throw new Error("Confira datas e vínculos do restante; previsão substituída exige novo ID para um novo restante.");
  if (input.rest.reduce((s,p) => s+(p.amount ?? 0),0) !== input.remaining) throw new Error("Parcelas restantes devem somar o restante manual.");
  const keys = [input.id, ...input.notes.map(n => n.id), ...input.notes.flatMap(n => n.parcels.map(p => p.id))];
  if (new Set(keys).size !== keys.length || input.notes.some(n => d.committed.some(c => c.noteId === n.id)) || input.notes.flatMap(n => n.parcels).some(p => d.committed.some(c => c.id === p.id)) || new Set(input.rest.map(p => p.id)).size !== input.rest.length) throw new Error("Identificadores de nota/parcela já utilizados.");
  const titles: Committed[] = [];
  for (const n of input.notes) {
    if (!n.document.trim() || n.total === null || !Number.isInteger(n.total) || n.total <= 0 || !n.baseDate || !parseBRDate(n.baseDate) || !n.effectiveDate || !parseBRDate(n.effectiveDate) || !n.parcels.length) throw new Error("Confira documento, total e datas de cada nota.");
    const errors = validateDraft(n.parcels, [], substituted, substituted, n.effectiveDate);
    if (errors.length || n.parcels.some(p => !p.date || !parseBRDate(p.date) || (p.extension && (!parseBRDate(p.extension) || p.extension < p.date)))) throw new Error(errors.join(" ") || "Confira vencimentos e prorrogações.");
    if (n.parcels.reduce((s,p) => s+(p.amount ?? 0),0) !== n.total) throw new Error(`Parcelas da nota ${n.document} diferem do total.`);
    n.parcels.forEach((p,i) => titles.push({ id:p.id, noteId:n.id, parcelNo:i+1, parcelCount:n.parcels.length, supplierId:pl.supplierId, categoryId:pl.categoryId, purchaseCode:pl.purchaseCode, document:n.document.trim(), value:p.amount ?? 0, dueDate:p.date ?? "", effectiveDate:n.effectiveDate ?? "", baseDate:n.baseDate ?? "", condition:structuredClone(n.condition ?? null), extensionDate:p.extension, extensionHistory:p.extension ? [{at:input.at,from:null,to:p.extension,note:input.reason}] : [], extensionInfo:"", legacyAbatement:null, origin:"efetivacao", plannedId:pl.id, effectivationId:input.id, notes:pl.notes, status:"ativo", boletoNumber:p.boletoNumber }));
  }
  const after = input.rest.map(p => ({id:p.id,amount:p.amount ?? 0,date:p.date ?? "",boletoNumber:p.boletoNumber}));
  const event: ScenarioData["effectivations"][number] = {id:input.id,plannedId:pl.id,at:input.at,kind:after.length ? "parcial" : "concluida",value:titles.reduce((s,p) => s+p.value,0),substituted,committedIds:titles.map(p => p.id),prev:{status:pl.status,remainingOverride:structuredClone(pl.remainingOverride)},manual:{effectiveDate:input.notes[0]?.effectiveDate ?? "",before:origins.map(p => ({id:p.key,amount:p.amount,date:p.date,boletoNumber:p.boletoNumber})),after,selected:[...input.selected],rule:input.reason,notes:input.notes.map(n => ({id:n.id,document:n.document,total:n.total ?? 0,effectiveDate:n.effectiveDate ?? "",baseDate:n.baseDate ?? ""}))},reversedAt:null,reversalNote:""};
  d.committed.push(...titles); d.effectivations.push(event);
  if (pl.value === 0 && reference !== null && reference > 0) { (pl.editLog ??= []).push({at:input.at,by:input.by,note:`Valor de referência informado no rascunho do pedido`,before:{amount:0,date:pl.baseDate},after:{amount:reference,date:pl.baseDate}}); pl.value = reference; }
  pl.status = after.length ? "ativo" : "encerrado";
  pl.remainingOverride = after.length ? {value:input.remaining,dates:after.map(p => p.date),items:after} : null;
  if (pl.boletoNumbers) for (const p of after) pl.boletoNumbers[p.id] = p.boletoNumber ?? null;
  // Amount-neutral history marker retains the existing baseline definition; the event holds financial before/after.
  (pl.editLog ??= []).push({at:input.at,by:input.by,note:`${input.reason} · ${input.notes.length} nota(s); restante ${input.remaining}; escopo ${substituted}`,before:{amount:pl.value,date:pl.baseDate},after:{amount:pl.value,date:pl.baseDate}});
}
