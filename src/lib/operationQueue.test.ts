import { describe, expect, it } from 'vitest';
import { blockingOperations, currentValueOf, isUncertain, nextConsultDelay, payloadIdentity, samePayload, scopeOperationKeys, sendableChanges, CONSULT_DELAYS } from './operationQueue';
import { emptyData } from './engine/actions';
import type { Change } from './diff';
import type { ReviewedOperation } from './operationSave';

const ch = (entity: string, id: string, after: unknown, before: unknown = null): Change => ({ entity, id, kind: before == null ? 'inclusão' : 'alteração', before, after, fields: [] });
const op = (requestId: string, ops: Change[], extra: Partial<ReviewedOperation> = {}): ReviewedOperation => ({ scope: 'u:o', orgId: 'o', requestId, ops, ...extra });

describe('registro por operação', () => {
  it('pacote incerto só segura operações no mesmo registro ou dependência', () => {
    const stuck = op('fb872b9f-0000-4000-8000-000000000001', [ch('Recebimento', 'r1', { v: 1 })], { submittedAt: 'x', phase: 'unknown' });
    expect(isUncertain(stuck)).toBe(true);
    expect(blockingOperations(op('n1', [ch('Despesa', 'e1', { v: 2 })]), [stuck])).toEqual([]);
    expect(blockingOperations(op('n2', [ch('Recebimento', 'r1', { v: 3 })]), [stuck])).toHaveLength(1);
    expect(blockingOperations(op('n3', [ch('Despesa', 'e1', { v: 2 })], { dependencies: [{ entity: 'Recebimento', id: 'r1', data: {} as never }] }), [stuck])).toHaveLength(1);
  });
  it('confirmado não bloqueia; recusado definitivo segura o mesmo registro até revisão', () => {
    const done = op('a', [ch('Despesa', 'e1', 1)], { confirmation: { status: 'ok', version: 3 } });
    const rejected = op('b', [ch('Despesa', 'e2', 1)], { rejected: true, phase: 'conflict' });
    expect(blockingOperations(op('c', [ch('Despesa', 'e1', 2)]), [done])).toEqual([]);
    expect(blockingOperations(op('d', [ch('Despesa', 'e2', 2)]), [rejected])).toHaveLength(1);
  });
  it('alterações da sessão: só envia o que não está preso a pacote nem em conflito', () => {
    const pending = [ch('Recebimento', 'r1', 1), ch('Recebimento', 'r2', 1), ch('Meta de faturamento', '2026-12', 5)];
    const out = sendableChanges(pending, [op('x', [ch('Recebimento', 'r1', 0)])], new Set(['Meta de faturamento|2026-12']));
    expect(out.map(c => c.id)).toEqual(['r2']);
  });
  it('chaves por escopo exato (não confunde geração mais longa)', () => {
    const id = '12345678-1234-4234-8234-123456789012';
    expect(scopeOperationKeys('u:o:g5', ['operation:u:o:g5', `operation:u:o:g5:${id}`, `operation:u:o:g50:${id}`, 'draft:u:o:g5', `operation:u:o:g5:abc`])).toEqual(['operation:u:o:g5', `operation:u:o:g5:${id}`]);
  });
  it('consulta automática limitada com espera crescente', () => {
    expect(CONSULT_DELAYS.length).toBe(5);
    expect(nextConsultDelay(0)).toBe(0); expect(nextConsultDelay(4)).toBe(90_000); expect(nextConsultDelay(5)).toBeNull();
  });
});

describe('identidade do pacote', () => {
  const sent = [ch('Despesa', 'e1', { value: 200 }, { value: 150 }), ch('Despesa', 'e2', { id: 'e2', value: 7 }, { id: 'e2', value: 6 })];
  it('mesmo pedido com conteúdo diferente é recusado', () => {
    expect(samePayload([sent[0]!], [ch('Despesa', 'e1', { value: 999 }, { value: 150 })])).toBe(false);
    expect(samePayload([sent[0]!, ch('Despesa', 'e9', 1)], sent)).toBe(false);
  });
  it('alteração ausente da auditoria só é aceita se já era o valor atual (no-op)', () => {
    const d = emptyData(); d.expenses = [{ id: 'e2', value: 7 } as never];
    expect(samePayload([sent[0]!], sent, c => currentValueOf(d, c))).toBe(true);
    d.expenses = [{ id: 'e2', value: 8 } as never];
    expect(samePayload([sent[0]!], sent, c => currentValueOf(d, c))).toBe(false);
  });
  it('identidade independe da ordem e das chaves', () => {
    expect(payloadIdentity([sent[1]!, sent[0]!])).toBe(payloadIdentity(sent));
    expect(payloadIdentity([ch('Despesa', 'e1', { b: 1, a: 2 })])).toBe(payloadIdentity([ch('Despesa', 'e1', { a: 2, b: 1 })]));
  });
});
