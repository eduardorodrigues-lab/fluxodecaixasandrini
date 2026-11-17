import { Button } from "./ui/button";
import { ConditionPicker, Field } from "./NotaPanel";
import { DateInput, MoneyInput } from "./kit";
import { generateParcels } from "@/lib/notas";
import { splitCents } from "@/lib/engine/engine";
import { uid } from "@/lib/store";
import { fmtBRL } from "@/lib/money";
import type { ScenarioData } from "@/lib/engine/types";
import type { BatchNote } from "@/lib/efetivacao";

export function EffectivationNotes({d,supplierId,notes,onChange,disabled}: {d:ScenarioData;supplierId:string;notes:BatchNote[];onChange:(notes:BatchNote[])=>void;disabled:boolean}) {
  const patch = (id:string, value:Partial<BatchNote>) => onChange(notes.map(n => n.id === id ? {...n,...value} : n));
  return <div className="space-y-3">{notes.map((n,i) => <details key={n.id} open className="border-b pb-3" aria-label={`Nova nota ${i+1}`}>
    <summary className="font-semibold">Nota {i+1} · {n.document || "Documento não informado"} · {fmtBRL(n.total)}</summary>
    <fieldset disabled={disabled} className="space-y-3 pt-3">
      <Field l="Número do documento / nota fiscal"><input aria-label={`Documento da nota ${i+1}`} className="inp font-semibold" value={n.document} onChange={e=>patch(n.id,{document:e.target.value})}/></Field>
      <Field l="Valor total da nota"><MoneyInput value={n.total} onChange={total=>patch(n.id,{total})}/></Field>
      <Field l="Data de efetivação"><DateInput value={n.effectiveDate} onChange={effectiveDate=>patch(n.id,{effectiveDate})}/></Field>
      <Field l="Data base para os prazos desta nota"><DateInput value={n.baseDate} onChange={baseDate=>patch(n.id,{baseDate})}/></Field>
      <details><summary>Condição como sugestão / preenchimento manual</summary>
        {d.suppliers.some(s=>s.id===supplierId) && <ConditionPicker allowSave={false} d={d} supplierId={supplierId} baseDate={n.baseDate} disabled={n.total===null || n.total<=0 || !n.baseDate} onConfirm={c=>{if(n.total===null || !n.baseDate)return;patch(n.id,{condition:structuredClone(c),parcels:generateParcels(n.total,n.baseDate,c.terms).map(p=>({id:`title-${uid()}`,amount:p.amount,date:p.date,extension:p.ext}))});}}/>}
      </details>
      {n.condition && <p>Condição usada: {n.condition.name} · vencimentos conferidos prevalecem.</p>}
      <table className="tbl vertical-parcels" aria-label={`Parcelas da nota ${i+1}`}><thead><tr><th>Parcela</th><th>Número do boleto</th><th>Valor</th><th>Vencimento original</th><th>Prorrogar para</th><th>Ação</th></tr></thead><tbody>{n.parcels.map((p,j)=>{
        const parcel = (v:Partial<typeof p>) => patch(n.id,{parcels:n.parcels.map(x=>x.id===p.id?{...x,...v}:x)});
        return <tr key={p.id}><td>{j+1}/{n.parcels.length}</td><td><input className="inp w-full" aria-label={`Boleto nota ${i+1} parcela ${j+1}`} value={p.boletoNumber ?? ""} onChange={e=>parcel({boletoNumber:e.target.value || null})}/></td><td><MoneyInput value={p.amount} onChange={amount=>parcel({amount})}/></td><td><DateInput value={p.date} onChange={date=>parcel({date})}/></td><td><DateInput allowEmpty value={p.extension} onChange={extension=>parcel({extension})}/></td><td><Button variant="outline" onClick={()=>patch(n.id,{parcels:n.parcels.filter(x=>x.id!==p.id)})}>Remover</Button></td></tr>;
      })}</tbody></table>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>patch(n.id,{parcels:[...n.parcels,{id:`title-${uid()}`,amount:null,date:null,extension:null}]})}>+ Adicionar parcela real</Button>
      <Button variant="outline" disabled={n.total===null || !n.parcels.length} onClick={()=>{if(n.total===null)return;const {parts}=splitCents(n.total,n.parcels.length);patch(n.id,{parcels:n.parcels.map((p,j)=>({...p,amount:parts[j] ?? null}))});}}>Ratear total nas parcelas</Button>
      <Button variant="outline" onClick={()=>onChange(notes.filter(x=>x.id!==n.id))}>Remover nota do rascunho</Button></div>
      <p>Soma das parcelas {fmtBRL(n.parcels.reduce((s,p)=>s+(p.amount??0),0))} · diferença {fmtBRL(n.total===null ? null : n.total-n.parcels.reduce((s,p)=>s+(p.amount??0),0))}. Rateio: resíduo na última parcela.</p>
    </fieldset>
  </details>)}</div>;
}