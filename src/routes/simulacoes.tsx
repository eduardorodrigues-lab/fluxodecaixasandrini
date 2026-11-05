import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/kit";
import { HistoryView } from "@/components/HistoryView";
import { computeFlow } from "@/lib/engine/engine";
import { fmtDate } from "@/lib/dates";
import { fmtBRL, fmtNum } from "@/lib/money";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/simulacoes")({
  head: () => ({
    meta: [
      { title: "Simulações · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Simulações visuais isoladas e comparação diária com a base." },
      { property: "og:title", content: "Simulações · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Simulações isoladas e comparação com a base." },
    ],
  }),
  component: Page,
});

function Page() {
  const { sims, base, ui, createSim, discardSim, deleteSim, setActive, active } = useApp();
  const [cmp, setCmp] = useState(sims[0]?.id ?? "");
  const [name, setName] = useState("");
  const target = sims.find((s) => s.id === cmp);
  const opt = { start: ui.start, end: ui.end };
  const rb = useMemo(() => computeFlow(base.data, opt), [base.data, ui.start, ui.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const rs = useMemo(() => (target ? computeFlow(target.data, opt) : null), [target, ui.start, ui.end]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <PageHeader title="Simulações" sub={`Quem visualiza ou edita pode simular. Cada simulação tem nome, histórico próprio e nunca altera o fluxo real.`} />
      <section className="card p-3">
        <div className="mb-2 flex gap-2"><input className="inp w-64" placeholder="Nome da simulação" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary" onClick={() => { createSim(name || `Simulação ${sims.length + 1}`); setName(""); }}>Criar a partir da base e ativar</button></div>
        <table className="tbl"><thead><tr><th>Simulação</th><th>Criada</th><th>Base copiada (versão)</th><th>Ações</th></tr></thead>
          <tbody>{sims.map((s) => (
            <tr key={s.id}><td>{s.name}{s.id === active.id && <span className="tag tag-warn ml-1">ativa</span>}</td><td>{fmtDate(s.createdAt.slice(0, 10))}</td><td>v{s.baseVersion ?? "—"}</td>
              <td className="space-x-1">{s.id !== active.id ? <button className="btn" onClick={() => setActive(s.id)}>Ativar</button> : <button className="btn" onClick={() => setActive("base")}>Desativar</button>}<button className={`btn ${cmp === s.id ? "btn-primary" : ""}`} onClick={() => setCmp(s.id)}>Comparar</button>
                <button className="btn" onClick={() => confirm("Descartar todas as hipóteses desta simulação e recopiar a base atual?") && discardSim(s.id)}>Descartar hipóteses</button>
                <button className="btn btn-danger" onClick={() => confirm("Excluir simulação?") && deleteSim(s.id)}>Excluir</button></td></tr>
          ))}</tbody></table>
        {!active.isBase && <button className="btn mt-2" onClick={() => setActive("base")}>Voltar para a base</button>}
        <p className="mt-2 text-[11px] text-muted-foreground">Com a simulação ativa, use Lançamentos, Recebimentos, Metas e Referências para incluir/excluir/ajustar valores, datas, metas e prazos — tudo imediato e apenas nesta simulação. Pagamentos não podem ser registrados em simulação.</p>
      </section>
      {target && (
        <section className="card p-3">
          <div className="lbl mb-2">Histórico da simulação: {target.name}</div>
          <HistoryView entries={target.history ?? []} data={target.data} scope={`Simulação: ${target.name}`} />
        </section>
      )}
      {target && rs ? (
        <section className="card p-3">
          <div className="lbl mb-2">Comparação diária: {target.name} × {base.name} · {fmtDate(ui.start)} a {fmtDate(ui.end)}</div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {([["Saldo final", "saldoFinal"], ["Menor saldo", "menorSaldo"], ["Entradas", "entradasSemSaldo"], ["Saídas", "saidas"]] as const).map(([l, k]) => (
              <div key={k} className="rounded border border-border p-2"><div className="lbl">{l}</div><div className="num">{fmtBRL(rb.kpis[k])} → {fmtBRL(rs.kpis[k])}</div><div className={`num font-semibold ${rs.kpis[k] - rb.kpis[k] < 0 ? "neg" : ""}`}>Δ {fmtBRL(rs.kpis[k] - rb.kpis[k])}</div></div>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="tbl"><thead><tr><th>Data</th><th className="num">Entradas base</th><th className="num">Entradas sim.</th><th className="num">Saídas base</th><th className="num">Saídas sim.</th><th className="num">Saldo base</th><th className="num">Saldo sim.</th><th className="num">Impacto</th></tr></thead>
              <tbody>{rb.days.map((d, i) => { const s = rs.days[i]; const diff = (s?.saldoFinal ?? 0) - d.saldoFinal; return (
                <tr key={d.date}><td>{fmtDate(d.date)}</td><td className="num">{fmtNum(d.recUsado)}</td><td className="num">{fmtNum(s?.recUsado)}</td><td className="num">{fmtNum(d.saidas)}</td><td className="num">{fmtNum(s?.saidas)}</td><td className="num">{fmtNum(d.saldoFinal)}</td><td className="num">{fmtNum(s?.saldoFinal)}</td><td className={`num font-semibold ${diff < 0 ? "neg" : ""}`}>{fmtNum(diff)}</td></tr>
              ); })}</tbody></table>
          </div>
        </section>
      ) : <p className="text-xs text-muted-foreground">Crie ou selecione uma simulação para comparar.</p>}
    </div>
  );
}
