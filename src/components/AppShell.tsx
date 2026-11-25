import { askConfirm } from "@/lib/decisions";
import { DecisionWindow } from "@/components/DecisionDialog";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ScenarioData } from "@/lib/engine/types";
import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Activity, LayoutDashboard, FileText, Receipt, ArrowDownToLine, Landmark, Target, ContactRound, FlaskConical, History, UsersRound } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from '@/components/ui/button';
import { OperationReviewTable } from './OperationReviewTable';
import { operationReview } from '@/lib/operationReview';
import { operationPhaseLabel } from '@/lib/saveRecovery';
import { confirmationBlockReason, definitiveRejection } from '@/lib/recoveryActions';

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
  const { orgs, user, authReady, signOut, official, base, active, sims, setActive, draft, saveState, saveMsg, canEdit, commitDraft, discardDraft, conflicts, resolveConflict, protectErr, pendingOperations, saveOperation, abandonOperation, resendPendingOperation, checkPendingOperation, confirmationChecking } = useApp();
  const [viewPacket,setViewPacket] = useState<string | null>(null);
  const [retryError,setRetryError] = useState('');
  const simMode = !active.isBase;
  const [online, setOnline] = useState(true);
  useEffect(() => { const sync = () => setOnline(navigator.onLine); sync(); window.addEventListener('online',sync); window.addEventListener('offline',sync); return () => { window.removeEventListener('online',sync); window.removeEventListener('offline',sync); }; }, []);
  const viewedPacket = pendingOperations.find((o) => o.requestId === viewPacket) ?? null;
  const exportPacket = (op: (typeof pendingOperations)[number]) => {
    const url=URL.createObjectURL(new Blob([JSON.stringify(op,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`operacao-preservada-${op.requestId}.json`;link.click();URL.revokeObjectURL(url);
  };
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
  if (official.status !== "ready" && !publicPage) return <Gate><div className="card w-full max-w-md p-4 text-sm"><p className="mb-2">{official.status === "error" ? `Não foi possível abrir os dados do Grupo Sandrini. ${official.error}` : "Carregando dados do Grupo Sandrini…"}</p><p className="mb-3 text-xs text-muted-foreground">Conectado como {user.email}. Nenhum dado de outra organização será carregado.</p><button className="btn" onClick={() => signOut()}>Sair</button></div></Gate>;
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
          <div className={`sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b px-4 py-1.5 text-xs ${saveState === "error" || saveState === "conflict" ? "border-destructive/30 bg-card text-destructive" : saveState === "saved" ? "border-border bg-muted" : "border-border bg-card"}`} role="status" aria-live="polite">
            <b>{saveState === "error" ? "Conferência pendente" : saveState === "conflict" || conflicts.length ? "Conflito" : saveState === "saving" || draft ? "Salvando…" : saveState === "saved" ? "Salvo" : ""}</b>
            <span>{saveMsg}</span>
            {protectErr && <span className="font-semibold">{protectErr}</span>}
            {draft && saveState === "error" && <span className="ml-auto flex gap-1">
              <button className="btn" onClick={async () => { if (await askConfirm("As alterações ainda não enviadas serão descartadas. Envios já capturados continuam em conferência.", { title: "Descartar alterações não enviadas?", action: "Descartar", destructive: true })) discardDraft(); }}>Descartar não enviadas</button>
              <Button size="sm" variant="outline" onClick={() => void commitDraft()}>Conferir e gravar</Button>
            </span>}
          </div>
        )}
        {active.isBase && pendingOperations.map((op) => { const reason = confirmationBlockReason(op, {authenticated:!!user, authorized:official.status==='ready' && canEdit && active.isBase && op.orgId===official.orgId, busy:confirmationChecking, online}); return <div key={op.requestId} role="status" className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 text-sm">
          <span>{operationPhaseLabel[op.phase ?? 'unknown']}: {op.ops.length} registro(s). Operações em outros registros continuam sendo salvas normalmente.</span>
          <span className="text-xs text-muted-foreground">Identificação do envio: <span className="font-mono select-all">{op.requestId}</span>{op.submittedAt ? ` · enviado ${new Date(op.submittedAt).toLocaleString('pt-BR')}` : ''}</span>
          <Button size="sm" variant="outline" onClick={()=>setViewPacket(op.requestId)}>Ver alterações</Button>
          <Button size="sm" variant="outline" disabled={!!reason} onClick={() => void checkPendingOperation(op.requestId)}>{confirmationChecking ? 'Consultando resultado…' : 'Consultar resultado'}</Button>
          {reason && <p className="basis-full text-xs">{reason}</p>}
          {op.legacyUncertain || !op.ops.length ? <p className="basis-full text-xs">Pacote legado: faltam dados suficientes para comprovar o envio ou sua captura original. Exporte os dados preservados para recuperação; nenhuma nova gravação será autorizada por ausência de confirmação.</p> : null}
          <Button size="sm" variant="outline" onClick={() => exportPacket(op)}>Exportar pacote preservado</Button>
          {definitiveRejection(op) && <><Button size="sm" variant="outline" disabled={saveState === 'saving' || confirmationChecking} onClick={async () => { if(await askConfirm("O servidor recusou esta operação. As alterações voltam para a tela para comparar com o atual; a auditoria não será apagada. Nenhuma gravação ocorrerá agora.", {title:"Revisar operação recusada?",action:op.phase==='conflict'?'Revisar conflito':'Voltar à edição'})) await abandonOperation(op.requestId); }}>{op.phase==='conflict'?'Revisar conflito':'Voltar à edição'}</Button><Button size="sm" disabled={saveState === 'saving' || confirmationChecking} onClick={async () => { setRetryError(''); try { await saveOperation({...op}); } catch (e) { setRetryError((e as Error).message); } }}>Salvar novamente sobre a versão atual</Button>{retryError && <p role="alert" className="basis-full text-xs text-destructive">{retryError}</p>}</>}
          {!definitiveRejection(op) && !op.confirmation && !!op.lastNotFoundAt && !op.legacyUncertain && op.ops.length > 0 && <Button size="sm" disabled={!!reason} onClick={async () => { if (await askConfirm("O mesmo pacote será reenviado com a MESMA identificação. Se ele já tiver sido gravado, o servidor apenas confirma a gravação existente — nada é duplicado. Se outra pessoa alterou os mesmos registros, nada é sobrescrito e o conflito aparece para revisão.", { title: "Reenviar o mesmo pacote?", action: "Reenviar o mesmo pacote" })) await resendPendingOperation(op.requestId); }}>Reenviar o mesmo pacote</Button>}
          {!definitiveRejection(op) && <p className="basis-full text-xs">A conferência automática continua com intervalos maiores e é retomada ao reconectar ou recarregar. Somente alterações destes mesmos registros aguardam este resultado.</p>}
        </div>; })}
        {viewedPacket && <DecisionWindow wide title="Alterações do pacote enviado" description="Somente leitura. Este é o pacote capturado; abrir esta janela não envia nem altera informações." footer={<><Button variant="outline" onClick={()=>exportPacket(viewedPacket)}>Exportar pacote preservado</Button><Button variant="outline" onClick={()=>setViewPacket(null)}>Fechar</Button></>}><OperationReviewTable rows={viewedPacket.reviewRows ?? operationReview(viewedPacket.ops,active.data)} /></DecisionWindow>}
        {conflicts.length > 0 && <DecisionWindow wide title="Conflito na mesma informação" description="Outra pessoa salvou alterações nestes registros depois que você começou. Escolha, para cada um, qual versão manter. Nada foi sobrescrito." footer={<span className="text-xs text-muted-foreground">{conflicts.length} pendente(s)</span>}>
          {conflicts.map((c) => { return (
            <div key={c.change.entity + c.change.id} className="rounded border border-border p-2">
              <p className="mb-1 font-semibold">{c.change.entity}{c.server == null ? " · excluído por outra pessoa" : c.change.after == null ? " · você excluiu" : ""}</p>
              <h3 className="font-semibold">Anterior → solicitado</h3><OperationReviewTable rows={operationReview([c.change],active.data)} />
              <h3 className="font-semibold">Atual no banco → solicitado</h3>
              <OperationReviewTable rows={operationReview([{...c.change,before:c.server}],active.data)} />
              <div className="mt-1 flex justify-end gap-1"><button className="btn" disabled={false} onClick={() => resolveConflict(c, "server")}>Manter a do banco</button><button className="btn btn-primary" disabled={false} onClick={() => resolveConflict(c, "mine")}>Manter a minha</button></div>
            </div>); })}
        </DecisionWindow>}
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
