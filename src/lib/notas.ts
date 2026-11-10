// Nova nota (painel lateral): geração de parcelas, validação e gravação como lançamentos por parcela.
// Funções puras sobre o rascunho do cenário — chamadas via update() só após "Revisar e confirmar".
import { distributePlanned, splitCents } from "@/lib/engine/engine";
import type { CategoryKind, Committed, ExtensionEvent, ScenarioData } from "@/lib/engine/types";
import { addDays } from "@/lib/dates";

export interface DraftParcel { amount: number; date: string | null; ext: string | null }
export interface NoteDraft {
  stage: "planned" | "committed"; kind: CategoryKind; categoryId: string; supplierId: string;
  purchaseCode: string; document: string; description: string; total: number | null; baseDate: string | null;
  parcels: DraftParcel[];
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
export function validateNote(n: NoteDraft): string[] {
  const e: string[] = [];
  if (!n.categoryId) e.push("Selecione o subgrupo.");
  if (!n.supplierId) e.push("Selecione o fornecedor.");
  if (!n.total || n.total <= 0) e.push("Informe o valor total.");
  if (!n.baseDate) e.push("Informe a data base.");
  if (!n.parcels.length) e.push("Gere ou adicione as parcelas.");
  if (n.parcels.some((p) => !p.date)) e.push("Toda parcela precisa de vencimento.");
  if (n.parcels.some((p) => !(p.amount > 0))) e.push("Toda parcela precisa de valor positivo.");
  if (n.parcels.some((p) => p.ext && p.date && p.ext < p.date)) e.push("Prorrogação anterior ao vencimento.");
  if (n.total && parcelsTotal(n.parcels) !== n.total) e.push("Total das parcelas difere do valor da nota.");
  return e;
}
const extHist = (p: DraftParcel, at: string): ExtensionEvent[] => (p.ext ? [{ from: null, to: p.ext, at, note: "Prorrogação informada na criação" }] : []);

/** Grava a nota: Planejada = 1 previsão com parcelas próprias; Efetivado = 1 título por parcela (mesmo noteId). */
export function applyNote(d: ScenarioData, n: NoteDraft, ids: { id: () => string; at: string }): void {
  const errs = validateNote(n);
  if (errs.length) throw new Error(errs.join(" "));
  const sorted = [...n.parcels];
  if (n.stage === "planned") {
    d.planned.push({ id: ids.id(), supplierId: n.supplierId, purchaseCode: n.purchaseCode, document: n.document, value: n.total!, baseDate: n.baseDate!, categoryId: n.categoryId, notes: n.description, status: "ativo", remainingOverride: null, installments: sorted.map((p) => ({ amount: p.amount, date: p.date!, extensionDate: p.ext, extensionHistory: extHist(p, ids.at) })) });
    return;
  }
  const noteId = ids.id();
  sorted.forEach((p, i) => d.committed.push({ id: ids.id(), supplierId: n.supplierId, purchaseCode: n.purchaseCode, document: n.document, value: p.amount, dueDate: p.date!, extensionDate: p.ext, extensionHistory: extHist(p, ids.at), extensionInfo: "", legacyAbatement: null, origin: "manual", plannedId: null, effectivationId: null, categoryId: n.categoryId, notes: n.description, status: "ativo", noteId, parcelNo: i + 1, parcelCount: sorted.length }));
}

/** Salva nova condição do fornecedor preservando histórico; previsões antigas que usavam a condição anterior ficam congeladas. */
export function saveSupplierCondition(d: ScenarioData, supplierId: string, terms: (number | null)[], at: string): void {
  const s = d.suppliers.find((x) => x.id === supplierId);
  if (!s) throw new Error("Fornecedor não encontrado.");
  const old = [...s.terms];
  for (const pl of d.planned) if (pl.supplierId === supplierId && !pl.terms && !pl.installments?.length) pl.terms = old;
  s.termsHistory ??= [];
  if (!s.termsHistory.length) s.termsHistory.push({ at: "", terms: old });
  s.termsHistory.push({ at, terms: [...terms] });
  s.terms = [...terms].slice(0, 10);
}
export const conditionDate = (s: { termsHistory?: { at: string }[] }) => s.termsHistory?.at(-1)?.at || null;

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
  const out = new Map<string, string>();
  const groups = new Map<string, Committed[]>();
  for (const c of d.committed) {
    if (c.noteId && c.parcelNo && c.parcelCount) { out.set(c.id, `${c.parcelNo}/${c.parcelCount}`); continue; }
    const k = `${c.supplierId}|${c.purchaseCode}|${c.document}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const g of groups.values()) { g.sort((a, b) => a.dueDate.localeCompare(b.dueDate)); g.forEach((c, i) => out.set(c.id, `${i + 1}/${g.length}`)); }
  return out;
}
