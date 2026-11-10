import { useEffect, useId, useState, type ReactNode } from "react";
import { TermsEditor } from "@/components/TermsEditor";
import { DateInput, MoneyInput } from "@/components/kit";
import type { CategoryKind, ScenarioData } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { adjustLast, currentCondition, generateParcels, supplierConditions, parcelsTotal, validateNote, type DraftParcel, type NoteDraft } from "@/lib/notas";
import { resolveSupplier, supplierActive, supplierNames } from "@/lib/fornecedores";
import { todaySP } from "@/lib/engine/actions";
import { plannedRemaining } from "@/lib/engine/actions";

/** Painel lateral amplo e responsivo (tela cheia no celular). */
export function SidePanel({ title, sub, onClose, footer, children, wide }: { title: string; sub?: string; onClose: () => void; footer?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30" onClick={onClose}>
      <div role="dialog" aria-label={title} className={`flex h-full w-full flex-col bg-background shadow-2xl ${wide ? "sm:w-[min(880px,94vw)]" : "sm:w-[min(520px,94vw)]"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border bg-primary px-5 py-3 text-primary-foreground">
          <div><div className="text-base font-semibold">{title}</div>{sub && <div className="text-xs opacity-80">{sub}</div>}</div>
          <button className="rounded px-2 text-lg leading-none hover:bg-primary-foreground/10" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        <div className="flex-1 space-y-5 overflow-auto px-5 py-4 text-xs">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
export const Section = ({ n, title, children }: { n?: number; title: string; children: ReactNode }) => (
  <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">{n && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{n}</span>}{title}</h3>{children}</section>
);
export const Field = ({ l, full, children }: { l: string; full?: boolean; children: ReactNode }) => (
  <label className={`flex flex-col gap-1 ${full ? "md:col-span-2" : ""}`}><span className="lbl">{l}</span>{children}</label>
);

/** Fornecedor com busca por digitação. */
export function SupplierSearch({ d, value, onChange, existing = false }: { d: ScenarioData; value: string; onChange: (id: string) => void; existing?: boolean }) {
  const cur = d.suppliers.find((s) => s.id === value)?.name ?? "";
  const [t, setT] = useState(cur);
  useEffect(() => setT(cur), [cur]);
  const listId = useId();
  const eligible = d.suppliers.filter((s) => existing || supplierActive(s, todaySP()));
  return <>
    <input className="inp h-8 w-full" list={listId} placeholder="Digite para buscar" value={t} onChange={(e) => { setT(e.target.value); const s = resolveSupplier(d, e.target.value, existing ? undefined : todaySP()); onChange(s?.id ?? ""); }} />
    <datalist id={listId}>{eligible.flatMap((s) => supplierNames(s).map((name) => <option key={`${s.id}:${name}`} value={name}>{s.name}</option>))}</datalist>
    {value && <span className="text-muted-foreground">Cadastro: {cur}</span>}
  </>;
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

export function NovaNota({ d, isBase, onCancel, onConfirm }: { d: ScenarioData; stage?: "planned" | "committed"; isBase: boolean; onCancel: () => void; onConfirm: (n: NoteDraft, saveAs: SaveAs | null) => boolean }) {
  const [chosen, setChosen] = useState(false);
  const [n, setN] = useState<NoteDraft>({ stage: "planned", kind: "compra", categoryId: "", supplierId: "", purchaseCode: "", document: "", description: "", total: null, baseDate: null, parcels: [], plannedId: null, closeRest: false });
  const [saveAs, setSaveAs] = useState<SaveAs | null>(null);
  const [review, setReview] = useState(false);
  const [tried, setTried] = useState(false);
  const up = (p: Partial<NoteDraft>) => setN({ ...n, ...p });
  const stage = n.stage;
  const sup = d.suppliers.find((s) => s.id === n.supplierId);
  const setP = (i: number, p: Partial<DraftParcel>) => up({ parcels: n.parcels.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const tot = parcelsTotal(n.parcels);
  const diff = (n.total ?? 0) - tot;
  const errs = validateNote(n);
  const sub = d.categories.find((c) => c.id === n.categoryId)?.name ?? "—";
  const stageL = stage === "planned" ? "Planejada" : "Efetivado";
  // Previsões ativas e conciliadas que podem ser substituídas (mesmas regras do motor de efetivação).
  const prevs = stage === "committed" ? d.planned.filter((p) => p.status === "ativo").flatMap((p) => { try { const r = plannedRemaining(d, p.id); return r.health === "ok" && r.value > 0 ? [{ p, rem: r.value }] : []; } catch { return []; } }) : [];
  const link = prevs.find((x) => x.p.id === n.plannedId);
  const rest = link ? Math.max(0, link.rem - (n.total ?? 0)) : 0;
  const pick = (st: "planned" | "committed") => { setN({ ...n, stage: st, plannedId: null, closeRest: false }); setChosen(true); setTried(false); };
  const backToType = () => {
    if (n.plannedId && !window.confirm("O vínculo com a previsão será descartado ao trocar o tipo. Continuar?")) return;
    up({ plannedId: null, closeRest: false }); setChosen(false); setReview(false);
  };
  const linkTo = (id: string) => {
    const x = prevs.find((v) => v.p.id === id);
    if (!x) return up({ plannedId: null });
    up({ plannedId: id, supplierId: x.p.supplierId, categoryId: x.p.categoryId, kind: d.categories.find((c) => c.id === x.p.categoryId)?.kind ?? n.kind, purchaseCode: x.p.purchaseCode, baseDate: n.baseDate ?? x.p.baseDate, parcels: [] });
  };
  const next = () => { setTried(true); if (!errs.length) setReview(true); };
  const err = (m: string) => tried && errs.includes(m) ? <span className="text-[11px] text-destructive">{m}</span> : null;
  const title = !chosen ? "Novo lançamento" : review ? `Revisar · Novo lançamento · ${stageL}` : `Novo lançamento · ${stageL}`;
  const footer = !chosen ? <button className="btn" onClick={onCancel}>Cancelar</button> : review
    ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" onClick={() => onConfirm(n, saveAs)}>Confirmar lançamento</button></>
    : <><button className="btn" onClick={backToType}>Trocar tipo</button><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" onClick={next}>Revisar e confirmar</button></>;
  return (
    <SidePanel wide title={title} sub={isBase ? "Grava no fluxo real ao confirmar" : "Simulação — não altera o fluxo real"} onClose={onCancel} footer={footer}>
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
          <ParcelTable parcels={n.parcels} />
          {n.condition && <p className="text-muted-foreground">Condição: {n.condition.name} ({termsTxt(n.condition.terms)} dias) {saveAs ? `— será salva como nova condição do fornecedor "${saveAs.name}" (anteriores preservadas).` : "— usada só neste lançamento; o padrão do fornecedor não muda."}</p>}
        </div>
      ) : <>
        {stage === "committed" && (
          <Section title="Vínculo com previsão">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-2">
              <Field l="Previsão" full><select className="inp h-8" value={n.plannedId ?? ""} onChange={(e) => linkTo(e.target.value)}><option value="">Cadastrar sem previsão</option>{prevs.map(({ p, rem }) => <option key={p.id} value={p.id}>{d.suppliers.find((s) => s.id === p.supplierId)?.name ?? "—"} · {p.purchaseCode || p.document || "sem código"} · pendente {fmtBRL(rem)}</option>)}</select></Field>
              {link && <div className="md:col-span-2 space-y-1">
                <div>Pendente na previsão: <b>{fmtBRL(link.rem)}</b> · substituído por este lançamento: <b>{fmtBRL(Math.min(link.rem, n.total ?? 0))}</b> · restante: <b>{fmtBRL(rest)}</b></div>
                {rest > 0 && <div className="flex flex-wrap gap-4"><label className="flex items-center gap-1"><input type="radio" checked={!n.closeRest} onChange={() => up({ closeRest: false })} /> Restante continua planejado</label><label className="flex items-center gap-1"><input type="radio" checked={!!n.closeRest} onChange={() => up({ closeRest: true })} /> Encerrar o restante</label></div>}
              </div>}
            </div>
          </Section>
        )}
        <Section n={2} title="Dados gerais">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CatSubFields d={d} kind={n.kind} categoryId={n.categoryId} onChange={(kind, categoryId) => up({ kind, categoryId })} />
            {err("Selecione o subgrupo.")}
            <Field l="Fornecedor" full><SupplierSearch d={d} existing={!!n.plannedId} value={n.supplierId} onChange={(supplierId) => { up({ supplierId, parcels: [], condition: null }); setSaveAs(null); }} />{err("Selecione o fornecedor.")}</Field>
            <Field l={stage === "planned" ? "Código do pedido (opcional)" : "Código do pedido"}><input className="inp h-8" value={n.purchaseCode} onChange={(e) => up({ purchaseCode: e.target.value })} /></Field>
            <Field l={stage === "planned" ? "Documento (opcional)" : "Documento"}><input className="inp h-8" value={n.document} onChange={(e) => up({ document: e.target.value })} />{err("Informe o documento.")}</Field>
            <Field l="Descrição" full><input className="inp h-8" value={n.description} onChange={(e) => up({ description: e.target.value })} /></Field>
            <Field l={stage === "planned" ? "Valor total previsto" : "Valor total"}><MoneyInput className="h-8 w-full" value={n.total} onChange={(total) => up({ total })} />{err("Informe o valor total.")}</Field>
            <Field l="Data base para os prazos"><DateInput value={n.baseDate} onChange={(baseDate) => up({ baseDate })} />{err("Informe a data base.")}</Field>
          </div>
        </Section>
        <Section n={3} title="Condição de pagamento">
          {!sup ? <p className="text-muted-foreground">Selecione o fornecedor para ver as condições cadastradas.</p>
            : <ConditionPicker key={sup.id} d={d} supplierId={sup.id} baseDate={n.baseDate} hint={link?.p.condition ? `Condição usada na previsão: ${link.p.condition.name} (${termsTxt(link.p.condition.terms)} dias)` : undefined}
                disabled={!n.total || !n.baseDate} disabledHint="Informe valor total e data base"
                onConfirm={(c, save) => { setSaveAs(save); up({ condition: c, parcels: generateParcels(n.total!, n.baseDate!, c.terms) }); }} />}
        </Section>
        <Section n={4} title={stage === "planned" ? "Parcelas previstas" : "Parcelas efetivas"}>
          <div className="overflow-auto rounded-lg border border-border">
            <table className="tbl"><thead><tr><th>Parcela</th><th className="num">Valor</th><th>Vencimento</th><th>Prorrogar para</th><th /></tr></thead>
              <tbody>{n.parcels.map((p, i) => <tr key={i}><td>{i + 1}/{n.parcels.length}</td><td className="num"><MoneyInput value={p.amount} onChange={(v) => setP(i, { amount: v ?? 0 })} /></td><td><DateInput value={p.date} onChange={(v) => setP(i, { date: v })} /></td><td><DateInput allowEmpty value={p.ext} onChange={(v) => setP(i, { ext: v })} /></td><td><button className="btn btn-danger" aria-label={`Remover parcela ${i + 1}`} onClick={() => up({ parcels: n.parcels.filter((_, k) => k !== i) })}>Remover</button></td></tr>)}
                {!n.parcels.length && <tr><td colSpan={5} className="text-center text-muted-foreground">Gere as parcelas pela condição ou adicione manualmente.</td></tr>}</tbody></table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn" onClick={() => up({ parcels: [...n.parcels, { amount: 0, date: n.parcels.at(-1)?.date ?? n.baseDate, ext: null }] })}>+ Adicionar parcela</button>
            <button className="btn" disabled={!n.parcels.length || !diff} onClick={() => up({ parcels: adjustLast(n.parcels, n.total ?? 0) })}>Ajustar diferença na última parcela</button>
          </div>
        </Section>
        <Section n={5} title="Resumo">
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-card p-4">
            <div><div className="lbl">Total da nota</div><div className="num text-sm font-semibold">{fmtBRL(n.total ?? 0)}</div></div>
            <div><div className="lbl">Total das parcelas</div><div className="num text-sm font-semibold">{fmtBRL(tot)}</div></div>
            <div><div className="lbl">Diferença</div><div className={`num text-sm font-semibold ${diff ? "text-destructive" : "text-primary"}`}>{fmtBRL(diff)}</div></div>
          </div>
          {tried && errs.length > 0 && <ul className="mt-2 list-disc pl-5 text-destructive">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        </Section>
      </>}
    </SidePanel>
  );
}
function ParcelTable({ parcels }: { parcels: DraftParcel[] }) {
  return <div className="overflow-auto rounded-lg border border-border"><table className="tbl"><thead><tr><th>Parcela</th><th className="num">Valor</th><th>Vencimento</th><th>Prorrogar para</th></tr></thead>
    <tbody>{parcels.map((p, i) => <tr key={i}><td>{i + 1}/{parcels.length}</td><td className="num">{fmtBRL(p.amount)}</td><td>{fmtDate(p.date)}</td><td>{p.ext ? fmtDate(p.ext) : "—"}</td></tr>)}
      <tr className="font-semibold"><td>Total</td><td className="num">{fmtBRL(parcelsTotal(parcels))}</td><td colSpan={2} /></tr></tbody></table></div>;
}

/** Prorrogação individual de uma parcela, com justificativa obrigatória. */
export function ProrrogarPanel({ label, current, original, history, isBase, onCancel, onSave }: { label: string; current: string | null; original: string | null; history: { from: string | null; to: string | null; at: string; note: string }[]; isBase: boolean; onCancel: () => void; onSave: (to: string | null, note: string) => void }) {
  const [to, setTo] = useState<string | null>(current);
  const [note, setNote] = useState("");
  return (
    <SidePanel title="Prorrogar parcela" sub={label} onClose={onCancel} footer={<><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={!note.trim() || to === current} onClick={() => onSave(to, note)}>{isBase ? "Confirmar prorrogação" : "Aplicar teste na simulação"}</button></>}>
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
export function ParcelaPanel({ label, amount, date, onCancel, onSave }: { label: string; amount: number; date: string; onCancel: () => void; onSave: (amount: number, date: string) => void }) {
  const [a, setA] = useState<number | null>(amount);
  const [dt, setDt] = useState<string | null>(date);
  return (
    <SidePanel title="Editar esta parcela" sub={label} onClose={onCancel} footer={<><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={!a || a <= 0 || !dt} onClick={() => onSave(a!, dt!)}>Salvar parcela</button></>}>
      <p className="text-muted-foreground">Altera somente esta parcela; as demais parcelas da nota não mudam.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field l="Valor da parcela"><MoneyInput className="h-8 w-full" value={a} onChange={setA} /></Field>
        <Field l="Vencimento"><DateInput value={dt} onChange={setDt} /></Field>
      </div>
    </SidePanel>
  );
}
export interface NoteFields { kind: CategoryKind; categoryId: string; supplierId: string; purchaseCode: string; document: string; notes: string }
export function DadosNotaPanel({ d, init, siblings, onCancel, onSave }: { d: ScenarioData; init: NoteFields; siblings: number; onCancel: () => void; onSave: (f: NoteFields) => void }) {
  const [f, setF] = useState(init);
  const up = (p: Partial<NoteFields>) => setF({ ...f, ...p });
  return (
    <SidePanel wide title="Editar dados gerais da nota" sub={siblings > 1 ? `Aplica às ${siblings} parcelas desta nota` : "Aplica a este lançamento"} onClose={onCancel} footer={<><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={!f.categoryId || !f.supplierId} onClick={() => onSave(f)}>Salvar dados da nota</button></>}>
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
export function ConditionPicker({ d, supplierId, hint, disabled, disabledHint, onConfirm, baseDate }: { d: ScenarioData; supplierId: string; baseDate?: string | null | undefined; hint?: string | undefined; disabled?: boolean; disabledHint?: string; onConfirm: (c: { name: string; terms: (number | null)[] }, saveAs: SaveAs | null) => void }) {
  const s = d.suppliers.find((x) => x.id === supplierId)!;
  const list = supplierConditions(s);
  const cur = currentCondition(s, baseDate || new Date().toISOString().slice(0, 10));
  const [sel, setSel] = useState<string>(cur?.id ?? (list.length ? list[0]!.id : "__esp"));
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched && cur) setSel(cur.id); }, [cur?.id, touched]); // sugere a vigente na data base
  const [espT, setEspT] = useState<(number | null)[]>([null]);
  const [save, setSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const isEsp = sel === "__esp";
  const chosen = isEsp ? { name: "Condição específica", terms: espT } : (() => { const c = list.find((x) => x.id === sel)!; return { name: c.name, terms: c.terms }; })();
  const ok = chosen.terms.some((t) => t !== null) && !disabled && (!save || !!saveName.trim());
  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
      {hint && <p className="font-medium">{hint}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Field l="Condição"><select aria-label="Condição" className="inp h-8 min-w-56" value={sel} onChange={(e) => { setSel(e.target.value); setTouched(true); setSave(false); }}>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name} · {termsTxt(c.terms)} dias{c.id === cur?.id ? " (vigente na data base)" : ""}</option>)}
          <option value="__esp">Informar condição específica…</option></select></Field>
        {!isEsp && <span className="text-muted-foreground">{termsTxt(chosen.terms)} dias · {chosen.terms.filter((t) => t !== null).length} parcela(s)</span>}
      </div>
      {!isEsp && list.find((x) => x.id === sel)?.note && <p className="rounded bg-muted p-2">Observação da condição: {list.find((x) => x.id === sel)!.note}</p>}
      {isEsp && <TermsEditor terms={espT} onChange={setEspT} />}
      {isEsp && <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1"><input type="checkbox" checked={save} onChange={(e) => { if (e.target.checked && !window.confirm("Salvar esta condição como nova condição do fornecedor? As condições anteriores serão preservadas.")) return; setSave(e.target.checked); }} /> Salvar como nova condição do fornecedor</label>
        {save && <input className="inp h-8 w-48" placeholder="Nome da condição" value={saveName} onChange={(e) => setSaveName(e.target.value)} />}
        {!save && <span className="text-muted-foreground">Usada só neste lançamento; o padrão do fornecedor não muda.</span>}
      </div>}
      <button className="btn btn-primary" disabled={!ok} title={disabled ? disabledHint : ""} onClick={() => onConfirm(chosen, isEsp && save ? { name: saveName.trim(), terms: chosen.terms, from: null } : null)}>Confirmar condição e gerar parcelas</button>
    </div>
  );
}
