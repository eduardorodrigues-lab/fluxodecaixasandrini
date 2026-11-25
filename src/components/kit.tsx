import { useEffect, useRef, useState, type ReactNode } from "react";
export { DateInput } from "@/components/DateField";
import { fmtNum, parseBRL } from "@/lib/money";
import type { Warning } from "@/lib/engine/types";

/** Money cell: commits once on Enter or blur (Enter blurs, so no double save); unchanged values are not resent.
 *  Empty = null (not informed), "0" = explicit zero; invalid text stays in the field, marked, and is never saved. */
export function MoneyInput({ value, onChange, className = "w-28" }: { value: number | null; onChange: (v: number | null) => void; className?: string }) {
  const [t, setT] = useState(fmtNum(value));
  const [invalid, setInvalid] = useState(false);
  const sent = useRef<{ from: number | null; v: number | null } | null>(null); // dedupes Enter+blur before the parent re-renders
  useEffect(() => { setT(fmtNum(value)); setInvalid(false); sent.current = null; }, [value]);
  const commit = () => {
    const blank = t.trim() === "";
    const v = parseBRL(t);
    if (!blank && v === null) { setInvalid(true); return; }
    setInvalid(false); setT(fmtNum(v));
    if (v === value || (sent.current && sent.current.from === value && sent.current.v === v)) return;
    sent.current = { from: value, v }; onChange(v);
  };
  return <input className={`inp num ${className} ${invalid ? "border-destructive" : ""}`} value={t} placeholder="vazio" aria-invalid={invalid || undefined} title={invalid ? "Valor inválido: corrija para salvar (vazio = não informado; 0 = zero)." : undefined}
    onChange={(e) => { setT(e.target.value); if (invalid) setInvalid(false); }} onBlur={commit}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { setT(fmtNum(value)); setInvalid(false); } }} />;
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
