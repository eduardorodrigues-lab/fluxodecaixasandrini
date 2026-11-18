import { describe,expect,it } from 'vitest';
import { generalFlow } from './generalFlow';
import { computeFlow,buildRows } from './engine/engine';
import { emptyData } from './engine/actions';
import { flowEntryDetail } from './flowEntryDetail';
describe('Fluxo geral sem recortes legados',()=>{
  it('ignora fornecedor/grupo antigos sem mudar período ou preferências',()=>{
    const d=emptyData();d.params.startDate='2026-11-01';d.params.saldoInicial=50000;
    d.categories=[{id:'c',name:'Mercadoria',kind:'compra',group:'Compras'}];
    d.suppliers=[{id:'s1',name:'Sandrini',terms:[],group:'Um'},{id:'s2',name:'Buyclock',terms:[],group:'Dois'}];
    d.committed=[{id:'a',supplierId:'s1',categoryId:'c',purchaseCode:'P1',document:'NF1',value:10000,dueDate:'2026-11-01',notes:'',status:'ativo',extensionDate:null,extensionInfo:'',legacyAbatement:null,extensionHistory:[],origin:'manual',plannedId:null,effectivationId:null},{id:'b',supplierId:'s2',categoryId:'c',purchaseCode:'P2',document:'NF2',value:20000,dueDate:'2026-11-01',notes:'',status:'ativo',extensionDate:null,extensionInfo:'',legacyAbatement:null,extensionHistory:[],origin:'manual',plannedId:null,effectivationId:null}];
    const ui={start:'2026-11-01',end:'2026-11-02',supplierId:'s1',group:'Um',view:'horizontal',flowMode:'etapa'};const before=structuredClone(ui);
    const res=generalFlow(d,ui);expect(res.filtered).toBe(false);expect(res.kpis.saidas).toBe(30000);expect(res).toEqual(computeFlow(d,{start:ui.start,end:ui.end}));expect(ui).toEqual(before);
    expect(computeFlow(d,{start:ui.start,end:ui.end,filter:{supplierId:'s1'}}).kpis.saidas).toBe(10000);
    for(const row of buildRows(res,d.categories)) if(['saldo_ini','rec_real','rec_est','entradas'].includes(row.key)) {expect(flowEntryDetail(d,res,row,null).sum).toBe(row.total);}
    const out=buildRows(res,d.categories).find(r=>r.key==='saidas');expect(out?.values[0]).toBe(res.days[0]?.items.reduce((s,i)=>s+i.amount,0));
  });
});