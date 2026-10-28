import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVITE_MAX_DAYS } from "./team";

// Equipe: convites individuais com token aleatório (só o hash SHA-256 é armazenado), sem envio de e-mail.
// Toda autorização é refeita nas funções SQL team_* (service-role), que conferem papel owner no banco.
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const emailOf = (c: { claims?: Record<string, unknown> }) => (typeof c.claims?.["email"] === "string" ? (c.claims["email"] as string) : "");
async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }

export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("org_members").select("org_id, role, organizations(name, created_by)").eq("user_id", context.userId).order("created_at");
    if (error) throw new Error("Falha ao listar organizações.");
    return (data ?? []).map((m) => ({ orgId: m.org_id, role: m.role, name: m.organizations?.name ?? "", own: m.organizations?.created_by === context.userId }));
  });

export const getTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string }) => { if (!isUuid(i?.orgId)) throw new Error("Entrada inválida."); return i; })
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase.from("org_members").select("role").eq("org_id", data.orgId).eq("user_id", context.userId).maybeSingle();
    if (me?.role !== "owner") return { allowed: false as const, members: [], invites: [], log: [] };
    const sb = await admin();
    const [m, i, l] = await Promise.all([
      sb.rpc("team_members", { _org: data.orgId, _actor: context.userId }),
      context.supabase.from("org_invites").select("id, email, role, expires_at, created_at, accepted_at, revoked_at").eq("org_id", data.orgId).order("created_at", { ascending: false }),
      context.supabase.from("access_log").select("id, at, actor_email, action, target_email, target_user, role").eq("org_id", data.orgId).order("at", { ascending: false }).limit(100),
    ]);
    if (m.error || i.error || l.error) throw new Error("Falha ao ler equipe.");
    return { allowed: true as const, members: m.data ?? [], invites: i.data ?? [], log: l.data ?? [] };
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string; email: string; role: "editor" | "viewer"; days: number }) => {
    if (!isUuid(i?.orgId) || typeof i.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim()) || i.email.length > 255 || !["editor", "viewer"].includes(i.role) || !Number.isInteger(i.days) || i.days < 1 || i.days > INVITE_MAX_DAYS) throw new Error("Entrada inválida.");
    return i;
  })
  .handler(async ({ data, context }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expires = new Date(Date.now() + data.days * 86400000).toISOString();
    const { data: r, error } = await (await admin()).rpc("team_create_invite", { _org: data.orgId, _actor: context.userId, _actor_email: emailOf(context), _email: data.email, _role: data.role, _hash: await sha256(token), _expires: expires });
    if (error) throw new Error("Falha ao criar convite.");
    const s = (r as { status: string }).status;
    return s === "ok" ? { status: "ok" as const, token, expires } : { status: s, token: "", expires: "" };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string; inviteId: string }) => { if (!isUuid(i?.orgId) || !isUuid(i.inviteId)) throw new Error("Entrada inválida."); return i; })
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (await admin()).rpc("team_revoke_invite", { _org: data.orgId, _actor: context.userId, _actor_email: emailOf(context), _invite: data.inviteId });
    if (error) throw new Error("Falha ao revogar.");
    return (r as { status: string }).status;
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string; userId: string }) => { if (!isUuid(i?.orgId) || !isUuid(i.userId)) throw new Error("Entrada inválida."); return i; })
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (await admin()).rpc("team_remove_member", { _org: data.orgId, _actor: context.userId, _actor_email: emailOf(context), _user: data.userId });
    if (error) throw new Error("Falha ao revogar acesso.");
    return (r as { status: string }).status;
  });

const tokenOk = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(t);
export const inviteInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { token: string }) => { if (!tokenOk(i?.token)) throw new Error("Convite inválido."); return i; })
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (await admin()).rpc("team_invite_info", { _hash: await sha256(data.token) });
    if (error) throw new Error("Falha ao ler convite.");
    const x = r as { status: string; org_name?: string; email?: string; role?: string; expires_at?: string; state?: string };
    return { ...x, emailMatches: !!x.email && x.email === emailOf(context).toLowerCase() };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { token: string; confirm: true }) => { if (!tokenOk(i?.token) || i.confirm !== true) throw new Error("Confirmação explícita necessária."); return i; })
  .handler(async ({ data, context }) => {
    const { data: r, error } = await (await admin()).rpc("team_accept_invite", { _hash: await sha256(data.token), _user: context.userId, _email: emailOf(context) });
    if (error) throw new Error("Falha ao aceitar convite.");
    return r as { status: string; org_id?: string };
  });
