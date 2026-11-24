import { SupplierCreateCard } from "./SupplierForm";
import { buildSupplier, emptySupplierInput, type SupplierInput } from "@/lib/fornecedores";
import { requestDecision } from "@/lib/decisions";
const askDiscardSupplier = async () => (await requestDecision({ title: "Descartar cadastro do fornecedor?", message: "O lançamento continua preenchido; apenas este cadastro em preenchimento será descartado.", action: "Descartar cadastro", destructive: true, cancelLabel: "Continuar editando" })) !== null;
import { ArrowLeftRight, Calculator, Check, Coins, CreditCard, FileText, Info, Link2, ListChecks, Plus, SlidersHorizontal, Tags, Trash2 } from "lucide-react";
import { SupplierSummary } from "./SupplierSummary";
import { splitOrigin } from "@/lib/originText";
import { supplierIdentity, supplierIdentityOptions } from "@/lib/supplierIdentity";
import { askCloseDraft, askConfirm } from "@/lib/decisions";
import { DecisionWindow } from "@/components/DecisionDialog";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TermsEditor } from "@/components/TermsEditor";
import { Button } from "@/components/ui/button";
import { DateInput, MoneyInput } from "@/components/kit";
import type { CategoryKind, ScenarioData, Supplier } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { useApp, uid } from "@/lib/store";
import { adjustLast, currentCondition, generateParcels, manualParcels, supplierConditions, parcelsTotal, validateNote, type DraftParcel, type NoteDraft } from "@/lib/notas";
import { filterSuppliers, supplierActive } from "@/lib/fornecedores";
import { todaySP } from "@/lib/engine/actions";
import { plannedRemaining } from "@/lib/engine/actions";
import { EffectivationNotes } from "@/components/EffectivationNotes";
import { useFormDraft } from "@/components/useFormDraft";

/** Pede confirmação antes de descartar alterações não salvas. */
export const guardClose = (dirty: boolean, close: () => void) => async () => {
  if (!dirty || await askConfirm("Há alterações não salvas. Descartar?")) close();
};

/** Painel lateral amplo e responsivo (tela cheia no celular).
 *  Fecha SOMENTE por X, Cancelar ou conclusão — nunca por clique no fundo ou mouse fora. */
