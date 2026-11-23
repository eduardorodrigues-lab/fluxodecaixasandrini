import { applyOps, type Conflict } from './diff';
import type { ScenarioData } from './engine/types';
import { operationDependencies, type ReviewedOperation } from './operationSave';

const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)])) : v;

/** A definitively rejected packet (conflict/failed) was certainly NOT written. Rebase the same changes on the
 *  current official version with a new requestId. Same-record edits by others remain conflicts (nothing overwritten);
 *  changed read dependencies are reported so the user confirms explicitly. */
export function prepareRejectedRetry(current: ScenarioData, op: ReviewedOperation, requestId: string): { op: ReviewedOperation; conflicts: Conflict[]; changedDependencies: string[] } {
  const conflicts = applyOps(current, op.ops, true).conflicts;
  const dependencies = operationDependencies(current, op.ops);
  const before = new Map((op.dependencies ?? []).map(d => [`${d.entity}|${d.id}`, JSON.stringify(stable(d.data))]));
  const after = new Map(dependencies.map(d => [`${d.entity}|${d.id}`, JSON.stringify(stable(d.data))]));
  const changed = new Set<string>();
  for (const [k, v] of after) if (op.dependencies && before.get(k) !== v) changed.add(k);
  for (const k of before.keys()) if (!after.has(k)) changed.add(k);
  const next: ReviewedOperation = { scope: op.scope, orgId: op.orgId, requestId, ops: op.ops, dependencies, ...(op.recoveredPending ? { recoveredPending: op.recoveredPending } : {}) };
  return { op: next, conflicts, changedDependencies: [...changed].map(k => k.replace('|', ' ')) };
}
