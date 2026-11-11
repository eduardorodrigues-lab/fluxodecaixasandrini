import { defaultMonthTarget, computeFlow, estimateMonth } from "./engine/engine";
import { setMonthTarget } from "./engine/actions";
import type { FinancialConfig, MonthTarget, Params, ScenarioData } from "./engine/types";
import { dateInputError } from "./dates";

/** Read-only compatibility adapter: never persists or changes the source profile. */
export function financialConfig(p: Params, c?: MonthTarget): FinancialConfig {
  if (c?.financial) return { ...c.financial };
  const { financialDefaults: _defaults, ...sourceParams } = p; void _defaults;
  const t = c ?? defaultMonthTarget(sourceParams, 0);
  return { deflator1: p.profile === "legado" ? t.legacyReducer : t.webR1, deflator2: p.profile === "legado" ? 0 : t.webR2, base1: "bruto", base2: p.profile === "legado" ? "apos_r1" : t.r2Base, divisor: p.profile === "legado" ? t.divisorLegado : t.divisorWeb, lagDays: t.lagDays };
}
export function validateFinancial(f: FinancialConfig, gross = 0) {
  if (!Number.isInteger(gross) || gross < 0) throw new Error("Informe um faturamento válido, igual ou maior que zero.");
  for (const v of [f.deflator1, f.deflator2]) if (!Number.isFinite(v) || v < 0 || v >= 1) throw new Error("Cada deflator deve estar entre 0% e 99,99%.");
  if (f.base1 !== "bruto" || !["bruto", "apos_r1"].includes(f.base2) || !["30", "dias"].includes(f.divisor)) throw new Error("Confira as bases e a distribuição diária.");
  if (!Number.isInteger(f.lagDays) || f.lagDays < 0 || f.lagDays > 120) throw new Error("Defasagem deve ser de 0 a 120 dias.");
  const r1 = gross * f.deflator1;
  if (gross - r1 - (f.base2 === "bruto" ? gross : gross - r1) * f.deflator2 < 0) throw new Error("As reduções não podem superar o faturamento bruto.");
}
export function saveFinancialMonth(d: ScenarioData, month: string, gross: number, financial: FinancialConfig, at: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Informe um mês válido.");
  validateFinancial(financial, gross);
  return setMonthTarget(d, month, { gross, financial: { ...financial }, lagDays: financial.lagDays }, "Configuração financeira revisada e confirmada", at);
}
export function saveFinancialDefaults(d: ScenarioData, f: FinancialConfig) {
  validateFinancial(f);
  d.params.financialDefaults = { ...f };
}
export function previewFinancialMonth(d: ScenarioData, month: string, gross: number, f: FinancialConfig, start: string, end: string) {
  const next = structuredClone(d);
  saveFinancialMonth(next, month, gross, f, "");
  const before = computeFlow(d, { start, end });
  const after = computeFlow(next, { start, end });
  return { before, after, estimate: estimateMonth(next.params, month, next.targetConfigs[month] ?? null), impact: after.kpis.saldoFinal - before.kpis.saldoFinal, first: after.days.find((day, i) => day.saldoFinal !== before.days[i]?.saldoFinal)?.date ?? null };
}
export function saveBalanceAdjustment(d: ScenarioData, oldDate: string | null, date: string, value: number, note: string) {
  if (!date || dateInputError(date)) throw new Error("Informe uma data válida.");
  if (!Number.isInteger(value)) throw new Error("Informe um valor válido.");
  if (!note.trim()) throw new Error("Informe a justificativa do ajuste.");
  if (d.adjustments.some((a) => a.date === date && a.date !== oldDate)) throw new Error("Já existe um ajuste nesta data. Edite o ajuste existente.");
  d.adjustments = d.adjustments.filter((a) => a.date !== oldDate);
  d.adjustments.push({ date, value, note: note.trim() });
}