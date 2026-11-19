import { applyOps, diffData, type Change } from './diff';
import type { ScenarioData } from './engine/types';
import { operationDependencies } from './operationSave';

/** Recover only explicitly reviewed records, never a whole module draft. */
export function bankOperation(before: ScenarioData, after: ScenarioData, pending: Change[], accountIds: string[] = []) {
  const recovered = pending.filter(p => p.entity === 'Conta bancária' && accountIds.includes(p.id));
  const original = applyOps(before, recovered.map(p => ({ ...p, before: p.after, after: p.before })), false).data;
  const ops = diffData(original, after);
  return { ops, recovered, dependencies: operationDependencies(original, ops), independent: pending.filter(p => !recovered.includes(p)) };
}