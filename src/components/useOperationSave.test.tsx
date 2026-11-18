import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyData } from '@/lib/engine/actions';
import { useOperationSave } from './useOperationSave';

const state = vi.hoisted(() => ({ app: {} as Record<string, unknown> }));
vi.mock('@/lib/store', () => ({ useApp: () => state.app }));

describe('proteção compartilhada da confirmação', () => {
  it('pacote desconhecido bloqueia limpeza; consulta reutiliza ID e captura exatos', async () => {
    const before = emptyData();
    before.suppliers = [{ id: 's', name: 'Antes', terms: [], group: '' }];
    const after = { ...before, suppliers: [{ ...before.suppliers[0], id: 's', name: 'Depois', terms: [], group: '' }] };
    const send = vi.fn(async (op) => {
      op.submittedAt = '2026-11-18T17:55:00Z'; op.phase = 'unknown'; state.app['pendingOperation'] = op;
      throw new Error('Resultado desconhecido');
    });
    state.app = { user: { id: 'u' }, official: { orgId: 'o' }, active: { id: 'base', isBase: true }, changes: [], pendingOperation: null, saveOperation: send };
    const { result, rerender } = renderHook(() => useOperationSave());
    await act(async () => { expect(await result.current.save(before, after)).toBe(false); });
    rerender();
    expect(result.current.protected).toBe(true); expect(result.current.reset()).toBe(false);
    const packet = send.mock.calls[0]?.[0]; const capture = JSON.stringify(packet.ops);
    await act(async () => { await result.current.save(before, { ...after, suppliers: [] }); });
    expect(send.mock.calls[1]?.[0].requestId).toBe(packet.requestId);
    expect(JSON.stringify(send.mock.calls[1]?.[0].ops)).toBe(capture);
  });
});