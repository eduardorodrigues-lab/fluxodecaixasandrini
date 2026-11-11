import { describe, it, expect } from "vitest";
import { normalizeData } from "./engine/actions";
import { applyMonthEdits, monthEdit, monthImpactDates, monthCalculation, parseMonth, maskMonth, previewMonthEdits } from "./monthReport";
import { diffData } from "./diff";
import { dailyEstimate } from "./engine/engine";
const fixture = () => normalizeData({ params: { profile: "legado", legacyReducer: 0, lagDays: 10, startDate: "2026-01-01" }, targets: { "2026-01": 9300000, "2026-02": 5600000 } });
describe("Relatório mensal editável aprovado", () => {
  it("máscara mm/aaaa valida mês e quatro dígitos de ano", () => {
    expect(maskMonth("012026")).toBe("01/2026"); expect(parseMonth("01/2026")).toBe("2026-01");
    expect(parseMonth("13/2026")).toBeNull(); expect(parseMonth("00/2026")).toBeNull(); expect(parseMonth("01/26")).toBeNull();
  });
  it("primeiro deflator sobre bruto, segundo sobre resultado; prévia não grava", () => {
    const d = fixture(), edit = monthEdit(d, "2026-01"); edit.gross = 27300000; edit.financial.deflator1 = .25; edit.financial.deflator2 = .18;
    const next = previewMonthEdits(d, { "2026-01": edit }); const e = monthCalculation(next, "2026-01");
    expect(e.r1).toBe(6825000); expect(e.r2).toBe(3685500); expect(e.liquid).toBe(16789500); expect(d.targets["2026-01"]).toBe(9300000);
  });
  it("dois meses confirmam juntos, persistem e auditam nomes/divisor sem mexer em outro mês", () => {
    const d = fixture(), a = monthEdit(d, "2026-01"), b = monthEdit(d, "2026-02"); a.financial.divisor = "dias"; a.financial.deflator1Name = "Devoluções"; b.financial.deflator2 = .1;
    applyMonthEdits(d, { "2026-01": a, "2026-02": b }, "2026-11-11T16:05:00Z");
    const reload = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(monthCalculation(reload, "2026-01").exact).toBe(300000); expect(reload.targetConfigs["2026-01"]?.financial?.deflator1Name).toBe("Devoluções");
    expect(monthEdit(reload, "2026-02").financial.deflator2).toBe(.1); expect(diffData(fixture(), d).filter((c) => c.entity === "Configuração financeira mensal")).toHaveLength(2);
  });
  it("renomear sozinho preserva cálculo histórico e segundo legado zero", () => {
    const d = fixture(); const jan = d.targetConfigs["2026-01"]; if (!jan) throw new Error("Fixture sem janeiro"); jan.legacyReducer = .25;
    const before = dailyEstimate(d.params, d.targets, "2026-01-20", d.targetConfigs);
    const edit = monthEdit(d, "2026-01"); edit.financial.deflator1Name = "Descontos";
    applyMonthEdits(d, { "2026-01": edit }, "t");
    expect(d.targetConfigs["2026-01"]?.financial).toBeUndefined(); expect(monthEdit(d, "2026-01").financial.deflator2).toBe(0);
    expect(dailyEstimate(d.params, d.targets, "2026-01-20", d.targetConfigs).exact).toBe(before.exact);
  });
  it("validação atômica não deixa primeiro mês alterado se segundo inválido", () => {
    const d = fixture(), a = monthEdit(d, "2026-01"), b = monthEdit(d, "2026-02"); a.gross = 10000; b.financial.deflator2 = -1;
    expect(() => applyMonthEdits(d, { "2026-01": a, "2026-02": b }, "t")).toThrow(); expect(d.targets["2026-01"]).toBe(9300000);
  });
  it("datas reais resolvem mês de destino, lacunas e zero informado", () => {
    const d = fixture(); const feb = d.targetConfigs["2026-02"]; if (!feb) throw new Error("Fixture sem fevereiro"); feb.lagDays = 0;
    d.receipts = [{ id: "zero", date: "2026-01-15", general: 0, platforms: {}, notes: "" }];
    const result = monthImpactDates(d, "2026-01");
    expect(result.dates[0]).toBe("2026-01-11"); expect(result.dates.at(-1)).toBe("2026-01-31"); expect(result.dates).not.toContain("2026-02-01");
    expect(result.suppressed).toEqual(["2026-01-15"]); expect(result.estimated).not.toContain("2026-01-15");
    feb.lagDays = 20;
    expect(monthImpactDates(d, "2026-01").dates).toContain("2026-02-20");
  });
});