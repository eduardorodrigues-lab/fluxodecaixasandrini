import { describe,it,expect } from 'vitest';
import { unifiedLaunchFixture } from '@/test/unifiedLaunchFixture';
import { createLaunchPresentation } from './launchPresentation';
import { emptyLaunchFilters } from './launchFilters';
import { computeFlow } from './engine/engine';
import { currentParcels } from './efetivacao';
import { fmtBRL } from './money';
import { dateValue } from './reportTable';
import { eligibleLaunchKeys,filterUnifiedLaunch,launchLocation,launchSummary,unifiedLaunchCSV,unifiedLaunchRows,validatedLaunchSelection } from './unifiedLaunch';

describe('Consulta única — fontes financeiras permanecem independentes',()=>{
  it('14 linhas com compras/despesas nas duas etapas, fontes originais e chaves sem colisão',()=>{
    const d=unifiedLaunchFixture(),model=createLaunchPresentation(d),rows=unifiedLaunchRows(model);
    expect(rows).toHaveLength(14);expect(new Set(rows.map(r=>r.key)).size).toBe(14);
    expect(rows.filter(r=>r.ref.id==='same').map(r=>r.ref.kind)).toEqual(['planned','planned','planned','committed','expense']);
    expect(rows.filter(r=>r.row.stage==='planned')).toHaveLength(8);
    expect(rows.filter(r=>r.values[0]==='Despesa')).toHaveLength(5);
    const planned=rows.find(r=>r.ref.kind==='planned'&&r.ref.id==='same');
    expect(planned?.row.stage==='planned'&&planned.row.source.row.p).toBe(d.planned[0]);
    expect(planned?.ref.parcel).toBe('same#0');
    expect(rows.find(r=>r.ref.kind==='expense'&&r.ref.id==='same')?.bulkKey).toBe('expense:same');
  });
  it('remanescente parcial não volta ao original; cancelados são históricos; pagos não dobram saldo',()=>{
    const d=unifiedLaunchFixture(),rows=unifiedLaunchRows(createLaunchPresentation(d)),s=launchSummary(rows);
    expect(currentParcels(d,'linked').map(p=>p.amount)).toEqual([5000,2000]);
    expect(s).toMatchObject({plannedCount:8,actualCount:6,remaining:42000,plannedCancelled:1000,original:31000,obligation:26000,paid:14000,open:12000});
    expect(rows.find(r=>r.ref.kind==='committed'&&r.ref.id==='same-2')?.values.slice(11,14)).toEqual(['Pago',10000,0]);
    expect(rows.find(r=>r.ref.kind==='expense')?.values.slice(11,14)).toEqual(['Em aberto',0,3000]);
  });
  it('zero explícito em ambas etapas e dados não aplicáveis ficam vazios',()=>{
    const rows=unifiedLaunchRows(createLaunchPresentation(unifiedLaunchFixture()));
    const zero=filterUnifiedLaunch(rows,'',{...emptyLaunchFilters(),min:0,max:0},'','value');
    expect(zero.map(r=>r.values[7])).toEqual([0,0]);
    expect(zero.find(r=>r.row.stage==='planned')?.values.slice(11,14)).toEqual([null,null,null]);
  });
  it('etapa compartilha categoria, subgrupo, fornecedor, documento, datas, busca/aliases e ordenação',()=>{
    const rows=unifiedLaunchRows(createLaunchPresentation(unifiedLaunchFixture()));
    const filters={...emptyLaunchFilters(),suppliers:[rows[0]?.facets.supplier??''],category:'Compra',subgroup:'c',from:'2026-12-01',to:'2026-12-31'};
    const all=filterUnifiedLaunch(rows,'',filters,'sintético','due');
    const planned=filterUnifiedLaunch(rows,'planned',filters,'sintético','due');
    const actual=filterUnifiedLaunch(rows,'committed',filters,'sintético','due');
    expect(all.length).toBe(8);expect(planned.length).toBe(5);expect(actual.length).toBe(3);
    expect(filterUnifiedLaunch(rows,'',{...emptyLaunchFilters(),payment:'Pago'},'','due').map(r=>r.ref.id)).toEqual(['same-2']);
    expect(filterUnifiedLaunch(rows,'',{...emptyLaunchFilters(),document:'nf-linked'},'','due').map(r=>r.ref.kind)).toEqual(['committed']);
    expect(filterUnifiedLaunch(rows,'',emptyLaunchFilters(),'boleto-inexistente','due')).toEqual([]);
    expect(filterUnifiedLaunch(rows,'',emptyLaunchFilters(),'BOL-001','due').map(r=>r.ref.kind)).toEqual(['committed']);
    expect(filterUnifiedLaunch(rows,'',emptyLaunchFilters(),'','due',{column:15,direction:'asc'})[0]?.values[15]).toBe('Efetivação');
  });
  it('seleção da página só inclui efetivação; IDs iguais em entidades diferentes não se confundem',()=>{
    const rows=unifiedLaunchRows(createLaunchPresentation(unifiedLaunchFixture(70))),result=filterUnifiedLaunch(rows,'',emptyLaunchFilters(),'','value'),page=result.slice(0,50);
    const keys=eligibleLaunchKeys(page);
    expect(keys.length).toBeGreaterThan(0);expect(keys.length).toBeLessThan(50);
    expect(validatedLaunchSelection(rows,keys)).toEqual(keys);
    expect(validatedLaunchSelection(rows,['committed:same','expense:same'])).toHaveLength(2);
    expect(()=>validatedLaunchSelection(rows,['planned:same'])).toThrow(/somente parcelas de Efetivação/);
    expect(()=>validatedLaunchSelection(rows,['committed:inexistente'])).toThrow();
    expect(filterUnifiedLaunch(rows,'planned',emptyLaunchFilters(),'','due').every(r=>r.bulkKey===null)).toBe(true);
    expect(eligibleLaunchKeys(page).every(k=>!k.startsWith('planned:'))).toBe(true);
  });
  it('CSV e totais consomem as 84 linhas filtradas, nunca só as 50 paginadas, e exportam Etapa',()=>{
    const rows=filterUnifiedLaunch(unifiedLaunchRows(createLaunchPresentation(unifiedLaunchFixture(70))),'',emptyLaunchFilters(),'','value');
    const csv=unifiedLaunchCSV(rows);
    expect(rows).toHaveLength(84);expect(csv.split('\r\n')).toHaveLength(85);
    expect(csv.startsWith('\uFEFF"Etapa";')).toBe(true);expect(csv).toContain('"Planejamento";');expect(csv).toContain('"Efetivação";');
    expect(launchSummary(rows).remaining).toBeGreaterThan(launchSummary(rows.slice(0,50)).remaining);
    expect(unifiedLaunchCSV(rows.filter(r=>r.values[7]===0))).toContain(fmtBRL(0));
  });
  it('navegação antiga equivale a filtro; acessos próprios não viram etapa',()=>{
    expect(launchLocation({})).toMatchObject({tab:'launches',etapa:''});
    expect(launchLocation({tab:'planned',focus:'same'})).toMatchObject({tab:'launches',etapa:'planned',focus:'same'});
    expect(launchLocation({tab:'committed'})).toMatchObject({tab:'launches',etapa:'committed'});
    expect(launchLocation({tab:'planned',etapa:''})).toMatchObject({tab:'launches',etapa:''});
    for(const tab of ['payments','consultas','pva'])expect(launchLocation({tab})).toMatchObject({tab,etapa:''});
  });
  it('nota planejada remanescente conserva documento, boleto, vencimento original e prorrogação',()=>{
    const d=unifiedLaunchFixture(),p=d.planned.find(p=>p.id==='linked'),item=p?.remainingOverride?.items?.[0];
    if(!item)throw new Error('Fixture sem restante');
    item.boletoNumber='BOL-NF';item.date='2027-01-10';item.note={noteId:'known',document:'NF-REST',total:5000,effectiveDate:null,baseDate:'2026-11-01',condition:null,parcelNo:1,parcelCount:1,dueDate:'2026-12-31',extension:'2027-01-10'};
    const rows=unifiedLaunchRows(createLaunchPresentation(d));
    const result=filterUnifiedLaunch(rows,'planned',{...emptyLaunchFilters(),period:'extended',from:'2027-01-10',to:'2027-01-10'},'BOL-NF','due');
    expect(result).toHaveLength(1);expect(result[0]?.ref.parcel).toBe(item.id);
    expect(result[0]?.values[4]).toBe('NF-REST');expect(result[0]?.values[8]).toBe(dateValue('2026-12-31'));expect(result[0]?.values[9]).toBe(dateValue('2027-01-10'));
    expect(result[0]?.values[7]).toBe(5000);expect(item.date).toBe('2027-01-10');
  });
  it('filtrar, ordenar, exportar e selecionar não mutam fontes nem os totais reais/simulados do Fluxo',()=>{
    const d=unifiedLaunchFixture(),before=structuredClone(d),flow=computeFlow(d,{start:'2026-11-01',end:'2027-04-01'});
    const rows=unifiedLaunchRows(createLaunchPresentation(d));
    for(const stage of ['','planned','committed'] as const){const result=filterUnifiedLaunch(rows,stage,emptyLaunchFilters(),'','value');unifiedLaunchCSV(result);launchSummary(result);validatedLaunchSelection(rows,eligibleLaunchKeys(result));}
    expect(d).toEqual(before);expect(computeFlow(d,{start:'2026-11-01',end:'2027-04-01'})).toEqual(flow);
    expect(flow.days.reduce((s,r)=>s+r.saidas,0)).toBe(68000);
    expect(computeFlow(structuredClone(d),{start:'2026-11-01',end:'2027-04-01'})).toEqual(flow);
  });
});