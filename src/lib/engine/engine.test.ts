import { describe, expect, it } from "vitest";
import { demoData } from "../demo";
import { buildRows, computeFlow, dailyEstimate, distributePlanned, expenseDate, committedDate, receiptInformed, splitCents, toVertical } from "./engine";
import { normalizeData } from "./actions";
import type { Committed, Expense, ScenarioData } from "./types";
import { macroCurrency } from "../money";

const base = (): ScenarioData => {
  const d = demoData();
  d.planned = []; d.committed = []; d.expenses = []; d.receipts = []; d.adjustments = []; d.payments = []; d.effectivations = [];
  return d;
};
export const mkC = (p: Partial<Committed> = {}): Committed => ({ id: "c", supplierId: "s", purchaseCode: "C1", document: "", value: 999999, dueDate: "2026-10-10", extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null, origin: "legado", plannedId: null, effectivationId: null, categoryId: "", notes: "", status: "ativo", ...p });
export const mkE = (p: Partial<Expense> = {}): Expense => ({ id: "e", supplierId: "s4", document: "", value: 1, baseDate: "2026-10-01", termDays: 5, extensionDate: null, extensionHistory: [], categoryId: "", notes: "", status: "ativo", ...p });

describe("Regra A — estimativa", () => {
  it("Web: dois redutores, outubro 273000 / 25% / 18% => 167895 e 5415,967741935/dia", () => {
    const d = base(); d.params.profile = "web"; d.params.lagDays = 0;
    const e = dailyEstimate(d.params, d.targets, "2026-10-15");
    expect(e.liquid).toBeCloseTo(16789500, 6);
    expect(e.exact / 100).toBeCloseTo(5415.967741935, 8);
    expect(e.value).toBe(541597);
  });
  it("Legado: um redutor e divisor 30, sem segundo redutor", () => {
    const d = base(); d.params.lagDays = 0;
    expect(dailyEstimate(d.params, d.targets, "2026-10-15").exact).toBeCloseTo((27300000 * 0.75) / 30, 6);
  });
  it("divisor 30 vs dias reais e fevereiro bissexto", () => {
    const d = base(); d.params.lagDays = 0; d.targets["2028-02"] = 2900000;
    d.params.divisorLegado = "dias";
    expect(dailyEstimate(d.params, d.targets, "2028-02-10").divisor).toBe(29);
    d.params.divisorLegado = "30";
    expect(dailyEstimate(d.params, d.targets, "2028-02-10").divisor).toBe(30);
    d.targets["2027-02"] = 2800000; d.params.divisorLegado = "dias";
    expect(dailyEstimate(d.params, d.targets, "2027-02-10").divisor).toBe(28);
  });
  it("meta ausente gera pendência, não valor saudável", () => {
    const d = base(); d.targets = {};
    const r = computeFlow(d, { start: "2026-10-01", end: "2026-10-02" });
    expect(r.days[0]!.recUsado).toBe(0);
    expect(r.warnings.some((w) => w.code === "META_AUSENTE" && w.severity === "erro")).toBe(true);
  });
});

describe("Regra B — defasagem", () => {
  it("defasagem 10: 10/11 usa meta de outubro, 11/11 usa novembro", () => {
    const d = base();
    expect(dailyEstimate(d.params, d.targets, "2026-11-10").month).toBe("2026-10");
    expect(dailyEstimate(d.params, d.targets, "2026-11-11").month).toBe("2026-11");
  });
});

