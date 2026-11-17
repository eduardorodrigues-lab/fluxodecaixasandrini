import { useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/dates";
import { Button } from "./ui/button";
import { ConditionPicker } from "./NotaPanel";
import { DateInput, MoneyInput } from "./kit";
import { generateParcels } from "@/lib/notas";
import { splitCents } from "@/lib/engine/engine";
import { uid } from "@/lib/store";
import { fmtBRL } from "@/lib/money";
import type { ScenarioData } from "@/lib/engine/types";
import type { BatchNote } from "@/lib/efetivacao";

/** Notes side by side: each note is an independent panel in a horizontal strip. */
export function EffectivationNotes({d,supplierId,purchaseCode,notes,onChange,onAdd,disabled}: {d:ScenarioData;supplierId:string;purchaseCode?:string;notes:BatchNote[];onChange:(notes:BatchNote[])=>void;onAdd:()=>void;disabled:boolean}) {
  const strip = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"cards"|"lista">("cards");
  const isSel = (p:{selected?:boolean}) => p.selected!==false;
  const status = (n:BatchNote) => { const k=n.parcels.filter(isSel).length; const saved = !!n.parcels.length && n.parcels.every(p=>p.parcelNo!==undefined); return !n.parcels.length || !k ? saved ? "Planejada (salva)" : "Planejada (rascunho)" : k===n.parcels.length ? "Efetivar agora (rascunho)" : "Parcialmente efetivada (rascunho)"; };
  const setParcel = (n:BatchNote, id:string, v:{selected:boolean}) => patch(n.id,{parcels:n.parcels.map(x=>x.id===id?{...x,...v}:x)});
  const setNoteSel = (n:BatchNote, selected:boolean) => patch(n.id,{parcels:n.parcels.map(x=>({...x,selected}))});
  const head = (n:BatchNote, i:number) => { const k=n.parcels.filter(isSel).length; return <input type="checkbox" aria-label={`Selecionar todas as parcelas da nota ${n.document || i+1}`} checked={!!n.parcels.length && k===n.parcels.length} ref={el=>{if(el)el.indeterminate=k>0&&k<n.parcels.length;}} onChange={e=>setNoteSel(n,e.target.checked)}/>; };
  const count = useRef(notes.length);
  useEffect(() => {
    if (notes.length > count.current) {
      const last = strip.current?.querySelector<HTMLElement>(".eff-note:last-of-type");
      last?.scrollIntoView({behavior:"smooth",inline:"end",block:"nearest"});
      last?.querySelector<HTMLInputElement>("input")?.focus({preventScroll:true});
    }
    count.current = notes.length;
  }, [notes.length]);
  const patch = (id:string, value:Partial<BatchNote>) => onChange(notes.map(n => n.id === id ? {...n,...value} : n));
  const scroll = (dir:number) => strip.current?.scrollBy({left:dir*strip.current.clientWidth*0.8,behavior:"smooth"});
  return <div className="eff-notes">
    <div className="eff-notes-bar"><span>{notes.length} nota(s) no rascunho · role horizontalmente para ver todas</span>
      <span className="flex gap-2"><span className="eff-view" role="group" aria-label="Visão"><Button size="sm" variant={view==="cards"?"default":"outline"} aria-pressed={view==="cards"} onClick={()=>setView("cards")}>Cards</Button><Button size="sm" variant={view==="lista"?"default":"outline"} aria-pressed={view==="lista"} onClick={()=>setView("lista")}>Lista completa</Button></span><Button variant="outline" size="sm" aria-label="Notas anteriores" onClick={()=>scroll(-1)}>‹</Button><Button variant="outline" size="sm" aria-label="Próximas notas" onClick={()=>scroll(1)}>›</Button><Button size="sm" disabled={disabled} onClick={onAdd}>+ Adicionar outra nota</Button></span></div>
    {view==="lista" && <div className="overflow-x-auto"><table className="tbl eff-list" aria-label="Lista completa de notas e parcelas"><thead><tr><th>Efetivar</th><th>Pedido</th><th>Nota fiscal</th><th>Número do boleto</th><th>Parcela</th><th>Valor</th><th>Vencimento original</th><th>Prorrogação</th><th>Situação</th></tr></thead><tbody>{notes.flatMap((n,i)=>n.parcels.map((p,j)=><tr key={p.id}><td>{j===0 ? <span className="flex gap-1">{head(n,i)}<input type="checkbox" aria-label={`Selecionar nota ${n.document || i+1} parcela ${j+1}`} checked={isSel(p)} disabled={disabled} onChange={e=>setParcel(n,p.id,{selected:e.target.checked})}/></span> : <input type="checkbox" aria-label={`Selecionar nota ${n.document || i+1} parcela ${j+1}`} checked={isSel(p)} disabled={disabled} onChange={e=>setParcel(n,p.id,{selected:e.target.checked})}/>}</td><td>{purchaseCode || "Não informado"}</td><td>{n.document || <i>Nota {i+1} sem número</i>}</td><td>{p.boletoNumber || "—"}</td><td>{p.parcelNo ?? j+1}/{p.parcelCount ?? n.parcels.length}</td><td>{fmtBRL(p.amount)}</td><td>{fmtDate(p.date)}</td><td>{fmtDate(p.extension)}</td><td>{isSel(p) ? "Efetivar agora" : "Permanece planejada"}</td></tr>))}</tbody></table>{!notes.some(n=>n.parcels.length) && <p>Nenhuma parcela nas notas do rascunho.</p>}<p className="text-xs">Edite valores e datas na visão Cards; seleção é a mesma nas duas visões.</p></div>}
    <div ref={strip} className="eff-notes-strip" hidden={view!=="cards"}>{notes.map((n,i) => {
      const sum = n.parcels.reduce((s,p)=>s+(p.amount??0),0);
      return <section key={n.id} className="eff-note" aria-label={`Nova nota ${i+1}`}>
        <fieldset disabled={disabled} className="space-y-2">
          <header className="eff-note-head"><span className="eff-note-tag">{head(n,i)} Nota {i+1}<small className="block font-normal">{status(n)}</small></span>
            <input aria-label={`Documento da nota ${i+1}`} placeholder="Nº da nota fiscal" className="inp font-semibold" value={n.document} onChange={e=>patch(n.id,{document:e.target.value})}/>
            <Button variant="ghost" size="sm" onClick={()=>onChange(notes.filter(x=>x.id!==n.id))}>Remover nota</Button></header>
          <div className="eff-note-grid">
            <label><span>Total da nota</span><MoneyInput value={n.total} onChange={total=>patch(n.id,{total})}/></label>
            <label><span>Data de efetivação</span><DateInput value={n.effectiveDate} onChange={effectiveDate=>patch(n.id,{effectiveDate})}/></label>
            <label><span>Data base dos prazos</span><DateInput value={n.baseDate} onChange={baseDate=>patch(n.id,{baseDate})}/></label>
          </div>
          <details open={!n.condition}><summary>{n.condition ? `Condição usada: ${n.condition.name} · alterar` : "Condição desta nota · gerar parcelas"}</summary>
            {d.suppliers.some(s=>s.id===supplierId) ? <ConditionPicker allowSave={false} d={d} supplierId={supplierId} baseDate={n.baseDate} disabled={n.total===null || n.total<=0 || !n.baseDate} onConfirm={c=>{if(n.total===null || !n.baseDate)return;patch(n.id,{condition:structuredClone(c),parcels:generateParcels(n.total,n.baseDate,c.terms).map(p=>({id:`title-${uid()}`,amount:p.amount,date:p.date,extension:p.ext}))});}}/> : <p>Sem fornecedor cadastrado; preencha as parcelas manualmente.</p>}
          </details>
          <table className="tbl eff-note-tbl" aria-label={`Parcelas da nota ${i+1}`}><thead><tr><th aria-label="Efetivar agora">Efetivar</th><th>Número do boleto</th><th>Parcela</th><th>Valor</th><th>Vencimento original</th><th>Prorrogar para</th><th aria-label="Ação"></th></tr></thead><tbody>{n.parcels.map((p,j)=>{
            const parcel = (v:Partial<typeof p>) => patch(n.id,{parcels:n.parcels.map(x=>x.id===p.id?{...x,...v}:x)});
            return <tr key={p.id}><td><input type="checkbox" aria-label={`Efetivar nota ${i+1} parcela ${j+1}`} checked={isSel(p)} onChange={e=>parcel({selected:e.target.checked})}/></td><td><input className="inp w-full" placeholder="Opcional" aria-label={`Boleto nota ${i+1} parcela ${j+1}`} value={p.boletoNumber ?? ""} onChange={e=>parcel({boletoNumber:e.target.value || null})}/></td><td>{p.parcelNo ?? j+1}/{p.parcelCount ?? n.parcels.length}</td><td><MoneyInput value={p.amount} onChange={amount=>parcel({amount})}/></td><td><DateInput value={p.date} onChange={date=>parcel({date})}/></td><td><DateInput allowEmpty value={p.extension} onChange={extension=>parcel({extension})}/></td><td><Button variant="ghost" size="sm" aria-label={`Remover parcela ${j+1} da nota ${i+1}`} onClick={()=>patch(n.id,{parcels:n.parcels.filter(x=>x.id!==p.id)})}>✕</Button></td></tr>;
          })}</tbody></table>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>patch(n.id,{parcels:[...n.parcels,{id:`title-${uid()}`,amount:null,date:null,extension:null}]})}>+ Adicionar parcela</Button>
            <Button variant="outline" size="sm" disabled={n.total===null || !n.parcels.length} onClick={()=>{if(n.total===null)return;const {parts}=splitCents(n.total,n.parcels.length);patch(n.id,{parcels:n.parcels.map((p,j)=>({...p,amount:parts[j] ?? null}))});}}>Ratear total</Button></div>
          <p className="eff-note-sum">Selecionado agora {fmtBRL(n.parcels.filter(isSel).reduce((s,p)=>s+(p.amount??0),0))} · Soma {fmtBRL(sum)} · diferença <b className={n.total!==null && n.total!==sum ? "text-warning-foreground" : ""}>{fmtBRL(n.total===null ? null : n.total-sum)}</b></p>
        </fieldset>
      </section>;})}</div>
  </div>;
}
