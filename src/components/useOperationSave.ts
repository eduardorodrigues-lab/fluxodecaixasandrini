import { useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { diffData } from '@/lib/diff';
import type { ScenarioData } from '@/lib/engine/types';
import { type ReviewedOperation } from '@/lib/operationSave';
import { supplierOperation } from '@/lib/supplierOperation';
import { askConfirm } from '@/lib/decisions';
import { produce } from 'immer';
import { measureSavePhase } from '@/lib/saveTiming';
import { confirmationAction } from '@/lib/saveRecovery';

/** The reviewed payload is frozen on first submission, including generated IDs/timestamps. */
export function useOperationSave() {
  const app = useApp();
  const context = useRef({ scope: `${app.user?.id}:${app.official.orgId}`, org: app.official.orgId, mode: app.active.id });
  const request = useRef<ReviewedOperation | null>(null);
  const mutation = useRef<{before:ScenarioData; after:ScenarioData} | null>(null);
  const lock = useRef(false);
  // Only this form's own captured packet matters; other pending packets never block or relabel this form.
  const own = (app.pendingOperations ?? []).find(o => o.requestId === request.current?.requestId) ?? null;
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const save = async (before: ScenarioData, after: ScenarioData, supplierIds: string[] = [], reviewed?: ReturnType<typeof supplierOperation>, directInclusion = false): Promise<boolean> => {
    if (lock.current) return false;
    if (context.current.org !== app.official.orgId || context.current.mode !== app.active.id || context.current.scope !== `${app.user?.id}:${app.official.orgId}`) { setError('Organização, conta ou modo mudou. Volte ao contexto original; preenchimento preservado.'); return false; }
    lock.current = true; setSaving(true); setError('');
    if(request.current?.rejected && !own) request.current=null;
    try {
      if (!app.active.isBase) {
        const ops = diffData(before, after);
        const e = app.saveSimulationOperation(before, ops);
        if (e) throw new Error(e);
      } else {
        if (!request.current) {
          const started=performance.now();
          const prepared=reviewed ?? supplierOperation(before,after,app.changes,supplierIds);
          measureSavePhase('prepare',started);
          if(!directInclusion && !reviewed && prepared.recovered.length && !await askConfirm(`Esta operação inclui somente o fornecedor e suas condições necessários: ${prepared.recovered.map(p=>{const s=after.suppliers.find(s=>s.id===p.id);return s?.name ?? "Fornecedor não identificado";}).join('; ')}. Outras pendências permanecem separadas. Valores e datas do lançamento não serão gerados novamente.`,{title:'Revisar cadastros necessários',action:'Confirmar cadastros e operação'})) return false;
          request.current = { scope: context.current.scope, orgId: app.official.orgId, requestId: crypto.randomUUID(), ops:prepared.ops, recoveredPending:prepared.recovered, dependencies:prepared.dependencies };
        }
        await app.saveOperation(request.current);
      }
      request.current = null; mutation.current = null; return true;
    } catch(e) {
      // Server ACK verified (only the screen refresh failed): the data IS saved. Report success so the form clears its
      // local draft and closes; the recovery strip keeps "atualização da tela pendente" without offering a resend.
      if (request.current?.confirmation) { request.current = null; mutation.current = null; setError(''); return true; }
      // Rejected BEFORE capture (validation, isolation, context, lock): nothing was protected or sent,
      // so the next confirmation must re-prepare from the current form instead of a stale frozen payload.
      if (request.current && !request.current.phase && !request.current.submittedAt && !request.current.confirmation) { request.current = null; mutation.current = null; }
      setError((e as Error).message); return false;
    }
    finally { lock.current = false; setSaving(false); }
  };
  return { save, saving, error, retrying: !!request.current, protected: saving || !!own,
    saveLabel: confirmationAction(saving, own?.phase, !!request.current?.submittedAt),
    saveMutation: async (before: ScenarioData, fn: (d:ScenarioData)=>void, supplierIds: string[] = [], directInclusion = false) => {
      try { if(request.current?.rejected && !own) mutation.current=null; if (!mutation.current || !request.current) { const after=produce(before,(draft)=>{ fn(draft); }); /* producers never return a value: helpers like applyBulk return reports */ mutation.current={before,after}; } /* frozen only once captured */ return await save(mutation.current.before,mutation.current.after,supplierIds,undefined,directInclusion); }
      catch(e) { setError((e as Error).message); return false; }
    },
    reset: () => { if (!saving && !own) { request.current = null; mutation.current = null; setError(''); return true; } return false; } };
}