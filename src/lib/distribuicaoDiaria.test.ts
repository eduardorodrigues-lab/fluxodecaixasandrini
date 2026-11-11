import { describe, expect, it } from "vitest";
import { normalizeData } from "./engine/actions";
import { buildRows, computeFlow, dailyEstimate, toVertical } from "./engine/engine";
import { previewFinancialMonth, saveFinancialMonth } from "./financeConfig";
import { diffData } from "./diff";
import type { FinancialConfig } from "./engine/types";

const config = (divisor: FinancialConfig["divisor"], lagDays = 0): FinancialConfig => ({ deflator1: 0, deflator2: 0, base1: "bruto", base2: "apos_r1", divisor, lagDays });
const fixture = () => normalizeData({ params: { profile: "legado", startDate: "2026-01-01", lagDays: 0, saldoInicial: 0 } });
describe("Distribuição diária mensal revisada", () => {
  it.each([["2026-01", 31], ["2026-02", 28], ["2028-02", 29], ["2026-04", 30]] as const)("%s usa %i dias de origem, ou sempre 30", (month, days) => {
    const d = fixture();
    const thirty = previewFinancialMonth(d, month, 9300000, config("30"), `${month}-01`, `${month}-02`);
    const actual = previewFinancialMonth(d, month, 9300000, config("dias"), `${month}-01`, `${month}-02`);
    expect(thirty.estimate.divisor).toBe(30);
    expect(thirty.estimate.exact).toBe(310000);
    expect(actual.estimate.divisor).toBe(days);
    expect(actual.estimate.exact).toBe(9300000 / days);
    expect(d.targets[month]).toBeUndefined();
    if (days === 31) expect(actual.estimate.exact).toBe(300000);
    if (days === 30) expect(actual.estimate.exact).toBe(thirty.estimate.exact);
  });
  it("deflatores sequenciais preservam a precisão antes da divisão", () => {
    const d = fixture(); saveFinancialMonth(d, "2026-01", 20000001, { ...config("dias"), deflator1: 0.25, deflator2: 0.38 }, "t");
    const e = dailyEstimate(d.params, d.targets, "2026-01-15", d.targetConfigs);
    expect(e.r1).toBe(5000000.25);
    expect(e.r2).toBe(5700000.285);
    expect(e.liquid).toBeCloseTo(9300000.465, 7);
    expect(e.exact).toBeCloseTo(300000.015, 7);
  });
  it("virada com defasagem 10 divide janeiro por 31, não fevereiro por 28", () => {
    const d = fixture();
    saveFinancialMonth(d, "2026-01", 9300000, config("dias", 10), "t");
    saveFinancialMonth(d, "2026-02", 5600000, config("dias", 10), "t");
    const jan = dailyEstimate(d.params, d.targets, "2026-02-10", d.targetConfigs);
    const feb = dailyEstimate(d.params, d.targets, "2026-02-11", d.targetConfigs);
    expect(jan.ref).toBe("2026-01-31"); expect(jan.month).toBe("2026-01"); expect(jan.divisor).toBe(31); expect(jan.exact).toBe(300000);
    expect(feb.month).toBe("2026-02"); expect(feb.divisor).toBe(28); expect(feb.exact).toBe(200000);
  });
  it("/30 projeta também o 31º dia sem forçar o total mensal", () => {
    const d = fixture(); saveFinancialMonth(d, "2026-01", 9300000, config("30"), "t");
    const flow = computeFlow(d, { start: "2026-01-01", end: "2026-01-31" });
    expect(flow.days).toHaveLength(31); expect(flow.days.at(-1)?.recUsado).toBe(310000);
    expect(flow.kpis.entradasSemSaldo).toBe(9610000);
  });
  it("informado e zero confirmado substituem estimativa sem alterar os outros dias", () => {
    const d = fixture(); saveFinancialMonth(d, "2026-01", 9300000, config("dias"), "t");
    d.receipts = [{ id: "r1", date: "2026-01-02", general: 12345, platforms: {}, notes: "" }, { id: "r2", date: "2026-01-03", general: 0, platforms: {}, notes: "" }];
    const flow = computeFlow(d, { start: "2026-01-01", end: "2026-01-04" });
    expect(flow.days.map((x) => x.recUsado)).toEqual([300000, 12345, 0, 300000]);
    expect(flow.days.map((x) => x.usouInformado)).toEqual([false, true, true, false]);
  });
  it("fluxo conserva frações de centavo e valores equivalentes nas duas visões", () => {
    const d = fixture(); saveFinancialMonth(d, "2026-02", 9300000, config("dias"), "t");
    const flow = computeFlow(d, { start: "2026-02-01", end: "2026-02-28" });
    expect(flow.days[0]?.recEstimado).toBe(9300000 / 28);
    expect(flow.days[0]?.recUsado).toBe(9300000 / 28);
    expect(flow.kpis.entradasSemSaldo).toBeCloseTo(9300000, 6);
    const rows = buildRows(flow, d.categories), vertical = toVertical(rows, flow.days);
    for (const row of rows) expect(vertical.map((day) => day.cells[row.key])).toEqual(row.values);
  });
  it("salvar/recarregar mantém divisor por mês, versão e auditoria sem mudar mês vizinho", () => {
    const d = fixture(); saveFinancialMonth(d, "2026-01", 9300000, config("30", 10), "antes");
    saveFinancialMonth(d, "2026-02", 5600000, config("dias", 10), "antes");
    const before = structuredClone(d), other = structuredClone(d.targetConfigs["2026-02"]);
    saveFinancialMonth(d, "2026-01", 9300000, config("dias", 10), "depois");
    const reloaded = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(reloaded.targetConfigs["2026-01"]?.financial?.divisor).toBe("dias");
    expect(reloaded.targetConfigs["2026-01"]?.version).toBe(2);
    expect(reloaded.targetConfigs["2026-01"]?.history.at(-1)?.before?.financial?.divisor).toBe("30");
    expect(reloaded.targetConfigs["2026-02"]).toEqual(other);
    expect(dailyEstimate(reloaded.params, reloaded.targets, "2026-02-10", reloaded.targetConfigs).exact).toBe(300000);
    expect(diffData(before, reloaded).some((x) => x.entity === "Configuração financeira mensal")).toBe(true);
  });
  it("rascunho cancelado e simulação não alteram a base real", () => {
    const real = fixture(); saveFinancialMonth(real, "2026-01", 9300000, config("30"), "t");
    const snapshot = JSON.stringify(real), sim = structuredClone(real);
    previewFinancialMonth(real, "2026-01", 9300000, config("dias"), "2026-01-01", "2026-01-31");
    saveFinancialMonth(sim, "2026-01", 9300000, config("dias"), "sim");
    expect(JSON.stringify(real)).toBe(snapshot);
    expect(computeFlow(real, { start: "2026-01-01", end: "2026-01-01" }).days[0]?.recUsado).toBe(310000);
    expect(computeFlow(sim, { start: "2026-01-01", end: "2026-01-01" }).days[0]?.recUsado).toBe(300000);
  });
});