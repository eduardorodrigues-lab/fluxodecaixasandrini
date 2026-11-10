import { askConfirm } from "@/lib/decisions";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ScenarioData } from "@/lib/engine/types";
import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useApp } from "@/lib/store";

const NAV = [
  { to: "/", label: "Fluxo" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/lancamentos", label: "Lançamentos" },
  { to: "/despesas", label: "Relatório de despesas" },
  { to: "/recebimentos", label: "Recebimentos" },
  { to: "/bancos", label: "Bancos" },
  { to: "/metas", label: "Meta de Faturamento" },
  { to: "/referencias", label: "Referências" },
  { to: "/simulacoes", label: "Simulações" },
  { to: "/historico", label: "Histórico / Auditoria" },
  { to: "/equipe", label: "Equipe e acesso" },
] as const;

const NAV_KEY = "fluxo.nav.hidden";

export function AppShell({ children }: { children: ReactNode }) {
  const { orgs, setOrgId, user, authReady, signOut, official, base, active, sims, setActive, draft, saveState, saveMsg, reloadOfficial } = useApp();
  const simMode = !active.isBase;
  // Barra lateral ocultável: a preferência fica só neste navegador (não é dado da organização).
  const [navHidden, setNavHidden] = useState(false);
  useEffect(() => {
    try { setNavHidden(localStorage.getItem(NAV_KEY) === "1"); } catch { /* navegador sem armazenamento */ }
  }, []);
  const toggleNav = () => {
    const next = !navHidden;
    setNavHidden(next);
    try { localStorage.setItem(NAV_KEY, next ? "1" : "0"); } catch { /* navegador sem armazenamento */ }
  };
  const path = useRouterState({ select: (s) => s.location.pathname });
  const publicPage = path === "/auth" || path === "/convite";
  // Sem login: só a tela de entrada (ou aceite de convite). Nenhum dado financeiro é exibido.
  if (!user) return <Gate>{!authReady ? <p className="text-xs text-muted-foreground">Verificando acesso…</p> : publicPage ? children : <Entry />}</Gate>;
  if (official.status !== "ready" && !publicPage) return <Gate><div className="card w-full max-w-md p-4 text-sm"><p className="mb-2">{official.status === "error" ? `Não foi possível abrir os dados da organização: ${official.error}` : "Carregando dados da organização…"}</p><p className="mb-3 text-xs text-muted-foreground">Conectado como {user.email}. Nenhum dado é exibido até a organização carregar.</p>{orgs.length > 1 && <select aria-label="Organização" className="mb-2 w-full rounded border border-border px-1.5 py-1 text-xs" value={official.orgId} onChange={(e) => setOrgId(e.target.value)}><option value="">— selecione a organização —</option>{orgs.map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}</select>}<button className="btn" onClick={() => signOut()}>Sair</button></div></Gate>;
  return (
    <div className="flex min-h-screen">
      {navHidden ? (
        <div className={`sticky top-0 flex h-screen w-8 shrink-0 flex-col items-center border-r border-sidebar-border py-2 ${simMode ? "bg-destructive" : "bg-sidebar"}`}>
          <button className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent" title="Mostrar menu" aria-label="Mostrar menu" onClick={toggleNav}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
      <aside className={`sticky top-0 flex h-screen w-52 shrink-0 flex-col ${simMode ? "bg-destructive text-destructive-foreground" : "bg-sidebar text-sidebar-foreground"}`}>
        <div className="flex items-start justify-between gap-2 border-b border-sidebar-border px-4 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-sidebar-primary">Grupo Sandrini</div>
            <div className="text-sm font-semibold">Fluxo de Caixa</div>
            {simMode && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider">Modo simulação</div>}
          </div>
          <button className="mt-0.5 rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent" title="Ocultar menu" aria-label="Ocultar menu" onClick={toggleNav}>
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-auto p-2">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="block rounded px-3 py-1.5 text-xs hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" }}>{n.label}</Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3 text-[11px]">
          {orgs.length > 1 && <>
            <label className="block text-sidebar-primary" htmlFor="org-sel">Organização</label>
            <select id="org-sel" className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={official.orgId} onChange={async (e) => { const next = e.target.value; if (!draft || await askConfirm("Há alterações ainda sendo salvas. Trocar de organização agora pode perdê-las.", { title: "Trocar organização?", action: "Trocar organização" })) setOrgId(next); }}>
              {!official.orgId && <option value="">— selecione —</option>}
              {orgs.map((o) => <option key={o.orgId} value={o.orgId}>{o.name} ({o.own ? "própria" : "convidada"} · {o.role})</option>)}
            </select></>}
          <label className="block text-sidebar-primary" htmlFor="modo-sel">Modo de trabalho</label>
          <select id="modo-sel" className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={active.id} onChange={(e) => setActive(e.target.value)}>
            <option value="base">Real</option>
            {sims.map((s) => <option key={s.id} value={s.id}>Simulação: {s.name}</option>)}
          </select>
          {!sims.length && <Link to="/simulacoes" className="block underline opacity-80">Simular hipóteses</Link>}
          {user && <p className="leading-snug opacity-80">{user.email}<br />{official.status === "ready" ? `Papel ${official.role}` : official.status === "error" ? official.error : "Carregando…"}<br /><button className="underline" onClick={async () => { if (!draft || await askConfirm("Há alterações ainda sendo salvas. Sair agora pode perdê-las. Continuar?")) signOut(); }}>Sair</button></p>}
        </div>
      </aside>
      )}
      <div className="min-w-0 flex-1">
        {official.status === "ready" && isEmpty(base.data) && active.isBase && <div className="border-b border-border bg-muted px-4 py-2 text-xs">Nenhum dado cadastrado em {official.orgName}. Comece pelo cadastro inicial em <Link to="/referencias" className="underline">Referências</Link> (saldo inicial, fornecedores, categorias).</div>}
        {!active.isBase && <div className="sticky top-0 z-30 border-b-2 border-destructive bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground">SIMULAÇÃO "{active.name}" — exclusivamente visual, local a este navegador. Nada aqui é gravado nos dados reais, marca pagamentos ou é promovido.</div>}
        {active.isBase && (draft || saveMsg) && (
          <div className={`sticky top-0 z-30 flex items-center gap-2 px-4 py-1 text-xs ${saveState === "error" || saveState === "conflict" ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>
            <span>{saveState === "saving" || (draft && saveState === "idle") ? "Salvando alterações…" : saveMsg}</span>
            {saveState === "conflict" && <button className="btn" onClick={reloadOfficial}>Recarregar dados atuais</button>}
          </div>
        )}
        <main className="p-4">{children}</main>
      </div>
      {simMode && <div aria-hidden className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden"><div className="-rotate-[30deg] select-none whitespace-nowrap text-center text-6xl font-black uppercase tracking-widest text-destructive opacity-[0.08]">SIMULAÇÃO<br />{active.name}</div></div>}
    </div>
  );
}

const isEmpty = (d: ScenarioData) => !d.suppliers.length && !d.planned.length && !d.committed.length && !d.expenses.length && !d.receipts.length && !Object.keys(d.targets).length;
function Gate({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
    <div className="text-center"><div className="text-[11px] uppercase tracking-widest text-primary">Grupo Sandrini</div><h1 className="text-xl font-semibold">Fluxo de Caixa</h1></div>
    {children}
  </div>;
}
function Entry() {
  return <div className="card w-full max-w-md p-5 text-sm">
    <p className="mb-1 font-medium">Acesso restrito à equipe financeira</p>
    <p className="mb-4 text-xs text-muted-foreground">Entre com sua conta para abrir a projeção de caixa da sua organização. Acesso a uma organização existente somente por convite.</p>
    <Link to="/auth" className="btn btn-primary">Entrar</Link>
  </div>;
}
