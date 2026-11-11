import { addDays, dateRange, daysInMonth, fmtDate } from "./dates";
import { dailyEstimate, estimateMonth, monthTarget, receiptInformed } from "./engine/engine";
import { financialConfig, saveFinancialDefaults, saveFinancialMonth, validateFinancial } from "./financeConfig";
import { setMonthTarget } from "./engine/actions";
import type { FinancialConfig, ScenarioData } from "./engine/types";

export interface MonthEdit { gross: number; financial: FinancialConfig }
export function maskMonth(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 6);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}
export function parseMonth(text: string): string | null {
  const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(text);
  return match && Number(match[2]) >= 1900 && Number(match[2]) <= 9999 ? `${match[2]}-${match[1]}` : null;
}
export function monthEdit(d: ScenarioData, month: string): MonthEdit {
  const cfg = monthTarget(d.params, d.targets, d.targetConfigs, month);
  return { gross: cfg?.gross ?? 0, financial: cfg ? { ...financialConfig(d.params, cfg), ...(!cfg.financial?.deflator1Name && cfg.deflator1Name ? { deflator1Name: cfg.deflator1Name } : {}), ...(!cfg.financial?.deflator2Name && cfg.deflator2Name ? { deflator2Name: cfg.deflator2Name } : {}) } : { ...(d.params.financialDefaults ?? financialConfig(d.params)), base2: "apos_r1" } };
}
// Drafts are operation-local. Untouched source months retain their existing bases/precision.
export function applyMonthEdits(d: ScenarioData, edits: Record<string, MonthEdit>, at: string, defaults?: FinancialConfig | null) {
  const validated = Object.entries(edits).map(([month, edit]) => {
    if (!parseMonth(`${month.slice(5)}/${month.slice(0, 4)}`)) throw new Error("Informe um mês/ano válido.");
    const financial = { ...edit.financial, base1: "bruto" as const, base2: "apos_r1" as const };
    validateFinancial(financial, edit.gross);
    for (const name of [financial.deflator1Name, financial.deflator2Name]) if (name !== undefined && (!name.trim() || name.length > 60)) throw new Error("Nome do deflator deve ter de 1 a 60 caracteres.");
    return { month, gross: edit.gross, financial };
  });
  if (defaults) validateFinancial(defaults);
  // All validation precedes any mutation; the store applies this to its isolated clone atomically.
  for (const edit of validated) {
    const before = monthEdit(d, edit.month);
    const onlyNames = d.targets[edit.month] !== undefined && before.gross === edit.gross && ["deflator1", "deflator2", "divisor", "lagDays"].every((key) => before.financial[key as keyof FinancialConfig] === edit.financial[key as keyof FinancialConfig]);
    if (onlyNames) setMonthTarget(d, edit.month, { ...(edit.financial.deflator1Name ? { deflator1Name: edit.financial.deflator1Name } : {}), ...(edit.financial.deflator2Name ? { deflator2Name: edit.financial.deflator2Name } : {}), ...(d.targetConfigs[edit.month]?.financial ? { financial: { ...before.financial, ...(edit.financial.deflator1Name ? { deflator1Name: edit.financial.deflator1Name } : {}), ...(edit.financial.deflator2Name ? { deflator2Name: edit.financial.deflator2Name } : {}) } } : {}) }, "Nomes dos deflatores revisados; cálculo preservado", at);
    else saveFinancialMonth(d, edit.month, edit.gross, edit.financial, at);
  }
  if (defaults) saveFinancialDefaults(d, { ...defaults, base2: "apos_r1" });
}
export function previewMonthEdits(d: ScenarioData, edits: Record<string, MonthEdit>, defaults?: FinancialConfig | null) {
  const next = structuredClone(d); applyMonthEdits(next, edits, "", defaults); return next;
}
export function monthCalculation(d: ScenarioData, month: string) {
  return estimateMonth(d.params, month, monthTarget(d.params, d.targets, d.targetConfigs, month));
}
export function compressDates(dates: string[]) {
  const groups: { start: string; end: string; count: number }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = groups.at(-1);
    if (last && addDays(last.end, 1) === date) { last.end = date; last.count++; }
    else groups.push({ start: date, end: date, count: 1 });
  }
  return groups;
}
export function intervalLabel(dates: string[]) {
  return compressDates(dates).map((g) => g.start === g.end ? fmtDate(g.start) : `${fmtDate(g.start)} a ${fmtDate(g.end)}`).join("; ") || "Nenhuma data";
}
// lagFor resolves lag from the DESTINATION day, so different future month settings can create gaps.
// Scan the complete possible horizon (lag validation is 0..120), never just month + its own lag.
export function monthImpactDates(d: ScenarioData, month: string) {
  const first = `${month}-01`, last = `${month}-${String(daysInMonth(first)).padStart(2, "0")}`;
  const informed = new Set(d.receipts.filter((r) => receiptInformed(r).present).map((r) => r.date));
  const dates = dateRange(first, addDays(last, 120)).filter((date) => date >= d.params.startDate && dailyEstimate(d.params, d.targets, date, d.targetConfigs).month === month);
  return { dates, estimated: dates.filter((date) => !informed.has(date)), suppressed: dates.filter((date) => informed.has(date)) };
}