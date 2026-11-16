import { describe, expect, it } from 'vitest';
import { emptyData } from './engine/actions';
import { createLaunchPresentation } from './launchPresentation';
import { createLaunchDates, emptyLaunchFilters, filterLaunchRows, formatLaunchTime, launchFilterErrors, type LaunchAudit } from './launchFilters';
import { reportCSV } from './reportTable';
import type { Committed, Planned } from './engine/types';
function fixture() {
  const d = emptyData();
  d.categories = [{ id: 'cat', name: 'Mercadoria', kind: 'compra', group: '' }, { id: 'desp', name: 'Serviços', kind: 'despesa', group: '' }];
  d.suppliers = [{ id: 's', name: 'Manchester', aliases: ['Calçados'], group: '', terms: [] }, { id: 'b', name: 'Outro', group: '', terms: [] }];
  d.committed = Array.from({ length: 101 }, (_, i): Committed => ({ id: `c${String(i).padStart(3, '0')}`, supplierId: i % 2 ? 'b' : 's', purchaseCode: 'PED', document: `DOC${i}`, value: i * 100, dueDate: '2027-07-15', extensionDate: i % 2 ? null : '2027-08-01', extensionHistory: [], extensionInfo: '', legacyAbatement: null, origin: 'manual', plannedId: null, effectivationId: null, categoryId: 'cat', notes: 'Descrição útil', status: 'ativo' }));
  const first = d.committed[0]; if (!first) throw new Error('fixture');
  first.importOrigin = { file: 'test', sheet: 'Lançamentos', row: 5, raw: [null, null, '361186A2'] };
  d.payments = [{ id: 'pay', titleKind: 'committed', titleId: 'c002', amount: 100, date: '2027-07-15', note: '', reversedAt: null, reversalNote: '' }];
  return d;
}
describe('filtros completos sem alterar finanças', () => {
  it('combina AND, fornecedores OR, aliases e identificação original 361186A2', () => {
    const d = fixture(), m = createLaunchPresentation(d), f = { ...emptyLaunchFilters(), category: 'Compra', subgroup: 'cat', suppliers: ['s', 'b'], order: 'PED', description: 'util' };
    expect(filterLaunchRows(m.committed, f, 'calçados', 'created')).toHaveLength(51);
    expect(filterLaunchRows(m.committed, f, '361186A2', 'created').map(r => r.row.t === 'committed' ? r.row.c.id : r.row.e.id)).toEqual(['c000']);
    expect(filterLaunchRows(m.committed, { ...f, suppliers: ['b'] }, '361186A2', 'created')).toHaveLength(0);
    expect(filterLaunchRows(m.committed, { ...f, category: 'Despesa' }, '', 'created')).toHaveLength(0);
  });
  it('valor é da parcela, não o saldo aberto; pagamento conserva regra atual', () => {
    const rows = createLaunchPresentation(fixture()).committed;
    const f = { ...emptyLaunchFilters(), payment: 'Parcialmente pago', min: 200, max: 200 };
    const result = filterLaunchRows(rows, f, '', 'value');
    expect(result.map(r => r.values[7])).toEqual([200]); expect(result[0]?.values[13]).toBe(100);
    expect(filterLaunchRows(rows, { ...f, min: 100, max: 100 }, '', 'value')).toHaveLength(0);
  });
  it('intervalos abertos, zero e vazio distintos; datas prorrogadas e ausentes', () => {
    const rows = createLaunchPresentation(fixture()).committed, f = emptyLaunchFilters();
    expect(filterLaunchRows(rows, f, '', 'created')).toHaveLength(101);
    expect(filterLaunchRows(rows, { ...f, max: 0 }, '', 'created')).toHaveLength(1);
    expect(filterLaunchRows(rows, { ...f, min: 10000 }, '', 'created')).toHaveLength(1);
    expect(filterLaunchRows(rows, { ...f, from: '2027-07-16' }, '', 'created')).toHaveLength(0);
    expect(filterLaunchRows(rows, { ...f, to: '2027-07-15' }, '', 'created')).toHaveLength(101);
    expect(filterLaunchRows(rows, { ...f, period: 'extended', from: '2027-08-01' }, '', 'created')).toHaveLength(51);
    expect(filterLaunchRows(rows, { ...f, extendedOnly: true }, '', 'created')).toHaveLength(51);
    expect(filterLaunchRows(rows, { ...f, period: 'created', from: '2020-01-01' }, '', 'created')).toHaveLength(0);
  });
  it('intervalos invertidos exibem erro e não eliminam silenciosamente registros', () => {
    const f = { ...emptyLaunchFilters(), min: 100, max: 0, from: '2027-08-01', to: '2027-07-01' };
    expect(launchFilterErrors(f)).toHaveLength(2);
    expect(filterLaunchRows(createLaunchPresentation(fixture()).committed, f, '', 'created')).toHaveLength(101);
  });
  it('ordena datas reais, ausentes ao final, empates estáveis por ID', () => {
    const d = fixture();
    const records = [d.committed[2], d.committed[4]];
    const audit: LaunchAudit[] = records.flatMap((r, i) => r ? [{ at: `2026-11-${i ? '16' : '15'}T15:00:00Z`, user: 'Autor', changes: [{ entity: 'Efetivado (compra/pedido)', id: r.id, kind: 'inclusão' as const, before: null, after: r, fields: [] }] }] : []);
    const rows = createLaunchPresentation(d, audit).committed;
    const ids = (r: typeof rows) => r.map(x => x.row.t === 'committed' ? x.row.c.id : x.row.e.id);
    expect(ids(filterLaunchRows(rows, emptyLaunchFilters(), '', 'created')).slice(0, 3)).toEqual(['c004', 'c002', 'c000']);
    expect(ids(filterLaunchRows([...rows].reverse(), emptyLaunchFilters(), '', 'created'))).toEqual(ids(filterLaunchRows(rows, emptyLaunchFilters(), '', 'created')));
    expect(filterLaunchRows(rows, emptyLaunchFilters(), '', 'value')[0]?.values[7]).toBe(10000);
    expect(formatLaunchTime('2026-11-16T01:30:00Z')).toContain('15/11/2026');
    expect(formatLaunchTime(null)).toBe('Não disponível');
    expect(filterLaunchRows(rows, { ...emptyLaunchFilters(), period: 'created', to: '2026-11-15' }, '', 'created')).toHaveLength(1);
  });
  it('IDs, valores, totais e CSV usam as 101 parcelas antes da página de 50', () => {
    const d = fixture(), snapshot = JSON.stringify(d), rows = createLaunchPresentation(d).committed;
    const result = filterLaunchRows(rows, emptyLaunchFilters(), '', 'value');
    expect(result).toHaveLength(101); expect(result.slice(0, 50)).toHaveLength(50);
    expect(result.reduce((s, r) => s + Number(r.values[7]), 0)).toBe(505000);
    expect(result.map(r => r.facets.key).sort()).toEqual(rows.map(r => r.facets.key).sort());
    const csv = reportCSV(['id', 'valor'], result.map(r => [r.facets.key, String(r.values[7])]));
    expect(csv.split('\r\n')).toHaveLength(102); expect(csv).toContain('10000');
    for (const r of result) expect(rows.find(x => x.facets.key === r.facets.key)?.row).toBe(r.row);
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});
describe('metadados confiáveis por parcela', () => {
  const planned = (): Planned => ({ id: 'p', supplierId: 's', purchaseCode: 'P', document: 'D', value: 62700, baseDate: '2027-07-01', categoryId: '', notes: '', status: 'ativo', remainingOverride: null, installments: [0, 1, 2].map(() => ({ amount: 20900, date: '2027-07-15', extensionDate: null, extensionHistory: [] })) });
  it('não rotula importação como criação original nem inventa timestamp', () => {
    const p = { ...planned(), origin: { file: 'x', sheet: 'x', row: 1 } };
    const get = createLaunchDates([{ at: '2026-11-16T15:00:00Z', user: 'Importador', changes: [{ entity: 'Previsão (planejada)', id: p.id, kind: 'inclusão', before: null, after: p, fields: [] }] }]);
    expect(get('planned', p, 'p#0').created).toBeNull(); expect(get('planned', p, 'p#0').updated).toBeNull();
    expect(createLaunchDates([])('planned', planned(), 'p#0').created).toBeNull();
  });
  it('edição de uma parcela não altera timestamps das outras ao converter em restante', () => {
    const p = planned(), after = { ...p, remainingOverride: { value: 62800, dates: ['2027-07-15', '2027-07-15', '2027-07-15'], items: [0, 1, 2].map(i => ({ id: `p#${i}`, amount: i === 1 ? 21000 : 20900, date: '2027-07-15' })) }, editLog: [{ at: '2026-11-16T15:00:00Z', by: 'Eduardo', note: '', parcel: 'p#1', before: { amount: 20900, date: '2027-07-15' }, after: { amount: 21000, date: '2027-07-15' } }] };
    const get = createLaunchDates([{ at: '2026-11-16T15:01:00Z', user: 'Eduardo', changes: [{ entity: 'Previsão (planejada)', id: p.id, kind: 'alteração', before: p, after, fields: ['remainingOverride', 'editLog'] }] }]);
    expect(get('planned', after, 'p#1', 1).updated).toBe('2026-11-16T15:01:00Z');
    expect(get('planned', after, 'p#0', 0).updated).toBeNull(); expect(get('planned', after, 'p#2', 2).updated).toBeNull();
    expect(get('planned', after, 'p#0', 0).created).toBeNull();
  });
  it('alteração compartilhada afeta todas as parcelas, IDs iguais em tipos diferentes não colidem', () => {
    const p = planned(), after = { ...p, document: 'Novo' };
    const get = createLaunchDates([{ at: '2026-11-16T15:00:00Z', user: 'Eduardo', changes: [{ entity: 'Previsão (planejada)', id: p.id, kind: 'alteração', before: p, after, fields: ['document'] }] }]);
    expect([0, 1, 2].map(i => get('planned', after, `p#${i}`, i).updatedBy)).toEqual(['Eduardo', 'Eduardo', 'Eduardo']);
    expect(get('expense', { ...fixture().committed[0], id: 'p' } as never).updated).toBeNull();
  });
  it('novo snapshot e nova auditoria substituem índices sem contaminar contexto anterior', () => {
    const d = fixture(), old = createLaunchPresentation(d);
    const next = structuredClone(d), title = next.committed[1]; if (!title) throw new Error('fixture'); title.document = 'NOVO';
    const m = createLaunchPresentation(next, [{ at: '2026-11-16T15:00:00Z', user: 'Eduardo', changes: [{ entity: 'Efetivado (compra/pedido)', id: title.id, kind: 'alteração', before: d.committed[1], after: title, fields: ['document'] }] }]);
    expect(filterLaunchRows(m.committed, emptyLaunchFilters(), 'NOVO', 'updated')[0]?.facets.updatedBy).toBe('Eduardo');
    expect(filterLaunchRows(old.committed, emptyLaunchFilters(), 'NOVO', 'updated')).toHaveLength(0);
    expect(createLaunchPresentation(emptyData()).committed).toHaveLength(0);
  });
  it('nova parcela do restante não herda cadastro de uma parcela original anterior', () => {
    const p = planned(), after = { ...p, remainingOverride: { value: 20900, dates: ['2027-08-01'], items: [{ id: 'nova-parcela', amount: 20900, date: '2027-08-01' }] } };
    const get = createLaunchDates([
      { at: '2026-11-10T15:00:00Z', user: 'Primeiro', changes: [{ entity: 'Previsão (planejada)', id: p.id, kind: 'inclusão', before: null, after: p, fields: [] }] },
      { at: '2026-11-16T15:00:00Z', user: 'Segundo', changes: [{ entity: 'Previsão (planejada)', id: p.id, kind: 'alteração', before: p, after, fields: ['remainingOverride'] }] },
    ]);
    expect(get('planned', after, 'nova-parcela').created).toBe('2026-11-16T15:00:00Z');
    expect(get('planned', after, 'nova-parcela').createdBy).toBe('Segundo');
  });
});