import { describe, expect, it } from "vitest";
import { computeFlow, distributePlanned, paymentsFor, titleStatus } from "./engine";
import { closePlanned, confirmExtension, effectivate, linkLegacyTitle, normalizeData, plannedRemaining, plannedSummary, registerPayment, reverseEffectivation, reversePayment, setPlannedRemaining, suggestEffectivation } from "./actions";
import { computeDashboard } from "./dashboard";
import { diffData } from "../diff";
import { editDraft } from "../store";
import type { ScenarioData } from "./types";

// Cenário do enunciado: previsão 10.000 com prazos 30/60/90.
const scen = (): ScenarioData => normalizeData({
  params: { profile: "legado", legacyReducer: 0.25, divisorLegado: "30", lagDays: 10, startDate: "2026-10-01", saldoInicial: 5000000 },
  suppliers: [{ id: "s", name: "Fornecedor X", group: "G", terms: [30, 60, 90, null, null, null, null, null, null, null] }],
  categories: [{ id: "cc", name: "Merc", kind: "comprometida", group: "Compras" }],
  targets: {},
  planned: [{ id: "p", supplierId: "s", purchaseCode: "PC1", document: "", value: 1000000, baseDate: "2026-10-01", categoryId: "", notes: "", status: "ativo", remainingOverride: null }],
});
const sup = (d: ScenarioData) => d.suppliers[0];
const outflows = (d: ScenarioData) => computeFlow(d, { start: "2026-10-01", end: "2027-01-31" }).days.filter((x) => x.saidas).map((x) => [x.date, x.planejada, x.comprometida, x.despesa]);

