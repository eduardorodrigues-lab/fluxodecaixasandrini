import { normalizeData } from '@/lib/engine/actions';
import { applyNewLaunch } from '@/lib/newLaunch';
import { generateParcels, type NoteDraft } from '@/lib/notas';
import { currentParcels, effectivateManual, initDraft } from '@/lib/efetivacao';

/** Exclusively synthetic regression data; never used by normal application reads or official writes. */
export function unifiedLaunchFixture(extra=0) {
  const d=normalizeData({suppliers:[{id:'s',name:'ALFA FICT',aliases:['Sintético'],group:'',terms:[]}],categories:[{id:'c',kind:'compra',name:'Mercadoria',group:''},{id:'e',kind:'despesa',name:'Frete',group:''}]});
  d.params.startDate='2026-11-01';
  const note=(id:string,stage:NoteDraft['stage'],kind:NoteDraft['kind'],total:number,count:number)=>{
    applyNewLaunch(d,{stage,kind,supplierId:'s',categoryId:kind==='compra'?'c':'e',document:id,purchaseCode:`PED-${id}`,description:`Descrição ${id}`,baseDate:'2026-11-01',total,parcels:generateParcels(total,'2026-11-01',Array.from({length:count},(_,i)=>30*(i+1)))},id,'2026-11-24T17:13:00Z');
  };
  note('same','planned','compra',30000,3);
  note('plan-exp','planned','despesa',5000,1);
  note('plan-zero','planned','compra',0,1);
  note('plan-cancel','planned','despesa',1000,1);
  const pc=d.planned.find(p=>p.id==='plan-cancel');if(pc)pc.status='cancelado';
  note('actual','committed','compra',20000,2);
  const first=d.committed[0],second=d.committed[1];
  if(!first||!second)throw new Error('Fixture sem parcelas');
  first.id='same';first.boletoNumber='BOL-001';second.id='same-2';
  note('cancelled','committed','despesa',5000,1);
  const cancelled=d.committed.find(c=>c.noteId==='cancelled');if(cancelled)cancelled.status='cancelado';
  note('actual-zero','committed','despesa',0,1);
  d.expenses.push({id:'same',supplierId:'s',categoryId:'e',document:'EXP-SAME',value:3000,baseDate:'2026-12-05',termDays:0,extensionDate:null,extensionHistory:[],status:'ativo',notes:''});
  d.payments.push({id:'partial',titleKind:'committed',titleId:'same',amount:4000,date:'2026-12-05',note:'Parcial sintético',reversedAt:null,reversalNote:''},{id:'paid',titleKind:'committed',titleId:'same-2',amount:10000,date:'2026-12-05',note:'Integral sintético',reversedAt:null,reversalNote:''});
  note('linked','planned','compra',10000,2);
  const parcels=currentParcels(d,'linked'),selected=parcels[0];if(!selected)throw new Error('Fixture sem previsão');
  const draft=initDraft(parcels,[selected.key]);
  const rest=draft.rest.map(r=>{if(r.amount===null||r.date===null)throw new Error('Fixture incompleta');return {id:r.id,amount:r.amount,date:r.date};});
  effectivateManual(d,{id:'partial-effectivation',plannedId:'linked',at:'2026-11-24T17:13:00Z',effectiveDate:'2026-11-24',document:'NF-LINKED',purchaseCode:'PED-linked',selected:[selected.key],eff:[{amount:3000,date:'2026-12-05'}],rest:[...rest,{id:'remaining-partial',amount:2000,date:selected.date}],substituted:3000,rule:'Fixture parcial'});
  for(let i=0;i<extra;i++)note(`extra-${String(i).padStart(3,'0')}`,i%2?'planned':'committed',i%3?'compra':'despesa',100+i,1);
  return d;
}