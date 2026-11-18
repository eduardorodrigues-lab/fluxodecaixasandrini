import { describe,it,expect,vi } from 'vitest';
import { bounded,pollConfirmation } from './saveRecovery';
import { operationReview } from './operationReview';
import { emptyData } from './engine/actions';
import { diffData,applyOps } from './diff';
import { rebasePending } from './operationSave';
describe('Confirmação e pacote revisado',()=>{
  it('limita espera sem cancelar a confirmação tardia',async()=>{
    let confirmed=false;const work=new Promise<string>(resolve=>setTimeout(()=>{confirmed=true;resolve('ok');},25));
    await expect(bounded(work,1)).rejects.toThrow('Tempo');expect(confirmed).toBe(false);await work;expect(confirmed).toBe(true);
  });
  it('confirma resposta perdida só por leitura e limita tentativas ausentes/offline',async()=>{
    const read=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null).mockResolvedValueOnce({version:42});
    expect(await pollConfirmation(read,[0,0,0])).toEqual({version:42});expect(read).toHaveBeenCalledTimes(3);
    const absent=vi.fn().mockResolvedValue(null);expect(await pollConfirmation(absent,[0,0,0])).toBeNull();expect(absent).toHaveBeenCalledTimes(3);
  });
  it('revisão conserva zero versus vazio e não altera captura',()=>{
    const d=emptyData();d.receipts=[{id:'raw-r',date:'2026-11-18',general:null,platforms:{},notes:''}];const n=structuredClone(d);const r=n.receipts[0];if(r)r.general=0;
    const ops=diffData(d,n),capture=JSON.stringify(ops);const rows=operationReview(ops,d);
    expect(rows.find(r=>r.field==='Geral')).toMatchObject({before:'Vazio',after:'R$\u00a00,00'});expect(rows[0]?.record).toContain('18/11/2026');expect(JSON.stringify(ops)).toBe(capture);
  });
  it('identifica alteração e cancelamento sem incluir campos intactos',()=>{
    const d=emptyData();d.suppliers=[{id:'raw-s',name:'Nome',terms:[],group:''}];const n=structuredClone(d);const s=n.suppliers[0];if(s)s.name='Novo';const rows=operationReview(diffData(d,n),d);
    expect(rows).toEqual([{record:'Fornecedor · Novo',action:'alteração',field:'Nome',before:'Nome',after:'Novo'}]);
  });
  it('edição após captura e pendência independente sobrevivem confirmação',()=>{
    const d=emptyData();d.receipts=[{id:'r',date:'2026-11-18',general:null,platforms:{},notes:''}];const sentData=structuredClone(d);const r=sentData.receipts[0];if(r)r.general=0;
    const sent=diffData(d,sentData),later=structuredClone(sentData);const rr=later.receipts[0];if(rr)rr.general=123;later.suppliers.push({id:'s',name:'Independente',terms:[],group:''});
    const pending=diffData(d,later),rest=rebasePending(pending,sent,sent);const result=applyOps(sentData,rest,true);expect(result.conflicts).toEqual([]);expect(result.data.receipts[0]?.general).toBe(123);expect(result.data.suppliers[0]?.name).toBe('Independente');expect(sent[0]?.after).toEqual(sentData.receipts[0]);
  });
});