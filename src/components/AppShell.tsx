import { Link, useRouterState } from "@tanstack/react-router";
import type { ScenarioData } from "@/lib/engine/types";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { computeFlow } from "@/lib/engine/engine";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";

const NAV = [
  { to: "/", label: "Fluxo" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/lancamentos", label: "Lançamentos" },
  { to: "/recebimentos", label: "Recebimentos" },
  { to: "/metas", label: "Meta de Faturamento" },
  { to: "/referencias", label: "Referências" },
  { to: "/simulacoes", label: "Simulações" },
  { to: "/regras", label: "Regras e Conciliação" },
  { to: "/historico", label: "Histórico / Auditoria" },
  { to: "/equipe", label: "Equipe e acesso" },
] as const;

const NAV_KEY = "fluxo.nav.hidden";

export function AppShell({ children }: { children: ReactNode }) {
  const { orgs, setOrgId, user, authReady, signOut, official, base, active, sims, setActive, draft, changes, saveState, saveMsg, baseMoved, draftBaseVersion } = useApp();
  const [review, setReview] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const publicPage = path === "/auth" || path === "/convite";
  // Sem login: só a tela de entrada (ou aceite de convite). Nenhum dado financeiro é exibido.
  if (!user) return <Gate>{!authReady ? <p className="text-xs text-muted-foreground">Verificando acesso…</p> : publicPage ? children : <Entry />}</Gate>;
  if (official.status !== "ready" && !publicPage) return <Gate><div className="card w-full max-w-md p-4 text-sm"><p className="mb-2">{official.status === "error" ? `Não foi possível abrir os dados da organização: ${official.error}` : "Carregando dados da organização…"}</p><p className="mb-3 text-xs text-muted-foreground">Conectado como {user.email}. Nenhum dado é exibido até a organização carregar.</p>{orgs.length > 1 && <select aria-label="Organização" className="mb-2 w-full rounded border border-border px-1.5 py-1 text-xs" value={official.orgId} onChange={(e) => setOrgId(e.target.value)}><option value="">— selecione a organização —</option>{orgs.map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}</select>}<button className="btn" onClick={() => signOut()}>Sair</button></div></Gate>;
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border px-4 py-4">
          <div className="text-[10px] uppercase tracking-widest text-sidebar-primary">Grupo Sandrini</div>
          <div className="text-sm font-semibold">Fluxo de Caixa</div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-auto p-2">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="block rounded px-3 py-1.5 text-xs hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" }}>{n.label}</Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3 text-[11px]">
          {orgs.length > 1 && <>
            <label className="block text-sidebar-primary" htmlFor="org-sel">Organização</label>
            <select id="org-sel" className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={official.orgId} onChange={(e) => { if (!draft || confirm("Há rascunho não confirmado. Trocar de organização descarta o rascunho e as simulações. Continuar?")) setOrgId(e.target.value); }}>
              {!official.orgId && <option value="">— selecione —</option>}
              {orgs.map((o) => <option key={o.orgId} value={o.orgId}>{o.name} ({o.own ? "própria" : "convidada"} · {o.role})</option>)}
            </select></>}
          <label className="block text-sidebar-primary" htmlFor="modo-sel">Modo de trabalho</label>
          <select id="modo-sel" className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={active.id} onChange={(e) => setActive(e.target.value)}>
            <option value="base">Real</option>
            {sims.map((s) => <option key={s.id} value={s.id}>Simulação: {s.name}</option>)}
          </select>
          {!sims.length && <Link to="/simulacoes" className="block underline opacity-80">Simular hipóteses</Link>}
          {user && <p className="leading-snug opacity-80">{user.email}<br />{official.status === "ready" ? `Papel ${official.role}` : official.status === "error" ? official.error : "Carregando…"}<br /><button className="underline" onClick={() => { if (!draft || confirm("Há rascunho não confirmado. Sair descarta o rascunho e remove as simulações deste navegador. Continuar?")) signOut(); }}>Sair</button></p>}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {official.status === "ready" && isEmpty(base.data) && active.isBase && <div className="border-b border-border bg-muted px-4 py-2 text-xs">Nenhum dado cadastrado em {official.orgName}. Comece pelo cadastro inicial em <Link to="/referencias" className="underline">Referências</Link> (saldo inicial, fornecedores, categorias) ou carregue a planilha atual em <Link to="/regras" className="underline">Regras e Conciliação → Importação</Link>.</div>}
        {!active.isBase && <div className="sticky top-0 z-30 border-b-2 border-destructive bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground">SIMULAÇÃO "{active.name}" — exclusivamente visual, local a este navegador. Nada aqui é gravado nos dados reais, marca pagamentos ou é promovido.</div>}
        {active.isBase && draft && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b-2 border-warning bg-warning-soft px-4 py-1.5 text-xs text-warning-foreground">
            <b>Rascunho com {changes.length} alteração(ões) NÃO gravada(s){draftBaseVersion !== null ? ` · iniciado na versão ${draftBaseVersion}` : ""}.</b>
            {baseMoved && <span className="tag tag-err">A base mudou para a versão {official.version} desde o início do rascunho: a gravação será recusada como conflito (nada sobrescrito).</span>}
            <button className="btn btn-primary" onClick={() => setReview(true)}>Revisar e confirmar</button>
            {saveMsg && <span>{saveMsg}</span>}
          </div>
        )}
        {active.isBase && !draft && saveMsg && <div className={`px-4 py-1 text-xs ${saveState === "error" || saveState === "conflict" ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>{saveMsg}</div>}
        <main className="p-4">{children}</main>
      </div>
      {review && <ReviewDialog onClose={() => setReview(false)} />}
    </div>
  );
}

const short = (v: unknown) => { const s = typeof v === "object" ? JSON.stringify(v) : String(v); return s && s.length > 140 ? s.slice(0, 140) + "…" : s; };

function ReviewDialog({ onClose }: { onClose: () => void }) {
  const { base, draft, changes, commitDraft, discardDraft, saveState, saveMsg, ui, reloadOfficial } = useApp();
  const opt = { start: ui.start, end: ui.end };
  const before = useMemo(() => computeFlow(base.data, opt), [base.data, ui.start, ui.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => (draft ? computeFlow(draft, opt) : before), [draft, ui.start, ui.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayDiffs = after.days.map((d, i) => ({ date: d.date, diff: d.saldoFinal - (before.days[i]?.saldoFinal ?? 0) })).filter((x) => x.diff !== 0);
  const saving = saveState === "saving";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-label="Revisão de alterações">
      <div className="card max-h-[90vh] w-full max-w-4xl overflow-auto p-4">
        <h2 className="mb-1 text-sm font-semibold">Revisar alterações antes de gravar</h2>
        <p className="mb-3 text-xs text-muted-foreground">Confirmar grava tudo de uma vez com auditoria (antes/depois, usuário, data). Cancelar descarta o rascunho sem alterar nada.</p>
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {([["Saldo final", "saldoFinal"], ["Menor saldo", "menorSaldo"], ["Entradas", "entradasSemSaldo"], ["Saídas", "saidas"]] as const).map(([l, k]) => (
            <div key={k} className="rounded border border-border p-2"><div className="lbl">{l} ({fmtDate(ui.start)}–{fmtDate(ui.end)})</div><div className="num">{fmtBRL(before.kpis[k])} → {fmtBRL(after.kpis[k])}</div><div className={`num font-semibold ${after.kpis[k] - before.kpis[k] < 0 ? "neg" : ""}`}>Δ {fmtBRL(after.kpis[k] - before.kpis[k])}</div></div>
          ))}
        </div>
        <p className="mb-2 text-xs">{dayDiffs.length ? `Impacto em ${dayDiffs.length} dia(s) do período; primeiro em ${fmtDate(dayDiffs[0]!.date)} (Δ saldo ${fmtBRL(dayDiffs[0]!.diff)}).` : "Sem impacto no saldo diário do período exibido."}</p>
        <table className="tbl mb-3"><thead><tr><th>Tipo</th><th>Entidade</th><th>Antes</th><th>Depois</th></tr></thead>
          <tbody>{changes.map((c, i) => {
            const b = c.before as Record<string, unknown> | null, a = c.after as Record<string, unknown> | null;
            const HIDE = new Set(["id", "history", "extensionHistory", "residual", "importOrigin", "origin"]);
            const pick = (o: Record<string, unknown> | null) => {
              if (!o || typeof o !== "object") return o;
              const src = c.fields.length ? Object.fromEntries(c.fields.map((f) => [f, o[f]])) : o;
              return Object.fromEntries(Object.entries(src).filter(([k, v]) => !HIDE.has(k) && v !== null && v !== "" && !(typeof v === "object" && v && !Array.isArray(v) && !Object.keys(v).length)));
            };
            return <tr key={i}><td><span className={`tag ${c.kind === "exclusão" ? "tag-err" : c.kind === "inclusão" ? "tag-ok" : "tag-warn"}`}>{c.kind}</span></td><td>{c.entity}</td><td className="font-mono text-[10px]">{short(pick(b))}</td><td className="font-mono text-[10px]">{short(pick(a))}</td></tr>;
          })}</tbody></table>
        {saveMsg && <p className={`mb-2 text-xs ${saveState === "conflict" || saveState === "error" ? "text-destructive" : ""}`}>{saveMsg}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={saving || !changes.length} onClick={async () => { await commitDraft(); }}>{saving ? "Gravando…" : "Confirmar e gravar"}</button>
          <button className="btn btn-danger" disabled={saving} onClick={() => { discardDraft(); onClose(); }}>Cancelar alterações (descartar)</button>
          <button className="btn" disabled={saving} onClick={onClose}>Continuar editando</button>
          {saveState === "conflict" && <button className="btn" onClick={() => { reloadOfficial(); onClose(); }}>Recarregar dados atuais (descarta rascunho)</button>}
        </div>
      </div>
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
