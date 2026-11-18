import type { Change } from './diff';
import type { ScenarioData } from './engine/types';

export interface OperationReviewRow { record: string; action: string; field: string; before: string; after: string }
const labels: Record<string,string> = {
  name:'Nome', label:'Nome da conta', bank:'Banco', holder:'Titular', agency:'Agência', account:'Conta', group:'Grupo', kind:'Tipo', status:'Situação', active:'Ativo',
  value:'Valor', amount:'Valor', general:'Geral', gross:'Faturamento bruto', openingBalance:'Saldo inicial', saldoInicial:'Saldo inicial',
  date:'Data', baseDate:'Data base', dueDate:'Vencimento', extensionDate:'Prorrogado para', start:'Início', end:'Fim', startDate:'Data inicial', openingDate:'Data do saldo',
  document:'Documento / nota', purchaseCode:'Pedido', boletoNumber:'Número do boleto', parcelNo:'Parcela', parcelCount:'Quantidade de parcelas',
  notes:'Descrição / observações', note:'Observação', terms:'Prazos', termDays:'Prazo em dias', condition:'Condição', conditions:'Condições', from:'Vigência',
  supplierId:'Fornecedor', categoryId:'Subgrupo', accountId:'Conta', fromAccountId:'Conta de origem', toAccountId:'Conta de destino', generalAccountId:'Conta Geral', cardId:'Cartão',
  plannedId:'Pedido planejado', titleId:'Título', titleKind:'Tipo do título', effectivationId:'Efetivação',
  platforms:'Plataformas', accountByPlatform:'Contas por plataforma', residual:'Repasses residuais', realized:'Creditado em conta',
  installments:'Parcelas', remainingOverride:'Restante planejado', items:'Parcelas restantes', dates:'Datas', total:'Total', effectiveDate:'Data de efetivação', extension:'Prorrogação',
  reversedAt:'Estorno em', reversalNote:'Motivo do estorno', cancelled:'Cancelamento', reason:'Motivo', termsHistory:'Histórico de prazos',
  deflator1:'Redutor 1', deflator2:'Redutor 2', base1:'Base do redutor 1', base2:'Base do redutor 2', divisor:'Divisor', lagDays:'Defasagem em dias',
  financial:'Configuração financeira', financialDefaults:'Padrão para novos meses', legacyReducer:'Redutor', webR1:'Redutor 1', webR2:'Redutor 2',
  divisorLegado:'Divisor de origem', divisorWeb:'Divisor', r2Base:'Base do redutor 2', deflator1Name:'Nome do redutor 1', deflator2Name:'Nome do redutor 2',
  method:'Meio', form:'Forma de pagamento', aliases:'Nomes alternativos', activity:'Vigências', closingDay:'Dia do fechamento', dueDay:'Dia do vencimento', last4:'Final do cartão',
  profile:'Origem do cálculo', openingMode:'Origem do saldo inicial', override:'Conta escolhida', at:'Data / horário', by:'Responsável',
};
const money = new Set(['value','amount','general','gross','total','openingBalance','saldoInicial']);
const object = (x: unknown): Record<string,unknown> => x && typeof x==='object' && !Array.isArray(x) ? x as Record<string,unknown> : {};
const equal = (a: unknown,b:unknown):boolean => {
  if(a===b)return true;
  if(a==null && b==null)return true;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  if(a && b && typeof a==='object' && typeof b==='object')return Object.keys({...object(a),...object(b)}).every(k=>equal(object(a)[k],object(b)[k]));
  return false;
};
export function operationReview(ops: Change[], data: ScenarioData): OperationReviewRow[] {
  const names = new Map<string,string>();
  [...data.suppliers,...data.categories,...data.platforms,...data.cards].forEach(x=>names.set(x.id,x.name));
  data.bankAccounts.forEach(x=>names.set(x.id,x.label || x.bank));
  [...data.planned,...data.committed,...data.expenses].forEach(x=>names.set(x.id,[x.purchaseCode && `Pedido ${x.purchaseCode}`,x.document && `Nota ${x.document}`].filter(Boolean).join(' · ') || 'Registro sem documento'));
  ops.forEach(o=>{const x=object(o.after ?? o.before);if(typeof x['name']==='string')names.set(o.id,x['name']);});
  const show=(v:unknown,key:string):string=>{
    if(v==null || v==='')return 'Vazio';
    if(typeof v==='boolean')return v?'Sim':'Não';
    if(typeof v==='number')return money.has(key)||key==='platforms' ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100) : String(v);
    if(typeof v==='string') {
      if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v.split('-').reverse().join('/');
      if(key.endsWith('Id')||key==='by')return names.get(v) ?? 'Não identificado';
      return ({ativo:'Ativo',cancelado:'Cancelado',encerrado:'Encerrado',compra:'Compra',despesa:'Despesa',previsto:'Previsto',realizado:'Realizado'} as Record<string,string>)[v] ?? v;
    }
    return 'Registro';
  };
  return ops.flatMap(op=>{
    if(equal(op.before,op.after))return [];
    const a=object(op.before),b=object(op.after),x=object(op.after ?? op.before);
    const identity=[x['name'] ?? x['label'] ?? names.get(String(x['supplierId'] ?? '')) ?? x['sourceSupplier'],x['purchaseCode'] && `Pedido ${x['purchaseCode']}`,x['document'] && `Nota ${x['document']}`,x['parcelNo'] && `Parcela ${x['parcelNo']}/${x['parcelCount'] ?? '?'}`,x['date'] ?? x['dueDate'] ?? x['baseDate']].filter(Boolean).map(v=>show(v,'date')).join(' · ');
    const record=`${op.entity} · ${identity || (/^\d{4}-\d{2}/.test(op.id)?show(op.id,'date'):'Registro sem identificação')}`;
    const action=b['status']==='cancelado' && a['status']!=='cancelado' || b['reversedAt'] && !a['reversedAt'] ? 'Cancelamento / estorno' : op.kind;
    const rows:OperationReviewRow[]=[];
    const walk=(before:unknown,after:unknown,path:string,key:string,depth=0)=>{
      if(equal(before,after))return;
      if(key==='id' || ['origin','importOrigin','history','editLog','sourceExact','version'].includes(key))return;
      if(Array.isArray(before)||Array.isArray(after)){
        const aa=Array.isArray(before)?before:[],bb=Array.isArray(after)?after:[];
        for(let i=0;i<Math.max(aa.length,bb.length);i++)walk(aa[i],bb[i],`${path} ${i+1}`,key,depth+1);
      } else if((before && typeof before==='object') || (after && typeof after==='object')){
        const aa=object(before),bb=object(after);
        for(const k of Object.keys({...aa,...bb}))walk(aa[k],bb[k],`${path}${path?' · ':''}${names.get(k) ?? labels[k] ?? 'Detalhe'}`,key==='platforms'?'platforms':k,depth+1);
      } else rows.push({record,action:String(action),field:path || 'Valor',before:show(before,key),after:show(after,key)});
    };
    if(op.before==null||op.after==null)rows.push({record,action:String(action),field:'Registro',before:op.before==null?'Vazio':'Existente',after:op.after==null?'Excluído':'Incluído'});
    walk(op.before,op.after,'',op.entity==='Meta de faturamento'?'gross':'');
    return rows;
  });
}