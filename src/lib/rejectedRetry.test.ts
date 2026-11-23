import { describe, expect, it } from 'vitest';
import { prepareRejectedRetry } from './rejectedRetry';
import { normalizeData } from './engine/actions';
import { applyOps, diffData } from './diff';
import { operationDependencies } from './operationSave';

const base = () => normalizeData({ expenses: [{ id: 'a', value: 1000, notes: '' }], suppliers: [{ id: 's', name: 'Fornecedor' }] });

describe('nova tentativa após recusa comprovada', () => {
  it('conta bancária salva por outra pessoa não bloqueia o lançamento: novo requestId e mesmas alterações', () => {
    const d = base(); const after = structuredClone(d); const e = after.expenses[0]; if (e) e.notes = 'Letícia';
    const ops = diffData(d, after); const op = { scope: 'u:o', orgId: 'o', requestId: 'old', ops, dependencies: operationDependencies(d, ops), rejected: true, phase: 'conflict' as const };
    const server = structuredClone(d); server.bankAccounts.push({ id: 'nova', name: 'Conta Eduardo' } as never);
    const r = prepareRejectedRetry(server, op, 'new');
    expect(r.conflicts).toEqual([]); expect(r.changedDependencies).toEqual([]);
    expect(r.op.requestId).toBe('new'); expect(r.op.ops).toBe(ops); expect(r.op).not.toHaveProperty('phase');
    const saved = applyOps(server, r.op.ops, true); expect(saved.data.bankAccounts).toHaveLength(1); expect(saved.data.expenses[0]?.notes).toBe('Letícia');
  });
  it('mesmo registro alterado por outra pessoa continua conflito (nada sobrescrito)', () => {
    const d = base(); const after = structuredClone(d); const e = after.expenses[0]; if (e) e.notes = 'minha';
    const ops = diffData(d, after); const server = structuredClone(d); const s = server.expenses[0]; if (s) s.notes = 'outra';
    expect(prepareRejectedRetry(server, { scope: 'u:o', orgId: 'o', requestId: 'old', ops }, 'new').conflicts).toHaveLength(1);
  });
  it('dependência alterada é informada para confirmação explícita', () => {
    const d = base(); const after = structuredClone(d); const e = after.expenses[0]; if (e) { e.supplierId = 's'; }
    const ops = diffData(d, after); const op = { scope: 'u:o', orgId: 'o', requestId: 'old', ops, dependencies: operationDependencies(d, ops) };
    const server = structuredClone(d); const s = server.suppliers[0]; if (s) s.name = 'Renomeado';
    expect(prepareRejectedRetry(server, op, 'new').changedDependencies).toEqual(['Fornecedor s']);
  });
});
