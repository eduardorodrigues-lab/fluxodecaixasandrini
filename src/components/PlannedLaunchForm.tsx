import { useFormDraft } from "./useFormDraft";
import { askConfirm } from "@/lib/decisions";
import { EffectivationNotes } from "./EffectivationNotes";
import { PlanVsActualDetail } from "@/components/PlanVsActual";
import { useOperationSave } from "./useOperationSave";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CatSubFields, ConditionPicker, Field, Section, SidePanel, SupplierSearch, guardClose, type SaveAs } from "./NotaPanel";
import { DateInput, MoneyInput } from "./kit";
import { useApp, uid } from "@/lib/store";
import { applyManaged, managedDocument, validateManualRemaining, type LaunchRef, type ManagedParcel } from "@/lib/manageLaunch";
import { eligiblePlanned } from "@/lib/manageLaunchPresentation";
import { applySuggestion, batchPreview, effectivateBatch, duplicateBatchDocuments, heldNotes, type BatchNote, type RestLine, type Suggestion } from "@/lib/efetivacao";
import { planVsActual } from "@/lib/planVsActual";
import { generateParcels, saveSupplierCondition } from "@/lib/notas";
import { supplierIdentity } from "@/lib/supplierIdentity";
import { paymentsFor, splitCents, titleStatus } from "@/lib/engine/engine";
import { fmtBRL } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { todaySP } from "@/lib/engine/actions";
import { HistoryView } from "./HistoryView";
import type { ScenarioData, Supplier } from "@/lib/engine/types";
import { produce } from 'immer';
import { measureSavePhase } from '@/lib/saveTiming';