describe("Efetivação de compra/pedido", () => {
  it("parcial 6000 em 45/75 (2×3000) mantém 4000 com datas próprias, sem duplicidade", () => {
    const d = scen();
    const s = suggestEffectivation(d, "p", 600000);
    expect(s.remainingValue).toBe(400000);
    expect(s.remainingDates).toEqual(["2026-10-31", "2026-11-30", "2026-12-30"]);
    effectivate(d, { id: "ef1", plannedId: "p", kind: "parcial", at: "2026-10-02T00:00:00Z", installments: [{ value: 300000, date: "2026-11-15", document: "" }, { value: 300000, date: "2026-12-15", document: "" }], remaining: { value: 400000, dates: ["2027-01-10", "2027-01-20"] } });
    expect(d.committed).toHaveLength(2);
    expect(d.committed.every((c) => c.plannedId === "p" && c.origin === "efetivacao")).toBe(true);
    const dist = distributePlanned(d.planned[0]!, sup(d), d.committed, "legado", d.effectivations);
    expect(dist.parcels).toEqual([{ date: "2027-01-10", amount: 200000, exact: 200000, term: null }, { date: "2027-01-20", amount: 200000, exact: 200000, term: null }]);
    const total = computeFlow(d, { start: "2026-10-01", end: "2027-01-31" }).kpis.saidas;
    expect(total).toBe(1000000); // 6000 efetivado + 4000 previsto, nada contado duas vezes
    expect(outflows(d)).toEqual([["2026-11-15", 0, 300000, 0], ["2026-12-15", 0, 300000, 0], ["2027-01-10", 200000, 0, 0], ["2027-01-20", 200000, 0, 0]]);
  });
  it("idempotente: mesmo id não efetiva duas vezes", () => {
    const d = scen();
    const inp = { id: "ef1", plannedId: "p", kind: "concluida" as const, at: "x", installments: [{ value: 600000, date: "2026-11-15", document: "" }] };
    effectivate(d, inp); effectivate(d, inp);
    expect(d.committed).toHaveLength(1);
    expect(d.effectivations).toHaveLength(1);
  });
  it("concluída encerra restante previsto", () => {
    const d = scen();
    effectivate(d, { id: "ef1", plannedId: "p", kind: "concluida", at: "x", installments: [{ value: 600000, date: "2026-11-15", document: "" }] });
    expect(d.planned[0]!.status).toBe("encerrado");
    expect(computeFlow(d, { start: "2026-10-01", end: "2027-01-31" }).kpis.saidas).toBe(600000);
    expect(() => effectivate(d, { id: "ef2", plannedId: "p", kind: "parcial", at: "y", installments: [{ value: 1, date: "2026-11-15", document: "" }] })).toThrow();
  });
  it("parcial sem restante explícito abate valor efetivado das parcelas padrão; múltiplas efetivações", () => {
    const d = scen();
    effectivate(d, { id: "a", plannedId: "p", kind: "parcial", at: "1", installments: [{ value: 300000, date: "2026-11-01", document: "" }] });
    effectivate(d, { id: "b", plannedId: "p", kind: "parcial", at: "2", installments: [{ value: 300000, date: "2026-11-02", document: "" }] });
    const dist = distributePlanned(d.planned[0]!, sup(d), d.committed, "legado", d.effectivations);
    expect(dist.parcels.reduce((a, p) => a + p.amount, 0)).toBe(400000);
    expect(computeFlow(d, { start: "2026-10-01", end: "2027-01-31" }).kpis.saidas).toBe(1000000);
  });
  it("misto: título legado DISTINTO (M=3000) + nova efetivação 2000 → restante 5000; total 10000", () => {
    const d = scen();
    d.committed.push({ ...normalizeData({ committed: [{}] }).committed[0]!, id: "leg", supplierId: "s", purchaseCode: "PC1", document: "NF-LEG", value: 300000, dueDate: "2026-11-01", legacyAbatement: 300000, origin: "legado", status: "ativo" });
    effectivate(d, { id: "a", plannedId: "p", kind: "parcial", at: "1", installments: [{ value: 200000, date: "2026-11-05", document: "" }] });
    expect(plannedRemaining(d, "p").value).toBe(500000);
    const days = computeFlow(d, { start: "2026-10-01", end: "2027-01-31" }).days;
    expect(days.reduce((a, x) => a + x.comprometida, 0)).toBe(500000);
    expect(days.reduce((a, x) => a + x.planejada, 0)).toBe(500000);
    expect(days.reduce((a, x) => a + x.saidas, 0)).toBe(1000000);
    const sm = plannedSummary(d, "p");
    expect([sm.original, sm.effectivated, sm.legacyAbated, sm.remaining]).toEqual([1000000, 200000, 300000, 500000]);
  });
  it("mesmo título: vincular legado existente reclassifica sem duplicar nem abater duas vezes", () => {
    const d = scen();
    d.committed.push({ ...normalizeData({ committed: [{}] }).committed[0]!, id: "leg", supplierId: "s", purchaseCode: "PC1", document: "NF-LEG", value: 300000, dueDate: "2026-11-01", legacyAbatement: 300000, origin: "legado", status: "ativo" });
    linkLegacyTitle(d, { id: "lk", plannedId: "p", committedId: "leg", at: "1" });
    linkLegacyTitle(d, { id: "lk", plannedId: "p", committedId: "leg", at: "1" }); // idempotente
    expect(d.committed).toHaveLength(1);
    expect(d.effectivations).toHaveLength(1);
    expect(plannedRemaining(d, "p").value).toBe(700000);
    expect(computeFlow(d, { start: "2026-10-01", end: "2027-01-31" }).kpis.saidas).toBe(1000000);
    expect(() => linkLegacyTitle(d, { id: "lk2", plannedId: "p", committedId: "leg", at: "2" })).toThrow();
    reverseEffectivation(d, "lk", "vínculo errado", "t");
    expect(d.committed[0]!.status).toBe("ativo");
    expect(d.committed[0]!.origin).toBe("legado");
    expect(plannedRemaining(d, "p").value).toBe(700000); // volta a abater via M
  });
  it("M ausente bloqueia efetivação (conciliação pendente, sem total saudável)", () => {
    const d = scen();
    d.committed.push({ ...normalizeData({ committed: [{}] }).committed[0]!, id: "leg", supplierId: "s", purchaseCode: "PC1", document: "NF", value: 300000, dueDate: "2026-11-01", legacyAbatement: null, origin: "legado", status: "ativo" });
    expect(plannedRemaining(d, "p").health).toBe("abatimento_ausente");
    expect(() => effectivate(d, { id: "a", plannedId: "p", kind: "parcial", at: "1", installments: [{ value: 1, date: "2026-11-01", document: "" }] })).toThrow(/Conciliação pendente/);
  });
  it("efetivações independentes 3000 e 2000 mantêm 5000 previsto; reversão de uma não exige reverter a outra; encerramento separado", () => {
    const d = scen();
    effectivate(d, { id: "a", plannedId: "p", kind: "parcial", at: "1", installments: [{ value: 300000, date: "2026-11-01", document: "" }] });
    effectivate(d, { id: "b", plannedId: "p", kind: "parcial", at: "2", installments: [{ value: 150000, date: "2026-11-10", document: "" }, { value: 50000, date: "2026-12-10", document: "" }] });
    expect(plannedRemaining(d, "p").value).toBe(500000);
    expect(d.planned[0]!.status).toBe("ativo");
    reverseEffectivation(d, "a", "pedido cancelado", "t");
    expect(plannedRemaining(d, "p").value).toBe(800000);
    expect(d.committed.filter((c) => c.status === "ativo").map((c) => c.value)).toEqual([150000, 50000]);
    setPlannedRemaining(d, "p", 450000, ["2027-02-01"]);
    expect(computeFlow(d, { start: "2026-10-01", end: "2027-02-28" }).kpis.saidas).toBe(650000);
    expect(() => closePlanned(d, "p", "")).toThrow();
    closePlanned(d, "p", "pedido final recebido");
    expect(computeFlow(d, { start: "2026-10-01", end: "2027-02-28" }).kpis.saidas).toBe(200000);
  });
  it("reversão auditada restaura previsão e cancela parcelas; bloqueada se houver pagamento ativo", () => {
    const d = scen();
    effectivate(d, { id: "a", plannedId: "p", kind: "concluida", at: "1", installments: [{ value: 600000, date: "2026-11-01", document: "" }] });
    registerPayment(d, { id: "pg", titleKind: "committed", titleId: "a-1", date: "2026-10-20", amount: 100000, note: "" });
    expect(() => reverseEffectivation(d, "a", "erro", "t")).toThrow();
    reversePayment(d, "pg", "estorno", "t");
    reverseEffectivation(d, "a", "pedido cancelado", "t2");
    expect(d.planned[0]!.status).toBe("ativo");
    expect(d.committed[0]!.status).toBe("cancelado");
    expect(d.effectivations[0]!.reversedAt).toBe("t2");
    expect(computeFlow(d, { start: "2026-10-01", end: "2027-01-31" }).kpis.saidas).toBe(1000000);
  });
});

