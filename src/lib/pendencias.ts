import { addDays, fmtDate } from "@/lib/dates";
import { committedDate, distributePlanned, expenseDate, lagFor } from "@/lib/engine/engine";
import type { ScenarioData, Severity, Warning } from "@/lib/engine/types";

type Destination = "/metas" | "/lancamentos" | "/recebimentos" | "/bancos" | "/referencias";
export interface PendingItem {
  label: string; dates: string[]; months: string[]; note: string;
  destination: Destination; tab?: string | undefined; focus?: string | undefined;
}
export interface PendingGroup {
  code: string; severity: Severity; title: string; impact: string; action: string;
  items: PendingItem[]; current: boolean;
}
const descriptions: Record<string, { severity: Severity; title: string; impact: string; action: string }> = {
  META_AUSENTE: { severity: "alerta", title: "Metas de faturamento não cadastradas", impact: "Os dias sem meta estão sendo calculados com recebimento estimado de R$ 0,00. Isso não significa que houve confirmação de ausência de recebimentos. A limitação pode afetar os saldos seguintes.", action: "Cadastrar metas" },
  PLAN_SEM_PRAZO: { severity: "erro", title: "Previsões sem condições de pagamento", impact: "Não é possível distribuir estas previsões em parcelas. Seus valores não entram nas saídas calculadas.", action: "Corrigir previsão" },
  PLAN_M_AUSENTE: { severity: "erro", title: "Abatimento de compras antigas não informado", impact: "Não é possível calcular o restante destas previsões com segurança. Confira a base de abatimento dos títulos vinculados antes de conciliar.", action: "Conferir vínculo e abatimento" },
  PLAN_SEM_CODIGO: { severity: "alerta", title: "Previsões sem vínculo com compras", impact: "Sem código do pedido ou efetivação vinculada, uma compra pode permanecer também na previsão e duplicar as saídas.", action: "Conferir previsão" },
  PLAN_NEGATIVO: { severity: "alerta", title: "Previsões com restante negativo", impact: "O valor substituído supera a previsão. O restante negativo foi mantido e interfere nas saídas; nenhum valor foi ajustado automaticamente.", action: "Conferir previsão" },
  PLAN_MISTO: { severity: "info", title: "Previsões com efetivações e compras antigas", impact: "Efetivações e títulos antigos distintos são abatidos juntos. Confira os vínculos se representarem a mesma compra.", action: "Conferir vínculos" },
  PLAN_COLISAO: { severity: "info", title: "Parcelas com o mesmo vencimento", impact: "As parcelas na mesma data são somadas, preservando o valor total da previsão.", action: "Ver parcelas" },
  ARRED: { severity: "info", title: "Ajustes de centavos nas parcelas", impact: "O resíduo de arredondamento é aplicado na última parcela para manter o total, sem perda de centavos.", action: "Ver parcelas" },
  PAG_EXCEDE: { severity: "alerta", title: "Pagamentos acima do valor da parcela", impact: "Os pagamentos registrados superam o título. Confira as baixas e os estornos; nenhum pagamento foi desfeito automaticamente.", action: "Conferir pagamentos" },
  PAG_CANCELADO: { severity: "alerta", title: "Lançamentos cancelados com pagamentos ativos", impact: "O cancelamento não desfaz pagamentos. É necessário conferir as baixas e, quando cabível, registrar o estorno.", action: "Conferir pagamentos" },
  CARTAO_INEXISTENTE: { severity: "erro", title: "Compras vinculadas a cartão não encontrado", impact: "Não é possível projetar a fatura destas compras. Seus valores ficam fora da projeção até corrigir o vínculo.", action: "Conferir cartões" },
  DESP_SEM_PRAZO: { severity: "erro", title: "Despesas sem vencimento", impact: "Não é possível programar estas despesas. Seus valores não entram nas saídas calculadas.", action: "Corrigir vencimento" },
  PAG_ANTES_INICIO: { severity: "info", title: "Pagamentos anteriores ao início do fluxo", impact: "Estas baixas reduzem o saldo em aberto, mas não entram novamente nas saídas. Devem estar refletidas no saldo inicial.", action: "Conferir pagamentos" },
  REC_DUPLA: { severity: "alerta", title: "Recebimentos gerais e por plataforma no mesmo dia", impact: "Os dois valores são somados. Se representarem o mesmo recebimento, as entradas podem estar duplicadas; nada foi corrigido automaticamente.", action: "Conferir recebimentos" },
  PLAT_DESCONHECIDA: { severity: "alerta", title: "Recebimentos com plataforma não cadastrada", impact: "O valor continua nas entradas, mas seu vínculo com a plataforma precisa ser conciliado.", action: "Conferir recebimentos" },
  PLAT_FORA_VIGENCIA: { severity: "alerta", title: "Recebimentos fora da vigência da plataforma", impact: "Os valores foram mantidos. Confira a vigência ou registre um repasse residual com justificativa quando aplicável.", action: "Conferir recebimentos" },
  PLAT_RESIDUAL: { severity: "info", title: "Repasses após a inativação da plataforma", impact: "Os repasses residuais justificados permanecem nas entradas, sem reativar a plataforma.", action: "Ver recebimentos" },
  ANTES_INICIO: { severity: "alerta", title: "Saídas pendentes anteriores ao início do fluxo", impact: "Estes vencimentos ficam fora dos saldos calculados. Confira as pendências anteriores; as datas não foram alteradas.", action: "Consultar vencidos" },
};

