import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeData } from "./engine/actions";
import { applyOps, diffData, summarize, type Change } from "./diff";
import type { ScenarioData } from "./engine/types";
import { pickOrg } from "./team";
import { dependenciesMatch, type ReviewedOperation } from './operationSave';

// Base OFICIAL compartilhada: leitura sob RLS do próprio usuário; gravação apenas via servidor
// (verifica papel, versão esperada, idempotência e grava auditoria antes/depois).
// Organização escolhida EXPLICITAMENTE (orgId); sem escolha, só resolve se única ou a própria — nunca arbitrária.
async function myOrg(sb: { from: (t: string) => any }, userId: string, orgId?: string | null) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await sb.from("org_members").select("org_id, role, organizations(name, created_by)").eq("user_id", userId);
  if (error) throw new Error("Falha ao ler organização.");
  const list = ((data ?? []) as { org_id: string; role: string; organizations: { name: string; created_by: string } | null }[]).map((m) => ({ ...m, created_by: m.organizations?.created_by ?? null }));
  const m = pickOrg(list, userId, orgId);
  if (m === "choose") throw new Error("Selecione a organização.");
  if (!m) throw new Error(orgId ? "Sem acesso a esta organização." : "Usuário sem organização.");
  return m;
}
const orgIn = (i: { orgId?: string | null } | undefined) => { const o = i?.orgId ?? null; if (o !== null && !/^[0-9a-f-]{36}$/i.test(o)) throw new Error("Entrada inválida."); return { orgId: o }; };

export const getOfficial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgIn)
  .handler(async ({ data: input, context }) => {
    const m = await myOrg(context.supabase, context.userId, input.orgId);
    const { data, error } = await context.supabase.from("official_data").select("data, version, updated_at").eq("org_id", m.org_id).single();
    if (error || !data) throw new Error("Falha ao ler os dados da organização.");
    return { orgId: m.org_id, orgName: m.organizations?.name ?? "", role: m.role, version: data.version, updatedAt: data.updated_at, dataJson: JSON.stringify(normalizeData(data.data)) };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgIn)
  .handler(async ({ data: input, context }) => {
    const m = await myOrg(context.supabase, context.userId, input.orgId);
    const { data, error } = await context.supabase.from("audit_log").select("id, at, user_email, version_from, version_to, summary, changes").eq("org_id", m.org_id).order("at", { ascending: false }).limit(200);
    if (error) throw new Error("Falha ao ler auditoria.");
    return (data ?? []).map((r) => ({ id: r.id, at: r.at, user_email: r.user_email, version_from: r.version_from, version_to: r.version_to, summary: r.summary, changesJson: JSON.stringify(r.changes) }));
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
    const { data: cur, error } = await context.supabase.from("official_data").select("data, version").eq("org_id", m.org_id).single();
    if (error || !cur) throw new Error("Falha ao ler os dados da organização.");
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
    if (e2) { console.error(e2); throw new Error("Falha ao gravar."); }
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
    if (m.role !== "owner" && m.role !== "editor") return { status: "forbidden" as const, version: -1, conflictsJson: "[]" };
    const { data: done } = await context.supabase.from("audit_log").select("version_to").eq("org_id", m.org_id).eq("request_id", input.requestId).maybeSingle();
    if (done) return { status: "duplicate" as const, version: done.version_to as number, conflictsJson: "[]" };
    let ops: Change[];
    try { ops = JSON.parse(input.opsJson) as Change[]; if (!Array.isArray(ops)) throw new Error(); } catch { throw new Error("Dados inválidos."); }
    const { data: cur, error } = await context.supabase.from("official_data").select("data, version").eq("org_id", m.org_id).single();
    if (error || !cur) throw new Error("Falha ao ler os dados da organização.");
    if(input.dependenciesJson) {
      const dependencies=JSON.parse(input.dependenciesJson) as ReviewedOperation['dependencies'];
      if(!Array.isArray(dependencies))throw new Error('Dependências inválidas.');
      if(!dependenciesMatch(normalizeData(cur.data),{scope:'',orgId:m.org_id,requestId:input.requestId,ops,dependencies})) {
        return {status:'conflict' as const,version:cur.version,conflictsJson:JSON.stringify(ops.map(change=>({change,server:'Dependências alteradas (título, pagamentos ou vínculo). Releia e revise.'})))};
      }
    }
    const r = applyOps(normalizeData(cur.data), ops, true);
    if (r.conflicts.length) return { status: "conflict" as const, version: cur.version, conflictsJson: JSON.stringify(r.conflicts) };
    if (!r.applied.length) return { status: "noop" as const, version: cur.version, conflictsJson: "[]" };
    const summary = summarize(r.applied);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = typeof context.claims?.email === "string" ? context.claims.email : null;
    const { data: res, error: e2 } = await supabaseAdmin.rpc("commit_official", {
      _org: m.org_id, _user: context.userId, _email: email ?? "", _expected: cur.version,
      _data: normalizeData(r.data) as never, _request: input.requestId, _summary: summary, _changes: r.applied as never,
    });
    if (e2) { console.error(e2); throw new Error("Falha ao gravar."); }
    const x = res as { status: "ok" | "conflict" | "duplicate" | "forbidden"; version: number };
    // "conflict" aqui = outra gravação entrou entre a leitura e o bloqueio; o cliente repete (mesmo requestId).
    return { status: x.status === "conflict" ? ("retry" as const) : x.status, version: x.version ?? -1, conflictsJson: "[]" };
  });
