import { useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { diffData } from '@/lib/diff';
import type { ScenarioData } from '@/lib/engine/types';
import { operationDependencies, type ReviewedOperation } from '@/lib/operationSave';

/** The reviewed payload is frozen on first submission, including generated IDs/timestamps. */
export function useOperationSave() {
  const app = useApp();
  const context = useRef({ scope: `${app.user?.id}:${app.official.orgId}`, org: app.official.orgId, mode: app.active.id });
  const request = useRef<ReviewedOperation | null>(null);
  const mutation = useRef<{before:ScenarioData; after:ScenarioData} | null>(null);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const save = async (before: ScenarioData, after: ScenarioData): Promise<boolean> => {
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
        const ops=diffData(before,after);
        request.current ??= { scope: context.current.scope, orgId: app.official.orgId, requestId: crypto.randomUUID(), ops, dependencies:operationDependencies(before,ops) };
        await app.saveOperation(request.current);
      }
      request.current = null; mutation.current = null; return true;
    } catch(e) { setError((e as Error).message); return false; }
    finally { lock.current = false; setSaving(false); }
  };
  return { save, saving, error, retrying: !!request.current,
    saveMutation: async (before: ScenarioData, fn: (d:ScenarioData)=>void) => {
      try { if(request.current?.rejected && !app.pendingOperation) mutation.current=null; if (!mutation.current) { const after=structuredClone(before); fn(after); mutation.current={before,after}; } return await save(mutation.current.before,mutation.current.after); }
      catch(e) { setError((e as Error).message); return false; }
    },
    reset: () => { if (!saving && !app.pendingOperation) { request.current = null; mutation.current = null; setError(''); return true; } return false; } };
}