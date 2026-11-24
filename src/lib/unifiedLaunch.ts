import type { createLaunchPresentation } from './launchPresentation';
import { filterLaunchRows, formatLaunchTime, type FilteredLaunch, type LaunchFilters, type LaunchOrder } from './launchFilters';
import { dateValue, normalizeSearch, reportCSV, type ReportSort, type ReportValue } from './reportTable';
import type { LaunchRef } from './manageLaunch';
import { fmtBRL } from './money';
import { fmtDate } from './dates';

type Model = ReturnType<typeof createLaunchPresentation>;
export type LaunchStage = '' | 'planned' | 'committed';
type Source = { stage: 'planned'; source: Model['planned'][number] } | { stage: 'committed'; source: Model['committed'][number] };
export type UnifiedLaunchRow = FilteredLaunch<Source> & { key: string; ref: LaunchRef; bulkKey: string | null; parcelLabel: string; obligation: number | null };
// Keep financial/filter value positions intact; Etapa is rendered first, not inserted into source values.
export const LAUNCH_COLUMNS: { label: string; type: 'text' | 'date' | 'money' }[] = [
  {label:'Categoria',type:'text'},{label:'Subgrupo',type:'text'},{label:'Fornecedor',type:'text'},
  {label:'Código do pedido',type:'text'},{label:'Documento',type:'text'},{label:'Descrição',type:'text'},
  {label:'Parcela',type:'text'},{label:'Valor da parcela',type:'money'},{label:'Vencimento',type:'date'},
  {label:'Prorrogar para',type:'date'},{label:'Situação do lançamento',type:'text'},
  {label:'Situação do pagamento',type:'text'},{label:'Pago',type:'money'},{label:'Saldo em aberto',type:'money'},
  {label:'Número do boleto',type:'text'},{label:'Etapa',type:'text'},
];
export const LAUNCH_DISPLAY_ORDER = [15,0,1,2,3,4,14,5,6,7,8,9,10,11,12,13];
export function launchLocation(search: Record<string, unknown>): { tab?: string | undefined; etapa?: LaunchStage | undefined; focus?: string | undefined } {
  const tab = ['payments','consultas','pva'].includes(String(search['tab'])) ? String(search['tab']) : 'launches';
  const explicit = search['etapa'];
  const etapa: LaunchStage = explicit === 'planned' || explicit === 'committed' || explicit === '' ? explicit
    : search['tab'] === 'planned' ? 'planned' : search['tab'] === 'committed' ? 'committed' : '';
  return { tab, etapa, focus: typeof search['focus'] === 'string' ? search['focus'] : undefined };
}
/** Only presentation adapters: retain exact source objects, residual calculations, precision and entity identity. */
export function unifiedLaunchRows(model: Model): UnifiedLaunchRow[] {
  const plans: UnifiedLaunchRow[] = model.planned.flatMap(source => {
    const p=source.row.p;
    // The engine excludes zero cash movements. A persisted explicit zero is still a visible parcel, not an absent value.
    const zeroIndexes=!source.row.pc && p.status==='ativo' && p.value===0 && source.row.r.effectivated===0 && !p.remainingOverride && p.installments?.length
      ? p.installments.map((_,index)=>index) : [null];
    return zeroIndexes.map(zeroIndex=>{
    const { p, i, n, pc, idx, it } = source.row;
    const item = p.remainingOverride?.items?.[i];
    const parcel = item?.id ?? `${p.id}#${zeroIndex ?? idx}`;
    const boleto = p.boletoNumbers?.[parcel] ?? item?.boletoNumber ?? it?.boletoNumber ?? '';
    const values: ReportValue[] = [...source.values, null,null,null,boleto,'Planejamento'];
    // Existing facet evidence carries the original/extended dates of remaining known notes and reviewed extensions.
    values[8]=dateValue(item?.note?.dueDate??source.facets.due);
    values[9]=dateValue(item?.note?.extension??source.facets.extended);
    const zero=zeroIndex===null?undefined:p.installments?.[zeroIndex];
    if(zero){values[6]=Number(zeroIndex)+1;values[7]=zero.amount;values[8]=dateValue(zero.date);values[9]=dateValue(zero.extensionDate);values[14]=p.boletoNumbers?.[parcel]??zero.boletoNumber??'';}
    return {row:{stage:'planned' as const,source}, values, searchText:normalizeSearch(`${source.searchText} Planejamento ${values[14]??''}`), facets:zero?{...source.facets,key:JSON.stringify(['planned',p.id,parcel]),due:zero.date,extended:zero.extensionDate}:item?.note?{...source.facets,due:item.note.dueDate,extended:item.note.extension}:source.facets,
      key:JSON.stringify(['planned',p.id,parcel]), ref:{kind:'planned' as const,id:p.id,parcel},bulkKey:null,parcelLabel:zero ? `${Number(zeroIndex)+1}/${p.installments?.length}` : pc ? `${i+1}/${n}` : '—',obligation:null};
    });
  });
  const actuals: UnifiedLaunchRow[] = model.committed.map(source => {
    const r = source.row, t = r.t === 'committed' ? r.c : r.e;
    const label = r.t === 'committed' ? model.groups.byId.get(t.id)?.labels.get(t.id) ?? '1/1' : '1/1';
    return {row:{stage:'committed',source},values:[...source.values,'Efetivação'],searchText:normalizeSearch(`${source.searchText} Efetivação`),facets:source.facets,
      key:JSON.stringify(['committed',r.t,t.id,t.id]),ref:{kind:r.t,id:t.id,parcel:t.id},bulkKey:`${r.t}:${t.id}`,parcelLabel:label,obligation:t.status==='cancelado'?0:t.value};
  });
  return [...plans,...actuals];
}
export function filterUnifiedLaunch(rows: UnifiedLaunchRow[], stage: LaunchStage, filters: LaunchFilters, query: string, order: LaunchOrder, sort: ReportSort | null = null): UnifiedLaunchRow[] {
  return filterLaunchRows(rows.filter(r=>!stage || r.row.stage===stage),filters,query,order,sort) as UnifiedLaunchRow[];
}
export function launchSummary(rows: UnifiedLaunchRow[]) {
  const num = (v: ReportValue) => typeof v === 'number' ? v : 0;
  return rows.reduce((s,r)=>{
    if(r.row.stage==='planned'){s.plannedCount++;if(r.row.source.row.p.status==='cancelado')s.plannedCancelled+=num(r.values[7]);else s.remaining+=num(r.values[7]);if(r.values[7]==null)s.unavailable++;}
    else {s.actualCount++;s.original+=num(r.values[7]);s.obligation+=r.obligation??0;s.paid+=num(r.values[12]);s.open+=num(r.values[13]);}
    return s;
  },{plannedCount:0,actualCount:0,remaining:0,plannedCancelled:0,unavailable:0,original:0,obligation:0,paid:0,open:0});
}
export function eligibleLaunchKeys(rows: UnifiedLaunchRow[]) { return rows.flatMap(r=>r.bulkKey ? [r.bulkKey] : []); }
export function validatedLaunchSelection(rows: UnifiedLaunchRow[], keys: string[]) {
  const allowed = new Set(eligibleLaunchKeys(rows));
  if(keys.some(k=>!allowed.has(k))) throw new Error('A seleção em massa aceita somente parcelas de Efetivação existentes. Planejamento deve ser gerenciado individualmente.');
  return [...new Set(keys)];
}
export function launchCell(row: UnifiedLaunchRow, column: number): string {
  if(column===6)return row.parcelLabel;
  const value=row.values[column],type=LAUNCH_COLUMNS[column]?.type;
  if(value==null || value==='')return '—';
  if(type==='money')return fmtBRL(typeof value==='number'?value:null);
  if(type==='date')return typeof value==='number'?fmtDate(new Date(value).toISOString().slice(0,10)):'—';
  return String(value);
}
export function unifiedLaunchCSV(rows: UnifiedLaunchRow[]) {
  return reportCSV([...LAUNCH_DISPLAY_ORDER.map(i=>LAUNCH_COLUMNS[i]?.label??''),'Cadastrado em (Brasília)','Última alteração (Brasília)'],rows.map(r=>[
    ...LAUNCH_DISPLAY_ORDER.map(i=>launchCell(r,i)),formatLaunchTime(r.facets.created),formatLaunchTime(r.facets.updated),
  ]));
}