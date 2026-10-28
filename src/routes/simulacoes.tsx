import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/kit";
import { computeFlow } from "@/lib/engine/engine";
import { fmtDate } from "@/lib/dates";
import { fmtBRL, fmtNum } from "@/lib/money";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/simulacoes")({
  head: () => ({
    meta: [
      { title: "Simulações · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Cenários copiados da base, comparação e impacto diário." },
      { property: "og:title", content: "Simulações · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Cenários e comparação com a base." },
    ],
  }),
  component: Page,
});

function Page() {
  const { state, base, ui, createScenario, restoreScenario, deleteScenario, setActive } = useApp();
  const sims = state.scenarios.filter((s) => !s.isBase);
  const [cmp, setCmp] = useState(sims[0]?.id ?? "");
  const [name, setName] = useState("");
  const target = state.scenarios.find((s) => s.id === cmp && !s.isBase);
  const opt = { start: ui.start, end: ui.end };
  const rb = useMemo(() => computeFlow(base.data, opt), [base.data, ui.start, ui.end]);
  const rs = useMemo(() => (target ? computeFlow(target.data, opt) : null), [target, ui.start, ui.end]);
  return (
    <div className="space-y-3">
      <PageHeader title="Simulações" sub="Cada cenário é uma cópia da base. Editar um cenário nunca altera a base." />
      <section className="card p-3">
        <div className="mb-2 flex gap-2"><input className="inp w-64" placeholder="Nome do cenário" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary" onClick={() => { createScenario(name || `Simulação ${sims.length + 1}`); setName(""); }}>Criar cópia da base e ativar</button></div>
        <table className="tbl"><thead><tr><th>Cenário</th><th>Criado</th><th>Ações</th></tr></thead>
          <tbody>{state.scenarios.map((s) => (
            <tr key={s.id}><td>{s.name} {s.isBase && <span className="tag tag-ok">base</span>}{s.id === state.activeId && <span className="tag tag-warn ml-1">ativo</span>}</td><td>{fmtDate(s.createdAt.slice(0, 10))}</td>
              <td className="space-x-1"><button className="btn" onClick={() => setActive(s.id)}>Ativar para editar</button>
                {!s.isBase && <><button className="btn" onClick={() => setCmp(s.id)}>Comparar</button><button className="btn" onClick={() => confirm("Restaurar este cenário para a base atual? Edições da simulação serão perdidas.") && restoreScenario(s.id)}>Restaurar da base</button><button className="btn btn-danger" onClick={() => confirm("Excluir cenário?") && deleteScenario(s.id)}>Excluir</button></>}
              </td></tr>
          ))}</tbody></table>
        <p className="mt-2 text-[11px] text-muted-foreground">Para editar prazos, valores, metas ou defasagem do cenário, ative-o e use Referências/Lançamentos. Não há promoção automática de cenário para a base.</p>
      </section>
      {target && rs ? (
        <section className="card p-3">
          <div className="lbl mb-2">Comparação: {target.name} × Base · {fmtDate(ui.start)} a {fmtDate(ui.end)}</div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {([["Saldo final", "saldoFinal"], ["Menor saldo", "menorSaldo"], ["Entradas", "entradasSemSaldo"], ["Saídas", "saidas"]] as const).map(([l, k]) => (
              <div key={k} className="rounded border border-border p-2"><div className="lbl">{l}</div><div className="num">{fmtBRL(rb.kpis[k])} → {fmtBRL(rs.kpis[k])}</div><div className={`num font-semibold ${rs.kpis[k] - rb.kpis[k] < 0 ? "neg" : ""}`}>Δ {fmtBRL(rs.kpis[k] - rb.kpis[k])}</div></div>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="tbl"><thead><tr><th>Data</th><th className="num">Entradas base</th><th className="num">Entradas cen.</th><th className="num">Saídas base</th><th className="num">Saídas cen.</th><th className="num">Saldo base</th><th className="num">Saldo cenário</th><th className="num">Impacto</th></tr></thead>
              <tbody>{rb.days.map((d, i) => { const s = rs.days[i]; const diff = (s?.saldoFinal ?? 0) - d.saldoFinal; return (
                <tr key={d.date}><td>{fmtDate(d.date)}</td><td className="num">{fmtNum(d.recUsado)}</td><td className="num">{fmtNum(s?.recUsado)}</td><td className="num">{fmtNum(d.saidas)}</td><td className="num">{fmtNum(s?.saidas)}</td><td className="num">{fmtNum(d.saldoFinal)}</td><td className="num">{fmtNum(s?.saldoFinal)}</td><td className={`num font-semibold ${diff < 0 ? "neg" : ""}`}>{fmtNum(diff)}</td></tr>
              ); })}</tbody></table>
          </div>
        </section>
      ) : <p className="text-xs text-muted-foreground">Crie ou selecione um cenário para comparar.</p>}
    </div>
  );
}
