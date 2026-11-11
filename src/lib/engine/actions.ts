// Ações de domínio puras (sem I/O). Mutam o objeto recebido (rascunho) e lançam erro em violação.
import { addDays } from "../dates";
import { stampReceiptAccounts } from "./banco";
import { defaultMonthTarget, distributePlanned, effectivatedOf, paymentsFor, platformActiveOn, titleStatus } from "./engine";
import type { Committed, Expense, MonthTarget, Payment, Platform, ScenarioData } from "./types";

const DEF_PARAMS = { profile: "legado", legacyReducer: 0.25, webR1: 0.25, webR2: 0.18, divisorLegado: "30", divisorWeb: "dias", lagDays: 10, startDate: "2026-10-01", saldoInicial: 0 } as const;

// Normaliza dados antigos/parciais (incl. `{}` de organização nova) sem inventar valores financeiros.
// Compatibilidade: efetuada antiga com M preenchido → origin "legado"; sem M → "manual" (M continua ausente).
export function normalizeData(raw: unknown): ScenarioData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : {};
  const { webExpenseUseExtension: _ignored, ...params } = d.params ?? {};
  void _ignored;
  d.params = { ...DEF_PARAMS, ...params };
  for (const k of ["platforms", "suppliers", "categories", "planned", "committed", "expenses", "effectivations", "payments", "receipts", "adjustments", "importLog", "bankAccounts", "cards", "transfers", "cardOps"]) d[k] ??= [];
  // Migração: categorias antigas por ETAPA (planejada/comprometida) viram subgrupos de Compra; vínculos (IDs) preservados.
  for (const c of d.categories) { if (c.kind === "planejada" || c.kind === "comprometida") c.kind = "compra"; c.group ??= ""; }
  d.targets ??= {};
  d.targetConfigs ??= {};
  // Migração: mês com meta e sem configuração própria recebe SNAPSHOT dos parâmetros atuais (mesmo resultado de antes).
  const { financialDefaults: _newMonthDefaults, ...sourceParams } = d.params; void _newMonthDefaults;
  for (const [m, g] of Object.entries(d.targets as Record<string, number>)) if (g != null && !d.targetConfigs[m]) d.targetConfigs[m] = defaultMonthTarget(sourceParams, g);
  for (const [m, c] of Object.entries(d.targetConfigs as Record<string, MonthTarget>)) { if (d.targets[m] == null) delete d.targetConfigs[m]; else c.gross = d.targets[m]; }
  // Migração de plataformas: rótulos antigos (texto) viram cadastro com ID estável; recebimentos passam a referenciar o ID.
  if (d.platforms.some((x: unknown) => typeof x === "string")) {
    const map = new Map<string, string>();
    d.platforms = d.platforms.map((x: unknown, i: number) => {
      if (typeof x !== "string") return x;
      const id = `plat-${i + 1}`; map.set(x, id);
      return { id, name: x, start: "2000-01-01", end: null, importedCode: null, history: [{ at: "", field: "migração", from: x, to: id, note: "rótulo antigo convertido em cadastro" }] } satisfies Platform;
    });
    for (const r of d.receipts) r.platforms = Object.fromEntries(Object.entries(r.platforms ?? {}).map(([k, v]) => [map.get(k) ?? k, v]));
  }
  for (const pf of d.platforms) { pf.history ??= []; pf.importedCode ??= null; pf.end ??= null; }
  for (const r of d.receipts) { r.platforms ??= {}; r.residual ??= {}; }
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
  condition?: { name: string; terms: (number | null)[] } | null; // condição real desta efetivação (não altera fornecedor nem restante)
  remaining?: { value: number; dates: string[] } | null; // parcial: restante confirmado/ajustado pelo usuário
  substituted?: number; // parte da previsão substituída (pode diferir do valor efetivado); padrão = valor efetivado
}
export function plannedRemaining(d: ScenarioData, plannedId: string) {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl) throw new Error("Previsão não encontrada.");
  const dist = distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations);
  // Restante = original − efetivações ativas − abatimento legado M de títulos DISTINTOS (via motor), ou o restante confirmado.
  const value = pl.status === "encerrado" ? 0 : pl.remainingOverride?.value ?? dist.remaining;
  return { pl, value, dates: dist.parcels.map((p) => p.date), health: dist.health, dist };
}
export function suggestEffectivation(d: ScenarioData, plannedId: string, effValue: number) {
  const r = plannedRemaining(d, plannedId);
  const sup = d.suppliers.find((s) => s.id === r.pl.supplierId);
  const terms = (r.pl.terms ?? sup?.terms ?? []).filter((t): t is number => t !== null && t > 0);
  return { remainingValue: r.value - effValue, remainingDates: r.dates, suggestedTerms: terms, baseDate: r.pl.baseDate };
}
export function effectivate(d: ScenarioData, inp: EffectivateInput): ScenarioData {
  if (d.effectivations.some((e) => e.id === inp.id)) return d; // idempotente
  const pl = d.planned.find((p) => p.id === inp.plannedId);
  if (!pl) throw new Error("Previsão não encontrada.");
  if (pl.status !== "ativo") throw new Error("Previsão não está ativa (cancelada ou encerrada).");
  if (!inp.installments.length) throw new Error("Informe ao menos uma parcela efetivada.");
  const pr = plannedRemaining(d, pl.id);
  if (pr.health !== "ok") throw new Error("Conciliação pendente nesta previsão (abatimento legado M ausente ou prazos inválidos): resolva antes de efetivar.");
  for (const i of inp.installments) {
    if (!(i.value > 0)) throw new Error("Valor de parcela deve ser positivo.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new Error("Vencimento inválido.");
  }
  if (inp.kind === "parcial" && inp.remaining) {
    if (!inp.remaining.dates.length && inp.remaining.value !== 0) throw new Error("Restante precisa de datas.");
  }
  const value = inp.installments.reduce((a, i) => a + i.value, 0);
  const cat = pl.categoryId; // a efetivação herda o subgrupo da previsão (Compra ou Despesa)
  const ids: string[] = [];
  inp.installments.forEach((i, n) => {
    const id = `${inp.id}-${n + 1}`;
    ids.push(id);
    const c: Committed = {
      id, supplierId: pl.supplierId, purchaseCode: pl.purchaseCode, document: i.document || `${pl.purchaseCode}/${n + 1}`, value: i.value,
      dueDate: i.date, extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null,
      origin: "efetivacao", plannedId: pl.id, effectivationId: inp.id, categoryId: cat, notes: `Efetivação ${inp.kind} da previsão ${pl.purchaseCode}`, status: "ativo", condition: inp.condition ?? null,
    };
    d.committed.push(c);
  });
  d.effectivations.push({ id: inp.id, plannedId: pl.id, at: inp.at, kind: inp.kind, value, substituted: inp.substituted ?? value, committedIds: ids, prev: { status: pl.status, remainingOverride: pl.remainingOverride }, reversedAt: null, reversalNote: "" });
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
  for (const cid of e.committedIds)
    if (paymentsFor(d, "committed", cid).some((p) => !p.reversedAt)) throw new Error("Há pagamento ativo em parcela desta efetivação: estorne o pagamento antes.");
  if (e.manual && d.effectivations.some((x) => x.plannedId === e.plannedId && !x.reversedAt && d.effectivations.indexOf(x) > d.effectivations.indexOf(e)))
    throw new Error("Há efetivação posterior nesta previsão: reverta a mais recente antes.");
  for (const c of d.committed) if (e.committedIds.includes(c.id)) {
    if (e.linkedLegacy) { c.plannedId = null; c.effectivationId = null; c.origin = "legado"; c.notes = `${c.notes} · vínculo desfeito: ${note}`; }
    else { c.status = "cancelado"; c.notes = `${c.notes} · revertida: ${note}`; }
  }
  // Reversão INDEPENDENTE: não exige reverter outras efetivações; devolve só a parte que esta substituiu
  // (substituted pode diferir do valor efetivado; registros antigos sem o campo usam o valor).
  const pl = d.planned.find((p) => p.id === e.plannedId);
  if (pl) {
    if (e.manual) { pl.status = e.prev.status; pl.remainingOverride = e.prev.remainingOverride; }
    else if (e.kind === "concluida" && pl.status === "encerrado") { pl.status = e.prev.status === "encerrado" ? "ativo" : e.prev.status; pl.remainingOverride = e.prev.remainingOverride; }
    else if (pl.remainingOverride) pl.remainingOverride = { ...pl.remainingOverride, value: pl.remainingOverride.value + (e.substituted ?? e.value) };
  }
  e.reversedAt = at; e.reversalNote = note;
  return d;
}

// Vincula um título legado EXISTENTE (mesma compra) a uma efetivação, sem criar duplicata: deixa de abater via M e passa a contar como efetivado.
export function linkLegacyTitle(d: ScenarioData, inp: { id: string; plannedId: string; committedId: string; at: string }): ScenarioData {
  if (d.effectivations.some((e) => e.id === inp.id)) return d;
  const pl = d.planned.find((p) => p.id === inp.plannedId);
  const c = d.committed.find((x) => x.id === inp.committedId);
  if (!pl || !c) throw new Error("Previsão ou título não encontrado.");
  if (pl.status !== "ativo") throw new Error("Previsão não está ativa.");
  if (c.status === "cancelado") throw new Error("Título cancelado.");
  if (c.plannedId || c.effectivationId) throw new Error("Título já vinculado a uma efetivação.");
  if (c.purchaseCode !== pl.purchaseCode || c.supplierId !== pl.supplierId) throw new Error("Código de compra/fornecedor divergentes: vínculo ambíguo — conciliar manualmente.");
  c.plannedId = pl.id; c.effectivationId = inp.id; c.origin = "efetivacao"; c.notes = `${c.notes} · título legado vinculado à previsão ${pl.purchaseCode} (M=${c.legacyAbatement ?? "ausente"} preservado no histórico)`;
  d.effectivations.push({ id: inp.id, plannedId: pl.id, at: inp.at, kind: "parcial", value: c.value, committedIds: [c.id], linkedLegacy: true, prev: { status: pl.status, remainingOverride: pl.remainingOverride }, reversedAt: null, reversalNote: "" });
  return d;
}
// Restante editável (valor e datas) e encerramento SEPARADO — novas efetivações não obrigam concluir.
export function setPlannedRemaining(d: ScenarioData, plannedId: string, value: number, dates: string[]): ScenarioData {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl || pl.status !== "ativo") throw new Error("Previsão não ativa.");
  if (!dates.length || dates.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x))) throw new Error("Informe datas válidas para o restante.");
  pl.remainingOverride = { value, dates: [...dates].sort() };
  return d;
}
export function closePlanned(d: ScenarioData, plannedId: string, note: string): ScenarioData {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl || pl.status !== "ativo") throw new Error("Previsão não ativa.");
  if (!note.trim()) throw new Error("Informe o motivo do encerramento.");
  pl.status = "encerrado"; pl.remainingOverride = null; pl.notes = `${pl.notes} · encerrada: ${note}`.trim();
  return d;
}
export function reopenPlanned(d: ScenarioData, plannedId: string, note: string): ScenarioData {
  const pl = d.planned.find((p) => p.id === plannedId);
  if (!pl || pl.status !== "encerrado") throw new Error("Previsão não está encerrada.");
  pl.status = "ativo"; pl.notes = `${pl.notes} · reaberta: ${note}`.trim();
  return d;
}
// Resumo/timeline da previsão: original (histórico), efetivado, abatido legado, restante, pago, aberto.
export function plannedSummary(d: ScenarioData, plannedId: string) {
  const r = plannedRemaining(d, plannedId);
  const effs = d.effectivations.filter((e) => e.plannedId === plannedId).sort((a, b) => a.at.localeCompare(b.at));
  const titles = (ids: string[]) => d.committed.filter((c) => ids.includes(c.id)).map((c) => ({ c, ...titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id)) }));
  const timeline = effs.map((e) => ({ e, titles: titles(e.committedIds) }));
  const legacy = d.committed.filter((c) => c.status !== "cancelado" && c.purchaseCode && c.purchaseCode === r.pl.purchaseCode && !c.plannedId && c.origin !== "efetivacao")
    .map((c) => ({ c, ...titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id)) }));
  const active = timeline.filter((t) => !t.e.reversedAt);
  const effectivated = active.reduce((a, t) => a + t.e.value, 0);
  const all = [...active.flatMap((t) => t.titles), ...legacy];
  const paid = all.reduce((a, t) => a + t.paid, 0);
  const open = all.reduce((a, t) => a + Math.max(0, t.open), 0);
  return { original: r.pl.value, effectivated, legacyAbated: r.dist.legacyAbated ?? 0, remaining: r.value, remainingDates: r.dates, paid, open, health: r.health, timeline, legacy, status: r.pl.status };
}

