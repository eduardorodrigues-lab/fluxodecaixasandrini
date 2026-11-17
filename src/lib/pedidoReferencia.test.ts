import {describe,it,expect} from "vitest";
import {emptyData} from "./engine/actions";
import {effectivateBatch,currentParcels,batchPreview,type BatchNote,type BatchInput} from "./efetivacao";
import {generateParcels} from "./notas";
import {planVsActual} from "./planVsActual";

// Fictitious fixture mirroring the reported case: planned saved with value 0 and four 0-valued parcels.
function fixture(){const d=emptyData();d.suppliers=[{id:"s",name:"Fixture UZ",group:"",terms:[30,60,90,120]}];d.categories=[{id:"c",kind:"compra",name:"Mercadoria",group:""}];d.planned=[{id:"p",supplierId:"s",categoryId:"c",purchaseCode:"PED-F",document:"",value:0,baseDate:"2026-11-01",notes:"",status:"ativo",remainingOverride:null}];return d;}
const note=(id:string,total=680400):BatchNote=>({id,document:`NF-${id}`,total,effectiveDate:"2026-11-10",baseDate:"2026-11-10",condition:null,parcels:generateParcels(total,"2026-11-10",[30,60,90,120]).map((p,i)=>({id:`${id}-${i}`,amount:p.amount,date:p.date,extension:null}))});
const inp=(d:ReturnType<typeof fixture>,notes:BatchNote[],rest:{id:string;amount:number;date:string}[],remaining:number,id="b1"):BatchInput=>({id,plannedId:"p",at:"2026-11-17T15:00:00Z",by:"t",selected:currentParcels(d,"p").map(p=>p.key),notes,rest:rest.map(r=>({...r,origin:null})),remaining,confirmed:true,reason:"conferido",scopeConfirmed:false,duplicateConfirmed:false,reference:4762800});

describe("Pedido com referência digitada no rascunho",()=>{
  it("prévia: 47.628 − 1, 2 e 7 notas de 6.804; excedente separado",()=>{
    expect(batchPreview(4762800,0,680400)).toEqual({remaining:4082400,excess:0});
    expect(batchPreview(4762800,0,2*680400)).toEqual({remaining:3402000,excess:0});
    expect(batchPreview(4762800,0,7*680400)).toEqual({remaining:0,excess:0});
    expect(batchPreview(4762800,0,8*680400)).toEqual({remaining:0,excess:680400});
    expect(batchPreview(4762800,680400,680400).remaining).toBe(3402000); // anterior contado uma vez
    expect(batchPreview(null,0,680400)).toEqual({remaining:null,excess:null});
  });
  it("previsão salva 0 com parcelas 0: 2 notas sem pedir ampliação; referência gravada, sem negativo",()=>{
    const d=fixture(); expect(currentParcels(d,"p").every(p=>p.amount===0)).toBe(true);
    effectivateBatch(d,inp(d,[note("a"),note("b")],[{id:"r1",amount:3402000,date:"2027-03-10"}],3402000));
    const pl=d.planned[0]!; expect(pl.value).toBe(4762800); expect(pl.remainingOverride?.items).toEqual([{id:"r1",amount:3402000,date:"2027-03-10",boletoNumber:undefined}]);
    const row=planVsActual(d)[0]!; expect(row).toMatchObject({baseline:4762800,effective:1360800,remaining:3402000}); expect(row.diff).toBe(0);
    effectivateBatch(d,inp(d,[note("a"),note("b")],[{id:"r1",amount:3402000,date:"2027-03-10"}],3402000)); // retry idempotente
    expect(d.committed).toHaveLength(8);
  });
  it("excedente exige confirmação; valor previsto revisado é explícito e guarda evidência",()=>{
    const d=fixture(); const notes=Array.from({length:8},(_,i)=>note(`n${i}`));
    expect(()=>effectivateBatch(d,inp(d,notes,[],0))).toThrow("ampliação");
    const a=inp(d,notes,[],0); a.scopeConfirmed=true; effectivateBatch(d,a); expect(d.planned[0]!.value).toBe(4762800);
    const e=fixture(); const pl=e.planned[0]; if(!pl)throw new Error("fixture");pl.value=100000; const b=inp(e,[note("x",50000)],[{id:"r",amount:50000,date:"2027-01-01"}],50000); effectivateBatch(e,b); expect(pl.value).toBe(4762800);expect(e.effectivations[0]?.referenceEvidence).toMatchObject({beforeValue:100000,afterValue:4762800,value:4762800});
  });
  it("restante diferente da soma das parcelas restantes bloqueia",()=>{
    const d=fixture(); expect(()=>effectivateBatch(d,inp(d,[note("a")],[{id:"r",amount:100,date:"2027-01-01"}],4082400))).toThrow("somar");
  });
});