export function SidePanel({ title, sub, onClose, footer, children, wide, dirty, centered, expanded }: { title: string; sub?: string; onClose: () => void; footer?: ReactNode; children: ReactNode; wide?: boolean; dirty?: boolean; centered?: boolean; expanded?: boolean }) {
  const requestClose = guardClose(!!dirty, onClose);
  if (centered && !expanded) return <DecisionWindow title={title} description={sub} footer={footer} wide={wide}>{children}</DecisionWindow>;
  return (
    <div className={`fixed inset-0 z-50 flex bg-foreground/30 ${expanded ? "items-center justify-center sm:p-4" : "justify-end"}`}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`finance-panel flex w-full flex-col bg-background shadow-2xl ${expanded ? "launch-manager h-full sm:h-[calc(100dvh-32px)]" : `h-full ${wide ? "sm:w-[min(880px,94vw)]" : "sm:w-[min(520px,94vw)]"}`}`}>
        <div className="flex shrink-0 items-start justify-between border-b border-border bg-card px-5 py-4 text-foreground">
          <div><div className="text-base font-semibold">{title}</div>{sub && <div className="text-xs opacity-80">{sub}</div>}</div>
          <Button variant="ghost" size="icon" aria-label="Fechar" onClick={requestClose}>×</Button>
        </div>
        <div className={`min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4 ${expanded ? "text-sm" : "text-xs"}`}>{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
export const Section = ({ n, title, icon, actions, children }: { n?: number; title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode }) => (
  <section className="launch-section"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">{n && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{n}</span>}{icon && <span className="launch-icon">{icon}</span>}{title}</h3>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>{children}</section>
);
export const Field = ({ l, full, children }: { l: string; full?: boolean; children: ReactNode }) => (
  <label className={`flex flex-col gap-1 ${full ? "md:col-span-2" : ""}`}><span className="lbl">{l}</span>{children}</label>
);

/** Fornecedor com busca: clique abre a lista; digitar filtra por nome e apelidos (sem diferenciar
 *  maiúsculas/acentos). Só a seleção (clique ou Enter) vincula o cadastro — texto digitado não vale.
 *  A lista abre em portal acima do painel, sem cortá-lo nem fechá-lo. */
export function SupplierSearch({ d, value, onChange, onCreate, existing = false, allowAll = false, placeholder, allowCreate = false, historical = false }: { onCreate?:(s:Supplier)=>void; historical?: boolean; d: ScenarioData; value: string; onChange: (id: string) => void; existing?: boolean; allowAll?: boolean; placeholder?: string; allowCreate?: boolean }) {
  const [creating, setCreating] = useState<{ id: string; v: SupplierInput; err: string } | null>(null);
  // Historical identities scan every record: computed only when this filter variant needs them, never per keystroke elsewhere.
  const identities = useMemo(() => historical ? supplierIdentityOptions(d) : [], [historical, historical ? d : null]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = (historical ? identities.find((s) => s.key === value)?.name : d.suppliers.find((s) => s.id === value)?.name) ?? "";
  const [t, setT] = useState(cur);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => setT(cur), [cur]);
  // The option list is built only while the list is open: typing elsewhere in the form no longer rebuilds it.
  const opts = useMemo(() => open ? filterSuppliers(d, t, { includeInactive: existing, date: existing ? undefined : todaySP() }) : [], [open, d.suppliers, t, existing]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = open && document.activeElement === box.current;
  const place = () => { const r = box.current?.getBoundingClientRect(); if (r) setPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 260) }); };
  useLayoutEffect(() => { if (show) place(); }, [show, t]);
  useEffect(() => {
    if (!show) return;
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.("[data-supplier-combobox]")) setOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [show]);
  const pick = (id: string) => { if (id === "__new") { setCreating({ id: uid(), v: emptySupplierInput(t.trim()), err: "" }); setOpen(false); return; } onChange(id); setT(id ? (historical ? identities.find((s) => s.key === id)?.name : d.suppliers.find((s) => s.id === id)?.name) ?? "" : ""); setOpen(false); };
  const items: { id: string; label: ReactNode }[] = !open ? [] : [
    ...(allowAll ? [{ id: "", label: <span className="font-medium">Todos</span> }] : []),
    ...opts.map((s) => ({
      id: s.id,
      label: <span>{s.name}{!supplierActive(s, todaySP()) && <span className="tag tag-warn ml-1">inativo</span>}{s.aliases?.length ? <span className="block text-[11px] text-muted-foreground">Apelidos: {s.aliases.join(", ")}</span> : null}</span>,
    })),
    ...(historical ? identities.filter((s) => !d.suppliers.some((x) => x.id === s.key) && s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase())).map((s) => ({ id: s.key, label: <span>{s.name}{s.pending && <small className="block text-muted-foreground">Vínculo pendente</small>}</span> })) : []),
    ...(allowCreate && t.trim() && !opts.some((s) => s.name.trim().toLocaleLowerCase("pt-BR") === t.trim().toLocaleLowerCase("pt-BR")) ? [{ id: "__new", label: <span className="font-medium text-primary">+ Cadastrar fornecedor “{t.trim()}”</span> }] : []),
  ];
  const total = items.length;
  const create = () => {
    if (!creating) return;
    try {
      if(!onCreate) throw new Error("Cadastre o fornecedor em Cadastros e confirme antes de selecionar.");
      const supplier = buildSupplier(d, creating.id, creating.v, new Date().toISOString(), ""); onCreate(supplier);
      setCreating(null); setT(supplier.name); onChange(supplier.id);
    } catch(e) {setCreating({...creating,err:(e as Error).message});}
  };
  const cancelCreate = async () => {
    if (!creating) return;
    if (JSON.stringify(creating.v) === JSON.stringify(emptySupplierInput(creating.v.name)) || await askDiscardSupplier()) setCreating(null);
  };
  return (
    <div data-supplier-combobox className="relative">
      <input
        ref={box}
        className="inp h-8 w-full"
        placeholder={placeholder ?? "Clique ou digite para buscar"}
        value={t}
        onFocus={() => { setOpen(true); setHi(0); }}
        onChange={(e) => { setT(e.target.value); setOpen(true); setHi(0); if (value) onChange(""); }}
        onKeyDown={(e) => {
          if (!show && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return; }
          if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setHi((hi + 1) % Math.max(total, 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((hi - 1 + total) % Math.max(total, 1)); }
          else if (e.key === "Enter" && show && items[hi]) { e.preventDefault(); pick(items[hi]!.id); }
        }}
        aria-expanded={show}
        role="combobox"
      />
      {show && pos && createPortal(
        <ul data-supplier-combobox role="listbox" className="fixed z-[80] max-h-64 overflow-auto rounded-md border border-border bg-popover py-1 text-xs shadow-xl" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {items.map((it, i) => (
            <li key={it.id || "__all"} role="option" aria-selected={it.id === value}>
              <button type="button" className={`w-full px-3 py-1.5 text-left ${i === hi ? "bg-accent" : "hover:bg-accent/60"}`} onMouseDown={(e) => { e.preventDefault(); pick(it.id); }} onMouseEnter={() => setHi(i)}>{it.label}</button>
            </li>
          ))}
          {!total && <li className="px-3 py-2 text-muted-foreground">Nenhum fornecedor encontrado.</li>}
        </ul>,
        document.body,
      )}
      {value && <span className="text-muted-foreground">{value.startsWith("pending:") ? "Vínculo pendente" : "Cadastro"}: {cur}</span>}
      {creating && <div className="mt-2"><SupplierCreateCard title="Cadastrar fornecedor neste lançamento" confirmLabel="Cadastrar e selecionar" d={d} id={creating.id} value={creating.v} onChange={(v) => setCreating({ ...creating, v, err: "" })} dirty onCancel={() => void cancelCreate()} onConfirm={create} error={creating.err} /><p className="mt-1 text-xs text-muted-foreground">O lançamento em preenchimento é preservado. O fornecedor só é gravado junto com a confirmação do lançamento; cancelar não cria cadastro.</p></div>}
    </div>
  );
}
export function CatSubFields({ d, kind, categoryId, onChange }: { d: ScenarioData; kind: CategoryKind; categoryId: string; onChange: (kind: CategoryKind, categoryId: string) => void }) {
  const subs = d.categories.filter((c) => c.kind === kind);
  return <>
    <Field l="Categoria"><select className="inp h-8" value={kind} onChange={(e) => onChange(e.target.value as CategoryKind, "")}><option value="compra">Compra</option><option value="despesa">Despesa</option></select></Field>
    <Field l="Subgrupo"><select className="inp h-8" value={categoryId} onChange={(e) => onChange(kind, e.target.value)}><option value="">Selecione</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
  </>;
}
const termsTxt = (t: (number | null)[]) => t.filter((x) => x !== null).join(", ");
const parseTerms = (s: string) => s.split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));

