// Rascunho do fluxo real no IndexedDB (adequado a volumes maiores que o localStorage), por usuário+organização.
const DB = "fluxo-sandrini", STORE = "drafts";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("Armazenamento do navegador indisponível."));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error ?? new Error("Falha ao abrir armazenamento."));
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q.result as T); t.onerror = t.onabort = () => rej(t.error ?? new Error("Falha ao gravar rascunho.")); });
}
export const loadDraft = <T,>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key));
export const saveDraftLocal = (key: string, v: unknown) => tx<void>("readwrite", (s) => s.put(v, key));
export const clearDraftLocal = (key: string) => tx<void>("readwrite", (s) => s.delete(key));
/** All stored keys (used to enumerate per-request operation packets of one scope). */
export const listDraftKeys = () => tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((k) => k.map(String));
