import { describe, expect, it } from "vitest";
import { emptyData, registerPayment, reversePayment, setReceiptPlatform, addPlatform } from "./actions";
import {
  accountBalance, addAccount, addCard, addTransfer, confirmBankTransition, consolidatedBalance, createInvoice, defaultAccountFor,
  invoiceMonthFor, movements, previewBankTransition, coverTitleWithCard, reverseCardOp, addCardPurchase, cancelInvoice, registerPaymentBatch, reverseTransfer, setPlatformDefaultAccount, setReceiptAccount,
} from "./banco";
import { computeFlow } from "./engine";
import { diffData } from "../diff";
import type { ScenarioData } from "./types";

const AT = "2026-11-10T12:00:00Z";
function base(): ScenarioData {
  const d = emptyData();
  d.params.startDate = "2026-11-01"; d.params.saldoInicial = 50_000;
  addAccount(d, "A", { bank: "Itaú", label: "Movimento", holder: "Sandrini", agency: "1", account: "1-1", openingBalance: 100_000, openingDate: "2026-10-31" }, AT);
  addAccount(d, "B", { bank: "Bradesco", label: "Cobrança", holder: "Sandrini", agency: "2", account: "2-2", openingBalance: 20_000, openingDate: "2026-10-31" }, AT);
  d.suppliers.push({ id: "s1", name: "Forn", group: "", terms: [] });
  d.committed.push({ id: "c1", supplierId: "s1", purchaseCode: "P1", document: "NF1", value: 10_000, dueDate: "2026-11-05", extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null, origin: "manual", plannedId: null, effectivationId: null, categoryId: "", notes: "", status: "ativo" });
  addPlatform(d, { id: "ml", name: "Mercado Livre", start: "2026-01-01" }, AT);
  return d;
}

describe("conta padrão por plataforma (vigência)", () => {
  it("sugere a conta vigente na data e nunca reatribui o passado", () => {
    const d = base();
    setPlatformDefaultAccount(d, "ml", "2026-01-01", "A", "", AT);
    d.receipts.push({ id: "r1", date: "2026-11-03", platforms: {}, general: null, notes: "" });
    setReceiptPlatform(d, "r1", "ml", 5_000, null, AT);
    expect(d.receipts[0]!.accountByPlatform!["ml"]!.accountId).toBe("A");
    setPlatformDefaultAccount(d, "ml", "2026-11-10", "B", "troca", AT);
    expect(defaultAccountFor(d.platforms[0]!, "2026-11-09")).toBe("A");
    expect(defaultAccountFor(d.platforms[0]!, "2026-11-10")).toBe("B");
    setReceiptPlatform(d, "r1", "ml", 6_000, null, AT); // edição do valor não reatribui
    expect(d.receipts[0]!.accountByPlatform!["ml"]!.accountId).toBe("A");
    expect(d.transfers).toHaveLength(0); // troca de padrão não gera transferência
  });
  it("override vale só no recebimento; geral sem plataforma usa conta escolhida", () => {
    const d = base();
    setPlatformDefaultAccount(d, "ml", "2026-01-01", "A", "", AT);
    d.receipts.push({ id: "r1", date: "2026-11-03", platforms: {}, general: 1_000, notes: "" }, { id: "r2", date: "2026-11-04", platforms: {}, general: null, notes: "" });
    setReceiptPlatform(d, "r1", "ml", 5_000, null, AT); setReceiptPlatform(d, "r2", "ml", 7_000, null, AT);
    setReceiptAccount(d, "r1", "ml", "B"); setReceiptAccount(d, "r1", "general", "B");
    expect(d.receipts[0]!.accountByPlatform!["ml"]).toEqual({ accountId: "B", override: true });
    expect(d.receipts[1]!.accountByPlatform!["ml"]!.accountId).toBe("A");
    expect(movements(d).filter((m) => m.refId === "r1").every((m) => m.accountId === "B")).toBe(true);
  });
});

