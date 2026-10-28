import { addDays } from "../dates";
import { committedDate, distributePlanned, expenseDate, paymentsFor, titleStatus } from "./engine";
import type { FlowResult, ScenarioData } from "./types";

export interface OpenTitle { kind: "committed" | "expense"; id: string; supplierId: string; supplier: string; document: string; due: string; value: number; paid: number; open: number; state: string }

// Aberto = títulos efetivados/despesas − pagamentos ativos. Vencimento passado NÃO implica pago. Previsão fica separada.
export function openTitles(d: ScenarioData): OpenTitle[] {
  const sn = (id: string) => d.suppliers.find((s) => s.id === id)?.name ?? "(sem fornecedor)";
  const out: OpenTitle[] = [];
  for (const c of d.committed) {
    if (c.status === "cancelado") continue;
    const t = titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id));
    if (t.open > 0) out.push({ kind: "committed", id: c.id, supplierId: c.supplierId, supplier: sn(c.supplierId), document: c.document, due: committedDate(c), value: c.value, paid: t.paid, open: t.open, state: t.state });
  }
  for (const e of d.expenses) {
    if (e.status === "cancelado") continue;
    const due = expenseDate(e);
    if (!due) continue;
    const t = titleStatus(e.value, e.status, paymentsFor(d, "expense", e.id));
    if (t.open > 0) out.push({ kind: "expense", id: e.id, supplierId: e.supplierId, supplier: sn(e.supplierId), document: e.document, due, value: e.value, paid: t.paid, open: t.open, state: t.state });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

export function computeDashboard(d: ScenarioData, flow: FlowResult, today: string) {
  const titles = openTitles(d);
  const sum = (xs: OpenTitle[]) => xs.reduce((a, t) => a + t.open, 0);
  const bySup = new Map<string, { supplierId: string; supplier: string; open: number; titles: OpenTitle[] }>();
  for (const t of titles) {
    const cur = bySup.get(t.supplierId) ?? { supplierId: t.supplierId, supplier: t.supplier, open: 0, titles: [] };
    cur.open += t.open; cur.titles.push(t); bySup.set(t.supplierId, cur);
  }
  const ranking = [...bySup.values()].sort((a, b) => b.open - a.open);
  const within = (n: number) => titles.filter((t) => t.due >= today && t.due <= addDays(today, n));
  let plannedRemaining = 0;
  for (const pl of d.planned) {
    if (pl.status !== "ativo") continue;
    plannedRemaining += distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations).parcels.reduce((a, p) => a + p.amount, 0);
  }
  const firstNeg = flow.days.find((x) => x.saldoFinal < 0);
  return {
    titles, ranking, top: ranking[0] ?? null,
    overdue: sum(titles.filter((t) => t.due < today)), overdueCount: titles.filter((t) => t.due < today).length,
    due7: sum(within(7)), due15: sum(within(15)), due30: sum(within(30)),
    committedOpen: sum(titles.filter((t) => t.kind === "committed")),
    expenseOpen: sum(titles.filter((t) => t.kind === "expense")),
    totalOpen: sum(titles),
    plannedRemaining,
    minBalance: flow.kpis.menorSaldo, minBalanceDate: flow.kpis.menorSaldoData,
    firstNegative: firstNeg?.date ?? null,
    cashNeed: Math.max(0, -flow.kpis.menorSaldo),
  };
}
