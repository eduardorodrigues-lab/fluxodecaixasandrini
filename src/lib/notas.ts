import { documentGroups } from "./documentGroups";
// Nova nota (painel lateral): geração de parcelas, validação e gravação como lançamentos por parcela.
// Funções puras sobre o rascunho do cenário — chamadas via update() só após "Revisar e confirmar".
import { distributePlanned, splitCents } from "@/lib/engine/engine";
import { effectivate, plannedRemaining } from "@/lib/engine/actions";
import type { CategoryKind, Committed, ExtensionEvent, ScenarioData, Supplier, SupplierCondition } from "@/lib/engine/types";
import { addDays } from "@/lib/dates";
import { supplierActive, validateSupplierNames } from "./fornecedores";
import type { BatchNote } from "./efetivacao";

export interface DraftParcel { amount: number; date: string | null; ext: string | null; boletoNumber?: string | null | undefined }
export interface NoteDraft {
  stage: "planned" | "committed"; kind: CategoryKind; categoryId: string; supplierId: string;
  purchaseCode: string; document: string; description: string; total: number | null; baseDate: string | null;
  parcels: DraftParcel[];
  plannedNotes?: BatchNote[];
  localSuppliers?: Supplier[];
  plannedId?: string | null; // Efetivado vinculado a uma previsão existente
  closeRest?: boolean;
  condition?: { name: string; terms: (number | null)[] } | null; // condição escolhida/informada (não altera o fornecedor) // vinculado: true = encerra o restante da previsão; false = restante continua planejado
}

/** Prazos numéricos (0 conta; vazio não) → parcelas com resíduo de centavos na última. */
export function generateParcels(total: number, base: string, terms: (number | null)[]): DraftParcel[] {
  const used = terms.filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (!used.length) return [];
  const { parts } = splitCents(total, used.length);
  return used.map((t, i) => ({ amount: parts[i]!, date: addDays(base, t), ext: null }));
}
export const parcelsTotal = (p: DraftParcel[]) => p.reduce((a, x) => a + (x.amount || 0), 0);
/** Ajusta a diferença de centavos na última parcela. */
export function adjustLast(p: DraftParcel[], total: number): DraftParcel[] {
  if (!p.length) return p;
  const diff = total - parcelsTotal(p);
  return p.map((x, i) => (i === p.length - 1 ? { ...x, amount: x.amount + diff } : x));
}
/** Preenchimento manual: N linhas com o total dividido em centavos (resíduo na última) e vencimentos em branco para informar. */
export function manualParcels(total: number | null, count: number): DraftParcel[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const base = Math.floor(Math.max(total ?? 0, 0) / count);
  return Array.from({ length: count }, (_, i) => ({ amount: i === count - 1 ? Math.max(total ?? 0, 0) - base * (count - 1) : base, date: null, ext: null }));
}
export function validateNote(n: NoteDraft): string[] {
  const e: string[] = [];
  if (!n.categoryId) e.push("Selecione o subgrupo.");
  if (!n.supplierId) e.push("Selecione o fornecedor.");
  if (n.stage === "committed" && !n.document.trim()) e.push("Informe o documento.");
  if (!n.total || n.total <= 0) e.push("Informe o valor total.");
  if (!n.baseDate) e.push("Informe a data base.");
  if (!n.parcels.length && !n.plannedNotes?.length) e.push("Gere ou adicione as parcelas.");
  if (n.parcels.some((p) => !p.date)) e.push("Toda parcela precisa de vencimento.");
  if (n.parcels.some((p) => !(p.amount > 0))) e.push("Toda parcela precisa de valor positivo.");
  if (n.parcels.some(p => p.boletoNumber !== undefined && p.boletoNumber !== null && typeof p.boletoNumber !== "string")) e.push("Número do boleto deve ser texto.");
  if (n.parcels.some((p) => p.ext && p.date && p.ext < p.date)) e.push("Prorrogação anterior ao vencimento.");
  const notes=n.plannedNotes??[];
  for(const note of notes){
    if(!note.document.trim() || note.total===null || !note.baseDate || !note.parcels.length) e.push("Confira documento, total, data base e parcelas de cada nota.");
    if(note.parcels.some(p=>p.amount===null || p.amount<=0 || !p.date || (p.extension && p.date && p.extension<p.date))) e.push("Confira valores e datas das notas planejadas.");
    if(note.total!==note.parcels.reduce((s,p)=>s+(p.amount??0),0))e.push(`Parcelas da nota ${note.document} diferem do total.`);
  }
  if(new Set(notes.flatMap(note=>note.parcels.map(p=>p.id))).size!==notes.flatMap(note=>note.parcels).length)e.push("Parcela de nota duplicada.");
  if (n.total && parcelsTotal(n.parcels)+notes.reduce((s,n)=>s+(n.total??0),0) !== n.total) e.push(notes.length ? "Total das parcelas e notas difere do valor previsto; informe o saldo sem nota com vencimentos ou revise o total expressamente." : "Total das parcelas difere do valor da nota.");
  return e;
}
const extHist = (p: DraftParcel, at: string): ExtensionEvent[] => (p.ext ? [{ from: null, to: p.ext, at, note: "Prorrogação informada na criação" }] : []);

