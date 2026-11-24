import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { produce, setAutoFreeze } from "immer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyOps, diffData, mergeOps, opKey, type Change, type Conflict } from "./diff";
import { clearDraftLocal, loadDraft, saveDraftLocal } from "./draftStore";
import { normalizeData } from "./engine/actions";
import type { ScenarioData } from "./engine/types";
import { commitOps, getOfficial, listAudit, checkCommitRequest } from "./official.functions";
import { receiptOperation } from './receiptOperation';
import { listMyOrgs } from "./team.functions";
import { pickOrg, SHARED_ORG_ID, canWrite } from "./team";
import { isolateOperation, rebasePending, sendOperation, type ReviewedOperation } from "./operationSave";
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
  globalReview: ReviewedOperation | null; closeGlobalReview: () => void; checkPendingOperation: () => Promise<void>; confirmationChecking: boolean;
  pendingOperation: ReviewedOperation | null; abandonOperation: () => Promise<void>;
  reconcileReceiptDraft: () => Promise<boolean>;
  prepareReceiptOperation: () => ReturnType<typeof receiptOperation>;
  saveState: SaveState; saveMsg: string; reloadOfficial: () => void;
  conflicts: Conflict[]; resolveConflict: (c: Conflict, keep: "mine" | "server") => void; protectErr: string;
  createSim: (name: string) => void; discardSim: (id: string) => void; deleteSim: (id: string) => void;
  /** Audit is heavy (~18 MB with changes): loaded only while a history screen/panel requests it. */
  auditHistory: AuditHistory; requestAudit: () => () => void;
  resendPendingOperation: () => Promise<void>;
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
  const [pendingOperation, setPendingOperation] = useState<ReviewedOperation | null>(null);
  const operationRef = useRef<ReviewedOperation | null>(null);
  const [globalReview, setGlobalReview] = useState<ReviewedOperation | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [protectErr, setProtectErr] = useState("");
  const inflight = useRef(false);
  const checkingRef = useRef(false);
  const autoChecked = useRef(new Set<string>());
  const [confirmationChecking, setConfirmationChecking] = useState(false);
  const restored = useRef(new Set<string>());
  const ackChannel = useRef<BroadcastChannel | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [ui, setUiS] = useState<UiState>({ view: "horizontal", start: "2026-10-01", end: "2026-11-30", supplierId: "", group: "", flowMode: "consolidada" });
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
  const active: Scenario = sim ? { id: sim.id, name: sim.name, isBase: false, data: sim.data ?? base.data } : { ...base, data: draft ?? base.data };
  const canEdit = official.status === "ready" && (!!sim || canWrite(official.role));
  const changes = cur?.ops ?? [];

  const mutLocal = useCallback((fn: (s: LocalState) => void) => setLocal((s) => { const n = clone(s); fn(n); return n; }), []);

  const update = (fn: (d: ScenarioData) => void): string | null => {
    if (!canEdit) return "Sem permissão de edição (entre com uma conta com papel de edição ou use o modo Simulação).";
    try {
      if (sim) {
        const next = editDraft(sim.data, null, fn);
        const ch = diffData(sim.data, next);
        mutLocal((s) => { const x = simScope ? s.sims[simScope]?.find((i) => i.id === sim.id) as Sim | undefined : null; if (x) { x.data = next; if (ch.length) (x.history ??= []).unshift({ at: new Date().toISOString(), user: user?.email ?? "", changes: ch }); } });
      } else {
        if (!baseData || !scope) return "Base ainda não carregada.";
        const from = draft ?? baseData;
        const next = produce(from, (x) => { fn(x); }); // copia só o que a edição tocou
        const delta = diffData(from, next);
        if (!delta.length) return null;
        const ops = mergeOps(cur?.ops ?? [], delta);
        setSession(ops.length ? { scope, baseVersion: cur?.baseVersion ?? baseVersion, requestId: uuid(), ops, legacyRequestIds:cur?.legacyRequestIds, submissionModel:'reviewed' } : null);
        if (!inflight.current && !operationRef.current) { setSaveState(ops.length ? "dirty" : "idle"); setSaveMsg(""); }
      }
      return null;
    } catch (e) { return (e as Error).message; }
  };

  const discardDraft = () => { if(operationRef.current || inflight.current)return; setSession(null); setConflicts([]); setSaveState("idle"); setSaveMsg("Alterações descartadas — nada foi gravado."); };

  // Proteção do preenchimento: grava as alterações pendentes no navegador (IndexedDB) por usuário+organização.
  useEffect(() => {
    if (!scope || !restored.current.has(scope)) return;
    const key = "draft:" + scope;
    const t = setTimeout(() => {
      (cur ? saveDraftLocal(key, cur) : clearDraftLocal(key)).then(() => setProtectErr("")).catch((e: Error) => setProtectErr(`O rascunho não pôde ser protegido neste navegador (${e.message}). Salve antes de fechar ou recarregar.`));
    }, 300);
    return () => clearTimeout(t);
  }, [cur, scope]);
  // Recupera rascunho e pacote em confirmação após falha/recarga, NA MESMA ETAPA (sem corrida entre os dois):
  // um pacote com confirmação do servidor já guardada e cuja versão a base atual alcançou é retirado, e somente as
  // alterações dele saem do rascunho; edições posteriores e outras pendências permanecem.
  useEffect(() => {
    if (!scope || !baseData || restored.current.has(scope)) return;
    const loadedVersion = offQ.data?.version ?? -1;
    let alive = true;
    Promise.all([loadDraft<OpsSession>("draft:" + scope), loadDraft<ReviewedOperation>("operation:" + scope)]).then(async ([v, op]) => {
      if (!alive) return;
      let ops = v?.ops ?? [];
      if (op?.confirmation && loadedVersion >= op.confirmation.version) {
        if (!op.rebased) ops = rebasePending(ops, op.ops, op.recoveredPending ?? []);
        if (ops.length && v) await saveDraftLocal("draft:" + scope, { ...v, ops }); else await clearDraftLocal("draft:" + scope);
        await clearDraftLocal("operation:" + scope);
        setSaveState(ops.length ? "dirty" : "saved"); setSaveMsg("Gravação confirmada anteriormente; a base atual já contém a operação.");
        op = undefined;
      }
      restored.current.add(scope);
      if (ops.length && v) { setSession((s) => s ?? { ...v, ops, scope, legacyRequestIds:v.legacyRequestIds ?? (v.submissionModel==='reviewed'?[]:[v.requestId]) }); if (!op) { setSaveState("dirty"); setSaveMsg("Rascunho recuperado — ainda não salvo."); } }
      operationRef.current = op ?? null; setPendingOperation(op ?? null);
      if (op) { setSaveState("error"); setSaveMsg(op.confirmation ? "Gravação confirmada; atualização da tela pendente." : "Pacote recuperado; confira o resultado sem reenviar."); }
    }).catch((e: Error) => { restored.current.add(scope); setProtectErr(`Não foi possível ler o rascunho protegido (${e.message}).`); });
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
      if (operationRef.current?.requestId === m.requestId && !inflight.current) { operationRef.current = null; setPendingOperation(null); }
      const current = sessionRef.current;
      if (current?.scope === scope) { const rest = rebasePending(current.ops, m.ops, m.recovered); if (rest.length !== current.ops.length || rest.some((o, i) => o !== current.ops[i])) setSession(rest.length ? { ...current, ops: rest, requestId: uuid() } : null); }
      void qc.invalidateQueries({ queryKey: ["official", user?.id] });
      setSaveMsg("Outra aba confirmou uma gravação; base atualizada.");
    };
    ackChannel.current = ch;
    return () => { ch.close(); if (ackChannel.current === ch) ackChannel.current = null; };
  }, [scope]);
  const saveSimulationOperation = (before: ScenarioData, ops: Change[]): string | null => {
    if (!sim || !scope) return "Simulação indisponível.";
    const result = applyOps(sim.data, ops, true);
    if (result.conflicts.length) return "A simulação mudou nos mesmos registros. Preenchimento preservado; revise novamente.";
    return update(x => Object.assign(x, result.data));
  };
  const runSaveOperation = async (op: ReviewedOperation, confirmedVersion?: number, resend = false): Promise<void> => {
    if (!canEdit || !active.isBase || official.role === "viewer" || !baseData || !scope || op.scope !== `${user?.id}:${official.orgId}` || op.orgId !== official.orgId) throw new Error("Sem acesso ao contexto real desta operação.");
    if (inflight.current) throw new Error("Há uma confirmação em andamento. Aguarde a resposta.");
    if (operationRef.current && operationRef.current.requestId !== op.requestId) throw new Error("Há uma operação com resultado pendente. Resolva-a na faixa de recuperação antes de confirmar outra.");
    if (!operationRef.current) {
      // Isolation compares the reviewed delta only; no global draft commit.
      const pending = sessionRef.current?.scope === scope ? sessionRef.current.ops : [];
      if (confirmedVersion === undefined && sessionRef.current?.legacyRequestIds?.length) throw new Error('Rascunho legado com envio não esclarecido. Consulte o resultado anterior antes de confirmar; nenhuma pendência foi descartada.');
      const independent=pending.filter(p=>!op.recoveredPending?.some(r=>opKey(r)===opKey(p)));
      if(confirmedVersion===undefined)isolateOperation(baseData, applyOps(baseData, op.ops, false).data, independent);
      op = structuredClone(op);
      op.reviewRows ??= operationReview(op.ops, applyOps(baseData,op.ops,false).data);
      const blocked=pending.filter(p=>op.dependencies?.some(r=>r.entity===p.entity && r.id===p.id));
      if(blocked.length)throw new Error(`Dependências não salvas: ${blocked.map(p=>`${p.entity} ${p.id}`).join('; ')}. Revise/salve ou descarte explicitamente essas pendências antes desta operação.`);
      inflight.current = true;
      try { await saveDraftLocal("operation:" + scope, op); }
      catch(e) { inflight.current=false; throw new Error(`Não foi possível proteger esta operação no navegador. Nada foi enviado: ${(e as Error).message}`); }
      operationRef.current = op; setPendingOperation(op);
    }
    inflight.current = true; setSaveState("saving"); setSaveMsg("");
    const phase = async (value:OperationPhase) => {
      op.phase=value; operationRef.current=op; setPendingOperation({...op});
      await saveDraftLocal("operation:"+scope,op);
    };
    const readConfirmation = async () => {
      await phase('checking');
      const result=await pollConfirmation(()=>checkRequest({data:{orgId:op.orgId,requestId:op.requestId}}));
      if(!result) { await phase('unknown'); throw new Error('Resultado desconhecido. Nenhum novo envio; confira a confirmação novamente. O pacote e o preenchimento permanecem protegidos.'); }
      return {status:'duplicate',version:result.version,conflictsJson:'[]'};
    };
    try {
      const confirmationStarted=performance.now();
      let r: {status:string;version:number;conflictsJson?:string;receipt?:import('./commitReceipt').CommitReceipt | undefined};
      if(op.confirmation)r=op.confirmation;
      else if(confirmedVersion!==undefined)r={status:'duplicate',version:confirmedVersion};
      else if(!resend && (op.submittedAt || operationRef.current?.requestId===op.requestId && op.phase && op.phase!=='reviewing'))r=await readConfirmation();
      else {
        // Explicit resend keeps the SAME requestId and immutable payload; the server/DB return "duplicate" if it already committed.
        if(resend)op.resentAt=new Date().toISOString(); else op.submittedAt=new Date().toISOString();
        await phase('sending');
        const result=await confirmSubmission(sendOperation(op, o => commitFn({ data: { orgId: o.orgId, requestId: o.requestId, opsJson: JSON.stringify(o.ops), ...(o.dependencies ? {dependenciesJson:JSON.stringify(o.dependencies)} : {}) } })),async()=>{
          const checked=await checkRequest({data:{orgId:op.orgId,requestId:op.requestId}});
          return checked ? {status:'duplicate',version:checked.version,conflictsJson:'[]'} : null;
        },20_000,()=>phase('checking'));
        if(!result){await phase('unknown');throw new Error('Resultado ainda desconhecido. Use Consultar resultado nesta revisão; nenhum novo envio. Pacote e preenchimento preservados.');}
        r=result;
      }
      measureSavePhase('confirmation',confirmationStarted);
      if (!["ok", "duplicate", "noop"].includes(r.status)) {
        if (r.status === "conflict") {
          const conflicts = JSON.parse(r.conflictsJson ?? "[]") as Conflict[];
          op.rejected=true;
          op.conflicts=conflicts; op.phase='conflict';
          operationRef.current=op; setPendingOperation({...op}); await saveDraftLocal("operation:"+scope,op);
          void qc.invalidateQueries({ queryKey: ["official", user?.id] });
          throw new Error('Outra pessoa salvou ao mesmo tempo. Nada foi gravado nem sobrescrito. Clique em Confirmar e salvar novamente para enviar sobre a versão atual.');
        }
        op.rejected=true; await phase('failed');
        throw new Error(r.status === "forbidden" ? "Sem permissão para salvar. Nenhuma gravação." : "Envio recusado por concorrência. Nada foi gravado; libere o pacote para nova revisão.");
      }
      op.confirmation={status:r.status,version:r.version,receipt:r.receipt}; await phase('confirmed');
      // Verified ACK: the server holds exactly op.ops. Remove only those changes from the local draft NOW, before any
      // (possibly slow/failed) screen refresh, so a confirmed change never resurfaces as "Alterações não salvas".
      if (!op.rebased && latestContext.current.scope === scope) {
        const current = sessionRef.current;
        if (current?.scope === scope) {
          const rest = rebasePending(current.ops, op.ops, op.recoveredPending ?? []);
          const next = rest.length ? { ...current, ops: rest, requestId: uuid() } : null;
          setSession(next);
          if (next) await saveDraftLocal("draft:" + scope, next); else await clearDraftLocal("draft:" + scope);
        }
        op.rebased = true; await saveDraftLocal("operation:" + scope, op);
      }
      // Apply only the server-confirmed canonical transition to the exact cached version.
      const reconcileStarted=performance.now();
      await qc.cancelQueries({queryKey:["official",user?.id,op.orgId]});
      const key = ["official", user?.id, op.orgId];
      const cached = qc.getQueryData<OfficialCache>(key);
      const patched = latestContext.current.scope === scope && cached?.normalization === NORMALIZATION_REVISION
        ? await reconcileReceipt(cached.normalizedData ?? (cached === offQ.data && offData ? offData : normalizeData(JSON.parse(cached.dataJson))), cached.version,
          'receipt' in r ? r.receipt : undefined, {orgId:op.orgId,userId:user?.id ?? '',requestId:op.requestId}, r.version) : null;
      // During async verification another response may have advanced the cache: never lower its version.
      const stillCurrent = qc.getQueryData<OfficialCache>(key) === cached;
      let fresh: OfficialCache = patched && cached && stillCurrent
        ? {...cached,version:r.version,normalizedData:patched,dataJson:'',updatedAt:''}
        : await bounded(fetchOfficial({ data: { orgId: op.orgId } }));
      if (fresh.version < r.version) throw new Error("A gravação foi confirmada, mas a releitura ainda não alcançou a versão salva. Tente novamente para conferir.");
      const newer = qc.getQueryData<OfficialCache>(key);
      if (newer && newer.version > fresh.version) fresh = newer;
      if (latestContext.current.scope === scope) {
        const current = sessionRef.current;
        if (current?.scope === scope) setSession({ ...current, baseVersion: fresh.version });
        qc.setQueryData(key, fresh);
        // Mark history stale without downloading it now; history screens re-read when opened or refreshed.
        void qc.invalidateQueries({ queryKey: ["official", "audit", user?.id, op.orgId], refetchType: "none" });
      }
      const preserved = sessionRef.current;
      if (latestContext.current.scope === scope) {
        if(preserved?.scope === scope) await saveDraftLocal("draft:" + scope,preserved);
        else await clearDraftLocal("draft:" + scope);
      }
      await clearDraftLocal("operation:" + scope);
      if (latestContext.current.scope === scope) { operationRef.current = null; setPendingOperation(null); setGlobalReview(null); }
      try { ackChannel.current?.postMessage({ requestId: op.requestId, version: r.version, ops: op.ops, recovered: op.recoveredPending ?? [] }); } catch { /* sem outras abas */ }
      measureSavePhase('reconcile',reconcileStarted);
      setSaveState(sessionRef.current?.ops.length ? "dirty" : "saved");
      setSaveMsg(sessionRef.current?.ops.length ? "Operação salva com sucesso. Outras alterações continuam não salvas." : "Salvo com sucesso.");
    } catch(e) { setSaveState("error"); setSaveMsg(op.confirmation ? "Gravação confirmada; atualização da tela pendente. Confira sem reenviar." : op.rejected ? "Envio recusado; pacote preservado para revisão." : "Resultado desconhecido; confira sem reenviar. Pacote e rascunho preservados."); throw e; }
    finally { inflight.current = false; }
  };
  const saveOperation = async (op:ReviewedOperation, confirmedVersion?:number, resend=false) => {
    const run=async()=>{
      let stored=await loadDraft<ReviewedOperation>('operation:'+scope);
      const rejected=stored && definitiveRejection(stored) ? stored : definitiveRejection(op) ? op : null;
      if(rejected && confirmedVersion===undefined && !resend && !inflight.current) {
        // Certain non-write (conflict/failed): rebase the same changes on the CURRENT official version with a new requestId.
        // A fresh form capture (different requestId, not rejected) is the user's latest intent and wins over the old packet.
        const source=!definitiveRejection(op) && op.requestId!==rejected.requestId ? op : rejected;
        const fresh=await bounded(fetchOfficial({data:{orgId:op.orgId}}));
        const key=["official",user?.id,op.orgId]; const cached=qc.getQueryData<OfficialCache>(key);
        if(!cached || cached.version<fresh.version) qc.setQueryData(key,fresh);
        const current=normalizeData(JSON.parse(fresh.dataJson));
        const retry=prepareRejectedRetry(current,source,uuid());
        if(retry.conflicts.length) throw new Error(`Outra pessoa alterou o mesmo registro (${retry.conflicts.map(c=>c.change.entity).join(', ')}). Nada foi sobrescrito; use Revisar conflito na barra superior para escolher qual versão manter.`);
        if(retry.changedDependencies.length && !await askConfirm(`Enquanto você editava, outra pessoa alterou dados relacionados: ${retry.changedDependencies.join('; ')}. Suas alterações serão enviadas sobre a versão atual, sem desfazer o que foi salvo pela outra pessoa.`,{title:'Salvar sobre a versão atual?',action:'Salvar sobre a versão atual'})) throw new Error('Envio não confirmado. Preenchimento preservado.');
        await saveDraftLocal('operation-archive:'+scope+':'+rejected.requestId,rejected);
        await clearDraftLocal('operation:'+scope);
        operationRef.current=null; setPendingOperation(null);
        for(const k of ['rejected','conflicts','phase','submittedAt','resentAt','lastNotFoundAt','legacyUncertain','rebased','confirmation','reviewRows'] as const) delete op[k];
        Object.assign(op,retry.op);
        stored=undefined;
      }
      if(stored && stored.requestId!==op.requestId){
        throw new Error(`Um envio anterior deste navegador (código ${stored.requestId.slice(0,8)}) ainda aguarda conferência. Use Consultar resultado na barra superior; nada foi perdido.`);
      }
      const captured=stored ?? operationRef.current ?? op;
      if(definitiveRejection(captured) && confirmedVersion === undefined)throw new Error('Envio recusado. Consulte o resultado ou revise o conflito comprovado; nenhum reenvio.');
      if(stored && !stored.phase && !stored.confirmation)captured.phase='unknown';
      try { await runSaveOperation(captured,confirmedVersion,resend); }
      finally { // Inform the originating form without modifying its immutable submitted payload.
        const outcome = operationRef.current?.requestId === op.requestId ? operationRef.current : captured;
        op.rejected=outcome.rejected ?? false;
        if(outcome.submittedAt)op.submittedAt=outcome.submittedAt;
        if(outcome.confirmation)op.confirmation=outcome.confirmation;
        if(outcome.conflicts)op.conflicts=outcome.conflicts;
        if(outcome.phase)op.phase=outcome.phase;
      }
    };
    if(typeof navigator!=='undefined' && navigator.locks) {
      await navigator.locks.request('sandrini:commit:'+op.scope,{ifAvailable:true},async lock=>{
        if(!lock)throw new Error('Outra aba está confirmando uma operação. Aguarde; seus valores permanecem preservados.');
        await run();
      });
    } else await run();
  };
  const abandonOperation = async () => {
    if (!scope || inflight.current) return;
    const op=operationRef.current;
    if(op && !definitiveRejection(op)) {setSaveState('error');setSaveMsg('Resultado ainda desconhecido. Consulte o resultado antes de revisar; pacote e histórico preservados.');return;}
    if(op) {
      const current=sessionRef.current;
      const next:OpsSession={scope,baseVersion:official.version,requestId:uuid(),ops:mergeOps(op.ops,current?.scope===scope?current.ops:[]),submissionModel:'reviewed'};
      // Retain the exact rejected capture/requestId even after moving edits back to review.
      await saveDraftLocal('operation-archive:'+scope+':'+op.requestId,op);
      await saveDraftLocal('draft:'+scope,next);setSession(next);
    }
    await clearDraftLocal("operation:" + scope); operationRef.current = null; setPendingOperation(null);
    if(op?.conflicts)setConflicts(op.conflicts);
    void qc.invalidateQueries({ queryKey: ["official", user?.id, selOrg] });
  };

  // Manual recovery is a read, never saveOperation without a confirmed version.
  const checkPendingOperation = async () => {
    const op = operationRef.current;
    if (!op) return;
    const reason = confirmationBlockReason(op, { authenticated: !!user, authorized: official.status === 'ready' && op.orgId === official.orgId && op.scope === `${user?.id}:${official.orgId}` && active.isBase && canEdit, busy: inflight.current || checkingRef.current, online: typeof navigator === 'undefined' || navigator.onLine });
    if (reason) { setSaveMsg(reason); return; }
    checkingRef.current = true; setConfirmationChecking(true);
    try {
      const result = op.confirmation ?? await bounded(checkRequest({ data: { orgId: op.orgId, requestId: op.requestId } }), 5000);
      if (!result) {
        op.lastNotFoundAt = new Date().toISOString(); operationRef.current = op; setPendingOperation({ ...op }); await saveDraftLocal("operation:" + scope, op);
        setSaveState('error'); setSaveMsg('A consulta não encontrou confirmação. Isso não comprova que o envio terminou ou não ocorreu. Você pode consultar de novo ou reenviar o MESMO pacote (mesma identificação): se ele já tiver sido gravado, o servidor apenas confirma, sem duplicar.'); return;
      }
      // The same original request is reconciled, never a new ID or an old snapshot.
      await saveOperation(op, result.version);
    } catch (e) {
      setSaveState('error');
      setSaveMsg(op.confirmation ? 'Gravação confirmada; a atualização da tela falhou. Consulte novamente para atualizar sem reenviar.' : `Não foi possível consultar o resultado. Verifique a conexão ou entre novamente se o acesso expirou. ${(e as Error).message} Pacote e preenchimento preservados; nenhum novo envio.`);
    } finally { checkingRef.current = false; setConfirmationChecking(false); }
  };

  // A recovered packet without confirmation gets ONE automatic read-only consultation per requestId (never a resend):
  // a commit that succeeded while the response was lost is reconciled instead of leaving the unknown strip forever.
  useEffect(() => {
    const op = pendingOperation;
    if (!op || op.confirmation || op.rejected || !op.submittedAt || op.legacyUncertain || official.status !== 'ready' || inflight.current || checkingRef.current) return;
    if (autoChecked.current.has(op.requestId)) return;
    autoChecked.current.add(op.requestId);
    void checkPendingOperation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOperation, official.status]);

  // Explicit user action only: same requestId + same immutable ops. Idempotence is enforced by the server
  // pre-check and by commit_official (row lock, version check, unique request_id in audit).
  const resendPendingOperation = async () => {
    const op = operationRef.current;
    if (!op) return;
    const reason = confirmationBlockReason(op, { authenticated: !!user, authorized: official.status === 'ready' && op.orgId === official.orgId && op.scope === `${user?.id}:${official.orgId}` && active.isBase && canEdit, busy: inflight.current || checkingRef.current, online: typeof navigator === 'undefined' || navigator.onLine });
    if (reason) { setSaveMsg(reason); return; }
    if (op.confirmation || definitiveRejection(op) || !op.lastNotFoundAt || !op.ops.length || op.legacyUncertain) { setSaveMsg('Reenvio disponível somente após uma consulta sem confirmação de um pacote completo.'); return; }
    try { await saveOperation(op, undefined, true); }
    catch (e) { setSaveState('error'); setSaveMsg(`${(e as Error).message} Pacote e preenchimento preservados.`); }
  };

  // Global Save only captures a review. Submission shares the isolated authoritative path.
  const commitDraft = async () => {
    if(operationRef.current || inflight.current || !baseData || !scope || !canEdit)return;
    try {
      const current=sessionRef.current;
      if(!current || current.scope!==scope)return;
      const stored=await loadDraft<ReviewedOperation>('operation:'+scope);
      if(stored){operationRef.current=stored;setPendingOperation(stored);return;}
      for(const requestId of current.legacyRequestIds ?? []) {
        const result=await bounded(checkRequest({data:{orgId:official.orgId,requestId}}),5000);
        if(result){await saveOperation({scope:`${user?.id}:${official.orgId}`,orgId:official.orgId,requestId,ops:JSON.parse(result.opsJson) as Change[]},result.version);return;}
      }
      if(current.legacyRequestIds?.length) {
        setSaveState('error');setSaveMsg('Rascunho legado sem confirmação encontrada. Não há captura imutável que comprove se já foi enviado. Nenhum novo pacote será enviado; valores preservados para conferência.');return;
      }
      const pending=sessionRef.current?.ops ?? [];
      const ops=pending.filter(o=>o.entity!=='Recebimento');
      if(!ops.length)return;
      setGlobalReview({scope:`${user?.id}:${official.orgId}`,orgId:official.orgId,requestId:uuid(),ops:structuredClone(ops),recoveredPending:structuredClone(ops),phase:'reviewing',reviewRows:operationReview(ops,applyOps(baseData,ops,false).data)});
    } catch(e){setSaveState('error');setSaveMsg((e as Error).message);}
  };
  const resolveConflict = (c: Conflict, keep: "mine" | "server") => {
    const k = opKey(c.change);
    setSession((s) => { if (!s) return s; const ops = keep === "mine" ? s.ops.map((o) => (opKey(o) === k ? { ...o, before: c.server } : o)) : s.ops.filter((o) => opKey(o) !== k); return ops.length ? { ...s, ops, requestId: uuid() } : null; });
    setConflicts((l) => { const n = l.filter((x) => opKey(x.change) !== k); if (!n.length) { setSaveState("dirty"); setSaveMsg(c.change.entity==='Recebimento'?'Conflitos resolvidos — revise e salve na página Recebimentos.':"Conflitos resolvidos — clique em Salvar."); } return n; });
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
      if(operationRef.current || inflight.current)throw new Error('Há uma operação em confirmação. Confira o resultado na faixa de recuperação antes de revisar Recebimentos.');
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
    saveOperation, saveSimulationOperation, pendingOperation: pendingOperation?.scope === `${user?.id}:${official.orgId}` ? pendingOperation : null, abandonOperation,
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
