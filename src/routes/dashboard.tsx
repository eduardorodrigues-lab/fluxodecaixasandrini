import { ManageLaunchPanel } from "@/components/ManageLaunchPanel";
import type { LaunchRef } from "@/lib/manageLaunch";
import { supplierIdentityOptions } from "@/lib/supplierIdentity";
import { createFileRoute } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { DateInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { DashboardChart } from "@/components/DashboardChart";
import { useAvailableArea } from "@/components/AvailableArea";
import { computeFlow } from "@/lib/engine/engine";
import { computeDashboard } from "@/lib/engine/dashboard";
import { cardReport, cashReport, expensesReport, titlesReport, moneyTone, signedMoney, supplierSlot, type DashboardReport } from "@/lib/dashboardReport";
import { todaySP } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/dates";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Indicadores, gráficos e registros reconciliados do caixa Sandrini." },
    { property: "og:title", content: "Dashboard · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Fornecedores, vencimentos, despesas e saldo projetado com relatórios fonte." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
function Page() {
  const { active, ui, setUi } = useApp(); const d = active.data; const today = todaySP();
  const { ref, height } = useAvailableArea();
  const flow = useMemo(() => computeFlow(d, { start: ui.start, end: ui.end, filter: { supplierId: ui.supplierId, group: ui.group } }), [d, ui]);
  const k = useMemo(() => computeDashboard(d, flow, today, { start: ui.start, end: ui.end, supplierId: ui.supplierId, group: ui.group }), [d, flow, today, ui]);
  const [managed, setManaged] = useState<LaunchRef | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [point, setPoint] = useState<string | null>(null), [page, setPage] = useState(0);
  const overview = useMemo(() => [
    { key: "cash-chart", title: "Saldo projetado no período", report: cashReport(flow.days), note: "Saldo final diário projetado. Inclui previsões; não é saldo bancário realizado.", scope: `${fmtDate(ui.start)} a ${fmtDate(ui.end)}` },
    { key: "suppliers-chart", title: "Fornecedores em aberto", report: titlesReport(d, k.titles), note: "Somente efetivado validado em aberto, descontadas baixas ativas. Previsões e situação a confirmar ficam separadas.", scope: `Estoque em ${fmtDate(today)}` },
    { key: "due-chart", title: "Vencimentos do período", report: titlesReport(d, k.cards.find((c) => c.key === "period")?.titles ?? [], "date"), note: "Vencimento vigente, incluindo prorrogação confirmada. Não somar janelas acumuladas de 7, 15 e 30 dias.", scope: `${fmtDate(ui.start)} a ${fmtDate(ui.end)}` },
    { key: "expenses-chart", title: "Despesas por subgrupo", report: expensesReport(d, k.titles, k.cards.find((c) => c.key === "planned")?.parcels ?? []), note: "Efetivado em aberto: estoque na data-base. Planejado restante: período selecionado. Etapas separadas, sem repetir previsões substituídas.", scope: `Estoque ${fmtDate(today)} / previsão ${fmtDate(ui.start)} a ${fmtDate(ui.end)}` },
  ], [d, k, flow, ui, today]);
  const card = k.cards.find((c) => c.key === selected), graph = overview.find((g) => g.key === selected);
  const report = card ? cardReport(d, card, flow.days) : graph?.report;
  const select = (key: string | null) => { setSelected(key); setPoint(null); setPage(0); };
  const filtered = report?.rows.filter((r) => point === null || r.group === point) ?? [];
  const tableArea = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(1);
  useLayoutEffect(() => {
    const element = tableArea.current;
    if (!element) return;
    const measure = () => {
      const header = element.querySelector("thead")?.getBoundingClientRect().height ?? 35;
      const rowHeight = Math.max(38, ...Array.from(element.querySelectorAll("tbody tr")).map((row) => row.getBoundingClientRect().height));
      setSize(Math.max(1, Math.floor((element.getBoundingClientRect().height - header - 6) / rowHeight)));
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [selected, report, height, page]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * size, (current + 1) * size);
  const title = card?.label ?? graph?.title ?? "";
  const total = report?.type === "line" ? filtered.at(-1)?.value ?? 0 : filtered.reduce((s, r) => s + r.value, 0);
  const scope = (card?.scope ?? graph?.scope ?? "").replace(/\d{4}-\d{2}-\d{2}/g, (s) => fmtDate(s));
  return <div ref={ref} className="dashboard-page" style={{ "--available-height": `${height}px` } as React.CSSProperties}>
    <header className="dashboard-header"><div><h1 className="text-lg font-semibold">Dashboard</h1><p className="text-xs text-muted-foreground">{active.isBase ? "Fluxo real" : `Simulação ${active.name}`} · {fmtDate(ui.start)} a {fmtDate(ui.end)} · referência {fmtDate(today)}</p></div><div className="flex flex-wrap items-center gap-2"><label className="text-xs">De <DateInput value={ui.start} maxDate={ui.end} onChange={(s) => s && setUi({ start: s })} /></label><label className="text-xs">Até <DateInput value={ui.end} minDate={ui.start} onChange={(s) => s && setUi({ end: s })} /></label><select aria-label="Fornecedor do dashboard" className="inp max-w-40" value={ui.supplierId} onChange={(e) => { setUi({ supplierId: e.target.value }); setPage(0); setPoint(null); }}><option value="">Todos os fornecedores</option>{supplierIdentityOptions(d).map((s) => <option key={s.key} value={s.key}>{s.name}{s.pending ? " · vínculo pendente" : ""}</option>)}</select></div></header>
    <div className="dashboard-kpis">{k.cards.map((c) => <Button key={c.key} variant="outline" aria-pressed={selected === c.key} aria-label={`${c.label}: ${signedMoney(c.value)}. Abrir relatório`} className="dashboard-kpi" onClick={() => select(c.key)}><span>{c.label}</span><strong className={moneyTone(c.value)}>{c.key === "neg" && !c.day ? "Nenhum" : signedMoney(c.value)}</strong><small>{c.key === "top" ? k.ranking[0]?.supplier ?? "Sem títulos" : c.day ? fmtDate(c.day.date) : ["planned", "period"].includes(c.key) ? `${fmtDate(ui.start)}–${fmtDate(ui.end)}` : `${c.count} registros · ${fmtDate(today)}`}</small></Button>)}</div>
    {!selected ? <div className="dashboard-overview">{overview.map((g) => <section key={g.key} className="dashboard-chart-section"><header><h2>{g.title}</h2><Button variant="ghost" size="sm" onClick={() => select(g.key)} aria-label={`Expandir ${g.title}`}><Maximize2 className="size-4" />Expandir</Button></header><DashboardChart compact report={g.report} selected={null} onSelect={(key) => { setSelected(g.key); setPoint(key); setPage(0); }} /><p className="text-xs text-muted-foreground">{g.scope}</p></section>)}</div> : report && <section className="dashboard-expanded"><header className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{scope}</p></div><Button variant="outline" size="sm" onClick={() => select(null)}><Minimize2 className="size-4" />Minimizar</Button></header><div className="dashboard-detail-layout"><div className="dashboard-primary">
      <DashboardChart key={selected} report={report} selected={point} onSelect={(key) => { setPoint(point === key ? null : key); setPage(0); }} />
      <div className="dashboard-report"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Relatório dos dados</h3>{point && <Button size="sm" variant="ghost" onClick={() => { setPoint(null); setPage(0); }}>Mostrar todos</Button>}</div><SourceTable onManage={setManaged} report={report} rows={rows} areaRef={tableArea} /><div className="flex items-center justify-between gap-2 text-xs"><span>{report.totalLabel}</span><strong className={moneyTone(total)}>{signedMoney(total)}</strong></div><div className="flex items-center justify-between gap-2 text-xs"><span>{filtered.length} registros · Página {current + 1} de {pages}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Próxima</Button></div></div></div>
    </div><aside className="dashboard-info"><h3>Dados</h3><dl><dt>{card ? card.label : report.totalLabel}</dt><dd className={moneyTone(card?.value ?? report.total)}>{signedMoney(card?.value ?? report.total)}</dd><dt>Registros representados</dt><dd>{report.rows.length}</dd><dt>Escopo</dt><dd>{scope}</dd>{point && <><dt>Seleção</dt><dd>{report.groups.find((g) => g.key === point)?.label}</dd></>}</dl><h3>Observações / considerações</h3><p>{(card?.explanation ?? graph?.note ?? "").replace(/\d{4}-\d{2}-\d{2}/g, (s) => fmtDate(s))}</p><h3>Legenda / critério</h3><p>{report.type === "line" ? "Linha: saldo final diário. Zero é referência; saldos não são somados. Azul positivo, vermelho negativo, sinal explícito." : report.type === "paired" ? "Primeira barra: efetivado. Segunda barra: planejado restante. As duas etapas estão identificadas no relatório." : report.type === "list" ? "Registros fonte sem gráfico: a lista preserva as pendências, sem inventar classificação ou vencimento." : "Barras: saldo dos registros por fornecedor ou vencimento. Azul positivo, vermelho negativo. Seleção filtra os registros e o total."}</p>{report.groups.some((g) => g.supplierId) && <div className="dashboard-legend">{report.groups.map((g) => <div key={g.key} className={g.supplierId ? `supplier-${supplierSlot(g.supplierId)}` : ""}><i className="supplier-swatch" /><span>{g.label}</span></div>)}</div>}</aside></div></section>}
    {managed && <ManageLaunchPanel key={`${managed.kind}:${managed.id}`} launch={managed} onClose={() => setManaged(null)} />}
  </div>;
}
function SourceTable({ report, rows, areaRef, onManage }: { onManage: (ref: LaunchRef) => void; report: DashboardReport; rows: DashboardReport["rows"]; areaRef: React.RefObject<HTMLDivElement | null> }) {
  return <div ref={areaRef} className="dashboard-table-wrap"><table className="tbl dashboard-source"><thead><tr>{report.heads.map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} tabIndex={row.launch ? 0 : undefined} className={row.launch ? "cursor-pointer hover:bg-muted" : ""} onClick={() => row.launch && onManage(row.launch)} onKeyDown={(e) => { if (e.key === "Enter" && row.launch) onManage(row.launch); }}>{row.cells.map((c, i) => <td key={i} className={c.amount !== undefined ? `num ${moneyTone(c.amount)}` : ""}>{i === 0 && row.supplierId && <i aria-hidden className={`supplier-swatch supplier-${supplierSlot(row.supplierId)}`} />}{c.text}</td>)}</tr>)}{!rows.length && <tr><td colSpan={report.heads.length}>Nenhum registro neste escopo.</td></tr>}</tbody></table></div>;
}
