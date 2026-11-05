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
      context.supabase.from("org_invites").select("id, full_name, sector, email, role, expires_at, created_at, accepted_at, revoked_at").eq("org_id", data.orgId).order("created_at", { ascending: false }),
      context.supabase.from("access_log").select("id, at, actor_email, action, target_email, target_user, role").eq("org_id", data.orgId).order("at", { ascending: false }).limit(100),
    ]);
    if (m.error || i.error || l.error) throw new Error("Falha ao ler equipe.");
    return { allowed: true as const, members: m.data ?? [], invites: i.data ?? [], log: l.data ?? [] };
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string; email: string; role: "editor" | "viewer"; days: number; name: string; sector: string }) => {
    if (typeof i?.name !== "string" || !i.name.trim() || i.name.length > 120 || typeof i.sector !== "string" || !i.sector.trim() || i.sector.length > 80) throw new Error("Informe nome e setor.");
    if (!isUuid(i?.orgId) || typeof i.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim()) || i.email.length > 255 || !["editor", "viewer"].includes(i.role) || !Number.isInteger(i.days) || i.days < 1 || i.days > INVITE_MAX_DAYS) throw new Error("Entrada inválida.");
    return i;
  })
  .handler(async ({ data, context }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expires = new Date(Date.now() + data.days * 86400000).toISOString();
    const { data: r, error } = await (await admin()).rpc("team_create_invite", { _org: data.orgId, _actor: context.userId, _actor_email: emailOf(context), _email: data.email, _role: data.role, _hash: await sha256(token), _expires: expires, _name: data.name.trim(), _sector: data.sector.trim() });
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

// Cadastro SOMENTE por convite: a conta é criada no servidor com o e-mail do convite (sem autoinscrição pública).
export const publicInviteInfo = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => { if (!tokenOk(i?.token)) throw new Error("Convite inválido."); return i; })
  .handler(async ({ data }) => {
    const { data: r, error } = await (await admin()).rpc("team_invite_info", { _hash: await sha256(data.token) });
    if (error) throw new Error("Falha ao ler convite.");
    return r as { status: string; org_name?: string; email?: string; role?: string; expires_at?: string; state?: string; full_name?: string; sector?: string };
  });

export const registerFromInvite = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; password: string }) => { if (!tokenOk(i?.token) || typeof i.password !== "string" || i.password.length < 8 || i.password.length > 72) throw new Error("Senha inválida (mín. 8)."); return i; })
  .handler(async ({ data }) => {
    const sb = await admin(); const hash = await sha256(data.token);
    const { data: info } = await sb.rpc("team_invite_info", { _hash: hash });
    const x = info as { status: string; state?: string; email?: string; full_name?: string; sector?: string };
    if (x.status !== "ok" || x.state !== "pendente" || !x.email) return { status: "invalid" };
    const { data: u, error } = await sb.auth.admin.createUser({ email: x.email, password: data.password, email_confirm: true, app_metadata: { invited: true }, user_metadata: { full_name: x.full_name, sector: x.sector } });
    if (error || !u.user) return { status: /already|registered|exists/i.test(error?.message ?? "") ? "exists" : "error" };
    const { data: r, error: e2 } = await sb.rpc("team_accept_invite", { _hash: hash, _user: u.user.id, _email: x.email });
    if (e2) return { status: "error" };
    return { status: (r as { status: string }).status, email: x.email };
  });

// Primeiro acesso: só existe enquanto o sistema não tem nenhuma conta (cria o owner da organização).
async function hasUsers() { const { data } = await (await admin()).auth.admin.listUsers({ page: 1, perPage: 1 }); return (data?.users?.length ?? 0) > 0; }
export const setupNeeded = createServerFn({ method: "GET" }).handler(async () => ({ needed: !(await hasUsers()) }));
export const createFirstOwner = createServerFn({ method: "POST" })
  .inputValidator((i: { name: string; email: string; password: string }) => {
    if (typeof i?.name !== "string" || !i.name.trim() || i.name.length > 120 || typeof i.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim()) || typeof i.password !== "string" || i.password.length < 8 || i.password.length > 72) throw new Error("Dados inválidos.");
    return i;
  })
  .handler(async ({ data }) => {
    if (await hasUsers()) return { status: "closed" };
    const { error } = await (await admin()).auth.admin.createUser({ email: data.email.trim().toLowerCase(), password: data.password, email_confirm: true, user_metadata: { full_name: data.name.trim() } });
    return { status: error ? "error" : "ok" };
  });
