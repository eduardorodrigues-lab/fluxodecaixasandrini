import { describe, expect, it } from 'vitest';
import { emptyData } from './engine/actions';
import { addSupplier, addSupplierCondition, applyNote, generateParcels, type NoteDraft } from './notas';
import { applyOps, diffData } from './diff';
import { supplierOperation } from './supplierOperation';
import { dependenciesMatch, isolateOperation, rebasePending, sendOperation } from './operationSave';
import { pickOrg, SHARED_ORG_ID, canWrite, canManageTeam } from './team';

const at='2026-11-18T12:00:00Z';
const fixture=()=>{const d=emptyData();d.categories=[{id:'obras',kind:'despesa',name:'Obras e Construções',group:''},{id:'compra',kind:'compra',name:'Mercadoria',group:''}];return d;};
const supplier=(d:ReturnType<typeof fixture>)=>{addSupplier(d,{id:'madeira-id',name:'MADEIRA MADEIRA',note:'',aliases:[]});addSupplierCondition(d,'madeira-id',{name:'Cartão',terms:[30,60],from:null},at,'leticia','2026-11-18');};
const note=(stage:'planned'|'committed',kind:'compra'|'despesa'):NoteDraft=>({stage,kind,categoryId:kind==='compra'?'compra':'obras',supplierId:'madeira-id',purchaseCode:'CARTÃO DE CRÉDITO 6201',document:'CARTÃO DE CRÉDITO 6201',description:'CARTÃO DE CRÉDITO 6201',total:315840,baseDate:'2026-11-07',parcels:generateParcels(315840,'2026-11-07',[30,60]).map((p,i)=>({...p,date:i?'2027-01-11':'2026-12-09',ext:i?'2027-01-15':null,boletoNumber:`00-A/${i}`}))});
describe('Organização oficial e cadastro dependente revisado',()=>{
  it('mesmo nome e owner pessoal nunca substituem membership oficial editor',()=>{
    const list=[{org_id:'pessoal',name:'Grupo Sandrini',role:'owner',created_by:'leticia'},{org_id:SHARED_ORG_ID,name:'Grupo Sandrini',role:'editor',created_by:'eduardo'}];
    const selected=pickOrg(list,'leticia','pessoal');expect(selected).toEqual(list[1]);expect(selected && selected!=='choose' && selected.role).toBe('editor');expect(canManageTeam('editor')).toBe(false);
    expect(pickOrg(list.filter(o=>o.org_id!==SHARED_ORG_ID),'leticia','pessoal')).toBeNull();expect(canWrite('viewer')).toBe(false);
  });
  for(const stage of ['planned','committed'] as const)for(const kind of ['compra','despesa'] as const)it(`inline ${kind} ${stage}: atomicidade, datas e IDs estáveis`,async()=>{
    const base=fixture(),local=fixture();supplier(local);const n=note(stage,kind);n.localSuppliers=local.suppliers;
    const after=structuredClone(base);let id=0;applyNote(after,n,{id:()=>`title-${++id}`,at});
    const prepared=supplierOperation(base,after,[]);expect(prepared.ops.some(o=>o.entity==='Fornecedor')).toBe(true);
    let server=base;const seen=new Set<string>();let commits=0;const op={scope:'u:official',orgId:SHARED_ORG_ID,requestId:'fixed',...prepared};
    const send=async()=>{if(seen.has(op.requestId))return {status:'duplicate'};server=applyOps(server,op.ops,true).data;seen.add(op.requestId);commits++;throw new Error('resposta perdida');};
    await expect(sendOperation(op,send)).rejects.toThrow('perdida');expect((await sendOperation(op,send)).status).toBe('duplicate');expect(commits).toBe(1);expect(server.suppliers.map(s=>s.id)).toEqual(['madeira-id']);
    if(stage==='planned'){expect(server.planned[0]?.installments?.map(p=>[p.date,p.extensionDate,p.boletoNumber])).toEqual([['2026-12-09',null,'00-A/0'],['2027-01-11','2027-01-15','00-A/1']]);expect(server.committed).toHaveLength(0);}
    else {expect(server.committed.map(p=>[p.dueDate,p.extensionDate,p.boletoNumber])).toEqual([['2026-12-09',null,'00-A/0'],['2027-01-11','2027-01-15','00-A/1']]);expect(server.committed.reduce((s,p)=>s+p.value,0)).toBe(315840);}
    expect(server.payments).toHaveLength(0);expect(base.suppliers).toHaveLength(0);
  });
  it('recupera fornecedor e condições por ID, não outras pendências, sem regerar parcelas',()=>{
    const base=fixture(),draft=fixture();supplier(draft);draft.suppliers.push({id:'outra',name:'OUTRA',terms:[],group:''});
    const pending=diffData(base,draft),after=structuredClone(draft);let id=0;applyNote(after,note('committed','despesa'),{id:()=>`parcela-${++id}`,at});
    const p=supplierOperation(draft,after,pending);expect(p.recovered.map(o=>o.id)).toEqual(['madeira-id']);expect(p.independent.map(o=>o.id)).toEqual(['outra']);expect(p.ops.map(o=>o.entity)).toEqual(expect.arrayContaining(['Fornecedor','Efetivado (compra/pedido)']));expect(p.ops.some(o=>o.id==='outra')).toBe(false);
    expect(()=>isolateOperation(base,applyOps(base,p.ops,false).data,p.independent)).not.toThrow();const saved=applyOps(base,p.ops,true);expect(saved.conflicts).toHaveLength(0);
    expect(saved.data.suppliers[0]?.conditions?.[0]?.terms).toEqual([30,60]);expect(rebasePending(pending,p.ops,p.recovered).map(o=>o.id)).toEqual(['outra']);
    const server=structuredClone(base);server.suppliers.push({...draft.suppliers[0],id:'madeira-id',name:'CONCORRENTE',group:'',terms:[]});expect(applyOps(server,p.ops,true).conflicts.length).toBeGreaterThan(0);
  });
  it('salvar condição isolada preserva datas existentes e detecta revisão concorrente',()=>{
    const base=fixture();supplier(base);let id=0;applyNote(base,note('planned','compra'),{id:()=>`p-${++id}`,at});const after=structuredClone(base);
    addSupplierCondition(after,'madeira-id',{name:'Nova',terms:[10,20,30],from:'2026-11-18'},at,'editor','2026-11-18');
    const p=supplierOperation(base,after,[]);expect(after.planned).toEqual(base.planned);expect(p.ops.filter(o=>o.entity==='Fornecedor')).toHaveLength(1);
    const server=structuredClone(base);const pl=server.planned[0];if(pl)pl.notes='Outra pessoa';expect(applyOps(server,p.ops,true).data.planned[0]?.notes).toBe('Outra pessoa');
    expect(dependenciesMatch(base,{scope:'u:o',orgId:SHARED_ORG_ID,requestId:'r',ops:p.ops,dependencies:p.dependencies})).toBe(true);
  });
});