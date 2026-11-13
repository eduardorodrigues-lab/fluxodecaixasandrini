import { useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";
import { Field, guardClose, SidePanel } from "./NotaPanel";
import { DateInput } from "./kit";
import { TermsEditor, termsLabel } from "./TermsEditor";
import { useApp } from "@/lib/store";
import { addSupplierCondition, condPeriods, currentCondition, invalidSupplierName, reactivateCondition, supplierConditions } from "@/lib/notas";
import { changeCondition, conditionImpact } from "@/lib/condicoes";
import { deleteSupplier, editSupplier, setSupplierActivity, supplierActive, supplierLinks } from "@/lib/fornecedores";
import { todaySP } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/dates";
import type { SupplierCondition } from "@/lib/engine/types";

function Actions({ label = "Ações", children }: { label?: string; children: React.ReactNode }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><MoreHorizontal className="size-4" />{label}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="z-[60]">{children}</DropdownMenuContent></DropdownMenu>;
}
const dt = (at: string) => at ? new Date(at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
type Operation = { kind: "new" | "edit" | "activate" | "cancel" | "period" | "delete" | "inativar" | "reativar" | "excluir"; id?: string; index?: number };

export function FornecedorManager({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const { active, update, user } = useApp();
  const d = active.data;
  const s = d.suppliers.find((x) => x.id === supplierId);
  const [tab, setTab] = useState("dados");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState(s?.name ?? "");
  const [aliases, setAliases] = useState(s?.aliases?.join("\n") ?? "");
  const [note, setNote] = useState(s?.note ?? "");
  const [review, setReview] = useState(false);
  const [op, setOp] = useState<Operation | null>(null);
  const [cn, setCn] = useState(""); const [cnote, setCnote] = useState("");
  const [terms, setTerms] = useState<(number | null)[]>([null]);
  const [from, setFrom] = useState<string | null>(todaySP());
  const [reason, setReason] = useState(""); const [replacement, setReplacement] = useState(""); const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  if (!s) return null;
  const today = todaySP(); const list = supplierConditions(s); const cur = currentCondition(s, today);
  const selected = list.find((c) => c.id === op?.id);
  const impact = selected && (op?.kind === "cancel" || op?.kind === "period") ? conditionImpact(s, selected.id, today, op.kind === "period" ? op.index : undefined) : [];
  const start = (operation: Operation, c?: SupplierCondition) => {
    setOp(operation); setReview(false); setError(""); setCn(c?.name ?? ""); setCnote(c?.note ?? ""); setTerms(c ? [...c.terms] : [null]); setFrom(today); setReason(""); setReplacement(""); setAck(false);
  };
  const saveChanges = () => {
    const at = new Date().toISOString(); const by = user?.email ?? "";
    const e = update((x) => {
      if (!op) { editSupplier(x, supplierId, { name, aliases: aliases.split("\n").map((v) => v.trim()).filter(Boolean), note }); return; }
      if (op.kind === "new") addSupplierCondition(x, supplierId, { name: cn, terms, note: cnote, from }, at, by, today);
      else if (op.kind === "activate" && op.id && from) reactivateCondition(x, supplierId, op.id, from, at, by, today);
      else if (op.kind === "inativar" || op.kind === "reativar") setSupplierActivity(x, supplierId, op.kind === "reativar", from ?? "", at, by);
      else if (op.kind === "excluir") deleteSupplier(x, supplierId);
      else if (op.id) changeCondition(x, supplierId, op.id,
        op.kind === "edit" ? { kind: "edit", name: cn, note: cnote, terms } : op.kind === "delete" ? { kind: "delete" } : op.kind === "period" ? { kind: "period", index: op.index ?? -1, reason, replacementId: replacement || null, acknowledge: ack } : { kind: "cancel", reason, replacementId: replacement || null, acknowledge: ack }, at, by, today);
    });
    setError(e ?? ""); if (!e) { if (op?.kind === "excluir") onClose(); setOp(null); setReview(false); }
  };
  const draft = op?.kind === "new" || op?.kind === "edit";
  const cancelling = op?.kind === "cancel" || op?.kind === "period";
  const valid = op ? draft ? !!cn.trim() && terms.some((v) => v !== null) && terms.every((v) => v === null || Number.isInteger(v) && v >= 0) && (op.kind !== "new" || !!from) : cancelling ? !!reason.trim() && (!impact.length || ack) : ["activate", "inativar", "reativar"].includes(op.kind) ? !!from : true : !invalidSupplierName(name);
  const title = !op ? "Dados do fornecedor" : ({ new: "Nova condição", edit: "Editar condição", activate: "Usar como vigente", cancel: "Cancelar condição", period: "Cancelar ativação de vigência", delete: "Excluir condição", inativar: "Inativar fornecedor", reativar: "Reativar fornecedor", excluir: "Excluir fornecedor" }[op.kind]);
  const editing = !!op || tab === "dados";
  const dirty = !!op || name !== s.name || aliases !== (s.aliases ?? []).join("\n") || note !== (s.note ?? "");
  const close = guardClose(dirty, onClose);
  const destructive = !!op && ["delete", "excluir", "cancel", "period", "inativar"].includes(op.kind);
  const action = !op ? "Salvar fornecedor" : draft ? "Salvar condição" : title;
  return <SidePanel centered={review} title={review ? `${action}?` : "Gerenciar fornecedor"} sub={s.name} onClose={onClose} dirty={dirty} footer={<>
    {review ? <Button variant="outline" onClick={() => setReview(false)}>Cancelar</Button> : editing && op ? <Button variant="outline" onClick={guardClose(dirty, () => { setOp(null); setError(""); })}>Cancelar edição</Button> : <Button variant="outline" onClick={close}>Fechar</Button>}
    {editing && <Button variant={review && destructive ? "destructive" : "default"} disabled={!valid} onClick={() => review ? saveChanges() : setReview(true)}>{review ? action : "Revisar e confirmar"}</Button>}
  </>}>
    <div className="min-w-0 space-y-4 break-words [overflow-wrap:anywhere]">
      {!op && <div role="tablist" className="grid grid-cols-2 gap-1 border-b border-border pb-2">{[["dados", "Dados do fornecedor"], ["condicoes", "Condições de pagamento"]].map(([id, label]) => <Button key={id} role="tab" aria-selected={tab === id} variant={tab === id ? "default" : "outline"} className="h-auto min-h-9 whitespace-normal" onClick={() => { setTab(id ?? "dados"); setReview(false); setError(""); }}>{label}</Button>)}</div>}
      {(op || tab === "dados") && <>
        <h3 className="text-sm font-semibold">{review ? `Revisar: ${title}` : title}</h3>
        {!op ? review ? <div className="space-y-2"><p>{name}</p>{aliases && <p>{aliases}</p>}{note && <p>{note}</p>}</div> : <>
          <Field l="Nome *"><input className="inp w-full" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field l="Apelidos (um por linha)"><textarea className="inp min-h-20 w-full" value={aliases} onChange={(e) => setAliases(e.target.value)} /></Field>
          <Field l="Observação"><textarea className="inp min-h-20 w-full" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Actions label="Outras ações"><DropdownMenuItem onSelect={() => start({ kind: supplierActive(s, today) ? "inativar" : "reativar" })}>{supplierActive(s, today) ? "Inativar" : "Reativar"}</DropdownMenuItem><DropdownMenuItem onSelect={() => start({ kind: "excluir" })}>Excluir fornecedor</DropdownMenuItem></Actions>
        </> : <>
          {draft && (review ? <div className="space-y-2"><p className="font-semibold">{cn}</p><p>{termsLabel(terms).replaceAll("/", " / ")} dias</p>{cnote && <p>{cnote}</p>}{op.kind === "new" && <p>Vigência: {fmtDate(from)}</p>}{op.kind === "edit" && <p>Versão anterior preservada. Lançamentos existentes não serão recalculados.</p>}</div> : <>
            <Field l="Nome da condição *"><input className="inp w-full" value={cn} onChange={(e) => setCn(e.target.value)} /></Field>
            <Field l="Observação"><textarea className="inp min-h-16 w-full" value={cnote} onChange={(e) => setCnote(e.target.value)} /></Field>
            {op.kind === "new" && <Field l="Início da vigência"><DateInput value={from} onChange={setFrom} /></Field>}
            <TermsEditor terms={terms} onChange={setTerms} />
          </>)}
          {["activate", "inativar", "reativar"].includes(op.kind) && <>{selected && <p>{selected.name}</p>}{review ? <p>A partir de {fmtDate(from)}. Lançamentos existentes permanecem intactos.</p> : <Field l="Início da vigência"><DateInput value={from} onChange={setFrom} /></Field>}</>}
          {cancelling && <><p>{selected?.name}</p>{impact.length > 0 && <div className="space-y-2 border-l-2 border-destructive pl-3"><p>Afeta o padrão nos períodos iniciados em: {impact.map(fmtDate).join(", ")}. Outros agendamentos permanecem.</p><Field l="Substituta"><select className="inp h-auto w-full" disabled={review} value={replacement} onChange={(e) => setReplacement(e.target.value)}><option value="">Sem condição padrão nos períodos afetados</option>{list.filter((c) => c.id !== selected?.id && !c.cancelled).map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></Field><label className="flex items-start gap-2"><input type="checkbox" checked={ack} disabled={review} onChange={(e) => setAck(e.target.checked)} />Confirmo esta definição de padrão para os períodos afetados.</label></div>}{review ? <p>Motivo: {reason}</p> : <Field l="Motivo *"><textarea className="inp min-h-20 w-full" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}<p>Histórico, vínculos e lançamentos existentes serão preservados.</p></>}
          {op.kind === "delete" && <p>Excluir somente se nunca utilizada, sem vínculos, histórico ou períodos de vigência. Caso contrário, a exclusão será bloqueada.</p>}
          {op.kind === "excluir" && <p>{supplierLinks(d, supplierId).length ? `Exclusão bloqueada: possui ${supplierLinks(d, supplierId).join(", ")}.` : "Confirmar exclusão deste fornecedor sem vínculos?"}</p>}
        </>}
      </>}
      {!op && tab === "condicoes" && <>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><h3 className="min-w-0 font-semibold">Condições ({list.length})</h3><Button size="sm" onClick={() => start({ kind: "new" })}>Nova condição</Button></div>
        {list.map((c) => <section key={c.id} className="space-y-2 border-b border-border py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><div className="min-w-0"><Button variant="ghost" size="sm" className="h-auto max-w-full justify-start whitespace-normal px-0 text-left" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>{expanded === c.id ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}{c.name}</Button><p>{termsLabel(c.terms).replaceAll("/", " / ")} dias</p>{c.note && <p className="text-muted-foreground">{c.note}</p>}{c.cancelled ? <span className="text-destructive">Cancelada</span> : cur?.id === c.id && <span className="tag tag-ok">Vigente</span>}</div>
            <Actions>{!c.cancelled && <><DropdownMenuItem onSelect={() => start({ kind: "activate", id: c.id }, c)}>Usar como vigente</DropdownMenuItem><DropdownMenuItem onSelect={() => start({ kind: "edit", id: c.id }, c)}>Editar</DropdownMenuItem><DropdownMenuItem onSelect={() => start({ kind: "cancel", id: c.id }, c)}>Cancelar condição</DropdownMenuItem></>}<DropdownMenuItem onSelect={() => start({ kind: "delete", id: c.id }, c)}>Excluir</DropdownMenuItem><DropdownMenuItem onSelect={() => setExpanded(c.id)}>Ver histórico</DropdownMenuItem></Actions>
          </div>
          {expanded === c.id && <div className="space-y-3 bg-muted p-3">
            {c.note && <p>Observação: {c.note}</p>}<p>Cadastrada em {dt(c.at)}{c.by && ` · ${c.by}`}</p>
            {condPeriods(c).map((p, i) => <div key={`${p.at}-${i}`} className="space-y-1 border-t border-border pt-2"><p>Vigência desde {p.from ? fmtDate(p.from) : "sempre"} · {dt(p.at)}{p.by && ` · ${p.by}`}</p>{p.cancelled ? <p className="text-destructive">Ativação cancelada: {p.cancelled.reason} · {dt(p.cancelled.at)} · {p.cancelled.by}</p> : !c.cancelled && <Button variant="outline" size="sm" className="h-auto whitespace-normal" onClick={() => start({ kind: "period", id: c.id, index: i }, c)}>Cancelar esta ativação</Button>}</div>)}
            {c.history?.map((h, i) => <div key={i} className="border-t border-border pt-2"><p>{h.action} · {dt(h.at)} · {h.by}</p><p>Antes: {h.name} · {termsLabel(h.terms).replaceAll("/", " / ")} dias</p>{h.note && <p>{h.note}</p>}{h.reason && <p>Motivo: {h.reason}</p>}</div>)}
            {c.cancelled && <p className="text-destructive">Cancelamento: {c.cancelled.reason} · {dt(c.cancelled.at)} · {c.cancelled.by}</p>}
          </div>}
        </section>)}
        {!list.length && <p className="text-muted-foreground">Nenhuma condição cadastrada.</p>}
      </>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  </SidePanel>;
}
