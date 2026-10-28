import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { demoData } from "./demo";
import { diffData, summarize, type Change } from "./diff";
import { normalizeData } from "./engine/actions";
import type { ScenarioData } from "./engine/types";
import { commitOfficial, getOfficial, listAudit } from "./official.functions";
import { listMyOrgs } from "./team.functions";

// DOIS ESPAÇOS SEPARADOS:
//  - "oficial": base compartilhada na Lovable Cloud (login obrigatório, isolada por organização, gravação só via servidor com auditoria).
//  - "demo": dados DEMONSTRATIVOS gravados apenas neste navegador (nunca enviados como oficiais).
// Simulações: sempre locais ao navegador, isoladas, sem promoção para a base.
export type Mode = "demo" | "oficial";
export interface Sim { id: string; name: string; createdAt: string; data: ScenarioData; baseVersion: number | null }
export interface AuditEntry { id: string; at: string; user_email: string | null; version_from: number; version_to: number; summary: string; changes: Change[] }
interface LocalState { v: 2; mode: Mode; activeId: string; demo: { data: ScenarioData; version: number; audit: AuditEntry[] }; sims: Record<Mode, Sim[]> }
export interface UiState { view: "vertical" | "horizontal"; start: string; end: string; supplierId: string; group: string }
export type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";
export interface Scenario { id: string; name: string; isBase: boolean; data: ScenarioData }

const KEY = "fluxo-sandrini:v2";
export const uid = () => Math.random().toString(36).slice(2, 10);
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const initialLocal = (): LocalState => ({ v: 2, mode: "demo", activeId: "base", demo: { data: demoData(), version: 0, audit: [] }, sims: { demo: [], oficial: [] } });

// Edição pura de rascunho: nunca altera a base recebida.
export function editDraft(base: ScenarioData, draft: ScenarioData | null, fn: (d: ScenarioData) => void): ScenarioData {
  const next = clone(draft ?? base);
  fn(next);
  return next;
}

