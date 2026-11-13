import { fmtDate } from "./dates";
import { fmtBRL } from "./money";
import { distributePlanned } from "./engine/engine";
import type { Card, OpenTitle, PlannedParcel } from "./engine/dashboard";
import type { Day, ScenarioData } from "./engine/types";
import { supplierIdentity } from "./supplierIdentity";

export const signedMoney = (value: number) => `${value < 0 ? "−" : value > 0 ? "+" : ""}${fmtBRL(Math.abs(value))}`;
export const moneyTone = (value: number) => value < 0 ? "text-negative" : value > 0 ? "text-financial-positive" : "text-muted-foreground";
export function supplierColor(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `supplier-color-${hash >>> 0}`;
}
export function supplierSlot(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 12;
}
export interface ReportCell { text: string; amount?: number }
export interface SourceRow { id: string; group: string; label: string; supplierId?: string | undefined; cells: ReportCell[]; value: number; stage?: "planned" | "open" }
export interface ChartGroup { key: string; label: string; value: number; second?: number; supplierId?: string }
export interface DashboardReport { heads: string[]; rows: SourceRow[]; groups: ChartGroup[]; type: "line" | "bars" | "paired" | "list"; total: number; totalLabel: string }
const money = (amount: number): ReportCell => ({ text: signedMoney(amount), amount });
const cell = (text: string): ReportCell => ({ text });
function titleRow(d: ScenarioData, title: OpenTitle, group: string): SourceRow {
  const source = title.kind === "committed" ? d.committed.find((c) => c.id === title.id) : d.expenses.find((e) => e.id === title.id);
  const parcel = source && "parcelNo" in source ? `${source.parcelNo ?? 1}/${source.parcelCount ?? 1}` : "1/1";
  return { id: `${title.kind}-${title.id}`, group, supplierId: title.supplierId, label: title.supplier, stage: "open", value: title.open,
    cells: [cell(title.supplier), cell(title.document || "—"), cell(parcel), cell(title.due ? fmtDate(title.due) : "Sem vencimento"), money(title.value), money(title.paid), money(title.open), cell(title.state)] };
}
function groupsFor(rows: SourceRow[], mode: "supplier" | "date" | "subgroup", d: ScenarioData): ChartGroup[] {
  const grouped = new Map<string, ChartGroup>();
  for (const row of rows) {
    const key = row.group;
    const label = mode === "supplier" ? row.label : mode === "date" ? key === "sem-data" ? "Sem vencimento" : fmtDate(key) : key;
    const g = grouped.get(key) ?? { key, label, value: 0, ...(mode === "supplier" ? { supplierId: key } : {}), ...(mode === "subgroup" ? { second: 0 } : {}) };
    if (row.stage === "planned" && mode === "subgroup") g.second = (g.second ?? 0) + row.value; else g.value += row.value;
    grouped.set(key, g);
  }
  return [...grouped.values()].sort((a, b) => mode === "date" ? a.key.localeCompare(b.key) : b.value + (b.second ?? 0) - a.value - (a.second ?? 0));
}
export function cashReport(days: Day[]): DashboardReport {
  return { heads: ["Data", "Saldo inicial", "Recebimento usado", "Planejado", "Efetivado", "Despesas", "Saldo final", "Origem recebimento"],
    rows: days.map((day) => ({ id: day.date, group: day.date, label: fmtDate(day.date), value: day.saldoFinal, cells: [cell(fmtDate(day.date)), money(day.saldoInicial), money(day.recUsado), money(-day.planejada), money(-day.comprometida), money(-day.despesa), money(day.saldoFinal), cell(day.usouInformado ? "Informado" : "Estimado")] })),
    groups: days.map((day) => ({ key: day.date, label: fmtDate(day.date), value: day.saldoFinal })), type: "line", total: days.at(-1)?.saldoFinal ?? 0, totalLabel: "Saldo final (não somar saldos diários)" };
}
export function titlesReport(d: ScenarioData, titles: OpenTitle[], mode: "supplier" | "date" | "subgroup" = "supplier"): DashboardReport {
  const rows = titles.map((title) => {
    const source = title.kind === "committed" ? d.committed.find((c) => c.id === title.id) : d.expenses.find((e) => e.id === title.id);
    const subgroup = d.categories.find((c) => c.id === source?.categoryId)?.name ?? "Sem subgrupo";
    return titleRow(d, title, mode === "supplier" ? title.supplierId : mode === "date" ? title.due ?? "sem-data" : subgroup);
  });
  return { heads: ["Fornecedor", "Documento", "Parcela", "Vencimento", "Valor original", "Pago", "Em aberto", "Situação"], rows, groups: groupsFor(rows, mode, d), type: "bars", total: rows.reduce((sum, row) => sum + row.value, 0), totalLabel: "Total em aberto dos registros" };
}
export function plannedReport(d: ScenarioData, parcels: PlannedParcel[]): DashboardReport {
  const rows = parcels.map((p, i): SourceRow => {
    const plan = d.planned.find((x) => x.id === p.plannedId);
    const source = plan ? distributePlanned(plan, d.suppliers.find((s) => s.id === plan.supplierId), d.committed, d.params.profile, d.effectivations).parcels : [];
    const number = source.findIndex((x) => x.date === p.date && x.amount === p.amount) + 1;
    const subgroup = d.categories.find((c) => c.id === plan?.categoryId)?.name ?? "Sem subgrupo";
    const identity = supplierIdentity(d, plan);
    return { id: `${p.plannedId}-${i}`, group: identity.key, supplierId: identity.key, label: identity.name, value: p.amount, stage: "planned", cells: [cell(identity.name), cell(plan?.document || p.code || "—"), cell(`${number || 1}/${source.length || 1}`), cell(fmtDate(p.date)), money(p.amount), cell(subgroup), cell("Planejada")] };
  });
  return { heads: ["Fornecedor", "Documento / pedido", "Parcela", "Vencimento", "Valor previsto", "Subgrupo", "Etapa"], rows, groups: groupsFor(rows, "supplier", d), type: "bars", total: rows.reduce((s, r) => s + r.value, 0), totalLabel: "Total previsto restante" };
}
export function cardReport(d: ScenarioData, c: Card, days: Day[]) {
  if (c.kind === "day") return cashReport(days);
  if (c.kind === "parcels") return plannedReport(d, c.parcels ?? []);
  // The largest-supplier KPI represents only that supplier, not the sum of the ranking.
  const report = titlesReport(d, c.titles ?? [], ["overdue", "d7", "d15", "d30", "period"].includes(c.key) ? "date" : "supplier");
  if (["nodue", "unconfirmed"].includes(c.key)) report.type = "list";
  return report;
}
export function expensesReport(d: ScenarioData, titles: OpenTitle[], parcels: PlannedParcel[]): DashboardReport {
  const committed = titlesReport(d, titles.filter((t) => t.kind === "expense"), "subgroup");
  const planned = plannedReport(d, parcels.filter((p) => {
    const plan = d.planned.find((x) => x.id === p.plannedId);
    return d.categories.find((c) => c.id === plan?.categoryId)?.kind === "despesa";
  }));
  const rows = [...committed.rows.map((r) => ({ ...r, cells: [...r.cells.slice(0, 4), cell(r.group), money(r.value), cell("Efetivado")] })),
    ...planned.rows.map((r) => ({ ...r, group: r.cells[5]?.text ?? "Sem subgrupo", cells: [...r.cells.slice(0, 4), r.cells[5] ?? cell("Sem subgrupo"), money(r.value), cell("Planejada")] }))];
  return { heads: ["Fornecedor", "Documento", "Parcela", "Vencimento", "Subgrupo", "Valor pendente", "Etapa"], rows, groups: groupsFor(rows, "subgroup", d), type: "paired", total: rows.reduce((sum, r) => sum + r.value, 0), totalLabel: "Efetivado em aberto + previsto restante" };
}