describe("Regra C — recebimentos (evolução aprovada)", () => {
  it("informado substitui estimativa; ZERO confirmado não usa estimativa; ausente usa", () => {
    const d = base();
    d.receipts = [
      { id: "a", date: "2026-10-02", platforms: {}, general: 100000, notes: "" },
      { id: "b", date: "2026-10-03", platforms: {}, general: 0, notes: "" },
      { id: "c", date: "2026-10-04", platforms: { A: null }, general: null, notes: "" },
    ];
    const r = computeFlow(d, { start: "2026-10-01", end: "2026-10-04" });
    expect(r.days[1]!.recUsado).toBe(100000);
    expect(r.days[2]!.usouInformado).toBe(true);
    expect(r.days[2]!.recUsado).toBe(0);
    expect(r.days[3]!.usouInformado).toBe(false);
    expect(r.days[3]!.recUsado).toBe(r.days[3]!.recEstimado);
    expect(r.days[3]!.recEstimado).toBeGreaterThan(0);
  });
  it("geral + plataformas: soma ambos e alerta dupla contagem", () => {
    const rec = { id: "x", date: "2026-10-02", platforms: { A: 100, B: 50 }, general: 300, notes: "" };
    expect(receiptInformed(rec).sum).toBe(450);
    expect(receiptInformed(rec).doubleCount).toBe(true);
    const d = base(); d.receipts = [rec];
    expect(computeFlow(d, { start: "2026-10-01", end: "2026-10-02" }).warnings.some((w) => w.code === "REC_DUPLA")).toBe(true);
  });
});

describe("Regra D — planejadas", () => {
  const sup = { id: "s", name: "S", group: "G", terms: [30, 60, null, 0, null, null, null, null, null, null] as (number | null)[] };
  const pl = { id: "p", supplierId: "s", purchaseCode: "C1", document: "", value: 900000, baseDate: "2026-10-01", categoryId: "", notes: "", status: "ativo" as const, remainingOverride: null };
  it("vazio vs zero: web conta 0 (3 parcelas), legado só >0 (2 parcelas)", () => {
    expect(distributePlanned(pl, sup, [], "web").count).toBe(3);
    expect(distributePlanned(pl, sup, [], "legado").count).toBe(2);
    expect(distributePlanned(pl, sup, [], "web").parcels.map((p) => p.date)).toContain("2026-10-01");
  });
  it("datas corridas no parcelamento", () => {
    expect(distributePlanned(pl, sup, [], "legado").parcels.map((p) => p.date)).toEqual(["2026-10-31", "2026-11-30"]);
  });
  it("abatimento legado pelo vínculo do código", () => {
    const r = distributePlanned(pl, sup, [mkC({ legacyAbatement: 200000 })], "legado");
    expect(r.P).toBe(450000); expect(r.Q).toBe(100000); expect(r.R).toBe(350000);
    expect(r.health).toBe("ok");
  });
  it("M ausente não produz valor saudável", () => {
    const r = distributePlanned(pl, sup, [mkC({ origin: "manual" })], "legado");
    expect(r.health).not.toBe("ok");
    expect(r.warnings.some((w) => w.code === "PLAN_M_AUSENTE")).toBe(true);
  });
  it("saldo negativo mantido; parcelas na mesma data são SOMADAS", () => {
    expect(distributePlanned(pl, sup, [mkC({ value: 0, legacyAbatement: 2000000 })], "legado").R).toBeLessThan(0);
    const s2 = { ...sup, terms: [30, 30, null, null, null, null, null, null, null, null] };
    const d = base(); d.suppliers = [s2]; d.targets = {}; d.planned = [pl];
    const r = computeFlow(d, { start: "2026-10-01", end: "2026-11-05" });
    expect(r.days.find((x) => x.date === "2026-10-31")!.planejada).toBe(900000);
    expect(r.warnings.some((w) => w.code === "PLAN_COLISAO")).toBe(true);
  });
  it("arredondamento 100/3: resíduo na última parcela, total fecha e ajuste reportado", () => {
    const s3 = { ...sup, terms: [10, 20, 30, null, null, null, null, null, null, null] };
    const r = distributePlanned({ ...pl, value: 10000 }, s3, [], "web");
    expect(r.parcels.map((p) => p.amount)).toEqual([3333, 3333, 3334]);
    expect(r.parcels.reduce((a, p) => a + p.amount, 0)).toBe(10000);
    expect(r.roundingDiff).toBe(1);
    expect(r.warnings.some((w) => w.code === "ARRED")).toBe(true);
    expect(macroCurrency(r.R)).toBe(33.3333);
    expect(splitCents(-10000, 3).parts).toEqual([-3333, -3333, -3334]);
  });
});

