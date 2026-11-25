import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeData } from "./engine/actions";
import { diffData, summarize, type Change } from "./diff";
import type { ScenarioData } from "./engine/types";
import { canCommitRole, pickOrg, SHARED_ORG_ID } from "./team";
import { type ReviewedOperation } from './operationSave';
import { NORMALIZATION_REVISION } from './commitReceipt';
import { prepareCommit, settleAfterRecheck } from './commitCore';
import { encodeAudit } from './auditTransport';
import { encodeLargeJson } from './largeJsonTransport';
import { currentValueOf, samePayload } from './operationQueue';

// Base OFICIAL compartilhada: leitura sob RLS do próprio usuário; gravação apenas via servidor
// (verifica papel, versão esperada, idempotência e grava auditoria antes/depois).
// Organização escolhida EXPLICITAMENTE (orgId); sem escolha, só resolve se única ou a própria — nunca arbitrária.
async function myOrg(sb: { from: (t: string) => any }, userId: string, orgId?: string | null) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (orgId && orgId !== SHARED_ORG_ID) throw new Error("Este app utiliza somente a organização oficial. Rascunhos de outra organização não podem ser enviados aqui.");
  const { data, error } = await sb.from("org_members").select("org_id, role, organizations(name, created_by)").eq("user_id", userId);
  if (error) throw new Error("Falha ao ler organização.");
  const list = ((data ?? []) as { org_id: string; role: string; organizations: { name: string; created_by: string } | null }[]).map((m) => ({ ...m, created_by: m.organizations?.created_by ?? null }));
  const m = pickOrg(list, userId, orgId);
  if (m === "choose") throw new Error("Selecione a organização.");
  if (!m) throw new Error("Sem acesso ao Grupo Sandrini oficial. Solicite acesso ou convite ao administrador.");
  return m;
}
// Large reads (official document ~12 MB, audit with changes) exceed the 8 s authenticated statement timeout under load.
// Only AFTER myOrg confirmed the caller's active membership via the caller's own RLS client, the server reads
// exactly that org_id with the service connection. Never exposed to the browser; no RLS/grant change.
async function adminRead() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function readOfficialDoc(orgId: string) {
  const admin = await adminRead();
  const { data, error } = await admin.from("official_data").select("data, version, updated_at").eq("org_id", orgId).single();
  if (error || !data) { console.error("sandrini.official.read", { code: error?.code }); throw new Error("Falha ao ler os dados da organização."); }
  return data;
}
async function auditedRequest(sb: { from: (t: string) => any }, orgId: string, requestId: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await sb.from("audit_log").select("version_to, changes").eq("org_id", orgId).eq("request_id", requestId).maybeSingle();
  if (error) throw new Error("Não foi possível conferir o envio anterior. Nenhuma nova escrita.");
  return data as { version_to: number; changes: Change[] } | null;
}
const orgIn = (i: { orgId?: string | null } | undefined) => { const o = i?.orgId ?? null; if (o !== null && !/^[0-9a-f-]{36}$/i.test(o)) throw new Error("Entrada inválida."); return { orgId: o }; };

export const getOfficial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgIn)
  .handler(async ({ data: input, context }) => {
    const m = await myOrg(context.supabase, context.userId, input.orgId);
    const data = await readOfficialDoc(m.org_id);
    return { orgId: m.org_id, orgName: m.organizations?.name ?? "", role: m.role, version: data.version, updatedAt: data.updated_at, normalization: NORMALIZATION_REVISION, dataJson: encodeLargeJson(JSON.stringify(normalizeData(data.data))) };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgIn)
  .handler(async ({ data: input, context }) => {
    const m = await myOrg(context.supabase, context.userId, input.orgId);
    // Loaded on demand only (History screens/panels); ~18 MB with changes, so read after membership check.
    const admin = await adminRead();
    const { data, error } = await admin.from("audit_log").select("id, at, user_email, version_from, version_to, summary, changes").eq("org_id", m.org_id).order("at", { ascending: false }).limit(200);
    if (error) { console.error("sandrini.audit.read", { code: error.code }); throw new Error("Falha ao ler auditoria."); }
    return encodeAudit(data ?? []);
  });

// Read-only reconciliation for legacy global drafts; absence never authorizes a write itself.
export const checkCommitRequest = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {orgId: string; requestId: string}) => {
    orgIn(i);
    if (!/^[0-9a-f-]{36}$/i.test(i.requestId)) throw new Error('Identificação inválida.');
    return i;
  })
  .handler(async ({data:input,context}) => {
    const m=await myOrg(context.supabase,context.userId,input.orgId);
    const {data,error}=await context.supabase.from('audit_log').select('version_to, changes').eq('org_id',m.org_id).eq('request_id',input.requestId).maybeSingle();
    if(error)throw new Error('Não foi possível conferir a confirmação anterior. Preenchimento preservado; nenhum novo envio.');
    return data ? {version:data.version_to,opsJson:encodeLargeJson(JSON.stringify(data.changes))} : null;
  });

