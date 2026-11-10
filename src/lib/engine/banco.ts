// Controle bancário: contas, cartões, conta padrão por plataforma (vigência), baixas multicontas, transferências e saldos.
// Funções puras sobre o rascunho (mesmo padrão de actions.ts). NÃO importa engine.ts (engine usa consolidatedOpening).
import type { BankAccount, Card, Expense, Payment, Platform, Receipt, ScenarioData, Transfer } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const NO_ACCOUNT = "Conta não informada";
const err = (m: string): never => { throw new Error(m); };

// ---------- Contas ----------
export type AccountInput = Pick<BankAccount, "bank" | "label" | "holder" | "agency" | "account"> & { openingBalance: number | null; openingDate: string | null };
export function addAccount(d: ScenarioData, id: string, a: AccountInput, at: string): ScenarioData {
  if (d.bankAccounts.some((x) => x.id === id)) return d;
  if (!a.bank.trim() || !a.label.trim()) err("Informe banco e identificação da conta.");
  if ((a.openingBalance === null) !== (a.openingDate === null)) err("Saldo inicial e data de referência devem ser informados juntos.");
  if (a.openingDate && !ISO.test(a.openingDate)) err("Data de referência inválida.");
  if (d.bankAccounts.some((x) => x.bank.trim().toLowerCase() === a.bank.trim().toLowerCase() && x.agency === a.agency && x.account === a.account && a.account))
    err("Já existe conta com mesmo banco, agência e conta.");
  d.bankAccounts.push({ id, ...a, bank: a.bank.trim(), label: a.label.trim(), active: true, history: [{ at, field: "criação", from: null, to: a.label.trim(), note: "" }] });
  return d;
}
export function updateAccount(d: ScenarioData, id: string, patch: Partial<AccountInput & { active: boolean }>, note: string, at: string): ScenarioData {
  const a = d.bankAccounts.find((x) => x.id === id) ?? err("Conta não encontrada.");
  const touchesOpening = (patch.openingBalance !== undefined && patch.openingBalance !== a.openingBalance) || (patch.openingDate !== undefined && patch.openingDate !== a.openingDate);
  if (touchesOpening && a.openingBalance !== null && !note.trim()) err("Correção de saldo inicial exige justificativa.");
  const next = { ...a, ...patch };
  if ((next.openingBalance === null) !== (next.openingDate === null)) err("Saldo inicial e data de referência devem ser informados juntos.");
  if (next.openingDate && !ISO.test(next.openingDate)) err("Data de referência inválida.");
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] !== undefined && patch[k] !== a[k]) a.history.push({ at, field: k, from: a[k], to: patch[k], note });
  Object.assign(a, patch);
  return d;
}
export const accountName = (d: Pick<ScenarioData, "bankAccounts">, id: string | null | undefined) => {
  if (!id) return NO_ACCOUNT;
  const a = d.bankAccounts.find((x) => x.id === id);
  return a ? `${a.bank} · ${a.label}${a.active ? "" : " (inativa)"}` : "(conta removida)";
};

