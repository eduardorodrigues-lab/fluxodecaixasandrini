import {describe,it,expect} from "vitest";
import {emptyData} from "./engine/actions";
import {effectivateBatch,currentParcels,heldNotes,type BatchNote,type BatchInput,type RestLine} from "./efetivacao";
import {generateParcels} from "./notas";
import {planVsActual} from "./planVsActual";
import {managedDocument} from "./manageLaunch";
import type {ScenarioData} from "./engine/types";

// Fictitious fixture reproducing the reported case: order saved with 0, four generic 0-valued lines, reference typed 47.628,00.
function fixture(){const d=emptyData();d.suppliers=[{id:"s",name:"Fixture UZ",group:"",terms:[90,120,150,180]}];d.categories=[{id:"c",kind:"compra",name:"Mercadoria",group:""}];d.planned=[{id:"p",supplierId:"s",categoryId:"c",purchaseCode:"PED-F",document:"",value:0,baseDate:"2026-11-14",notes:"",status:"ativo",remainingOverride:null}];return d;}
const DOCS=["372798","372799","372800","372801","372803","372804","372805"];
const note=(doc:string,sel:boolean):BatchNote=>({id:`n-${doc}`,document:doc,total:680400,effectiveDate:"2026-11-17",baseDate:"2026-11-10",condition:{name:"30/60/90/120",terms:[30,60,90,120]} as BatchNote["condition"],parcels:generateParcels(680400,"2026-11-10",[30,60,90,120]).map((p,i)=>({id:`t-${doc}-${i+1}`,amount:p.amount,date:p.date,extension:doc==="372800"&&i===1 ? "2027-02-01" : null,boletoNumber:`B${doc}-${i+1}`,selected:sel}))});
// Mirrors the form: selected parcels → effectivated notes; unselected → remaining WITH note identification.
function split(notes:BatchNote[]){
  const eff=notes.map(n=>{const all=n.parcels.map((p,j)=>({...p,parcelNo:p.parcelNo??j+1,parcelCount:p.parcelCount??n.parcels.length}));const ps=all.filter(p=>p.selected!==false);return {...n,total:ps.length===n.parcels.length?n.total:ps.reduce((s,p)=>s+(p.amount??0),0),parcels:ps.map(({selected:_s,...p})=>p)};}).filter(n=>n.parcels.length);
  const rest:RestLine[]=notes.flatMap(n=>n.parcels.map((p,j)=>({p,j})).filter(({p})=>p.selected===false).map(({p,j})=>({id:p.id,origin:null,amount:p.amount,date:p.extension??p.date,boletoNumber:p.boletoNumber,note:{noteId:n.id,document:n.document,total:n.total??0,effectiveDate:n.effectiveDate,baseDate:n.baseDate,condition:n.condition,parcelNo:p.parcelNo??j+1,parcelCount:p.parcelCount??n.parcels.length,dueDate:p.date??"",extension:p.extension}})));
  return {eff,rest};
}
const inp=(notes:BatchNote[],id:string,extra:Partial<BatchInput>={}):BatchInput=>{const {eff,rest}=split(notes);return {id,plannedId:"p",at:"2026-11-17T15:00:00Z",by:"t",selected:[],notes:eff,rest,remaining:rest.reduce((s,p)=>s+(p.amount??0),0),confirmed:true,reason:"SOMENTE A NOTA 372798",scopeConfirmed:false,duplicateConfirmed:false,reference:4762800,...extra};};
const total=(d:ScenarioData)=>d.committed.filter(c=>c.status!=="cancelado").reduce((s,c)=>s+c.value,0)+(d.planned[0]!.remainingOverride?.value??0);