export function PlannedLaunchForm({ launch, onClose }: { launch: LaunchRef; onClose: () => void }) {
  const { active, official, canEdit, user, audit, allSims } = useApp();
  const saving = useOperationSave();
  const [localSuppliers,setLocalSuppliers]=useState<Supplier[]>([]);
  const [saveCondition,setSaveCondition]=useState<SaveAs|null>(null);
  const d = useMemo(()=>({...active.data,suppliers:[...active.data.suppliers,...localSuppliers.filter(s=>!active.data.suppliers.some(x=>x.id===s.id))]}),[active.data,localSuppliers]);
  const [initial, setInitial] = useState(() => structuredClone(managedDocument(d, launch)));
  const [context, setContext] = useState({ id: active.id, base: active.isBase, org:official.orgId, version:official.version });
  // Known notes saved as planned keep their own panels/IDs; generic rows exclude them to avoid duplicated forecasts.
  const [savedNotes, setSavedNotes] = useState(() => heldNotes(d, launch.id));
  const [heldKeys, setHeldKeys] = useState(() => new Set(savedNotes.flatMap(n => n.parcels.map(p => p.id))));
  const [initialRows, setInitialRows] = useState(() => initial.parcels.filter(p => !heldKeys.has(p.key)));
  const heldRows = initial.parcels.filter(p => heldKeys.has(p.key));
  const [rows, setRows] = useState(initialRows);
  const [fields, setFields] = useState(initial.fields);
  const [total, setTotal] = useState<number | null>(initial.record.value);
  const [baseDate, setBaseDate] = useState<string | null>("baseDate" in initial.record ? initial.record.baseDate : null);
  const [kind, setKind] = useState(d.categories.find(c => c.id === fields.categoryId)?.kind ?? "compra");
  const [selected, setSelected] = useState<string[]>([]);
  const [allNotes, setNotes] = useState<BatchNote[] | null>(savedNotes.length ? savedNotes : null);
  const [showNotes, setShowNotes] = useState(false);
  const notes = showNotes ? allNotes : null;
  // Only explicitly selected note parcels are effectivated now; unselected ones stay planned (detailed) without duplication.
  const effNotes = (notes ?? []).map(n=>{const all=n.parcels.map((p,j)=>({...p,parcelNo:p.parcelNo??j+1,parcelCount:p.parcelCount??n.parcels.length}));const ps=all.filter(p=>p.selected!==false);return {...n,total:ps.length===n.parcels.length ? n.total : ps.reduce((s,p)=>s+(p.amount??0),0),parcels:ps};}).filter(n=>n.parcels.length);
  // Unselected note parcels stay planned WITH their note identification (NF, condition, dates, numbering, same IDs).
  const heldParcels = (notes ?? []).flatMap(n=>n.parcels.map((p,j)=>({p,j})).filter(({p})=>p.selected===false).map(({p,j})=>({...p,document:n.document,note:{noteId:n.id,document:n.document.trim(),total:n.total ?? n.parcels.reduce((s,x)=>s+(x.amount??0),0),effectiveDate:n.effectiveDate,baseDate:n.baseDate,condition:structuredClone(n.condition ?? null),parcelNo:p.parcelNo??j+1,parcelCount:p.parcelCount??n.parcels.length,dueDate:p.date ?? "",extension:p.extension}})));
  const real = notes ? effNotes.flatMap(n=>n.parcels.map((p,i):ManagedParcel=>({key:p.id,id:p.id,label:`${i+1}/${n.parcels.length}`,original:0,amount:p.amount,date:p.date,extension:p.extension,paid:0,status:"ativo",boletoNumber:p.boletoNumber}))) : null;
  const [scopeConfirmed,setScopeConfirmed] = useState(false);
  const [duplicateConfirmed,setDuplicateConfirmed] = useState(false);
  const changeNotes = (ns:BatchNote[]) => {setNotes(ns);setChecked(false);setDuplicateConfirmed(false);setReview(null);};
  const [remaining, setRemaining] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<Suggestion>("manter");
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ before: ScenarioData; data: ScenarioData } | null>(null);
  const [effId, setEffId] = useState(() => `ef-${uid()}`);
  const protection = useFormDraft({user:user?.id??"",org:official.orgId,mode:active.id,form:"planned",record:launch.id},
    {initial,context,savedNotes,initialRows,rows,fields,total,baseDate,kind,selected,allNotes,showNotes,remaining,reason,mode,effId,localSuppliers,saveCondition}, v=>{
      setLocalSuppliers(v.localSuppliers??[]);
      setSaveCondition(v.saveCondition??null);
      setInitial(v.initial);setContext(v.context);setSavedNotes(v.savedNotes);setHeldKeys(new Set(v.savedNotes.flatMap(n=>n.parcels.map(p=>p.id))));setInitialRows(v.initialRows);
      setRows(v.rows);setFields(v.fields);setTotal(v.total);setBaseDate(v.baseDate);setKind(v.kind);setSelected(v.selected);setNotes(v.allNotes);setShowNotes(v.showNotes);setRemaining(v.remaining);setReason(v.reason);setMode(v.mode);setEffId(v.effId);
      setChecked(false);setReview(null);setScopeConfirmed(false);setDuplicateConfirmed(false);
    });
  const discard = async()=>{if(saving.saving)return;if(await askConfirm("Descartar este preenchimento? O planejamento salvo não muda.",{title:"Descartar rascunho?",action:"Descartar",destructive:true})){if(protection.clear())onClose();}};
  const original = initial.parcels.reduce((s,p) => s + (p.amount ?? 0),0);
  const dirty = JSON.stringify(allNotes ?? []) !== JSON.stringify(savedNotes) || JSON.stringify(rows) !== JSON.stringify(initialRows) || JSON.stringify(fields) !== JSON.stringify(initial.fields) || total !== initial.record.value || ("baseDate" in initial.record && baseDate !== initial.record.baseDate);
  const eligible = eligiblePlanned(launch, rows).filter(p => initialRows.some(b => b.key === p.key));
  const rest = rows.filter(p => !selected.includes(p.key) && p.status !== "cancelado");
  const sum = (ps: ManagedParcel[]) => ps.filter(p => p.status !== "cancelado").reduce((s,p) => s + (p.amount ?? 0),0);
  const heldTotal = heldParcels.reduce((s,p)=>s+(p.amount??0),0);
  // Generic R$ 0,00 lines left unselected are replaced by the note detail: they carry no obligation and are not persisted in the remaining.
  const zeroGeneric = real ? rest.filter(p => p.amount === 0 && initialRows.some(b => b.key === p.key && b.amount === 0)) : [];
  const restGeneric = rest.filter(p => !zeroGeneric.includes(p));
  const plannedTotal = real ? sum(restGeneric) + heldTotal : sum(rows) + sum(heldRows), realTotal = sum(real ?? []);
  const patch = (key: string, value: Partial<ManagedParcel>, effective = false) => {
    const change = (ps: ManagedParcel[]) => ps.map(p => p.key === key ? { ...p, ...value } : p);
    if (!effective) setRows(change);
    setChecked(false); setReview(null);
  };
  const add = (effective = false) => {
    const ps = effective ? real ?? [] : rows;
    const n = Math.max(0, ...ps.map(p => Number.parseInt(p.label) || 0)) + 1;
    const p: ManagedParcel = { key: `new-${uid()}`, id: launch.id, label: `${n} (nova)`, original: 0, amount: null, date: null, extension: null, paid: 0, status: "ativo" };
    if (!effective) setRows([...rows, p]); setChecked(false);
  };
  const remove = (p: ManagedParcel, effective: boolean) => {
    if (effective) return;
    else if (!initialRows.some(r => r.key === p.key)) setRows(ps => ps.filter(r => r.key !== p.key));
    else patch(p.key, { status: "cancelado" });
    setChecked(false);
  };
  const newNote = (keys:string[] = []):BatchNote => ({id:`note-${uid()}`,document:allNotes?.length ? "" : fields.document,total:null,effectiveDate:todaySP(),baseDate:baseDate??todaySP(),condition:null,parcels:keys.map(k=>rows.find(p=>p.key===k)).filter((p):p is ManagedParcel=>!!p).map(p=>({id:`title-${uid()}`,amount:p.amount,date:p.date,extension:p.extension,boletoNumber:p.boletoNumber,selected:keys.length>0}))});
  const start = (keys: string[], effect=false) => { setSelected(keys); setShowNotes(true); if (allNotes?.length) { setNotes(allNotes.map(n=>({...n,parcels:n.parcels.map(p=>({...p,selected:keys.includes(p.id)}))})));setChecked(false); setReview(null); return; } const n=newNote(keys);n.total=n.parcels.length ? n.parcels.reduce((s,p)=>s+(p.amount??0),0) : null;n.parcels=n.parcels.map(p=>({...p,selected:effect}));setNotes([n]);setRemaining(null);setChecked(false);setScopeConfirmed(false);setDuplicateConfirmed(false);setError(""); };
  const origins = initialRows.filter(p => p.status !== "cancelado").map(p => ({ key: p.key, amount: p.amount ?? 0, date: p.extension ?? p.date ?? "" }));
  const substituted = origins.filter(p => selected.includes(p.key)).reduce((s,p) => s+p.amount,0);
  const suggestion = useMemo(() => {
    try {
      if (!rest.length || !real?.length || real.some(p => p.amount === null) || rest.some(p => !origins.some(o => o.key === p.key))) throw new Error("origem_insuficiente");
      const result = applySuggestion(mode, rest.map(p => ({ id:p.key, origin:p.key, amount:p.amount, date:p.date })), { parcels: origins, selected, substituted, effTotal: realTotal });
      if (result.some(p => p.amount === null || p.amount <= 0)) throw new Error("Total sugerido não é positivo.");
      return { result, total: result.reduce((s,p) => s+(p.amount ?? 0),0), error: "" };
    } catch (e) { return { result: [], total: 0, error: heldTotal>0 && !restGeneric.length ? `As ${heldParcels.length} parcela(s) de notas não selecionadas já explicam o restante (${fmtBRL(heldTotal)}); linhas genéricas de R$ 0,00 são substituídas pelo detalhamento e não precisam de valor.` : (e as Error).message === "origem_insuficiente" ? "Informe os valores reais e mantenha apenas restantes com valor de origem conhecido para usar esta sugestão." : (e as Error).message }; }
  }, [mode, rows, real, selected]);
  const linked = useMemo(() => d.committed.filter(c => c.plannedId === launch.id || d.effectivations.some(e => e.plannedId === launch.id && e.committedIds.includes(c.id))), [d, launch.id]);
  const comparison = useMemo(()=>planVsActual(d).find(p=>p.plannedId===launch.id),[d,launch.id]);
  const priorTotal = linked.filter(c=>c.status!=="cancelado").reduce((s,c)=>s+c.value,0);
  const priorUnpaid = linked.filter(c=>c.status!=="cancelado").reduce((s,c)=>s+titleStatus(c.value,c.status,paymentsFor(d,"committed",c.id)).open,0);
  // Current budget is editable; historical comparison uses evidence from the first confirmed effectivation.
  const refValue = total;
  const preview = batchPreview(refValue, priorTotal, realTotal);
  const restLines: (RestLine & { where: string })[] = [...restGeneric.map(p=>({id:p.key,origin:initialRows.some(b=>b.key===p.key)?p.key:null,amount:p.amount,date:p.extension??p.date,boletoNumber:p.boletoNumber,where:`Parcela planejada ${p.label}`})),...heldParcels.map(p=>({id:p.id,origin:null,amount:p.amount,date:p.extension??p.date,boletoNumber:p.boletoNumber,note:p.note,where:`Nota ${p.document || "sem número"} · parcela ${p.note.parcelNo}/${p.note.parcelCount}`}))];
  const restSum = restLines.reduce((s,p)=>s+(p.amount??0),0), restNotes = new Set(heldParcels.map(p=>p.note.noteId)).size;
  const restMismatch = remaining!==null && restSum!==remaining;
  const scopeNeeded = initial.record.status==="encerrado" || (refValue===null ? !selected.length : preview.excess!==null && preview.excess>0);
  const errRef = useRef<HTMLParagraphElement>(null);
  useEffect(()=>{ if(error) errRef.current?.focus(); },[error]);
  const duplicates = useMemo(()=>duplicateBatchDocuments(d,launch.id,notes??[]),[d,launch.id,allNotes,showNotes]);
  const build = (next: ScenarioData) => {
    if (context.id !== active.id || context.base !== active.isBase || context.org !== official.orgId) throw new Error("O contexto mudou. Rascunho preservado; volte à organização e modo de origem.");
    if (notes && !reason.trim()) throw new Error("Informe a justificativa da efetivação.");

    const draft = real ? rows.map(p => selected.includes(p.key) ? initial.parcels.find(b => b.key === p.key) ?? p : p) : [...rows, ...heldRows];
    const input = { ref: launch, beforeRecords: initial.records, before: initial.parcels, parcels: draft, fields, initialFields: initial.fields, reason, at: new Date().toISOString(), by: user?.email ?? "", plannedBaseDate:baseDate };
    if (!notes) applyManaged(next, input);
    if (!notes) {
      if (total === null || total !== priorTotal+plannedTotal) throw new Error(`O total atual deve cobrir ${fmtBRL(priorTotal)} já efetivados + ${fmtBRL(plannedTotal)} ainda planejados; ajuste somente por escolha explícita.`);
      const pl = next.planned.find(p=>p.id===launch.id);
      if(pl && total!==null && pl.value!==total){(pl.editLog??=[]).push({at:input.at,by:input.by,note:reason||"Revisão do valor previsto",before:{amount:pl.value,date:pl.baseDate},after:{amount:total,date:baseDate}});pl.value=total;}
      return;
    }
    if (selected.some(k => !eligible.some(p => p.key === k))) throw new Error("Selecione planejadas elegíveis.");
    if (effNotes.some(n=>!n.document.trim())) throw new Error("Informe o número de cada nota fiscal.");
    if (!effNotes.length && !heldParcels.length) throw new Error("Selecione ao menos uma parcela de nota para efetivar agora.");
    if (heldParcels.some(p=>!p.document.trim())) throw new Error("Informe o número de cada nota fiscal, inclusive das que permanecem planejadas.");
    // Specific errors on the canonical remaining collection that will be persisted.
    const bad = restLines.find(p => p.amount === null || p.amount <= 0 || !p.date);
    if (bad) throw new Error(`${bad.where}: ${bad.amount === null || bad.amount <= 0 ? "informe valor positivo (ou remova a linha)" : "informe o vencimento"}.`);
    const err = validateManualRemaining(remaining, checked, restLines.map(p => ({ amount: p.amount, date: p.date }))); if (err) throw new Error(err);
    if (!notes) return;
    // Recheck original records without rewriting planning through the financial editor.
    applyManaged(next, { ...input, plannedBaseDate:"baseDate" in initial.record ? initial.record.baseDate : null, parcels:initial.parcels, fields:initial.fields });
    effectivateBatch(next,{id:effId,plannedId:launch.id,at:new Date().toISOString(),by:user?.email??"",selected,notes:effNotes.map(n=>({...n,parcels:n.parcels.map(({selected:_s,...p})=>p)})),rest:restLines.map(({where:_w,...p})=>p),remaining,confirmed:checked,reason,scopeConfirmed,duplicateConfirmed,reference:refValue});

  };
  const prepare = () => { try { const started=performance.now(); const next=produce(d,next=>{build(next); if(saveCondition)saveSupplierCondition(next,fields.supplierId,saveCondition.terms,new Date().toISOString(),saveCondition.name,user?.email??'',saveCondition.from); if(localSuppliers.length)next.suppliers=next.suppliers.filter(s=>!localSuppliers.some(l=>l.id===s.id) || s.id===fields.supplierId);}); setReview({ before:active.data, data:next }); measureSavePhase('review',started); setError(""); } catch(e) { setError((e as Error).message); } };
  const table = (ps: ManagedParcel[], effective = false) => <table className="tbl vertical-parcels" aria-label={effective ? "Parcelas reais" : "Parcelas previstas"}><thead><tr>{!real && <th>Selecionar</th>}<th>Parcela</th><th>Número do boleto</th><th>Valor</th><th>Vencimento</th><th>Prorrogar para</th><th>Situação / ações</th></tr></thead><tbody>{ps.map(p => <tr key={p.key} className={p.key===launch.parcel ? "launch-focus" : ""}>
    {!real && <td><input type="checkbox" aria-label={`Selecionar parcela ${p.label}`} checked={selected.includes(p.key)} disabled={!canEdit || !eligible.some(e=>e.key===p.key)} onChange={e=>setSelected(e.target.checked ? [...selected,p.key] : selected.filter(k=>k!==p.key))}/></td>}
    <td>{p.label}<small className="block">{initialRows.some(b=>b.key===p.key) ? zeroGeneric.includes(p) ? "R$ 0,00 · substituída pelo detalhamento das notas" : "ID preservado" : "Nova linha"}</small></td>
    <td><input className="inp w-full" aria-label={`Número do boleto parcela ${p.label}`} disabled={!canEdit} value={p.boletoNumber ?? ""} onChange={e=>patch(p.key,{boletoNumber:e.target.value || null},effective)}/></td>
    <td><fieldset disabled={!canEdit || p.paid>0 || p.status==="cancelado"}><MoneyInput value={p.amount} onChange={amount=>patch(p.key,{amount},effective)}/></fieldset></td>
    <td><fieldset disabled={!canEdit || p.paid>0 || p.status==="cancelado"}><DateInput value={p.date} onChange={date=>patch(p.key,{date},effective)}/></fieldset></td>
    <td><fieldset disabled={!canEdit || p.paid>0 || p.status==="cancelado"}><DateInput allowEmpty value={p.extension} onChange={extension=>patch(p.key,{extension},effective)}/></fieldset></td>
    <td>{p.status==="cancelado" ? `Cancelada · original ${fmtBRL(p.original)}` : <Button variant="outline" disabled={!canEdit || p.paid>0} onClick={()=>remove(p,effective)}>{effective || !initial.parcels.some(b=>b.key===p.key) ? "Remover linha" : "Cancelar parcela"}</Button>}</td>
  </tr>)}</tbody></table>;
  const history = active.isBase ? audit.map(a => ({ at: a.at, user: a.user_email ?? "", changes: a.changes })) : allSims.find(s=>s.id===active.id)?.history ?? [];
  return <SidePanel expanded title={review ? "Revisar lançamento" : real ? "Adicionar notas fiscais a este pedido" : "Editar planejamento"} sub={`${supplierIdentity(d, initial.record).name} · Pedido ${fields.purchaseCode || "Não informado"}`} dirty={false} onClose={()=>void discard()} footer={<>{review && <Button variant="outline" disabled={saving.saving} onClick={()=>{if(saving.reset())setReview(null);}}>Voltar</Button>}<Button variant="outline" disabled={saving.saving} onClick={()=>void discard()}>Cancelar</Button><Button disabled={!canEdit || !dirty || saving.saving} onClick={review ? async ()=>{ if(await saving.save(review.before,review.data)) {protection.clear();onClose();} } : prepare}>{saving.saving ? "Salvando…" : review ? active.isBase ? "Confirmar e salvar" : "Confirmar na simulação" : real ? "Revisar alterações" : "Revisar e salvar"}</Button></>}>
      {protection.recovered && <p role="status">Preenchimento local recuperado · revise e confirme novamente antes de salvar.</p>}
      {protection.warning && <p role="alert" className="text-destructive">{protection.warning}</p>}
    {saving.error && <p role="alert" className="text-destructive">{saving.error}</p>}
    {error && <p ref={errRef} tabIndex={-1} role="alert" className="text-destructive">{error}</p>}
    {review ? <>
      <p>Pedido {fields.purchaseCode || "Não informado"} · Documento do planejamento <b>{fields.document || "Não informado"}</b></p>
      {total!==initial.record.value && <p>Valor previsto: {fmtBRL(initial.record.value)} → {fmtBRL(total)}. A referência histórica comprovada não muda.</p>}
      {"baseDate" in initial.record && baseDate!==initial.record.baseDate && <p>Data base: {fmtDate(initial.record.baseDate)} → {fmtDate(baseDate)}. Vencimentos mudam somente nas parcelas indicadas abaixo.</p>}
      {localSuppliers.filter(s=>s.id===fields.supplierId).map(s=><p key={s.id}>Cadastrar fornecedor <b>{s.name}</b> junto desta operação; cancelar não cria cadastro.</p>)}
      {saveCondition && <p>Cadastrar condição <b>{saveCondition.name}</b> junto desta operação; lançamentos existentes preservados.</p>}
      <table className="tbl"><thead><tr><th>Parcela / escopo</th><th>Valor antes → depois</th><th>Data antes → depois</th><th>Número do boleto antes → depois</th><th>Ação</th></tr></thead><tbody>{rows.filter(p=>JSON.stringify(p)!==JSON.stringify(initial.parcels.find(b=>b.key===p.key)) || selected.includes(p.key) || zeroGeneric.includes(p)).map(p=>{const b=initial.parcels.find(b=>b.key===p.key);return <tr key={p.key}><td>{p.label}</td><td>{fmtBRL(b?.amount)} → {fmtBRL(p.status==="cancelado" ? 0 : p.amount)}</td><td>{fmtDate(b?.extension??b?.date)} → {fmtDate(p.extension??p.date)}</td><td>{b?.boletoNumber || "Não informado"} → {p.boletoNumber || "Não informado"}</td><td>{real && selected.includes(p.key) ? "Substituída por nota efetivada" : zeroGeneric.includes(p) ? "Linha genérica R$ 0,00 substituída pelo detalhamento das notas (sem obrigação; histórico preservado)" : !b ? "Nova" : p.status==="cancelado" ? "Cancelada" : JSON.stringify(p)===JSON.stringify(b) ? "Não afetada" : "Alterada"}</td></tr>})}</tbody></table>
      {notes && <Section title="Resumo final da operação"><table className="tbl" aria-label="Resumo final"><tbody>
        <tr><td>Valor de referência</td><td>{refValue===null ? "Não informado" : fmtBRL(refValue)}</td></tr>
        <tr><td>Efetivado anterior vinculado</td><td>{fmtBRL(priorTotal)}</td></tr>
        <tr><td>Efetivar agora</td><td>{effNotes.length ? effNotes.map(n=>`NF ${n.document} · ${n.parcels.length} parcela(s) · ${fmtBRL(n.total)}`).join("; ") : "Nenhuma (notas salvas como planejadas)"}</td></tr>
        <tr><td>Permanecem planejadas com nota</td><td>{restNotes} nota(s) · {heldParcels.length} parcela(s) · {fmtBRL(heldTotal)}</td></tr>
        <tr><td>Saldo planejado sem nota</td><td>{fmtBRL(sum(restGeneric))} · {restGeneric.length} linha(s){zeroGeneric.length ? ` · ${zeroGeneric.length} linha(s) genérica(s) R$ 0,00 substituída(s) pelo detalhamento` : ""}</td></tr>
        <tr><td>Pagamento</td><td>{fmtBRL(0)} (efetivar não paga)</td></tr>
        <tr><td><b>Total do pedido após a operação</b></td><td><b>{fmtBRL(priorTotal+realTotal+restSum)}</b></td></tr>
      </tbody></table></Section>}
      {notes && <><p><b>Efetivar agora: {effNotes.length} nota(s) · {effNotes.reduce((s,n)=>s+n.parcels.length,0)} parcela(s) · {fmtBRL(realTotal)}</b>{heldParcels.length ? ` · ${heldParcels.length} parcela(s) de nota permanecem planejadas` : ""}</p>{effNotes.map(n=><Section key={n.id} title={`Nota ${n.document} · ${fmtBRL(n.total)}`}><p>Efetivação {fmtDate(n.effectiveDate)} · Base dos prazos {fmtDate(n.baseDate)} · {n.condition?.name || "Manual"}</p><table className="tbl"><thead><tr><th>Parcela</th><th>Número do boleto</th><th>Valor</th><th>Vencimento original</th><th>Prorrogação</th></tr></thead><tbody>{n.parcels.map((p,i)=><tr key={p.id}><td>{p.parcelNo ?? i+1}/{p.parcelCount ?? n.parcels.length}</td><td>{p.boletoNumber || "Não informado"}</td><td>{fmtBRL(p.amount)}</td><td>{fmtDate(p.date)}</td><td>{fmtDate(p.extension)}</td></tr>)}</tbody></table></Section>)}<Section title="Comparação do pedido"><p>Valor de referência {refValue===null ? "Não informado" : fmtBRL(refValue)}{initial.record.value!==refValue && refValue!==null ? " (revisão informada neste rascunho)" : ""} · Efetivado anterior {fmtBRL(priorTotal)} · Novas notas {fmtBRL(realTotal)} · Acumulado {fmtBRL(priorTotal+realTotal)} · Restante manual {fmtBRL(remaining)} · Total atual {fmtBRL(priorTotal+realTotal+plannedTotal)} · Diferença {refValue===null ? "Não comparável" : fmtBRL(priorTotal+realTotal+(remaining??plannedTotal)-refValue)}{preview.excess ? ` · Excedente ${fmtBRL(preview.excess)} (não gera previsão negativa)` : ""}. Não registra pagamento.</p></Section></>}

      {JSON.stringify(fields)!==JSON.stringify(initial.fields) && <p>Dados compartilhados do planejamento: {Object.keys(fields).filter(k=>fields[k as keyof typeof fields]!==initial.fields[k as keyof typeof fields]).map(k=>`${({supplierId:"Fornecedor",categoryId:"Subgrupo",purchaseCode:"Pedido",document:"Documento",notes:"Descrição"})[k as keyof typeof fields]}: ${k==="supplierId" ? supplierIdentity(d,{supplierId:initial.fields.supplierId}).name : k==="categoryId" ? d.categories.find(c=>c.id===initial.fields.categoryId)?.name || "Não informado" : initial.fields[k as keyof typeof fields] || "Não informado"} → ${k==="supplierId" ? supplierIdentity(d,{supplierId:fields.supplierId}).name : k==="categoryId" ? d.categories.find(c=>c.id===fields.categoryId)?.name || "Não informado" : fields[k as keyof typeof fields] || "Não informado"}`).join("; ")}.</p>}
      <p>Justificativa: {reason}. A confirmação salva somente esta operação revisada. Outras pendências não são incluídas.</p>
    </> : <>
      {real ? <>
        <div className="eff-summary" aria-label="Resumo do pedido">
          <span>Valor previsto / referência <b>{refValue===null ? "Não informado" : fmtBRL(refValue)}</b>{initial.record.value===0 && refValue!==null && <small> · digitado neste rascunho</small>}</span>
          <span>Já efetivado vinculado <b>{fmtBRL(priorTotal)}</b>{!linked.length && <small className="text-warning-foreground"> · nenhum vínculo comprovado (não prova inexistência; confira em Consultas)</small>}</span>
          <span>Selecionado agora <b>{fmtBRL(realTotal)}</b> <small>({effNotes.length} nota(s) · {effNotes.reduce((s,n)=>s+n.parcels.length,0)} parcela(s))</small></span>
          <span>Restante planejado (prévia) <b>{preview.remaining===null ? "Não disponível" : fmtBRL(preview.remaining)}</b>{checked && remaining!==null ? <small> · confirmado {fmtBRL(remaining)}</small> : <small className="text-warning-foreground"> · não confirmado</small>}</span>
          {!!preview.excess && <span className="text-warning-foreground">Excedente <b>+{fmtBRL(preview.excess)}</b></span>}
          <span>Efetivado a pagar <b>{fmtBRL(priorUnpaid+realTotal)}</b> <small>(consumir previsão ≠ pagar)</small></span>
        </div>
        <Section n={1} title={selected.length ? `Notas fiscais · substituem ${selected.length} parcela(s) planejada(s) selecionada(s)` : "Notas fiscais do pedido"}><EffectivationNotes d={d} supplierId={initial.fields.supplierId} purchaseCode={fields.purchaseCode} notes={notes??[]} disabled={!canEdit} onChange={changeNotes} onAdd={()=>changeNotes([...(notes??[]),newNote()])}/></Section>
        {scopeNeeded && <label className="flex gap-2 text-warning-foreground"><input type="checkbox" checked={scopeConfirmed} onChange={e=>setScopeConfirmed(e.target.checked)}/>{refValue===null ? "Pedido sem valor de referência: conferi as notas informadas." : initial.record.status==="encerrado" ? "Pedido já encerrado: conferi a inclusão destas notas." : `Conferi o excedente de ${fmtBRL(preview.excess)} acima do valor previsto.`}</label>}
        {!!duplicates.length && <label className="flex gap-2 text-warning-foreground"><input type="checkbox" checked={duplicateConfirmed} onChange={e=>setDuplicateConfirmed(e.target.checked)}/>Conferi documento potencialmente duplicado neste fornecedor: {duplicates.join(", ")}. São notas distintas (incluindo série quando pertinente).</label>}
        <Section n={2} title="O que continuará em Planejada"><p className="text-sm">{restLines.length} linha(s) restante(s) · soma {fmtBRL(plannedTotal)}{heldParcels.length ? ` (${restNotes} nota(s) · ${heldParcels.length} parcela(s) com NF identificada ${fmtBRL(heldTotal)}; sem nota ${fmtBRL(sum(restGeneric))})` : ""}{zeroGeneric.length ? ` · ${zeroGeneric.length} linha(s) genérica(s) R$ 0,00 substituída(s) pelo detalhamento, sem obrigação` : ""} · prévia {preview.remaining===null ? "Não disponível" : fmtBRL(preview.remaining)}{preview.remaining!==null && preview.remaining!==plannedTotal ? <b className="text-warning-foreground"> · diferença {fmtBRL(plannedTotal-preview.remaining)} {plannedTotal>preview.remaining ? "acima" : "abaixo"} da prévia: ajuste as parcelas ou confirme o restante informado</b> : null}</p><details><summary>Editar parcelas restantes</summary>{table(rows.filter(p=>!selected.includes(p.key)))}<Button variant="outline" onClick={()=>add()}>+ Adicionar parcela planejada</Button></details>
          <details className="mt-2"><summary>Sugestões para o restante (aplicação somente explícita)</summary><div className="space-y-2 mt-2"><Field l="Sugestão para o restante"><select className="inp" value={mode} onChange={e=>setMode(e.target.value as Suggestion)}><option value="manter">Manter valores previstos restantes</option><option value="igualar">Igualar cada restante ao total efetivado (uma origem)</option><option value="diferenca">Aplicar diferença também às restantes</option><option value="total">Manter total original</option></select></Field><p>{suggestion.error || `${mode==="manter" ? "Restaura os valores de origem restantes" : mode==="igualar" ? `${rest.length} restantes × ${fmtBRL(realTotal)}` : mode==="diferenca" ? `Restante de origem − (${fmtBRL(substituted)} − ${fmtBRL(realTotal)})` : `${fmtBRL(original)} − ${fmtBRL(realTotal)}`} = ${fmtBRL(suggestion.total)}; total após alteração ${fmtBRL(suggestion.total+realTotal)}. Datas preservadas; divisão com resíduo na última quando aplicável.`}</p><Button variant="outline" disabled={!!suggestion.error} onClick={()=>{setRows(ps=>ps.map(p=>{const s=suggestion.result.find(s=>s.id===p.key);return s ? {...p,amount:s.amount} : p;}));setChecked(false);setRemaining(null);}}>Aplicar sugestão</Button></div></details>
          <div className="flex flex-wrap gap-2 items-end mt-2"><Field l="Saldo restante previsto (confirmação manual)"><MoneyInput value={remaining} onChange={v=>{setRemaining(v);setChecked(false);}}/></Field><Button variant="outline" disabled={preview.remaining===null} onClick={()=>{setRemaining(preview.remaining);setChecked(false);}}>Usar prévia</Button><Button variant="outline" disabled={preview.remaining===null || !rest.length || preview.remaining===0} onClick={()=>{const target=(preview.remaining??0)-heldTotal;if(target<=0){setError("Parcelas de notas não selecionadas já cobrem a prévia; nada a distribuir nas linhas sem nota.");return;}const {parts}=splitCents(target,rest.length);setRows(ps=>ps.map(p=>{const i=rest.findIndex(r=>r.key===p.key);return i<0 ? p : {...p,amount:parts[i]??p.amount};}));setRemaining(preview.remaining);setChecked(false);}}>Distribuir prévia nas restantes (datas mantidas)</Button></div>{restMismatch && <p className="text-destructive">As parcelas restantes somam {fmtBRL(plannedTotal)} e o restante informado é {fmtBRL(remaining)}; ajuste antes de revisar.</p>}<label className="flex gap-2"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Conferi o total restante e todas as datas; R$ 0,00 encerra expressamente o restante.</label>
        </Section>
        <Button variant="outline" onClick={()=>{setShowNotes(false);setChecked(false);}}>Voltar à edição do planejamento (notas ficam no rascunho)</Button>
      </> : <>
        <Section title="Dados gerais"><p className="mb-3 text-warning-foreground">Campos compartilhados afetam este planejamento e suas parcelas, não notas já efetivadas nem outras notas do pedido. Datas base e condição só geram novas datas por ação explícita.</p><fieldset disabled={!canEdit} className="grid gap-3 md:grid-cols-2"><CatSubFields d={d} kind={kind} categoryId={fields.categoryId} onChange={(kind,categoryId)=>{setKind(kind);setFields({...fields,categoryId});}}/><Field full l="Fornecedor"><SupplierSearch d={d} existing allowCreate onCreate={s=>setLocalSuppliers(xs=>[...xs,s])} value={fields.supplierId} onChange={supplierId=>setFields({...fields,supplierId})}/></Field><Field l="Código do pedido"><input className="inp" value={fields.purchaseCode} onChange={e=>setFields({...fields,purchaseCode:e.target.value})}/></Field><Field l="Documento"><input className="inp" value={fields.document} onChange={e=>setFields({...fields,document:e.target.value})}/></Field><Field full l="Descrição"><input className="inp" value={fields.notes} onChange={e=>setFields({...fields,notes:e.target.value})}/></Field><Field l="Valor total previsto"><MoneyInput value={total} onChange={setTotal}/></Field><Field l="Data base para os prazos"><DateInput value={baseDate} onChange={setBaseDate}/></Field></fieldset></Section>
        <Section title="Condição de pagamento"><details><summary>Condição de pagamento — aplicar somente por escolha explícita</summary>{d.suppliers.some(s=>s.id===fields.supplierId) ? <ConditionPicker d={d} supplierId={fields.supplierId} baseDate={baseDate} disabled={!baseDate || total===null || total<=0} onConfirm={(c,save)=>{if(total===null || !baseDate)return;setSaveCondition(save);const gen=generateParcels(total-priorTotal-sum(heldRows),baseDate,c.terms);const current=rows.filter(p=>p.status!=="cancelado");if(gen.length<current.length){setError("Cancele expressamente as parcelas excedentes antes de aplicar esta condição.");return;}setRows([...rows.map(p=>{const i=current.findIndex(r=>r.key===p.key),g=gen[i];return g ? {...p,amount:g.amount,date:g.date,extension:g.ext} : p;}),...gen.slice(current.length).map((p,i)=>({key:`new-${uid()}`,id:launch.id,label:`${rows.length+i+1} (nova)`,original:0,amount:p.amount,date:p.date,extension:p.ext,status:"ativo",paid:0}))]);setChecked(false);setError("");}}/> : <p>Sem fornecedor cadastrado vinculado; preencha manualmente.</p>}</details></Section>
        <Button disabled={!canEdit || initial.record.status==="cancelado"} onClick={()=>start(fields.document ? rows.map(p=>p.key) : [],false)}>{allNotes?.length ? `Voltar às notas fiscais (${allNotes.length} no rascunho)` : "Adicionar nota fiscal a este pedido"}</Button>
        <Section title="Parcelas previstas"><div className="flex flex-wrap gap-2 mb-3"><Button variant="outline" onClick={()=>setSelected(eligible.map(p=>p.key))}>Selecionar todas as planejadas</Button><Button variant="outline" onClick={()=>setSelected([])}>Limpar seleção</Button><span>{selected.length}/{eligible.length} selecionadas</span><Button disabled={!canEdit || !selected.length} onClick={()=>start(selected,true)}>Efetivar {selected.length} parcela(s) selecionada(s)</Button><Button variant="outline" disabled={!canEdit || !eligible.length} onClick={()=>start(eligible.map(p=>p.key),true)}>Efetivar documento inteiro</Button></div>{table(rows)}<div className="flex flex-wrap gap-2 mt-3"><Button variant="outline" disabled={!canEdit} onClick={()=>add()}>+ Adicionar parcela</Button><Button variant="outline" disabled={!canEdit || total===null || !eligible.length} onClick={()=>{const last=eligible.at(-1);if(last && total!==null)patch(last.key,{amount:(last.amount??0)+total-priorTotal-plannedTotal});}}>Ajustar diferença na última parcela</Button><Button variant="destructive" disabled={!canEdit} onClick={()=>{setRows(ps=>ps.map(p=>({...p,status:"cancelado"})));setTotal(0);setChecked(false);}}>Cancelar planejamento</Button></div></Section>
        <Section title="Resumo"><p>Total previsto atual {fmtBRL(total)} · Já efetivado {fmtBRL(priorTotal)} · Ainda planejado {fmtBRL(plannedTotal)} · Diferença {fmtBRL(total===null ? null : total-priorTotal-plannedTotal)}</p></Section>
      </>}
      <Field l="Justificativa"><textarea className="inp" value={reason} onChange={e=>setReason(e.target.value)}/></Field>
      <details><summary>Notas já efetivadas vinculadas ({linked.length} parcelas)</summary><table className="tbl"><thead><tr><th>Documento / nota</th><th>Pedido</th><th>Parcela</th><th>Número do boleto</th><th>Valor</th><th>Vencimento</th><th>Situação</th></tr></thead><tbody>{linked.map(c=><tr key={c.id}><td>{c.document}</td><td>{c.purchaseCode || "Não informado"}</td><td>{c.parcelNo ? `${c.parcelNo}/${c.parcelCount}` : c.id}</td><td>{c.boletoNumber || "Não informado"}</td><td>{fmtBRL(c.value)}</td><td>{fmtDate(c.extensionDate??c.dueDate)}</td><td>{titleStatus(c.value,c.status,paymentsFor(d,"committed",c.id)).state}</td></tr>)}</tbody></table>{!linked.length && <p>Nenhuma nota com vínculo comprovado.</p>}</details>
      <details><summary>Comparativo e histórico do planejamento</summary><PlanVsActualDetail d={d} plannedId={launch.id} /><HistoryView data={d} entries={history.map(a=>({...a,changes:a.changes.filter(c=>c.id===launch.id)}))}/></details>
    </>}
  </SidePanel>;
}