import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { diffData, type Change } from "./diff";
import { normalizeData } from "./engine/actions";
import type { ScenarioData } from "./engine/types";
import { commitOfficial, getOfficial, listAudit } from "./official.functions";
import { listMyOrgs } from "./team.functions";
import { baseMovedSince, editSession, migrateSims, purgeUser, scopeKey, visibleDraft, type DraftSession, type SimStore } from "./session";

// UMA base operacional por organização (login obrigatório, gravação só via servidor com auditoria).
// Sem dados demonstrativos e sem fallback: sem login/erro não há dados financeiros.
// Modo Simulação: cópias locais por usuário+organização, isoladas, sem promoção para a base.
export interface SimEdit { at: string; user: string; changes: Change[] }
export interface Sim { id: string; name: string; createdAt: string; data: ScenarioData; baseVersion: number | null; history?: SimEdit[]; createdBy?: string }
export interface AuditEntry { id: string; at: string; user_email: string | null; version_from: number; version_to: number; summary: string; changes: Change[] }
interface LocalState { v: 4; activeId: string; sims: SimStore }
export interface UiState { view: "vertical" | "horizontal"; start: string; end: string; supplierId: string; group: string }
export type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";
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
  base: Scenario; active: Scenario; sims: Sim[]; ui: UiState;
  setUi: (p: Partial<UiState>) => void; setActive: (id: string) => void;
  canEdit: boolean;
  update: (fn: (d: ScenarioData) => void) => string | null;
  draft: ScenarioData | null; draftBaseVersion: number | null; baseMoved: boolean; changes: Change[]; discardDraft: () => void; commitDraft: () => Promise<void>;
  saveState: SaveState; saveMsg: string; reloadOfficial: () => void;
  createSim: (name: string) => void; discardSim: (id: string) => void; deleteSim: (id: string) => void;
  audit: AuditEntry[];
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<LocalState>(initialLocal);
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [session, setSession] = useState<DraftSession | null>(null);
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
  // Organização explícita: a escolhida (se ainda membro); senão a única ou a própria; nunca arbitrária.
  const selOrg = orgs.find((o) => o.orgId === orgId)?.orgId ?? (orgs.length === 1 ? orgs[0]!.orgId : orgs.find((o) => o.own)?.orgId ?? null);
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
  const sims = (scope ? local.sims[scope] ?? [] : []) as Sim[];
  const cur = visibleDraft(session, scope);
  const draft = cur?.data ?? null;
  const sim = sims.find((s) => s.id === local.activeId) ?? null;
  const emptyBase = useMemo(() => normalizeData({}), []);
  const base: Scenario = { id: "base", name: official.orgName || "Real", isBase: true, data: baseData ?? emptyBase };
  const active: Scenario = sim ? { id: sim.id, name: sim.name, isBase: false, data: sim.data ?? base.data } : { ...base, data: draft ?? base.data };
  const canEdit = !!sim || (official.status === "ready" && official.role !== "viewer");
  const changes = useMemo(() => (draft && baseData ? diffData(baseData, draft) : []), [draft, baseData]);

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
        setSession(editSession(cur, scope, baseData, baseVersion, fn, uuid)); setSaveState("idle"); setSaveMsg("");
      }
      return null;
    } catch (e) { return (e as Error).message; }
  };

  const discardDraft = () => { setSession(null); setSaveState("idle"); setSaveMsg("Rascunho descartado — nada foi gravado."); };

  const commitDraft = async () => {
    if (!draft || !baseData || saveState === "saving") return;
    const semData = draft.receipts.filter((r) => !r.date && (r.general != null || Object.values(r.platforms).some((v) => v != null)));
    if (semData.length) { setSaveState("error"); setSaveMsg(`${semData.length} recebimento(s) com valor e sem data. Informe a data antes de gravar.`); return; }
    const toSave = { ...draft, receipts: draft.receipts.filter((r) => r.date) };
    const sent = draft;
    setSaveState("saving"); setSaveMsg("");
    try {
      // expectedVersion = versão SNAPSHOT do início do rascunho (não a versão recarregada).
      const r = await commitFn({ data: { orgId: selOrg, expectedVersion: cur!.baseVersion, requestId: cur!.requestId, dataJson: JSON.stringify(toSave) } });
      if (r.status === "ok" || r.status === "duplicate" || r.status === "noop") {
        // Edições feitas durante a gravação continuam como nova alteração sobre a versão gravada.
        setSession((s) => (!s || s.data === sent ? null : { ...s, baseVersion: r.version, requestId: uuid() }));
        await qc.invalidateQueries({ queryKey: ["official"] });
        setSaveState("saved");
        setSaveMsg(r.status === "noop" ? "" : `Salvo às ${new Date().toLocaleTimeString("pt-BR")}.`);
      } else if (r.status === "conflict") {
        setSaveState("conflict");
        setSaveMsg(`Conflito: os dados foram alterados por outra pessoa (agora versão ${r.version}; seu rascunho partiu da ${cur!.baseVersion}). Nada foi sobrescrito. Seu rascunho continua aqui; recarregue a base e refaça as alterações.`);
      } else { setSaveState("error"); setSaveMsg("Sem permissão para gravar."); }
    } catch (e) { setSaveState("error"); setSaveMsg(`Falha ao gravar (nada confirmado): ${(e as Error).message}. Tente novamente — o envio é idempotente.`); }
  };

  // Editor: toda alteração passa a valer sozinha (gravação automática com auditoria, sem revisão manual).
  const pendingSemData = !!draft?.receipts.some((r) => !r.date && (r.general != null || Object.values(r.platforms).some((v) => v != null)));
  useEffect(() => {
    if (!draft || saveState === "saving" || saveState === "conflict" || saveState === "error" || pendingSemData) return;
    const t = setTimeout(() => { void commitDraft(); }, 800);
    return () => clearTimeout(t);
  }, [draft, saveState, pendingSemData]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: Ctx = {
    authReady,
    user, signOut: async () => { await qc.cancelQueries(); qc.removeQueries({ queryKey: ["official"] }); setSession(null); if (user) mutLocal((s) => { s.sims = purgeUser(s.sims, user.id); s.activeId = "base"; }); await supabase.auth.signOut(); },
    official, orgs, setOrgId: (id) => { setSession(null); setSaveState("idle"); setSaveMsg(""); setOrgIdS(id); try { localStorage.setItem("fluxo.orgId", id); } catch { /* sem storage */ } mutLocal((s) => { s.activeId = "base"; }); },
    base, active, sims, ui, canEdit,
    setUi: (p) => setUiS((u) => ({ ...u, ...p })),
    setActive: (id) => mutLocal((s) => { s.activeId = id; }),
    update, draft, draftBaseVersion: cur?.baseVersion ?? null, baseMoved: baseMovedSince(cur, official.version), changes, discardDraft, commitDraft, saveState, saveMsg,
    reloadOfficial: () => { setSession(null); setSaveState("idle"); setSaveMsg(""); qc.invalidateQueries({ queryKey: ["official"] }); },
    createSim: (name) => { if (!baseData) return; const id = uid(); if (!scope) return; mutLocal((s) => { (s.sims[scope] ??= []).push({ id, name, createdAt: new Date().toISOString(), createdBy: user?.email ?? "", data: clone(baseData), baseVersion }); s.activeId = id; }); },
    discardSim: (id) => { if (!baseData) return; mutLocal((s) => { const x = scope ? s.sims[scope]?.find((i) => i.id === id) : null; if (x) { x.data = clone(baseData); x.baseVersion = baseVersion; } }); },
    deleteSim: (id) => mutLocal((s) => { if (scope) s.sims[scope] = (s.sims[scope] ?? []).filter((x) => x.id !== id); if (s.activeId === id) s.activeId = "base"; }),
    audit: (auditQ.data ?? []).map((r) => ({ ...r, changes: JSON.parse(r.changesJson) as Change[] })),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}
