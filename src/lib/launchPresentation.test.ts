import { expect, it } from 'vitest';
import { emptyData, reversePayment } from './engine/actions';
import { createLaunchPresentation } from './launchPresentation';
import { queryReport, queryIndexedReport, indexReport, reportCSV } from './reportTable';
import { produce } from 'immer';
function fixture() {
 const d = emptyData();
 d.suppliers.push({id:'s',name:'Manchester',aliases:['Calçados'],terms:[],group:''});
 d.committed.push({id:'same',supplierId:'s',categoryId:'',document:'361186A2',purchaseCode:'PED',value:20900.125,dueDate:'2027-07-15',extensionDate:null,extensionHistory:[],status:'ativo',notes:''} as never);
 d.expenses.push({id:'same',supplierId:'s',categoryId:'',document:'DESP',value:10000,baseDate:'2027-07-15',termDays:0,status:'ativo',notes:''} as never);
 d.payments.push({id:'pay',titleKind:'committed',titleId:'same',date:'2027-07-15',amount:1000,note:'',reversedAt:null,reversalNote:''});
 return d;
}
it('tipo + ID não colidem; precisão, aliases, original e fontes preservados',()=>{
 const d=fixture(),m=createLaunchPresentation(d),rows=m.committed;
 expect(rows[0]?.row.t==='committed' && rows[0].row.c).toBe(d.committed[0]);
 expect(rows.map(r=>r.values[12])).toEqual([1000,0]);
 expect(queryIndexedReport(rows,'361186A2',null)[0]?.values[7]).toBe(20900.125);
 expect(queryIndexedReport(rows,'calçados',null)).toHaveLength(2);
 expect(m.committed).toBe(rows);expect(m.paymentsFor('expense','same')).toEqual([]);
});
it('mesma semântica de filtros, ordenação, total e exportação completos antes de paginar',()=>{
 const raw=Array.from({length:101},(_,i)=>({id:i,name:i%2?'Álias':'361186A2',value:i===0?0:i}));
 const values=(r:typeof raw[number])=>[r.name,r.value];const index=indexReport(raw,values);
 for(const q of ['361186A2','alias','']) for(const direction of ['asc','desc'] as const){
 const filtered=raw.filter(r=>r.value>=0&&r.value<=80);
 const old=queryReport(filtered,q,{column:1,direction},values);
 const next=queryIndexedReport(index.filter(r=>Number(r.values[1])<=80),q,{column:1,direction}).map(r=>r.row);
 expect(next).toEqual(old);expect(next.reduce((a,r)=>a+r.value,0)).toBe(old.reduce((a,r)=>a+r.value,0));
 expect(reportCSV(['name','value'],next.map(r=>values(r).map(String)))).toBe(reportCSV(['name','value'],old.map(r=>values(r).map(String))));
 }
 expect(queryIndexedReport(index,'',null)).toHaveLength(101);
});
for(const change of ['edit','pay','reverse','cancel','effectivate','reload','organization','simulation'] as const) it(`novo snapshot invalida índices: ${change}`,()=>{
 const d=fixture();const old=createLaunchPresentation(d);const initial=old.committed;
 const next=produce(d,x=>{
  const title=x.committed[0], supplier=x.suppliers[0], payment=x.payments[0];
  if(!title || !supplier || !payment) throw new Error('Fixture incompleta');
  if(change==='edit') {title.document='NEW';supplier.aliases=['Novo apelido'];}
  if(change==='pay') payment.amount=2000;
  if(change==='reverse') reversePayment(x,'pay','teste','2027-07-16');
  if(change==='cancel') title.status='cancelado';
  if(change==='effectivate') x.committed.push({...title,id:'new',document:'NEW'});
  if(change==='organization'||change==='simulation') x.committed=[];
 });
 const m=createLaunchPresentation(change==='reload'?JSON.parse(JSON.stringify(next)):next);
 expect(m.committed).not.toBe(initial);
 if(change==='edit'){expect(queryIndexedReport(m.committed,'NEW',null)).toHaveLength(1);expect(queryIndexedReport(m.committed,'Novo apelido',null)).toHaveLength(2);}
 if(change==='pay') expect(m.committed[0]?.values[12]).toBe(2000);
 if(change==='reverse') expect(m.committed[0]?.values[12]).toBe(0);
 if(change==='cancel') expect(m.committed[0]?.values[10]).toBe('Cancelado');
 if(change==='effectivate') expect(m.committed).toHaveLength(3);
 if(change==='reload') expect(m.committed.map(r=>r.values)).toEqual(initial.map(r=>r.values));
 if(change==='organization'||change==='simulation') expect(queryIndexedReport(m.committed,'361186A2',null)).toHaveLength(0);
 expect(old.committed).toBe(initial);expect(initial[0]?.values[12]).toBe(1000);
});