describe("pagamentos multicontas", () => {
  it("parcial em duas contas, depois quitação; cada conta só sua parte; estorno identificado", () => {
    const d = base();
    registerPaymentBatch(d, { batchId: "b1", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "A", amount: 3_000, date: "2026-11-05" }, { accountId: "B", amount: 2_000, date: "2026-11-05" }] });
    expect(accountBalance(d, "A", "2026-11-30").realized).toBe(97_000);
    expect(accountBalance(d, "B", "2026-11-30").realized).toBe(18_000);
    registerPaymentBatch(d, { batchId: "b2", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "B", amount: 5_000, date: "2026-11-08" }] });
    expect(consolidatedBalance(d, "2026-11-30").value).toBe(110_000); // consolidado desconta 10.000 uma vez
    reversePayment(d, "b2-1", "erro", AT);
    expect(accountBalance(d, "B", "2026-11-30").realized).toBe(18_000);
    expect(d.payments.find((p) => p.id === "b2-1")!.reversedAt).toBe(AT);
  });
  it("rejeita excedente (sem juros/multa) sem gravar nenhuma linha, e reenvio duplicado é idempotente", () => {
    const d = base();
    expect(() => registerPaymentBatch(d, { batchId: "b1", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "A", amount: 6_000, date: "2026-11-05" }, { accountId: "B", amount: 4_001, date: "2026-11-05" }] })).toThrow(/excede/);
    expect(d.payments).toHaveLength(0);
    registerPaymentBatch(d, { batchId: "b1", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "A", amount: 6_000, date: "2026-11-05" }] });
    registerPaymentBatch(d, { batchId: "b1", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "A", amount: 6_000, date: "2026-11-05" }] });
    expect(d.payments).toHaveLength(1);
    // concorrência: segunda baixa calculada sobre o saldo já reduzido é rejeitada
    expect(() => registerPaymentBatch(d, { batchId: "b2", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "B", amount: 6_000, date: "2026-11-06" }] })).toThrow(/excede/);
    expect(() => registerPaymentBatch(d, { batchId: "b3", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "A", amount: 100, date: "2026-11-06" }, { accountId: "A", amount: 100, date: "2026-11-06" }] })).toThrow(/duplicadas/);
  });
  it("baixa legada sem conta aparece como Conta não informada e não é atribuída", () => {
    const d = base();
    registerPayment(d, { id: "old", titleKind: "committed", titleId: "c1", date: "2026-11-02", amount: 1_000, note: "" });
    expect(movements(d).find((m) => m.refId === "old")!.accountId).toBeNull();
    expect(consolidatedBalance(d, "2026-11-30")).toMatchObject({ value: 120_000, unassigned: 1 });
  });
});

describe("transferências", () => {
  it("duas pernas num registro, neutra no consolidado e estorno rastreável", () => {
    const d = base();
    addTransfer(d, { id: "t1", fromAccountId: "A", toAccountId: "B", amount: 30_000, date: "2026-11-02", note: "", at: AT, by: "x" });
    expect(accountBalance(d, "A", "2026-11-30").realized).toBe(70_000);
    expect(accountBalance(d, "B", "2026-11-30").realized).toBe(50_000);
    expect(consolidatedBalance(d, "2026-11-30").value).toBe(120_000);
    expect(computeFlow(d, { start: "2026-11-01", end: "2026-11-30" }).days.every((x) => x.saidas === 0 || x.date === "2026-11-05")).toBe(true);
    reverseTransfer(d, "t1", "duplicada", AT);
    expect(accountBalance(d, "A", "2026-11-30").realized).toBe(100_000);
    expect(() => addTransfer(d, { id: "t2", fromAccountId: "A", toAccountId: "A", amount: 1, date: "2026-11-02", note: "", at: AT, by: "x" })).toThrow();
    expect(() => addTransfer(d, { id: "t3", fromAccountId: "A", toAccountId: "B", amount: 0, date: "2026-11-02", note: "", at: AT, by: "x" })).toThrow();
  });
});

