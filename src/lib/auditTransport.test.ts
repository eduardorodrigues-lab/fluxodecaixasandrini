import { describe, expect, it } from 'vitest';
import { decodeAudit, encodeAudit, type AuditRecord } from './auditTransport';

const record = (id: string): AuditRecord => ({
  id, at: '2026-11-24T13:35:17Z', user_email: null,
  version_from: 188, version_to: 189, summary: 'Substituição · São Paulo',
  changes: [{ entity: 'Despesa', id: '001', kind: 'alteração',
    before: { amount: 0, document: '0001', description: 'ação 🚚' },
    after: { amount: 613636, document: '0001', description: 'ação 🚚' }, fields: ['amount'] }],
});

describe('lossless audit transport', () => {
  it('preserves complete before/after values, zero, IDs, Unicode and versions without mutation', () => {
    const records = [record('first'), record('second')];
    const before = JSON.stringify(records);
    expect(decodeAudit(encodeAudit(records))).toEqual(records);
    expect(JSON.stringify(records)).toBe(before);
  });
  it('preserves empty history', () => {
    expect(decodeAudit(encodeAudit([]))).toEqual([]);
  });
  it('keeps all 200 confirmations and oversized changes below the 32 MiB RPC ceiling', () => {
    const records = Array.from({ length: 200 }, (_, i) => ({ ...record(String(i)),
      changes: [{ entity: 'Despesa', id: String(i), kind: 'alteração', fields: [],
        before: { description: 'Histórico íntegro · '.repeat(6000) },
        after: { description: 'Histórico íntegro · '.repeat(6000) } }],
    }));
    expect(new TextEncoder().encode(JSON.stringify(records)).length).toBeGreaterThan(32 * 1024 * 1024);
    const response = encodeAudit(records);
    expect(JSON.stringify(response).length).toBeLessThan(32 * 1024 * 1024);
    expect(decodeAudit(response)).toEqual(records);
  });
  it('rejects corrupt data rather than reporting empty successful history', () => {
    expect(() => decodeAudit({ encoding: 'gzip-base64', payload: 'broken' })).toThrow();
    expect(() => decodeAudit(encodeAudit([{ ...record('invalid'), changes: null }]))).toThrow('Histórico inválido');
  });
});