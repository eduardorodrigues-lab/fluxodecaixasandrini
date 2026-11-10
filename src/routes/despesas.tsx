import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DateInput, PageHeader } from "@/components/kit";
import { computeFlow, isOutItem, itemKind, itemStage, itemSub } from "@/lib/engine/engine";
import type { Item } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/despesas")({
  head: () => ({
    meta: [
      { title: "Relatório de despesas · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Despesas planejadas e efetuadas por período, subgrupo e etapa." },
      { property: "og:title", content: "Relatório de despesas · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Despesas por período, subgrupo e etapa, do mesmo motor do fluxo." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

// Relatório de despesas: MESMOS lançamentos do fluxo (sem cadastro separado). Filtros: período, subgrupo, etapa.
function Page() {
  const { active, ui } = useApp();
  const d = active.data;
  const [start, setStart] = useState(ui.start);
  const [end, setEnd] = useState(ui.end);
  const [sub, setSub] = useState("");
  const [stage, setStage] = useState<"" | "planejada" | "efetuada">("");

  const rows = useMemo(() => {
    const res = computeFlow(d, { start, end });
    const out: { date: string; it: Item; sub: string; stage: "planejada" | "efetuada" }[] = [];
    for (const day of res.days)
      for (const it of day.items) {
        if (!isOutItem(it) || itemKind(d.categories, it) !== "despesa") continue;
        const st = itemStage(it);
        const s = itemSub(d.categories, it);
        if (stage && st !== stage) continue;
        if (sub && s !== sub) continue;
        out.push({ date: day.date, it, sub: s, stage: st });
      }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [d, start, end, sub, stage]);

  const allSubs = useMemo(() => {
    const res = computeFlow(d, { start, end });
    const s = new Set<string>();
    for (const day of res.days) for (const it of day.items) if (isOutItem(it) && itemKind(d.categories, it) === "despesa") s.add(itemSub(d.categories, it));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [d, start, end]);

  const bySub = new Map<string, number>();
  let total = 0, totPlan = 0, totEfet = 0;
  for (const r of rows) {
    bySub.set(r.sub, (bySub.get(r.sub) ?? 0) + r.it.amount);
    total += r.it.amount;
    if (r.stage === "planejada") totPlan += r.it.amount; else totEfet += r.it.amount;
  }

  return (
    <div>
      <PageHeader title="Relatório de despesas" sub="Mesmos lançamentos do fluxo (planejado restante + efetuado, sem duplicar previsão efetivada). Filtros alteram só a apresentação.">
      </PageHeader>
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-2">
        <div><div className="lbl">De</div><DateInput value={start} maxDate={end} onChange={(v) => v && setStart(v)} /></div>
        <div><div className="lbl">Até</div><DateInput value={end} minDate={start} onChange={(v) => v && setEnd(v)} /></div>
        <div><div className="lbl">Subgrupo</div><select className="inp" value={sub} onChange={(e) => setSub(e.target.value)}><option value="">Todos</option>{allSubs.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><div className="lbl">Etapa</div><select className="inp" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}><option value="">Todas</option><option value="planejada">Planejada</option><option value="efetuada">Efetuada</option></select></div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="card p-2"><div className="lbl">Total de despesas</div><div className="num text-base font-semibold">{fmtBRL(total)}</div></div>
        <div className="card p-2"><div className="lbl">Planejada (restante)</div><div className="num text-base font-semibold">{fmtBRL(totPlan)}</div></div>
        <div className="card p-2"><div className="lbl">Efetuada</div><div className="num text-base font-semibold">{fmtBRL(totEfet)}</div></div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {[...bySub.entries()].sort((a, b) => b[1] - a[1]).map(([s, v]) => <button key={s} className={`tag ${sub === s ? "tag-ok" : ""}`} onClick={() => setSub(sub === s ? "" : s)}>{s}: {fmtBRL(v)}</button>)}
      </div>
      <div className="card overflow-auto">
        <table className="tbl"><thead><tr><th>Data</th><th>Etapa</th><th>Subgrupo</th><th>Lançamento</th><th className="num">Valor</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td>{fmtDate(r.date)}</td>
              <td><span className={`tag ${r.stage === "planejada" ? "tag-warn" : ""}`}>{r.stage === "planejada" ? "Planejada" : "Efetuada"}</span>{r.it.paid ? " · pago" : ""}</td>
              <td>{r.sub}</td>
              <td>{r.it.label}{r.it.note && <span className="block text-[11px] text-muted-foreground">{r.it.note}</span>}</td>
              <td className={`num ${r.it.amount < 0 ? "neg" : ""}`}>{fmtBRL(r.it.amount)}</td>
            </tr>
          ))}{!rows.length && <tr><td colSpan={5} className="text-muted-foreground">Nenhuma despesa no período/filtros.</td></tr>}</tbody>
          <tfoot><tr className="bg-muted font-semibold"><td colSpan={4}>Total</td><td className="num">{fmtBRL(total)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
