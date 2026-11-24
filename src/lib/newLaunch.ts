import type { ScenarioData } from './engine/types';
import { applyNote, type NoteDraft } from './notas';

/** Stable creation identity survives a recovered inclusion form and a lost ACK. */
export function savedNewLaunch(d: ScenarioData, creationId: string) {
  const planned = d.planned.find(p => p.id === creationId);
  if (planned) return { kind: 'planned' as const, id: planned.id };
  const committed = d.committed.find(c => c.noteId === creationId);
  return committed ? { kind: 'committed' as const, id: committed.id } : null;
}

export function requiresLaunchReview(d: ScenarioData, n: NoteDraft, creationId: string) {
  return !!n.plannedId || !!savedNewLaunch(d, creationId);
}

/** Existing creations are never overwritten or duplicated, irrespective of the window title. */
export function applyNewLaunch(d: ScenarioData, n: NoteDraft, creationId: string, at: string) {
  if (!creationId || savedNewLaunch(d, creationId)) throw new Error('Este lançamento já foi gravado. Abra Gerenciar lançamento para revisar alterações.');
  let index = 0;
  applyNote(d, n, { id: () => index++ === 0 ? creationId : `${creationId}-parcela-${index - 1}`, at });
}