describe("Prorrogação confirmada (item 7)", () => {
  it("vencimento vigente = prorrogação confirmada; original preservado; vazio G não distribui", () => {
    const c = mkC({ dueDate: "2026-10-10", extensionDate: "2026-10-20", extensionInfo: "K informativo" });
    expect(committedDate(c)).toBe("2026-10-20");
    expect(c.dueDate).toBe("2026-10-10");
    expect(committedDate({ ...c, extensionDate: null })).toBe("2026-10-10");
    expect(expenseDate(mkE())).toBe("2026-10-06");
    expect(expenseDate(mkE({ termDays: 0 }))).toBe("2026-10-01");
    expect(expenseDate(mkE({ termDays: null }))).toBeNull();
    expect(expenseDate(mkE({ extensionDate: "2026-10-25" }))).toBe("2026-10-25");
  });
});

describe("Regra G — saldo", () => {
  it("ajuste manual = 0 substitui saldo e interrompe impactos anteriores", () => {
    const d = base(); d.targets = {};
    d.expenses = [mkE({ value: 500000, baseDate: "2026-10-02", termDays: 0 })];
    d.adjustments = [{ date: "2026-10-04", value: 0, note: "" }];
    const r = computeFlow(d, { start: "2026-10-01", end: "2026-10-05" });
    expect(r.days[2]!.saldoFinal).toBe(d.params.saldoInicial - 500000);
    expect(r.days[3]!.saldoInicial).toBe(0);
    expect(r.days[3]!.ajuste?.diff).toBe(-(d.params.saldoInicial - 500000));
    expect(r.days[4]!.saldoFinal).toBe(0);
  });
});

describe("Cenários, visões e compatibilidade", () => {
  it("simulação é cópia isolada da base", () => {
    const b = demoData();
    const sc: ScenarioData = JSON.parse(JSON.stringify(b));
    sc.suppliers[0]!.terms[0] = 10; sc.targets["2026-10"] = 1;
    expect(b.suppliers[0]!.terms[0]).toBe(30);
    expect(computeFlow(b, { start: "2026-10-01", end: "2026-11-30" }).kpis.saldoFinal).not.toBe(computeFlow(sc, { start: "2026-10-01", end: "2026-11-30" }).kpis.saldoFinal);
  });
  it("totais iguais nas visões vertical e horizontal", () => {
    const d = demoData();
    const res = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" });
    const rows = buildRows(res, d.categories);
    const vert = toVertical(rows, res.days);
    for (const r of rows.filter((r) => r.totalMode === "sum")) expect(vert.reduce((a, v) => a + (v.cells[r.key] ?? 0), 0)).toBe(r.total);
    const sf = rows.find((r) => r.key === "saldo_fim")!;
    expect(vert.at(-1)!.cells["saldo_fim"]).toBe(sf.total);
    expect(sf.total).toBe(res.kpis.saldoFinal);
    for (const day of res.days) expect(day.saldoFinal).toBe(day.saldoInicial + day.recUsado - day.saidas);
  });
  it("normalização de dados antigos: M preenchido → origem legado; sem M → manual; base vazia sem valores inventados", () => {
    const n = normalizeData({ committed: [{ id: "a", legacyAbatement: 5 }, { id: "b", legacyAbatement: null }] });
    expect(n.committed.map((c) => c.origin)).toEqual(["legado", "manual"]);
    const e = normalizeData({});
    expect(e.targets).toEqual({}); expect(e.planned).toEqual([]); expect(e.params.saldoInicial).toBe(0);
  });
});
