import { useState } from "react";
import { Building2, CreditCard, Plus, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Field } from "./NotaPanel";
import { DateInput } from "./kit";
import { TermsEditor, termsLabel } from "./TermsEditor";
import { supplierInputErrors, type SupplierInput } from "@/lib/fornecedores";
import type { ScenarioData } from "@/lib/engine/types";

/** Formulário único de cadastro de fornecedor (Cadastros e dentro do lançamento). Renderiza no próprio card, sem painel sobreposto.
 *  Condições: cada uma com nome próprio e prazos; sem início ficam "Sem vigência" (nenhuma vira padrão automaticamente). */
export function SupplierFormFields({ d, id, value, onChange, review }: { d: ScenarioData; id: string; value: SupplierInput; onChange: (v: SupplierInput) => void; review?: boolean }) {
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => onChange({ ...value, [k]: v });
  const setCond = (i: number, c: Partial<SupplierInput["conditions"][number]>) => set("conditions", value.conditions.map((x, k) => (k === i ? { ...x, ...c } : x)));
  if (review) return <div className="space-y-2 text-sm">
    <p><span className="lbl">Nome comercial</span><br /><b>{value.name.trim()}</b></p>
    <p><span className="lbl">Razão social</span><br />{value.legalName.trim() || "Não informada"}</p>
    <p><span className="lbl">CNPJ</span><br />{value.cnpj.replace(/\D/g, "") || "Não informado"}</p>
    <p><span className="lbl">Código de origem</span><br />{value.sourceCode.trim() ? `${value.sourceSource.trim()}: ${value.sourceCode.trim()}` : "Não informado"}</p>
    <p><span className="lbl">Apelidos</span><br />{value.aliases.filter((a) => a.trim()).join("; ") || "Nenhum"}</p>
    <p><span className="lbl">Situação</span><br />{value.active ? "Ativo" : "Inativo"}</p>
    <p><span className="lbl">Observação</span><br />{value.note.trim() || "—"}</p>
    <div><span className="lbl">Condições de pagamento ({value.conditions.length})</span>
      {value.conditions.length ? value.conditions.map((c, i) => <p key={i}>{c.name.trim()} · {termsLabel(c.terms).replaceAll("/", " / ")} dias · {c.from ? `vigente a partir de ${c.from.split("-").reverse().join("/")}` : "sem vigência (não vira padrão)"}</p>) : <p className="text-muted-foreground">Sem condição definida — escolha a condição no lançamento.</p>}
    </div>
  </div>;
  return <div className="space-y-4">
    <h3 className="flex items-center gap-2 font-semibold"><Building2 className="size-5 text-primary" />Dados gerais</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field l="Nome comercial *"><input aria-label="Nome comercial" className="inp w-full" value={value.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field l="Razão social"><input aria-label="Razão social" className="inp w-full" placeholder="Não informada" value={value.legalName} onChange={(e) => set("legalName", e.target.value)} /></Field>
      <Field l="CNPJ (opcional)"><input aria-label="CNPJ" className="inp w-full" inputMode="numeric" placeholder="Não informado" value={value.cnpj} onChange={(e) => set("cnpj", e.target.value)} /></Field>
      <Field l="Situação"><select aria-label="Situação" className="inp w-full" value={value.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>
      <Field l="Origem do código"><input aria-label="Origem do código" className="inp w-full" placeholder="Ex.: FLUXO xlsm" value={value.sourceSource} onChange={(e) => set("sourceSource", e.target.value)} /></Field>
      <Field l="Código de origem"><input aria-label="Código de origem" className="inp w-full" placeholder="Não informado" value={value.sourceCode} onChange={(e) => set("sourceCode", e.target.value)} /></Field>
    </div>
    <Field l="Apelidos / nomes alternativos">
      <div className="space-y-2">{value.aliases.map((a, i) => <div key={i} className="flex gap-2"><input aria-label={`Apelido ${i + 1}`} className="inp min-w-0 flex-1" value={a} onChange={(e) => set("aliases", value.aliases.map((x, k) => (k === i ? e.target.value : x)))} /><Button variant="outline" size="icon" aria-label={`Remover apelido ${i + 1}`} onClick={() => set("aliases", value.aliases.filter((_, k) => k !== i))}><X className="size-4" /></Button></div>)}
        <Button variant="outline" size="sm" onClick={() => set("aliases", [...value.aliases, ""])}><Plus className="size-4" />Adicionar apelido</Button></div>
    </Field>
    <Field l="Observação"><textarea aria-label="Observação" className="inp min-h-16 w-full" value={value.note} onChange={(e) => set("note", e.target.value)} /></Field>
    <div className="flex items-center justify-between border-t border-border pt-3"><h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-5 text-primary" />Condições de pagamento ({value.conditions.length})</h3>
      <Button size="sm" onClick={() => set("conditions", [...value.conditions, { name: "", terms: [null], from: null, note: "" }])}><Plus className="size-4" />Nova condição</Button></div>
    {!value.conditions.length && <p className="text-muted-foreground">Sem condição definida. O lançamento permitirá escolher os prazos sem presumir padrão.</p>}
    {value.conditions.map((c, i) => <section key={i} className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-end gap-2"><Field l={`Nome da condição ${i + 1} *`}><input aria-label={`Nome da condição ${i + 1}`} className="inp w-full" value={c.name} onChange={(e) => setCond(i, { name: e.target.value })} /></Field>
        <Button variant="outline" size="icon" aria-label={`Remover condição ${i + 1}`} onClick={() => set("conditions", value.conditions.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button></div>
      <Field l="Vigente a partir de (opcional; em branco = sem vigência)"><DateInput value={c.from} onChange={(v) => setCond(i, { from: v })} /></Field>
      <Field l="Escopo / observação"><input className="inp w-full" value={c.note} onChange={(e) => setCond(i, { note: e.target.value })} /></Field>
      <TermsEditor terms={c.terms} onChange={(t) => setCond(i, { terms: t })} />
    </section>)}
    {supplierInputErrors(d, id, value).filter((m) => value.name.trim() || !/nome do fornecedor/.test(m)).map((m) => <p key={m} role="alert" className="text-destructive">{m}</p>)}
  </div>;
}

/** Card de cadastro (mesmo recipiente do card de visualização). Cancelar fecha imediatamente se limpo; nunca cria fornecedor. */
export function SupplierCreateCard({ d, id, value, onChange, dirty, onCancel, onConfirm, saving, saveLabel, error, confirmLabel = "Confirmar fornecedor", title = "Novo fornecedor", stageLocally = false }: {
  d: ScenarioData; id: string; value: SupplierInput; onChange: (v: SupplierInput) => void; dirty: boolean; onCancel: () => void; onConfirm: () => void;
  saving?: boolean; saveLabel?: string | undefined; error?: string; confirmLabel?: string; title?: string; stageLocally?: boolean;
}) {
  const [review, setReview] = useState(false);
  const valid = !supplierInputErrors(d, id, value).length;
  return <section className="sup-card sup-detail min-w-0" aria-label={title} data-dirty={dirty || undefined}>
    <header className="sup-head"><span className="sup-avatar"><Building2 className="size-7" /></span><div className="min-w-0 flex-1"><h2 className="sup-title">{review ? `Revisar: ${title}` : title}</h2><p className="text-sm text-muted-foreground">Nada é gravado até a confirmação.</p></div></header>
    <SupplierFormFields d={d} id={id} value={value} onChange={onChange} review={review} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
      {review ? <Button variant="outline" disabled={saving} onClick={() => setReview(false)}>Voltar e editar</Button> : <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
      <Button disabled={!valid || saving} onClick={() => (stageLocally || review ? onConfirm() : setReview(true))}>{stageLocally ? confirmLabel : review ? saveLabel ?? (saving ? "Salvando…" : confirmLabel) : "Revisar e confirmar"}</Button>
    </footer>
  </section>;
}
