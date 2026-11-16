import { diffData, opKey, type Change } from './diff';
import type { ScenarioData } from './engine/types';

export interface ReviewedOperation { scope: string; orgId: string; requestId: string; ops: Change[]; dependencies?: ReturnType<typeof operationDependencies>; rejected?: boolean }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Read dependencies, including newly added payments, must remain unchanged until commit. */
export function operationDependencies(d: ScenarioData, ops: Change[]) {
  const refs = ops.flatMap(o => [o.before,o.after]).filter((r): r is Record<string,unknown> => !!r && typeof r==='object');
  const titleKeys = new Set(ops.filter(o=>['Efetivado (compra/pedido)','Despesa'].includes(o.entity)).map(o=>`${o.entity==='Despesa'?'expense':'committed'}:${o.id}`));
  refs.forEach(r=>{if(r['titleId'])titleKeys.add(`${r['titleKind']}:${r['titleId']}`);});
  const planned = new Set(ops.filter(o=>o.entity==='Previsão (planejada)').map(o=>o.id));
  refs.forEach(r=>{if(typeof r['plannedId']==='string')planned.add(r['plannedId']);});
  d.committed.filter(c=>planned.has(c.plannedId ?? '')).forEach(c=>titleKeys.add(`committed:${c.id}`));
  const suppliers = new Set(refs.map(r=>r['supplierId']).filter((id):id is string=>typeof id==='string' && !!id));
  const categories = new Set(refs.map(r=>r['categoryId']).filter((id):id is string=>typeof id==='string' && !!id));
  const accounts = new Set(refs.map(r=>r['accountId']).filter((id):id is string=>typeof id==='string' && !!id));
  const cards = new Set(refs.map(r=>r['cardId']).filter((id):id is string=>typeof id==='string' && !!id));
  const affected = new Set(ops.map(opKey));
  const records = [
    ...d.committed.filter(c=>titleKeys.has(`committed:${c.id}`)||planned.has(c.plannedId ?? '')).map(c=>({entity:'Efetivado (compra/pedido)',id:c.id,data:c})),
    ...d.expenses.filter(c=>titleKeys.has(`expense:${c.id}`)).map(c=>({entity:'Despesa',id:c.id,data:c})),
    ...d.planned.filter(c=>planned.has(c.id)).map(c=>({entity:'Previsão (planejada)',id:c.id,data:c})),
    ...d.suppliers.filter(c=>suppliers.has(c.id)).map(c=>({entity:'Fornecedor',id:c.id,data:c})),
    ...d.categories.filter(c=>categories.has(c.id)).map(c=>({entity:'Categoria',id:c.id,data:c})),
    ...d.bankAccounts.filter(c=>accounts.has(c.id)).map(c=>({entity:'Conta bancária',id:c.id,data:c})),
    ...d.cards.filter(c=>cards.has(c.id)).map(c=>({entity:'Cartão',id:c.id,data:c})),
    ...d.effectivations.filter(c=>planned.has(c.plannedId)).map(c=>({entity:'Efetivação',id:c.id,data:c})),
    ...d.payments.filter(c=>titleKeys.has(`${c.titleKind}:${c.titleId}`)).map(c=>({entity:'Pagamento (baixa)',id:c.id,data:c})),
  ].filter(r=>!affected.has(`${r.entity}|${r.id}`)).sort((a,b)=>`${a.entity}|${a.id}`.localeCompare(`${b.entity}|${b.id}`));
  return records;
}

export function dependenciesMatch(d:ScenarioData,op:ReviewedOperation) {
  const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v && typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):v;
  return !op.dependencies || JSON.stringify(stable(operationDependencies(d,op.ops)))===JSON.stringify(stable(op.dependencies));
}

/** Conservative record/dependency isolation: never includes an earlier draft implicitly. */
export function isolateOperation(before: ScenarioData, after: ScenarioData, pending: Change[]): Change[] {
  const ops = diffData(before, after);
  const dependencyKeys = new Set(operationDependencies(before,ops).map(r=>`${r.entity}|${r.id}`));
  const referenceIds = new Set(ops.flatMap(o=>[o.before,o.after]).flatMap(r=>r && typeof r==='object' ? Object.entries(r).filter(([key])=>['supplierId','categoryId','plannedId','effectivationId','titleId','noteId'].includes(key)).map(([,value])=>value) : []));
  const overlaps = pending.filter(p => dependencyKeys.has(opKey(p)) || referenceIds.has(p.id) || ops.some(o => opKey(o) === opKey(p)));
  if (overlaps.length) throw new Error(`Esta operação depende de alterações anteriores não salvas: ${overlaps.map(p => `${p.entity} ${p.id} (${p.fields.join(', ') || p.kind})`).join('; ')}. Nada foi gravado. Volte e revise/salve essas pendências ou descarte-as explicitamente antes de revisar novamente este formulário.`);
  return ops;
}

/** Rebase only edits made locally while this isolated request was pending. */
export function rebasePending(pending: Change[], sent: Change[]): Change[] {
  return pending.map(p => {
    const saved = sent.find(s => opKey(s) === opKey(p));
    if (!saved) return p;
    if (p.before && p.after && saved.after && typeof p.after === 'object') {
      const after = { ...(saved.after as object) } as Record<string, unknown>;
      const old = p.before as Record<string, unknown>, edited = p.after as Record<string, unknown>;
      for (const k of Object.keys({ ...old, ...edited })) if (!equal(old[k], edited[k])) {
        if (k in edited) after[k] = edited[k]; else delete after[k];
      }
      return { ...p, before: saved.after, after };
    }
    return { ...p, before: saved.after };
  }).filter(p => !equal(p.before, p.after));
}

export async function sendOperation<T extends { status: string }>(op: ReviewedOperation, send: (op: ReviewedOperation) => Promise<T>): Promise<T> {
  let r = await send(op);
  for (let i = 0; r.status === 'retry' && i < 3; i++) r = await send(op);
  return r;
}