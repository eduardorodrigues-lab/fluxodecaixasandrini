import { describe, expect, it } from "vitest";
import { canManageTeam, canRemove, canWrite, checkAccept, pickOrg, SHARED_ORG_ID } from "./team";

const now = new Date("2026-10-28T12:00:00Z");
const inv = { email: "a@x.com", expiresAt: "2026-10-29T00:00:00Z", revokedAt: null, acceptedAt: null };
describe("Compartilhamento (regras espelhadas das funções do servidor)", () => {
  it("Eduardo e Letícia resolvem a mesma empresa importada mesmo com preferência pela antiga", () => {
    const shared = { org_id: "e197262e-1453-49b0-aad9-878e80602ee4", created_by: "eduardo" };
    expect(pickOrg([shared], "eduardo")).toEqual(shared);
    expect(pickOrg([{ org_id: "antiga", created_by: "leticia" }, shared], "leticia", "antiga")).toEqual(shared);
  });
  it("viewer membro resolve a empresa; usuário externo não ganha acesso", () => {
    expect(pickOrg([{ org_id: SHARED_ORG_ID, role: "viewer" }], "viewer")).toEqual({ org_id: SHARED_ORG_ID, role: "viewer" });
    expect(pickOrg([{ org_id: "externa" }], "externo", SHARED_ORG_ID)).toBeNull();
  });
  it("viewer não grava; editor e owner gravam; só owner gerencia equipe", () => {
    expect(canWrite("viewer")).toBe(false); expect(canWrite("editor")).toBe(true); expect(canWrite(null)).toBe(false);
    expect(canManageTeam("editor")).toBe(false); expect(canManageTeam("owner")).toBe(true);
  });
  it("convite: outro e-mail, expirado, revogado e reutilizado são recusados", () => {
    expect(checkAccept(inv, "A@x.com ", now)).toBe("ok");
    expect(checkAccept(inv, "b@x.com", now)).toBe("email_mismatch");
    expect(checkAccept({ ...inv, expiresAt: "2026-10-28T11:59:59Z" }, "a@x.com", now)).toBe("expired");
    expect(checkAccept({ ...inv, revokedAt: "x" }, "a@x.com", now)).toBe("revoked");
    expect(checkAccept({ ...inv, acceptedAt: "x" }, "a@x.com", now)).toBe("used");
  });
  it("não remove o último owner", () => {
    expect(canRemove([{ userId: "o", role: "owner" }, { userId: "v", role: "viewer" }], "o")).toBe("last_owner");
    expect(canRemove([{ userId: "o", role: "owner" }, { userId: "v", role: "viewer" }], "v")).toBe("ok");
  });
  it("organização: seleção explícita; não membro não resolve; múltiplas sem escolha não é arbitrário", () => {
    const l = [{ org_id: "A", created_by: "u" }, { org_id: "B", created_by: "z" }];
    expect(pickOrg(l, "u", "B")).toEqual(l[1]);
    expect(pickOrg(l, "u", "C")).toBeNull();
    expect(pickOrg(l, "u")).toEqual(l[0]);
    expect(pickOrg([{ org_id: "B", created_by: "z" }, { org_id: "C", created_by: "y" }], "u")).toBe("choose");
  });
});