/** Grava a nota: Planejada = 1 previsão com parcelas próprias; Efetivado = 1 título por parcela (mesmo noteId). */
export function applyNote(d: ScenarioData, n: NoteDraft, ids: { id: () => string; at: string }): void {
  for (const s of n.localSuppliers ?? []) if(s.id===n.supplierId) {
    if(d.suppliers.some(x=>x.id===s.id)) throw new Error("O fornecedor temporário já existe. Releia e revise antes de salvar; nenhum cadastro será sobrescrito.");
    d.suppliers.push(structuredClone(s));
  }
  const errs = validateNote(n);
  if (errs.length) throw new Error(errs.join(" "));
  const supplier = d.suppliers.find((s) => s.id === n.supplierId);
  if (!n.plannedId && (!supplier || !supplierActive(supplier, ids.at.slice(0, 10)))) throw new Error("Fornecedor inativo: selecione um fornecedor ativo para novo lançamento.");
  const sorted = [...n.parcels];
  if (n.stage === "planned") {
    const plannedId=ids.id();
    const items=(n.plannedNotes??[]).flatMap(note=>note.parcels.map((p,i)=>({id:p.id,amount:p.amount??0,date:p.extension??p.date??"",boletoNumber:p.boletoNumber,note:{noteId:note.id,document:note.document,total:note.total??0,effectiveDate:note.effectiveDate,baseDate:note.baseDate,condition:note.condition,parcelNo:p.parcelNo??i+1,parcelCount:p.parcelCount??note.parcels.length,dueDate:p.date??"",extension:p.extension}})));
    if(items.length)sorted.forEach((p,i)=>items.push({id:`${plannedId}#${i}`,amount:p.amount,date:p.ext??p.date??"",boletoNumber:p.boletoNumber} as typeof items[number]));
    if(n.total===null || !n.baseDate)throw new Error("Informe valor e data base.");
    d.planned.push({ id: plannedId, supplierId: n.supplierId, purchaseCode: n.purchaseCode, document: n.document, value: n.total, baseDate: n.baseDate, categoryId: n.categoryId, notes: n.description, status: "ativo", remainingOverride: items.length ? {value:n.total,dates:items.map(p=>p.date),items} : null, condition: n.condition ?? null, installments: sorted.map((p) => ({ amount: p.amount, date: p.date??"", extensionDate: p.ext, extensionHistory: extHist(p, ids.at), ...(p.boletoNumber !== undefined ? { boletoNumber: p.boletoNumber } : {}) })) });
    return;
  }
  if (n.plannedId) {
    // Substitui parte da previsão pelo efetivado via motor de efetivação (sem duplicar saídas).
    const r = plannedRemaining(d, n.plannedId);
    const effId = ids.id();
    const rest = Math.max(0, r.value - n.total!);
    effectivate(d, { id: effId, plannedId: n.plannedId, at: ids.at, kind: n.closeRest || rest === 0 ? "concluida" : "parcial",
      installments: sorted.map((p) => ({ value: p.amount, date: p.date!, document: n.document })),
      remaining: n.closeRest || rest === 0 ? null : { value: rest, dates: r.dates }, condition: n.condition ?? null });
    sorted.forEach((p, i) => { const c = d.committed.find((x) => x.id === `${effId}-${i + 1}`); if (!c) throw new Error("Parcela não criada"); Object.assign(c, { noteId: effId, parcelNo: i + 1, parcelCount: sorted.length, extensionDate: p.ext, extensionHistory: extHist(p, ids.at), ...(p.boletoNumber !== undefined ? { boletoNumber: p.boletoNumber } : {}), ...(n.description ? { notes: n.description } : {}) }); });
    return;
  }
  const noteId = ids.id();
  sorted.forEach((p, i) => d.committed.push({ id: ids.id(), supplierId: n.supplierId, purchaseCode: n.purchaseCode, document: n.document, value: p.amount, dueDate: p.date!, extensionDate: p.ext, extensionHistory: extHist(p, ids.at), extensionInfo: "", legacyAbatement: null, origin: "manual", plannedId: null, effectivationId: null, categoryId: n.categoryId, notes: n.description, status: "ativo", condition: n.condition ?? null, noteId, parcelNo: i + 1, parcelCount: sorted.length, ...(p.boletoNumber !== undefined ? { boletoNumber: p.boletoNumber } : {}) }));
}

