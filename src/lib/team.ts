// Regras puras de compartilhamento (espelham as funções SQL team_* que são a autoridade no servidor).
export type Role = "owner" | "editor" | "viewer";
export const canWrite = (r: string | null | undefined) => r === "owner" || r === "editor";
export const canManageTeam = (r: string | null | undefined) => r === "owner";
export const INVITE_MAX_DAYS = 30;

export interface InviteState { email: string; expiresAt: string; revokedAt: string | null; acceptedAt: string | null }
export type AcceptCheck = "ok" | "revoked" | "used" | "expired" | "email_mismatch";
export function checkAccept(inv: InviteState, userEmail: string | null | undefined, now: Date): AcceptCheck {
  if (inv.revokedAt) return "revoked";
  if (inv.acceptedAt) return "used";
  if (new Date(inv.expiresAt) <= now) return "expired";
  if (!userEmail || userEmail.trim().toLowerCase() !== inv.email) return "email_mismatch";
  return "ok";
}
export function canRemove(members: { userId: string; role: string }[], target: string): "ok" | "last_owner" | "invalid" {
  const t = members.find((m) => m.userId === target);
  if (!t) return "invalid";
  if (t.role === "owner" && members.filter((m) => m.role === "owner").length <= 1) return "last_owner";
  return "ok";
}
/** Escolha de organização: explícita; sem escolha só resolve se houver uma única ou a própria (criada pelo usuário). */
export function pickOrg<T extends { org_id: string; created_by?: string | null }>(list: T[], userId: string, orgId?: string | null): T | "choose" | null {
  if (orgId) return list.find((m) => m.org_id === orgId) ?? null;
  if (list.length === 1) return list[0]!;
  return list.find((m) => m.created_by === userId) ?? (list.length ? "choose" : null);
}
export const ACCEPT_MSG: Record<string, string> = {
  ok: "Convite aceito.", revoked: "Convite revogado.", used: "Convite já utilizado.", expired: "Convite expirado.",
  email_mismatch: "Este convite é para outro e-mail. Entre com a conta do e-mail convidado.", not_found: "Convite inexistente.", already_member: "Você já é membro desta organização.",
};
