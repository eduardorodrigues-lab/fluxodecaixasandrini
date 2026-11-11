import { describe, it, expect } from "vitest";
import { normalizeData, setMonthTarget } from "./engine/actions";
import { buildRows, computeFlow, dailyEstimate, toVertical } from "./engine/engine";
import { financialConfig, previewFinancialMonth, saveFinancialDefaults, saveFinancialMonth, saveBalanceAdjustment } from "./financeConfig";
import { diffData } from "./diff";
const base = () => normalizeData({ params: { profile: "legado", legacyReducer: 0.25, divisorLegado: "30", lagDays: 10 }, targets: { "2026-10": 27300000, "2026-11": 27300000 } });
describe("Configuração financeira unificada", () => {
  it("preserva um deflator, divisor 30 e defasagem 10 até confirmar; prévia não grava", () => {
    const d = base(), snapshot = JSON.stringify(d); const f = financialConfig(d.params, d.targetConfigs["2026-10"]);
    expect(f).toEqual({ deflator1: 0.25, deflator2: 0, base1: "bruto", base2: "apos_r1", divisor: "30", lagDays: 10 });
    expect(dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs).value).toBe(682500);
    previewFinancialMonth(d, "2026-10", 27300000, { ...f, deflator2: 0.18, divisor: "dias" }, "2026-10-01", "2026-11-30");
    expect(JSON.stringify(d)).toBe(snapshot);
  });
  it("confirmar dois deflatores sequenciais dá líquido 167895 e diária 5415,97; outro mês permanece igual", () => {
    const d = base(), other = structuredClone(d.targetConfigs["2026-11"]);
    saveFinancialMonth(d, "2026-10", 27300000, { ...financialConfig(d.params), deflator2: 0.18, divisor: "dias" }, "2026-11-11");
    const e = dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs);
    expect(e.liquid).toBe(16789500); expect(e.value).toBe(541597); expect(d.targetConfigs["2026-11"]).toEqual(other);
    expect(d.targetConfigs["2026-10"]?.history.at(-1)?.before?.legacyReducer).toBe(0.25);
  });
  it("padrões só preenchem novos meses e nunca ativam segundo deflator em meses existentes", () => {
    const d = base(), old = structuredClone(d.targetConfigs);
    saveFinancialDefaults(d, { ...financialConfig(d.params), deflator2: 0.18, divisor: "dias" });
    expect(d.targetConfigs).toEqual(old);
    setMonthTarget(d, "2026-12", { gross: 27300000 }, "novo", "t");
    expect(d.targetConfigs["2026-12"]?.financial?.deflator2).toBe(0.18);
    expect(d.targetConfigs["2026-10"]?.financial).toBeUndefined();
  });
  it("base do segundo deflator é explícita, sem somar percentuais", () => {
    const d = base(); saveFinancialMonth(d, "2026-10", 27300000, { ...financialConfig(d.params), deflator2: 0.18, base2: "bruto" }, "t");
    expect(dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs).liquid).toBe(15561000);
  });
  it("visões compartilham valores e configuração entra na auditoria mesmo sem mudar bruto", () => {
    const d = base(), next = structuredClone(d); saveFinancialMonth(next, "2026-10", 27300000, { ...financialConfig(d.params), deflator2: 0.18 }, "t");
    const flow = computeFlow(next, { start: "2026-10-01", end: "2026-11-30" }); const rows = buildRows(flow, next.categories); const vertical = toVertical(rows, flow.days);
    for (const row of rows) expect(vertical.map((day) => day.cells[row.key])).toEqual(row.values);
    expect(diffData(d, next).some((c) => c.entity === "Configuração financeira mensal")).toBe(true);
  });
  it("ajuste exige justificativa, aceita zero, preserva outros ajustes e cenário isolado", () => {
    const d = base(); d.adjustments = [{ date: "2026-10-02", value: 100, note: "existente" }]; const sim = structuredClone(d);
    expect(() => saveBalanceAdjustment(sim, null, "2026-10-03", 0, "")).toThrow(/justificativa/);
    saveBalanceAdjustment(sim, null, "2026-10-03", 0, "Conferência"); expect(d.adjustments).toHaveLength(1); expect(sim.adjustments).toHaveLength(2);
    expect(computeFlow(sim, { start: "2026-10-03", end: "2026-10-03" }).days[0]?.saldoInicial).toBe(0);
  });
});