describe("saldos e data de referência", () => {
  it("movimentos até a data de referência não são recontados; estimado/informado não realizado não entra", () => {
    const d = base();
    d.receipts.push({ id: "r0", date: "2026-10-31", platforms: {}, general: 9_999, notes: "", generalAccountId: "A", realized: true });
    d.receipts.push({ id: "r1", date: "2026-11-03", platforms: {}, general: 4_000, notes: "", generalAccountId: "A" });
    expect(accountBalance(d, "A", "2026-11-30")).toMatchObject({ realized: 100_000, pending: 4_000 });
    d.receipts[1]!.realized = true;
    expect(accountBalance(d, "A", "2026-11-30").realized).toBe(104_000);
  });
  it("transição do saldo inicial: legado até confirmação, nunca soma os dois, bloqueia com pendências", () => {
    const d = base();
    expect(computeFlow(d, { start: "2026-11-01", end: "2026-11-01" }).days[0]!.saldoInicial).toBe(50_000);
    expect(previewBankTransition(d)).toMatchObject({ legacyValue: 50_000, accountsValue: 120_000, pending: [] });
    confirmBankTransition(d, "eduardo", "migração", AT);
    expect(computeFlow(d, { start: "2026-11-01", end: "2026-11-01" }).days[0]!.saldoInicial).toBe(120_000);
    const e = base(); addAccount(e, "C", { bank: "BB", label: "Nova", holder: "", agency: "", account: "", openingBalance: null, openingDate: null }, AT);
    expect(() => confirmBankTransition(e, "x", "y", AT)).toThrow(/bloqueada/);
  });
});

describe("cartões", () => {
  it("compra não debita banco nem entra no fluxo; fatura entra uma vez e debita só na baixa", () => {
    const d = base();
    addCard(d, { id: "k", accountId: "A", name: "Visa", last4: "1234", closingDay: 10, dueDay: 20, active: true });
    expect(invoiceMonthFor(d.cards[0]!, "2026-11-11")).toBe("2026-12");
    for (const [id, v] of [["e1", 1_000], ["e2", 2_000]] as const) d.expenses.push({ id, supplierId: "s1", document: id, value: v, baseDate: "2026-11-05", termDays: null, extensionDate: null, extensionHistory: [], categoryId: "", notes: "", status: "ativo", cardId: "k" });
    expect(() => registerPaymentBatch(d, { batchId: "x", titleKind: "expense", titleId: "e1", note: "", lines: [{ accountId: "A", amount: 1_000, date: "2026-11-05" }] })).toThrow(/fatura/);
    // antes do fechamento: projeção da fatura no vencimento previsto (não some do caixa projetado)
    expect(computeFlow(d, { start: "2026-11-01", end: "2026-11-30" }).days.find((x) => x.date === "2026-11-20")!.despesa).toBe(3_000);
    createInvoice(d, { id: "inv", cardId: "k", month: "2026-11", dueDate: "2026-11-20", supplierId: "s1", categoryId: "" });
    expect(() => createInvoice(d, { id: "inv2", cardId: "k", month: "2026-11", dueDate: "2026-11-20", supplierId: "s1", categoryId: "" })).toThrow(/já existe/);
    const day = computeFlow(d, { start: "2026-11-01", end: "2026-11-30" }).days.find((x) => x.date === "2026-11-20")!;
    expect(day.despesa).toBe(3_000);
    expect(accountBalance(d, "A", "2026-11-30").realized).toBe(100_000);
    registerPaymentBatch(d, { batchId: "p", titleKind: "expense", titleId: "inv", note: "", lines: [{ accountId: "A", amount: 3_000, date: "2026-11-20" }] });
    expect(accountBalance(d, "A", "2026-11-30").realized).toBe(97_000);
  });
});

describe("auditoria e isolamento", () => {
  it("contas, cartões e transferências aparecem no antes/depois auditado", () => {
    const a = base(); const b = JSON.parse(JSON.stringify(a)) as ScenarioData;
    addTransfer(b, { id: "t1", fromAccountId: "A", toAccountId: "B", amount: 1, date: "2026-11-02", note: "", at: AT, by: "x" });
    expect(diffData(a, b).map((c) => c.entity)).toEqual(["Transferência"]);
  });
  it("simulação (cópia) não altera a base", () => {
    const real = base(); const sim = JSON.parse(JSON.stringify(real)) as ScenarioData;
    registerPaymentBatch(sim, { batchId: "b", titleKind: "committed", titleId: "c1", note: "", lines: [{ accountId: "A", amount: 1_000, date: "2026-11-05" }] });
    expect(real.payments).toHaveLength(0);
  });
});

