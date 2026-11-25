import { resolveSimulationRedirects } from "./manualMerge";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultFlowPeriod } from "./dates";
import { produce, setAutoFreeze } from "immer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyOps, diffData, mergeOps, opKey, type Change, type Conflict } from "./diff";
import { clearDraftLocal, listDraftKeys, loadDraft, saveDraftLocal } from "./draftStore";
import { normalizeData } from "./engine/actions";
import type { ScenarioData } from "./engine/types";
import { commitOps, getOfficial, listAudit, checkCommitRequest } from "./official.functions";
import { receiptOperation } from './receiptOperation';
import { listMyOrgs } from "./team.functions";
import { pickOrg, SHARED_ORG_ID, canWrite } from "./team";
import { isolateOperation, operationDependencies, rebasePending, sendOperation, type ReviewedOperation } from "./operationSave";
import { blockingOperations, isUncertain, nextConsultDelay, operationStorageKey, samePayload, scopeOperationKeys, sendableChanges, validationHold } from "./operationQueue";
import { generationScope, migrateSims, purgeUser, scopeKey, type SimStore } from "./session";
import { NORMALIZATION_REVISION, reconcileReceipt } from './commitReceipt';
import { bounded, pollConfirmation, confirmSubmission, type OperationPhase } from './saveRecovery';
import { operationReview } from './operationReview';
import { confirmationBlockReason, definitiveRejection } from './recoveryActions';
import { measureSavePhase } from './saveTiming';
import { prepareRejectedRetry } from './rejectedRetry';
import { askConfirm } from './decisions';
import { decodeAudit } from './auditTransport';
import { decodeOfficial, decodeConfirmation, decodeCommit } from './largeJsonTransport';
setAutoFreeze(false);
// Rascunho do fluxo real = lista de alterações (antes/depois por registro); a tela aplica sobre a base atual.
interface OpsSession { scope: string; baseVersion: number; requestId: string; ops: Change[]; legacyRequestIds?: string[] | undefined; submissionModel?: 'reviewed' }

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
  saveOperation: (op: ReviewedOperation) => Promise<void>; saveSimulationOperation: (before: ScenarioData, ops: Change[]) => string | null;
  globalReview: ReviewedOperation | null; closeGlobalReview: () => void; checkPendingOperation: (requestId?: string) => Promise<void>; confirmationChecking: boolean;
  pendingOperation: ReviewedOperation | null; pendingOperations: ReviewedOperation[]; abandonOperation: (requestId?: string) => Promise<void>;
  reconcileReceiptDraft: () => Promise<boolean>;
  prepareReceiptOperation: () => ReturnType<typeof receiptOperation>;
  saveState: SaveState; saveMsg: string; reloadOfficial: () => void;
  conflicts: Conflict[]; resolveConflict: (c: Conflict, keep: "mine" | "server") => void; protectErr: string;
  createSim: (name: string) => void; discardSim: (id: string) => void; deleteSim: (id: string) => void;
  /** Audit is heavy (~18 MB with changes): loaded only while a history screen/panel requests it. */
  auditHistory: AuditHistory; requestAudit: () => () => void;
  resendPendingOperation: (requestId?: string) => Promise<void>;
}
export interface AuditHistory { entries: AuditEntry[]; status: "idle" | "loading" | "ready" | "error"; error: string; refresh: () => void }
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<LocalState>(initialLocal);
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<Ctx["user"]>(null);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const [session, setSessionState] = useState<OpsSession | null>(null);
  const sessionRef = useRef<OpsSession | null>(null);
  const setSession = (value: OpsSession | null | ((s: OpsSession | null) => OpsSession | null)) => {
    const next = typeof value === "function" ? value(sessionRef.current) : value;
    sessionRef.current = next; setSessionState(next);
  };
  // Per-request registry: every captured packet lives under its own requestId (IndexedDB `operation:<scope>:<id>`).
  // An uncertain packet holds back only later work on the same records/dependencies, never independent operations.
  const opsRef = useRef(new Map<string, ReviewedOperation>());
  const [pendingOps, setPendingOps] = useState<ReviewedOperation[]>([]);
  const syncOps = () => setPendingOps([...opsRef.current.values()].map((o) => ({ ...o })));
  const inflightIds = useRef(new Set<string>());
  const checkingIds = useRef(new Set<string>());
  const consultAttempts = useRef(new Map<string, number>());
  const consultTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [globalReview, setGlobalReview] = useState<ReviewedOperation | null>(null);
  const [conflicts, setConflictsS] = useState<Conflict[]>([]);
  const conflictsRef = useRef<Conflict[]>([]);
  const setConflicts = (value: Conflict[] | ((c: Conflict[]) => Conflict[])) => { const next = typeof value === "function" ? value(conflictsRef.current) : value; conflictsRef.current = next; setConflictsS(next); };
  const [protectErr, setProtectErr] = useState("");
  const [confirmationChecking, setConfirmationChecking] = useState(false);
  const restored = useRef(new Set<string>());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [ui, setUiS] = useState<UiState>(() => ({ view: "horizontal", ...defaultFlowPeriod(), supplierId: "", group: "", flowMode: "consolidada" }));
  const qc = useQueryClient();
  const fetchOfficialRpc = useServerFn(getOfficial);
  const fetchOfficial = async (input: Parameters<typeof fetchOfficialRpc>[0]) => decodeOfficial(await fetchOfficialRpc(input));
  const fetchAudit = useServerFn(listAudit);
  const commitRpc = useServerFn(commitOps);
  const commitFn = async (input: Parameters<typeof commitRpc>[0]) => decodeCommit(await commitRpc(input));
  const fetchOrgs = useServerFn(listMyOrgs);
  const checkRequestRpc = useServerFn(checkCommitRequest);
  const checkRequest = async (input: Parameters<typeof checkRequestRpc>[0]) => decodeConfirmation(await checkRequestRpc(input));
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
    supabase.auth.getUser().then(({ data }) => { const u = data.user ? { id: data.user.id, email: data.user.email ?? "" } : null; if (userIdRef.current === undefined) userIdRef.current = u?.id ?? null; setUser(u); }).catch(() => setUser(null)).finally(() => setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev !== "SIGNED_IN" && ev !== "SIGNED_OUT" && ev !== "USER_UPDATED") return;
      const nu = session?.user ? { id: session.user.id, email: session.user.email ?? "" } : null;
      const prevId = userIdRef.current ?? null; userIdRef.current = nu?.id ?? null;
      const switched = prevId !== (nu?.id ?? null);
      // Troca de conta: nenhum cache oficial, rascunho ou simulação do usuário anterior é reutilizado.
      if (switched) { qc.removeQueries({ queryKey: ["official"] }); setSession(null); if (prevId) setLocal((l) => ({ ...l, sims: purgeUser(l.sims, prevId), activeId: "base" })); }
      setUser(nu);
      // SIGNED_IN repeats for the SAME account on load/tab focus: re-downloading the ~12 MB document there doubled load time.
      if (ev === "USER_UPDATED" || (ev === "SIGNED_IN" && switched)) qc.invalidateQueries({ queryKey: ["official"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);
  useEffect(() => { if (hydrated) try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* cota */ } }, [local, hydrated]);

  const orgsQ = useQuery({ queryKey: ["official", "orgs", user?.id], queryFn: () => fetchOrgs(), enabled: hydrated && !!user });
  const orgs = orgsQ.data ?? [];
  const resolvedOrg = pickOrg(orgs.map((o) => ({ org_id: o.orgId, created_by: o.own ? user?.id ?? null : null })), user?.id ?? "", orgId);
  const selOrg = resolvedOrg && resolvedOrg !== "choose" ? resolvedOrg.org_id : null;
  const offQ = useQuery({ queryKey: ["official", user?.id, selOrg], queryFn: () => fetchOfficial({ data: { orgId: selOrg } }), enabled: hydrated && !!user && !!selOrg, staleTime: 30_000, refetchOnWindowFocus: false, structuralSharing: false });
  const [auditDemand, setAuditDemand] = useState(0);
  const requestAudit = useCallback(() => { setAuditDemand(n => n + 1); return () => setAuditDemand(n => Math.max(0, n - 1)); }, []);
  const auditQ = useQuery({ queryKey: ["official", "audit", user?.id, selOrg], queryFn: async () => decodeAudit(await fetchAudit({ data: { orgId: selOrg } })), enabled: hydrated && !!user && !!selOrg && auditDemand > 0, staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  // Decode once in the query: transport errors stay in its retry/error state.
  const auditEntries = auditQ.data ?? [];
  type OfficialCache = Awaited<ReturnType<typeof fetchOfficial>> & { normalizedData?: ScenarioData };
  const offData = useMemo(() => (offQ.data ? (offQ.data as OfficialCache).normalizedData ?? (offQ.data.normalization === NORMALIZATION_REVISION ? JSON.parse(offQ.data.dataJson) as ScenarioData : normalizeData(JSON.parse(offQ.data.dataJson))) : null), [offQ.data]);

  const official: Ctx["official"] = !user ? { status: "signed_out", orgId: "", orgName: "", role: "", version: -1, error: "" }
    : offQ.isError ? { status: "error", orgId: "", orgName: "", role: "", version: -1, error: (offQ.error as Error).message }
    : orgsQ.isError ? { status: "error", orgId: "", orgName: "", role: "", version: -1, error: "Não foi possível conferir seu acesso. Tente novamente." }
    : orgsQ.isSuccess && !selOrg ? { status: "error", orgId: "", orgName: "", role: "", version: -1, error: "Sem acesso ao Grupo Sandrini oficial. Solicite acesso ou convite ao administrador." }
    : !offQ.data ? { status: "loading", orgId: "", orgName: "", role: "", version: -1, error: "" }
    : { status: "ready", orgId: offQ.data.orgId, orgName: offQ.data.orgName, role: offQ.data.role, version: offQ.data.version, error: "" };

  const baseData: ScenarioData | null = user ? offData : null; // nunca dados financeiros sem login
  const baseVersion = official.version;
  const simScope = scopeKey(user?.id, offQ.data?.orgId ?? null);
  const scope = generationScope(simScope, baseData?.params.baseGeneration);
  const allSims = (simScope ? local.sims[simScope] ?? [] : []) as Sim[];
  const sims = allSims.filter((s) => !s.deletedAt);
  const cur = session && scope && session.scope === scope ? session : null;
  const draft = useMemo(() => (cur?.ops.length && baseData ? applyOps(baseData, cur.ops, false).data : null), [cur, baseData]);
  const sim = sims.find((s) => s.id === local.activeId) ?? null;
  const emptyBase = useMemo(() => normalizeData({}), []);
  const base: Scenario = { id: "base", name: official.orgName || "Real", isBase: true, data: baseData ?? emptyBase };
  // Simulações antigas: vínculos de fornecedores incorporados na base oficial desta organização resolvem para o principal (só leitura em memória).
  const simData = useMemo(() => { const x = sim?.data; if (!x || !baseData || !baseData.suppliers.some((s) => s.mergedInto)) return x; return produce(x, (dr) => { resolveSimulationRedirects(dr, baseData); }); }, [sim?.data, baseData]);
  const active: Scenario = sim ? { id: sim.id, name: sim.name, isBase: false, data: simData ?? base.data } : { ...base, data: draft ?? base.data };
  const canEdit = official.status === "ready" && (!!sim || canWrite(official.role));
  const changes = cur?.ops ?? [];

  const mutLocal = useCallback((fn: (s: LocalState) => void) => setLocal((s) => { const n = clone(s); fn(n); return n; }), []);

  const busy = () => inflightIds.current.size > 0;
  const opScope = `${user?.id}:${official.orgId}`;
  const registered = () => [...opsRef.current.values()].filter((o) => o.scope === opScope);
  const storeOp = async (sc: string, op: ReviewedOperation) => { opsRef.current.set(op.requestId, op); syncOps(); await saveDraftLocal(operationStorageKey(sc, op.requestId), op); };
  const dropOp = async (sc: string, requestId: string) => { opsRef.current.delete(requestId); consultAttempts.current.delete(requestId); syncOps(); await clearDraftLocal(operationStorageKey(sc, requestId)); };
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flushSoon = (ms = 300) => { if (flushTimer.current) clearTimeout(flushTimer.current); flushTimer.current = setTimeout(() => { flushTimer.current = null; void flushRef.current(); }, ms); };

  // Real base: a completed edit (cell Enter/blur, inline action) is applied to the visible state immediately and
  // queued for its own confirmed save — no global "Salvar". Rapid edits build on the latest session (ref), not a stale render.
  const update = (fn: (d: ScenarioData) => void): string | null => {
    if (!canEdit) return "Sem permissão de edição (entre com uma conta com papel de edição ou use o modo Simulação).";
    try {
      if (sim) {
        const next = editDraft(sim.data, null, fn);
        const ch = diffData(sim.data, next);
        mutLocal((s) => { const x = simScope ? s.sims[simScope]?.find((i) => i.id === sim.id) as Sim | undefined : null; if (x) { x.data = next; if (ch.length) (x.history ??= []).unshift({ at: new Date().toISOString(), user: user?.email ?? "", changes: ch }); } });
      } else {
        if (!baseData || !scope) return "Base ainda não carregada.";
        const now = sessionRef.current?.scope === scope ? sessionRef.current : null;
        const from = now?.ops.length ? applyOps(baseData, now.ops, false).data : baseData;
        const next = produce(from, (x) => { fn(x); }); // copia só o que a edição tocou
        const delta = diffData(from, next);
        if (!delta.length) return null;
        const ops = mergeOps(now?.ops ?? [], delta);
        setSession(ops.length ? { scope, baseVersion: now?.baseVersion ?? baseVersion, requestId: uuid(), ops, legacyRequestIds: now?.legacyRequestIds, submissionModel: 'reviewed' } : null);
        if (ops.length) { setSaveState("saving"); setSaveMsg(""); flushSoon(); } else if (!busy()) { setSaveState("idle"); setSaveMsg(""); }
      }
      return null;
    } catch (e) { return (e as Error).message; }
  };

  // Discards only edits not yet captured in a packet; captured packets keep their own recovery.
  const discardDraft = () => {
    const held = new Set(registered().flatMap((o) => o.ops.map(opKey)));
    setSession((s) => { if (!s) return s; const ops = s.ops.filter((o) => held.has(opKey(o))); return ops.length ? { ...s, ops } : null; });
    setConflicts([]); setSaveState(held.size ? "saving" : "idle"); setSaveMsg("Alterações não enviadas descartadas — nada foi gravado.");
  };

  // Proteção do preenchimento: grava as alterações pendentes no navegador (IndexedDB) por usuário+organização.
  useEffect(() => {
    if (!scope || !restored.current.has(scope)) return;
    const key = "draft:" + scope;
    const t = setTimeout(() => {
      (cur ? saveDraftLocal(key, cur) : clearDraftLocal(key)).then(() => setProtectErr("")).catch((e: Error) => setProtectErr(`O rascunho não pôde ser protegido neste navegador (${e.message}). Aguarde "Salvo" antes de fechar ou recarregar.`));
    }, 300);
    return () => clearTimeout(t);
  }, [cur, scope]);
  // Restore after failure/reload: every packet of this scope (legacy single slot migrated to its requestId key).
  // A packet with a stored server confirmation that the loaded base already reached leaves the draft with only its own
  // changes removed; uncertain packets stay registered for bounded read-only consultation.
  useEffect(() => {
    if (!scope || !baseData || restored.current.has(scope)) return;
    const loadedVersion = offQ.data?.version ?? -1;
    let alive = true;
    (async () => {
      const keys = scopeOperationKeys(scope, await listDraftKeys().catch(() => [] as string[]));
      const [v, ...found] = await Promise.all([loadDraft<OpsSession>("draft:" + scope), ...keys.map((k) => loadDraft<ReviewedOperation>(k))]);
      if (!alive) return;
      let ops = v?.ops ?? []; let reconciled = false;
      const kept: ReviewedOperation[] = [];
      for (let i = 0; i < keys.length; i++) {
        const op = found[i], key = keys[i]!;
        if (!op) continue;
        if (op.confirmation && loadedVersion >= op.confirmation.version) {
          if (!op.rebased) ops = rebasePending(ops, op.ops, op.recoveredPending ?? []);
          await clearDraftLocal(key); reconciled = true; continue;
        }
        if (key === "operation:" + scope) { await saveDraftLocal(operationStorageKey(scope, op.requestId), op); await clearDraftLocal(key); }
        if (!op.phase && !op.confirmation) op.phase = "unknown";
        kept.push(op);
      }
      if (reconciled) { if (ops.length && v) await saveDraftLocal("draft:" + scope, { ...v, ops }); else await clearDraftLocal("draft:" + scope); }
      restored.current.add(scope);
      for (const op of kept) opsRef.current.set(op.requestId, op);
      syncOps();
      if (ops.length && v) {
        setSession((s) => s ?? { ...v, ops, scope, legacyRequestIds: v.legacyRequestIds ?? (v.submissionModel === 'reviewed' ? [] : [v.requestId]) });
        setSaveState("saving"); setSaveMsg("Alterações recuperadas deste navegador; gravando.");
        flushSoon(600);
      } else if (reconciled) { setSaveState("saved"); setSaveMsg("Gravação confirmada anteriormente; a base atual já contém a operação."); }
      if (kept.length) { setSaveState("error"); setSaveMsg(kept.some((o) => o.confirmation) ? "Gravação confirmada; atualização da tela pendente." : "Envio anterior recuperado; conferindo o resultado sem reenviar."); }
    })().catch((e: Error) => { restored.current.add(scope); setProtectErr(`Não foi possível ler o rascunho protegido (${e.message}).`); });
    return () => { alive = false; };
  }, [scope, baseData]);

  const latestContext = useRef({ scope, activeId: active.id });
  latestContext.current = { scope, activeId: active.id };
  // Outra aba confirmou um pacote: retira somente aquele pacote/alterações aqui e relê a base (sem limpar o resto).
  useEffect(() => {
    if (!scope || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("sandrini:ack:" + scope);
    ch.onmessage = (e: MessageEvent<{ requestId: string; version: number; ops: Change[]; recovered: Change[] }>) => {
      const m = e.data; if (!m?.requestId) return;
      if (opsRef.current.has(m.requestId) && !inflightIds.current.has(m.requestId)) { opsRef.current.delete(m.requestId); syncOps(); }
      const current = sessionRef.current;
      if (current?.scope === scope) { const rest = rebasePending(current.ops, m.ops, m.recovered); if (rest.length !== current.ops.length || rest.some((o, i) => o !== current.ops[i])) setSession(rest.length ? { ...current, ops: rest, requestId: uuid() } : null); }
      void qc.invalidateQueries({ queryKey: ["official", user?.id] });
      setSaveMsg("Outra aba confirmou uma gravação; base atualizada.");
    };
    return () => { ch.close(); };
  }, [scope]);
  const ackPost = (msg: { requestId: string; version: number; ops: Change[]; recovered: Change[] }) => {
    if (!scope || typeof BroadcastChannel === "undefined") return;
    try { const ch = new BroadcastChannel("sandrini:ack:" + scope); ch.postMessage(msg); ch.close(); } catch { /* sem outras abas */ }
  };
  const saveSimulationOperation = (before: ScenarioData, ops: Change[]): string | null => {
    if (!sim || !scope) return "Simulação indisponível.";
    const result = applyOps(sim.data, ops, true);
    if (result.conflicts.length) return "A simulação mudou nos mesmos registros. Preenchimento preservado; revise novamente.";
    return update(x => Object.assign(x, result.data));
  };
  const runSaveOperation = async (input: ReviewedOperation, confirmedVersion?: number, resend = false): Promise<void> => {
    if (!canEdit || !active.isBase || official.role === "viewer" || !baseData || !scope || input.scope !== opScope || input.orgId !== official.orgId) throw new Error("Sem acesso ao contexto real desta operação.");
    if (inflightIds.current.has(input.requestId)) throw new Error("Esta operação já está em envio. Aguarde a confirmação.");
    let op = opsRef.current.get(input.requestId) ?? input;
    if (!opsRef.current.has(input.requestId)) {
      if (confirmedVersion === undefined && sessionRef.current?.legacyRequestIds?.length && input.ops.some((o) => sessionRef.current!.ops.some((p) => opKey(p) === opKey(o)))) throw new Error('Rascunho legado com envio não esclarecido. Consulte o resultado anterior antes de confirmar; nenhuma pendência foi descartada.');
      const blocking = blockingOperations({ ...input, dependencies: input.dependencies ?? operationDependencies(baseData, input.ops) }, registered());
      if (blocking.length) throw new Error(`Este salvamento altera ou depende de registro(s) de um envio anterior ainda sem resultado definitivo (identificação ${blocking.map((b) => b.requestId).join(", ")}). Nada foi enviado e o preenchimento continua aqui; a conferência automática prossegue. Operações em outros registros podem ser salvas normalmente.`);
      const pending = sessionRef.current?.scope === scope ? sessionRef.current.ops : [];
      const independent = pending.filter((p) => !input.recoveredPending?.some((r) => opKey(r) === opKey(p)));
      if (confirmedVersion === undefined) isolateOperation(baseData, applyOps(baseData, input.ops, false).data, independent);
      op = structuredClone(input);
      op.reviewRows ??= operationReview(op.ops, applyOps(baseData, op.ops, false).data);
      const blocked = pending.filter((p) => op.dependencies?.some((r) => r.entity === p.entity && r.id === p.id));
      if (blocked.length) throw new Error(`Dependências não salvas: ${blocked.map((p) => `${p.entity} ${p.id}`).join('; ')}. Aguarde a gravação dessas alterações antes desta operação.`);
      inflightIds.current.add(op.requestId);
      try { await storeOp(scope, op); }
      catch (e) { inflightIds.current.delete(op.requestId); opsRef.current.delete(op.requestId); syncOps(); throw new Error(`Não foi possível proteger esta operação no navegador. Nada foi enviado: ${(e as Error).message}`); }
    }
    inflightIds.current.add(op.requestId); setSaveState("saving"); setSaveMsg("");
    const phase = async (value: OperationPhase) => { op.phase = value; await storeOp(scope, op); };
    const certainNonWrite = async (message: string) => { op.rejected = true; await phase('failed'); throw new Error(message); };
    const readConfirmation = async () => {
      await phase('checking');
      const result = await pollConfirmation(() => checkRequest({ data: { orgId: op.orgId, requestId: op.requestId } }));
      if (!result) { op.lastNotFoundAt = new Date().toISOString(); await phase('unknown'); throw new Error('Resultado ainda desconhecido. Nenhum novo envio; a conferência automática continua. O pacote e o preenchimento permanecem protegidos.'); }
      if (!samePayload(JSON.parse(result.opsJson) as Change[], op.ops)) await certainNonWrite('A identificação deste envio foi usada com outro conteúdo; este pacote não foi gravado. Preenchimento preservado para novo envio.');
      return { status: 'duplicate', version: result.version, conflictsJson: '[]' };
    };
    try {
      const confirmationStarted = performance.now();
      let r: { status: string; version: number; conflictsJson?: string; receipt?: import('./commitReceipt').CommitReceipt | undefined };
      if (op.confirmation) r = op.confirmation;
      else if (confirmedVersion !== undefined) r = { status: 'duplicate', version: confirmedVersion };
      else if (!resend && (op.submittedAt || (op.phase && op.phase !== 'reviewing'))) r = await readConfirmation();
      else {
        // Explicit resend keeps the SAME requestId and immutable payload; the server returns "duplicate" if it already committed.
        if (resend) op.resentAt = new Date().toISOString(); else op.submittedAt = new Date().toISOString();
        await phase('sending');
        const result = await confirmSubmission(sendOperation(op, (o) => commitFn({ data: { orgId: o.orgId, requestId: o.requestId, opsJson: JSON.stringify(o.ops), ...(o.dependencies ? { dependenciesJson: JSON.stringify(o.dependencies) } : {}) } })), async () => {
          const checked = await checkRequest({ data: { orgId: op.orgId, requestId: op.requestId } });
          if (!checked) return null;
          return samePayload(JSON.parse(checked.opsJson) as Change[], op.ops) ? { status: 'duplicate', version: checked.version, conflictsJson: '[]' } : { status: 'payload_mismatch', version: checked.version, conflictsJson: '[]' };
        }, 20_000, () => phase('checking'));
        if (!result) { op.lastNotFoundAt = new Date().toISOString(); await phase('unknown'); throw new Error('Resultado ainda desconhecido. Nenhum novo envio; a conferência automática continua. Pacote e preenchimento preservados.'); }
        r = result;
      }
      measureSavePhase('confirmation', confirmationStarted);
      if (!["ok", "duplicate", "noop"].includes(r.status)) {
        if (r.status === "conflict") {
          op.rejected = true; op.conflicts = JSON.parse(r.conflictsJson ?? "[]") as Conflict[]; op.phase = 'conflict';
          await storeOp(scope, op);
          void qc.invalidateQueries({ queryKey: ["official", user?.id] });
          throw new Error('Outra pessoa salvou o mesmo registro ao mesmo tempo. Nada foi gravado nem sobrescrito; escolha qual versão manter.');
        }
        await certainNonWrite(r.status === "forbidden" ? "Sem permissão para salvar. Nenhuma gravação." : r.status === 'payload_mismatch' ? 'A identificação deste envio já foi usada com outro conteúdo; este pacote não foi gravado.' : "Envio recusado. Nada foi gravado; preenchimento preservado.");
      }
      op.confirmation = { status: r.status, version: r.version, receipt: r.receipt }; await phase('confirmed');
      // Verified ACK: the server holds exactly op.ops. Remove only those changes from the local draft NOW, before any
      // (possibly slow/failed) screen refresh; later edits of the same fields stay pending (rebasePending).
      if (!op.rebased && latestContext.current.scope === scope) {
        const current = sessionRef.current;
        if (current?.scope === scope) {
          const rest = rebasePending(current.ops, op.ops, op.recoveredPending ?? []);
          const next = rest.length ? { ...current, ops: rest, requestId: uuid() } : null;
          setSession(next);
          if (next) await saveDraftLocal("draft:" + scope, next); else await clearDraftLocal("draft:" + scope);
        }
        op.rebased = true; await storeOp(scope, op);
      }
      // Apply only the server-confirmed canonical transition to the exact cached version (no full reread when possible).
      const reconcileStarted = performance.now();
      await qc.cancelQueries({ queryKey: ["official", user?.id, op.orgId] });
      const key = ["official", user?.id, op.orgId];
      const cached = qc.getQueryData<OfficialCache>(key);
      const patched = latestContext.current.scope === scope && cached?.normalization === NORMALIZATION_REVISION
        ? await reconcileReceipt(cached.normalizedData ?? (cached === offQ.data && offData ? offData : normalizeData(JSON.parse(cached.dataJson))), cached.version,
          'receipt' in r ? r.receipt : undefined, { orgId: op.orgId, userId: user?.id ?? '', requestId: op.requestId }, r.version) : null;
      // An older response never lowers the cached version or replaces newer intent.
      const stillCurrent = qc.getQueryData<OfficialCache>(key) === cached;
      const newerCached = qc.getQueryData<OfficialCache>(key);
      let fresh: OfficialCache = patched && cached && stillCurrent
        ? { ...cached, version: r.version, normalizedData: patched, dataJson: '', updatedAt: '' }
        : newerCached && newerCached.version >= r.version ? newerCached
        : await bounded(fetchOfficial({ data: { orgId: op.orgId } }));
      if (fresh.version < r.version) throw new Error("A gravação foi confirmada, mas a releitura ainda não alcançou a versão salva. A conferência continuará sem reenviar.");
      const newer = qc.getQueryData<OfficialCache>(key);
      if (newer && newer.version > fresh.version) fresh = newer;
      if (latestContext.current.scope === scope) {
        const current = sessionRef.current;
        if (current?.scope === scope) setSession({ ...current, baseVersion: fresh.version });
        qc.setQueryData(key, fresh);
        void qc.invalidateQueries({ queryKey: ["official", "audit", user?.id, op.orgId], refetchType: "none" });
      }
      await dropOp(scope, op.requestId);
      ackPost({ requestId: op.requestId, version: r.version, ops: op.ops, recovered: op.recoveredPending ?? [] });
      measureSavePhase('reconcile', reconcileStarted);
      const waiting = (sessionRef.current?.ops.length ?? 0) > 0 || registered().length > 0;
      setSaveState(waiting ? "saving" : "saved");
      setSaveMsg(waiting ? "Salvo. Outras alterações seguem em gravação." : "Salvo.");
      if (sessionRef.current?.ops.length) flushSoon(50);
    } catch (e) {
      setSaveState("error");
      setSaveMsg(op.confirmation ? "Gravação confirmada; atualização da tela pendente. Conferindo sem reenviar." : op.rejected ? (op.phase === 'conflict' ? "Conflito: escolha qual versão manter." : "Envio recusado; preenchimento preservado.") : "Resultado desconhecido; conferindo sem reenviar. Pacote e preenchimento preservados.");
      throw e;
    } finally { inflightIds.current.delete(op.requestId); syncOps(); }
  };
  const withCommitLock = async (work: () => Promise<void>) => {
    // Cross-tab/in-tab ordering of writes on the monolithic document: wait (bounded) instead of refusing.
    if (typeof navigator === 'undefined' || !navigator.locks) return work();
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 90_000);
    try { await navigator.locks.request('sandrini:commit:' + opScope, { signal: ctrl.signal }, async () => { clearTimeout(t); await work(); }); }
    catch (e) { if ((e as Error).name === 'AbortError') throw new Error('Outra aba ainda está gravando. Nada foi enviado; seus valores permanecem preservados.'); throw e; }
    finally { clearTimeout(t); }
  };
  const saveOperation = async (op: ReviewedOperation, confirmedVersion?: number, resend = false) => {
    const run = async () => {
      const existing = opsRef.current.get(op.requestId);
      const rejected = existing && definitiveRejection(existing) ? existing : definitiveRejection(op) ? op : null;
      if (rejected && confirmedVersion === undefined && !resend && !inflightIds.current.has(rejected.requestId)) {
        // Certain non-write (conflict/failed): rebase the same changes on the CURRENT official version with a new requestId.
        const fresh = await bounded(fetchOfficial({ data: { orgId: op.orgId } }));
        const key = ["official", user?.id, op.orgId]; const cached = qc.getQueryData<OfficialCache>(key);
        if (!cached || cached.version < fresh.version) qc.setQueryData(key, fresh);
        const current = normalizeData(JSON.parse(fresh.dataJson));
        const retry = prepareRejectedRetry(current, rejected, uuid());
        if (retry.conflicts.length) throw new Error(`Outra pessoa alterou o mesmo registro (${retry.conflicts.map(c => c.change.entity).join(', ')}). Nada foi sobrescrito; use Revisar conflito na barra superior para escolher qual versão manter.`);
        if (retry.changedDependencies.length && !await askConfirm(`Enquanto você editava, outra pessoa alterou dados relacionados: ${retry.changedDependencies.join('; ')}. Suas alterações serão enviadas sobre a versão atual, sem desfazer o que foi salvo pela outra pessoa.`, { title: 'Salvar sobre a versão atual?', action: 'Salvar sobre a versão atual' })) throw new Error('Envio não confirmado. Preenchimento preservado.');
        if (scope) { await saveDraftLocal('operation-archive:' + scope + ':' + rejected.requestId, rejected); await dropOp(scope, rejected.requestId); }
        for (const k of ['rejected', 'conflicts', 'phase', 'submittedAt', 'resentAt', 'lastNotFoundAt', 'legacyUncertain', 'rebased', 'confirmation', 'reviewRows'] as const) delete op[k];
        Object.assign(op, retry.op);
      }
      const captured = opsRef.current.get(op.requestId) ?? op;
      if (definitiveRejection(captured) && confirmedVersion === undefined) throw new Error('Envio recusado. Revise o conflito comprovado; nenhum reenvio.');
      try { await runSaveOperation(captured, confirmedVersion, resend); }
      finally { // Inform the originating form without modifying its immutable submitted payload.
        const outcome = opsRef.current.get(op.requestId) ?? captured;
        op.rejected = outcome.rejected ?? false;
        if (outcome.submittedAt) op.submittedAt = outcome.submittedAt;
        if (outcome.confirmation) op.confirmation = outcome.confirmation;
        if (outcome.conflicts) op.conflicts = outcome.conflicts;
        if (outcome.phase) op.phase = outcome.phase;
      }
    };
    await withCommitLock(run);
  };
  const pick = (requestId?: string) => (requestId ? opsRef.current.get(requestId) : registered()[0]) ?? null;
  const abandonOperation = async (requestId?: string) => {
    const op = pick(requestId);
    if (!scope || !op || inflightIds.current.has(op.requestId)) return;
    if (!definitiveRejection(op)) { setSaveState('error'); setSaveMsg('Resultado ainda desconhecido. Aguarde a conferência antes de revisar; pacote e histórico preservados.'); return; }
    const current = sessionRef.current;
    const next: OpsSession = { scope, baseVersion: official.version, requestId: uuid(), ops: mergeOps(op.ops, current?.scope === scope ? current.ops : []), submissionModel: 'reviewed' };
    // Retain the exact rejected capture/requestId even after moving edits back to the draft.
    await saveDraftLocal('operation-archive:' + scope + ':' + op.requestId, op);
    await saveDraftLocal('draft:' + scope, next); setSession(next);
    await dropOp(scope, op.requestId);
    if (op.conflicts) setConflicts((c) => [...c.filter((x) => !op.conflicts!.some((y) => opKey(y.change) === opKey(x.change))), ...op.conflicts!.filter((x) => typeof x.server !== 'string')]);
    void qc.invalidateQueries({ queryKey: ["official", user?.id, selOrg] });
  };

  // Recovery is a read: the original requestId is reconciled only with a confirmation whose payload matches.
  const checkPendingOperation = async (requestId?: string, automatic = false) => {
    const op = pick(requestId);
    if (!op || !scope) return;
    const reason = confirmationBlockReason(op, { authenticated: !!user, authorized: official.status === 'ready' && op.orgId === official.orgId && op.scope === opScope && active.isBase && canEdit, busy: inflightIds.current.has(op.requestId) || checkingIds.current.has(op.requestId), online: typeof navigator === 'undefined' || navigator.onLine });
    if (reason) { if (!automatic) setSaveMsg(reason); syncOps(); return; }
    checkingIds.current.add(op.requestId); setConfirmationChecking(true);
    try {
      const result = op.confirmation ?? await bounded(checkRequest({ data: { orgId: op.orgId, requestId: op.requestId } }), 5000);
      if (!result) {
        op.lastNotFoundAt = new Date().toISOString(); await storeOp(scope, op);
        setSaveState('error'); setSaveMsg('A consulta não encontrou confirmação. Isso não comprova que o envio terminou ou não ocorreu; a conferência automática continua com intervalos maiores. Você também pode reenviar o MESMO pacote (mesma identificação): se já tiver sido gravado, o servidor apenas confirma, sem duplicar.'); return;
      }
      if (!op.confirmation && 'opsJson' in result && !samePayload(JSON.parse(result.opsJson) as Change[], op.ops)) {
        op.rejected = true; op.phase = 'failed'; await storeOp(scope, op);
        setSaveState('error'); setSaveMsg('A identificação deste envio consta no servidor com outro conteúdo; este pacote não foi gravado. Use "Voltar à edição" para enviar novamente.'); return;
      }
      await saveOperation(op, result.version);
    } catch (e) {
      setSaveState('error');
      setSaveMsg(op.confirmation ? 'Gravação confirmada; a atualização da tela falhou. A conferência continuará sem reenviar.' : `Não foi possível consultar o resultado. ${(e as Error).message} Pacote e preenchimento preservados; nenhum novo envio.`);
    } finally { checkingIds.current.delete(op.requestId); setConfirmationChecking(checkingIds.current.size > 0); syncOps(); }
  };

  // Bounded automatic read-only consultations with increasing delay per requestId (never a resend); resumes on reconnect/reload.
  useEffect(() => {
    if (official.status !== 'ready') return;
    for (const op of pendingOps) {
      if (op.scope !== opScope || op.legacyUncertain || (!op.confirmation && (!isUncertain(op) || !op.submittedAt))) continue;
      if (consultTimers.current.has(op.requestId) || inflightIds.current.has(op.requestId) || checkingIds.current.has(op.requestId)) continue;
      const attempts = consultAttempts.current.get(op.requestId) ?? 0;
      const delay = nextConsultDelay(attempts);
      if (delay === null) continue;
      consultTimers.current.set(op.requestId, setTimeout(() => { consultTimers.current.delete(op.requestId); consultAttempts.current.set(op.requestId, attempts + 1); void checkPendingOperation(op.requestId, true); }, delay));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOps, official.status]);
  useEffect(() => {
    const resume = () => { consultAttempts.current.clear(); syncOps(); };
    window.addEventListener('online', resume);
    const timers = consultTimers.current;
    return () => { window.removeEventListener('online', resume); timers.forEach(clearTimeout); timers.clear(); if (flushTimer.current) clearTimeout(flushTimer.current); };
  }, []);

  // Explicit user action only: same requestId + same immutable ops (idempotent per organization+requestId+payload).
  const resendPendingOperation = async (requestId?: string) => {
    const op = pick(requestId);
    if (!op) return;
    const reason = confirmationBlockReason(op, { authenticated: !!user, authorized: official.status === 'ready' && op.orgId === official.orgId && op.scope === opScope && active.isBase && canEdit, busy: inflightIds.current.has(op.requestId) || checkingIds.current.has(op.requestId), online: typeof navigator === 'undefined' || navigator.onLine });
    if (reason) { setSaveMsg(reason); return; }
    if (op.confirmation || definitiveRejection(op) || !op.lastNotFoundAt || !op.ops.length || op.legacyUncertain) { setSaveMsg('Reenvio disponível somente após uma consulta sem confirmação de um pacote completo.'); return; }
    try { await saveOperation(op, undefined, true); }
    catch (e) { setSaveState('error'); setSaveMsg(`${(e as Error).message} Pacote e preenchimento preservados.`); }
  };

  // Automatic save of completed edits: sends session changes not held by a registered packet or a conflict review.
  const dependencyRetries = useRef(0);
  flushRef.current = async () => {
    if (!active.isBase || !canEdit || !baseData || !scope || official.role === 'viewer') return;
    const current = sessionRef.current;
    if (!current || current.scope !== scope || !current.ops.length || current.legacyRequestIds?.length) return;
    const candidates = sendableChanges(current.ops, registered(), new Set(conflictsRef.current.map((c) => opKey(c.change))));
    const held = candidates.map(validationHold).filter((x): x is string => !!x);
    const ops = candidates.filter((c) => !validationHold(c));
    if (held.length && !ops.length) { setSaveState('error'); setSaveMsg([...new Set(held)].join(' ')); }
    if (!ops.length) return;
    const op: ReviewedOperation = { scope: opScope, orgId: official.orgId, requestId: uuid(), ops: structuredClone(ops), recoveredPending: structuredClone(ops), dependencies: operationDependencies(baseData, ops) };
    try { await saveOperation(op); dependencyRetries.current = 0; }
    catch (e) {
      const saved = opsRef.current.get(op.requestId);
      if (saved?.phase === 'conflict' && saved.conflicts?.length) {
        await saveDraftLocal('operation-archive:' + scope + ':' + saved.requestId, saved); await dropOp(scope, saved.requestId);
        const record = saved.conflicts.filter((c) => typeof c.server !== 'string');
        if (record.length) setConflicts((c) => [...c.filter((x) => !record.some((y) => opKey(y.change) === opKey(x.change))), ...record]);
        else if (++dependencyRetries.current <= 2) { await qc.invalidateQueries({ queryKey: ["official", user?.id, official.orgId] }); flushSoon(500); }
        else { setSaveState('error'); setSaveMsg('Dados relacionados mudaram repetidamente durante a gravação. Seus valores continuam na tela; confira e edite novamente para salvar.'); }
      } else if (!saved) { setSaveState('saving'); setSaveMsg(`Aguardando gravação anterior do mesmo registro. ${(e as Error).message}`); }
    }
  };

  // Legacy recovered drafts: read-only reconciliation of earlier request IDs; never sends without a confirmed capture.
  const commitDraft = async () => {
    if (!baseData || !scope || !canEdit) return;
    try {
      const current = sessionRef.current;
      if (!current || current.scope !== scope) return;
      for (const requestId of current.legacyRequestIds ?? []) {
        const result = await bounded(checkRequest({ data: { orgId: official.orgId, requestId } }), 5000);
        if (result) { await saveOperation({ scope: opScope, orgId: official.orgId, requestId, ops: JSON.parse(result.opsJson) as Change[] }, result.version); setSession((s) => s ? { ...s, legacyRequestIds: s.legacyRequestIds?.filter((id) => id !== requestId) } : null); return; }
      }
      if (current.legacyRequestIds?.length) { setSaveState('error'); setSaveMsg('Rascunho legado sem confirmação encontrada. Não há captura imutável que comprove se já foi enviado. Nenhum novo pacote será enviado; valores preservados para conferência.'); return; }
      flushSoon(0);
    } catch (e) { setSaveState('error'); setSaveMsg((e as Error).message); }
  };
  useEffect(() => { if (restored.current.has(scope ?? '')) flushSoon(400); // base advanced (other user/refresh): retry held auto-saves
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseVersion]);
  const resolveConflict = (c: Conflict, keep: "mine" | "server") => {
    const k = opKey(c.change);
    setSession((s) => { if (!s) return s; const ops = keep === "mine" ? s.ops.map((o) => (opKey(o) === k ? { ...o, before: c.server } : o)) : s.ops.filter((o) => opKey(o) !== k); return ops.length ? { ...s, ops, requestId: uuid() } : null; });
    setConflicts((l) => { const n = l.filter((x) => opKey(x.change) !== k); if (!n.length) { setSaveState(keep === "mine" ? "saving" : "idle"); setSaveMsg(keep === "mine" ? "Conflito resolvido — gravando a sua versão." : "Conflito resolvido — mantida a versão salva."); } return n; });
    if (keep === "mine") flushSoon(100);
  };

  const value: Ctx = {
    prepareReceiptOperation: () => {
      if(!baseData || !canEdit || !active.isBase)throw new Error('Sem acesso para salvar recebimentos reais.');
      const pending=sessionRef.current?.scope===scope?sessionRef.current.ops:[];
      const checked=applyOps(baseData,pending.filter(p=>p.entity==='Recebimento'),true);
      if(checked.conflicts.length){setConflicts(checked.conflicts);throw new Error('Confira os recebimentos alterados por outra pessoa. Seus valores permanecem preservados.');}
      return receiptOperation(baseData,pending);
    },
    reconcileReceiptDraft: async () => {
      const current=sessionRef.current;
      if(busy())throw new Error('Há uma operação em confirmação. Aguarde o resultado.');
      if(!current || current.scope!==scope || !active.isBase)return false;
      for(const requestId of current.legacyRequestIds ?? [current.requestId]) {
        const result=await bounded(checkRequest({data:{orgId:official.orgId,requestId}}),5000);
        if(!result)continue;
        const ops=JSON.parse(result.opsJson) as Change[];
        await saveOperation({scope:`${user?.id}:${official.orgId}`,orgId:official.orgId,requestId,ops},result.version);
        setSession(s=>s?{...s,legacyRequestIds:s.legacyRequestIds?.filter(id=>id!==requestId)}:null);
        return true;
      }
      if(current.legacyRequestIds?.length)throw new Error('Rascunho legado sem confirmação encontrada. Nenhum novo envio até esclarecer o resultado anterior; valores preservados.');
      return false;
    },
    authReady,
    user, signOut: async () => { await qc.cancelQueries(); qc.removeQueries({ queryKey: ["official"] }); setSession(null); if (user) mutLocal((s) => { s.sims = purgeUser(s.sims, user.id); s.activeId = "base"; }); await supabase.auth.signOut(); },
    official, orgs, setOrgId: (id) => { if(id!==SHARED_ORG_ID)return; setOrgIdS(SHARED_ORG_ID); void qc.invalidateQueries({queryKey:["official","orgs",user?.id]}); },
    base, active, sims, allSims, ui, canEdit,
    setUi: (p) => setUiS((u) => ({ ...u, ...p })),
    setActive: (id) => mutLocal((s) => { s.activeId = id; }),
    globalReview, closeGlobalReview:()=>setGlobalReview(null), checkPendingOperation, confirmationChecking,
    saveOperation, saveSimulationOperation, pendingOperation: pendingOps.find((o) => o.scope === opScope) ?? null, pendingOperations: pendingOps.filter((o) => o.scope === opScope), abandonOperation,
    update, draft, draftBaseVersion: cur?.baseVersion ?? null, baseMoved: !!cur && cur.baseVersion !== official.version, changes, discardDraft, commitDraft, saveState, saveMsg, conflicts, resolveConflict, protectErr,
    reloadOfficial: () => { qc.invalidateQueries({ queryKey: ["official"] }); },
    createSim: (name) => { if (!baseData) return; const id = uid(); if (!simScope) return; mutLocal((s) => { (s.sims[simScope] ??= []).push({ id, name, createdAt: new Date().toISOString(), createdBy: user?.email ?? "", data: clone(baseData), baseVersion }); s.activeId = id; }); },
    discardSim: (id) => { if (!baseData) return; mutLocal((s) => { const x = simScope ? s.sims[simScope]?.find((i) => i.id === id) : null; if (x) { x.data = clone(baseData); x.baseVersion = baseVersion; } }); },
    deleteSim: (id) => mutLocal((s) => { const x = simScope ? s.sims[simScope]?.find((i) => i.id === id) : null; if (x) { x.deletedAt = new Date().toISOString(); x.deletedBy = user?.email ?? ""; } if (s.activeId === id) s.activeId = "base"; }),
    requestAudit, resendPendingOperation,
    auditHistory: { entries: auditEntries, status: auditQ.isError ? "error" : auditQ.data ? "ready" : auditDemand > 0 ? "loading" : "idle", error: auditQ.isError ? "Não foi possível carregar o histórico. Tente novamente." : "", refresh: () => { void auditQ.refetch(); } },
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
/** Requests audit history while `enabled`; nothing is downloaded when no screen needs it. */
export function useAuditHistory(enabled = true): AuditHistory {
  const c = useApp();
  const { requestAudit } = c;
  useEffect(() => (enabled ? requestAudit() : undefined), [enabled, requestAudit]);
  return enabled ? c.auditHistory : { ...c.auditHistory, entries: [] };
}
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do AppProvider");
  return c;
}