export function NovaNota({ d: source, isBase, onCancel, onConfirm, onManagePlanned, saving = false, saveError, saveLabel }: { d: ScenarioData; stage?: "planned" | "committed"; isBase: boolean; onCancel: () => void; onConfirm: (n: NoteDraft, saveAs: SaveAs | null) => boolean | Promise<boolean>; saving?: boolean; saveError?: string; saveLabel?: string | undefined; onManagePlanned?: (id: string) => void }) {
  const [chosen, setChosen] = useState(true);
  const app = useApp();
  const [draftId] = useState(() => { try { const k=`fluxo:new-id:${app.user?.id}:${app.official.orgId}:${app.active.id}`; const v=sessionStorage.getItem(k) ?? `novo-${uid()}`; sessionStorage.setItem(k,v); return v; } catch { return `novo-${uid()}`; } });
  const [n, setN] = useState<NoteDraft>({ stage: "committed", kind: "compra", categoryId: "", supplierId: "", purchaseCode: "", document: "", description: "", total: null, baseDate: null, parcels: [], plannedNotes: [], plannedId: null, closeRest: false });
  const localSuppliers = n.localSuppliers;
  const d = useMemo(() => localSuppliers?.length ? {...source,suppliers:[...source.suppliers,...localSuppliers.filter(s=>!source.suppliers.some(x=>x.id===s.id))]} : source, [source, localSuppliers]);
  const [saveAs, setSaveAs] = useState<SaveAs | null>(null);
  const [review, setReview] = useState(false);
  const [tried, setTried] = useState(false);
  const [how, setHow] = useState<"manual" | "condicao" | null>(null); // Efetivado: forma de informar valores reais
  const [qty, setQty] = useState(1);
  const [checked, setChecked] = useState(false);
  const up = (p: Partial<NoteDraft>) => { setN({ ...n, ...p }); setChecked(false); };
  const protection = useFormDraft({user:app.user?.id??"",org:app.official.orgId,mode:app.active.id,form:"novo-lancamento",record:draftId},{chosen,n,saveAs,how,qty},v=>{setChosen(v.chosen);setN(v.n);setSaveAs(v.saveAs);setHow(v.how);setQty(v.qty);setReview(false);setChecked(false);});
  const done = async (ok:boolean|Promise<boolean>) => { if(await ok){protection.clear();try{sessionStorage.removeItem(`fluxo:new-id:${app.user?.id}:${app.official.orgId}:${app.active.id}`);}catch{/* local apenas */}} return ok; };
  const forget = () => { try{sessionStorage.removeItem(`fluxo:new-id:${app.user?.id}:${app.official.orgId}:${app.active.id}`);}catch{/* local apenas */} };
  // Closing never cancels or resends a submitted operation; the local draft is kept until confirmed/discarded.
  const discard = async () => {
    if(saving || app.pendingOperation){protection.flush();onCancel();return;}
    if(!chosen){if(protection.clear()){forget();onCancel();}return;}
    const choice=await askCloseDraft();
    if(choice==="keep"){protection.flush();onCancel();}
    else if(choice==="discard" && protection.clear()){forget();onCancel();}
  };
  const stage = n.stage;
  const sup = d.suppliers.find((s) => s.id === n.supplierId);
  const setP = (i: number, p: Partial<DraftParcel>) => up({ parcels: n.parcels.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const tot = parcelsTotal(n.parcels) + (n.plannedNotes ?? []).reduce((s,x)=>s+(x.total??0),0);
  const diff = (n.total ?? 0) - tot;
  const errs = validateNote(n);
  const sub = d.categories.find((c) => c.id === n.categoryId)?.name ?? "—";
  const stageL = stage === "planned" ? "Planejada" : "Efetivado";
  // Previsões ativas e conciliadas que podem ser substituídas (mesmas regras do motor de efetivação).
  // Scans every active plan against all committed titles: computed once per base/stage, never on each keystroke.
  const prevs = useMemo(() => stage === "committed" ? source.planned.filter((p) => p.status === "ativo").flatMap((p) => { try { const r = plannedRemaining(source, p.id); return r.health === "ok" && r.value > 0 ? [{ p, rem: r.value }] : []; } catch { return []; } }) : [], [stage, source]);
  const link = prevs.find((x) => x.p.id === n.plannedId);
  const rest = link ? Math.max(0, link.rem - (n.total ?? 0)) : 0;
  const pick = (st: "planned" | "committed") => { setHow(null); setChecked(false); setN({ ...n, stage: st, plannedId: null, closeRest: false }); setChosen(true); setTried(false); };
  const linkTo = (id: string) => {
    if (id && onManagePlanned) { onManagePlanned(id); return; }
    const x = prevs.find((v) => v.p.id === id);
    if (!x) return up({ plannedId: null });
    up({ plannedId: id, supplierId: x.p.supplierId, categoryId: x.p.categoryId, kind: d.categories.find((c) => c.id === x.p.categoryId)?.kind ?? n.kind, purchaseCode: x.p.purchaseCode, baseDate: n.baseDate ?? x.p.baseDate, parcels: [] });
  };
  const next = () => { setTried(true); if (!errs.length) setReview(true); };
  const err = (m: string) => tried && errs.includes(m) ? <span className="text-[11px] text-destructive">{m}</span> : null;
  const title = chosen && stage === "planned" ? review ? "Revisar novo planejamento" : "Novo planejamento" : !chosen ? "Novo lançamento" : review ? `Revisar · Novo lançamento · ${stageL}` : `Novo lançamento · ${stageL}`;
  const cancel = () => void discard();
  const footer = !chosen ? <button className="btn" onClick={cancel}>Cancelar</button> : review
    ? <><button className="btn" disabled={saving} onClick={() => { setReview(false); setChecked(false); }}>Voltar</button><button className="btn btn-primary" disabled={saving || (stage === "committed" && !checked)} title={stage === "committed" && !checked ? "Confirme a conferência dos valores e vencimentos" : ""} onClick={() => void done(onConfirm(n, saveAs))}>{saveLabel ?? (saving ? "Salvando…" : isBase ? "Confirmar e salvar" : "Confirmar na simulação")}</button></>
    : <><p className="mr-auto hidden max-w-md text-xs text-muted-foreground md:flex md:gap-2"><Info className="h-5 w-5 shrink-0 text-primary" /><span><b className="block text-sm text-foreground">Alterações e correções</b>Após gravar, você pode corrigir valores, datas, parcelamento e demais dados em Gerenciar lançamento.</span></p><button className="btn launch-foot-btn" onClick={cancel}>Cancelar</button><button className="btn launch-foot-btn" onClick={async () => { if (n.plannedId && !await askConfirm("O vínculo com a previsão será descartado ao trocar o tipo. Continuar?")) return; pick(stage === "planned" ? "committed" : "planned"); }}><ArrowLeftRight className="h-4 w-4" />Trocar tipo</button><button className="btn btn-primary launch-foot-btn launch-foot-main" onClick={next}><Check className="h-4 w-4" />Revisar e confirmar</button></>;
  return (
    <SidePanel expanded centered={review} wide title={title} sub={isBase ? "Grava no fluxo real ao confirmar" : "Simulação — não altera o fluxo real"} onClose={cancel} dirty={false} footer={footer}>
      {protection.recovered && <p role="status">Preenchimento local recuperado · revise antes de salvar.</p>}{protection.warning && <p role="alert" className="text-destructive">{protection.warning}</p>}
      {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
      {!chosen ? (
        <Section n={1} title="Tipo de lançamento">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {([["planned", "Planejada", "Previsão de compra ou despesa. Valores e condições sujeitos a mudança; documento e código podem ficar vazios. Compõe as saídas planejadas; não recebe pagamento."], ["committed", "Efetivado", "Compra, pedido ou despesa já confirmada. Compõe as saídas efetivadas e permite pagamento parcial ou total. Pode substituir uma previsão existente."]] as const).map(([k, l, t]) => (
              <button key={k} className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary hover:bg-primary/5" onClick={() => pick(k)}><div className="text-sm font-semibold">{l}</div><div className="mt-1 text-muted-foreground">{t}</div></button>
            ))}
          </div>
        </Section>
      ) : review ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-card p-4 md:grid-cols-3">
            {[["Tipo", stageL], ["Categoria", n.kind === "compra" ? "Compra" : "Despesa"], ["Subgrupo", sub], ["Fornecedor", sup?.name ?? "—"], ["Código do pedido", n.purchaseCode || "—"], ["Documento", n.document || "—"], ["Descrição", n.description || "—"], ["Valor total", fmtBRL(n.total)], ["Data base", fmtDate(n.baseDate)]].map(([k, v]) => <div key={k}><div className="lbl">{k}</div><div className="font-medium">{v}</div></div>)}
          </div>
          {link && <p className="rounded-lg border border-primary/20 bg-primary/5 p-3">Substitui {fmtBRL(Math.min(link.rem, n.total ?? 0))} da previsão {link.p.purchaseCode || link.p.document || "sem código"} (pendente {fmtBRL(link.rem)}). {n.closeRest || rest === 0 ? "O restante será encerrado." : `Restante de ${fmtBRL(rest)} continua planejado.`}</p>}
          {!!n.parcels.length && <ParcelTable parcels={n.parcels} real={stage === "committed"} />}
          {(n.plannedNotes ?? []).map(note=><Section key={note.id} title={`NF ${note.document} · ${fmtBRL(note.total)} · planejada`}><ParcelTable parcels={note.parcels.map(p=>({amount:p.amount??0,date:p.date,ext:p.extension,boletoNumber:p.boletoNumber}))} /></Section>)}
          {n.total !== tot ? <p className="text-destructive">A soma das parcelas difere do valor total.</p> : <p className="text-primary">Soma das parcelas confere com o valor total ({fmtBRL(n.total)}).</p>}
          {stage === "committed" && <label className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 font-medium"><input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />Conferi os valores e vencimentos com o documento ou a negociação desta operação.</label>}
          {stage === "committed" && <p className="text-muted-foreground">Efetivado é uma obrigação real confirmada; não significa que foi paga. As condições desta operação não alteram o cadastro do fornecedor nem outros lançamentos.</p>}
          {n.condition && <p className="text-muted-foreground">Condição: {n.condition.name} ({termsTxt(n.condition.terms)} dias) {saveAs ? `— será salva como nova condição do fornecedor "${saveAs.name}" (anteriores preservadas).` : "— usada só neste lançamento; o padrão do fornecedor não muda."}</p>}
          {(n.localSuppliers??[]).filter(s=>s.id===n.supplierId).map(s=><p key={s.id}>Cadastrar fornecedor <b>{s.name}</b> junto deste lançamento. Cancelar não cria cadastro.</p>)}
        </div>
      ) : <>
        <div className="launch-grid">
          <div className="launch-col">
            {stage === "committed" && <div className="launch-card">
          <Section title="Vínculo com previsão" icon={<Link2 className="h-4 w-4" />}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field l="Previsão — abre Gerenciar lançamento" full><select className="inp h-8" value={n.plannedId ?? ""} onChange={(e) => linkTo(e.target.value)}><option value="">Cadastrar sem previsão</option>{prevs.map(({ p, rem }) => <option key={p.id} value={p.id}>{supplierIdentity(d, p).name} · {p.purchaseCode || p.document || "sem código"} · pendente {fmtBRL(rem)}</option>)}</select></Field>
              {link && <div className="md:col-span-2 space-y-1">
                <div>Pendente na previsão: <b>{fmtBRL(link.rem)}</b> · substituído por este lançamento: <b>{fmtBRL(Math.min(link.rem, n.total ?? 0))}</b> · restante: <b>{fmtBRL(rest)}</b></div>
                {rest > 0 && <div className="flex flex-wrap gap-4"><label className="flex items-center gap-1"><input type="radio" checked={!n.closeRest} onChange={() => up({ closeRest: false })} /> Restante continua planejado</label><label className="flex items-center gap-1"><input type="radio" checked={!!n.closeRest} onChange={() => up({ closeRest: true })} /> Encerrar o restante</label></div>}
              </div>}
            </div>
          </Section>
            </div>}
            <div className="launch-card">
        <Section title="Dados gerais" icon={<FileText className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CatSubFields d={d} kind={n.kind} categoryId={n.categoryId} onChange={(kind, categoryId) => up({ kind, categoryId })} />
            {err("Selecione o subgrupo.")}
            <Field l="Fornecedor" full><SupplierSearch d={d} allowCreate={!n.plannedId} onCreate={s=>setN(n=>({...n,localSuppliers:[...(n.localSuppliers??[]),s]}))} existing={!!n.plannedId} value={n.supplierId} onChange={(supplierId) => { setN(n=>({...n,supplierId})); setChecked(false); setSaveAs(null); }} />{err("Selecione o fornecedor.")}</Field>
            <Field l={stage === "planned" ? "Código do pedido (opcional)" : "Código do pedido"}><input className="inp h-8" value={n.purchaseCode} onChange={(e) => up({ purchaseCode: e.target.value })} /></Field>
            <Field l={stage === "planned" ? "Documento (opcional)" : "Documento"}><input className="inp h-8" value={n.document} onChange={(e) => up({ document: e.target.value })} />{err("Informe o documento.")}</Field>
            <Field l="Descrição" full><input className="inp h-8" value={n.description} onChange={(e) => up({ description: e.target.value })} /></Field>
          </div>
        </Section>
            </div>
          </div>
          <div className="launch-col">
            <div className="launch-card">
          <Section title="Tipo de lançamento" icon={<Tags className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2">{([["committed", "Efetivado"], ["planned", "Planejado"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={stage === k} className={`rounded-lg border px-3 py-2 font-semibold ${stage === k ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary"}`} onClick={() => { if (stage !== k) void (async () => { if (n.plannedId && !await askConfirm("O vínculo com a previsão será descartado ao trocar o tipo. Continuar?")) return; pick(k); })(); }}>{stage === k ? "✓ " : ""}{l}</button>)}</div>
          </Section>
            </div>
            <div className="launch-card">
              <Section title="Valores e prazos" icon={<Coins className="h-4 w-4" />}><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field l={stage === "planned" ? "Valor total previsto" : "Valor total"}><MoneyInput className="h-8 w-full" value={n.total} onChange={(total) => up({ total })} />{err("Informe o valor total.")}</Field>
            <Field l="Data base para os prazos"><DateInput value={n.baseDate} onChange={(baseDate) => up({ baseDate })} />{err("Informe a data base.")}</Field>
              </div></Section>
            </div>
            <div className="launch-card">
        {stage === "committed" ? (
        <Section title="Condição de pagamento" icon={<CreditCard className="h-4 w-4" />}>
          {!sup ? <p className="text-muted-foreground">Selecione o fornecedor para continuar.</p> : <>
            <div className="grid grid-cols-1 gap-2">
              {([["manual", "Preencher manualmente", "Informe a quantidade de parcelas, o valor e o vencimento de cada uma."], ["condicao", "Usar uma condição cadastrada como sugestão", "Selecione a condição e gere parcelas para conferência."]] as const).map(([k, l, t]) => (
                <label key={k} className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${how === k ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" name="how" checked={how === k} onChange={() => setHow(k)} /><span><span className="block font-semibold">{l}</span><span className="text-muted-foreground">{t}</span></span></label>
              ))}
            </div>
            {how === "manual" && <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field l="Quantidade de parcelas"><input type="number" min={1} max={120} className="inp h-8 w-24" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} /></Field>
              <button className="btn" disabled={!n.total} title={n.total ? "" : "Informe o valor total"} onClick={async () => { if (n.parcels.length && !await askConfirm("As parcelas atuais serão substituídas por novas linhas para preenchimento.", { title: "Gerar linhas?", action: "Gerar linhas", destructive: true })) return; up({ parcels: manualParcels(n.total, qty), condition: null }); setSaveAs(null); }}>Gerar linhas</button>
              <span className="text-muted-foreground">Os valores são divididos igualmente (centavos na última) e os vencimentos ficam em branco para você informar.</span>
            </div>}
            {how === "condicao" && <div className="mt-3">
              <ConditionPicker key={sup.id} d={d} supplierId={sup.id} baseDate={n.baseDate} hint={`Sugestão para preenchimento — a condição vigente não é aplicada automaticamente.${link?.p.condition ? ` Condição usada na previsão: ${link.p.condition.name} (${termsTxt(link.p.condition.terms)} dias).` : ""}`}
                disabled={!n.total || !n.baseDate} disabledHint="Informe valor total e data base"
                onConfirm={async (c, save) => { if (n.parcels.length && !await askConfirm("As parcelas atuais serão substituídas pelas geradas pela condição.", { title: "Gerar parcelas?", action: "Gerar parcelas", destructive: true })) return; setSaveAs(save); up({ condition: c, parcels: generateParcels(n.total!, n.baseDate!, c.terms) }); }} />
            </div>}
          </>}
        </Section>
        ) : (
        <Section title="Condição de pagamento" icon={<CreditCard className="h-4 w-4" />}>
          {!sup ? <p className="text-muted-foreground">Selecione o fornecedor para ver as condições cadastradas.</p>
            : <ConditionPicker key={sup.id} d={d} supplierId={sup.id} baseDate={n.baseDate} hint={link?.p.condition ? `Condição usada na previsão: ${link.p.condition.name} (${termsTxt(link.p.condition.terms)} dias)` : undefined}
                disabled={!n.total || !n.baseDate} disabledHint="Informe valor total e data base"
                onConfirm={(c, save) => { setSaveAs(save); up({ condition: c, parcels: generateParcels(n.total!, n.baseDate!, c.terms) }); }} />}
        </Section>
        )}
            </div>
          </div>
          <SupplierSummary d={d} supplierId={sup?.id ?? ""} name={sup?.name ?? ""} />
        </div>
        <div className="launch-card">
        <Section title={stage === "planned" ? "Parcelas previstas" : "Parcelas"} icon={<ListChecks className="h-4 w-4" />} actions={<>
            <button className="btn" onClick={() => up({ parcels: [...n.parcels, { amount: 0, date: n.parcels.at(-1)?.date ?? n.baseDate, ext: null }] })}><Plus className="h-4 w-4" />Adicionar parcela</button>
            <button className="btn" disabled={!n.parcels.length || !diff} onClick={() => up({ parcels: adjustLast(n.parcels, (n.total ?? 0)-(n.plannedNotes??[]).reduce((s,n)=>s+(n.total??0),0)) })}><SlidersHorizontal className="h-4 w-4" />Ajustar valores</button>
</>}>
          <div className="overflow-auto rounded-lg border border-border">
            <table className="tbl launch-parcel-table"><thead><tr><th>Parcela</th><th>Número do boleto</th><th className="num">{stage === "committed" ? "Valor real" : "Valor"}</th><th>{stage === "committed" ? "Vencimento real" : "Vencimento"}</th><th>Prorrogar para</th><th>Ações</th></tr></thead>
              <tbody>{n.parcels.map((p, i) => <tr key={i}><td>{i + 1}/{n.parcels.length}</td><td><input className="inp w-full" aria-label={`Número do boleto parcela ${i+1}`} value={p.boletoNumber ?? ""} onChange={e=>setP(i,{boletoNumber:e.target.value || null})}/></td><td className="num"><MoneyInput value={p.amount} onChange={(v) => setP(i, { amount: v ?? 0 })} /></td><td><DateInput value={p.date} onChange={(v) => setP(i, { date: v })} /></td><td><DateInput allowEmpty value={p.ext} onChange={(v) => setP(i, { ext: v })} /></td><td><button className="btn btn-icon text-destructive" title="Remover parcela" aria-label={`Remover parcela ${i + 1}`} onClick={() => up({ parcels: n.parcels.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></button></td></tr>)}
                {!n.parcels.length && <tr><td colSpan={6} className="text-center text-muted-foreground">{stage === "committed" ? "Escolha como informar os valores reais e gere as linhas." : "Gere as parcelas pela condição ou adicione manualmente."}</td></tr>}</tbody></table>
          </div>
        </Section>
        </div>
        {stage === "planned" && <details className="launch-card"><summary className="cursor-pointer font-semibold">Detalhar por nota fiscal (opcional)</summary><Section title="Notas fiscais conhecidas"><p className="mb-2 text-muted-foreground">Cadastrar nota não efetiva. As notas ficam planejadas; o saldo sem nota continua nas parcelas acima.</p>{n.plannedNotes?.length ? <EffectivationNotes planning d={d} supplierId={n.supplierId} purchaseCode={n.purchaseCode} notes={n.plannedNotes} disabled={false} onChange={plannedNotes=>up({plannedNotes})} onAdd={()=>up({plannedNotes:[...(n.plannedNotes??[]),{id:`note-${uid()}`,document:"",total:null,effectiveDate:null,baseDate:n.baseDate??todaySP(),condition:null,parcels:[]}]})}/> : <button className="btn" onClick={()=>up({plannedNotes:[{id:`note-${uid()}`,document:n.document,total:n.total,effectiveDate:null,baseDate:n.baseDate??todaySP(),condition:n.condition??null,parcels:n.parcels.map(p=>({id:`title-${uid()}`,amount:p.amount,date:p.date,extension:p.ext,boletoNumber:p.boletoNumber}))}],parcels:[]})}>+ Adicionar nota fiscal</button>}</Section></details>}
        <div className="launch-card"><Section title="Resumo" icon={<Calculator className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>div]:rounded-lg [&>div]:border [&>div]:border-border [&>div]:bg-background [&>div]:p-3">
            <div><div className="lbl">Total do lançamento</div><div className="text-lg font-bold tabular-nums">{n.total===null ? "Não informado" : fmtBRL(n.total)}</div></div>
            <div><div className="lbl">Total das parcelas</div><div className="text-lg font-bold tabular-nums">{fmtBRL(tot)}</div></div>
            <div><div className="lbl">Diferença</div><div className={`text-lg font-bold tabular-nums ${diff ? "text-destructive" : "text-primary"}`}>{n.total===null ? "Não disponível" : fmtBRL(diff)}</div></div>
          </div>
          {tried && errs.length > 0 && <ul className="mt-2 list-disc pl-5 text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        </Section></div>
      </>}
    </SidePanel>
  );
}
function ParcelTable({ parcels, real }: { parcels: DraftParcel[]; real?: boolean }) {
  return <div className="overflow-auto rounded-lg border border-border"><table className="tbl"><thead><tr><th>Parcela</th><th>Número do boleto</th><th className="num">{real ? "Valor real" : "Valor"}</th><th>{real ? "Vencimento real" : "Vencimento"}</th><th>Prorrogar para</th></tr></thead>
    <tbody>{parcels.map((p, i) => <tr key={i}><td>{i + 1}/{parcels.length}</td><td>{p.boletoNumber || "Não informado"}</td><td className="num">{fmtBRL(p.amount)}</td><td>{fmtDate(p.date)}</td><td>{p.ext ? fmtDate(p.ext) : "—"}</td></tr>)}
      <tr className="font-semibold"><td>Total</td><td className="num">{fmtBRL(parcelsTotal(parcels))}</td><td colSpan={2} /></tr></tbody></table></div>;
}

/** Prorrogação individual de uma parcela, com justificativa obrigatória. */
export function ProrrogarPanel({ label, current, original, history, isBase, onCancel, onSave, saving=false, saveError, saveLabel }: { saving?:boolean; saveError?:string; saveLabel?:string | undefined; label: string; current: string | null; original: string | null; history: { from: string | null; to: string | null; at: string; note: string }[]; isBase: boolean; onCancel: () => void; onSave: (to: string | null, note: string) => void }) {
  const [to, setTo] = useState<string | null>(current);
  const [note, setNote] = useState("");
  const dirty = to !== current || !!note.trim();
  const cancel = guardClose(dirty, onCancel);
  return (
    <SidePanel title="Prorrogar parcela" sub={label} onClose={onCancel} dirty={dirty} footer={<><button className="btn" onClick={cancel}>Cancelar</button><button className="btn btn-primary" disabled={saving || !note.trim() || to === current} onClick={async () => await askConfirm(`A programação de ${label} será alterada para ${fmtDate(to) || "o vencimento original"}. ${isBase ? "O vencimento original e o histórico serão preservados." : "Somente esta simulação será alterada."}`, { title: "Prorrogar parcela?", action: isBase ? "Confirmar prorrogação" : "Aplicar na simulação" }) && onSave(to, note)}>{saveLabel ?? (saving ? "Salvando…" : saveError !== undefined ? isBase ? "Confirmar e salvar" : "Confirmar na simulação" : isBase ? "Confirmar prorrogação" : "Aplicar teste na simulação")}</button></>}>
      {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
      <p className={isBase ? "text-muted-foreground" : "font-medium text-destructive"}>{isBase ? "Prorrogação confirmada altera a programação real somente desta parcela; o vencimento original é preservado." : "Teste de prorrogação: vale apenas nesta simulação."}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field l="Vencimento original"><div className="h-8 py-1.5">{fmtDate(original)}</div></Field>
        <Field l="Prorrogar para (vazio = volta ao original)"><DateInput allowEmpty value={to} onChange={setTo} /></Field>
        <Field l="Justificativa" full><input className="inp h-8" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <Section title="Histórico de prorrogações">{history.length ? <ul className="space-y-1">{history.map((h, i) => <li key={i}>{h.at ? fmtDate(h.at.slice(0, 10)) : "—"}: {h.from ? fmtDate(h.from) : "original"} → {h.to ? fmtDate(h.to) : "original"} · {h.note}</li>)}</ul> : <p className="text-muted-foreground">Sem prorrogações.</p>}</Section>
    </SidePanel>
  );
}
export function ParcelaPanel({ label, amount, date, onCancel, onSave, saving=false, saveError, saveLabel }: { saving?:boolean; saveError?:string; saveLabel?:string | undefined; label: string; amount: number; date: string; onCancel: () => void; onSave: (amount: number, date: string, note: string) => void }) {
  const [a, setA] = useState<number | null>(amount);
  const [dt, setDt] = useState<string | null>(date);
  const [note, setNote] = useState("");
  const changed = a !== amount || dt !== date;
  const dirty = changed || !!note.trim();
  const cancel = guardClose(dirty, onCancel);
  return (
    <SidePanel title="Editar esta parcela" sub={label} onClose={onCancel} dirty={dirty} footer={<><button className="btn" onClick={cancel}>Cancelar</button><button className="btn btn-primary" disabled={saving || !a || a <= 0 || !dt || !changed || !note.trim()} title={changed && !note.trim() ? "Informe a justificativa da alteração" : ""} onClick={async () => { if (a && dt && await askConfirm(`${label}: ${fmtBRL(amount)} → ${fmtBRL(a)}; vencimento ${fmtDate(date)} → ${fmtDate(dt)}.\nJustificativa: ${note.trim()}`, { title: "Salvar parcela?", action: "Salvar parcela" })) onSave(a, dt, note.trim()); }}>{saveLabel ?? (saving ? "Salvando…" : saveError !== undefined ? "Confirmar e salvar" : "Salvar parcela")}</button></>}>
      {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
      <p className="text-muted-foreground">Altera somente esta parcela; as demais parcelas da nota não mudam.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field l="Valor da parcela"><MoneyInput className="h-8 w-full" value={a} onChange={setA} /></Field>
        <Field l="Vencimento"><DateInput value={dt} onChange={setDt} /></Field>
        <Field l="Justificativa da alteração (obrigatória)" full><input className="inp h-8" value={note} onChange={(e) => setNote(e.target.value)} />{changed && !note.trim() && <span className="text-destructive">Informe a justificativa para alterar valor ou vencimento.</span>}</Field>
      </div>
    </SidePanel>
  );
}
export interface NoteFields { kind: CategoryKind; categoryId: string; supplierId: string; purchaseCode: string; document: string; notes: string }
export function DadosNotaPanel({ d, init, siblings, onCancel, onSave, saving=false, saveError, saveLabel }: { saving?:boolean; saveError?:string; saveLabel?:string | undefined; d: ScenarioData; init: NoteFields; siblings: number; onCancel: () => void; onSave: (f: NoteFields) => void }) {
  const [f, setF] = useState(init);
  const up = (p: Partial<NoteFields>) => setF({ ...f, ...p });
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const shown = (key:keyof NoteFields, value:NoteFields) => key==='supplierId' ? supplierIdentity(d,{supplierId:value.supplierId}).name : key==='categoryId' ? d.categories.find(c=>c.id===value.categoryId)?.name || 'Não informado' : key==='kind' ? value.kind==='compra' ? 'Compra' : 'Despesa' : value[key] || 'Não informado';
  const changes = (Object.keys(f) as (keyof NoteFields)[]).filter(key=>f[key]!==init[key]).map(key=>`${({kind:'Categoria',categoryId:'Subgrupo',supplierId:'Fornecedor',purchaseCode:'Pedido',document:'Documento',notes:'Descrição'})[key]}: ${shown(key,init)} → ${shown(key,f)}`).join('\n');
  const cancel = guardClose(dirty, onCancel);
  return (
    <SidePanel wide title="Editar dados gerais da nota" sub={siblings > 1 ? `Aplica às ${siblings} parcelas desta nota` : "Aplica a este lançamento"} onClose={onCancel} dirty={dirty} footer={<><button className="btn" onClick={cancel}>Cancelar</button><button className="btn btn-primary" disabled={saving || !dirty || !f.categoryId || !f.supplierId} onClick={async () => await askConfirm(`${changes}\nOs dados gerais serão aplicados a ${siblings} parcela(s) desta nota. Outras notas não serão alteradas.`, { title: "Salvar dados da nota?", action: "Salvar dados da nota" }) && onSave(f)}>{saveLabel ?? (saving ? "Salvando…" : saveError !== undefined ? "Confirmar e salvar" : "Salvar dados da nota")}</button></>}>
      {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CatSubFields d={d} kind={f.kind} categoryId={f.categoryId} onChange={(kind, categoryId) => up({ kind, categoryId })} />
        <Field l="Fornecedor" full><SupplierSearch d={d} existing value={f.supplierId} onChange={(supplierId) => up({ supplierId })} /></Field>
        <Field l="Código do pedido"><input className="inp h-8" value={f.purchaseCode} onChange={(e) => up({ purchaseCode: e.target.value })} /></Field>
        <Field l="Documento"><input className="inp h-8" value={f.document} onChange={(e) => up({ document: e.target.value })} /></Field>
        <Field l="Descrição" full><input className="inp h-8" value={f.notes} onChange={(e) => up({ notes: e.target.value })} /></Field>
      </div>
    </SidePanel>
  );
}

export interface SaveAs { name: string; terms: (number | null)[]; from: string | null }
/** Escolha da condição: sugere a última vigente, permite outra cadastrada ou uma específica. Parcelas só após confirmar.
 *  "Salvar como nova condição do fornecedor" é opção separada e exige confirmação. */
export function ConditionPicker({ d, supplierId, hint, disabled, disabledHint, onConfirm, baseDate, allowSave = true }: { d: ScenarioData; supplierId: string; baseDate?: string | null | undefined; hint?: string | undefined; disabled?: boolean; disabledHint?: string; allowSave?: boolean; onConfirm: (c: { name: string; terms: (number | null)[] }, saveAs: SaveAs | null) => void }) {
  const s = d.suppliers.find((x) => x.id === supplierId)!;
  const list = supplierConditions(s).filter((c) => !c.cancelled);
  const cur = currentCondition(s, baseDate || new Date().toISOString().slice(0, 10));
  const [sel, setSel] = useState<string>(cur?.id ?? "__esp");
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setSel(cur?.id ?? "__esp"); }, [cur?.id, touched]); // sugere a vigente na data base
  const [espT, setEspT] = useState<(number | null)[]>([null]);
  const [save, setSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const isEsp = sel === "__esp";
  const chosen = isEsp ? { name: "Condição específica", terms: espT } : (() => { const c = list.find((x) => x.id === sel)!; return { name: c.name, terms: c.terms }; })();
  const ok = chosen.terms.some((t) => t !== null) && !disabled && (!save || !!saveName.trim());
  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
      {hint && <p className="font-medium">{hint}</p>}
      {!cur && <p role="status" className="text-warning-foreground">Fornecedor sem condição vigente definida na data base. Escolha uma condição cadastrada ou informe a específica — nenhuma é presumida.</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Field l="Condição"><select aria-label="Condição" className="inp h-8 min-w-56" value={sel} onChange={(e) => { setSel(e.target.value); setTouched(true); setSave(false); }}>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}{splitOrigin(c.note).text ? ` · ${splitOrigin(c.note).text}` : ""} · {termsTxt(c.terms)} dias{c.id === cur?.id ? " (vigente na data base)" : ""}</option>)}
          <option value="__esp">Informar condição específica…</option></select></Field>
        {!isEsp && <span className="text-muted-foreground">{termsTxt(chosen.terms)} dias · {chosen.terms.filter((t) => t !== null).length} parcela(s)</span>}
      </div>
      {!isEsp && splitOrigin(list.find((x) => x.id === sel)?.note).text && <p className="rounded bg-muted p-2">Observação da condição: {splitOrigin(list.find((x) => x.id === sel)?.note).text}</p>}
      {isEsp && <TermsEditor terms={espT} onChange={setEspT} />}
      {isEsp && allowSave && <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1"><input type="checkbox" checked={save} onChange={async (e) => { const checked = e.target.checked; if (checked && !await askConfirm("Esta condição será salva como nova condição do fornecedor. As condições anteriores serão preservadas.", { title: "Salvar nova condição?", action: "Salvar condição" })) return; setSave(checked); }} /> Salvar como nova condição do fornecedor</label>
        {save && <input className="inp h-8 w-48" placeholder="Nome da condição" value={saveName} onChange={(e) => setSaveName(e.target.value)} />}
        {!save && <span className="text-muted-foreground">Usada só neste lançamento; o padrão do fornecedor não muda.</span>}
      </div>}
      <button className="btn btn-primary" disabled={!ok} title={disabled ? disabledHint : ""} onClick={() => onConfirm(chosen, isEsp && save ? { name: saveName.trim(), terms: chosen.terms, from: null } : null)}>Confirmar condição e gerar parcelas</button>
    </div>
  );
}
