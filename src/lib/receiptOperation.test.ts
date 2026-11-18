import { describe, expect, it } from 'vitest';
import { emptyData } from './engine/actions';
import { applyOps, diffData } from './diff';
import { receiptOperation, receiptReview, recoveredOperationPending } from './receiptOperation';
import { dependenciesMatch, rebasePending, sendOperation, type ReviewedOperation } from './operationSave';
import { computeFlow } from './engine/engine';
import { patchDigest, reconcileReceipt } from './commitReceipt';

const fixture=()=>{
  const d=emptyData();d.params.startDate='2026-11-01';
  d.platforms=[{id:'p',name:'Plataforma',start:'2000-01-01',end:null,history:[],importedCode:null}];
  d.receipts=['a','b'].map((id,i)=>({id,date:`2026-11-0${i+1}`,platforms:{p:100},general:null,notes:'',residual:{}}));
  d.targets={'2026-10':300000};
  return d;
};
describe('Recebimentos isolados',()=>{
  it('alteração única inclui somente seu ID, não fornecedores pendentes',()=>{
    const d=fixture(),n=structuredClone(d);n.receipts[0]={...n.receipts[0],id:'a',date:'2026-11-01',platforms:{p:500},general:null,notes:''};
    n.suppliers.push({id:'local',name:'Independente',terms:[],group:''});
    const pending=diffData(d,n),op=receiptOperation(d,pending);
    expect(op.ops.map(o=>o.id)).toEqual(['a']);
    expect(recoveredOperationPending(pending,op.recoveredPending).map(o=>o.id)).toEqual(['local']);
    expect(applyOps(d,op.ops,true).data.suppliers).toEqual([]);
    expect(rebasePending(pending,op.ops,op.recoveredPending).map(o=>o.id)).toEqual(['local']);
  });
  it('reúne múltiplas datas, zero distinto de vazio, sem alterar estimativas',()=>{
    const d=fixture(),n=structuredClone(d);
    for(const r of n.receipts){r.platforms['p']=null;r.general=r.id==='a'?0:null;}
    const op=receiptOperation(d,diffData(d,n));expect(op.ops.map(o=>o.id)).toEqual(['a','b']);
    const applied=applyOps(d,op.ops,true).data;
    const flow=computeFlow(applied,{start:'2026-11-01',end:'2026-11-02'});
    expect(flow.days[0]?.recUsado).toBe(0);
    expect(flow.days[1]?.recUsado).toBeGreaterThan(0);
    expect(applied.targets).toEqual(d.targets);expect(applied.params).toEqual(d.params);
    const rows=receiptReview(op.ops,d.platforms);
    expect(rows.find(r=>r.id==='a'&&r.field==='Geral')?.after).toBe(0);
    expect(rows.find(r=>r.id==='a'&&r.field==='Geral')?.before).toBeNull();
  });
  it('valor sem data impede revisão, inclusive zero informado',()=>{
    const d=fixture(),n=structuredClone(d);const r=n.receipts[0];if(!r)throw Error();r.date='';r.general=0;
    expect(()=>receiptOperation(d,diffData(d,n))).toThrow('informe a data');
  });
  it('cancelar revisão não modifica nem remove pendências legadas',()=>{
    const d=fixture(),n=structuredClone(d);const r=n.receipts[0];if(!r)throw Error();r.general=0;
    const pending=diffData(d,n),text=JSON.stringify(pending);
    receiptOperation(d,pending);receiptReview(pending,d.platforms);
    expect(JSON.stringify(pending)).toBe(text);expect(d.receipts[0]?.general).toBeNull();
  });
  it('conflito na mesma linha bloqueia; outra data concorrente permanece intacta',()=>{
    const d=fixture(),n=structuredClone(d);const r=n.receipts[0];if(!r)throw Error();r.general=900;
    const ops=diffData(d,n),server=structuredClone(d);const b=server.receipts[1];if(!b)throw Error();b.general=700;
    expect(receiptOperation(server,ops).ops).toEqual(ops);
    expect(applyOps(server,ops,true).data.receipts[1]?.general).toBe(700);
    const a=server.receipts[0];if(!a)throw Error();a.general=800;
    expect(()=>receiptOperation(server,ops)).toThrow('outra pessoa');
    expect(server.receipts[0]?.general).toBe(800);
  });
  it('edição posterior ao envio não é excluída da recuperação',()=>{
    const d=fixture(),n=structuredClone(d);const r=n.receipts[0];if(!r)throw Error();r.general=1000;
    const sent=diffData(d,n),later=structuredClone(n);const a=later.receipts[0];if(!a)throw Error();a.general=2000;
    const current=diffData(d,later);
    expect(recoveredOperationPending(current,sent)).toEqual(current);
    const rest=rebasePending(current,sent,sent);
    expect(applyOps(n,rest,true).data.receipts[0]?.general).toBe(2000);
  });
  it('conta e plataforma concorrentes são dependências verificadas',()=>{
    const d=fixture(),n=structuredClone(d);const r=n.receipts[0];if(!r)throw Error();r.general=1;
    const prepared=receiptOperation(d,diffData(d,n));
    const op={...prepared,scope:'u:o',orgId:'o',requestId:'r'};
    const server=structuredClone(d);const pf=server.platforms[0];if(!pf)throw Error();pf.end='2026-10-01';
    expect(dependenciesMatch(d,op)).toBe(true);expect(dependenciesMatch(server,op)).toBe(false);
  });
  it('erro e retry após envio confirmado conservam ID, uma gravação e rascunho',async()=>{
    const d=fixture(),n=structuredClone(d);const r=n.receipts[0];if(!r)throw Error();r.general=0;
    const op={...receiptOperation(d,diffData(d,n)),scope:'u:o',orgId:'o',requestId:'same'};
    const original=JSON.stringify(op);let commits=0;const ids:string[]=[];
    const send=async(o:ReviewedOperation)=>{ids.push(o.requestId);if(commits)return {status:'duplicate'};commits++;throw Error('resposta perdida');};
    await expect(sendOperation(op,send)).rejects.toThrow('resposta perdida');
    expect((await sendOperation(op,send)).status).toBe('duplicate');
    expect(ids).toEqual(['same','same']);expect(commits).toBe(1);expect(JSON.stringify(op)).toBe(original);
  });
  it('cache só aplica confirmação canônica na versão exata, permite reabertura',async()=>{
    const d=fixture(),n=structuredClone(d);const r=n.receipts[0];if(!r)throw Error();r.general=0;
    const ops=diffData(d,n),changesJson=JSON.stringify(ops),ctx={orgId:'o',userId:'u',requestId:'r'};
    const receipt={...ctx,normalization:1,fromVersion:4,version:5,changesJson,digest:await patchDigest(changesJson)};
    const saved=await reconcileReceipt(d,4,receipt,ctx,5);
    expect(saved?.receipts[0]?.general).toBe(0);
    expect(await reconcileReceipt(d,3,receipt,ctx,5)).toBeNull();
    if(!saved)throw Error();expect(receiptOperation(saved,rebasePending(ops,ops,ops)).ops).toEqual([]);
  });
});