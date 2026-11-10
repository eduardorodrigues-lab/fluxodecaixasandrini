import { useEffect, useId, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calendarDate, calendarIso, dateInputError, fmtDate, maskDateInput, parseBRDate } from "@/lib/dates";

export interface DateInputProps {
  value: string | null; onChange: (value: string | null) => void;
  allowEmpty?: boolean; minDate?: string | null; maxDate?: string | null;
  onValidityChange?: (valid: boolean) => void;
}
export function DateInput({ value, onChange, allowEmpty = false, minDate, maxDate, onValidityChange }: DateInputProps) {
  const [text, setText] = useState(fmtDate(value));
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const id = useId();
  const selected = calendarDate(parseBRDate(text) ?? value);
  const [month, setMonth] = useState<Date | undefined>(selected);
  const error = dateInputError(text, allowEmpty, minDate, maxDate);
  useEffect(() => { setText(fmtDate(value)); setTouched(false); }, [value]);
  useEffect(() => { onValidityChange?.(!error); }, [error, onValidityChange]);
  const commit = (next: string) => {
    setTouched(true);
    if (dateInputError(next, allowEmpty, minDate, maxDate)) return;
    const iso = next.trim() ? parseBRDate(next) : null;
    if (iso !== value) onChange(iso);
  };
  return <span className="inline-flex max-w-full flex-col align-top">
    <Popover open={open} onOpenChange={(next) => { if (next) setMonth(selected); setOpen(next); }}>
      <PopoverAnchor asChild><span className="inline-flex w-36 max-w-full items-center gap-1">
        <input className={`inp min-w-0 flex-1 ${touched && error ? "ring-1 ring-destructive" : ""}`} value={text} placeholder="dd/mm/aaaa" inputMode="numeric" maxLength={10} aria-invalid={!!(touched && error)} aria-describedby={touched && error ? id : undefined}
          onChange={(e) => { setText(maskDateInput(e.target.value)); setTouched(false); }}
          onPaste={(e) => { e.preventDefault(); const next = maskDateInput(e.clipboardData.getData("text")); setText(next); commit(next); }}
          onBlur={() => commit(text)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(text); } }} />
        <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" aria-label="Abrir calendário" title="Abrir calendário"><CalendarIcon className="size-4" /></Button></PopoverTrigger>
      </span></PopoverAnchor>
      <PopoverContent align="start" collisionPadding={8} className="pointer-events-auto z-[120] max-h-[var(--radix-popover-content-available-height)] w-auto max-w-[calc(100vw-1rem)] overflow-auto p-0" onEscapeKeyDown={(e) => e.stopPropagation()}>
        <Calendar mode="single" locale={ptBR} captionLayout="dropdown" startMonth={new Date(1900, 0, 1)} endMonth={new Date(2199, 11, 1)} {...(month ? { month } : {})} onMonthChange={setMonth} selected={selected} autoFocus className="pointer-events-auto p-3"
          onSelect={(date) => { if (!date) return; const next = fmtDate(calendarIso(date)); setText(next); commit(next); setOpen(false); }} />
      </PopoverContent>
    </Popover>
    {touched && error && <span id={id} role="alert" className="mt-1 max-w-52 whitespace-normal text-[11px] text-destructive">{error}</span>}
  </span>;
}