import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { emptyData } from './engine/actions';
import { addAccount, addCard, addTransfer, updateAccount } from './engine/banco';
import { applyOps, diffData } from './diff';
import { bankOperation } from './bankOperation';
import { dependenciesMatch, rebasePending } from './operationSave';

const account = { bank:'Teste', label:'Conta A',holder:'',agency:'001',account:'0001',openingBalance:0,openingDate:'2026-11-19' };
const setup = () => produce(emptyData(), d => { addAccount(d,'a',account,'2026-11-19'); addAccount(d,'b',{...account,label:'Conta B',account:'0002'},'2026-11-19'); });
describe('Bancos: operação revisada isolada', () => {
  it('cria conta com zero explícito sem pagamentos nem mudança da origem', () => {
    const before=emptyData(), after=produce(before,d=>{addAccount(d,'a',account,'2026-11-19');});
    const op=bankOperation(before,after,[]);
    expect(op.ops.map(o=>o.entity)).toEqual(['Conta bancária']);
    expect(after.bankAccounts[0]?.openingBalance).toBe(0);
    expect(after.payments).toEqual([]); expect(after.params).toEqual(before.params);
    expect(applyOps(after,op.ops,true).applied).toEqual([]);
  });
  it('recupera conta legada por ID e mantém duas pendências independentes', () => {
    const official=emptyData(), draft=produce(official,d=>{addAccount(d,'a',account,'2026-11-19');addAccount(d,'b',{...account,label:'B',account:'0002'},'2026-11-19');d.params.saldoInicial=123;});
    const pending=diffData(official,draft), op=bankOperation(draft,draft,pending,['a']);
    expect(op.ops.map(o=>o.id)).toEqual(['a']); expect(op.ops[0]?.before).toBeNull();
    expect(rebasePending(pending,op.ops,op.recovered).map(o=>o.id)).toEqual(['b','params']);
  });
  it('preserva edição posterior à captura da mesma conta', () => {
    const before=setup(), after=produce(before,d=>{updateAccount(d,'a',{label:'Revisada'},'', '2026-11-19');});
    const op=bankOperation(before,after,[]);
    const later=produce(after,d=>{updateAccount(d,'a',{holder:'Última tecla'},'', '2026-11-19');});
    const rest=rebasePending(diffData(before,later),op.ops);
    expect((rest[0]?.after as typeof account).holder).toBe('Última tecla');
    expect((rest[0]?.before as typeof account).label).toBe('Revisada');
  });
  it('inativação só altera conta e não baixa títulos', () => {
    const before=setup(), after=produce(before,d=>{updateAccount(d,'a',{active:false},'inativada','2026-11-19');});
    expect(bankOperation(before,after,[]).ops.map(o=>o.entity)).toEqual(['Conta bancária']); expect(after.payments).toEqual([]);
  });
  it('cartão depende da conta, transferência depende das duas contas', () => {
    const before=setup();
    const card=bankOperation(before,produce(before,d=>{addCard(d,{id:'k',accountId:'a',name:'Cartão',last4:'0001',closingDay:10,dueDay:20,active:true});}),[]);
    expect(card.dependencies.map(r=>r.id)).toEqual(['a']);
    const trans=bankOperation(before,produce(before,d=>{addTransfer(d,{id:'t',fromAccountId:'a',toAccountId:'b',date:'2026-11-20',amount:100,note:'',at:'',by:''});}),[]);
    expect(trans.dependencies.map(r=>r.id)).toEqual(['a','b']);
    const changed=produce(before,d=>{updateAccount(d,'b',{active:false},'inativada','2026-11-19');});
    expect(dependenciesMatch(changed,{...trans,scope:'u:o',orgId:'o',requestId:'r'})).toBe(false);
  });
});