describe("Pedido 1852 (fictício): 7 notas, só NF 372798 efetivada, 4 linhas genéricas R$ 0,00",()=>{
  it("efetiva só 372798; 6 notas/24 parcelas ficam planejadas identificadas; linhas 0 não bloqueiam nem duplicam",()=>{
    const d=fixture(); const zeros=currentParcels(d,"p"); expect(zeros).toHaveLength(4); expect(zeros.every(z=>z.amount===0)).toBe(true);
    effectivateBatch(d,inp(DOCS.map((doc,i)=>note(doc,i===0)),"b1"));
    expect(d.committed).toHaveLength(4); expect(d.committed.every(c=>c.document==="372798"&&c.value===170100&&c.status==="ativo")).toBe(true);
    expect(d.committed.map(c=>`${c.parcelNo}/${c.parcelCount}`)).toEqual(["1/4","2/4","3/4","4/4"]); expect(d.payments??[]).toHaveLength(0);
    const pl=d.planned[0]!; const items=pl.remainingOverride!.items!;
    expect(pl.value).toBe(4762800); expect(items).toHaveLength(24); expect(pl.remainingOverride!.value).toBe(4082400);
    expect(new Set(items.map(i=>i.note!.document))).toEqual(new Set(DOCS.slice(1)));
    expect(items.every(i=>i.boletoNumber===`B${i.note!.document}-${i.note!.parcelNo}`)).toBe(true);
    const ext=items.find(i=>i.id==="t-372800-2")!; expect(ext.date).toBe("2027-02-01"); expect(ext.note!.dueDate).not.toBe("2027-02-01"); expect(ext.note!.extension).toBe("2027-02-01");
    expect(items.some(i=>zeros.some(z=>z.key===i.id))).toBe(false); // linhas genéricas 0 não persistem
    expect(pl.editLog!.at(-1)!.note).toContain("4 linha(s) genérica(s) R$ 0,00");
    expect(total(d)).toBe(4762800); expect(planVsActual(d)[0]!.diff).toBe(0);
    const doc=managedDocument(d,{kind:"planned",id:"p"}); expect(doc.parcels[0]!.label).toBe("NF 372799 · 1/4");
  });
  it("releitura: notas planejadas voltam com os mesmos IDs; efetivar depois uma delas não duplica",()=>{
    const d=fixture(); effectivateBatch(d,inp(DOCS.map((doc,i)=>note(doc,i===0)),"b1"));
    const held=heldNotes(d,"p"); expect(held).toHaveLength(6); expect(held.flatMap(n=>n.parcels)).toHaveLength(24);
    expect(held.every(n=>n.parcels.every(p=>p.selected===false))).toBe(true);
    const n799=held.find(n=>n.document==="372799")!; expect(n799.condition?.name).toBe("30/60/90/120"); expect(n799.baseDate).toBe("2026-11-10");
    const later=held.map(n=>n.id===n799.id?{...n,parcels:n.parcels.map(p=>({...p,selected:true}))}:n);
    effectivateBatch(d,inp(later,"b2"));
    expect(d.committed).toHaveLength(8); expect(d.committed.filter(c=>c.document==="372799").map(c=>c.id)).toEqual(n799.parcels.map(p=>p.id));
    expect(d.planned[0]!.remainingOverride!.items).toHaveLength(20); expect(d.effectivations.at(-1)!.substituted).toBe(680400);
    expect(total(d)).toBe(4762800);
  });
  it("parcial de 1 parcela conserva as demais com a NF; completar depois sem duplicidade",()=>{
    const d=fixture(); effectivateBatch(d,inp(DOCS.map((doc,i)=>note(doc,i===0)),"b1"));
    const held=heldNotes(d,"p"); const n=held.find(n=>n.document==="372801")!;
    effectivateBatch(d,inp(held.map(x=>x.id===n.id?{...x,parcels:x.parcels.map((p,j)=>({...p,selected:j===0}))}:x),"b2"));
    expect(d.committed.filter(c=>c.document==="372801").map(c=>`${c.parcelNo}/${c.parcelCount}`)).toEqual(["1/4"]);
    const again=heldNotes(d,"p").find(x=>x.id===n.id)!; expect(again.parcels.map(p=>p.parcelNo)).toEqual([2,3,4]);
    effectivateBatch(d,inp(heldNotes(d,"p").map(x=>x.id===n.id?{...x,parcels:x.parcels.map(p=>({...p,selected:true}))}:x),"b3"));
    expect(d.committed.filter(c=>c.document==="372801").map(c=>c.parcelNo)).toEqual([1,2,3,4]); expect(total(d)).toBe(4762800);
  });
  it("retry idempotente e falha não altera a base; parcela de nota sem valor continua bloqueada",()=>{
    const d=fixture(); const a=inp(DOCS.map((doc,i)=>note(doc,i===0)),"b1");
    const bad=structuredClone(a); bad.rest[0]!.amount=0; const snap=JSON.stringify(d);
    expect(()=>effectivateBatch(d,bad)).toThrow(); expect(JSON.stringify(d)).toBe(snap);
    effectivateBatch(d,a); effectivateBatch(d,structuredClone(a)); expect(d.committed).toHaveLength(4); expect(d.planned[0]!.remainingOverride!.items).toHaveLength(24);
  });
  it("salvar notas conhecidas sem efetivar: nenhuma efetivação, notas preservadas",()=>{
    const d=fixture(); effectivateBatch(d,inp(DOCS.map(doc=>note(doc,false)),"b0"));
    expect(d.committed).toHaveLength(0); expect(d.effectivations).toHaveLength(0);
    expect(heldNotes(d,"p")).toHaveLength(7); expect(d.planned[0]!.remainingOverride!.value).toBe(4762800);
  });
});

import {effectivateManual,adjustPlanned} from "./efetivacao";
import {effectivate,setPlannedRemaining} from "./engine/actions";
describe("Outros caminhos não apagam a identificação das notas planejadas",()=>{
  const saved=()=>{const d=fixture();effectivateBatch(d,inp(DOCS.map((doc,i)=>note(doc,i===0)),"b1"));return d;};
  it("Gerenciar/efetivação manual bloqueia parcela de NF planejada e preserva a nota nas demais",()=>{
    const d=saved(); const items=d.planned[0]!.remainingOverride!.items!;
    expect(()=>effectivateManual(d,{id:"m1",plannedId:"p",at:"x",effectiveDate:"2026-11-20",document:"",purchaseCode:"",selected:[items[0]!.id],eff:[{amount:170100,date:"2027-01-01"}],rest:items.slice(1).map(i=>({id:i.id,amount:i.amount,date:i.date})),substituted:170100,rule:"t"})).toThrow("Adicionar notas fiscais");
  });
  it("ajustar planejamento mantém a nota de cada parcela",()=>{
    const d=saved(); const items=d.planned[0]!.remainingOverride!.items!;
    adjustPlanned(d,"p",items.map(i=>({id:i.id,amount:i.amount,date:i.date})));
    expect(d.planned[0]!.remainingOverride!.items!.every(i=>i.note?.document)).toBe(true);
  });
  it("caminhos antigos que trocariam o restante por saldo genérico são bloqueados sem alterar dados",()=>{
    const d=saved(); const snap=JSON.stringify(d);
    expect(()=>setPlannedRemaining(d,"p",100,["2027-01-01"])).toThrow("Adicionar notas fiscais");
    expect(()=>effectivate(d,{id:"e1",plannedId:"p",at:"x",kind:"parcial",installments:[{value:100,date:"2027-01-01",document:"X"}],remaining:{value:0,dates:[]}} as Parameters<typeof effectivate>[1])).toThrow("Adicionar notas fiscais");
    expect(JSON.stringify(d)).toBe(snap);
  });
});
