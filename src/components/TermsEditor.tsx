// Lista dinâmica de prazos (sem limite fixo): uma linha por parcela; vazio ≠ zero (0 = à vista).
import { useState } from "react";
import { IntInput } from "@/components/kit";

export const termsLabel = (t: (number | null)[]) => t.filter((x) => x !== null).join("/") || "—";
export function TermsEditor({ terms, onChange }: { terms: (number | null)[]; onChange: (t: (number | null)[]) => void }) {
  const [qty, setQty] = useState<number | null>(null);
  const [step, setStep] = useState<number | null>(30);
  const gen = () => { if (!qty || qty < 1) return; onChange(Array.from({ length: qty }, (_, i) => (step === null ? null : step * (i + 1)))); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label><span className="lbl block">Quantidade de parcelas</span><IntInput value={qty} onChange={setQty} /></label>
        <label><span className="lbl block">Intervalo (dias)</span><IntInput value={step} onChange={setStep} /></label>
        <button className="btn" disabled={!qty || qty < 1} onClick={gen}>Gerar prazos</button>
        <span className="text-muted-foreground">Ajuste cada prazo abaixo. 0 = à vista; vazio = não preenchido.</span>
      </div>
      <div className="max-h-72 overflow-auto rounded border border-border">
        <table className="tbl"><thead><tr><th>Parcela</th><th className="num">Prazo (dias)</th><th /></tr></thead>
          <tbody>{terms.map((t, i) => <tr key={i}><td>{i + 1}/{terms.length}</td><td className="num"><IntInput value={t} onChange={(v) => onChange(terms.map((x, k) => (k === i ? v : x)))} /></td><td><button className="btn btn-danger" aria-label={`Remover parcela ${i + 1}`} disabled={terms.length === 1} onClick={() => onChange(terms.filter((_, k) => k !== i))}>Remover</button></td></tr>)}</tbody></table>
      </div>
      <button className="btn" onClick={() => onChange([...terms, null])}>+ Adicionar parcela</button>
    </div>
  );
}
