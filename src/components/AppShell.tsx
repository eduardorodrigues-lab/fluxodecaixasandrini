import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
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
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, setMode, user, signOut, official, active, sims, setActive, draft, changes, saveState, saveMsg } = useApp();
  const [review, setReview] = useState(false);
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
          <label className="block text-sidebar-primary">Espaço de dados</label>
          <select className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={mode} onChange={(e) => { if (!draft || confirm("Há rascunho não confirmado. Trocar de espaço descarta o rascunho. Continuar?")) setMode(e.target.value as typeof mode); }}>
            <option value="oficial">Base oficial (Cloud)</option>
            <option value="demo">Demonstrativo (navegador)</option>
          </select>
          <label className="block text-sidebar-primary">Cenário ativo</label>
          <select className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={active.id} onChange={(e) => setActive(e.target.value)}>
            <option value="base">{mode === "demo" ? "Base demo" : "Base oficial"}</option>
            {sims.map((s) => <option key={s.id} value={s.id}>Simulação: {s.name}</option>)}
          </select>
          {mode === "oficial" ? (
            user ? <p className="leading-snug opacity-80">{user.email}<br />{official.status === "ready" ? `Versão ${official.version} · papel ${official.role}` : official.status === "error" ? official.error : "Carregando base…"}<br /><button className="underline" onClick={() => signOut()}>Sair</button></p>
              : <p className="leading-snug">Base oficial exige login. <Link to="/auth" className="underline">Entrar</Link></p>
          ) : <p className="leading-snug opacity-80">Dados DEMONSTRATIVOS salvos só neste navegador. Não são a base oficial.</p>}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {mode === "demo" && <div className="border-b border-warning bg-warning-soft px-4 py-1 text-[11px] text-warning-foreground">ESPAÇO DEMONSTRATIVO · dados fictícios, salvos apenas neste navegador · versão não homologada e sem dados reais migrados</div>}
        {mode === "oficial" && <div className="border-b border-border bg-muted px-4 py-1 text-[11px]">BASE OFICIAL {official.orgName && `· ${official.orgName}`} · gravação somente após revisão e confirmação · versão não homologada</div>}
        {!active.isBase && <div className="sticky top-0 z-30 border-b-2 border-destructive bg-destructive px-4 py-1.5 text-xs font-semibold text-destructive-foreground">SIMULAÇÃO "{active.name}" — exclusivamente visual, local a este navegador. Nada aqui altera a base {mode === "demo" ? "demo" : "oficial"}, marca pagamentos ou é promovido.</div>}
        {active.isBase && draft && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b-2 border-warning bg-warning-soft px-4 py-1.5 text-xs text-warning-foreground">
            <b>Rascunho com {changes.length} alteração(ões) NÃO gravada(s).</b>
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
  const { base, draft, changes, commitDraft, discardDraft, saveState, saveMsg, mode, ui, reloadOfficial } = useApp();
  const opt = { start: ui.start, end: ui.end };
  const before = useMemo(() => computeFlow(base.data, opt), [base.data, ui.start, ui.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => (draft ? computeFlow(draft, opt) : before), [draft, ui.start, ui.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayDiffs = after.days.map((d, i) => ({ date: d.date, diff: d.saldoFinal - (before.days[i]?.saldoFinal ?? 0) })).filter((x) => x.diff !== 0);
  const saving = saveState === "saving";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-label="Revisão de alterações">
      <div className="card max-h-[90vh] w-full max-w-4xl overflow-auto p-4">
        <h2 className="mb-1 text-sm font-semibold">Revisar alterações antes de gravar ({mode === "demo" ? "espaço demo" : "base oficial"})</h2>
        <p className="mb-3 text-xs text-muted-foreground">Confirmar grava tudo de uma vez com auditoria (antes/depois, usuário, data). Cancelar descarta o rascunho sem alterar nada.</p>
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {([["Saldo final", "saldoFinal"], ["Menor saldo", "menorSaldo"], ["Entradas", "entradasSemSaldo"], ["Saídas", "saidas"]] as const).map(([l, k]) => (
            <div key={k} className="rounded border border-border p-2"><div className="lbl">{l} ({fmtDate(ui.start)}–{fmtDate(ui.end)})</div><div className="num">{fmtBRL(before.kpis[k])} → {fmtBRL(after.kpis[k])}</div><div className={`num font-semibold ${after.kpis[k] - before.kpis[k] < 0 ? "neg" : ""}`}>Δ {fmtBRL(after.kpis[k] - before.kpis[k])}</div></div>
          ))}
        </div>
        <p className="mb-2 text-xs">{dayDiffs.length ? `Impacto em ${dayDiffs.length} dia(s) do período; primeiro em ${fmtDate(dayDiffs[0]!.date)} (Δ saldo ${fmtBRL(dayDiffs[0]!.diff)}).` : "Sem impacto no saldo diário do período exibido."}</p>
        <table className="tbl mb-3"><thead><tr><th>Tipo</th><th>Entidade</th><th>Id</th><th>Antes</th><th>Depois</th></tr></thead>
          <tbody>{changes.map((c, i) => {
            const b = c.before as Record<string, unknown> | null, a = c.after as Record<string, unknown> | null;
            const pick = (o: Record<string, unknown> | null) => (o && typeof o === "object" && c.fields.length ? Object.fromEntries(c.fields.map((f) => [f, o[f]])) : o);
            return <tr key={i}><td><span className={`tag ${c.kind === "exclusão" ? "tag-err" : c.kind === "inclusão" ? "tag-ok" : "tag-warn"}`}>{c.kind}</span></td><td>{c.entity}</td><td className="font-mono text-[10px]">{c.id}</td><td className="font-mono text-[10px]">{short(pick(b))}</td><td className="font-mono text-[10px]">{short(pick(a))}</td></tr>;
          })}</tbody></table>
        {saveMsg && <p className={`mb-2 text-xs ${saveState === "conflict" || saveState === "error" ? "text-destructive" : ""}`}>{saveMsg}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={saving || !changes.length} onClick={async () => { await commitDraft(); }}>{saving ? "Gravando…" : "Confirmar e gravar"}</button>
          <button className="btn btn-danger" disabled={saving} onClick={() => { discardDraft(); onClose(); }}>Cancelar alterações (descartar)</button>
          <button className="btn" disabled={saving} onClick={onClose}>Continuar editando</button>
          {saveState === "conflict" && <button className="btn" onClick={() => { reloadOfficial(); onClose(); }}>Recarregar base oficial (descarta rascunho)</button>}
        </div>
      </div>
    </div>
  );
}
