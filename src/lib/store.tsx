import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { produce, setAutoFreeze } from "immer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyOps, diffData, mergeOps, opKey, type Change, type Conflict } from "./diff";
import { clearDraftLocal, loadDraft, saveDraftLocal } from "./draftStore";
import { normalizeData } from "./engine/actions";
import type { ScenarioData } from "./engine/types";
import { commitOps, getOfficial, listAudit } from "./official.functions";
import { listMyOrgs } from "./team.functions";
import { pickOrg } from "./team";
import { migrateSims, purgeUser, scopeKey, type SimStore } from "./session";
setAutoFreeze(false);
// Rascunho do fluxo real = lista de alterações (antes/depois por registro); a tela aplica sobre a base atual.
interface OpsSession { scope: string; baseVersion: number; requestId: string; ops: Change[] }

// UMA base operacional por organização (login obrigatório, gravação só via servidor com auditoria).
// Sem dados demonstrativos e sem fallback: sem login/erro não há dados financeiros.
// Modo Simulação: cópias locais por usuário+organização, isoladas, sem promoção para a base.
export interface SimEdit { at: string; user: string; changes: Change[] }
export interface Sim { id: string; name: string; createdAt: string; data: ScenarioData; baseVersion: number | null; history?: SimEdit[]; createdBy?: string; deletedAt?: string; deletedBy?: string }
export interface AuditEntry { id: string; at: string; user_email: string | null; version_from: number; version_to: number; summary: string; changes: Change[] }
interface LocalState { v: 4; activeId: string; sims: SimStore }
export interface UiState { view: "vertical" | "horizontal"; start: string; end: string; supplierId: string; group: string; flowMode: "consolidada" | "etapa" }
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
export interface Scenario { id: string; name: string; isBase: boolean; data: ScenarioData }

const KEY = "fluxo-sandrini:v2"; // mesma chave; conteúdo migrado para v3 (simulações por usuário+org)
export const uid = () => Math.random().toString(36).slice(2, 10);
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const initialLocal = (): LocalState => ({ v: 4, activeId: "base", sims: {} });

// Edição pura de rascunho: nunca altera a base recebida.
export function editDraft(base: ScenarioData, draft: ScenarioData | null, fn: (d: ScenarioData) => void): ScenarioData {
  const next = clone(draft ?? base);
  fn(next);
  return next;
}