// ---------- Cartões ----------
export function addCard(d: ScenarioData, c: Card): ScenarioData {
  if (d.cards.some((x) => x.id === c.id)) return d;
  if (!d.bankAccounts.some((a) => a.id === c.accountId)) err("Conta do cartão não encontrada.");
  if (!c.name.trim()) err("Nome do cartão obrigatório.");
  if (!/^\d{4}$/.test(c.last4)) err("Informe os últimos 4 dígitos.");
  for (const n of [c.closingDay, c.dueDay]) if (!(Number.isInteger(n) && n >= 1 && n <= 31)) err("Dia de fechamento/vencimento entre 1 e 31.");
  d.cards.push({ ...c, name: c.name.trim() });
  return d;
}
/** Mês (aaaa-mm) da fatura em que a compra entra: até o fechamento = mês corrente; depois = mês seguinte. */
export function invoiceMonthFor(card: Card, date: string): string {
  const [y, m, day] = date.split("-").map(Number) as [number, number, number];
  if (day <= card.closingDay) return date.slice(0, 7);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
/** Vencimento previsto da fatura do mês: dia de vencimento no mês da fatura, ou no seguinte se vence antes/no fechamento. */
export function invoiceDueDate(card: Card, month: string): string {
  let [y, m] = month.split("-").map(Number) as [number, number];
  if (card.dueDay <= card.closingDay) { m += 1; if (m > 12) { m = 1; y += 1; } }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(card.dueDay, last)).padStart(2, "0")}`;
}
export function cardPurchases(d: ScenarioData, cardId: string, month?: string) {
  const card = d.cards.find((c) => c.id === cardId);
  return d.expenses.filter((e) => e.cardId === cardId && e.status !== "cancelado" && (!month || (card && invoiceMonthFor(card, e.baseDate) === month)));
}
/** Fecha a fatura: cria UMA despesa (a fatura) com o total das compras do mês e vincula as compras. A saída bancária só ocorre na baixa da fatura. */
export function createInvoice(d: ScenarioData, inp: { id: string; cardId: string; month: string; dueDate: string; supplierId: string; categoryId: string }): ScenarioData {
  if (d.expenses.some((e) => e.id === inp.id)) return d;
  const card = d.cards.find((c) => c.id === inp.cardId) ?? err("Cartão não encontrado.");
  if (!ISO.test(inp.dueDate)) err("Vencimento da fatura inválido.");
  if (d.expenses.some((e) => e.invoiceOf?.cardId === card.id && e.invoiceOf.month === inp.month && e.status !== "cancelado")) err("Fatura deste cartão/mês já existe (evita duplicar).");
  const items = cardPurchases(d, card.id, inp.month).filter((e) => !e.invoiceId);
  if (!items.length) err("Nenhuma compra no cartão para este mês.");
  const value = items.reduce((a, e) => a + e.value, 0);
  const inv: Expense = { id: inp.id, supplierId: inp.supplierId, document: `Fatura ${card.name} ${inp.month.slice(5)}/${inp.month.slice(0, 4)}`, value, baseDate: inp.dueDate, termDays: 0, extensionDate: null, extensionHistory: [], categoryId: inp.categoryId, notes: `${items.length} compra(s) no cartão final ${card.last4}`, status: "ativo", invoiceOf: { cardId: card.id, month: inp.month } };
  d.expenses.push(inv);
  for (const e of items) e.invoiceId = inp.id;
  return d;
}

// ---------- Conta padrão por plataforma (vigência) ----------
export function setPlatformDefaultAccount(d: ScenarioData, platformId: string, from: string, accountId: string, note: string, at: string): ScenarioData {
  const pf = d.platforms.find((p) => p.id === platformId) ?? err("Plataforma não encontrada.");
  if (!ISO.test(from)) err("Início de vigência inválido.");
  if (!d.bankAccounts.some((a) => a.id === accountId && a.active)) err("Conta inválida ou inativa.");
  const list = (pf.defaultAccounts ??= []);
  const same = list.findIndex((x) => x.from === from);
  const prev = same >= 0 ? list[same]!.accountId : null;
  if (same >= 0) list[same] = { from, accountId, at, note }; else list.push({ from, accountId, at, note });
  list.sort((a, b) => a.from.localeCompare(b.from));
  pf.history.push({ at, field: "conta padrão", from: prev, to: `${accountId} desde ${from}`, note });
  // Recebimentos já gravados NÃO são reatribuídos (a conta fica no próprio registro).
  return d;
}
/** Conta padrão vigente na data: último período com início ≤ data (até a próxima mudança). */
export function defaultAccountFor(pf: Pick<Platform, "defaultAccounts">, date: string): string | null {
  let r: string | null = null;
  for (const p of pf.defaultAccounts ?? []) if (p.from <= date) r = p.accountId;
  return r;
}
/** Grava no recebimento a conta padrão das plataformas com valor ainda sem conta (não altera contas já gravadas). */
export function stampReceiptAccounts(d: ScenarioData, r: Receipt) {
  if (!r.date) return;
  r.accountByPlatform ??= {};
  for (const [pid, v] of Object.entries(r.platforms)) {
    if (v == null) { delete r.accountByPlatform[pid]; continue; }
    if (r.accountByPlatform[pid]) continue;
    const pf = d.platforms.find((p) => p.id === pid);
    const acc = pf ? defaultAccountFor(pf, r.date) : null;
    if (acc) r.accountByPlatform[pid] = { accountId: acc, override: false };
  }
}
/** "Alterar somente neste recebimento". target = id da plataforma ou "general". */
export function setReceiptAccount(d: ScenarioData, receiptId: string, target: string, accountId: string | null): ScenarioData {
  const r = d.receipts.find((x) => x.id === receiptId) ?? err("Recebimento não encontrado.");
  if (accountId && !d.bankAccounts.some((a) => a.id === accountId)) err("Conta não encontrada.");
  if (target === "general") { r.generalAccountId = accountId; return d; }
  r.accountByPlatform ??= {};
  if (accountId) r.accountByPlatform[target] = { accountId, override: true }; else delete r.accountByPlatform[target];
  return d;
}

// ---------- Baixas multicontas ----------
export interface PayLine { accountId: string; amount: number; date: string }
const activePays = (d: ScenarioData, kind: Payment["titleKind"], id: string) => d.payments.filter((p) => p.titleKind === kind && p.titleId === id && !p.reversedAt);
export function titleOpen(d: ScenarioData, kind: Payment["titleKind"], id: string) {
  const t = kind === "committed" ? d.committed.find((c) => c.id === id) : d.expenses.find((e) => e.id === id);
  if (!t) err("Título não encontrado.");
  return { title: t!, open: t!.value - activePays(d, kind, id).reduce((a, p) => a + p.amount, 0) };
}
/** Valida e grava TODAS as linhas ou nenhuma. Excedente bloqueado: juros/multa/desconto não são suportados. */
export function registerPaymentBatch(d: ScenarioData, inp: { batchId: string; titleKind: Payment["titleKind"]; titleId: string; lines: PayLine[]; note: string }): ScenarioData {
  if (d.payments.some((p) => p.batchId === inp.batchId)) return d; // idempotente (reenvio)
  const { title, open } = titleOpen(d, inp.titleKind, inp.titleId);
  if (title.status === "cancelado") err("Título cancelado não recebe pagamento.");
  if ("cardId" in title && title.cardId) err("Compra no cartão não é paga diretamente: a saída bancária ocorre na baixa da fatura.");
  if (!inp.lines.length) err("Informe ao menos uma conta.");
  for (const [i, l] of inp.lines.entries()) {
    const acc = d.bankAccounts.find((a) => a.id === l.accountId);
    if (!acc) err(`Linha ${i + 1}: selecione a conta de origem.`);
    if (!acc!.active) err(`Linha ${i + 1}: conta inativa.`);
    if (!(Number.isInteger(l.amount) && l.amount > 0)) err(`Linha ${i + 1}: valor deve ser positivo.`);
    if (!ISO.test(l.date)) err(`Linha ${i + 1}: data inválida.`);
  }
  const keys = inp.lines.map((l) => `${l.accountId}|${l.date}|${l.amount}`);
  if (new Set(keys).size !== keys.length) err("Linhas duplicadas (mesma conta, data e valor).");
  const sum = inp.lines.reduce((a, l) => a + l.amount, 0);
  if (sum > open) err(`Soma informada excede o saldo pendente em ${((sum - open) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Juros, multa e desconto ainda não são suportados — registre apenas até o saldo pendente.`);
  inp.lines.forEach((l, i) => d.payments.push({ id: `${inp.batchId}-${i + 1}`, batchId: inp.batchId, titleKind: inp.titleKind, titleId: inp.titleId, accountId: l.accountId, amount: l.amount, date: l.date, note: inp.note, reversedAt: null, reversalNote: "" }));
  return d;
}

// ---------- Transferências ----------
export function addTransfer(d: ScenarioData, t: Omit<Transfer, "reversedAt" | "reversalNote">): ScenarioData {
  if (d.transfers.some((x) => x.id === t.id)) return d;
  if (t.fromAccountId === t.toAccountId) err("Origem e destino devem ser contas diferentes.");
  for (const id of [t.fromAccountId, t.toAccountId]) { const a = d.bankAccounts.find((x) => x.id === id); if (!a) err("Conta não encontrada."); if (!a!.active) err("Conta inativa."); }
  if (!(Number.isInteger(t.amount) && t.amount > 0)) err("Valor deve ser positivo.");
  if (!ISO.test(t.date)) err("Data inválida.");
  d.transfers.push({ ...t, reversedAt: null, reversalNote: "" });
  return d;
}
export function reverseTransfer(d: ScenarioData, id: string, note: string, at: string): ScenarioData {
  const t = d.transfers.find((x) => x.id === id) ?? err("Transferência não encontrada.");
  if (!note.trim()) err("Informe o motivo do estorno.");
  if (!t.reversedAt) { t.reversedAt = at; t.reversalNote = note; }
  return d;
}

// ---------- Movimentos e saldos ----------
export interface Movement { date: string; accountId: string | null; kind: "recebimento" | "pagamento" | "transferência"; desc: string; amount: number; realized: boolean; refId: string }
export function movements(d: ScenarioData): Movement[] {
  const out: Movement[] = [];
  const pname = (id: string) => d.platforms.find((p) => p.id === id)?.name ?? "Plataforma";
  for (const r of d.receipts) {
    if (!r.date) continue;
    const realized = r.realized === true;
    for (const [pid, v] of Object.entries(r.platforms)) if (v) out.push({ date: r.date, accountId: r.accountByPlatform?.[pid]?.accountId ?? null, kind: "recebimento", desc: `Recebimento ${pname(pid)}`, amount: v, realized, refId: r.id });
    if (r.general) out.push({ date: r.date, accountId: r.generalAccountId ?? null, kind: "recebimento", desc: "Recebimento geral", amount: r.general, realized, refId: r.id });
  }
  for (const p of d.payments) if (!p.reversedAt) {
    const t = p.titleKind === "committed" ? d.committed.find((c) => c.id === p.titleId) : d.expenses.find((e) => e.id === p.titleId);
    const sup = d.suppliers.find((s) => s.id === t?.supplierId)?.name ?? "";
    out.push({ date: p.date, accountId: p.accountId ?? null, kind: "pagamento", desc: `Pagamento ${sup} ${t?.document ?? ""}`.trim(), amount: -p.amount, realized: true, refId: p.id });
  }
  for (const t of d.transfers) if (!t.reversedAt) {
    out.push({ date: t.date, accountId: t.fromAccountId, kind: "transferência", desc: `Transferência para ${accountName(d, t.toAccountId)}`, amount: -t.amount, realized: true, refId: t.id });
    out.push({ date: t.date, accountId: t.toAccountId, kind: "transferência", desc: `Transferência de ${accountName(d, t.fromAccountId)}`, amount: t.amount, realized: true, refId: t.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
/** Saldo da conta ao fim de `until`: inicial + movimentos realizados com data > data de referência (não reconta o já incluído). */
export function accountBalance(d: ScenarioData, accountId: string, until: string, ms = movements(d)) {
  const a = d.bankAccounts.find((x) => x.id === accountId);
  if (!a || a.openingBalance === null || !a.openingDate) return { realized: null, pending: 0, missingOpening: true };
  let realized = a.openingBalance, pending = 0;
  for (const m of ms) if (m.accountId === accountId && m.date > a.openingDate && m.date <= until) { if (m.realized) realized += m.amount; else pending += m.amount; }
  return { realized, pending, missingOpening: false };
}
/** Saldo consolidado ao fim de `date` pela soma das contas (transferências se anulam). Pendências impedem usar como saldo do fluxo. */
export function consolidatedBalance(d: ScenarioData, date: string) {
  const ms = movements(d);
  const pending: string[] = [];
  let value = 0;
  for (const a of d.bankAccounts) {
    if (a.openingBalance === null || !a.openingDate) { if (a.active) pending.push(`${accountName(d, a.id)}: sem saldo inicial.`); continue; }
    if (a.openingDate > date) { pending.push(`${accountName(d, a.id)}: data de referência ${a.openingDate} posterior a ${date}.`); continue; }
    value += accountBalance(d, a.id, date, ms).realized ?? 0;
  }
  if (!d.bankAccounts.length) pending.push("Nenhuma conta cadastrada.");
  const unassigned = ms.filter((m) => m.realized && !m.accountId && m.date <= date).length;
  return { value, pending, unassigned };
}
/** Saldo inicial do fluxo (início do dia `start`). Legado até a transição confirmada. */
export function flowOpening(d: ScenarioData): number {
  if (d.params.openingMode !== "contas") return d.params.saldoInicial;
  const day = new Date(Date.parse(d.params.startDate + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  return consolidatedBalance(d, day).value;
}
export function previewBankTransition(d: ScenarioData) {
  const day = new Date(Date.parse(d.params.startDate + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  const c = consolidatedBalance(d, day);
  return { legacyValue: d.params.saldoInicial, accountsValue: c.value, diff: c.value - d.params.saldoInicial, pending: c.pending, unassigned: c.unassigned, refDate: day };
}
export function confirmBankTransition(d: ScenarioData, by: string, note: string, at: string): ScenarioData {
  const p = previewBankTransition(d);
  if (p.pending.length) err(`Transição bloqueada: ${p.pending.join(" ")}`);
  if (!note.trim()) err("Informe a observação da transição.");
  d.params.openingMode = "contas";
  d.params.bankTransition = { at, by, legacyValue: p.legacyValue, accountsValue: p.accountsValue, note };
  return d;
}
export function revertBankTransition(d: ScenarioData): ScenarioData { d.params.openingMode = "legado"; return d; }
