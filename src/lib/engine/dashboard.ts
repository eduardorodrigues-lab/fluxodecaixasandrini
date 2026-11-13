import { addDays } from "../dates";
import { committedDate, distributePlanned, expenseDate, paymentsFor, titleStatus } from "./engine";
import type { Day, FlowResult, ScenarioData } from "./types";
import { matchesSupplier, supplierIdentity } from "../supplierIdentity";

export interface OpenTitle { kind: "committed" | "expense"; id: string; supplierId: string; supplier: string; group: string; document: string; due: string | null; value: number; paid: number; open: number; state: string; unconfirmed: boolean }
export interface DashScope { start: string; end: string; supplierId?: string; group?: string }

// Aberto = títulos efetivados/despesas − pagamentos ativos. Vencimento passado NÃO implica pago. Previsão fica separada.
// Despesa sem vencimento (prazo G vazio) ENTRA no aberto com due=null (seção "sem vencimento"), nunca em janelas de datas.
export function openTitles(d: ScenarioData, scope?: Pick<DashScope, "supplierId" | "group">): OpenTitle[] {
  const sup = (id: string) => d.suppliers.find((s) => s.id === id);
  const pass = (row: ScenarioData["committed"][number] | ScenarioData["expenses"][number]) => matchesSupplier(d, row, scope?.supplierId) && (!scope?.group || sup(row.supplierId)?.group === scope.group);
  const out: OpenTitle[] = [];
  const base = (row: ScenarioData["committed"][number] | ScenarioData["expenses"][number]) => { const identity = supplierIdentity(d, row); return { supplierId: identity.key, supplier: identity.name, group: sup(row.supplierId)?.group ?? "" }; };
  for (const c of d.committed) {
    if (c.status === "cancelado" || !pass(c)) continue;
    const t = titleStatus(c.value, c.status, paymentsFor(d, "committed", c.id));
    const u = !!c.paymentUnconfirmed && t.paid === 0;
    if (t.open > 0) out.push({ kind: "committed", id: c.id, ...base(c), document: c.document, due: committedDate(c), value: c.value, paid: t.paid, open: t.open, state: u ? "Situação a confirmar" : t.state, unconfirmed: u });
  }
  for (const e of d.expenses) {
    if (e.status === "cancelado" || !pass(e)) continue;
    const t = titleStatus(e.value, e.status, paymentsFor(d, "expense", e.id));
    const u = !!e.paymentUnconfirmed && t.paid === 0;
    if (t.open > 0) out.push({ kind: "expense", id: e.id, ...base(e), document: e.document, due: expenseDate(e), value: e.value, paid: t.paid, open: t.open, state: u ? "Situação a confirmar" : t.state, unconfirmed: u });
  }
  return out.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

export interface PlannedParcel { plannedId: string; supplier: string; code: string; date: string; amount: number }
export interface Card {
  key: string; label: string; value: number; count: number; scope: string; explanation: string;
  titles?: OpenTitle[]; parcels?: PlannedParcel[]; day?: Day | null; curve?: { date: string; saldo: number }[];
  ranking?: { supplierId: string; supplier: string; open: number; titles: OpenTitle[] }[];
  kind: "titles" | "parcels" | "day" | "ranking"; tone?: "neg" | "warn" | undefined;
}
const sum = (xs: { open: number }[]) => xs.reduce((a, t) => a + t.open, 0);

export function computeDashboard(d: ScenarioData, flow: FlowResult, today: string, scope: DashScope) {
  const filt = scope.supplierId || scope.group ? ` · filtro ${scope.supplierId ? "fornecedor" : ""}${scope.group ? ` grupo ${scope.group}` : ""}` : "";
  const stockScope = `Estoque em aberto na data-base ${today} (independe do período)${filt}`;
  const perScope = `Vencimentos no período ${scope.start} a ${scope.end}${filt}`;
  // Aberto VALIDADO exclui títulos importados sem informação de pagamento ("situação a confirmar"): não são pagos nem aberto confirmado.
  const every = openTitles(d, scope);
  const unconfirmed = every.filter((t) => t.unconfirmed);
  const all = every.filter((t) => !t.unconfirmed);
  const dated = all.filter((t) => t.due);
  const noDue = all.filter((t) => !t.due);
  const bySup = new Map<string, { supplierId: string; supplier: string; open: number; titles: OpenTitle[] }>();
  for (const t of all) {
    const cur = bySup.get(t.supplierId) ?? { supplierId: t.supplierId, supplier: t.supplier, open: 0, titles: [] };
    cur.open += t.open; cur.titles.push(t); bySup.set(t.supplierId, cur);
  }
  const ranking = [...bySup.values()].sort((a, b) => b.open - a.open);
  const within = (n: number) => dated.filter((t) => t.due! >= today && t.due! <= addDays(today, n));
  const inPeriod = dated.filter((t) => t.due! >= scope.start && t.due! <= scope.end);
  const parcels: PlannedParcel[] = [];
  for (const pl of d.planned) {
    if (pl.status !== "ativo") continue;
    if (!matchesSupplier(d, pl, scope.supplierId)) continue;
    if (scope.group && d.suppliers.find((s) => s.id === pl.supplierId)?.group !== scope.group) continue;
    for (const p of distributePlanned(pl, d.suppliers.find((s) => s.id === pl.supplierId), d.committed, d.params.profile, d.effectivations).parcels)
      if (p.date >= scope.start && p.date <= scope.end) parcels.push({ plannedId: pl.id, supplier: supplierIdentity(d, pl).name, code: pl.purchaseCode, date: p.date, amount: p.amount });
  }
  parcels.sort((a, b) => a.date.localeCompare(b.date));
  const days = flow.days;
  const minDay = days.find((x) => x.date === flow.kpis.menorSaldoData) ?? null;
  const firstNeg = days.find((x) => x.saldoFinal < 0) ?? null;
  const curve = days.map((x) => ({ date: x.date, saldo: x.saldoFinal }));
  const top = ranking[0];
  const T = (key: string, label: string, titles: OpenTitle[], sc: string, explanation: string, tone?: Card["tone"]): Card => ({ key, label, value: sum(titles), count: titles.length, scope: sc, explanation, titles, kind: "titles", tone });
  const cards: Card[] = [
    { key: "top", label: "Maior fornecedor em aberto", value: top?.open ?? 0, count: top?.titles.length ?? 0, scope: stockScope, explanation: top ? `${top.supplier}: soma do aberto dos seus títulos.` : "Nenhum título em aberto no escopo.", titles: top?.titles ?? [], ranking, kind: "ranking" },
    T("total", "Total em aberto", all, stockScope, `Efetivados + despesas − pagamentos ativos. Inclui ${noDue.length} despesa(s) sem vencimento.`),
    T("overdue", "Vencidos", dated.filter((t) => t.due! < today), stockScope, "Vencimento anterior a hoje e saldo em aberto. Vencimento passado não significa pago.", "neg"),
    T("d7", "A vencer 7 dias", within(7), `De ${today} a ${addDays(today, 7)}${filt}`, "Saldo em aberto com vencimento nos próximos 7 dias."),
    T("d15", "A vencer 15 dias", within(15), `De ${today} a ${addDays(today, 15)}${filt}`, "Saldo em aberto com vencimento nos próximos 15 dias."),
    T("d30", "A vencer 30 dias", within(30), `De ${today} a ${addDays(today, 30)}${filt}`, "Saldo em aberto com vencimento nos próximos 30 dias."),
    T("period", "Vencimentos do período", inPeriod, perScope, "Títulos em aberto com vencimento dentro do período selecionado."),
    T("committed", "Efetivado pendente", all.filter((t) => t.kind === "committed"), stockScope, "Compras/pedidos efetivados ainda não pagos (total ou parcial)."),
    T("expense", "Despesas pendentes", all.filter((t) => t.kind === "expense"), stockScope, "Despesas não pagas, incluindo as sem vencimento."),
    T("nodue", "Sem vencimento (pendência)", noDue, stockScope, "Despesas com prazo G vazio: entram no aberto, mas não em janelas de data nem no fluxo. Informe o prazo.", noDue.length ? "warn" : undefined),
    T("unconfirmed", "Situação a confirmar (importados)", unconfirmed, stockScope, "Títulos importados sem informação de pagamento. Não entram no aberto validado nem no ranking; vencimento passado não indica pagamento. Registre a baixa ou confirme a situação.", unconfirmed.length ? "warn" : undefined),
    { key: "planned", label: "Previsão restante (não é aberto)", value: parcels.reduce((a, p) => a + p.amount, 0), count: parcels.length, scope: `Parcelas previstas no período ${scope.start} a ${scope.end}${filt}`, explanation: "Saldo previsto (planejado) após efetivações e abatimento legado. Não é título em aberto.", parcels, kind: "parcels" },
    { key: "min", label: "Saldo mínimo", value: flow.kpis.menorSaldo, count: minDay ? 1 : 0, scope: `Fluxo do período ${scope.start} a ${scope.end}${filt}`, explanation: minDay ? `Menor saldo final do período, em ${minDay.date}.` : "Sem dias no período.", day: minDay, curve, kind: "day", tone: flow.kpis.menorSaldo < 0 ? "neg" : undefined },
    { key: "neg", label: "Primeiro saldo negativo", value: firstNeg?.saldoFinal ?? 0, count: firstNeg ? 1 : 0, scope: `Fluxo do período ${scope.start} a ${scope.end}${filt}`, explanation: firstNeg ? `Primeiro dia com saldo final negativo: ${firstNeg.date}.` : "Nenhum dia negativo no período.", day: firstNeg, curve, kind: "day", tone: firstNeg ? "neg" : undefined },
    { key: "need", label: "Necessidade de caixa", value: Math.max(0, -flow.kpis.menorSaldo), count: flow.kpis.menorSaldo < 0 ? 1 : 0, scope: `Fluxo do período ${scope.start} a ${scope.end}${filt}`, explanation: flow.kpis.menorSaldo < 0 ? `Valor para cobrir o saldo mínimo (${minDay?.date}): −(saldo mínimo).` : "Saldo mínimo não negativo: sem necessidade no período.", day: minDay, curve, kind: "day" },
  ];
  return { cards, titles: all, unconfirmed, ranking, noDue, today };
}
