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
// Empresa compartilhada aprovada: só tem prioridade para quem já é membro.
export const SHARED_ORG_ID = "e197262e-1453-49b0-aad9-878e80602ee4";
/** Membros da empresa compartilhada não voltam à organização pessoal por preferência antiga. */
export function pickOrg<T extends { org_id: string; created_by?: string | null }>(list: T[], userId: string, orgId?: string | null): T | "choose" | null {
  const shared = list.find((m) => m.org_id === SHARED_ORG_ID);
  if (shared) return shared;
  if (orgId) return list.find((m) => m.org_id === orgId) ?? null;
  if (list.length === 1) return list[0] ?? null;
  return list.find((m) => m.created_by === userId) ?? (list.length ? "choose" : null);
}
export const ACCEPT_MSG: Record<string, string> = {
  ok: "Convite aceito.", revoked: "Convite revogado.", used: "Convite já utilizado.", expired: "Convite expirado.",
  email_mismatch: "Este convite é para outro e-mail. Entre com a conta do e-mail convidado.", not_found: "Convite inexistente.", already_member: "Você já é membro desta organização.",
};
