import { opKey, type Change } from './diff';
import type { ScenarioData } from './engine/types';
import type { ReviewedOperation } from './operationSave';
import { definitiveRejection } from './recoveryActions';
import { receiptInformed } from './engine/engine';
import type { Receipt } from './engine/types';

/** Per-operation registry helpers: each captured packet is stored under its own requestId, so an uncertain packet
 *  only holds back later work on the SAME records/dependencies. Absence of a confirmation never proves non-write. */
const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, stable((v as Record<string, unknown>)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));

export const operationStorageKey = (scope: string, requestId: string) => `operation:${scope}:${requestId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Keys of this scope only: the legacy single slot and `operation:<scope>:<uuid>` (never a longer generation scope). */
export function scopeOperationKeys(scope: string, keys: string[]): string[] {
  const legacy = `operation:${scope}`;
  return keys.filter(k => k === legacy || (k.startsWith(legacy + ':') && UUID.test(k.slice(legacy.length + 1))));
}

/** Records a packet writes plus the records it reads as dependencies. */
export function operationKeys(op: Pick<ReviewedOperation, 'ops' | 'dependencies'>): Set<string> {
  return new Set([...op.ops.map(opKey), ...(op.dependencies ?? []).map(d => `${d.entity}|${d.id}`)]);
}
/** Still able to have been written: neither confirmed nor certainly rejected. */
export const isUncertain = (op: ReviewedOperation) => !op.confirmation && !definitiveRejection(op);

/** Registered packets that must finish first: same written record, or one writes what the other reads. */
export function blockingOperations(candidate: Pick<ReviewedOperation, 'ops' | 'dependencies' | 'requestId'>, registered: ReviewedOperation[]): ReviewedOperation[] {
  const writes = new Set(candidate.ops.map(opKey)), reads = operationKeys(candidate);
  return registered.filter(op => op.requestId !== candidate.requestId && (isUncertain(op) || definitiveRejection(op)) && (
    op.ops.some(o => reads.has(opKey(o))) || [...operationKeys(op)].some(k => writes.has(k))));
}

/** Session edits that can be sent now: not part of (or overlapping) a registered packet and not in conflict review. */
export function sendableChanges(pending: Change[], registered: ReviewedOperation[], conflictKeys: Set<string>): Change[] {
  const held = new Set(registered.flatMap(op => [...operationKeys(op)]));
  return pending.filter(c => !held.has(opKey(c)) && !conflictKeys.has(opKey(c)));
}

/** Bounded automatic read-only consultations (ms); null = stop and leave the explicit actions. */
export const CONSULT_DELAYS = [0, 4_000, 12_000, 30_000, 90_000] as const;
export const nextConsultDelay = (attempts: number): number | null => attempts < CONSULT_DELAYS.length ? CONSULT_DELAYS[attempts]! : null;

/** Stable identity of a submitted payload (record keys + intended results). */
export function payloadIdentity(ops: Change[]): string {
  return JSON.stringify([...ops].map(o => [opKey(o), o.kind, stable(o.after ?? null)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** Does an audited request correspond to this submission? Every audited change must be one the submission asked for
 *  with the same result; a submitted change missing from the audit is accepted only if the current value already
 *  equals it (it was a no-op at commit time). `current` omitted = strict client-side check of the audited part. */
export function samePayload(audited: Change[], submitted: Change[], current?: (c: Change) => unknown): boolean {
  const byKey = new Map(submitted.map(c => [opKey(c), c]));
  for (const a of audited) { const s = byKey.get(opKey(a)); if (!s || !same(s.after, a.after)) return false; }
  if (!current) return true;
  const auditedKeys = new Set(audited.map(opKey));
  return submitted.every(s => auditedKeys.has(opKey(s)) || same(current(s), s.after));
}

/** Current value of the record addressed by a change (for samePayload on the server). */
export function currentValueOf(d: ScenarioData, c: Change): unknown {
  const col: Record<string, keyof ScenarioData> = { 'Fornecedor': 'suppliers', 'Categoria': 'categories', 'Previsão (planejada)': 'planned', 'Efetivado (compra/pedido)': 'committed', 'Despesa': 'expenses', 'Efetivação': 'effectivations', 'Pagamento (baixa)': 'payments', 'Recebimento': 'receipts', 'Conta bancária': 'bankAccounts', 'Cartão': 'cards', 'Operação no cartão': 'cardOps', 'Transferência': 'transfers', 'Registro de importação': 'importLog' };
  const k = col[c.entity];
  if (k) return ((d[k] ?? []) as unknown as Record<string, unknown>[]).find(x => String(x['id']) === c.id) ?? null;
  if (c.entity === 'Ajuste de saldo') return d.adjustments.find(a => a.date === c.id) ?? null;
  if (c.entity === 'Meta de faturamento') return d.targets?.[c.id] ?? null;
  if (c.entity === 'Configuração financeira mensal') return d.targetConfigs?.[c.id] ?? null;
  if (c.entity === 'Parâmetros') return Object.fromEntries(Object.keys((c.after ?? {}) as object).map(f => [f, (d.params as unknown as Record<string, unknown>)[f]]));
  if (c.entity === 'Plataformas') return d.platforms;
  return undefined;
}

/** Completed edits that are not yet valid to persist stay on screen (marked) instead of being sent. */
export function validationHold(c: Change): string | null {
  if (c.entity === 'Recebimento') { const r = c.after as Receipt | null; if (r && receiptInformed(r).present && !r.date) return 'Recebimento com valor sem data: informe a data para salvar.'; }
  return null;
}
