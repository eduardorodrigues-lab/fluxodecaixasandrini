import { splitOrigin } from "@/lib/originText";

/** Observação sem referências técnicas; a origem bruta fica na seção recolhível. */
export function OriginNote({ note, className, audit = false }: { note?: string | null | undefined; className?: string; audit?: boolean }) {
  const s = splitOrigin(note);
  return <>
    {s.text && <span className={className}>{s.text}</span>}
    {audit && s.origin.length > 0 && <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">Origem da importação</summary>{note}</details>}
  </>;
}