describe("Pagamentos", () => {
  const withTitle = () => { const d = scen(); effectivate(d, { id: "a", plannedId: "p", kind: "concluida", at: "1", installments: [{ value: 600000, date: "2026-11-15", document: "NF1" }] }); return d; };
  it("parcial: saída na data paga + só o restante no vencimento; histórico preservado", () => {
    const d = withTitle();
    registerPayment(d, { id: "pg", titleKind: "committed", titleId: "a-1", date: "2026-10-20", amount: 200000, note: "" });
    expect(outflows(d)).toEqual([["2026-10-20", 0, 200000, 0], ["2026-11-15", 0, 400000, 0]]);
    expect(titleStatus(600000, "ativo", paymentsFor(d, "committed", "a-1")).state).toBe("Parcial");
    registerPayment(d, { id: "pg2", titleKind: "committed", titleId: "a-1", date: "2026-11-10", amount: 400000, note: "" });
    expect(titleStatus(600000, "ativo", paymentsFor(d, "committed", "a-1")).state).toBe("Pago");
    expect(outflows(d)).toEqual([["2026-10-20", 0, 200000, 0], ["2026-11-10", 0, 400000, 0]]);
    expect(() => registerPayment(d, { id: "pg3", titleKind: "committed", titleId: "a-1", date: "2026-11-10", amount: 1, note: "" })).toThrow();
  });
  it("estorno volta o valor ao vencimento e fica no histórico", () => {
    const d = withTitle();
    registerPayment(d, { id: "pg", titleKind: "committed", titleId: "a-1", date: "2026-10-20", amount: 200000, note: "" });
    reversePayment(d, "pg", "duplicado", "t");
    expect(d.payments).toHaveLength(1);
    expect(outflows(d)).toEqual([["2026-11-15", 0, 600000, 0]]);
  });
  it("pagamento antes do início reduz aberto mas não sai de novo; avisa escopo", () => {
    const d = withTitle();
    registerPayment(d, { id: "pg", titleKind: "committed", titleId: "a-1", date: "2026-09-20", amount: 100000, note: "" });
    const r = computeFlow(d, { start: "2026-10-01", end: "2027-01-31" });
    expect(r.kpis.saidas).toBe(500000);
    expect(r.warnings.some((w) => w.code === "PAG_ANTES_INICIO")).toBe(true);
  });
  it("prorrogação não apaga pagamento; histórico registra original", () => {
    const d = withTitle();
    registerPayment(d, { id: "pg", titleKind: "committed", titleId: "a-1", date: "2026-10-20", amount: 200000, note: "" });
    confirmExtension(d, "committed", "a-1", "2026-12-01", "negociado", "t");
    expect(d.payments).toHaveLength(1);
    expect(d.committed[0]!.dueDate).toBe("2026-11-15");
    expect(d.committed[0]!.extensionHistory).toEqual([{ from: null, to: "2026-12-01", at: "t", note: "negociado" }]);
    expect(outflows(d)).toEqual([["2026-10-20", 0, 200000, 0], ["2026-12-01", 0, 400000, 0]]);
  });
  it("dashboard: aberto exclui quitados/cancelados/previsão; vencido não é inferido como pago; sem vencimento incluído", () => {
    const d = withTitle();
    d.expenses.push({ ...normalizeData({ expenses: [{}] }).expenses[0]!, id: "x", supplierId: "s", document: "D", value: 50000, baseDate: "2026-10-01", termDays: 0, status: "ativo" });
    d.expenses.push({ ...d.expenses[0]!, id: "y", value: 70000 });
    d.expenses.push({ ...d.expenses[0]!, id: "z", value: 9000, termDays: null });
    registerPayment(d, { id: "q", titleKind: "expense", titleId: "y", date: "2026-10-01", amount: 70000, note: "" });
    d.planned.push({ ...d.planned[0]!, id: "p2", status: "ativo", purchaseCode: "PC2" });
    const flow = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" });
    const k = computeDashboard(d, flow, "2026-10-28", { start: "2026-10-01", end: "2026-12-31" });
    const c = (key: string) => k.cards.find((x) => x.key === key)!;
    expect(c("total").value).toBe(659000);
    expect(c("nodue").value).toBe(9000);
    expect(c("overdue").value).toBe(50000);
    expect(c("committed").value).toBe(600000);
    expect(c("planned").value).toBe(1000000);
    expect(c("top").value).toBe(659000);
    expect(c("d30").value).toBe(600000);
    expect(c("d30").titles!.map((t) => t.id)).toEqual(["a-1"]);
    for (const x of k.cards.filter((x) => x.kind === "titles")) expect(x.titles!.reduce((a, t) => a + t.open, 0)).toBe(x.value); // drilldown reconcilia
    expect(c("planned").parcels!.reduce((a, p) => a + p.amount, 0)).toBe(c("planned").value);
  });
  it("dashboard respeita período e filtros fornecedor/grupo", () => {
    const d = withTitle();
    d.suppliers.push({ id: "s2", name: "Outro", group: "H", terms: [10, null, null, null, null, null, null, null, null, null] });
    d.expenses.push({ ...normalizeData({ expenses: [{}] }).expenses[0]!, id: "x", supplierId: "s2", document: "D", value: 50000, baseDate: "2027-03-01", termDays: 0, status: "ativo" });
    const flow = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" });
    const all = computeDashboard(d, flow, "2026-10-28", { start: "2026-10-01", end: "2026-12-31" });
    expect(all.cards.find((x) => x.key === "period")!.value).toBe(600000); // despesa de 03/2027 fora do período
    expect(all.cards.find((x) => x.key === "total")!.value).toBe(650000); // estoque independe do período
    const g = computeDashboard(d, flow, "2026-10-28", { start: "2026-10-01", end: "2026-12-31", group: "H" });
    expect(g.cards.find((x) => x.key === "total")!.value).toBe(50000);
    expect(g.ranking.map((r) => r.supplier)).toEqual(["Outro"]);
    const s1 = computeDashboard(d, flow, "2026-10-28", { start: "2026-10-01", end: "2026-12-31", supplierId: "s" });
    expect(s1.cards.find((x) => x.key === "total")!.value).toBe(600000);
  });
});

describe("Rascunho (modo real): confirmar/cancelar", () => {
  it("editar rascunho não altera a base; cancelar = descartar sem mudança; diff mostra antes/depois", () => {
    const b = scen();
    const snapshot = JSON.stringify(b);
    const draft = editDraft(b, null, (x) => { x.planned[0]!.value = 1; x.targets["2026-10"] = 100; });
    expect(JSON.stringify(b)).toBe(snapshot);
    const ch = diffData(b, draft);
    expect(ch.map((c) => [c.entity, c.kind])).toEqual([["Previsão (planejada)", "alteração"], ["Meta de faturamento", "inclusão"]]);
    expect(ch[0]!.fields).toEqual(["value"]);
    expect(diffData(b, editDraft(b, null, (x) => { x.planned = []; }))[0]!.kind).toBe("exclusão");
    expect(diffData(b, JSON.parse(snapshot))).toEqual([]);
  });
  it("ação inválida não altera rascunho", () => {
    const b = scen();
    expect(() => editDraft(b, null, (x) => { registerPayment(x, { id: "z", titleKind: "committed", titleId: "nao", date: "2026-10-01", amount: 1, note: "" }); })).toThrow();
    expect(b.payments).toEqual([]);
  });
});