interface Ctx {
  authReady: boolean;
  user: { id: string; email: string } | null; signOut: () => Promise<void>;
  official: { status: "signed_out" | "loading" | "error" | "ready"; orgId: string; orgName: string; role: string; version: number; error: string };
  orgs: { orgId: string; role: string; name: string; own: boolean }[]; setOrgId: (id: string) => void;
  base: Scenario; active: Scenario; sims: Sim[]; allSims: Sim[]; ui: UiState;
  setUi: (p: Partial<UiState>) => void; setActive: (id: string) => void;
  canEdit: boolean;
  update: (fn: (d: ScenarioData) => void) => string | null;
  draft: ScenarioData | null; draftBaseVersion: number | null; baseMoved: boolean; changes: Change[]; discardDraft: () => void; commitDraft: () => Promise<void>;
  saveState: SaveState; saveMsg: string; reloadOfficial: () => void;
  conflicts: Conflict[]; resolveConflict: (c: Conflict, keep: "mine" | "server") => void; protectErr: string;
  createSim: (name: string) => void; discardSim: (id: string) => void; deleteSim: (id: string) => void;
  audit: AuditEntry[];
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<LocalState>(initialLocal);
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [session, setSession] = useState<OpsSession | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [protectErr, setProtectErr] = useState("");
  const inflight = useRef(false);
  const restored = useRef(new Set<string>());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [ui, setUiS] = useState<UiState>({ view: "horizontal", start: "2026-10-01", end: "2026-11-30", supplierId: "", group: "", flowMode: "consolidada" });
  const qc = useQueryClient();
  const fetchOfficial = useServerFn(getOfficial);
  const fetchAudit = useServerFn(listAudit);
  const commitFn = useServerFn(commitOps);
  const fetchOrgs = useServerFn(listMyOrgs);
  const [orgId, setOrgIdS] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as LocalState;
        // Versões antigas tinham espaço "demo": dados demonstrativos e simulações demo são descartados.
        const sims = migrateSims(s.sims);
        for (const k of Object.keys(sims)) sims[k] = sims[k]!.map((x) => ({ ...x, data: normalizeData(x.data) }));
        setLocal({ v: 4, sims, activeId: "base" });
      }
    } catch { /* ignora dados locais corrompidos */ }
    try { setOrgIdS(localStorage.getItem("fluxo.orgId")); } catch { /* sem storage */ }
    setHydrated(true);
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id, email: data.user.email ?? "" } : null)).catch(() => setUser(null)).finally(() => setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev !== "SIGNED_IN" && ev !== "SIGNED_OUT" && ev !== "USER_UPDATED") return;
      const nu = session?.user ? { id: session.user.id, email: session.user.email ?? "" } : null;
      setUser((prev) => {
        // Troca de conta: nenhum cache oficial, rascunho ou simulação do usuário anterior é reutilizado.
        if (prev?.id !== nu?.id) { qc.removeQueries({ queryKey: ["official"] }); setSession(null); if (prev) setLocal((l) => ({ ...l, sims: purgeUser(l.sims, prev.id), activeId: "base" })); }
        return nu;
      });
      if (ev !== "SIGNED_OUT") qc.invalidateQueries({ queryKey: ["official"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);
  useEffect(() => { if (hydrated) try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* cota */ } }, [local, hydrated]);

  const orgsQ = useQuery({ queryKey: ["official", "orgs", user?.id], queryFn: () => fetchOrgs(), enabled: hydrated && !!user });
  const orgs = orgsQ.data ?? [];
  const resolvedOrg = pickOrg(orgs.map((o) => ({ org_id: o.orgId, created_by: o.own ? user?.id ?? null : null })), user?.id ?? "", orgId);
  const selOrg = resolvedOrg && resolvedOrg !== "choose" ? resolvedOrg.org_id : null;
  const offQ = useQuery({ queryKey: ["official", user?.id, selOrg], queryFn: () => fetchOfficial({ data: { orgId: selOrg } }), enabled: hydrated && !!user && !!selOrg, staleTime: 30_000, refetchOnWindowFocus: false });
  const auditQ = useQuery({ queryKey: ["official", "audit", user?.id, selOrg], queryFn: () => fetchAudit({ data: { orgId: selOrg } }), enabled: hydrated && !!user && !!selOrg });
  const offData = useMemo(() => (offQ.data ? normalizeData(JSON.parse(offQ.data.dataJson)) : null), [offQ.data]);

  const official: Ctx["official"] = !user ? { status: "signed_out", orgId: "", orgName: "", role: "", version: -1, error: "" }
    : offQ.isError ? { status: "error", orgId: "", orgName: "", role: "", version: -1, error: (offQ.error as Error).message }
    : orgsQ.isSuccess && !selOrg ? { status: "error", orgId: "", orgName: "", role: "", version: -1, error: orgs.length ? "Selecione a organização." : "Usuário sem organização." }
    : !offQ.data ? { status: "loading", orgId: "", orgName: "", role: "", version: -1, error: "" }
    : { status: "ready", orgId: offQ.data.orgId, orgName: offQ.data.orgName, role: offQ.data.role, version: offQ.data.version, error: "" };

  const baseData: ScenarioData | null = user ? offData : null; // nunca dados financeiros sem login
  const baseVersion = official.version;
  const scope = scopeKey(user?.id, offQ.data?.orgId ?? null);
  const allSims = (scope ? local.sims[scope] ?? [] : []) as Sim[];
  const sims = allSims.filter((s) => !s.deletedAt);
  const cur = session && scope && session.scope === scope ? session : null;
  const draft = useMemo(() => (cur?.ops.length && baseData ? applyOps(baseData, cur.ops, false).data : null), [cur, baseData]);
  const sim = sims.find((s) => s.id === local.activeId) ?? null;
  const emptyBase = useMemo(() => normalizeData({}), []);
  const base: Scenario = { id: "base", name: official.orgName || "Real", isBase: true, data: baseData ?? emptyBase };
  const active: Scenario = sim ? { id: sim.id, name: sim.name, isBase: false, data: sim.data ?? base.data } : { ...base, data: draft ?? base.data };
  const canEdit = !!sim || (official.status === "ready" && official.role !== "viewer");
  const changes = cur?.ops ?? [];

  const mutLocal = useCallback((fn: (s: LocalState) => void) => setLocal((s) => { const n = clone(s); fn(n); return n; }), []);

  const update = (fn: (d: ScenarioData) => void): string | null => {
    if (!canEdit) return "Sem permissão de edição (entre com uma conta com papel de edição ou use o modo Simulação).";
    try {
      if (sim) {
        const next = editDraft(sim.data, null, fn);
        const ch = diffData(sim.data, next);
        mutLocal((s) => { const x = scope ? s.sims[scope]?.find((i) => i.id === sim.id) as Sim | undefined : null; if (x) { x.data = next; if (ch.length) (x.history ??= []).unshift({ at: new Date().toISOString(), user: user?.email ?? "", changes: ch }); } });
      } else {
        if (!baseData || !scope) return "Base ainda não carregada.";
        const from = draft ?? baseData;
        const next = produce(from, (x) => { fn(x); }); // copia só o que a edição tocou
        const delta = diffData(from, next);
        if (!delta.length) return null;
        const ops = mergeOps(cur?.ops ?? [], delta);
        setSession(ops.length ? { scope, baseVersion: cur?.baseVersion ?? baseVersion, requestId: uuid(), ops } : null);
        setSaveState(ops.length ? "dirty" : "idle"); setSaveMsg("");
      }
      return null;
    } catch (e) { return (e as Error).message; }
  };

  const discardDraft = () => { setSession(null); setConflicts([]); setSaveState("idle"); setSaveMsg("Alterações descartadas — nada foi gravado."); };

  // Proteção do preenchimento: grava as alterações pendentes no navegador (IndexedDB) por usuário+organização.
  useEffect(() => {
    if (!scope || !restored.current.has(scope)) return;
    const key = "draft:" + scope;
    const t = setTimeout(() => {
      (cur ? saveDraftLocal(key, cur) : clearDraftLocal(key)).then(() => setProtectErr("")).catch((e: Error) => setProtectErr(`O rascunho não pôde ser protegido neste navegador (${e.message}). Salve antes de fechar ou recarregar.`));
    }, 300);
    return () => clearTimeout(t);
  }, [cur, scope]);
  // Recupera rascunho após falha/recarga, aplicando-o sobre a base atual.
  useEffect(() => {
    if (!scope || !baseData || restored.current.has(scope)) return;
    loadDraft<OpsSession>("draft:" + scope).then((v) => {
      restored.current.add(scope);
      if (v?.ops?.length) { setSession((s) => s ?? { ...v, scope }); setSaveState("dirty"); setSaveMsg("Rascunho recuperado — ainda não salvo."); }
    }).catch((e: Error) => { restored.current.add(scope); setProtectErr(`Não foi possível ler o rascunho protegido (${e.message}).`); });
  }, [scope, baseData]);

  const commitDraft = async () => {
    if (!cur || !draft || inflight.current) return; // trava: um envio por vez desta gravação
    const semData = draft.receipts.filter((r) => !r.date && (r.general != null || Object.values(r.platforms).some((v) => v != null)));
    if (semData.length) { setSaveState("error"); setSaveMsg(`${semData.length} recebimento(s) com valor e sem data. Informe a data antes de salvar.`); return; }
    const sent = cur.ops.filter((o) => !(o.entity === "Recebimento" && o.after && !(o.after as { date?: string }).date));
    if (!sent.length) return;
    inflight.current = true; setSaveState("saving"); setSaveMsg("");
    try {
      let r = await commitFn({ data: { orgId: selOrg, requestId: cur.requestId, opsJson: JSON.stringify(sent) } });
      for (let i = 0; r.status === "retry" && i < 3; i++) r = await commitFn({ data: { orgId: selOrg, requestId: cur.requestId, opsJson: JSON.stringify(sent) } });
      if (r.status === "ok" || r.status === "duplicate" || r.status === "noop") {
        const sentAfter = new Map(sent.map((o) => [opKey(o), JSON.stringify(o.after)]));
        setSession((s) => { if (!s) return s; const rest = s.ops.filter((o) => sent.some((x) => opKey(x) === opKey(o)) || o.entity !== "Recebimento").filter((o) => sentAfter.get(opKey(o)) !== JSON.stringify(o.after)); return rest.length ? { ...s, ops: rest, baseVersion: r.version, requestId: uuid() } : null; });
        setConflicts([]);
        await qc.invalidateQueries({ queryKey: ["official"] });
        setSaveState("saved"); setSaveMsg(`Salvo às ${new Date().toLocaleTimeString("pt-BR")}.`);
      } else if (r.status === "conflict") {
        setConflicts(JSON.parse(r.conflictsJson) as Conflict[]);
        setSaveState("conflict"); setSaveMsg("Outra pessoa alterou a mesma informação. Escolha o que manter; suas demais alterações continuam preservadas.");
        void qc.invalidateQueries({ queryKey: ["official"] });
      } else { setSaveState("error"); setSaveMsg("Sem permissão para gravar."); }
    } catch (e) { setSaveState("error"); setSaveMsg(`Falha ao salvar: ${(e as Error).message}. Seu preenchimento está preservado; ao tentar de novo, o sistema confere se já foi gravado.`); }
    finally { inflight.current = false; }
  };
  const resolveConflict = (c: Conflict, keep: "mine" | "server") => {
    const k = opKey(c.change);
    setSession((s) => { if (!s) return s; const ops = keep === "mine" ? s.ops.map((o) => (opKey(o) === k ? { ...o, before: c.server } : o)) : s.ops.filter((o) => opKey(o) !== k); return ops.length ? { ...s, ops, requestId: uuid() } : null; });
    setConflicts((l) => { const n = l.filter((x) => opKey(x.change) !== k); if (!n.length) { setSaveState("dirty"); setSaveMsg("Conflitos resolvidos — clique em Salvar."); } return n; });
  };

  const value: Ctx = {
    authReady,
    user, signOut: async () => { await qc.cancelQueries(); qc.removeQueries({ queryKey: ["official"] }); setSession(null); if (user) mutLocal((s) => { s.sims = purgeUser(s.sims, user.id); s.activeId = "base"; }); await supabase.auth.signOut(); },
    official, orgs, setOrgId: (id) => { setSession(null); setSaveState("idle"); setSaveMsg(""); setOrgIdS(id); try { localStorage.setItem("fluxo.orgId", id); } catch { /* sem storage */ } mutLocal((s) => { s.activeId = "base"; }); },
    base, active, sims, allSims, ui, canEdit,
    setUi: (p) => setUiS((u) => ({ ...u, ...p })),
    setActive: (id) => mutLocal((s) => { s.activeId = id; }),
    update, draft, draftBaseVersion: cur?.baseVersion ?? null, baseMoved: !!cur && cur.baseVersion !== official.version, changes, discardDraft, commitDraft, saveState, saveMsg, conflicts, resolveConflict, protectErr,
    reloadOfficial: () => { qc.invalidateQueries({ queryKey: ["official"] }); },
    createSim: (name) => { if (!baseData) return; const id = uid(); if (!scope) return; mutLocal((s) => { (s.sims[scope] ??= []).push({ id, name, createdAt: new Date().toISOString(), createdBy: user?.email ?? "", data: clone(baseData), baseVersion }); s.activeId = id; }); },
    discardSim: (id) => { if (!baseData) return; mutLocal((s) => { const x = scope ? s.sims[scope]?.find((i) => i.id === id) : null; if (x) { x.data = clone(baseData); x.baseVersion = baseVersion; } }); },
    deleteSim: (id) => mutLocal((s) => { const x = scope ? s.sims[scope]?.find((i) => i.id === id) : null; if (x) { x.deletedAt = new Date().toISOString(); x.deletedBy = user?.email ?? ""; } if (s.activeId === id) s.activeId = "base"; }),
    audit: (auditQ.data ?? []).map((r) => ({ ...r, changes: JSON.parse(r.changesJson) as Change[] })),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}
