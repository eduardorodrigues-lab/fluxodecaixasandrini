import { applyOps, type Change } from './diff';
import type { ScenarioData, Receipt } from './engine/types';
import { operationDependencies } from './operationSave';
import { receiptInformed } from './engine/engine';

export function receiptOperation(base: ScenarioData, pending: Change[]) {
  const ops = pending.filter(p => p.entity === 'Recebimento');
  for (const op of ops) {
    const r = op.after as Receipt | null;
    if (r && receiptInformed(r).present && !r.date) throw new Error(`Recebimento ${op.id}: informe a data antes de revisar.`);
  }
  const result = applyOps(base, ops, true);
  if (result.conflicts.length) throw new Error('Recebimentos alterados por outra pessoa. Seus valores estão preservados; confira os conflitos antes de revisar novamente.');
  return { ops, recoveredPending: ops, dependencies: operationDependencies(base, ops) };
}

export function receiptReview(ops: Change[], platforms: ScenarioData['platforms']) {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return ops.flatMap(op => {
    const a = op.before as Receipt | null, b = op.after as Receipt | null;
    const rows: { id: string; date: string; field: string; before: unknown; after: unknown; money?: boolean }[] = [];
    const add = (field: string, before: unknown, after: unknown, money = false) => {
      if (!equal(before, after)) rows.push({ id: op.id, date: b?.date || a?.date || '', field, before, after, money });
    };
    if (!a || !b) rows.push({id:op.id,date:b?.date || a?.date || '',field:'Registro',before:a?'Existente':null,after:b?'Novo':null});
    add('Data', a?.date, b?.date);
    for (const id of new Set([...Object.keys(a?.platforms ?? {}), ...Object.keys(b?.platforms ?? {})])) {
      add(platforms.find(p => p.id === id)?.name ?? `Plataforma não cadastrada (${id})`, a?.platforms[id], b?.platforms[id], true);
    }
    add('Geral', a?.general, b?.general, true);
    add('Creditado em conta', a?.realized ?? false, b?.realized ?? false);
    add('Observações', a?.notes, b?.notes);
    add('Contas por plataforma', a?.accountByPlatform, b?.accountByPlatform);
    add('Conta Geral', a?.generalAccountId, b?.generalAccountId);
    add('Repasses residuais', a?.residual, b?.residual);
    return rows;
  });
}

/** Only the identical captured record can leave the global draft after acknowledgement. */
export function recoveredOperationPending(pending: Change[], recovered: Change[] = []) {
  return pending.filter(p => !recovered.some(r => ['Fornecedor', 'Recebimento'].includes(r.entity) && JSON.stringify(r) === JSON.stringify(p)));
}