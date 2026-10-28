import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, ProfileBadge } from "@/components/kit";
import { computeFlow } from "@/lib/engine/engine";
import { computeDashboard } from "@/lib/engine/dashboard";
import { isoToday } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Títulos em aberto por fornecedor, vencimentos, saldo mínimo e necessidade de caixa." },
    { property: "og:title", content: "Dashboard · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Aberto por fornecedor, vencidos, a vencer e necessidade de caixa." },
  ] }),
  component: Page,
});

function Page() {
  const { active, ui, mode } = useApp();
  const d = active.data;
  const today = isoToday();
  const flow = useMemo(() => computeFlow(d, { start: ui.start, end: ui.end }), [d, ui.start, ui.end]);
  const k = useMemo(() => computeDashboard(d, flow, today), [d, flow, today]);
  const [sel, setSel] = useState<string | null>(null);
  const C = ({ l, v, neg }: { l: string; v: string; neg?: boolean }) => <div className="card p-2"><div className="lbl">{l}</div><div className={`num text-base font-semibold ${neg ? "neg" : ""}`}>{v}</div></div>;
  return (
    <div className="space-y-3">
      <PageHeader title="Dashboard" sub={`Espaço ${mode === "demo" ? "DEMO" : "OFICIAL"} · cenário "${active.name}" · período ${fmtDate(ui.start)} a ${fmtDate(ui.end)} · hoje ${fmtDate(today)}`}><ProfileBadge /></PageHeader>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <C l={`Maior fornecedor em aberto${k.top ? " · " + k.top.supplier : ""}`} v={fmtBRL(k.top?.open ?? 0)} />
        <C l={`Vencidos em aberto (${k.overdueCount})`} v={fmtBRL(k.overdue)} neg={k.overdue > 0} />
        <C l="A vencer 7 dias" v={fmtBRL(k.due7)} /><C l="A vencer 15 dias" v={fmtBRL(k.due15)} />
        <C l="A vencer 30 dias" v={fmtBRL(k.due30)} /><C l="Efetivado pendente (compras)" v={fmtBRL(k.committedOpen)} />
        <C l="Despesas em aberto" v={fmtBRL(k.expenseOpen)} /><C l="Planejado restante (previsão, separado)" v={fmtBRL(k.plannedRemaining)} />
        <C l={`Saldo mínimo · ${fmtDate(k.minBalanceDate)}`} v={fmtBRL(k.minBalance)} neg={k.minBalance < 0} />
        <C l="Primeiro saldo negativo" v={k.firstNegative ? fmtDate(k.firstNegative) : "nenhum no período"} />
        <C l="Necessidade de caixa (−saldo mínimo)" v={fmtBRL(k.cashNeed)} neg={k.cashNeed > 0} />
        <C l="Total em aberto (sem previsão)" v={fmtBRL(k.totalOpen)} />
      </div>
      <p className="text-[11px] text-muted-foreground">Aberto = títulos efetivados e despesas − pagamentos registrados (estornos desconsiderados). Quitados, cancelados e previsões não entram. Vencimento passado não significa pago.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card overflow-auto p-3"><div className="lbl mb-2">Ranking de fornecedores em aberto (clique para títulos)</div>
          <table className="tbl"><thead><tr><th>#</th><th>Fornecedor</th><th className="num">Títulos</th><th className="num">Aberto</th></tr></thead>
            <tbody>{k.ranking.map((r, i) => <tr key={r.supplierId} className={`cursor-pointer hover:bg-accent ${sel === r.supplierId ? "bg-accent" : ""}`} onClick={() => setSel(r.supplierId)}><td>{i + 1}</td><td>{r.supplier}</td><td className="num">{r.titles.length}</td><td className="num">{fmtBRL(r.open)}</td></tr>)}</tbody></table>
        </section>
        <section className="card overflow-auto p-3"><div className="lbl mb-2">Títulos {sel ? `· ${k.ranking.find((r) => r.supplierId === sel)?.supplier}` : "(todos)"}</div>
          <table className="tbl"><thead><tr><th>Venc.</th><th>Tipo</th><th>Documento</th><th className="num">Original</th><th className="num">Pago</th><th className="num">Pendente</th><th>Situação</th></tr></thead>
            <tbody>{(sel ? k.titles.filter((t) => t.supplierId === sel) : k.titles).map((t) => <tr key={t.id}><td className={t.due < today ? "neg" : ""}>{fmtDate(t.due)}{t.due < today && " (vencido)"}</td><td>{t.kind === "committed" ? "Efetivado" : "Despesa"}</td><td>{t.document}</td><td className="num">{fmtBRL(t.value)}</td><td className="num">{fmtBRL(t.paid)}</td><td className="num">{fmtBRL(t.open)}</td><td>{t.state}</td></tr>)}</tbody></table>
        </section>
      </div>
    </div>
  );
}
