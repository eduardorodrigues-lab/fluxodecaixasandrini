import { askConfirm } from "@/lib/decisions";
import { DecisionWindow } from "@/components/DecisionDialog";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ScenarioData } from "@/lib/engine/types";
import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Activity, LayoutDashboard, FileText, Receipt, ArrowDownToLine, Landmark, Target, ContactRound, FlaskConical, History, UsersRound } from "lucide-react";
import { useApp } from "@/lib/store";

const NAV = [
  { to: "/", label: "Fluxo", icon: Activity },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/lancamentos", label: "Lançamentos", icon: FileText },
  { to: "/despesas", label: "Relatório de despesas", icon: Receipt },
  { to: "/recebimentos", label: "Recebimentos", icon: ArrowDownToLine },
  { to: "/bancos", label: "Bancos", icon: Landmark },
  { to: "/metas", label: "Meta de Faturamento", icon: Target },
  { to: "/referencias", label: "Cadastros", icon: ContactRound },
  { to: "/simulacoes", label: "Simulações", icon: FlaskConical },
  { to: "/historico", label: "Histórico / Auditoria", icon: History },
  { to: "/equipe", label: "Equipe e acesso", icon: UsersRound },
] as const;

const NAV_KEY = "fluxo.nav.hidden";

export function AppShell({ children }: { children: ReactNode }) {
  const { orgs, user, authReady, signOut, official, base, active, sims, setActive, draft, saveState, saveMsg, canEdit, changes, commitDraft, discardDraft, conflicts, resolveConflict, protectErr, pendingOperation, saveOperation, abandonOperation } = useApp();
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
  if (official.status !== "ready" && !publicPage) return <Gate><div className="card w-full max-w-md p-4 text-sm"><p className="mb-2">{official.status === "error" ? official.error : "Carregando dados do Grupo Sandrini…"}</p><p className="mb-3 text-xs text-muted-foreground">Conectado como {user.email}. Nenhum dado de outra organização será carregado.</p><button className="btn" onClick={() => signOut()}>Sair</button></div></Gate>;
  return (
    <div className="app-workspace flex min-h-screen">
      {navHidden ? (
        <div className={`sticky top-0 flex h-screen w-8 shrink-0 flex-col items-center border-r border-sidebar-border py-2 ${simMode ? "bg-destructive" : "bg-sidebar"}`}>
          <button className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent" title="Mostrar menu" aria-label="Mostrar menu" onClick={toggleNav}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
      <aside className={`app-navigation sticky top-0 flex h-screen w-52 shrink-0 flex-col ${simMode ? "bg-destructive text-destructive-foreground" : "bg-sidebar text-sidebar-foreground"}`}>
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
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="nav-item flex min-w-0 items-center gap-2.5 rounded px-3 py-2.5 hover:bg-sidebar-accent" activeProps={{ className: "nav-selected bg-sidebar-accent text-sidebar-accent-foreground font-semibold" }}><n.icon aria-hidden className="size-4 shrink-0 opacity-80" /><span className="min-w-0">{n.label}</span></Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3 text-[11px]">
          {orgs.some(o=>o.orgId!==official.orgId) && <p className="opacity-80">Rascunhos de outra organização permanecem separados neste navegador, disponíveis para conferência; não são enviados a esta base.</p>}
          <label className="block text-sidebar-primary" htmlFor="modo-sel">Modo de trabalho</label>
          <select id="modo-sel" className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={active.id} onChange={(e) => setActive(e.target.value)}>
            <option value="base">Real</option>
            {sims.map((s) => <option key={s.id} value={s.id}>Simulação: {s.name}</option>)}
          </select>
          {!sims.length && <Link to="/simulacoes" className="block underline opacity-80">Simular hipóteses</Link>}
          {user && <p className="leading-snug opacity-80">{user.email}<br />{official.status === "ready" ? `Papel ${official.role}` : official.status === "error" ? official.error : "Carregando…"}<br /><button className="underline" onClick={async () => { if (!draft || await askConfirm("Há alterações não salvas. Sair agora pode perdê-las. Continuar?")) signOut(); }}>Sair</button></p>}
        </div>
      </aside>
      )}
      <div className="min-w-0 flex-1">
        {official.status === "ready" && isEmpty(base.data) && active.isBase && <div className="border-b border-border bg-muted px-4 py-2 text-xs">Nenhum dado cadastrado em {official.orgName}. Comece pelo cadastro inicial em <Link to="/referencias" className="underline">Cadastros</Link> (fornecedores e categorias; saldos em Bancos).</div>}
        {!active.isBase && <div className="sticky top-0 z-30 border-b-2 border-destructive bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground">SIMULAÇÃO "{active.name}" — exclusivamente visual, local a este navegador. Nada aqui é gravado nos dados reais, marca pagamentos ou é promovido.</div>}
        {active.isBase && canEdit && (draft || saveMsg || protectErr) && (
          <div className={`sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs ${saveState === "error" || saveState === "conflict" ? "border-destructive/30 bg-card text-destructive" : saveState === "saved" ? "border-border bg-muted" : "border-warning/30 bg-warning-soft"}`} role="status">
            <b>{saveState === "saving" ? "Salvando…" : saveState === "error" ? "Falha ao salvar" : saveState === "conflict" ? "Conflito" : draft ? "Alterações não salvas" : saveState === "saved" ? "Salvo" : ""}</b>
            <span>{draft && saveState === "dirty" && !saveMsg ? `${changes.length} registro(s) alterado(s).` : saveMsg}</span>
            {protectErr && <span className="font-semibold">{protectErr}</span>}
            {draft && <span className="ml-auto flex gap-1">
              <button className="btn" disabled={saveState === "saving"} onClick={async () => { if (await askConfirm("Todas as alterações não salvas serão descartadas.", { title: "Descartar alterações?", action: "Descartar", destructive: true })) discardDraft(); }}>Descartar</button>
              <button className="btn btn-primary" disabled={saveState === "saving" || saveState === "conflict"} onClick={() => void commitDraft()}>{saveState === "saving" ? "Salvando…" : "Salvar"}</button>
            </span>}
          </div>
        )}
        {active.isBase && pendingOperation && <div role="status" className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 text-sm">
          <span>Operação em confirmação: {pendingOperation.ops.length} registro(s). Não incluída no Salvar das outras pendências.</span>
          <button className="btn" disabled={saveState === "saving"} onClick={() => void saveOperation(pendingOperation).catch(() => {})}>Tentar novamente a operação</button>
          <button className="btn" disabled={saveState === "saving" || !pendingOperation.rejected} title={!pendingOperation.rejected ? 'Confira o resultado tentando novamente a mesma operação primeiro.' : undefined} onClick={async () => { if(await askConfirm("A operação rejeitada será preservada nas alterações não salvas para nova revisão. Nada será gravado; o formulário e outras pendências permanecem.", {title:"Revisar operação pendente?",action:"Liberar para nova revisão"})) await abandonOperation(); }}>Liberar para nova revisão</button>
        </div>}
        {conflicts.length > 0 && <DecisionWindow wide title="Conflito na mesma informação" description="Outra pessoa salvou alterações nestes registros depois que você começou. Escolha, para cada um, qual versão manter. Nada foi sobrescrito." footer={<span className="text-xs text-muted-foreground">{conflicts.length} pendente(s)</span>}>
          {conflicts.map((c) => { const srv = (c.server ?? {}) as Record<string, unknown>, mine = (c.change.after ?? {}) as Record<string, unknown>; const obj = typeof srv === "object" && typeof mine === "object"; const keys = obj ? Object.keys({ ...srv, ...mine }).filter((k) => JSON.stringify(srv[k]) !== JSON.stringify(mine[k])) : ["valor"]; const show = (v: unknown) => v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v); return (
            <div key={c.change.entity + c.change.id} className="rounded border border-border p-2">
              <p className="mb-1 font-semibold">{c.change.entity}{c.server == null ? " · excluído por outra pessoa" : c.change.after == null ? " · você excluiu" : ""}</p>
              <table className="tbl"><thead><tr><th>Campo</th><th>No banco (outra pessoa)</th><th>Seu preenchimento</th></tr></thead><tbody>{keys.map((k) => <tr key={k}><td>{fieldLabel(k)}</td><td>{show(obj ? srv[k] : c.server)}</td><td className="text-destructive">{show(obj ? mine[k] : c.change.after)}</td></tr>)}</tbody></table>
              <div className="mt-1 flex justify-end gap-1"><button className="btn" onClick={() => resolveConflict(c, "server")}>Manter a do banco</button><button className="btn btn-primary" onClick={() => resolveConflict(c, "mine")}>Manter a minha</button></div>
            </div>); })}
        </DecisionWindow>}
        <main className="p-4">{children}</main>
      </div>
      {simMode && <div aria-hidden className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden"><div className="-rotate-[30deg] select-none whitespace-nowrap text-center text-6xl font-black uppercase tracking-widest text-destructive opacity-[0.08]">SIMULAÇÃO<br />{active.name}</div></div>}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = { value: "Valor", amount: "Valor", date: "Data", dueDate: "Vencimento", baseDate: "Data base", extensionDate: "Prorrogado para", document: "Documento", purchaseCode: "Código do pedido", notes: "Descrição/observações", supplierId: "Fornecedor", categoryId: "Subgrupo", status: "Situação", general: "Geral", platforms: "Plataformas", name: "Nome", termDays: "Prazo (dias)", installments: "Parcelas", valor: "Valor" };
const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k;
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
