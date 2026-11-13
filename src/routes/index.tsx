import { supplierIdentityOptions } from "@/lib/supplierIdentity";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DateInput, MoneyInput } from "@/components/kit";
import { SlidersHorizontal } from "lucide-react";
import { PendenciasFluxo } from "@/components/PendenciasFluxo";
import { SaldoAdjustments } from "@/components/SaldoAdjustments";
import { Button } from "@/components/ui/button";
import { buildRows, computeFlow, toVertical, type Row } from "@/lib/engine/engine";
import { fmtDate, weekday } from "@/lib/dates";
import { fmtBRL, fmtNum } from "@/lib/money";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fluxo diário · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Fluxo de caixa diário em visão vertical (equipe) e horizontal (CEO)." },
      { property: "og:title", content: "Fluxo diário · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Fluxo de caixa diário em visão vertical e horizontal." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FluxoPage,
});

function FluxoPage() {
  const { active, ui, setUi, update } = useApp();
  const data = active.data;
  const res = useMemo(() => computeFlow(data, { start: ui.start, end: ui.end, filter: { supplierId: ui.supplierId, group: ui.group } }), [data, ui.start, ui.end, ui.supplierId, ui.group]);
  const rows = useMemo(() => buildRows(res, data.categories, ui.flowMode), [res, data.categories, ui.flowMode]);
  const [open, setOpen] = useState<Set<string>>(new Set(["entradas", "saidas", "compras", "despesas"]));
  const [sel, setSel] = useState<{ row: Row; i: number } | null>(null);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const visible = rows.filter((r) => { let p = r.parent; while (p) { if (!open.has(p)) return false; p = rows.find((x) => x.key === p)?.parent; } return true; });
  const hasKids = (k: string) => rows.some((r) => r.parent === k);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const groups = [...new Set(data.suppliers.map((s) => s.group))];
  const k = res.kpis;

  return (
    <div>
      {adjustmentsOpen && <SaldoAdjustments onClose={() => setAdjustmentsOpen(false)} />}
      <header className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
        <h1 className="min-w-0 text-base font-semibold">Fluxo de caixa</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" title="Ajustes manuais de saldo" aria-label="Ajustes manuais de saldo" onClick={() => setAdjustmentsOpen(true)}><SlidersHorizontal className="size-4" /></Button>
          <div className="flex rounded border border-input">
            {(["vertical", "horizontal"] as const).map((v) => <Button key={v} variant={ui.view === v ? "default" : "ghost"} className="h-7 rounded-none px-2 text-xs" aria-pressed={ui.view === v} onClick={() => setUi({ view: v })}>{v === "vertical" ? "Vertical (equipe)" : "Visão CEO horizontal"}</Button>)}
          </div>
        </div>
      </header>
      <div aria-label="Filtros do fluxo" className="grid grid-cols-2 items-end gap-x-2 gap-y-1.5 lg:grid-cols-[9rem_9rem_minmax(10rem,1fr)_8rem_minmax(13rem,1fr)]">
        <div><div className="lbl">De</div><DateInput value={ui.start} maxDate={ui.end} onChange={(v) => v && setUi({ start: v })} /></div>
        <div><div className="lbl">Até</div><DateInput value={ui.end} minDate={ui.start} onChange={(v) => v && setUi({ end: v })} /></div>
        <div className="min-w-0"><div className="lbl">Fornecedor</div><select className="inp w-full" value={ui.supplierId} onChange={(e) => setUi({ supplierId: e.target.value })}><option value="">Todos</option>{supplierIdentityOptions(data).map((s) => <option key={s.key} value={s.key}>{s.name}{s.pending ? " · vínculo pendente" : ""}</option>)}</select></div>
        <div className="min-w-0"><div className="lbl">Grupo</div><select className="inp w-full" value={ui.group} onChange={(e) => setUi({ group: e.target.value })}><option value="">Todos</option>{groups.map((g) => <option key={g}>{g}</option>)}</select></div>
        <div className="col-span-2 min-w-0 lg:col-span-1"><div className="lbl">Apresentação das saídas</div><select className="inp w-full" value={ui.flowMode} onChange={(e) => setUi({ flowMode: e.target.value as "consolidada" | "etapa" })}><option value="consolidada">Consolidada por subgrupo</option><option value="etapa">Separada por etapa (planejada/efetuada)</option></select></div>
        {res.filtered && <span className="col-span-2 text-xs text-warning-foreground lg:col-span-5">Filtro ativo: saldos consideram só as saídas filtradas</span>}
        {ui.start < data.params.startDate && <span className="col-span-2 text-xs text-warning-foreground lg:col-span-5">Fluxo começa em {fmtDate(data.params.startDate)}</span>}
      </div>
      <div aria-label="Indicadores do fluxo" className="mb-2 mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-border py-1.5 md:grid-cols-4">
        <Kpi label="Saldo final do período" v={k.saldoFinal} />
        <Kpi label={`Menor saldo · ${fmtDate(k.menorSaldoData)}`} v={k.menorSaldo} />
        <Kpi label="Entradas (sem saldo inicial)" v={k.entradasSemSaldo} />
        <Kpi label="Saídas" v={k.saidas} />
      </div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          {ui.view === "horizontal" ? (
            <div className="card max-h-[70vh] overflow-auto">
              <table className="tbl">
                <thead><tr>
                  <th className="col-fix sticky left-0 z-20 w-24 min-w-24 max-w-24">Natureza</th>
                  <th className="col-fix sticky left-24 z-20 w-28 min-w-28 max-w-28">Grupo</th>
                  <th className="col-fix sticky left-52 z-20 w-64 min-w-64 max-w-64 border-r border-border">Descrição</th>
                  <th className="num min-w-28">Total período</th>
                  {res.days.map((d) => <th key={d.date} className="num min-w-24">{fmtDate(d.date).slice(0, 5)}<div className="font-normal text-muted-foreground">{weekday(d.date)}</div></th>)}
                </tr></thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.key} className={r.emphasis ? "bg-muted font-semibold" : ""}>
                      <td className={`col-fix sticky left-0 z-[5] w-24 min-w-24 max-w-24 ${r.emphasis ? "bg-muted" : "bg-card"}`} title={r.nature}>{r.nature}</td>
                      <td className={`col-fix sticky left-24 z-[5] w-28 min-w-28 max-w-28 ${r.emphasis ? "bg-muted" : "bg-card"}`} title={r.group}>{r.group}</td>
                      <td className={`col-fix sticky left-52 z-[5] w-64 min-w-64 max-w-64 border-r border-border ${r.emphasis ? "bg-muted" : "bg-card"}`} title={r.label} style={{ paddingLeft: 8 + r.level * 12 }}>
                        {hasKids(r.key) ? <button className="mr-1 w-3 text-primary" onClick={() => toggle(r.key)}>{open.has(r.key) ? "▾" : "▸"}</button> : <span className="mr-1 inline-block w-3" />}{r.label}
                      </td>
                      <td className={`num ${r.total < 0 ? "neg" : ""}`}>{fmtNum(r.total)}</td>
                      {r.values.map((v, i) => <td key={i} onClick={() => setSel({ row: r, i })} className={`num cursor-pointer hover:bg-accent ${v < 0 ? "neg" : ""} ${v === 0 ? "text-muted-foreground" : ""}`}>{fmtNum(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vertical rows={rows} res={res} onPick={(row, i) => setSel({ row, i })} update={update} receipts={data.receipts} adjustments={data.adjustments} />
          )}
        </div>
        {sel && (
          <div className="card w-80 shrink-0 self-start p-3">
            <div className="mb-2 flex justify-between"><b className="text-xs">{sel.row.label} · {fmtDate(res.days[sel.i]?.date)}</b><button className="text-xs" onClick={() => setSel(null)}>✕</button></div>
            <div className="num mb-2 text-base font-semibold">{fmtBRL(sel.row.values[sel.i] ?? 0)}</div>
            {sel.row.match ? (
              <ul className="space-y-1 text-xs">
                {res.days[sel.i]?.items.filter(sel.row.match).map((it, j) => <li key={j} className="flex justify-between gap-2 border-b border-border py-1"><span>{it.label}{it.note && <span className="block text-muted-foreground">{it.note}</span>}</span><span className="num">{fmtBRL(it.amount)}</span></li>)}
              </ul>
            ) : <p className="text-xs text-muted-foreground">Linha de saldo: Saldo inicial + recebimento usado − saídas. Não é movimentação.</p>}
          </div>
        )}
      </div>
      <PendenciasFluxo warnings={res.warnings} data={data} start={ui.start} end={ui.end} />
    </div>
  );
}

function Kpi({ label, v }: { label: string; v: number }) {
  return <div className="min-w-0"><div className="text-[11px] leading-tight text-muted-foreground">{label}</div><div className={`num text-sm font-semibold ${v < 0 ? "neg" : ""}`}>{fmtBRL(v)}</div></div>;
}

type VProps = { rows: Row[]; res: ReturnType<typeof computeFlow>; onPick: (r: Row, i: number) => void; update: ReturnType<typeof useApp>["update"]; receipts: ReturnType<typeof useApp>["active"]["data"]["receipts"]; adjustments: ReturnType<typeof useApp>["active"]["data"]["adjustments"] };
const VCOLS = ["saldo_ini", "rec_real", "rec_est", "compras", "despesas", "saidas", "saldo_fim"];
function Vertical({ rows, res, onPick, update, receipts, adjustments }: VProps) {
  const vert = toVertical(rows, res.days);
  const cols = VCOLS.map((k) => rows.find((r) => r.key === k)!);
  const setGeneral = (date: string, v: number | null) => update((d) => {
    const r = d.receipts.find((x) => x.date === date);
    if (r) r.general = v; else if (v !== null) d.receipts.push({ id: uid(), date, platforms: {}, general: v, notes: "lançado na visão vertical" });
  });
  return (
    <div className="card max-h-[70vh] overflow-auto">
      <table className="tbl">
        <thead><tr><th className="sticky left-0 z-20 min-w-28">Data</th><th className="num">Ajuste saldo (substitui)</th><th className="num">Receb. geral informado</th>{cols.map((c) => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
        <tbody>
          {vert.map((v, i) => (
            <tr key={v.date}>
              <td className="sticky left-0 z-[5] bg-card">{fmtDate(v.date)} <span className="text-muted-foreground">{weekday(v.date)}</span></td>
              <td className="num">{adjustments.find((a) => a.date === v.date)?.value != null ? fmtNum(adjustments.find((a) => a.date === v.date)?.value) : "—"}</td>
              <td className="num"><MoneyInput value={receipts.find((r) => r.date === v.date)?.general ?? null} onChange={(x) => setGeneral(v.date, x)} /></td>
              {cols.map((c) => <td key={c.key} onClick={() => onPick(c, i)} className={`num cursor-pointer hover:bg-accent ${(v.cells[c.key] ?? 0) < 0 ? "neg" : ""} ${c.emphasis ? "font-semibold" : ""}`}>{fmtNum(v.cells[c.key])}</td>)}
            </tr>
          ))}
          <tr className="bg-muted font-semibold"><td className="sticky left-0 z-[5] bg-muted">Total</td><td /><td />{cols.map((c) => <td key={c.key} className="num">{fmtNum(c.total)}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}
