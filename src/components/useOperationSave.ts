import { useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { diffData } from '@/lib/diff';
import type { ScenarioData } from '@/lib/engine/types';
import { operationDependencies, type ReviewedOperation } from '@/lib/operationSave';
import { supplierOperation } from '@/lib/supplierOperation';
import { askConfirm } from '@/lib/decisions';
import { produce } from 'immer';
import { measureSavePhase } from '@/lib/saveTiming';

/** The reviewed payload is frozen on first submission, including generated IDs/timestamps. */
export function useOperationSave() {
  const app = useApp();
  const context = useRef({ scope: `${app.user?.id}:${app.official.orgId}`, org: app.official.orgId, mode: app.active.id });
  const request = useRef<ReviewedOperation | null>(null);
  const mutation = useRef<{before:ScenarioData; after:ScenarioData} | null>(null);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const save = async (before: ScenarioData, after: ScenarioData, supplierIds: string[] = []): Promise<boolean> => {
    if (lock.current) return false;
    if (context.current.org !== app.official.orgId || context.current.mode !== app.active.id || context.current.scope !== `${app.user?.id}:${app.official.orgId}`) { setError('Organização, conta ou modo mudou. Volte ao contexto original; preenchimento preservado.'); return false; }
    lock.current = true; setSaving(true); setError('');
    if(request.current?.rejected && !app.pendingOperation) request.current=null;
    try {
      if (!app.active.isBase) {
        const ops = diffData(before, after);
        const e = app.saveSimulationOperation(before, ops);
        if (e) throw new Error(e);
      } else {
        if (!request.current) {
          const started=performance.now();
          const prepared=supplierOperation(before,after,app.changes,supplierIds);
          measureSavePhase('prepare',started);
          if(prepared.recovered.length && !await askConfirm(`Esta operação inclui somente o fornecedor e suas condições necessários: ${prepared.recovered.map(p=>{const s=after.suppliers.find(s=>s.id===p.id);return s?.name ?? p.id;}).join('; ')}. Outras pendências permanecem separadas. Valores e datas do lançamento não serão gerados novamente.`,{title:'Revisar cadastros necessários',action:'Confirmar cadastros e operação'})) return false;
          request.current = { scope: context.current.scope, orgId: app.official.orgId, requestId: crypto.randomUUID(), ops:prepared.ops, recoveredPending:prepared.recovered, dependencies:prepared.dependencies };
        }
        await app.saveOperation(request.current);
      }
      request.current = null; mutation.current = null; return true;
    } catch(e) { setError((e as Error).message); return false; }
    finally { lock.current = false; setSaving(false); }
  };
  return { save, saving, error, retrying: !!request.current,
    saveMutation: async (before: ScenarioData, fn: (d:ScenarioData)=>void, supplierIds: string[] = []) => {
      try { if(request.current?.rejected && !app.pendingOperation) mutation.current=null; if (!mutation.current) { const after=produce(before,fn); mutation.current={before,after}; } return await save(mutation.current.before,mutation.current.after,supplierIds); }
      catch(e) { setError((e as Error).message); return false; }
    },
    reset: () => { if (!saving && !app.pendingOperation) { request.current = null; mutation.current = null; setError(''); return true; } return false; } };
}