export function monthName(month: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)).replace(" de ", "/");
}
export function monthsByYear(months: string[]) {
  const years: Record<string, string[]> = {};
  for (const month of [...new Set(months)].sort()) (years[month.slice(0, 4)] ??= []).push(month);
  return years;
}
export function pendingSummary(items: PendingItem[]) {
  const months = [...new Set(items.flatMap((i) => i.months))].sort();
  if (months.length) return `Período afetado: ${monthName(months[0] ?? "")} ${months.length > 1 ? `a ${monthName(months.at(-1) ?? "")}` : ""}.`;
  const dates = [...new Set(items.flatMap((i) => i.dates))].sort();
  const period = dates.length ? ` · ${fmtDate(dates[0])}${dates.length > 1 ? ` a ${fmtDate(dates.at(-1))}` : ""}` : " · sem data definida";
  return `${items.length} registro(s) afetado(s)${period}`;
}

export function buildPendencias(warnings: Warning[], data: ScenarioData, start: string, end: string): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  const occurrences = warnings.flatMap((w) => w.code === "META_AUSENTE" && w.months?.length
    ? w.months.map((month) => ({ ...w, months: [month], affectedDates: (w.affectedDates ?? []).filter((date) => addDays(date, -lagFor(data.params, data.targetConfigs, date)).slice(0, 7) === month) }))
    : [w]);
  for (const w of occurrences) {
    const pl = data.planned.find((p) => p.id === w.refId);
    const c = data.committed.find((p) => p.id === w.refId);
    const e = data.expenses.find((p) => p.id === w.refId);
    const receipt = data.receipts.find((p) => p.id === w.refId);
    const supplier = data.suppliers.find((s) => s.id === (pl ?? c ?? e)?.supplierId)?.name ?? "Fornecedor não informado";
    let dates = w.affectedDates ?? (w.date ? [w.date] : pl ? distributePlanned(pl, data.suppliers.find((s) => s.id === pl.supplierId), data.committed, data.params.profile, data.effectivations).parcels.map((p) => p.date) : c ? [committedDate(c)] : e ? [expenseDate(e) ?? e.baseDate] : []);
    if (w.code === "PAG_ANTES_INICIO") dates = data.payments.filter((p) => !p.reversedAt && p.method !== "cartao" && p.date < data.params.startDate).map((p) => p.date);
    if (w.code === "ANTES_INICIO") dates = [...data.planned.flatMap((p) => distributePlanned(p, data.suppliers.find((s) => s.id === p.supplierId), data.committed, data.params.profile, data.effectivations).parcels.map((p) => p.date)), ...data.committed.map(committedDate), ...data.expenses.map(expenseDate).filter((d): d is string => !!d)].filter((d) => d < data.params.startDate);
    const label = receipt ? `Recebimento de ${fmtDate(receipt.date)}` : pl || c || e ? `${supplier} · ${(pl ?? c ?? e)?.document || pl?.purchaseCode || "Sem documento"}` : "Informação do fluxo";
    // Only named record data is rendered; raw warning messages can contain internal IDs.
    const note = w.code === "ARRED" ? w.message.match(/ajuste de .+?centavo\(s\)/)?.[0] ?? "Resíduo aplicado na última parcela." : w.code === "PLAT_RESIDUAL" && receipt ? Object.values(receipt.residual ?? {}).map((r) => r.note).join(" · ") : "";
    const item: PendingItem = { label, dates, months: w.months ?? [], note, destination: receipt ? "/recebimentos" : "/lancamentos", tab: pl ? "planned" : "committed", focus: w.refId };
    if (w.code === "META_AUSENTE") { item.destination = "/metas"; item.focus = w.months?.[0]; }
    if (w.code === "CARTAO_INEXISTENTE") { item.destination = "/bancos"; item.tab = "cartoes"; item.focus = undefined; }
    if (w.code === "PAG_ANTES_INICIO") { item.tab = "payments"; item.focus = undefined; }
    if (w.code === "ANTES_INICIO") { item.tab = "consultas"; item.focus = undefined; }
    const description = descriptions[w.code] ?? { severity: w.severity, title: "Registro requer conferência", impact: "Existe uma inconsistência neste registro. Confira os dados antes de conciliar o fluxo.", action: "Conferir registro" };
    // Undated records are shown upfront; prior-period items have a separate collapsed section.
    const current = !dates.length || dates.some((d) => d >= start && d <= end);
    const key = `${w.code}:${current}`;
    let group = groups.get(key);
    if (!group) { group = { code: w.code, ...description, items: [], current }; groups.set(key, group); }
    if (!group.items.some((i) => i.focus === item.focus && i.label === item.label && i.dates.join() === item.dates.join())) group.items.push(item);
  }
  return [...groups.values()];
}

export const pendingSearch = (search: Record<string, unknown>): { focus?: string | undefined; tab?: string | undefined } => ({
  focus: typeof search["focus"] === "string" ? search["focus"] : undefined,
  tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
});