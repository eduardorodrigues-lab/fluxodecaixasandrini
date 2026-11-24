import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { DateInput } from './kit';
import { ChevronDown, ChevronUp, Download, X } from 'lucide-react';
import { emptyLaunchFilters, launchFilterErrors, type LaunchFilters as Filters, type LaunchOrder, type LaunchFacets } from '@/lib/launchFilters';
import { normalizeSearch } from '@/lib/reportTable';
import { fmtBRL, fmtNum, parseBRL } from '@/lib/money';
import type { Category } from '@/lib/engine/types';

export function useLaunchFilters() {
  const [filters, setFilters] = useState(emptyLaunchFilters), [query, setQuery] = useState(''), [order, setOrder] = useState<LaunchOrder>('created');
  const [text, setText] = useState({ query: '', document: '', order: '', description: '' });
  useEffect(() => {
    const next = { query, document: filters.document, order: filters.order, description: filters.description };
    const timer = setTimeout(() => setText(next), 150); return () => clearTimeout(timer);
  }, [query, filters.document, filters.order, filters.description]);
  const applied = useMemo(() => ({ ...filters, document: text.document, order: text.order, description: text.description }), [filters.suppliers, filters.category, filters.subgroup, filters.period, filters.from, filters.to, filters.situation, filters.payment, filters.min, filters.max, filters.extendedOnly, text]);
  const clear = () => { setFilters(emptyLaunchFilters()); setQuery(''); setText({ query: '', document: '', order: '', description: '' }); };
  return { filters, setFilters, query, setQuery, order, setOrder, applied, appliedQuery: text.query, clear };
}
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  return <div ref={node => node?.querySelectorAll('input, select').forEach(control => control.setAttribute('aria-labelledby', id))} className={`min-w-0 space-y-1 ${wide ? 'sm:col-span-2' : ''}`}><span id={id} className="lbl block">{label}</span>{children}</div>;
}
function Amount({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [raw, setRaw] = useState(fmtNum(value));
  useEffect(() => { if (parseBRL(raw) !== value) setRaw(fmtNum(value)); }, [value]);
  const valid = raw.trim() === '' || /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?$/.test(raw.trim());
  return <><input inputMode="decimal" className="inp w-full num" value={raw} aria-invalid={!valid} onChange={e => { const s = e.target.value; setRaw(s); if (s.trim() === '' || /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?$/.test(s.trim())) onChange(parseBRL(s)); }} />{!valid && <span role="alert" className="text-xs text-destructive">Use valor em R$, como 1.234,56.</span>}</>;
}
export function LaunchFilterPanel({ state, suppliers, categories, situations, payments, count, total, onExport, extra, stageControl, summary }: {
  state: ReturnType<typeof useLaunchFilters>; suppliers: Pick<LaunchFacets, 'supplier' | 'supplierName' | 'supplierText'>[];
  categories: Category[]; situations: string[]; payments?: string[] | undefined; count: number; total: number; onExport: () => void; extra: ReactNode; stageControl?: ReactNode; summary?: ReactNode;
}) {
  const { filters: f, setFilters, query, setQuery, order, setOrder } = state;
  const [more, setMore] = useState(false), [supplierQuery, setSupplierQuery] = useState(''), [suggest, setSuggest] = useState(false);
  const listId = useId();
  const patch = (p: Partial<Filters>) => setFilters(prev => ({ ...prev, ...p }));
  const opts = useMemo(() => suppliers.filter(s => !f.suppliers.includes(s.supplier) && (!supplierQuery || s.supplierText.includes(normalizeSearch(supplierQuery)))).slice(0, 50), [suppliers, supplierQuery, f.suppliers]);
  const periodLabel = { due: 'Vencimento', extended: 'Data prorrogada', created: 'Cadastro', updated: 'Última alteração' }[f.period];
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (query) chips.push({ key: 'query', label: `Busca: ${query}`, remove: () => setQuery('') });
  for (const id of f.suppliers) chips.push({ key: `supplier-${id}`, label: `Fornecedor: ${suppliers.find(s => s.supplier === id)?.supplierName ?? 'Não disponível'}`, remove: () => patch({ suppliers: f.suppliers.filter(s => s !== id) }) });
  for (const [key, label] of [['category', 'Categoria'], ['subgroup', 'Subgrupo'], ['document', 'Documento'], ['order', 'Pedido'], ['situation', 'Lançamento'], ['payment', 'Pagamento'], ['description', 'Descrição']] as const) {
    if (f[key]) chips.push({ key, label: `${label}: ${key === 'subgroup' ? categories.find(c => c.id === f[key])?.name ?? 'Não disponível' : f[key]}`, remove: () => patch(key === 'category' ? { category: '', subgroup: '' } : { [key]: '' }) });
  }
  if (f.from) chips.push({ key: 'from', label: `${periodLabel} de ${f.from.split('-').reverse().join('/')}`, remove: () => patch({ from: null }) });
  if (f.to) chips.push({ key: 'to', label: `${periodLabel} até ${f.to.split('-').reverse().join('/')}`, remove: () => patch({ to: null }) });
  for (const key of ['min', 'max'] as const) if (f[key] !== null) chips.push({ key, label: `${key === 'min' ? 'Mínimo' : 'Máximo'}: ${fmtBRL(f[key])}`, remove: () => patch({ [key]: null }) });
  if (f.extendedOnly) chips.push({ key: 'extended', label: 'Somente prorrogadas', remove: () => patch({ extendedOnly: false }) });
  const select = (label: string, value: string, onChange: (s: string) => void, options: { value: string; label: string }[], all = 'Todas') => <Field label={label}><select className="inp w-full" value={value} onChange={e => onChange(e.target.value)}><option value="">{all}</option>{options.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>;
  return <section aria-label="Filtros de lançamentos" className="mb-3 space-y-3 border-y border-border bg-card py-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stageControl}
      <Field label="Busca rápida" wide><input type="search" className="inp w-full" placeholder="Documento, boleto, identificação original, pedido, fornecedor ou apelido" value={query} onChange={e => setQuery(e.target.value)} /></Field>
      <div className="relative min-w-0"><label className="lbl block mb-1" htmlFor={listId}>Fornecedor</label><input id={listId} className="inp w-full" role="combobox" aria-expanded={suggest} aria-controls={`${listId}-options`} placeholder="Digitar e selecionar fornecedores" value={supplierQuery} onFocus={() => setSuggest(true)} onBlur={() => setTimeout(() => setSuggest(false), 120)} onChange={e => { setSupplierQuery(e.target.value); setSuggest(true); }} onKeyDown={e => { if (e.key === 'Escape') setSuggest(false); if (e.key === 'ArrowDown') document.getElementById(`${listId}-options`)?.querySelector<HTMLButtonElement>('button')?.focus(); }} />
        {suggest && <div id={`${listId}-options`} className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded border border-border bg-popover p-1" role="listbox" aria-multiselectable="true">{opts.map(s => <Button key={s.supplier} variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => { patch({ suppliers: [...f.suppliers, s.supplier] }); setSupplierQuery(''); setSuggest(false); }}>{s.supplierName}</Button>)}{!opts.length && <p className="p-2 text-sm text-muted-foreground">Nenhum fornecedor encontrado</p>}</div>}
      </div>
      {select('Categoria', f.category, category => patch({ category, subgroup: '' }), [{ value: 'Compra', label: 'Compra' }, { value: 'Despesa', label: 'Despesa' }])}
      {select('Subgrupo', f.subgroup, subgroup => patch({ subgroup }), categories.filter(c => !f.category || (c.kind === 'compra' ? 'Compra' : 'Despesa') === f.category).map(c => ({ value: c.id, label: c.name })), 'Todos')}
      <Field label="Período"><select className="inp w-full" value={f.period} onChange={e => patch({ period: e.target.value as Filters['period'] })}>{Object.entries({ due: 'Vencimento', extended: 'Data prorrogada', created: 'Cadastro', updated: 'Última alteração' }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="De"><DateInput allowEmpty value={f.from} onChange={from => patch({ from })} /></Field><Field label="Até"><DateInput allowEmpty value={f.to} onChange={to => patch({ to })} /></Field>
    </div>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-expanded={more} onClick={() => setMore(!more)}>{more ? <ChevronUp size={16} /> : <ChevronDown size={16} />}Mais filtros</Button><Button size="sm" variant="ghost" onClick={() => { state.clear(); setSupplierQuery(''); setSuggest(false); }}>Limpar filtros</Button></div>
    {more && <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Documento"><input className="inp w-full" value={f.document} onChange={e => patch({ document: e.target.value })} /></Field>
      <Field label="Código do pedido"><input className="inp w-full" value={f.order} onChange={e => patch({ order: e.target.value })} /></Field>
      {select('Situação do lançamento', f.situation, situation => patch({ situation }), situations.map(s => ({ value: s, label: s })))}
      {payments && select('Situação do pagamento', f.payment, payment => patch({ payment }), payments.map(s => ({ value: s, label: s })))}
      <Field label="Valor mínimo (R$)"><Amount value={f.min} onChange={min => patch({ min })} /></Field><Field label="Valor máximo (R$)"><Amount value={f.max} onChange={max => patch({ max })} /></Field>
      <Field label="Descrição"><input className="inp w-full" value={f.description} onChange={e => patch({ description: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.extendedOnly} onChange={e => patch({ extendedOnly: e.target.checked })} />Somente prorrogadas</label>
      <div className="sm:col-span-2 xl:col-span-4">{extra}</div>
    </div>}
    {launchFilterErrors(f).map(error => <p key={error} role="alert" className="text-sm text-destructive">{error} O intervalo inválido não foi aplicado.</p>)}
    {!!chips.length && <div className="flex flex-wrap gap-2" aria-label="Critérios ativos">{chips.map(c => <span key={c.key} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-secondary pl-2 text-xs"><span className="break-words">{c.label}</span><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Remover ${c.label}`} onClick={c.remove}><X size={14} /></Button></span>)}</div>}
    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3"><div>{summary ?? <><p role="status" className="font-semibold">{count} parcelas encontradas</p><p className="text-sm text-muted-foreground">Valor das parcelas filtradas: <b className="text-foreground">{fmtBRL(total)}</b></p></>}</div><div className="flex flex-wrap items-end gap-2"><Field label="Ordenar por"><select className="inp w-full" value={order} onChange={e => setOrder(e.target.value as LaunchOrder)}><option value="created">Últimos cadastrados</option><option value="updated">Últimas alterações</option><option value="due">Próximos vencimentos</option><option value="value">Maior valor</option></select></Field><Button variant="outline" size="sm" onClick={onExport}><Download size={16} />Exportar CSV</Button></div></div>
  </section>;
}