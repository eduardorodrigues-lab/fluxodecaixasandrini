import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoData } from "./demo";
import type { ScenarioData } from "./engine/types";

// PERSISTÊNCIA LOCAL AO NAVEGADOR (localStorage). Sem backend, sem autenticação, sem multiusuário.
// A interface StorageAdapter isola o ponto de troca para um backend autenticado com RLS por organização.
export interface RefVersion { version: number; at: string; note: string; refs: Pick<ScenarioData, "params" | "suppliers" | "categories" | "targets" | "adjustments"> }
export interface Scenario { id: string; name: string; isBase: boolean; createdAt: string; data: ScenarioData; refHistory: RefVersion[] }
export interface ImportEntry { scenarioId: string; entity: string; key: string; hash: string; refId: string; at: string }
export interface AppState { version: 1; scenarios: Scenario[]; activeId: string; importLog: ImportEntry[] }
export interface UiState { view: "vertical" | "horizontal"; start: string; end: string; supplierId: string; group: string }

export interface StorageAdapter { load(): AppState | null; save(s: AppState): void; kind: string }
const KEY = "fluxo-sandrini:v1";
export const localAdapter: StorageAdapter = {
  kind: "local-navegador",
  load: () => { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as AppState) : null; },
  save: (s) => localStorage.setItem(KEY, JSON.stringify(s)),
};

export const uid = () => Math.random().toString(36).slice(2, 10);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export function initialState(): AppState {
  return { version: 1, activeId: "base", importLog: [], scenarios: [{ id: "base", name: "Base (demonstrativa)", isBase: true, createdAt: new Date().toISOString(), data: demoData(), refHistory: [] }] };
}

interface Ctx {
  state: AppState; active: Scenario; base: Scenario; ui: UiState; savedAt: Date | null; storageError: string | null;
  setUi: (p: Partial<UiState>) => void;
  setActive: (id: string) => void;
  update: (fn: (d: ScenarioData) => void) => void;
  createScenario: (name: string) => void;
  restoreScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  saveRefVersion: (note: string) => void;
  restoreRefVersion: (v: number) => void;
  addImportLog: (e: ImportEntry[]) => void;
  resetDemo: () => void;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children, adapter = localAdapter }: { children: ReactNode; adapter?: StorageAdapter }) {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [storageError, setErr] = useState<string | null>(null);
  const [ui, setUiS] = useState<UiState>({ view: "horizontal", start: "2026-10-01", end: "2026-11-30", supplierId: "", group: "" });
  useEffect(() => {
    try { const s = adapter.load(); if (s?.version === 1) setState(s); } catch { setErr("Falha ao ler dados locais."); }
    setHydrated(true);
  }, [adapter]);
  useEffect(() => {
    if (!hydrated) return;
    try { adapter.save(state); setSavedAt(new Date()); setErr(null); } catch { setErr("Não foi possível salvar no navegador."); }
  }, [state, hydrated, adapter]);

  const mut = useCallback((fn: (s: AppState) => void) => setState((s) => { const n = clone(s); fn(n); return n; }), []);
  const active = (state.scenarios.find((s) => s.id === state.activeId) ?? state.scenarios[0])!;
  const base = state.scenarios.find((s) => s.isBase)!;

  const value = useMemo<Ctx>(() => ({
    state, active, base, ui, savedAt, storageError,
    setUi: (p) => setUiS((u) => ({ ...u, ...p })),
    setActive: (id) => mut((s) => { s.activeId = id; }),
    update: (fn) => mut((s) => { const sc = s.scenarios.find((x) => x.id === s.activeId)!; fn(sc.data); }),
    createScenario: (name) => mut((s) => {
      const b = s.scenarios.find((x) => x.isBase)!;
      const id = uid();
      s.scenarios.push({ id, name, isBase: false, createdAt: new Date().toISOString(), data: clone(b.data), refHistory: [] });
      s.activeId = id;
    }),
    restoreScenario: (id) => mut((s) => { const b = s.scenarios.find((x) => x.isBase)!; const sc = s.scenarios.find((x) => x.id === id); if (sc && !sc.isBase) sc.data = clone(b.data); }),
    deleteScenario: (id) => mut((s) => { s.scenarios = s.scenarios.filter((x) => x.id !== id || x.isBase); if (s.activeId === id) s.activeId = "base"; }),
    saveRefVersion: (note) => mut((s) => {
      const sc = s.scenarios.find((x) => x.id === s.activeId)!;
      const { params, suppliers, categories, targets, adjustments } = sc.data;
      sc.refHistory.push({ version: sc.refHistory.length + 1, at: new Date().toISOString(), note, refs: clone({ params, suppliers, categories, targets, adjustments }) });
    }),
    restoreRefVersion: (v) => mut((s) => {
      const sc = s.scenarios.find((x) => x.id === s.activeId)!;
      const rv = sc.refHistory.find((r) => r.version === v);
      if (rv) Object.assign(sc.data, clone(rv.refs));
    }),
    addImportLog: (e) => mut((s) => { s.importLog.push(...e); }),
    resetDemo: () => setState(initialState()),
  }), [state, active, base, ui, savedAt, storageError, mut]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}
