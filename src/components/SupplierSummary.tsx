import { supplierFamily } from "@/lib/supplierUnification";
import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BarChart3, Building2, CheckCircle2, Clock, ExternalLink, Layers } from "lucide-react";
import { paymentsFor, titleStatus } from "@/lib/engine/engine";
import { todaySP } from "@/lib/engine/actions";
import { fmtBRL } from "@/lib/money";
import type { ScenarioData } from "@/lib/engine/types";

const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(y!, m! - 1, d! + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

/** Read-only presentation of the supplier's effectivated titles (committed + expenses); never changes data. */
export function supplierTotals(d: ScenarioData, supplierId: string, today = todaySP()) {
  const fam = supplierFamily(d, supplierId); // principal + incorporados, cada registro uma vez
  const from = addDays(today, -365), d30 = addDays(today, 30), d60 = addDays(today, 60), d90 = addDays(today, 90);
  const r = { total12: 0, open: 0, paid: 0, overdue: 0, next30: 0, next60: 0, next90: 0 };
  const titles = [
    ...d.committed.filter(c => fam.has(c.supplierId)).map(c => ({ kind: "committed" as const, id: c.id, value: c.value, status: c.status, ref: c.effectiveDate ?? c.dueDate, due: c.extensionDate ?? c.dueDate })),
    ...d.expenses.filter(e => fam.has(e.supplierId)).map(e => ({ kind: "expense" as const, id: e.id, value: e.value, status: e.status, ref: e.baseDate, due: e.extensionDate ?? (e.termDays === null ? e.baseDate : addDays(e.baseDate, e.termDays)) })),
  ];
  for (const t of titles) {
    if (t.status === "cancelado") continue;
    const s = titleStatus(t.value, t.status, paymentsFor(d, t.kind, t.id));
    if (t.ref >= from && t.ref <= today) r.total12 += t.value;
    r.paid += s.paid;
    if (s.open <= 0) continue;
    r.open += s.open;
    if (t.due < today) r.overdue += s.open;
    else if (t.due <= d30) r.next30 += s.open;
    else if (t.due <= d60) r.next60 += s.open;
    else if (t.due <= d90) r.next90 += s.open;
  }
  return r;
}

const Kpi = ({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: string }) => (
  <div className="flex h-full items-center gap-3 rounded-lg border border-border bg-background p-3"><span className={`launch-icon ${tone ?? ""}`}>{icon}</span><div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className={`truncate text-lg font-bold tabular-nums ${tone ?? ""}`}>{fmtBRL(value)}</div></div></div>
);

export function SupplierSummary({ d, supplierId, name, compact = false }: { d: ScenarioData; supplierId: string; name: string; compact?: boolean }) {
  const t = useMemo(() => supplierId ? supplierTotals(d, supplierId) : null, [d, supplierId]);
  return <aside className={`launch-card launch-supplier flex min-w-0 flex-col ${compact ? "gap-2" : "gap-3"}`}>
    <h3 className="flex items-center gap-2 font-semibold"><span className="launch-icon"><Building2 className="h-4 w-4" /></span>Resumo do fornecedor</h3>
    {!t ? <p className="text-muted-foreground">Selecione o fornecedor para ver o resumo.</p> : <>
      <div className="rounded-lg bg-primary/10 px-3 py-2 font-semibold uppercase text-primary">{name}</div>
      <div className="grid auto-rows-fr grid-cols-2 gap-2">
        <Kpi icon={<Layers className="h-5 w-5" />} label="Total últimos 12 meses" value={t.total12} />
        <Kpi icon={<Clock className="h-5 w-5" />} label="Em aberto" value={t.open} tone="text-warning" />
        <Kpi icon={<CheckCircle2 className="h-5 w-5" />} label="Pago" value={t.paid} tone="text-primary" />
        <Kpi icon={<AlertTriangle className="h-5 w-5" />} label="Vencido" value={t.overdue} tone="text-destructive" />
      </div>
      <div className="flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4 text-primary" />A vencer por período</div>
      <div className="grid auto-rows-fr grid-cols-3 gap-2">{([["1–30 dias", t.next30], ["31–60 dias", t.next60], ["61–90 dias", t.next90]] as const).map(([l, v]) => <div key={l} className="rounded-lg border border-border bg-background p-2 text-center"><div className="text-xs text-muted-foreground">{l}</div><div className="font-bold tabular-nums">{fmtBRL(v)}</div></div>)}</div>
      <p className="text-xs text-muted-foreground">Somente efetivados; planejados não entram. Períodos sem sobreposição.</p>
      <Link to="/referencias" className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-primary/10 py-2 font-semibold text-primary hover:bg-primary/15"><ExternalLink className="h-4 w-4" />Ver detalhes do fornecedor</Link>
    </>}
  </aside>;
}