export const commitOfficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string | null; expectedVersion: number; requestId: string; dataJson: string }) => {
    orgIn(i);
    if (!Number.isInteger(i?.expectedVersion) || typeof i.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(i.requestId) || typeof i.dataJson !== "string" || i.dataJson.length > 20_000_000) throw new Error("Entrada inválida.");
    return i;
  })
  .handler(async ({ data: input, context }) => {
    const m = await myOrg(context.supabase, context.userId, input.orgId);
    if (m.role !== "owner" && m.role !== "editor") return { status: "forbidden" as const, version: -1, summary: "" };
    const cur = await readOfficialDoc(m.org_id);
    if (cur.version !== input.expectedVersion) return { status: "conflict" as const, version: cur.version, summary: "" };
    let parsed: unknown;
    try { parsed = JSON.parse(input.dataJson); } catch { throw new Error("Dados inválidos."); }
    const next: ScenarioData = normalizeData(parsed);
    const changes = diffData(normalizeData(cur.data), next);
    if (!changes.length) return { status: "noop" as const, version: cur.version, summary: "sem alterações" };
    const summary = summarize(changes);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = typeof context.claims?.email === "string" ? context.claims.email : null;
    const { data: res, error: e2 } = await supabaseAdmin.rpc("commit_official", {
      _org: m.org_id, _user: context.userId, _email: email ?? "", _expected: input.expectedVersion,
      _data: next as never, _request: input.requestId, _summary: summary, _changes: changes as never,
    });
    if (e2) { console.error('sandrini.commit.failure', {code:e2.code}); throw new Error("Falha ao gravar."); }
    const r = res as { status: "ok" | "conflict" | "duplicate" | "forbidden"; version: number };
    return { status: r.status, version: r.version ?? -1, summary };
  });

// Gravação por alterações: o cliente envia só os registros alterados (com o "antes" de quando editou).
// Antes de aplicar, confirma se este envio (requestId) já foi gravado — repetição após falha não duplica.
// Alterações independentes de outras pessoas são preservadas; mesma informação alterada → conflito para decisão.
export const commitOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string | null; requestId: string; opsJson: string; dependenciesJson?: string }) => {
    orgIn(i);
    if (typeof i?.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(i.requestId) || typeof i.opsJson !== "string" || i.opsJson.length > 20_000_000) throw new Error("Entrada inválida.");
    if(i.dependenciesJson !== undefined && (typeof i.dependenciesJson !== 'string' || i.dependenciesJson.length > 20_000_000)) throw new Error('Dependências inválidas.');
    return i;
  })
  .handler(async ({ data: input, context }) => {
    const m = await myOrg(context.supabase, context.userId, input.orgId);
    if (!canCommitRole(m.role)) return { status: "forbidden" as const, version: -1, conflictsJson: "[]" };
    let ops: Change[];
    try { ops = JSON.parse(input.opsJson) as Change[]; if (!Array.isArray(ops)) throw new Error(); } catch { throw new Error("Dados inválidos."); }
    const done = await auditedRequest(context.supabase, m.org_id, input.requestId);
    if (done) {
      // Same organization+requestId must carry the same payload; a different content under a reused ID is refused.
      const cur = await readOfficialDoc(m.org_id); const curData = normalizeData(cur.data);
      if (!samePayload(done.changes ?? [], ops, c => currentValueOf(curData, c))) return { status: "payload_mismatch" as const, version: done.version_to, conflictsJson: "[]" };
      return { status: "duplicate" as const, version: done.version_to, conflictsJson: "[]" };
    }
    const dependencies = input.dependenciesJson ? JSON.parse(input.dependenciesJson) as ReviewedOperation['dependencies'] : undefined;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = typeof context.claims?.email === "string" ? context.claims.email : null;
    // A version race inside commit_official is a CERTAIN non-write (row lock + version check), so the server
    // re-reads and re-validates the same request a bounded number of times. Uncertain outcomes are never retried here.
    for (let attempt = 0; ; attempt++) {
      const cur = await readOfficialDoc(m.org_id);
      const prepared = await prepareCommit(cur.data, m.org_id, input.requestId, ops, dependencies, email ?? '');
      // A concurrent copy of this same request may have committed meanwhile: re-check before reporting conflict/noop.
      if (prepared.status === "conflict") return settleAfterRecheck({ status: "conflict" as const, version: cur.version, conflictsJson: encodeLargeJson(prepared.conflictsJson), receipt: undefined }, await auditedRequest(context.supabase, m.org_id, input.requestId));
      if (prepared.status === "noop") return settleAfterRecheck({ status: "noop" as const, version: cur.version, conflictsJson: "[]", receipt: undefined }, await auditedRequest(context.supabase, m.org_id, input.requestId));
      const { next, applied, summary, changesJson, digest } = prepared;
      // commit_official re-checks role, locks the row, compares version and is unique per request_id (audit).
      const { data: res, error: e2 } = await supabaseAdmin.rpc("commit_official", {
        _org: m.org_id, _user: context.userId, _email: email ?? "", _expected: cur.version,
        _data: next as never, _request: input.requestId, _summary: summary, _changes: applied as never,
      });
      if (e2) { console.error('sandrini.commit.failure', {code:e2.code}); throw new Error("Falha ao gravar."); }
      const x = res as { status: "ok" | "conflict" | "duplicate" | "forbidden"; version: number };
      if (x.status === "conflict") {
        const settled = settleAfterRecheck({ status: "retry" as const, version: x.version ?? -1, conflictsJson: "[]", receipt: undefined }, await auditedRequest(context.supabase, m.org_id, input.requestId));
        if (settled.status === "retry" && attempt < 2) continue;
        return settled;
      }
      // SQL stores exactly _data and confirms expected+1; duplicates must be reconciled by reading.
      const receipt = x.status === 'ok' && x.version === cur.version + 1 ? {
        orgId: m.org_id, userId: context.userId, requestId: input.requestId, fromVersion: cur.version,
        version: x.version, normalization: NORMALIZATION_REVISION, changesJson: encodeLargeJson(changesJson), digest,
      } : undefined;
      return { status: x.status, version: x.version ?? -1, conflictsJson: "[]", receipt };
    }
  });
