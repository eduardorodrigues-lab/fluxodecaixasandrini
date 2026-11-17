export interface FormScope { user: string; org: string; mode: string; form: string; record: string }
export interface FormEnvelope<T> { v: 1; revision: string; at: string; value: T }
export const formDraftKey = (s: FormScope) => `fluxo:form:v1:${JSON.stringify([s.user,s.org,s.mode,s.form,s.record])}`;
export function readForm<T>(storage: Pick<Storage,"getItem">, key: string): FormEnvelope<T> | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const data = JSON.parse(raw) as FormEnvelope<T>;
  if (data.v !== 1 || !data.revision || !data.value) throw new Error("Preenchimento local inválido; não foi aplicado.");
  return data;
}
export function writeForm<T>(storage: Pick<Storage,"getItem"|"setItem">, key:string, expected:string|null, value:T): FormEnvelope<T> {
  const old = readForm<T>(storage,key);
  if ((old?.revision ?? null) !== expected) throw new Error("Outra aba alterou este preenchimento local. Esta aba foi preservada; não substitua a outra sem conferência.");
  const next:FormEnvelope<T> = {v:1,revision:crypto.randomUUID(),at:new Date().toISOString(),value};
  storage.setItem(key,JSON.stringify(next));
  return next;
}