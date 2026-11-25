// Granular persistence adapter — NOT wired to production. Talks to the fin_* schema in db/granular/001_schema.sql
// using the same per-record Change protocol as commitOps. Tested only against an isolated database.
import type { Change } from '../diff';
import { applyOps } from '../diff';
import type { ScenarioData } from '../engine/types';
import { payloadIdentity } from '../operationQueue';

export type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
export interface GranularResult { status: 'committed' | 'conflict'; seq?: number; applied?: { entity: string; id: string; version: number }[]; conflicts?: { entity: string; id: string; server: unknown; dependency?: boolean }[]; replayed?: boolean }
export interface Dependency { entity: string; id: string; data: unknown }

export const ENTITY_TABLE: Record<string, string> = {
  'Fornecedor': 'fin_suppliers', 'Categoria': 'fin_categories', 'Previsão (planejada)': 'fin_planned', 'Efetivado (compra/pedido)': 'fin_committed',
  'Despesa': 'fin_expenses', 'Efetivação': 'fin_effectivations', 'Pagamento (baixa)': 'fin_payments', 'Recebimento': 'fin_receipts',
  'Conta bancária': 'fin_bank_accounts', 'Cartão': 'fin_cards', 'Operação no cartão': 'fin_card_ops', 'Transferência': 'fin_transfers',
  'Ajuste de saldo': 'fin_adjustments', 'Registro de importação': 'fin_import_log', 'Meta de faturamento': 'fin_targets',
  'Configuração financeira mensal': 'fin_target_configs', 'Parâmetros': 'fin_params', 'Plataformas': 'fin_platforms',
};

/** SHA-256 of the canonical payload identity: same requestId with different content is refused by fin_commit. */
export async function granularDigest(ops: Change[]): Promise<string> {
  const bytes = new TextEncoder().encode(payloadIdentity(ops));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function commitGranular(q: Query, a: { orgId: string; actor: string; email: string; requestId: string; ops: Change[]; dependencies?: Dependency[] }): Promise<GranularResult> {
  const digest = await granularDigest(a.ops);
  const deps = (a.dependencies ?? []).filter((d) => ENTITY_TABLE[d.entity]); // composite reads (e.g. bank opening transition) stay checked in the app layer
  const rows = await q<{ r: GranularResult }>('SELECT public.fin_commit($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) AS r', [a.orgId, a.actor, a.email, a.requestId, digest, JSON.stringify(a.ops), JSON.stringify(deps)]);
  return rows[0]!.r;
}

/** Rows changed after `since` (tombstones included), turned into Changes that a cached client document applies. */
export async function readDelta(q: Query, orgId: string, since: number): Promise<{ seq: number; ops: Change[] }> {
  let seq = since; const ops: Change[] = [];
  for (const [entity, table] of Object.entries(ENTITY_TABLE)) {
    const rows = await q<{ id: string; body: unknown; changed_seq: string | number }>(`SELECT id, body, changed_seq FROM public.${table} WHERE org_id=$1 AND changed_seq>$2 ORDER BY ord, changed_seq`, [orgId, since]);
    for (const r of rows) {
      seq = Math.max(seq, Number(r.changed_seq));
      if (entity === 'Parâmetros') ops.push({ entity, id: 'params', kind: 'alteração', before: null, after: { [r.id]: r.body }, fields: [r.id] });
      else ops.push({ entity, id: r.id, kind: r.body == null ? 'exclusão' : 'alteração', before: null, after: r.body ?? null, fields: [] });
    }
  }
  return { seq, ops };
}
/** Applies a delta unconditionally (server state is authoritative) with structural sharing. */
export const applyDelta = (d: ScenarioData, ops: Change[]): ScenarioData => applyOps(d, ops, false).data;
