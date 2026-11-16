import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CatSubFields, ConditionPicker, Field, Section, SidePanel, SupplierSearch, guardClose } from "./NotaPanel";
import { DateInput, MoneyInput } from "./kit";
import { useApp, uid } from "@/lib/store";
import { applyManaged, managedDocument, flowImpact, validateManualRemaining, type LaunchRef, type ManagedParcel } from "@/lib/manageLaunch";
import { eligiblePlanned } from "@/lib/manageLaunchPresentation";
import { applySuggestion, effectivateManual, type Suggestion } from "@/lib/efetivacao";
import { generateParcels } from "@/lib/notas";
import { supplierIdentity } from "@/lib/supplierIdentity";
import { paymentsFor, titleStatus } from "@/lib/engine/engine";
import { fmtBRL } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { todaySP } from "@/lib/engine/actions";
import { HistoryView } from "./HistoryView";
import type { ScenarioData } from "@/lib/engine/types";

export function PlannedLaunchForm({ launch, onClose }: { launch: LaunchRef; onClose: () => void }) {
  const { active, official, update, canEdit, user, audit, allSims } = useApp();
  const d = active.data;
  const [initial] = useState(() => structuredClone(managedDocument(d, launch)));
  const [context] = useState({ id: active.id, base: active.isBase, org:official.orgId, version:official.version });
  const [rows, setRows] = useState(initial.parcels);
  const [fields, setFields] = useState(initial.fields);
  const [total, setTotal] = useState<number | null>(initial.parcels.reduce((s, p) => s + (p.amount ?? 0), 0));
  const [baseDate, setBaseDate] = useState<string | null>("baseDate" in initial.record ? initial.record.baseDate : null);
  const [kind, setKind] = useState(d.categories.find(c => c.id === fields.categoryId)?.kind ?? "compra");
  const [selected, setSelected] = useState<string[]>([]);
  const [real, setReal] = useState<ManagedParcel[] | null>(null);
  const [date, setDate] = useState<string | null>(todaySP());
  const [note, setNote] = useState(fields.document);
  const [order, setOrder] = useState(fields.purchaseCode);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<Suggestion>("manter");
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ data: ScenarioData; impact: ReturnType<typeof flowImpact> } | null>(null);
  const [effId] = useState(() => `ef-${uid()}`);
  const original = initial.parcels.reduce((s,p) => s + (p.amount ?? 0),0);
  const dirty = !!real || JSON.stringify(rows) !== JSON.stringify(initial.parcels) || JSON.stringify(fields) !== JSON.stringify(initial.fields) || total !== original || ("baseDate" in initial.record && baseDate !== initial.record.baseDate);
  const eligible = eligiblePlanned(launch, rows).filter(p => initial.parcels.some(b => b.key === p.key));
  const rest = rows.filter(p => !selected.includes(p.key) && p.status !== "cancelado");
  const sum = (ps: ManagedParcel[]) => ps.filter(p => p.status !== "cancelado").reduce((s,p) => s + (p.amount ?? 0),0);
  const plannedTotal = sum(real ? rest : rows), realTotal = sum(real ?? []);
  const patch = (key: string, value: Partial<ManagedParcel>, effective = false) => {
    const change = (ps: ManagedParcel[]) => ps.map(p => p.key === key ? { ...p, ...value } : p);
    if (effective) setReal(ps => ps ? change(ps) : ps); else setRows(change);
    setChecked(false); setReview(null);
  };
  const add = (effective = false) => {
    const ps = effective ? real ?? [] : rows;
    const n = Math.max(0, ...ps.map(p => Number.parseInt(p.label) || 0)) + 1;
    const p: ManagedParcel = { key: `new-${uid()}`, id: launch.id, label: `${n} (nova)`, original: 0, amount: null, date: null, extension: null, paid: 0, status: "ativo" };
    if (effective) setReal([...ps, p]); else setRows([...rows, p]); setChecked(false);
  };
  const remove = (p: ManagedParcel, effective: boolean) => {
    if (effective) setReal(ps => ps?.filter(r => r.key !== p.key) ?? null);
    else if (!initial.parcels.some(r => r.key === p.key)) setRows(ps => ps.filter(r => r.key !== p.key));
    else patch(p.key, { status: "cancelado" });
    setChecked(false);
  };
  const start = (keys: string[]) => { setSelected(keys); setReal(rows.filter(p => keys.includes(p.key)).map(p => ({ ...p }))); setRemaining(null); setChecked(false); setError(""); };
  const origins = initial.parcels.filter(p => p.status !== "cancelado").map(p => ({ key: p.key, amount: p.amount ?? 0, date: p.extension ?? p.date ?? "" }));
  const substituted = origins.filter(p => selected.includes(p.key)).reduce((s,p) => s+p.amount,0);
  const suggestion = useMemo(() => {
    try {
      if (!rest.length || !real?.length || real.some(p => p.amount === null) || rest.some(p => !origins.some(o => o.key === p.key))) throw new Error("origem_insuficiente");
      const result = applySuggestion(mode, rest.map(p => ({ id:p.key, origin:p.key, amount:p.amount, date:p.date })), { parcels: origins, selected, substituted, effTotal: realTotal });
      if (result.some(p => p.amount === null || p.amount <= 0)) throw new Error("Total sugerido não é positivo.");
      return { result, total: result.reduce((s,p) => s+(p.amount ?? 0),0), error: "" };
    } catch (e) { return { result: [], total: 0, error: (e as Error).message === "origem_insuficiente" ? "Informe os valores reais e mantenha apenas restantes com valor de origem conhecido para usar esta sugestão." : (e as Error).message }; }
  }, [mode, rows, real, selected]);
  const linked = useMemo(() => d.committed.filter(c => c.plannedId === launch.id || d.effectivations.some(e => e.plannedId === launch.id && e.committedIds.includes(c.id))), [d, launch.id]);
  const build = (next: ScenarioData) => {
    if (context.id !== active.id || context.base !== active.isBase || context.org !== official.orgId) throw new Error("O contexto mudou. Rascunho preservado; volte à organização e modo de origem.");
    if (active.isBase && context.version !== official.version) throw new Error("A versão da base mudou. Rascunho preservado; confira a edição concorrente antes de reaplicar.");
    if (!reason.trim()) throw new Error("Informe a justificativa.");
    const draft = real ? rows.map(p => selected.includes(p.key) ? initial.parcels.find(b => b.key === p.key) ?? p : p) : rows;
    const input = { ref: launch, beforeRecords: initial.records, before: initial.parcels, parcels: draft, fields, initialFields: initial.fields, reason, at: new Date().toISOString(), by: user?.email ?? "", plannedBaseDate:baseDate };
    const staged: ScenarioData = real ? JSON.parse(JSON.stringify(next)) : next;
    applyManaged(staged, input);
    if (!real) {
      if (total === null || total !== plannedTotal) throw new Error("Informe o total previsto igual à soma das parcelas; ajuste somente por escolha explícita.");
      return;
    }
    if (selected.some(k => !eligible.some(p => p.key === k)) || !selected.length || !real.length) throw new Error("Selecione planejadas elegíveis e informe as parcelas reais.");
    const err = validateManualRemaining(remaining, checked, rest.map(p => ({ amount: p.amount, date: p.extension ?? p.date }))); if (err) throw new Error(err);
    if (!date || !note.trim()) throw new Error("Informe data e documento da efetivação.");
    if (linked.some(c => c.document.trim().toLocaleLowerCase("pt-BR") === note.trim().toLocaleLowerCase("pt-BR"))) throw new Error("Documento já vinculado. Abra a nota existente para ajustar suas parcelas; esta operação não duplica notas.");
    const invalid = real.some(p => p.amount === null || !p.date || (p.extension && p.extension < p.date)); if (invalid) throw new Error("Confira valores, vencimentos e prorrogações reais.");
    applyManaged(next, { ...input, plannedBaseDate:"baseDate" in initial.record ? initial.record.baseDate : null, parcels:initial.parcels });
    effectivateManual(next, { id: effId, plannedId: launch.id, at: new Date().toISOString(), effectiveDate: date, document: note.trim(), purchaseCode: order, selected, eff: real.map(p => ({ amount: p.amount ?? 0, date: p.date ?? "" })), rest: rest.map(p => ({ id: p.key, amount:p.amount ?? 0, date:p.extension ?? p.date ?? "" })), substituted, rule: `${reason} · saldo manual confirmado ${fmtBRL(remaining)}` });
    real.forEach((p,i) => { const c = next.committed.find(c => c.id === `${effId}-${i+1}`); if(c && p.extension) { c.extensionDate=p.extension; c.extensionHistory.push({ at:new Date().toISOString(), from:null, to:p.extension, note:reason }); } });
    const pl = next.planned.find(p=>p.id===launch.id), edited = staged.planned.find(p=>p.id===launch.id);
    if(pl && edited) { if(edited.editLog) pl.editLog=edited.editLog; pl.baseDate=edited.baseDate; }
  };
  const prepare = () => { try { const next=structuredClone(d); build(next); setReview({ data:next, impact:flowImpact(d,next) }); setError(""); } catch(e) { setError((e as Error).message); } };
  const table = (ps: ManagedParcel[], effective = false) => <table className="tbl vertical-parcels" aria-label={effective ? "Parcelas reais" : "Parcelas previstas"}><thead><tr>{!real && <th>Selecionar</th>}<th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Prorrogar para</th><th>Situação / ações</th></tr></thead><tbody>{ps.map(p => <tr key={p.key} className={p.key===launch.parcel ? "launch-focus" : ""}>
    {!real && <td><input type="checkbox" aria-label={`Selecionar parcela ${p.label}`} checked={selected.includes(p.key)} disabled={!canEdit || !eligible.some(e=>e.key===p.key)} onChange={e=>setSelected(e.target.checked ? [...selected,p.key] : selected.filter(k=>k!==p.key))}/></td>}
    <td>{p.label}<small className="block">{initial.parcels.some(b=>b.key===p.key) ? "ID preservado" : "Nova linha"}</small></td>
    <td><fieldset disabled={!canEdit || p.paid>0 || p.status==="cancelado"}><MoneyInput value={p.amount} onChange={amount=>patch(p.key,{amount},effective)}/></fieldset></td>
    <td><fieldset disabled={!canEdit || p.paid>0 || p.status==="cancelado"}><DateInput value={p.date} onChange={date=>patch(p.key,{date},effective)}/></fieldset></td>
    <td><fieldset disabled={!canEdit || p.paid>0 || p.status==="cancelado"}><DateInput allowEmpty value={p.extension} onChange={extension=>patch(p.key,{extension},effective)}/></fieldset></td>
    <td>{p.status==="cancelado" ? `Cancelada · original ${fmtBRL(p.original)}` : <Button variant="outline" disabled={!canEdit || p.paid>0} onClick={()=>remove(p,effective)}>{effective || !initial.parcels.some(b=>b.key===p.key) ? "Remover linha" : "Cancelar parcela"}</Button>}</td>
  </tr>)}</tbody></table>;
  const history = active.isBase ? audit.map(a => ({ at: a.at, user: a.user_email ?? "", changes: a.changes })) : allSims.find(s=>s.id===active.id)?.history ?? [];
  return <SidePanel expanded title={review ? "Revisar lançamento" : real ? "Efetivar parcelas planejadas" : "Editar lançamento · Planejada"} sub={`${supplierIdentity(d, initial.record).name} · Pedido ${fields.purchaseCode || "Não informado"}`} dirty={dirty} onClose={onClose} footer={<>{review && <Button variant="outline" onClick={()=>setReview(null)}>Voltar</Button>}<Button variant="outline" onClick={guardClose(dirty,onClose)}>Cancelar</Button><Button disabled={!canEdit || !dirty} onClick={review ? ()=>{ const e=update(build); if(e) setError(e); else onClose(); } : prepare}>{review ? "Confirmar alterações" : real ? "Revisar alterações" : "Revisar e confirmar"}</Button></>}>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {review ? <>
      <p>Pedido {real ? order : fields.purchaseCode || "Não informado"} · Documento <b>{real ? note : fields.document || "Não informado"}</b></p>
      <table className="tbl"><thead><tr><th>Parcela / escopo</th><th>Valor antes → depois</th><th>Data antes → depois</th><th>Ação</th></tr></thead><tbody>{rows.map(p=>{const b=initial.parcels.find(b=>b.key===p.key);return <tr key={p.key}><td>{p.label}</td><td>{fmtBRL(b?.amount)} → {fmtBRL(p.status==="cancelado" ? 0 : p.amount)}</td><td>{fmtDate(b?.extension??b?.date)} → {fmtDate(p.extension??p.date)}</td><td>{real && selected.includes(p.key) ? "Substituída por nota efetivada" : !b ? "Nova" : p.status==="cancelado" ? "Cancelada" : JSON.stringify(p)===JSON.stringify(b) ? "Não afetada" : "Alterada"}</td></tr>})}</tbody></table>
      {real && <Section title={`Nota ${note} · novas parcelas reais`}><table className="tbl"><thead><tr><th>Parcela</th><th>Valor real</th><th>Vencimento</th><th>Prorrogação</th></tr></thead><tbody>{real.map(p=><tr key={p.key}><td>{p.label}</td><td>{fmtBRL(p.amount)}</td><td>{fmtDate(p.date)}</td><td>{fmtDate(p.extension)}</td></tr>)}</tbody></table><p>Efetivado {fmtBRL(realTotal)} · Planejado restante confirmado {fmtBRL(remaining)} · Total após alteração {fmtBRL(realTotal+plannedTotal)}. Não registra pagamento.</p></Section>}
      {JSON.stringify(fields)!==JSON.stringify(initial.fields) && <p>Dados compartilhados do planejamento: {Object.keys(fields).filter(k=>fields[k as keyof typeof fields]!==initial.fields[k as keyof typeof fields]).map(k=>`${k}: ${initial.fields[k as keyof typeof fields] || "Não informado"} → ${fields[k as keyof typeof fields] || "Não informado"}`).join("; ")}.</p>}
      <p>Justificativa: {reason}. Confirmar prepara rascunho; só Salvar grava a base.</p>
      <Section title="Efeito por data"><div className="max-h-64 overflow-auto"><table className="tbl"><thead><tr><th>Data</th><th>Saídas antes → depois</th><th>Saldo antes → depois</th></tr></thead><tbody>{review.impact.map(p=><tr key={p.date}><td>{fmtDate(p.date)}</td><td>{fmtBRL(p.before)} → {fmtBRL(p.after)}</td><td>{fmtBRL(p.balanceBefore)} → {fmtBRL(p.balanceAfter)}</td></tr>)}</tbody></table></div></Section>
    </> : <>
      {real ? <>
        <p>{kind==="compra" ? "Compra" : "Despesa"} · Planejado antes {fmtBRL(original)} · {selected.length} parcela(s) selecionada(s). Pedido, documento e parcela são identificações distintas.</p>
        <Section n={1} title="Dados da efetivação"><div className="grid gap-3 md:grid-cols-3"><Field l="Data da efetivação"><DateInput value={date} onChange={setDate}/></Field><Field l="Documento / nota"><input className="inp" value={note} onChange={e=>setNote(e.target.value)}/></Field><Field l="Código do pedido"><input className="inp" value={order} onChange={e=>setOrder(e.target.value)}/></Field></div></Section>
        <Section n={2} title="O que passará para Efetivado">{table(real,true)}<Button variant="outline" onClick={()=>add(true)}>+ Adicionar parcela real</Button><details className="mt-3"><summary>Condição / reparcelamento opcional</summary>{d.suppliers.some(s=>s.id===fields.supplierId) && <ConditionPicker d={d} supplierId={fields.supplierId} baseDate={date} disabled={!date || realTotal<=0} onConfirm={c=>{if(!date)return; setReal(generateParcels(realTotal,date,c.terms).map((p,i)=>({key:`real-${uid()}`,id:launch.id,label:`${i+1}/${c.terms.filter(t=>t!==null).length}`,amount:p.amount,date:p.date,extension:p.ext,original:0,paid:0,status:"ativo"})));setChecked(false);}}/>}</details></Section>
        <Section n={3} title="O que continuará em Planejada">{table(rows.filter(p=>!selected.includes(p.key)))}<Button variant="outline" onClick={()=>add()}>+ Adicionar parcela planejada</Button>
          <div className="space-y-2 mt-3"><Field l="Sugestão para o restante"><select className="inp" value={mode} onChange={e=>setMode(e.target.value as Suggestion)}><option value="manter">Manter valores previstos restantes</option><option value="igualar">Igualar cada restante ao total efetivado (uma origem)</option><option value="diferenca">Aplicar diferença também às restantes</option><option value="total">Manter total original</option></select></Field><p>{suggestion.error || `${mode==="manter" ? "Restaura os valores de origem restantes" : mode==="igualar" ? `${rest.length} restantes × ${fmtBRL(realTotal)}` : mode==="diferenca" ? `Restante de origem − (${fmtBRL(substituted)} − ${fmtBRL(realTotal)})` : `${fmtBRL(original)} − ${fmtBRL(realTotal)}`} = ${fmtBRL(suggestion.total)}; total após alteração ${fmtBRL(suggestion.total+realTotal)}. Datas preservadas; divisão com resíduo na última quando aplicável.`}</p><Button variant="outline" disabled={!!suggestion.error} onClick={()=>{setRows(ps=>ps.map(p=>{const s=suggestion.result.find(s=>s.id===p.key);return s ? {...p,amount:s.amount} : p;}));setChecked(false);setRemaining(null);}}>Aplicar sugestão</Button></div>
          <Field l="Saldo restante previsto (informação manual)"><MoneyInput value={remaining} onChange={v=>{setRemaining(v);setChecked(false);}}/></Field><p>Diferença matemática de referência: {fmtBRL(original-realTotal)}. Não se aplica automaticamente.</p><label className="flex gap-2"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Conferi o total restante e todas as datas; R$ 0,00 encerra expressamente o restante.</label>
        </Section>
        <Section title="Resumo"><p>Efetivado {fmtBRL(realTotal)} · Planejado restante {fmtBRL(plannedTotal)} · Total após alteração {fmtBRL(realTotal+plannedTotal)}</p></Section>
        <Button variant="outline" onClick={()=>{setReal(null);setChecked(false);}}>Voltar à edição do planejamento</Button>
      </> : <>
        <Section title="Dados gerais"><p className="mb-3 text-warning-foreground">Campos compartilhados afetam este planejamento e suas parcelas, não notas já efetivadas nem outras notas do pedido. Datas base e condição só geram novas datas por ação explícita.</p><fieldset disabled={!canEdit} className="grid gap-3 md:grid-cols-2"><CatSubFields d={d} kind={kind} categoryId={fields.categoryId} onChange={(kind,categoryId)=>{setKind(kind);setFields({...fields,categoryId});}}/><Field full l="Fornecedor"><SupplierSearch d={d} existing value={fields.supplierId} onChange={supplierId=>setFields({...fields,supplierId})}/></Field><Field l="Código do pedido"><input className="inp" value={fields.purchaseCode} onChange={e=>setFields({...fields,purchaseCode:e.target.value})}/></Field><Field l="Documento"><input className="inp" value={fields.document} onChange={e=>setFields({...fields,document:e.target.value})}/></Field><Field full l="Descrição"><input className="inp" value={fields.notes} onChange={e=>setFields({...fields,notes:e.target.value})}/></Field><Field l="Valor total previsto"><MoneyInput value={total} onChange={setTotal}/></Field><Field l="Data base para os prazos"><DateInput value={baseDate} onChange={setBaseDate}/></Field></fieldset></Section>
        <Section title="Condição de pagamento"><details><summary>Condição de pagamento — aplicar somente por escolha explícita</summary>{d.suppliers.some(s=>s.id===fields.supplierId) ? <ConditionPicker d={d} supplierId={fields.supplierId} baseDate={baseDate} disabled={!baseDate || total===null || total<=0} onConfirm={c=>{if(total===null || !baseDate)return;const gen=generateParcels(total,baseDate,c.terms);const current=rows.filter(p=>p.status!=="cancelado");if(gen.length<current.length){setError("Cancele expressamente as parcelas excedentes antes de aplicar esta condição.");return;}setRows([...rows.map(p=>{const i=current.findIndex(r=>r.key===p.key),g=gen[i];return g ? {...p,amount:g.amount,date:g.date,extension:g.ext} : p;}),...gen.slice(current.length).map((p,i)=>({key:`new-${uid()}`,id:launch.id,label:`${rows.length+i+1} (nova)`,original:0,amount:p.amount,date:p.date,extension:p.ext,status:"ativo",paid:0}))]);setChecked(false);setError("");}}/> : <p>Sem fornecedor cadastrado vinculado; preencha manualmente.</p>}</details></Section>
        <Section title="Parcelas previstas"><div className="flex flex-wrap gap-2 mb-3"><Button variant="outline" onClick={()=>setSelected(eligible.map(p=>p.key))}>Selecionar todas as planejadas</Button><Button variant="outline" onClick={()=>setSelected([])}>Limpar seleção</Button><span>{selected.length}/{eligible.length} selecionadas</span><Button disabled={!canEdit || !selected.length} onClick={()=>start(selected)}>Efetivar selecionadas ({selected.length})</Button><Button variant="outline" disabled={!canEdit || !eligible.length} onClick={()=>start(eligible.map(p=>p.key))}>Efetivar documento inteiro</Button></div>{table(rows)}<div className="flex flex-wrap gap-2 mt-3"><Button variant="outline" disabled={!canEdit} onClick={()=>add()}>+ Adicionar parcela</Button><Button variant="outline" disabled={!canEdit || total===null || !eligible.length} onClick={()=>{const last=eligible.at(-1);if(last && total!==null)patch(last.key,{amount:(last.amount??0)+total-plannedTotal});}}>Ajustar diferença na última parcela</Button><Button variant="destructive" disabled={!canEdit} onClick={()=>{setRows(ps=>ps.map(p=>({...p,status:"cancelado"})));setTotal(0);setChecked(false);}}>Cancelar planejamento</Button></div></Section>
        <Section title="Resumo"><p>Total da nota {fmtBRL(total)} · Total das parcelas {fmtBRL(plannedTotal)} · Diferença {fmtBRL(total===null ? null : total-plannedTotal)}</p></Section>
      </>}
      <Field l="Justificativa"><textarea className="inp" value={reason} onChange={e=>setReason(e.target.value)}/></Field>
      <details><summary>Notas já efetivadas vinculadas ({linked.length} parcelas)</summary><table className="tbl"><thead><tr><th>Documento / nota</th><th>Pedido</th><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Situação</th></tr></thead><tbody>{linked.map(c=><tr key={c.id}><td>{c.document}</td><td>{c.purchaseCode || "Não informado"}</td><td>{c.parcelNo ? `${c.parcelNo}/${c.parcelCount}` : c.id}</td><td>{fmtBRL(c.value)}</td><td>{fmtDate(c.extensionDate??c.dueDate)}</td><td>{titleStatus(c.value,c.status,paymentsFor(d,"committed",c.id)).state}</td></tr>)}</tbody></table>{!linked.length && <p>Nenhuma nota com vínculo comprovado.</p>}</details>
      <details><summary>Histórico do planejamento</summary><HistoryView data={d} entries={history.map(a=>({...a,changes:a.changes.filter(c=>c.id===launch.id)}))}/></details>
    </>}
  </SidePanel>;
}