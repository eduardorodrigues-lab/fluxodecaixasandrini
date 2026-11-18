import { describe, expect, it } from 'vitest';
import { emptyData } from './engine/actions';
import { applyOps, diffData } from './diff';
import { dependenciesMatch, operationDependencies, isolateOperation, rebasePending, sendOperation } from './operationSave';
import type { ScenarioData } from './engine/types';
const base = () => {
  const d=emptyData();
  d.suppliers=[{id:'s1',name:'Fornecedor',group:'',terms:[]}];
  d.expenses=['a','b'].map(id=>({id,supplierId:'s1',categoryId:'',document:id,value:20900.125,baseDate:'2027-07-15',termDays:0,status:'ativo',extensionDate:null,extensionHistory:[],notes:''}));
  return d;
};
const changed=(d:ScenarioData, id:string, field:'value'|'notes',value:number|string)=>{
  const n=structuredClone(d); const r=n.expenses.find(r=>r.id===id); if(r)Object.assign(r,{[field]:value}); return n;
};
describe('Operação revisada isolada',()=>{
  it('não confunde ID com texto da descrição nem tipos de baixa colidentes',()=>{
    const d=base(),after=changed(d,'a','notes','b');
    const pending=diffData(d,changed(d,'b','value',100));
    expect(isolateOperation(d,after,pending).map(o=>o.id)).toEqual(['a']);
    const ops=diffData(d,after),op={scope:'u:o',orgId:'o',requestId:'id',ops,dependencies:operationDependencies(d,ops)};
    const server=structuredClone(d);server.payments.push({id:'outra',titleKind:'committed',titleId:'a',amount:100,date:'2027-07-15',note:'',reversedAt:null,reversalNote:''});
    expect(dependenciesMatch(server,op)).toBe(true);
  });
  it('conserva edição no mesmo campo durante espera e dependência de categoria',()=>{
    const d=base(),sent=diffData(d,changed(d,'a','value',62700)),pending=diffData(d,changed(d,'a','value',70000));
    const result=applyOps(applyOps(d,sent,true).data,rebasePending(pending,sent),true);
    expect(result.conflicts).toHaveLength(0);expect(result.data.expenses[0]?.value).toBe(70000);
    d.categories.push({id:'cat',kind:'despesa',name:'Teste',group:''});const expense=d.expenses[0];if(expense)expense.categoryId='cat';
    const ops=diffData(d,changed(d,'a','notes','novo')),op={scope:'u:o',orgId:'o',requestId:'id',ops,dependencies:operationDependencies(d,ops)};
    const server=structuredClone(d);const category=server.categories[0];if(category)category.name='Concorrente';
    expect(dependenciesMatch(server,op)).toBe(false);
  });
  it('nova baixa concorrente impede cancelar título revisado sem pagamento',()=>{
    const d=base(),after=structuredClone(d);const expense=after.expenses[0];if(expense)expense.status='cancelado';
    const ops=diffData(d,after),op={scope:'u:o',orgId:'o',requestId:'id',ops,dependencies:operationDependencies(d,ops)};
    expect(dependenciesMatch(d,op)).toBe(true);
    const server=structuredClone(d);server.payments.push({id:'nova-baixa',titleKind:'expense',titleId:'a',amount:20900,date:'2027-07-15',note:'',reversedAt:null,reversalNote:''});
    expect(dependenciesMatch(server,op)).toBe(false);
  });
  it('salva só operação a e mantém pendência independente b com valores exatos',()=>{
    const d=base(),pending=diffData(d,changed(d,'b','value',62700)),from=applyOps(d,pending,false).data;
    const sent=isolateOperation(from,changed(from,'a','notes','revisado'),pending);
    expect(sent.map(o=>o.id)).toEqual(['a']);
    const official=applyOps(d,sent,true).data;
    expect(official.expenses.map(r=>r.value)).toEqual([20900.125,20900.125]);
    expect(rebasePending(pending,sent)).toEqual(pending);
  });
  it('bloqueia pendência anterior no mesmo registro antes de enviar',()=>{
    const d=base(),pending=diffData(d,changed(d,'a','notes','anterior')),from=applyOps(d,pending,false).data;
    expect(()=>isolateOperation(from,changed(from,'a','value',1),pending)).toThrow('Despesa a');
  });
  it('bloqueia dependência fornecedor ainda pendente',()=>{
    const d=base(),next=structuredClone(d);next.suppliers[0]={...next.suppliers[0],id:'novo',name:'Novo',group:'',terms:[]};
    const pending=diffData(d,next),after=changed(next,'a','notes','revisão');const expense=after.expenses[0];if(expense)expense.supplierId='novo';
    expect(()=>isolateOperation(next,after,pending)).toThrow('Fornecedor novo');
  });
  it('edição durante espera conserva operação salva e nova alteração pendente',()=>{
    const d=base(),sent=diffData(d,changed(d,'a','value',62700)),pending=diffData(d,changed(d,'a','notes','durante espera'));
    const rebased=rebasePending(pending,sent),official=applyOps(d,sent,true).data;
    const r=applyOps(official,rebased,true);expect(r.conflicts).toHaveLength(0);
    expect(r.data.expenses[0]?.value).toBe(62700);expect(r.data.expenses[0]?.notes).toBe('durante espera');
  });
  it('preserva edição concorrente distinta e detecta mesmo campo sem sobrescrever',()=>{
    const d=base(),sent=diffData(d,changed(d,'a','value',62700));
    expect(applyOps(changed(d,'b','value',123),sent,true).data.expenses.map(r=>r.value)).toEqual([62700,123]);
    const r=applyOps(changed(d,'a','value',123),sent,true);expect(r.conflicts).toHaveLength(1);expect(r.data.expenses[0]?.value).toBe(123);
  });
  it('timeout depois de salvar e retry mesmo ID auditam e incluem uma única vez',async()=>{
    const d=base(),after=structuredClone(d);after.expenses.push({...after.expenses[0],id:'nova',supplierId:'s1',categoryId:'',document:'nova',value:20900.125,baseDate:'2027-07-15',termDays:0,status:'ativo',extensionDate:null,extensionHistory:[],notes:''});
    const op={scope:'user:org',orgId:'org',requestId:'same-id',ops:diffData(d,after)};
    let server=d,audits=0;const seen=new Set<string>();
    const send=async(o:typeof op)=>{if(seen.has(o.requestId))return {status:'duplicate'};server=applyOps(server,o.ops,true).data;seen.add(o.requestId);audits++;throw new Error('timeout');};
    await expect(sendOperation(op,send)).rejects.toThrow('timeout');
    expect((await sendOperation(op,send)).status).toBe('duplicate');expect(audits).toBe(1);expect(server.expenses.map(r=>r.id)).toEqual(['a','b','nova']);
  });
  it('falha antes de gravar preserva payload e tentativa após disputa reutiliza ID',async()=>{
    const d=base(),op={scope:'u:o',orgId:'o',requestId:'same',ops:diffData(d,changed(d,'a','value',0))};
    const original=JSON.stringify(op);await expect(sendOperation(op,async()=>{throw new Error('rede');})).rejects.toThrow('rede');expect(JSON.stringify(op)).toBe(original);
    const ids:string[]=[];const result=await sendOperation(op,async o=>{ids.push(o.requestId);return {status:'retry'};});expect(ids).toEqual(['same']);expect(result.status).toBe('retry');
  });
});