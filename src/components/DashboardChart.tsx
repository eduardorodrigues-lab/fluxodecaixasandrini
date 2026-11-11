import { Button } from "@/components/ui/button";
import { signedMoney, supplierSlot, type DashboardReport } from "@/lib/dashboardReport";
import { useLayoutEffect, useRef, useState } from "react";

export function DashboardChart({ report, selected, onSelect, compact = false }: { report: DashboardReport; selected: string | null; onSelect: (key: string) => void; compact?: boolean }) {
  const [offset, setOffset] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(740);
  useLayoutEffect(() => { const element = ref.current; if (!element) return; const measure = () => setWidth(Math.max(280, element.clientWidth)); measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect(); }, []);
  if (report.type === "list") return null;
  const line = report.type === "line";
  const groups = line ? report.groups : report.groups.slice(offset, offset + (compact ? 4 : 5));
  const W = width, H = 145, left = line ? 12 : Math.min(175, W * .32), right = 118;
  const min = Math.min(0, ...groups.map((g) => g.value)), max = Math.max(1, ...groups.flatMap((g) => [g.value, g.second ?? 0]));
  const y = (v: number) => 12 + (max - v) / (max - min || 1) * 102;
  const x = (i: number) => left + i / Math.max(1, groups.length - 1) * (W - left - 20);
  const choose = (key: string) => onSelect(key);
  return <div ref={ref} className="dashboard-plot"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={line ? "Saldo final diário" : "Valores por grupo"} preserveAspectRatio="none">
    {line ? <><line x1={left} x2={W - 20} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="4 3" /><polyline points={groups.map((g, i) => `${x(i)},${y(g.value)}`).join(" ")} className="stroke-financial-positive" fill="none" strokeWidth="2" />{groups.map((g, i) => <g key={g.key} role="button" tabIndex={0} aria-label={`Filtrar relatório: ${g.label}, ${signedMoney(g.value)}`} onClick={() => choose(g.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(g.key); } }} className="cursor-pointer"><circle cx={x(i)} cy={y(g.value)} r={selected === g.key ? 6 : 3.5} className={g.value < 0 ? "fill-negative" : "fill-financial-positive"} /><title>{g.label}: {signedMoney(g.value)}</title>{(i === 0 || i === groups.length - 1 || selected === g.key) && <text x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === groups.length - 1 ? "end" : "middle"} className="fill-muted-foreground">{g.label}</text>}</g>)}</> : groups.map((g, i) => {
      const lane = 118 / Math.max(1, groups.length), top = 5 + i * lane, bw = (v: number) => Math.abs(v) / Math.max(Math.abs(min), max) * (W - left - right);
      return <g key={g.key} role="button" tabIndex={0} aria-label={`Filtrar relatório: ${g.label}, ${signedMoney(g.value + (g.second ?? 0))}`} onClick={() => choose(g.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(g.key); } }} className={`cursor-pointer ${g.supplierId ? `supplier-${supplierSlot(g.supplierId)}` : ""}`}>
        <text x={left - 8} y={top + 13} textAnchor="end" className="fill-muted-foreground">{g.label.length > 24 ? `${g.label.slice(0, 23)}…` : g.label}</text><title>{g.label}: {signedMoney(g.value)}{g.second !== undefined ? `; Planejada: ${signedMoney(g.second)}` : ""}</title>
        <rect x={left} y={top + 2} width={Math.max(1, bw(g.value))} height={g.second !== undefined ? 9 : Math.min(17, lane - 4)} className={g.supplierId ? "supplier-fill" : "fill-chart-1"} opacity={selected && selected !== g.key ? .4 : 1} />
        <text x={left + bw(g.value) + 6} y={top + 13} className={g.value < 0 ? "fill-negative" : "fill-financial-positive"}>{signedMoney(g.value)}</text>
        {g.second !== undefined && <><rect x={left} y={top + 13} width={Math.max(1, bw(g.second))} height={7} className="fill-chart-3" /><text x={left + bw(g.second) + 6} y={top + 23} className="fill-financial-positive">{signedMoney(g.second)}</text></>}
      </g>;
    })}
    {!groups.length && <text x={W / 2} y={70} textAnchor="middle" className="fill-muted-foreground">Sem registros neste escopo</text>}
  </svg>{!line && report.groups.length > (compact ? 4 : 5) && <div className="flex items-center justify-end gap-2 text-xs"><Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - (compact ? 4 : 5)))}>Grupos anteriores</Button><span>{offset + 1}–{Math.min(report.groups.length, offset + (compact ? 4 : 5))} / {report.groups.length}</span><Button variant="ghost" size="sm" disabled={offset + (compact ? 4 : 5) >= report.groups.length} onClick={() => setOffset(offset + (compact ? 4 : 5))}>Próximos grupos</Button></div>}</div>;
}
