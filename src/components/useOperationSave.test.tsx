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
    const send=vi.fn(async op=>{op.confirmation={status:'ok',version:2};op.phase='confirmed';state.app['pendingOperation']=op;throw new Error('Atualização pendente');});
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