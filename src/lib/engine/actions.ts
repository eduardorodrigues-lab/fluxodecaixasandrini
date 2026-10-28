// Ações de domínio puras (sem I/O). Mutam o objeto recebido (rascunho) e lançam erro em violação.
import { addDays } from "../dates";
import { distributePlanned, effectivatedOf, paymentsFor, titleStatus } from "./engine";
import type { Committed, Expense, Payment, ScenarioData } from "./types";

const DEF_PARAMS = { profile: "legado", legacyReducer: 0.25, webR1: 0.25, webR2: 0.18, divisorLegado: "30", divisorWeb: "dias", lagDays: 10, startDate: "2026-10-01", saldoInicial: 0 } as const;

// Normaliza dados antigos/parciais (incl. `{}` de organização nova) sem inventar valores financeiros.
// Compatibilidade: efetuada antiga com M preenchido → origin "legado"; sem M → "manual" (M continua ausente).
export function normalizeData(raw: unknown): ScenarioData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : {};
  const { webExpenseUseExtension: _ignored, ...params } = d.params ?? {};
  void _ignored;
  d.params = { ...DEF_PARAMS, ...params };
  for (const k of ["platforms", "suppliers", "categories", "planned", "committed", "expenses", "effectivations", "payments", "receipts", "adjustments", "importLog"]) d[k] ??= [];
  d.targets ??= {};
  for (const p of d.planned) { p.remainingOverride ??= null; }
  for (const c of d.committed) {
    c.extensionHistory ??= c.extensionDate ? [{ from: null, to: c.extensionDate, at: "", note: "prorrogação existente antes do histórico" }] : [];
    c.plannedId ??= null; c.effectivationId ??= null;
    c.origin ??= c.legacyAbatement !== null && c.legacyAbatement !== undefined ? "legado" : "manual";
    c.legacyAbatement ??= null;
  }
  for (const e of d.expenses) e.extensionHistory ??= e.extensionDate ? [{ from: null, to: e.extensionDate, at: "", note: "prorrogação existente antes do histórico" }] : [];
  return d as ScenarioData;
}

export function emptyData(): ScenarioData { return normalizeData({}); }

