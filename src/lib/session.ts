import type { ScenarioData } from "./engine/types";

// Escopo de trabalho: USUÁRIO + ORGANIZAÇÃO (única base operacional). Rascunho e simulações nunca cruzam escopos.
export function scopeKey(userId: string | null | undefined, orgId: string | null | undefined): string | null {
  return userId && orgId ? `oficial:${userId}:${orgId}` : null;
}

// Rascunho com SNAPSHOT da versão da base no primeiro edit: refetch posterior não muda expectedVersion.
export interface DraftSession { scope: string; baseVersion: number; requestId: string; data: ScenarioData }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export function editSession(cur: DraftSession | null, scope: string, base: ScenarioData, baseVersion: number, fn: (d: ScenarioData) => void, newRequestId: () => string): DraftSession {
  const same = cur && cur.scope === scope ? cur : null;
  const next = clone(same ? same.data : base);
  fn(next);
  return same ? { ...same, data: next } : { scope, baseVersion, requestId: newRequestId(), data: next };
}
export const visibleDraft = (cur: DraftSession | null, scope: string | null) => (cur && scope && cur.scope === scope ? cur : null);
export const baseMovedSince = (s: DraftSession | null, currentVersion: number) => !!s && s.baseVersion !== currentVersion;

// Simulações persistidas no navegador por escopo; versão antiga (v2) tinha "oficial" sem dono → descartada por segurança.
export interface SimLike { id: string; name: string; createdAt: string; data: ScenarioData; baseVersion: number | null; history?: unknown[]; createdBy?: string }
export type SimStore = Record<string, SimLike[]>;
export function migrateSims(raw: unknown): SimStore {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, SimLike[] | undefined>;
  const out: SimStore = {};
  for (const [k, v] of Object.entries(r)) if (Array.isArray(v) && k.startsWith("oficial:")) out[k] = v.filter((s) => s && typeof s === "object" && typeof s.id === "string" && s.data && typeof s.data === "object"); // simulação corrompida/sem dados é descartada
  return out; // chaves antigas "demo" e "oficial" (sem usuário/org) são descartadas
}
/** Ao sair da conta: remove simulações oficiais do usuário (cópias financeiras não ficam no navegador). */
export function purgeUser(s: SimStore, userId: string): SimStore {
  return Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(`oficial:${userId}:`)));
}
