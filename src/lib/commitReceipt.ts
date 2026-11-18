import { applyOps, type Change } from './diff';
import type { ScenarioData } from './engine/types';

export const NORMALIZATION_REVISION = 1;
export interface CommitReceipt {
  orgId: string; userId: string; requestId: string; fromVersion: number; version: number;
  normalization: number; changesJson: string; digest: string;
}
export async function patchDigest(json: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
/** Only a confirmed, complete canonical transition on the exact cached version is applicable. */
export async function reconcileReceipt(base: ScenarioData, version: number, receipt: CommitReceipt | undefined,
  context: { orgId: string; userId: string; requestId: string }, confirmedVersion: number) {
  if (!receipt || receipt.orgId !== context.orgId || receipt.userId !== context.userId || receipt.requestId !== context.requestId
    || receipt.normalization !== NORMALIZATION_REVISION || receipt.fromVersion !== version
    || receipt.version !== confirmedVersion || receipt.version !== version + 1) return null;
  try {
    if (await patchDigest(receipt.changesJson) !== receipt.digest) return null;
    const ops = JSON.parse(receipt.changesJson) as Change[];
    if (!Array.isArray(ops) || !ops.length) return null;
    const result = applyOps(base, ops, true);
    if (result.conflicts.length || result.applied.length !== ops.length) return null;
    return result.data;
  } catch { return null; }
}