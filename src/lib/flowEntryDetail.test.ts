import { describe, expect, it } from 'vitest';
import { emptyData } from './engine/actions';
import { addAccount, addTransfer, reverseTransfer } from './engine/banco';
import { buildRows, computeFlow } from './engine/engine';
import { flowEntryDetail } from './flowEntryDetail';
import type { ScenarioData } from './engine/types';

function fixture() {
  const d = emptyData(); Object.assign(d.params, { startDate: '2026-11-01', saldoInicial: 50000, lagDays: 0, legacyReducer: 0, divisorLegado: '30' });
  d.targets = { '2026-11': 300000 }; d.targetConfigs = {};
  addAccount(d,'A',{bank:'Banco A',label:'Origem',holder:'Sandrini',agency:'',account:'',openingBalance:100000,openingDate:'2026-10-31'},'fixture');
  addAccount(d,'B',{bank:'Banco B',label:'Destino',holder:'Buyclock',agency:'',account:'',openingBalance:20000,openingDate:'2026-10-31'},'fixture');
  d.platforms.push({id:'pf',name:'Plataforma',start:'2020-01-01',end:null,importedCode:null,history:[],defaultAccounts:[{from:'2020-01-01',accountId:'B',at:'fixture',note:''}]});
  d.receipts.push({id:'r1',date:'2026-11-01',platforms:{pf:10000},general:5000,accountByPlatform:{pf:{accountId:'A',override:true}},notes:'',realized:true});
  d.receipts.push({id:'r2',date:'2026-11-02',platforms:{},general:0,notes:''});
  return d;
}
function detail(d: ScenarioData,key:string,i:number|null=0,start='2026-11-01',end='2026-11-03',filter={}) {
  const res=computeFlow(d,{start,end,filter}); const row=buildRows(res,d.categories).find(r=>r.key===key);
  if(!row)throw new Error('row missing'); return flowEntryDetail(d,res,row,i);
}
describe('composição das entradas somente visual',()=>{
  it('conta informada e não informada fecham o valor sem usar conta padrão por suposição',()=>{
    const x=detail(fixture(),'rec_real');expect(x.expected).toBe(15000);expect(x.sum).toBe(15000);expect(x.withAccount).toBe(10000);expect(x.withoutAccount).toBe(5000);expect(x.receipts[1]?.account).toBe('Conta não informada');expect(x.receipts[0]?.company).toBe('Sandrini');expect(x.warnings).toHaveLength(1);
  });
  it('saldo manual não é substituído pela soma bancária',()=>{
    const x=detail(fixture(),'saldo_ini');expect(x.sum).toBe(50000);expect(x.opening?.bank).toBe(120000);expect(x.opening?.difference).toBe(-70000);expect(x.opening?.refDate).toBe('2026-10-31');
  });
  it('zero explícito substitui estimativa e vazio usa 10000',()=>{
    const d=fixture();expect(detail(d,'rec_est',1).sum).toBe(0);expect(detail(d,'rec_real',1).receipts[0]?.amount).toBe(0);expect(detail(d,'rec_est',2).sum).toBe(10000);
  });
  it('zero legado mantém a regra vigente e não soma estimativa duplicada',()=>{
    const d=fixture();const r=d.receipts[1];if(r)r.legacyZeroEstimate=true;expect(detail(d,'rec_est',1).sum).toBe(10000);expect(detail(d,'rec_real',1).sum).toBe(0);
  });
  it('Entradas Total do período usa apenas o primeiro saldo',()=>{
    const x=detail(fixture(),'entradas',null);expect(x.expected).toBe(75000);expect(x.sum).toBe(75000);expect(x.composition.filter(l=>l.label.startsWith('Saldo'))).toHaveLength(1);
  });
  it('estimativa substituída é só memória e não entra na composição',()=>{
    const x=detail(fixture(),'entradas');expect(x.sum).toBe(65000);expect(x.estimates[0]?.amount).toBe(10000);expect(x.composition.some(l=>l.label==='Estimativa utilizada')).toBe(false);
  });
  it('ajuste zero e rolagem com filtro seguem o motor',()=>{
    const d=fixture();d.adjustments.push({date:'2026-11-02',value:0,note:'conferido'});const x=detail(d,'saldo_ini',0,'2026-11-03','2026-11-03',{supplierId:'inexistente'});expect(x.sum).toBe(0);expect(x.opening?.anchor).toBe(0);expect(x.opening?.anchorDate).toBe('2026-11-02');expect(x.filtered).toBe(true);
  });
  it('abertura bancária confirmada usa 120000 e não soma referência manual',()=>{
    const d=fixture();d.params.openingMode='contas';expect(detail(d,'saldo_ini').sum).toBe(120000);
  });
  it('transferência Sandrini/Buyclock tem duas pernas neutras, sem obrigação',()=>{
    const d=fixture();const before=detail(d,'entradas',null).sum;addTransfer(d,{id:'t',fromAccountId:'A',toAccountId:'B',amount:4000,date:'2026-11-01',note:'',at:'fixture',by:'fixture'});const x=detail(d,'entradas',null);expect(x.sum).toBe(before);expect(x.transfers[0]?.debit).toBe(-4000);expect(x.transfers[0]?.credit).toBe(4000);expect(d.planned).toHaveLength(0);expect(d.committed).toHaveLength(0);
    reverseTransfer(d,'t','revertida','2026-11-02');const y=detail(d,'entradas',null);expect(y.transfers[0]?.debit).toBe(0);expect(y.transfers[0]?.credit).toBe(0);expect(y.transfers[0]?.note).toBe('revertida');expect(y.sum).toBe(before);
  });
  it('cada célula e total fecham sem mutação nem mistura entre cenários',()=>{
    const d=fixture();const before=structuredClone(d);for(const k of ['saldo_ini','rec_real','rec_est','entradas'])for(const i of [0,1,2,null]){const x=detail(d,k,i);expect(x.sum).toBe(x.expected);}expect(d).toEqual(before);
    const sim=structuredClone(d);sim.params.saldoInicial=90000;expect(detail(sim,'saldo_ini').sum).toBe(90000);expect(detail(d,'saldo_ini').sum).toBe(50000);
  });
  it('datas fora do escopo não entram no painel',()=>{
    const x=detail(fixture(),'rec_real',null,'2026-11-02','2026-11-03');expect(x.receipts).toHaveLength(1);expect(x.receipts[0]?.date).toBe('2026-11-02');expect(x.sum).toBe(0);
  });
});