// ---------- Metas mensais versionadas ----------
export function setMonthTarget(d: ScenarioData, month: string, patch: Partial<Omit<MonthTarget, "version" | "history">>, note: string, at: string): ScenarioData {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido (aaaa-mm).");
  for (const k of ["legacyReducer", "webR1", "webR2"] as const) { const v = patch[k]; if (v !== undefined && !(v >= 0 && v < 1)) throw new Error("Percentual deve estar entre 0% e 99,99%."); }
  if (patch.lagDays !== undefined && !(Number.isInteger(patch.lagDays) && patch.lagDays >= 0 && patch.lagDays <= 120)) throw new Error("Defasagem inválida.");
  if (patch.gross !== undefined && !(Number.isInteger(patch.gross) && patch.gross >= 0)) throw new Error("Faturamento inválido.");
  const cur = d.targetConfigs[month];
  const base = cur ?? defaultMonthTarget(d.params, patch.gross ?? 0);
  const { history: _h, ...before } = base; void _h;
  const next: MonthTarget = { ...base, ...patch, version: cur ? cur.version + 1 : 1, history: [...(cur?.history ?? []), { at, version: cur ? cur.version + 1 : 1, before: cur ? before : null, note }] };
  d.targetConfigs[month] = next;
  d.targets[month] = next.gross;
  return d;
}
export function removeMonthTarget(d: ScenarioData, month: string): ScenarioData {
  delete d.targetConfigs[month]; delete d.targets[month];
  return d;
}

