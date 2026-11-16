import { splitOrigin } from "@/lib/originText";

/** Observação sem referências técnicas de proveniência; o texto bruto permanece nos dados e no Histórico. */
export function OriginNote({ note, className }: { note?: string | null | undefined; className?: string }) {
  const t = splitOrigin(note).text;
  return t ? <span className={className}>{t}</span> : null;
}
