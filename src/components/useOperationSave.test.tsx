import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyData } from '@/lib/engine/actions';
import { useOperationSave } from './useOperationSave';

const state = vi.hoisted(() => ({ app: {} as Record<string, unknown> }));
vi.mock('@/lib/store', () => ({ useApp: () => state.app }));

describe('proteção compartilhada da confirmação', () => {
  it('mudança de organização impede envio e mantém preenchimento', async () => {
    const send=vi.fn();const before=emptyData();
    state.app={user:{id:'u'},official:{orgId:'o'},active:{id:'base',isBase:true},changes:[],pendingOperation:null,saveOperation:send};
    const {result,rerender}=renderHook(()=>useOperationSave());
    state.app={...state.app,official:{orgId:'foreign'}};rerender();
    await act(async()=>{expect(await result.current.save(before,before)).toBe(false);});
    expect(send).not.toHaveBeenCalled();
  });
  it('ACK confirmado fecha com sucesso mesmo quando a atualização falha', async () => {
    const before=emptyData(), after={...before,bankAccounts:[]};
    const send=vi.fn(async op=>{op.confirmation={status:'ok',version:2};op.phase='confirmed';state.app['pendingOperation']=op;state.app['pendingOperations']=[op];throw new Error('Atualização pendente');});
    state.app={user:{id:'u'},official:{orgId:'o'},active:{id:'base',isBase:true},changes:[],pendingOperation:null,saveOperation:send};
    const {result}=renderHook(()=>useOperationSave());
    await act(async()=>{expect(await result.current.save(before,after)).toBe(true);});
    expect(send).toHaveBeenCalledTimes(1);expect(result.current.error).toBe('');
  });
  it('pacote desconhecido bloqueia limpeza; consulta reutiliza ID e captura exatos', async () => {
    const before = emptyData();
    before.suppliers = [{ id: 's', name: 'Antes', terms: [], group: '' }];
    const after = { ...before, suppliers: [{ ...before.suppliers[0], id: 's', name: 'Depois', terms: [], group: '' }] };
    const send = vi.fn(async (op) => {
      op.submittedAt = '2026-11-18T17:55:00Z'; op.phase = 'unknown'; state.app['pendingOperation'] = op; state.app['pendingOperations'] = [op];
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
describe('edição em massa pela chamada real (produce/saveMutation)', () => {
  const lot = () => {
    const d = emptyData(); d.params.startDate = '2026-11-01';
    d.categories.push({ id: 'cat', name: 'Mercadoria', kind: 'compra', group: '' }, { id: 'cat2', name: 'Fretes', kind: 'compra', group: '' });
    for (let i = 0; i < 25; i++) d.committed.push({ id: `t${i}`, supplierId: 's', purchaseCode: 'P', document: `NF${i}`, value: 10000 + i, dueDate: '2026-12-01', extensionDate: null, extensionHistory: [], extensionInfo: '', legacyAbatement: null, origin: 'manual', plannedId: null, effectivationId: null, categoryId: 'cat', notes: '', status: 'ativo', condition: null } as never);
    return d;
  };
  it('lote de 22 parcelas gera um único pacote sem erro do Immer e não toca fora da seleção', async () => {
    const { applyBulk, snapshotOf } = await import('@/lib/bulkEdit');
    const d = lot(); const ids = Array.from({ length: 22 }, (_, i) => `t${i}`);
    const items = ids.map(id => ({ kind: 'committed' as const, id, seen: snapshotOf(d, 'committed', id)! }));
    const send = vi.fn(async (op) => { op.confirmation = { status: 'ok', version: 2 }; });
    state.app = { user: { id: 'u' }, official: { orgId: 'o' }, active: { id: 'base', isBase: true }, changes: [], pendingOperation: null, saveOperation: send };
    const { result } = renderHook(() => useOperationSave());
    // Legacy callers returned applyBulk's report from the producer; saveMutation must still accept it.
    await act(async () => { expect(await result.current.saveMutation(d, (x) => applyBulk(x, { items, action: { type: 'extend', date: '2026-12-20' }, reason: 'Lote', at: '2026-11-25T12:00:00Z', by: 'ed' }) as unknown as void)).toBe(true); });
    expect(result.current.error).toBe('');
    const ops = send.mock.calls[0]?.[0].ops as { id: string; after: { extensionDate: string } }[];
    expect(ops).toHaveLength(22);
    expect(ops.every(o => o.after.extensionDate === '2026-12-20')).toBe(true);
    expect(ops.some(o => ['t22', 't23', 't24'].includes(o.id))).toBe(false);
    expect(d.committed[0]?.extensionDate).toBeNull(); // base recebida intacta
  });
  it('item bloqueado aborta o lote inteiro: nada é enviado', async () => {
    const { applyBulk, snapshotOf } = await import('@/lib/bulkEdit');
    const d = lot(); d.payments.push({ id: 'p', titleKind: 'committed', titleId: 't3', amount: 100, date: '2026-11-20', note: '', reversedAt: null, reversalNote: '' } as never);
    const items = ['t1', 't2', 't3'].map(id => ({ kind: 'committed' as const, id, seen: snapshotOf(d, 'committed', id)! }));
    const send = vi.fn();
    state.app = { user: { id: 'u' }, official: { orgId: 'o' }, active: { id: 'base', isBase: true }, changes: [], pendingOperation: null, saveOperation: send };
    const { result } = renderHook(() => useOperationSave());
    await act(async () => { expect(await result.current.saveMutation(d, (x) => { applyBulk(x, { items, action: { type: 'cancel' }, reason: 'Lote', at: '2026-11-25T12:00:00Z', by: 'ed' }); })).toBe(false); });
    expect(send).not.toHaveBeenCalled(); expect(result.current.error).toMatch(/bloqueado/);
  });
});