// ---------- Plataformas ----------
export function addPlatform(d: ScenarioData, p: { id: string; name: string; start: string; importedCode?: string | null }, at: string): ScenarioData {
  if (d.platforms.some((x) => x.id === p.id)) return d;
  if (!p.name.trim()) throw new Error("Nome obrigatório.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start)) throw new Error("Início de vigência inválido.");
  if (d.platforms.some((x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase())) throw new Error("Já existe plataforma com esse nome.");
  d.platforms.push({ id: p.id, name: p.name.trim(), start: p.start, end: null, importedCode: p.importedCode ?? null, history: [{ at, field: "criação", from: null, to: p.name.trim(), note: "" }] });
  return d;
}
export function updatePlatform(d: ScenarioData, id: string, patch: { name?: string; start?: string; end?: string | null }, note: string, at: string): ScenarioData {
  const pf = d.platforms.find((x) => x.id === id);
  if (!pf) throw new Error("Plataforma não encontrada.");
  if (patch.name !== undefined && !patch.name.trim()) throw new Error("Nome obrigatório.");
  if (pf.end && patch.end === null) throw new Error("Plataforma inativada não é reativada; cadastre nova vigência como nova plataforma.");
  const next = { ...pf, ...patch };
  if (next.end && next.end < next.start) throw new Error("Inativação antes do início.");
  // Recebimentos existentes fora da nova vigência (e não residuais) bloqueiam a mudança de vigência.
  const bad = d.receipts.filter((r) => r.platforms[id] != null && !platformActiveOn(next, r.date) && !(next.end && r.date > next.end && r.residual?.[id]?.note));
  if ((patch.start !== undefined || patch.end !== undefined) && bad.length) throw new Error(`${bad.length} recebimento(s) ficariam fora da vigência sem marcação de residual.`);
  for (const k of ["name", "start", "end"] as const) if (patch[k] !== undefined && patch[k] !== pf[k]) pf.history.push({ at, field: k, from: pf[k], to: patch[k], note });
  Object.assign(pf, patch);
  return d;
}
export function deletePlatform(d: ScenarioData, id: string): ScenarioData {
  if (d.receipts.some((r) => r.platforms[id] != null)) throw new Error("Plataforma referenciada por recebimentos: não pode ser excluída (inative-a).");
  d.platforms = d.platforms.filter((x) => x.id !== id);
  return d;
}
/** Grava valor de plataforma num recebimento respeitando vigência; após inativação só como repasse residual com nota. */
export function setReceiptPlatform(d: ScenarioData, receiptId: string, platformId: string, value: number | null, residualNote: string | null, at: string): ScenarioData {
  const r = d.receipts.find((x) => x.id === receiptId);
  const pf = d.platforms.find((x) => x.id === platformId);
  if (!r || !pf) throw new Error("Recebimento ou plataforma não encontrado.");
  r.residual ??= {};
  if (value !== null && !platformActiveOn(pf, r.date)) {
    if (!(pf.end && r.date > pf.end)) throw new Error(`"${pf.name}" não estava vigente em ${r.date}.`);
    if (!residualNote?.trim()) throw new Error(`"${pf.name}" inativada em ${pf.end}: marque como repasse residual com nota.`);
    r.residual[platformId] = { note: residualNote.trim(), at };
  }
  if (value === null) delete r.residual[platformId];
  r.platforms[platformId] = value;
  stampReceiptAccounts(d, r); // grava a conta padrão vigente na data (sem reatribuir contas já gravadas)
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
/** Data de hoje no fuso America/Sao_Paulo (não UTC). */
export function todaySP(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
export { addDays };