describe("operações no cartão", () => {
  const withCard = () => { const d = base(); addCard(d, { id: "k", accountId: "A", name: "Visa", last4: "1234", closingDay: 10, dueDay: 20, active: true }); d.committed[0]!.value = 1_000_000; d.committed[0]!.categoryId = "sub"; return d; };
  const flow = (d: ScenarioData) => computeFlow(d, { start: "2026-11-01", end: "2027-02-28" }).days;
  it("título 10.000: 6.000 no cartão, 4.000 segue no vencimento original; fatura futura 6.000 sem duplicar; banco só na baixa da fatura", () => {
    const d = withCard();
    coverTitleWithCard(d, { id: "op", cardId: "k", titleKind: "committed", titleId: "c1", date: "2026-11-12", amount: 600_000, installments: 1, at: AT, by: "x" });
    coverTitleWithCard(d, { id: "op", cardId: "k", titleKind: "committed", titleId: "c1", date: "2026-11-12", amount: 600_000, installments: 1, at: AT, by: "x" }); // idempotente
    expect(d.cardOps).toHaveLength(1);
    const days = flow(d);
    expect(days.find((x) => x.date === "2026-11-05")!.comprometida).toBe(400_000); // parte não coberta
    expect(days.find((x) => x.date === "2026-12-20")!.despesa).toBe(600_000); // projeção da fatura (dez)
    expect(days.reduce((a, x) => a + x.saidas, 0)).toBe(1_000_000); // total sem duplicidade
    expect(d.expenses.find((e) => e.cardOpId === "op")!.categoryId).toBe("sub"); // mantém subgrupo
    expect(accountBalance(d, "A", "2027-02-28").realized).toBe(100_000); // banco intacto
    expect(() => coverTitleWithCard(d, { id: "op2", cardId: "k", titleKind: "committed", titleId: "c1", date: "2026-11-12", amount: 400_001, installments: 1, at: AT, by: "x" })).toThrow(/excede/);
    createInvoice(d, { id: "inv", cardId: "k", month: "2026-12", dueDate: "2026-12-20", supplierId: "s1", categoryId: "" });
    expect(flow(d).reduce((a, x) => a + x.saidas, 0)).toBe(1_000_000); // fatura substitui a projeção
    expect(() => reverseCardOp(d, "op", "erro", AT)).toThrow(/fatura já fechada/);
    registerPaymentBatch(d, { batchId: "pf", titleKind: "expense", titleId: "inv", note: "", lines: [{ accountId: "A", amount: 350_000, date: "2026-12-20" }, { accountId: "B", amount: 250_000, date: "2026-12-20" }] });
    expect(accountBalance(d, "A", "2027-02-28").realized).toBe(100_000 - 350_000);
    expect(() => cancelInvoice(d, "inv", "x")).toThrow(/pagamento ativo/);
  });
  it("estorno antes do fechamento desfaz cobertura e projeção, preservando histórico", () => {
    const d = withCard();
    coverTitleWithCard(d, { id: "op", cardId: "k", titleKind: "committed", titleId: "c1", date: "2026-11-12", amount: 1_000_000, installments: 2, at: AT, by: "x" });
    reverseCardOp(d, "op", "lançado errado", AT);
    expect(d.payments[0]!.reversedAt).toBe(AT);
    expect(d.expenses.filter((e) => e.cardOpId === "op").every((e) => e.status === "cancelado")).toBe(true);
    expect(flow(d).find((x) => x.date === "2026-11-05")!.comprometida).toBe(1_000_000);
  });
  it("nova compra parcelada: 3 faturas, resíduo na última, sem obrigação duplicada", () => {
    const d = withCard(); d.committed = [];
    addCardPurchase(d, { id: "nc", cardId: "k", date: "2026-11-05", amount: 100_000, installments: 3, supplierId: "s1", categoryId: "sub", document: "NF9", notes: "", at: AT, by: "x" });
    const parc = d.expenses.filter((e) => e.cardOpId === "nc");
    expect(parc.map((e) => e.value)).toEqual([33_333, 33_333, 33_334]);
    const days = flow(d);
    expect(["2026-11-20", "2026-12-20", "2027-01-20"].map((dt) => days.find((x) => x.date === dt)!.despesa)).toEqual([33_333, 33_333, 33_334]);
    expect(days.reduce((a, x) => a + x.saidas, 0)).toBe(100_000);
  });
});