interface Ctx {
  mode: Mode; setMode: (m: Mode) => void;
  user: { id: string; email: string } | null; signOut: () => Promise<void>;
  official: { status: "signed_out" | "loading" | "error" | "ready"; orgId: string; orgName: string; role: string; version: number; error: string };
  orgs: { orgId: string; role: string; name: string; own: boolean }[]; setOrgId: (id: string) => void;
  base: Scenario; active: Scenario; sims: Sim[]; ui: UiState;
  setUi: (p: Partial<UiState>) => void; setActive: (id: string) => void;
  canEdit: boolean;
  update: (fn: (d: ScenarioData) => void) => string | null;
  draft: ScenarioData | null; changes: Change[]; discardDraft: () => void; commitDraft: () => Promise<void>;
  saveState: SaveState; saveMsg: string; reloadOfficial: () => void;
  createSim: (name: string) => void; discardSim: (id: string) => void; deleteSim: (id: string) => void;
  audit: AuditEntry[];
  resetDemo: () => void;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<LocalState>(initialLocal);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [draft, setDraft] = useState<ScenarioData | null>(null);
  const [requestId, setRequestId] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [ui, setUiS] = useState<UiState>({ view: "horizontal", start: "2026-10-01", end: "2026-11-30", supplierId: "", group: "" });
  const qc = useQueryClient();
  const fetchOfficial = useServerFn(getOfficial);
  const fetchAudit = useServerFn(listAudit);
  const commitFn = useServerFn(commitOfficial);
  const fetchOrgs = useServerFn(listMyOrgs);
  const [orgId, setOrgIdS] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as LocalState;
        if (s.v === 2) setLocal({ ...s, demo: { ...s.demo, data: normalizeData(s.demo.data) }, sims: { demo: (s.sims?.demo ?? []).map((x) => ({ ...x, data: normalizeData(x.data) })), oficial: (s.sims?.oficial ?? []).map((x) => ({ ...x, data: normalizeData(x.data) })) } });
      }
    } catch { /* ignora dados locais corrompidos */ }
    try { setOrgIdS(localStorage.getItem("fluxo.orgId")); } catch { /* sem storage */ }
    setHydrated(true);
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id, email: data.user.email ?? "" } : null));
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev !== "SIGNED_IN" && ev !== "SIGNED_OUT" && ev !== "USER_UPDATED") return;
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? "" } : null);
      if (ev === "SIGNED_OUT") qc.removeQueries({ queryKey: ["official"] });
      else qc.invalidateQueries({ queryKey: ["official"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);
  useEffect(() => { if (hydrated) try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* cota */ } }, [local, hydrated]);

  const mode = local.mode;
  const orgsQ = useQuery({ queryKey: ["official", "orgs", user?.id], queryFn: () => fetchOrgs(), enabled: hydrated && mode === "oficial" && !!user });
  const orgs = orgsQ.data ?? [];
  // Organização explícita: a escolhida (se ainda membro); senão a única ou a própria; nunca arbitrária.
  const selOrg = orgs.find((o) => o.orgId === orgId)?.orgId ?? (orgs.length === 1 ? orgs[0]!.orgId : orgs.find((o) => o.own)?.orgId ?? null);
  const offQ = useQuery({ queryKey: ["official", user?.id, selOrg], queryFn: () => fetchOfficial({ data: { orgId: selOrg } }), enabled: hydrated && mode === "oficial" && !!user && !!selOrg, staleTime: 30_000, refetchOnWindowFocus: false });
  const auditQ = useQuery({ queryKey: ["official", "audit", user?.id, selOrg], queryFn: () => fetchAudit({ data: { orgId: selOrg } }), enabled: hydrated && mode === "oficial" && !!user && !!selOrg });
  const offData = useMemo(() => (offQ.data ? normalizeData(JSON.parse(offQ.data.dataJson)) : null), [offQ.data]);

  const official: Ctx["official"] = !user ? { status: "signed_out", orgId: "", orgName: "", role: "", version: -1, error: "" }
    : offQ.isError ? { status: "error", orgId: "", orgName: "", role: "", version: -1, error: (offQ.error as Error).message }
    : orgsQ.isSuccess && !selOrg ? { status: "error", orgId: "", orgName: "", role: "", version: -1, error: orgs.length ? "Selecione a organização." : "Usuário sem organização." }
    : !offQ.data ? { status: "loading", orgId: "", orgName: "", role: "", version: -1, error: "" }
    : { status: "ready", orgId: offQ.data.orgId, orgName: offQ.data.orgName, role: offQ.data.role, version: offQ.data.version, error: "" };

  const baseData: ScenarioData | null = mode === "demo" ? local.demo.data : offData;
  const baseVersion = mode === "demo" ? local.demo.version : official.version;
  const sims = local.sims[mode];
  const sim = sims.find((s) => s.id === local.activeId) ?? null;
  const emptyBase = useMemo(() => normalizeData({}), []);
  const base: Scenario = { id: "base", name: mode === "demo" ? "Base DEMONSTRATIVA" : `Base OFICIAL${official.orgName ? " · " + official.orgName : ""}`, isBase: true, data: baseData ?? emptyBase };
  const active: Scenario = sim ? { id: sim.id, name: sim.name, isBase: false, data: sim.data } : { ...base, data: draft ?? base.data };
  const canEdit = !!sim || (mode === "demo" ? true : official.status === "ready" && official.role !== "viewer");
  const changes = useMemo(() => (draft && baseData ? diffData(baseData, draft) : []), [draft, baseData]);

  const mutLocal = useCallback((fn: (s: LocalState) => void) => setLocal((s) => { const n = clone(s); fn(n); return n; }), []);

  const update = (fn: (d: ScenarioData) => void): string | null => {
    if (!canEdit) return "Sem permissão de edição (faça login na base oficial ou use simulação/demo).";
    try {
      if (sim) {
        const next = editDraft(sim.data, null, fn);
        mutLocal((s) => { const x = s.sims[mode].find((i) => i.id === sim.id); if (x) x.data = next; });
      } else {
        if (!baseData) return "Base ainda não carregada.";
        const next = editDraft(baseData, draft, fn);
        if (!draft) setRequestId(uuid());
        setDraft(next); setSaveState("idle"); setSaveMsg("");
      }
      return null;
    } catch (e) { return (e as Error).message; }
  };

  const discardDraft = () => { setDraft(null); setRequestId(""); setSaveState("idle"); setSaveMsg("Rascunho descartado — nada foi gravado."); };

  const commitDraft = async () => {
    if (!draft || !baseData || saveState === "saving") return;
    setSaveState("saving"); setSaveMsg("");
    if (mode === "demo") {
      const ch = diffData(baseData, draft);
      mutLocal((s) => {
        s.demo.audit.unshift({ id: uuid(), at: new Date().toISOString(), user_email: "demo (navegador)", version_from: s.demo.version, version_to: s.demo.version + 1, summary: summarize(ch), changes: ch });
        s.demo.data = draft; s.demo.version += 1;
      });
      setDraft(null); setRequestId(""); setSaveState("saved"); setSaveMsg("Salvo no espaço DEMO deste navegador (não é a base oficial).");
      return;
    }
    try {
      const r = await commitFn({ data: { orgId: selOrg, expectedVersion: baseVersion, requestId, dataJson: JSON.stringify(draft) } });
      if (r.status === "ok" || r.status === "duplicate" || r.status === "noop") {
        await qc.invalidateQueries({ queryKey: ["official"] });
        setDraft(null); setRequestId(""); setSaveState("saved");
        setSaveMsg(r.status === "noop" ? "Nada a gravar." : `Gravado na base oficial (versão ${r.version}).`);
      } else if (r.status === "conflict") {
        setSaveState("conflict");
        setSaveMsg(`Conflito: a base oficial foi alterada por outra pessoa (agora versão ${r.version}; seu rascunho partiu da ${baseVersion}). Nada foi sobrescrito. Seu rascunho continua aqui; recarregue a base e refaça as alterações.`);
      } else { setSaveState("error"); setSaveMsg("Sem permissão para gravar na base oficial."); }
    } catch (e) { setSaveState("error"); setSaveMsg(`Falha ao gravar (nada confirmado): ${(e as Error).message}. Tente novamente — o envio é idempotente.`); }
  };

  const value: Ctx = {
    mode, setMode: (m) => { setDraft(null); setRequestId(""); setSaveState("idle"); setSaveMsg(""); mutLocal((s) => { s.mode = m; s.activeId = "base"; }); },
    user, signOut: async () => { await qc.cancelQueries(); qc.removeQueries({ queryKey: ["official"] }); setDraft(null); await supabase.auth.signOut(); },
    official, orgs, setOrgId: (id) => { setDraft(null); setRequestId(""); setSaveState("idle"); setSaveMsg(""); setOrgIdS(id); try { localStorage.setItem("fluxo.orgId", id); } catch { /* sem storage */ } mutLocal((s) => { s.sims.oficial = []; s.activeId = "base"; }); },
    official, base, active, sims, ui, canEdit,
    setUi: (p) => setUiS((u) => ({ ...u, ...p })),
    setActive: (id) => mutLocal((s) => { s.activeId = id; }),
    update, draft, changes, discardDraft, commitDraft, saveState, saveMsg,
    reloadOfficial: () => { setDraft(null); setRequestId(""); setSaveState("idle"); setSaveMsg(""); qc.invalidateQueries({ queryKey: ["official"] }); },
    createSim: (name) => { if (!baseData) return; const id = uid(); mutLocal((s) => { s.sims[mode].push({ id, name, createdAt: new Date().toISOString(), data: clone(baseData), baseVersion }); s.activeId = id; }); },
    discardSim: (id) => { if (!baseData) return; mutLocal((s) => { const x = s.sims[mode].find((i) => i.id === id); if (x) { x.data = clone(baseData); x.baseVersion = baseVersion; } }); },
    deleteSim: (id) => mutLocal((s) => { s.sims[mode] = s.sims[mode].filter((x) => x.id !== id); if (s.activeId === id) s.activeId = "base"; }),
    audit: mode === "demo" ? local.demo.audit : (auditQ.data ?? []).map((r) => ({ ...r, changes: JSON.parse(r.changesJson) as Change[] })),
    resetDemo: () => mutLocal((s) => { s.demo = { data: demoData(), version: 0, audit: [] }; s.sims.demo = []; s.activeId = "base"; }),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}
