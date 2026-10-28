import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeData } from "./engine/actions";
import { diffData, summarize } from "./diff";
import type { ScenarioData } from "./engine/types";

// Base OFICIAL compartilhada: leitura sob RLS do próprio usuário; gravação apenas via servidor
// (verifica papel, versão esperada, idempotência e grava auditoria antes/depois).
async function myOrg(sb: { from: (t: string) => any }, userId: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await sb.from("org_members").select("org_id, role, organizations(name)").eq("user_id", userId).limit(1).maybeSingle();
  if (error) throw new Error("Falha ao ler organização.");
  if (!data) throw new Error("Usuário sem organização.");
  return data as { org_id: string; role: string; organizations: { name: string } | null };
}

export const getOfficial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await myOrg(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("official_data").select("data, version, updated_at").eq("org_id", m.org_id).single();
    if (error || !data) throw new Error("Falha ao ler base oficial.");
    return { orgId: m.org_id, orgName: m.organizations?.name ?? "", role: m.role, version: data.version, updatedAt: data.updated_at, data: normalizeData(data.data) as unknown as Record<string, unknown> };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await myOrg(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("audit_log").select("id, at, user_email, version_from, version_to, summary, changes").eq("org_id", m.org_id).order("at", { ascending: false }).limit(200);
    if (error) throw new Error("Falha ao ler auditoria.");
    return (data ?? []).map((r) => ({ ...r, changes: r.changes as unknown as Record<string, unknown>[] }));
  });

export const commitOfficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { expectedVersion: number; requestId: string; data: Record<string, unknown> }) => {
    if (!Number.isInteger(i?.expectedVersion) || typeof i.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(i.requestId) || typeof i.data !== "object") throw new Error("Entrada inválida.");
    return i;
  })
  .handler(async ({ data: input, context }) => {
    const m = await myOrg(context.supabase, context.userId);
    if (m.role !== "owner" && m.role !== "editor") return { status: "forbidden" as const, version: -1, summary: "" };
    const { data: cur, error } = await context.supabase.from("official_data").select("data, version").eq("org_id", m.org_id).single();
    if (error || !cur) throw new Error("Falha ao ler base oficial.");
    if (cur.version !== input.expectedVersion) return { status: "conflict" as const, version: cur.version, summary: "" };
    const next: ScenarioData = normalizeData(input.data);
    const changes = diffData(normalizeData(cur.data), next);
    if (!changes.length) return { status: "noop" as const, version: cur.version, summary: "sem alterações" };
    const summary = summarize(changes);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = typeof context.claims?.email === "string" ? context.claims.email : null;
    const { data: res, error: e2 } = await supabaseAdmin.rpc("commit_official", {
      _org: m.org_id, _user: context.userId, _email: email ?? "", _expected: input.expectedVersion,
      _data: next as never, _request: input.requestId, _summary: summary, _changes: changes as never,
    });
    if (e2) { console.error(e2); throw new Error("Falha ao gravar na base oficial."); }
    const r = res as { status: "ok" | "conflict" | "duplicate" | "forbidden"; version: number };
    return { status: r.status, version: r.version ?? -1, summary };
  });
