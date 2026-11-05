import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// Entrada sem login / com erro: nenhum dado financeiro, nenhum seletor demo/oficial.
const state: { v: Record<string, unknown> } = { v: {} };
vi.mock("@/lib/store", () => ({ useApp: () => state.v }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useRouterState: () => "/",
}));
import { AppShell } from "@/components/AppShell";

const base = { orgs: [], setOrgId: () => {}, signOut: async () => {}, sims: [], setActive: () => {}, draft: null, changes: [], saveState: "idle", saveMsg: "", baseMoved: false, draftBaseVersion: null,
  base: { id: "base", name: "", isBase: true, data: { suppliers: [], planned: [], committed: [], expenses: [], receipts: [], targets: {} } }, active: { id: "base", isBase: true, name: "" } };
const DATA = "SALDO-SECRETO";

describe("Entrada do sistema", () => {
  it("sem login mostra só a entrada profissional, sem dados nem seletor demo/oficial", () => {
    state.v = { ...base, user: null, authReady: true, official: { status: "signed_out", orgId: "", orgName: "", role: "", version: -1, error: "" } };
    render(<AppShell><p>{DATA}</p></AppShell>);
    expect(screen.getByText("Entrar")).toBeTruthy();
    expect(screen.queryByText(DATA)).toBeNull();
    expect(document.body.textContent).not.toMatch(/demonstrativ|base oficial|Cloud|Espaço de dados/i);
  });
  it("erro ao carregar a organização não exibe dados (sem fallback)", () => {
    state.v = { ...base, user: { id: "u", email: "a@b.c" }, authReady: true, official: { status: "error", orgId: "", orgName: "", role: "", version: -1, error: "falha" } };
    render(<AppShell><p>{DATA}</p></AppShell>);
    expect(screen.queryByText(DATA)).toBeNull();
    expect(document.body.textContent).toMatch(/Não foi possível abrir/);
  });
  it("logado: barra lateral com modo de trabalho Real/Simulação e usuário, sem 'Espaço de dados'", () => {
    state.v = { ...base, user: { id: "u", email: "a@b.c" }, authReady: true, official: { status: "ready", orgId: "o", orgName: "Sandrini", role: "owner", version: 1, error: "" } };
    render(<AppShell><p>{DATA}</p></AppShell>);
    expect(screen.getByText(DATA)).toBeTruthy();
    expect(screen.getByLabelText("Modo de trabalho")).toBeTruthy();
    expect(screen.getByText("a@b.c", { exact: false })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Espaço de dados|demonstrativ|Base oficial|Cloud/i);
  });
});
