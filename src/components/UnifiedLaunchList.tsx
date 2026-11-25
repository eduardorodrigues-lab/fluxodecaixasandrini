import { useMemo, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { LaunchFilterPanel, useLaunchFilters } from './LaunchFilters';
import { ColumnFilter, columnTest, Pager, SortHead, suggestFrom, useColumnFilter, usePager, useReportState } from './ReportControls';
import { eligibleLaunchKeys, filterUnifiedLaunch, LAUNCH_COLUMNS, LAUNCH_DISPLAY_ORDER, launchCell, launchSummary, unifiedLaunchCSV, unifiedLaunchRows, validatedLaunchSelection, type LaunchStage } from '@/lib/unifiedLaunch';
import { formatLaunchTime } from '@/lib/launchFilters';
import type { createLaunchPresentation } from '@/lib/launchPresentation';
import type { ScenarioData } from '@/lib/engine/types';
import type { LaunchRef } from '@/lib/manageLaunch';
import { fmtBRL } from '@/lib/money';
import { usePendingFocus } from './PendingFocus';

export function UnifiedLaunchList({d,model,stage,onStage,focus,onManage,canEdit,bulk,setBulk,onBulk,afterFilters}: {
  d:ScenarioData;model:ReturnType<typeof createLaunchPresentation>;stage:LaunchStage;onStage:(stage:LaunchStage)=>void;
  focus?:string|undefined;onManage:(ref:LaunchRef)=>void;canEdit:boolean;bulk:string[];setBulk:(fn:(keys:string[])=>string[])=>void;onBulk:(keys:string[])=>void;afterFilters?:ReactNode;
}) {
  const filters=useLaunchFilters(),report=useReportState(),columns=useColumnFilter();
  const [error,setError]=useState('');
  const rows=useMemo(()=>unifiedLaunchRows(model),[model]);
  const result=useMemo(()=>filterUnifiedLaunch(rows.filter(r=>columnTest(columns.f,LAUNCH_COLUMNS,r.values)),stage,filters.applied,filters.appliedQuery,filters.order,report.sort),[rows,stage,columns.key,filters.applied,filters.appliedQuery,filters.order,report.sort]);
  const totals=useMemo(()=>launchSummary(result),[result]);
  const suppliers=useMemo(()=>[...new Map(rows.map(r=>[r.facets.supplier,r.facets])).values()].sort((a,b)=>a.supplierName.localeCompare(b.supplierName,'pt-BR')),[rows]);
  const situations=useMemo(()=>[...new Set(rows.map(r=>String(r.values[10]??'')))].filter(Boolean).sort(),[rows]);
  const payments=useMemo(()=>[...new Set(rows.map(r=>String(r.values[11]??'')))].filter(Boolean).sort(),[rows]);
  const suggestions=useMemo(()=>suggestFrom(rows,r=>r.values),[rows]);
  const pager=usePager(result.length,stage+JSON.stringify(filters.applied)+filters.appliedQuery+filters.order+columns.key+JSON.stringify(report.sort)+result.length);
  const page=pager.slice(result),pageKeys=eligibleLaunchKeys(page),visibleKeys=new Set(eligibleLaunchKeys(result));
  const hidden=bulk.filter(k=>!visibleKeys.has(k)).length;
  // Focus keeps the old contextual navigation semantics without mixing entity identities.
  usePendingFocus(focus,stage+pager.page+result.length);
  const exportCSV=()=>{const url=URL.createObjectURL(new Blob([unifiedLaunchCSV(result)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='lancamentos.csv';a.click();URL.revokeObjectURL(url);};
  const launchBulk=()=>{try{onBulk(validatedLaunchSelection(rows,bulk));setError('');}catch(e){setError((e as Error).message);}};
  const focusKey=result.find(r=>r.ref.id===focus)?.key;
  return <>
    <LaunchFilterPanel state={{...filters,setOrder:v=>{filters.setOrder(v);report.setSort(null);},clear:()=>{filters.clear();columns.clear();report.setSort(null);onStage('');}}}
      suppliers={suppliers} categories={d.categories} situations={situations} payments={payments} count={result.length} total={0} onExport={exportCSV}
      stageControl={<label className="min-w-0 space-y-1"><span className="lbl block">Etapa</span><select aria-label="Etapa" className="inp h-9 w-full" value={stage} onChange={e=>onStage(e.target.value as LaunchStage)}><option value="">Todos</option><option value="planned">Planejamento</option><option value="committed">Efetivação</option></select></label>}
      extra={<ColumnFilter cols={LAUNCH_COLUMNS} filter={columns} suggest={suggestions}/>}
      summary={<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><p role="status" className="font-semibold">{result.length.toLocaleString('pt-BR')} linhas</p><p className="border-l border-border pl-3 text-muted-foreground">Planejamento <b className="text-foreground">{totals.plannedCount.toLocaleString('pt-BR')}</b> · Efetivação <b className="text-foreground">{totals.actualCount.toLocaleString('pt-BR')}</b></p></div>}
      summaryBand={<div className="rounded-md border border-border bg-accent/50 px-3 py-2 text-sm"><div className="grid gap-2 md:grid-cols-2 md:divide-x md:divide-border">
        <div className="min-w-0 md:pr-3"><p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span>Planejamento remanescente:</span><b className="num text-base">{fmtBRL(totals.remaining)}</b></p>{totals.unavailable>0 && <p className="text-xs text-warning-foreground">{totals.unavailable} sem valor distribuído</p>}{totals.plannedCancelled!==0 && <p className="text-xs text-muted-foreground">Planejamento cancelado (valor original): {fmtBRL(totals.plannedCancelled)}</p>}</div>
        <div className="min-w-0 md:pl-3"><p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span>Efetivação — obrigação vigente:</span><b className="num text-base">{fmtBRL(totals.obligation)}</b></p><p className="text-xs text-muted-foreground">Pago: {fmtBRL(totals.paid)} · Saldo em aberto: {fmtBRL(totals.open)}</p><p className="text-xs text-muted-foreground">Valores registrados: {fmtBRL(totals.original)} (inclui originais cancelados)</p></div>
      </div><p className="mt-1 text-[11px] text-muted-foreground">Totais separados por etapa; não representam a soma líquida de documentos vinculados.</p></div>}/>
    {afterFilters}
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm" role="status"><span className="text-muted-foreground">Seleção em massa: somente parcelas de Efetivação.</span>
      {!!bulk.length && <><b>{bulk.length} parcela(s) marcada(s)</b>{hidden>0 && <span className="text-warning-foreground">· {hidden} fora do filtro atual continuam marcadas</span>}<Button size="sm" disabled={!canEdit} onClick={launchBulk}>Editar selecionadas</Button><Button size="sm" variant="outline" onClick={()=>setBulk(()=>[])}>Limpar seleção</Button></>}
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="overflow-auto border-y border-border launch-table" role="region" aria-label="Tabela de Lançamentos" tabIndex={0}>
      <table className="tbl min-w-max"><thead><tr>
        <th className="w-10 !min-w-10"><input type="checkbox" aria-label="Marcar todas desta página" title="Somente parcelas de Efetivação nesta página" disabled={!canEdit||!pageKeys.length} checked={!!pageKeys.length&&pageKeys.every(k=>bulk.includes(k))} onChange={e=>{const checked=e.target.checked;setBulk(keys=>checked?[...new Set([...keys,...pageKeys])]:keys.filter(k=>!pageKeys.includes(k)));}}/></th>
        {LAUNCH_DISPLAY_ORDER.map(i=><SortHead key={i} label={LAUNCH_COLUMNS[i]?.label??''} column={i} sort={report.sort} onSort={report.toggle} numeric={LAUNCH_COLUMNS[i]?.type==='money'}/>)}
        <th>Cadastrado em (Brasília)</th><th>Última alteração (Brasília)</th><th>Ações</th>
      </tr></thead><tbody>{page.map(row=>{
        const label=`${row.values[15]} · ${row.values[2]} · ${row.values[4]||'sem documento'} · parcela ${row.parcelLabel}`;
        const open=()=>onManage(row.ref);
        return <tr key={row.key} data-launch-key={row.key} data-stage={row.row.stage} id={row.key===focusKey?`pending-${focus}`:undefined} tabIndex={0} className={row.key===focusKey?'bg-warning-soft':''}
          onClick={e=>{if(!(e.target as HTMLElement).closest('button,input'))open();}} onKeyDown={e=>{if(e.key==='Enter'&&e.currentTarget===e.target)open();}}>
          <td><input type="checkbox" aria-label={`Marcar ${label}`} disabled={!canEdit||!row.bulkKey} title={row.bulkKey?'Selecionar parcela de Efetivação':'Planejamento: gerenciar individualmente; não participa da edição em massa de Efetivação'} checked={!!row.bulkKey&&bulk.includes(row.bulkKey)} onChange={()=>{const key=row.bulkKey;if(key)setBulk(keys=>keys.includes(key)?keys.filter(k=>k!==key):[...keys,key]);}}/></td>
          {LAUNCH_DISPLAY_ORDER.map(column=><td key={column} className={LAUNCH_COLUMNS[column]?.type==='money'?'num':LAUNCH_COLUMNS[column]?.type==='date'?'launch-date':column===15?'whitespace-nowrap':'txt'} title={launchCell(row,column)}>
            {column===15?<span className={row.row.stage==='planned'?'tag':'tag tag-ok'}>{launchCell(row,column)}</span>:launchCell(row,column)}
            {column===10&&row.row.stage==='planned'&&row.row.source.row.r.health!=='ok'&&<span className="tag tag-err ml-1">conciliação pendente</span>}
            {column===11&&row.row.stage==='committed'&&model.paymentsFor(row.ref.kind,row.ref.id).some(p=>p.method==='cartao')&&<span className="tag tag-ok ml-1">{Number(row.values[13])<=0?'Quitado com cartão':'parte no cartão'}</span>}
          </td>)}
          <td className="launch-date" title={row.facets.createdBy}>{formatLaunchTime(row.facets.created)}</td><td className="launch-date" title={row.facets.updatedBy}>{formatLaunchTime(row.facets.updated)}</td>
          <td><Button variant="outline" size="sm" aria-label={`Gerenciar ${label}`} onClick={open}>Gerenciar lançamento</Button></td>
        </tr>;
      })}{!page.length&&<tr><td colSpan={20} className="text-center text-muted-foreground">Nenhum resultado para os filtros informados</td></tr>}</tbody></table>
    </div><Pager pager={pager}/>
  </>;
}