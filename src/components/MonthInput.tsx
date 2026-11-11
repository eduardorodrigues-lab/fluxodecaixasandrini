import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { maskMonth } from "@/lib/monthReport";
export function MonthInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false), [year, setYear] = useState(2026);
  return <div className="flex items-center gap-1"><input aria-label="Novo mês (mm/aaaa)" placeholder="mm/aaaa" inputMode="numeric" className="inp w-24" value={value} onChange={(e) => onChange(maskMonth(e.target.value))} /><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><Button size="icon" variant="outline" title="Selecionar mês e ano" aria-label="Selecionar mês e ano"><CalendarDays className="size-4" /></Button></Popover.Trigger><Popover.Portal><Popover.Content sideOffset={5} collisionPadding={12} className="z-[110] w-64 rounded-md border border-border bg-popover p-3 shadow-lg"><label className="flex items-center justify-between gap-2">Ano<input aria-label="Ano do novo mês" className="inp w-24" type="number" min={1900} max={9999} value={year} onChange={(e) => setYear(Number(e.target.value))} /></label><div className="mt-3 grid grid-cols-3 gap-1">{["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((month, i) => <Button key={month} variant="ghost" size="sm" disabled={!Number.isInteger(year) || year < 1900 || year > 9999} onClick={() => { onChange(`${String(i + 1).padStart(2, "0")}/${year}`); setOpen(false); }}>{month}</Button>)}</div></Popover.Content></Popover.Portal></Popover.Root></div>;
}
