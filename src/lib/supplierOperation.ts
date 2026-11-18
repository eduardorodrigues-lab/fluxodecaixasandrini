import { diffData, opKey, type Change } from './diff';
import { operationDependencies } from './operationSave';
import type { ScenarioData } from './engine/types';

/** Only supplier records explicitly used/edited by this reviewed operation may be recovered. */
export function supplierOperation(before: ScenarioData, after: ScenarioData, pending: Change[], explicitIds: string[] = []) {
  const delta = diffData(before, after);
  const ids = new Set([...explicitIds,...delta.filter(o=>o.entity==='Fornecedor').map(o=>o.id)]);
  operationDependencies(before, delta).filter(r=>r.entity==='Fornecedor').forEach(r=>ids.add(r.id));
  delta.forEach(o=>{ for (const r of [o.before,o.after]) if(r && typeof r==='object' && 'supplierId' in r && typeof r.supplierId==='string') ids.add(r.supplierId); });
  const recovered = pending.filter(p=>p.entity==='Fornecedor' && ids.has(p.id));
  const original = structuredClone(before);
  for (const p of recovered) {
    original.suppliers = original.suppliers.filter(s=>s.id!==p.id);
    if(p.before) original.suppliers.push(structuredClone(p.before) as ScenarioData['suppliers'][number]);
  }
  const ops = diffData(original, after);
  // Other pending records remain outside the operation, including financial edits created earlier.
  const included = new Set(recovered.map(opKey));
  return {ops, dependencies:operationDependencies(original,ops), recovered, independent:pending.filter(p=>!included.has(opKey(p)))};
}