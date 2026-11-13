import { useEffect, useState, type ReactNode } from "react";
export { DateInput } from "@/components/DateField";
import { fmtNum, parseBRL } from "@/lib/money";
import type { Warning } from "@/lib/engine/types";

export function MoneyInput({ value, onChange, className = "w-28" }: { value: number | null; onChange: (v: number | null) => void; className?: string }) {
  const [t, setT] = useState(fmtNum(value));
  useEffect(() => setT(fmtNum(value)), [value]);
  return <input className={`inp num ${className}`} value={t} placeholder="vazio" onChange={(e) => setT(e.target.value)} onBlur={() => { const v = parseBRL(t); onChange(v); setT(fmtNum(v)); }} />;
}
export function IntInput({ value, onChange, className = "w-12" }: { value: number | null; onChange: (v: number | null) => void; className?: string }) {
  return <input className={`inp num ${className}`} value={value ?? ""} placeholder="—" onChange={(e) => { const s = e.target.value.trim(); if (s === "") return onChange(null); const n = Number(s); if (Number.isFinite(n)) onChange(Math.trunc(n)); }} />;
}
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="page-header mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
      <div className="min-w-0"><h1 className="text-2xl font-semibold text-foreground">{title}</h1>{sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
export function WarningList({ items, max = 50 }: { items: Warning[]; max?: number }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">Nenhum alerta.</p>;
  const uniq = [...new Map(items.map((w) => [w.code + w.message, w])).values()];
  return (
    <ul className="space-y-1">
      {uniq.slice(0, max).map((w, i) => (
        <li key={i} className="flex gap-2 text-xs"><span className={`tag ${w.severity === "erro" ? "tag-err" : w.severity === "alerta" ? "tag-warn" : "tag-ok"}`}>{w.severity}</span><span>{w.message}</span></li>
      ))}
      {uniq.length > max && <li className="text-xs text-muted-foreground">+{uniq.length - max} alertas</li>}
    </ul>
  );
}
