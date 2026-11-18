import { describe, expect, it } from 'vitest';
import { produce, setAutoFreeze } from 'immer';
import { emptyData, normalizeData, normalizeTransition } from './engine/actions';
import { applyManaged, managedDocument } from './manageLaunch';
import { effectivateBatch, heldNotes } from './efetivacao';
import { changeCondition } from './condicoes';
import { diffData } from './diff';
setAutoFreeze(false);
describe('preparação compartilhada sem cópia global',()=>{
  it('transição canônica preserva referências intactas, zero/cancelamento e paridade integral',()=>{
    const base=emptyData();base.planned=[{id:'p',supplierId:'',categoryId:'',purchaseCode:'',document:'',value:83078,baseDate:'2026-11-11',notes:'Antes',status:'ativo',remainingOverride:null}];
    const next=produce(base,d=>{const p=d.planned[0];if(p){p.value=0;p.status='cancelado';}});
    const canonical=normalizeTransition(next);
    expect(canonical).toEqual(normalizeData(next));expect(canonical.planned).toBe(next.planned);
    expect(canonical.suppliers).toBe(base.suppliers);expect(diffData(base,canonical)).toHaveLength(1);expect(base.planned[0]?.value).toBe(83078);
  });
  it('normalização compartilhada mantém migrações existentes e todos os efeitos no patch canônico',()=>{
    const legacy={params:{profile:'legado',startDate:'2026-11-11',saldoInicial:18505},platforms:['Geral antiga'],targets:{'2026-11':100000},receipts:[{id:'r',date:'2026-11-11',general:0,platforms:{'Geral antiga':123},notes:''}],categories:[{id:'c',kind:'planejada',name:'Compra'}],planned:[{id:'p',value:0}],committed:[{id:'t',extensionDate:'2026-11-23',legacyAbatement:0}]};
    const original=JSON.stringify(legacy);
    const shared=normalizeTransition(legacy as unknown as import('./engine/types').ScenarioData);
    expect(shared).toEqual(normalizeData(legacy));expect(shared.receipts[0]?.general).toBe(0);expect(shared.committed[0]?.extensionHistory).toHaveLength(1);expect(shared.targetConfigs['2026-11']).toBeDefined();expect(JSON.stringify(legacy)).toBe(original);
  });
  it('edição de descrição mantém valores/datas e só copia a coleção afetada',()=>{
    const base=emptyData();base.suppliers=[{id:'s',name:'Fixture',group:'',terms:[30]}];
    base.planned=[{id:'p',supplierId:'s',categoryId:'',purchaseCode:'',document:'NF',value:315840,baseDate:'2026-11-07',notes:'Antes',status:'ativo',remainingOverride:null}];
    const initial=managedDocument(base,{kind:'planned',id:'p'});
    const input={ref:{kind:'planned' as const,id:'p'},before:initial.parcels,parcels:initial.parcels,fields:{...initial.fields,notes:'Depois'},initialFields:initial.fields,reason:'',at:'2026-11-18',by:'fixture'};
    const next=produce(base,d=>applyManaged(d,input));
    expect(next.planned[0]?.value).toBe(315840);expect(managedDocument(next,input.ref).parcels).toEqual(initial.parcels);
    expect(next.suppliers).toBe(base.suppliers);expect(next.payments).toBe(base.payments);
    expect(diffData(base,next).map(c=>c.fields)).toEqual([['notes']]);
  });
  it('condição editada copia histórico sem quebrar drafts Immer ou datas existentes',()=>{
    const base=emptyData();base.suppliers=[{id:'s',name:'Fixture',group:'',terms:[30],conditions:[{id:'c',name:'30',terms:[30],note:'',at:'2026-01-01',by:'fixture',from:'2026-01-01'}]}];
    const next=produce(base,d=>changeCondition(d,'s','c',{kind:'edit',name:'60',note:'Revisada',terms:[60]},'2026-11-18','fixture','2026-11-18'));
    expect(next.suppliers[0]?.conditions?.[0]?.history?.[0]?.terms).toEqual([30]);
    expect(base.suppliers[0]?.conditions?.[0]?.terms).toEqual([30]);
  });
  it('efetivar nota com restante previamente salvo mantém snapshot e identidade',()=>{
    const base=emptyData();base.suppliers=[{id:'s',name:'Fixture',terms:[30],group:''}];
    base.planned=[{id:'p',supplierId:'s',categoryId:'',purchaseCode:'',document:'',value:680400,baseDate:'2026-11-07',notes:'',status:'ativo',remainingOverride:{value:680400,dates:['2026-12-07'],items:[{id:'t',amount:680400,date:'2026-12-07',note:{noteId:'nf',document:'NF-FIX',total:680400,baseDate:'2026-11-07',effectiveDate:'2026-11-18',condition:{name:'30',terms:[30]},parcelNo:1,parcelCount:1,dueDate:'2026-12-07',extension:null}}]}}];
    const notes=heldNotes(base,'p');
    const next=produce(base,d=>effectivateBatch(d,{id:'ef',plannedId:'p',at:'2026-11-18',by:'fixture',selected:[],notes,rest:[],remaining:0,confirmed:true,reason:'Conferido',scopeConfirmed:false,duplicateConfirmed:false,reference:680400}));
    expect(next.committed[0]).toMatchObject({id:'t',document:'NF-FIX',value:680400,dueDate:'2026-12-07'});
    expect(next.effectivations[0]?.prev.remainingOverride).toEqual(base.planned[0]?.remainingOverride);
    expect(base.committed).toHaveLength(0);
  });
});