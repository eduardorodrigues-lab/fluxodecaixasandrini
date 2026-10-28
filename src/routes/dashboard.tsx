import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, ProfileBadge } from "@/components/kit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { computeFlow } from "@/lib/engine/engine";
import { computeDashboard, type Card, type OpenTitle } from "@/lib/engine/dashboard";
import { todaySP } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Títulos em aberto por fornecedor, vencimentos, saldo mínimo e necessidade de caixa." },
    { property: "og:title", content: "Dashboard · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Aberto por fornecedor, vencidos, a vencer e necessidade de caixa." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { active, ui, mode } = useApp();
  const d = active.data;
  const today = todaySP();
  const filter = { supplierId: ui.supplierId, group: ui.group };
  const flow = useMemo(() => computeFlow(d, { start: ui.start, end: ui.end, filter }), [d, ui.start, ui.end, ui.supplierId, ui.group]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = useMemo(() => computeDashboard(d, flow, today, { start: ui.start, end: ui.end, ...filter }), [d, flow, today, ui.start, ui.end, ui.supplierId, ui.group]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<Card | null>(null);
  const supName = d.suppliers.find((s) => s.id === ui.supplierId)?.name;
  return (
    <div className="space-y-3">
      <PageHeader title="Dashboard" sub={`Espaço ${mode === "demo" ? "DEMO" : "OFICIAL"} · cenário "${active.name}" · período ${fmtDate(ui.start)} a ${fmtDate(ui.end)}${supName ? ` · fornecedor ${supName}` : ""}${ui.group ? ` · grupo ${ui.group}` : ""} · hoje ${fmtDate(today)} (America/Sao_Paulo)`}><ProfileBadge /></PageHeader>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {k.cards.map((c) => (
          <button key={c.key} type="button" onClick={() => setSel(c)} aria-haspopup="dialog" aria-label={`${c.label}: ${fmtBRL(c.value)}. Abrir detalhes`}
            className="card flex flex-col items-start p-2 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="lbl">{c.label}</span>
            <span className={`num text-base font-semibold ${c.tone === "neg" && c.value !== 0 ? "neg" : ""}`}>{c.kind === "day" && c.key === "neg" ? (c.day ? fmtDate(c.day.date) : "nenhum") : fmtBRL(c.value)}</span>
            <span className="text-[10px] text-muted-foreground">{c.key === "top" && k.ranking[0] ? k.ranking[0].supplier : `${c.count} item(ns)`}{c.tone === "warn" ? " · pendência" : ""}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Aberto = títulos efetivados e despesas − pagamentos registrados (estornos desconsiderados). Previsão não entra. Vencimento passado não significa pago. Cada card mostra seu escopo: estoque na data-base (hoje) ou vencimentos do período.</p>
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          {sel && <Detail c={sel} today={today} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TitlesTable({ titles, today }: { titles: OpenTitle[]; today: string }) {
  const tot = (f: (t: OpenTitle) => number) => titles.reduce((a, t) => a + f(t), 0);
  return (
    <table className="tbl">
      <thead><tr><th>Vencimento</th><th>Tipo</th><th>Fornecedor</th><th>Documento</th><th className="num">Original</th><th className="num">Pago</th><th className="num">Pendente</th><th>Situação</th></tr></thead>
      <tbody>{titles.map((t) => <tr key={t.kind + t.id}><td className={t.due && t.due < today ? "neg" : ""}>{t.due ? fmtDate(t.due) : <span className="tag tag-warn">sem vencimento</span>}{t.due && t.due < today && " (vencido)"}</td><td>{t.kind === "committed" ? "Efetivado" : "Despesa"}</td><td>{t.supplier}</td><td>{t.document}</td><td className="num">{fmtBRL(t.value)}</td><td className="num">{fmtBRL(t.paid)}</td><td className="num">{fmtBRL(t.open)}</td><td>{t.state}</td></tr>)}</tbody>
      <tfoot><tr className="font-semibold"><td colSpan={4}>Total ({titles.length})</td><td className="num">{fmtBRL(tot((t) => t.value))}</td><td className="num">{fmtBRL(tot((t) => t.paid))}</td><td className="num">{fmtBRL(tot((t) => t.open))}</td><td /></tr></tfoot>
    </table>
  );
}

function Detail({ c, today }: { c: Card; today: string }) {
  const [sup, setSup] = useState<string | null>(null);
  const empty = c.count === 0;
  return (
    <div className="space-y-3 text-xs">
      <SheetHeader><SheetTitle>{c.label}: {c.key === "neg" && c.day ? fmtDate(c.day.date) : fmtBRL(c.value)}</SheetTitle><SheetDescription>{c.scope}</SheetDescription></SheetHeader>
      <p>{c.explanation}</p>
      {empty && <p className="rounded border border-border bg-muted p-2">Nada compõe este valor no escopo atual. Ajuste período, cenário ou filtros para ver outros dados.</p>}
      {!empty && c.kind === "titles" && <div className="overflow-auto"><TitlesTable titles={c.titles!} today={today} /></div>}
      {!empty && c.kind === "ranking" && <>
        <div className="overflow-auto"><table className="tbl"><thead><tr><th>#</th><th>Fornecedor</th><th className="num">Títulos</th><th className="num">Aberto</th></tr></thead>
          <tbody>{c.ranking!.map((r, i) => <tr key={r.supplierId}><td>{i + 1}</td><td><button type="button" className="underline hover:text-primary" onClick={() => setSup(r.supplierId)}>{r.supplier}</button></td><td className="num">{r.titles.length}</td><td className="num">{fmtBRL(r.open)}</td></tr>)}</tbody>
          <tfoot><tr className="font-semibold"><td colSpan={3}>Total</td><td className="num">{fmtBRL(c.ranking!.reduce((a, r) => a + r.open, 0))}</td></tr></tfoot></table></div>
        <div className="lbl">Títulos · {c.ranking!.find((r) => r.supplierId === (sup ?? c.ranking![0]!.supplierId))?.supplier}</div>
        <div className="overflow-auto"><TitlesTable titles={c.ranking!.find((r) => r.supplierId === (sup ?? c.ranking![0]!.supplierId))!.titles} today={today} /></div>
      </>}
      {!empty && c.kind === "parcels" && <div className="overflow-auto"><table className="tbl"><thead><tr><th>Data</th><th>Fornecedor</th><th>Cód. compra</th><th className="num">Parcela prevista</th></tr></thead>
        <tbody>{c.parcels!.map((p, i) => <tr key={i}><td>{fmtDate(p.date)}</td><td>{p.supplier}</td><td>{p.code}</td><td className="num">{fmtBRL(p.amount)}</td></tr>)}</tbody>
        <tfoot><tr className="font-semibold"><td colSpan={3}>Total ({c.parcels!.length})</td><td className="num">{fmtBRL(c.value)}</td></tr></tfoot></table></div>}
      {c.kind === "day" && c.day && <>
        <div className="lbl">Composição de {fmtDate(c.day.date)}</div>
        <table className="tbl"><tbody>
          <tr><td>Saldo inicial</td><td className="num">{fmtBRL(c.day.saldoInicial)}</td></tr>
          <tr><td>+ Recebimento usado ({c.day.usouInformado ? "informado" : "estimado"})</td><td className="num">{fmtBRL(c.day.recUsado)}</td></tr>
          <tr><td>− Compras planejadas</td><td className="num">{fmtBRL(c.day.planejada)}</td></tr>
          <tr><td>− Compras efetivadas</td><td className="num">{fmtBRL(c.day.comprometida)}</td></tr>
          <tr><td>− Despesas</td><td className="num">{fmtBRL(c.day.despesa)}</td></tr>
          <tr className="font-semibold"><td>= Saldo final</td><td className={`num ${c.day.saldoFinal < 0 ? "neg" : ""}`}>{fmtBRL(c.day.saldoFinal)}</td></tr>
        </tbody></table>
      </>}
      {c.kind === "day" && c.curve && c.curve.length > 0 && <Curve curve={c.curve} mark={c.day?.date ?? null} />}
    </div>
  );
}

function Curve({ curve, mark }: { curve: { date: string; saldo: number }[]; mark: string | null }) {
  const W = 640, H = 140;
  const min = Math.min(0, ...curve.map((x) => x.saldo)), max = Math.max(0, ...curve.map((x) => x.saldo));
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const x = (i: number) => (i / Math.max(1, curve.length - 1)) * W;
  const mi = curve.findIndex((c) => c.date === mark);
  return (
    <figure>
      <div className="lbl mb-1">Curva de saldo final no período</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Curva do saldo final diário">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-destructive" strokeDasharray="4 3" />
        <polyline fill="none" className="stroke-primary" strokeWidth={2} points={curve.map((c, i) => `${x(i)},${y(c.saldo)}`).join(" ")} />
        {mi >= 0 && <circle cx={x(mi)} cy={y(curve[mi]!.saldo)} r={4} className="fill-destructive" />}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">{fmtDate(curve[0]!.date)} a {fmtDate(curve.at(-1)!.date)} · linha tracejada = zero{mark ? ` · ponto = ${fmtDate(mark)}` : ""}</figcaption>
    </figure>
  );
}