// ---------- Efetivação de compra/pedido (item 5) ----------
export interface EffectivateInput {
  id: string; // idempotência: mesmo id não efetiva duas vezes
  plannedId: string; kind: "parcial" | "concluida"; at: string;
  installments: { value: number; date: string; document: string }[];
  remaining?: { value: number; dates: string[] } | null; // parcial: restante confirmado/ajustado pelo usuário
}
export function plannedRemaining(d: ScenarioData, plannedId: string) {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl) throw new Error("Previsão não encontrada.");
  const dist = distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations);
  const value = pl.status === "encerrado" ? 0 : pl.remainingOverride?.value ?? pl.value - effectivatedOf(pl, d.effectivations).reduce((a, e) => a + e.value, 0);
  return { pl, value, dates: dist.parcels.map((p) => p.date) };
}
export function suggestEffectivation(d: ScenarioData, plannedId: string, effValue: number) {
  const r = plannedRemaining(d, plannedId);
  const sup = d.suppliers.find((s) => s.id === r.pl.supplierId);
  const terms = (sup?.terms ?? []).filter((t): t is number => t !== null && t > 0);
  return { remainingValue: r.value - effValue, remainingDates: r.dates, suggestedTerms: terms, baseDate: r.pl.baseDate };
}
export function effectivate(d: ScenarioData, inp: EffectivateInput): ScenarioData {
  if (d.effectivations.some((e) => e.id === inp.id)) return d; // idempotente
  const pl = d.planned.find((p) => p.id === inp.plannedId);
  if (!pl) throw new Error("Previsão não encontrada.");
  if (pl.status !== "ativo") throw new Error("Previsão não está ativa (cancelada ou encerrada).");
  if (!inp.installments.length) throw new Error("Informe ao menos uma parcela efetivada.");
  for (const i of inp.installments) {
    if (!(i.value > 0)) throw new Error("Valor de parcela deve ser positivo.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new Error("Vencimento inválido.");
  }
  if (inp.kind === "parcial" && inp.remaining) {
    if (!inp.remaining.dates.length && inp.remaining.value !== 0) throw new Error("Restante precisa de datas.");
  }
  const value = inp.installments.reduce((a, i) => a + i.value, 0);
  const cat = d.categories.find((c) => c.kind === "comprometida")?.id ?? "";
  const ids: string[] = [];
  inp.installments.forEach((i, n) => {
    const id = `${inp.id}-${n + 1}`;
    ids.push(id);
    const c: Committed = {
      id, supplierId: pl.supplierId, purchaseCode: pl.purchaseCode, document: i.document || `${pl.purchaseCode}/${n + 1}`, value: i.value,
      dueDate: i.date, extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null,
      origin: "efetivacao", plannedId: pl.id, effectivationId: inp.id, categoryId: cat, notes: `Efetivação ${inp.kind} da previsão ${pl.purchaseCode}`, status: "ativo",
    };
    d.committed.push(c);
  });
  d.effectivations.push({ id: inp.id, plannedId: pl.id, at: inp.at, kind: inp.kind, value, committedIds: ids, prev: { status: pl.status, remainingOverride: pl.remainingOverride }, reversedAt: null, reversalNote: "" });
  if (inp.kind === "concluida") { pl.status = "encerrado"; pl.remainingOverride = null; }
  else if (inp.remaining) {
    pl.remainingOverride = inp.remaining.value === 0 && !inp.remaining.dates.length ? null : { value: inp.remaining.value, dates: [...inp.remaining.dates].sort() };
    if (inp.remaining.value === 0 && !inp.remaining.dates.length) pl.status = "encerrado";
  } else if (pl.remainingOverride) {
    pl.remainingOverride = { ...pl.remainingOverride, value: pl.remainingOverride.value - value };
  }
  return d;
}
export function reverseEffectivation(d: ScenarioData, effId: string, note: string, at: string): ScenarioData {
  const e = d.effectivations.find((x) => x.id === effId);
  if (!e) throw new Error("Efetivação não encontrada.");
  if (e.reversedAt) return d;
  const later = d.effectivations.filter((x) => x.plannedId === e.plannedId && !x.reversedAt && x.at > e.at);
  if (later.length) throw new Error("Reverta antes as efetivações posteriores desta previsão.");
  for (const cid of e.committedIds)
    if (paymentsFor(d, "committed", cid).some((p) => !p.reversedAt)) throw new Error("Há pagamento ativo em parcela desta efetivação: estorne o pagamento antes.");
  for (const c of d.committed) if (e.committedIds.includes(c.id)) { c.status = "cancelado"; c.notes = `${c.notes} · revertida: ${note}`; }
  const pl = d.planned.find((p) => p.id === e.plannedId);
  if (pl) { pl.status = e.prev.status; pl.remainingOverride = e.prev.remainingOverride; }
  e.reversedAt = at; e.reversalNote = note;
  return d;
}

// ---------- Pagamentos (item 6) ----------
function findTitle(d: ScenarioData, kind: Payment["titleKind"], id: string): Committed | Expense {
  const t = kind === "committed" ? d.committed.find((c) => c.id === id) : d.expenses.find((e) => e.id === id);
  if (!t) throw new Error("Título não encontrado.");
  return t;
}
export function registerPayment(d: ScenarioData, p: Omit<Payment, "reversedAt" | "reversalNote">): ScenarioData {
  if (d.payments.some((x) => x.id === p.id)) return d; // idempotente
  const t = findTitle(d, p.titleKind, p.titleId);
  if (t.status === "cancelado") throw new Error("Título cancelado não recebe pagamento.");
  if (!(p.amount > 0)) throw new Error("Valor do pagamento deve ser positivo.");
  const ts = titleStatus(t.value, t.status, paymentsFor(d, p.titleKind, p.titleId));
  if (p.amount > ts.open) throw new Error(`Pagamento excede o saldo pendente (${ts.open} centavos).`);
  d.payments.push({ ...p, reversedAt: null, reversalNote: "" });
  return d;
}
export function reversePayment(d: ScenarioData, id: string, note: string, at: string): ScenarioData {
  const p = d.payments.find((x) => x.id === id);
  if (!p) throw new Error("Pagamento não encontrado.");
  if (!p.reversedAt) { p.reversedAt = at; p.reversalNote = note; }
  return d;
}

// ---------- Prorrogação confirmada (item 7) ----------
export function confirmExtension(d: ScenarioData, kind: "committed" | "expense", id: string, to: string | null, note: string, at: string): ScenarioData {
  const t = kind === "committed" ? d.committed.find((c) => c.id === id) : d.expenses.find((e) => e.id === id);
  if (!t) throw new Error("Título não encontrado.");
  if (to === t.extensionDate) return d;
  t.extensionHistory.push({ from: t.extensionDate, to, at, note });
  t.extensionDate = to;
  return d;
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
export { addDays };
