import { describe, expect, it } from 'vitest';
import { emptyData, normalizeData } from './engine/actions';
import { applyOps, diffData } from './diff';
import { patchDigest, reconcileReceipt, type CommitReceipt } from './commitReceipt';
import { rebasePending } from './operationSave';

const context = {orgId:'o',userId:'u',requestId:'r'};
async function fixture() {
  const base=emptyData();
  base.suppliers=[{id:'s',name:'Antes',terms:[30],group:''}];
  const next=structuredClone(base); const supplier=next.suppliers[0];
  if(supplier)supplier.name='Depois';
  const changesJson=JSON.stringify(diffData(base,next));
  const receipt:CommitReceipt={...context,fromVersion:4,version:5,normalization:1,changesJson,digest:await patchDigest(changesJson)};
  return {base,next,receipt};
}
describe('resposta confirmada canônica',()=>{
  it('aplica a versão confirmada com valores e histórico idênticos ao documento normalizado',async()=>{
    const {base,next,receipt}=await fixture();
    expect(await reconcileReceipt(base,4,receipt,context,5)).toEqual(normalizeData(next));
    expect(base.suppliers[0]?.name).toBe('Antes');
  });
  it('releitura para lacuna de versão/atraso/contexto diferente/cache incompatível',async()=>{
    const {base,receipt}=await fixture();
    for(const version of [3,5,6])expect(await reconcileReceipt(base,version,receipt,context,5)).toBeNull();
    for(const ctx of [{...context,userId:'outro'},{...context,orgId:'outra'},{...context,requestId:'retry-outro'}])expect(await reconcileReceipt(base,4,receipt,ctx,5)).toBeNull();
    expect(await reconcileReceipt(emptyData(),4,receipt,context,5)).toBeNull();
  });
  it('patch incompleto ou corrompido não é aplicado',async()=>{
    const {base,receipt}=await fixture();
    expect(await reconcileReceipt(base,4,{...receipt,changesJson:'[]'},context,5)).toBeNull();
    expect(await reconcileReceipt(base,4,{...receipt,digest:'errado'},context,5)).toBeNull();
    expect(await reconcileReceipt(base,4,{...receipt,normalization:2},context,5)).toBeNull();
    expect(await reconcileReceipt(base,4,undefined,context,5)).toBeNull();
  });
  it('mudança no mesmo registro impede patch; pendência independente permanece separada',async()=>{
    const {base,receipt,next}=await fixture();
    const other=structuredClone(base);const s=other.suppliers[0];if(s)s.name='Concorrente';
    expect(await reconcileReceipt(other,4,receipt,context,5)).toBeNull();
    const pending=[{entity:'Fornecedor',id:'independente',kind:'inclusão' as const,before:null,after:{id:'independente',name:'Local',terms:[],group:''},fields:[]}];
    const saved=await reconcileReceipt(base,4,receipt,context,5);
    expect(rebasePending(pending,diffData(base,next))).toEqual(pending);
    if(!saved)throw new Error('resposta recusada');
    expect(saved.suppliers.map(s=>s.name)).toEqual(['Depois']);
    expect(applyOps(saved,pending,true).data.suppliers.map(s=>s.name)).toEqual(['Depois','Local']);
  });
});