import { applyOps, diffData, summarize, type Change } from './diff';
import { normalizeData, normalizeTransition } from './engine/actions';
import type { ScenarioData } from './engine/types';
import { dependenciesMatch, type ReviewedOperation } from './operationSave';
import { patchDigest } from './commitReceipt';
import { validateMergeOps } from './manualMerge';

export type PreparedCommit =
  | { status: 'conflict'; conflictsJson: string }
  | { status: 'noop' }
  | { status: 'ready'; next: ScenarioData; applied: Change[]; summary: string; changesJson: string; digest: string };

/** Pure server step of commitOps: same validation for production and fixtures; never touches the database. */
export async function prepareCommit(current: unknown, orgId: string, requestId: string, ops: Change[], dependencies?: ReviewedOperation['dependencies'], actor: string | null = null): Promise<PreparedCommit> {
  const base = normalizeData(current);
  const mergeError = validateMergeOps(base, ops, actor);
  if (mergeError) return { status: 'conflict', conflictsJson: JSON.stringify(ops.slice(0, 1).map(change => ({ change, server: mergeError }))) };
  if (dependencies) {
    if (!Array.isArray(dependencies)) throw new Error('Dependências inválidas.');
    if (!dependenciesMatch(base, { scope: '', orgId, requestId, ops, dependencies })) {
      return { status: 'conflict', conflictsJson: JSON.stringify(ops.map(change => ({ change, server: 'Dependências alteradas (título, pagamentos ou vínculo). Releia e revise.' }))) };
    }
  }
  const r = applyOps(base, ops, true);
  if (r.conflicts.length) return { status: 'conflict', conflictsJson: JSON.stringify(r.conflicts) };
  if (!r.applied.length) return { status: 'noop' };
  const next = normalizeTransition(r.data);
  // Canonical transition includes normalization side effects, not merely the submitted operations.
  const changesJson = JSON.stringify(diffData(base, next));
  return { status: 'ready', next, applied: r.applied, summary: summarize(r.applied), changesJson, digest: await patchDigest(changesJson) };
}

/** A missing confirmation is only a reason to re-read: conflicts/no-ops for an already-audited request are duplicates. */
export function settleAfterRecheck<T extends { status: string }>(result: T, audited: { version_to: number } | null): T | { status: 'duplicate'; version: number; conflictsJson: string } {
  if (audited && ['conflict', 'noop', 'retry'].includes(result.status)) return { status: 'duplicate', version: audited.version_to, conflictsJson: '[]' };
  return result;
}
