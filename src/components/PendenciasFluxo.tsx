import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CircleAlert, Info, ChevronDown, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPendencias, monthName, monthsByYear, pendingSummary, type PendingGroup, type PendingItem } from "@/lib/pendencias";
import type { ScenarioData, Warning } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";

function Action({ item, label }: { item: PendingItem; label: string }) {
  return <Button asChild size="sm" variant="outline" className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left"><Link to={item.destination} search={{ focus: item.focus, tab: item.tab }}>{label}<ArrowUpRight aria-hidden="true" /></Link></Button>;
}
function Pending({ group }: { group: PendingGroup }) {
  const [open, setOpen] = useState(false);
  const first = group.items[0];
  if (!first) return null;
  const months = [...new Set(group.items.flatMap((i) => i.months))].sort();
  return <article className="min-w-0 border-b border-border py-3 last:border-b-0">
    <h4 className="text-sm font-semibold">{group.title}</h4>
    <p className="mt-0.5 text-xs text-muted-foreground">{pendingSummary(group.items)}</p>
    <p className="mt-1 text-xs leading-relaxed"><b>Impacto:</b> {group.impact}</p>
    <div className="mt-2 flex flex-wrap gap-2"><Action item={first} label={group.action} /><Button size="sm" variant="ghost" className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>{months.length ? "Ver meses pendentes" : "Ver detalhes"}<ChevronDown className={open ? "rotate-180" : ""} aria-hidden="true" /></Button></div>
    {open && <div className="mt-2 max-h-72 space-y-3 overflow-y-auto border-l-2 border-border pl-3 text-xs">
      {months.length ? Object.entries(monthsByYear(months)).map(([year, values]) => <div key={year}><h5 className="mb-1 font-semibold">{year}</h5><div className="flex flex-wrap gap-x-4 gap-y-2">{values.map((m) => <Link key={m} to="/metas" search={{ focus: m }} className="text-primary underline underline-offset-2">{monthName(m)}</Link>)}</div></div>) : group.items.map((item, n) => <div key={n} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-2 last:border-b-0"><div className="min-w-0 flex-1 break-words"><b>{item.label}</b><p className="mt-0.5 text-muted-foreground">{[...new Set(item.dates)].sort().map(fmtDate).join(" · ") || "Data não definida"}</p>{item.note && <p className="mt-1">{item.note}</p>}</div><Action item={item} label="Abrir registro" /></div>)}
    </div>}
  </article>;
}
function Sections({ groups }: { groups: PendingGroup[] }) {
  return <div className="space-y-3">{([
    { severity: "erro", label: "Erros", Icon: CircleAlert, tone: "text-destructive" },
    { severity: "alerta", label: "Atenção", Icon: AlertTriangle, tone: "text-warning-foreground" },
    { severity: "info", label: "Informações", Icon: Info, tone: "text-muted-foreground" },
  ] as const).map(({ severity, label, Icon, tone }) => {
    const list = groups.filter((g) => g.severity === severity);
    return list.length ? <section key={severity}><h3 className={`flex items-center gap-2 text-xs font-semibold ${tone}`}><Icon size={15} aria-hidden="true" />{label} · {list.length}</h3>{list.map((g) => <Pending key={g.code} group={g} />)}</section> : null;
  })}</div>;
}
export function PendenciasFluxo({ warnings, data, start, end }: { warnings: Warning[]; data: ScenarioData; start: string; end: string }) {
  const groups = buildPendencias(warnings, data, start, end);
  const current = groups.filter((g) => g.current), outside = groups.filter((g) => !g.current);
  const [showOutside, setShowOutside] = useState(false);
  return <section className="mt-4 min-w-0 border-t border-border pt-3" aria-label="Pendências do fluxo">
    <h2 className="mb-3 text-sm font-semibold">Pendências do fluxo</h2>
    {current.length ? <Sections groups={current} /> : <p className="text-xs text-muted-foreground">Nenhuma pendência no período selecionado.</p>}
    {outside.length > 0 && <div className="mt-3 border-t border-border pt-2"><Button variant="ghost" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left" aria-expanded={showOutside} onClick={() => setShowOutside(!showOutside)}>Fora do período selecionado · {outside.length}<ChevronDown className={showOutside ? "rotate-180" : ""} aria-hidden="true" /></Button>{showOutside && <div className="mt-2"><Sections groups={outside} /></div>}</div>}
  </section>;
}