import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { normalizeData } from './engine/actions';
import { computeFlow } from './engine/engine';
import { applyNewLaunch, requiresLaunchReview, savedNewLaunch } from './newLaunch';
import { generateParcels, saveSupplierCondition, validateNote, type NoteDraft } from './notas';
import { supplierOperation } from './supplierOperation';
import { applyOps } from './diff';

const at = '2026-11-24T16:50:00Z';
const fixture = () => normalizeData({suppliers:[{id:'s',name:'FICTICIO',group:'',terms:[30]}],categories:[{id:'c',kind:'compra',name:'Mercadoria',group:''},{id:'e',kind:'despesa',name:'Frete',group:''}]});
const draft = (stage: NoteDraft['stage'], kind: NoteDraft['kind'], count=1, total=10001): NoteDraft => ({stage,kind,supplierId:'s',categoryId:kind==='compra'?'c':'e',purchaseCode:'P',document:'NF',description:'Ficticio',total,baseDate:'2026-11-24',parcels:generateParcels(total,'2026-11-24',Array.from({length:count},(_,i)=>30*(i+1)))});

describe('Inclusões independentes — Salvar direto', () => {
  for(const stage of ['planned','committed'] as const) for(const kind of ['compra','despesa'] as const) for(const count of [1,3]) {
    it(`${stage}/${kind}/${count}: autorização de inclusão, centavos, sem baixa e reload sem duplicação`, () => {
      const d=fixture(), n=draft(stage,kind,count);
      expect(requiresLaunchReview(d,n,'novo')).toBe(false);
      const original=structuredClone(d);
      const after=produce(d,x=>applyNewLaunch(x,n,'novo',at));
      expect(d).toEqual(original);
      expect(after.payments).toEqual([]);
      const values=stage==='planned'?after.planned[0]?.installments?.map(p=>p.amount):after.committed.map(p=>p.value);
      expect(values).toHaveLength(count); expect(values?.reduce((a,v)=>a+v,0)).toBe(10001);
      expect(computeFlow(after,{start:'2026-11-24',end:'2027-03-01'}).days.reduce((s,p)=>s+p.saidas,0)).toBe(10001);
      const reloaded=normalizeData(JSON.parse(JSON.stringify(after)));
      expect(savedNewLaunch(reloaded,'novo')?.kind).toBe(stage);
      expect(requiresLaunchReview(reloaded,n,'novo')).toBe(true);
      expect(()=>applyNewLaunch(reloaded,n,'novo',at)).toThrow(/já foi gravado/);
      expect(reloaded).toEqual(after);
    });
  }
  it('efetivação vinculada não vira inclusão independente',()=>{
    expect(requiresLaunchReview(fixture(),{...draft('committed','compra'),plannedId:'pedido'},'novo')).toBe(true);
  });
  it('zero explícito é válido e preservado, vazio não é zero',()=>{
    const d=fixture(), n=draft('committed','despesa',3,0);
    expect(validateNote(n)).toEqual([]); applyNewLaunch(d,n,'zero',at);
    expect(d.committed.map(c=>c.value)).toEqual([0,0,0]);
    expect(validateNote({...n,total:null})).toContain('Informe o valor total.');
  });
  it('validação permanece obrigatória sem revisão: centavos, datas e total',()=>{
    for(const n of [{...draft('planned','compra'),total:NaN},{...draft('planned','compra'),total:100.5},{...draft('committed','compra'),baseDate:'2026-02-30'},{...draft('committed','compra'),parcels:[{amount:Number.NaN,date:'2026-12-24',ext:null}]},{...draft('committed','compra'),parcels:[{amount:10001,date:null,ext:null}]},{...draft('committed','compra'),parcels:[{amount:10000,date:'2026-12-24',ext:null}]}]) {
      const d=fixture(), before=structuredClone(d);
      expect(()=>produce(d,x=>applyNewLaunch(x,n,'invalido',at))).toThrow();
      expect(d).toEqual(before);
    }
  });
  it('fornecedor + condição + parcelas no mesmo pacote; pendência independente não incluída',()=>{
    const d=fixture(), n={...draft('committed','compra',3),supplierId:'inline',localSuppliers:[{id:'inline',name:'FORNECEDOR INLINE',group:'',terms:[]}]};
    const after=produce(d,x=>{applyNewLaunch(x,n,'inline-novo',at);saveSupplierCondition(x,'inline',[30,60,90],at,'Negociada','teste');});
    const pending=[{entity:'Fornecedor',id:'outro',action:'criar',before:null,after:{id:'outro'}}] as unknown as Parameters<typeof supplierOperation>[2];
    const pack=supplierOperation(d,after,pending);
    expect(pack.ops.filter(o=>o.entity==='Fornecedor').map(o=>o.id)).toEqual(['inline']);
    expect(pack.independent).toEqual(pending);
    const persisted=applyOps(d,pack.ops,true);
    expect(persisted.conflicts).toEqual([]);expect(persisted.data).toEqual(after);
    expect(persisted.data.suppliers.find(s=>s.id==='inline')?.conditions?.[0]?.name).toBe('Negociada');
  });
});