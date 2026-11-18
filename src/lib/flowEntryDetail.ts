import { addDays } from './dates';
import { fmtBRL } from './money';
import { accountBalance, accountName, consolidatedBalance, flowOpening, movements } from './engine/banco';
import { dailyEstimate } from './engine/engine';
import type { Row } from './engine/engine';
import type { Day, FlowResult, ScenarioData } from './engine/types';

export const entryKeys = new Set(['saldo_ini', 'rec_real', 'rec_est', 'entradas']);
export interface EntryLine { date: string; label: string; amount: number; accountId?: string | null; account?: string; company?: string; status?: string; origin?: string; note?: string }
export function flowEntryDetail(data: ScenarioData, res: FlowResult, row: Row, index: number | null) {
  const days = index === null ? res.days : res.days.slice(index, index + 1);
  const expected = index === null ? row.total : row.values[index] ?? 0;
  const composition: EntryLine[] = [], receipts: EntryLine[] = [], estimates: EntryLine[] = [];
  const openingDay = (row.key === 'saldo_ini' || row.key === 'entradas') ? days[0] : undefined;
  const account = (id: string | null | undefined) => ({ accountId: id ?? null, account: accountName(data, id), company: data.bankAccounts.find(a => a.id === id)?.holder || 'Não cadastrada' });
  for (const day of days) {
    for (const receipt of data.receipts.filter(r => r.date === day.date)) {
      const origin = receipt.origin ? `${receipt.origin.sheet} · linha ${receipt.origin.row}` : 'Cadastro';
      const status = receipt.realized === true ? 'Realizado (crédito confirmado)' : receipt.kind === 'previsto' ? 'Previsto / informado; crédito não confirmado' : 'Informado; crédito não confirmado';
      const values = [...Object.entries(receipt.platforms).map(([id, amount]) => ({ label: data.platforms.find(p => p.id === id)?.name ?? `Plataforma não cadastrada (${id})`, amount, id: receipt.accountByPlatform?.[id]?.accountId })), { label: 'Geral', amount: receipt.general, id: receipt.generalAccountId }];
      for (const value of values) if (value.amount !== null && value.amount !== undefined && Number.isFinite(value.amount)) {
        const line = { date: day.date, label: value.label, amount: value.amount, ...account(value.id), origin, status, note: day.usouInformado ? receipt.notes : 'Não utilizado no fluxo: regra do zero legado ou ausência.' };
        receipts.push(line);
        if (day.usouInformado && (row.key === 'rec_real' || row.key === 'entradas')) composition.push(line);
      }
    }
    const est = dailyEstimate(data.params, data.targets, day.date, data.targetConfigs);
    estimates.push({ date: day.date, label: `Meta ${est.month}`, amount: day.recEstimado, status: day.usouInformado ? 'Substituída pelo informado; não soma' : 'Estimativa utilizada', note: est.missing ? 'Meta ausente: valor calculado pelo motor é zero.' : `Base bruta ${fmtBRL(est.gross)}; redutor 1 ${fmtBRL(est.r1)}; redutor 2 ${fmtBRL(est.r2)}; líquido ${fmtBRL(est.liquid)}; divisor ${est.divisor}; defasagem ${est.lag} dias; referência ${est.ref}.` });
    if (!day.usouInformado && (row.key === 'rec_est' || row.key === 'entradas')) composition.push({ date: day.date, label: 'Estimativa utilizada', amount: day.recEstimado, status: 'Não é saldo bancário realizado', account: 'Conta não informada' });
  }
  let opening: ReturnType<typeof openingDetail> | undefined;
  if (openingDay) {
    composition.unshift({ date: openingDay.date, label: 'Saldo anterior do fluxo (não é receita externa)', amount: openingDay.saldoInicial });
    opening = openingDetail(data, openingDay);
  }
  const start = days[0]?.date, end = days.at(-1)?.date;
  const transfers = data.transfers.filter(t => start && end && t.date >= start && t.date <= end).map(t => {
    const included = data.bankAccounts.some(a => a.id === t.fromAccountId) && data.bankAccounts.some(a => a.id === t.toAccountId);
    return { id: t.id, date: t.date, from: accountName(data, t.fromAccountId), to: accountName(data, t.toAccountId), amount: t.amount, included, reversedAt: t.reversedAt, note: t.reversedAt ? t.reversalNote : t.note, debit: t.reversedAt ? 0 : -t.amount, credit: t.reversedAt ? 0 : t.amount };
  });
  return { expected, composition, sum: composition.reduce((s, l) => s + l.amount, 0), receipts, estimates, opening, transfers, filtered: res.filtered,
    withAccount: receipts.filter(l => l.accountId).reduce((s, l) => s + l.amount, 0), withoutAccount: receipts.filter(l => !l.accountId).reduce((s, l) => s + l.amount, 0),
    warnings: res.warnings.filter(w => w.date && days.some(d => d.date === w.date) && w.code === 'REC_DUPLA'),
    period: index === null, start, end };
}
function openingDetail(data: ScenarioData, day: Day) {
  const refDate = addDays(day.date, -1), bank = consolidatedBalance(data, refDate), ms = movements(data);
  const accounts = data.bankAccounts.map(a => ({ name: accountName(data, a.id), company: a.holder || 'Não cadastrada', openingDate: a.openingDate, value: a.openingDate && a.openingDate <= refDate ? accountBalance(data, a.id, refDate, ms).realized : null }));
  const previous = [...data.adjustments].filter(a => a.value !== null && a.date >= data.params.startDate && a.date < day.date).sort((a,b) => b.date.localeCompare(a.date))[0];
  const anchor = previous?.value ?? flowOpening(data);
  const before = day.ajuste ? day.saldoInicial - day.ajuste.diff : day.saldoInicial;
  return { refDate, flow: day.saldoInicial, bank: bank.value, difference: day.saldoInicial - bank.value, accounts, pending: bank.pending, unassigned: bank.unassigned,
    anchor, anchorDate: previous?.date ?? data.params.startDate, anchorSource: previous ? 'Ajuste manual anterior' : data.params.openingMode === 'contas' ? 'Saldo bancário consolidado na abertura' : 'Saldo inicial consolidado/manual configurado',
    roll: before - anchor, adjustment: day.ajuste, transition: data.params.bankTransition };
}