/** Condições do fornecedor; cadastro antigo sem lista vira "Condição original" (prazos atuais). */
export function supplierConditions(s: Supplier): SupplierCondition[] {
  if (s.conditions) return s.conditions;
  return s.terms.some((t) => t !== null) ? [{ id: `${s.id}-orig`, name: "Condição original", terms: [...s.terms], from: null, at: s.termsHistory?.at(-1)?.at ?? "", by: "" }] : [];
}
/** Períodos de vigência da condição (cadastro + cada "usar como vigente a partir de"). */
export const condPeriods = (c: SupplierCondition) => (c.periods ?? [{ from: c.from, at: c.at, by: c.by }]);
/** Condição vigente em `date`: período com maior início ≤ date (sem início = desde sempre); empate → confirmação mais recente. */
export function currentCondition(s: Supplier, date: string): SupplierCondition | null {
  let best: { c: SupplierCondition; from: string; at: string } | null = null;
  for (const c of supplierConditions(s)) for (const p of condPeriods(c)) {
    const from = p.from ?? "";
    if (from > date) continue;
    if (!best || from > best.from || (from === best.from && p.at > best.at)) best = { c, from, at: p.at };
  }
  if (best?.c.cancelled) return null;
  const winning = best && condPeriods(best.c).find((p) => (p.from ?? "") === best.from && p.at === best.at);
  return winning?.cancelled ? null : best?.c ?? null;
}
/** Prazos vigentes usados pelo motor; previsões antigas por prazos ficam congeladas nos prazos anteriores (lançamentos anteriores não mudam). */
export function syncTerms(d: ScenarioData, s: Supplier, today: string) {
  const cur = currentCondition(s, today);
  const old = [...s.terms];
  const next = cur?.terms ?? [];
  if (JSON.stringify(old) === JSON.stringify(next)) return;
  for (const pl of d.planned) if (pl.supplierId === s.id && !pl.terms && !pl.installments?.length) pl.terms = old;
  s.terms = [...next];
}
export const invalidSupplierName = (n: string) => !n.trim() || n.trim().toLowerCase() === "novo fornecedor";
export function addSupplier(d: ScenarioData, s: { id: string; name: string; note: string; aliases?: string[] }): void {
  if (invalidSupplierName(s.name)) throw new Error("Informe o nome do fornecedor.");
  validateSupplierNames(d, s.id, s.name, s.aliases ?? []);
  if (d.suppliers.some((x) => x.id === s.id)) throw new Error("Fornecedor já cadastrado.");
  d.suppliers.push({ aliases: s.aliases ?? [], id: s.id, name: s.name.trim(), group: "", terms: [], note: s.note.trim() });
}
/** Adiciona condição sem apagar as anteriores (sem limite de prazos). Exige fornecedor válido. */
export function addSupplierCondition(d: ScenarioData, supplierId: string, c: { name: string; terms: (number | null)[]; from: string | null; note?: string }, at: string, by: string, today: string): void {
  const s = d.suppliers.find((x) => x.id === supplierId);
  if (!s || invalidSupplierName(s.name)) throw new Error("Condição precisa estar vinculada a um fornecedor válido.");
  if (!c.name.trim()) throw new Error("Informe o nome da condição.");
  if (!c.terms.some((t) => t !== null)) throw new Error("Informe ao menos um prazo.");
  s.conditions = supplierConditions(s).map((x) => ({ ...x }));
  s.conditions.push({ id: `${supplierId}-c${s.conditions.length + 1}-${at}`, name: c.name.trim(), terms: [...c.terms], from: c.from, at, by, note: c.note?.trim() ?? "", periods: [{ from: c.from, at, by }] });
  syncTerms(d, s, today);
}
/** "Usar como vigente a partir de…": novo período na condição existente, sem duplicá-la nem sobrescrever períodos. */
export function reactivateCondition(d: ScenarioData, supplierId: string, condId: string, from: string, at: string, by: string, today: string): void {
  const s = d.suppliers.find((x) => x.id === supplierId);
  if (!s) throw new Error("Fornecedor não encontrado.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error("Informe a data de início.");
  s.conditions = supplierConditions(s).map((x) => ({ ...x }));
  const c = s.conditions.find((x) => x.id === condId);
  if (!c) throw new Error("Condição não encontrada.");
  if (c.cancelled) throw new Error("Condição cancelada não pode ser ativada.");
  c.periods = [...condPeriods(c), { from, at, by }];
  syncTerms(d, s, today);
}
/** Compatibilidade: salvar condição informada no lançamento como nova condição do fornecedor. */
export function saveSupplierCondition(d: ScenarioData, supplierId: string, terms: (number | null)[], at: string, name = "Condição específica", by = "", from: string | null = null): void {
  addSupplierCondition(d, supplierId, { name, terms, from }, at, by, at.slice(0, 10));
}
export const conditionDate = (s: { termsHistory?: { at: string }[]; conditions?: { at: string }[] }) => s.conditions?.at(-1)?.at || s.termsHistory?.at(-1)?.at || null;

/** Converte previsão por prazos em parcelas próprias (valores atuais, antes de abatimentos), para editar uma parcela isoladamente. */
export function materializePlanned(d: ScenarioData, plannedId: string): void {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl || pl.installments?.length) return;
  if (pl.remainingOverride) throw new Error("Previsão com restante definido: ajuste pelo detalhe da previsão.");
  const dist = distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, []);
  if (dist.health !== "ok" || dist.linked) throw new Error("Previsão com conciliação legada pendente: não é possível editar parcela isolada.");
  pl.installments = dist.parcels.map((p) => ({ amount: p.amount, date: p.date, extensionDate: null, extensionHistory: [] }));
  pl.terms = null;
}
export function editPlannedParcel(d: ScenarioData, plannedId: string, idx: number, patch: { amount?: number; date?: string }): void {
  const ov = d.planned.find((p) => p.id === plannedId)?.remainingOverride;
  if (ov?.items?.length) {
    const it = ov.items[idx]; if (!it) throw new Error("Parcela não encontrada.");
    if (patch.amount !== undefined) { if (!(patch.amount > 0)) throw new Error("Valor deve ser positivo."); it.amount = patch.amount; }
    if (patch.date) it.date = patch.date;
    ov.value = ov.items.reduce((a, x) => a + x.amount, 0); ov.dates = ov.items.map((x) => x.date);
    return;
  }
  materializePlanned(d, plannedId);
  const pl = d.planned.find((p) => p.id === plannedId)!;
  const it = pl.installments![idx];
  if (!it) throw new Error("Parcela não encontrada.");
  if (patch.amount !== undefined) it.amount = patch.amount;
  if (patch.date) it.date = patch.date;
  pl.value = pl.installments!.reduce((a, x) => a + x.amount, 0);
}
export function extendPlannedParcel(d: ScenarioData, plannedId: string, idx: number, to: string | null, note: string, at: string): void {
  if (!note.trim()) throw new Error("Informe a justificativa da prorrogação.");
  materializePlanned(d, plannedId);
  const it = d.planned.find((p) => p.id === plannedId)!.installments![idx];
  if (!it) throw new Error("Parcela não encontrada.");
  if (to === it.extensionDate) return;
  it.extensionHistory.push({ from: it.extensionDate, to, at, note });
  it.extensionDate = to;
}
/** Dados gerais da nota aplicados a todas as parcelas irmãs (mesmo noteId); título sem noteId altera só ele. */
export function editCommittedNote(d: ScenarioData, committedId: string, patch: Partial<Pick<Committed, "supplierId" | "purchaseCode" | "document" | "notes" | "categoryId">>): void {
  const c = d.committed.find((x) => x.id === committedId);
  if (!c) throw new Error("Título não encontrado.");
  for (const x of d.committed) if (x.id === c.id || (c.noteId && x.noteId === c.noteId)) Object.assign(x, patch);
}

/** Número da parcela por título: noteId quando existir; senão ordem por vencimento em fornecedor+código+documento. */
export function parcelLabels(d: Pick<ScenarioData, "committed">): Map<string, string> {
  return new Map([...documentGroups(d).byId].map(([id, group]) => [id, group.labels.get(id) ?? "1/1"]));
}
