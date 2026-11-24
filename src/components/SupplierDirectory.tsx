import { useMemo, useState } from "react";
import { Merge, Building2, CalendarClock, Copy, CreditCard, FilterX, FlaskConical, History, MoreVertical, Pencil, Plus, Search, Sparkles, Star, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { termsLabel } from "./TermsEditor";
import { condPeriods, currentCondition, invalidSupplierName, supplierConditions } from "@/lib/notas";
import { normalizeSupplierName, supplierActive } from "@/lib/fornecedores";
import { splitCode } from "@/lib/supplierUnification";
import { splitOrigin } from "@/lib/originText";
import { fmtDate } from "@/lib/dates";
import type { ScenarioData, Supplier, SupplierCondition } from "@/lib/engine/types";
import type { Operation } from "./FornecedorManager";

const days = (t: (number | null)[]) => { const l = termsLabel(t); return l ? `${l.replaceAll("/", " / ")} dias` : "Sem prazos"; };
const Pill = ({ tone, children }: { tone: "ok" | "warn" | "muted" | "sim" | "bad"; children: React.ReactNode }) => (
  <span className={`sup-pill sup-pill-${tone}`}><span className="sup-dot" />{children}</span>
);
/** Estado da condição pela vigência real (hoje), nunca pelo rótulo do nome. */
export function conditionState(s: Supplier, c: SupplierCondition, today: string) {
  if (c.cancelled) return { label: "Inativa", tone: "bad" as const };
  if (c.kind === "simulacao") return { label: "Simulação", tone: "sim" as const };
  if (currentCondition(s, today)?.id === c.id) return { label: "Vigente", tone: "ok" as const };
  const periods = condPeriods(c).filter((p) => !p.cancelled);
  if (periods.some((p) => p.from && p.from > today)) return { label: "Programada", tone: "warn" as const };
  if (c.kind === "especial") return { label: "Especial", tone: "warn" as const };
  return { label: periods.length ? "Histórica" : "Sem vigência", tone: "muted" as const };
}
function CondIcon({ s, c, today }: { s: Supplier; c: SupplierCondition; today: string }) {
  const st = conditionState(s, c, today).label;
  const I = st === "Vigente" ? Star : st === "Simulação" ? FlaskConical : st === "Programada" ? CalendarClock : st === "Especial" ? Sparkles : History;
  return <span className={`sup-cond-icon ${st === "Simulação" ? "sup-cond-icon-sim" : ""}`}><I className="size-5" /></span>;
}
const codeOf = (s: Supplier) => s.sourceCodes?.map((c) => c.code).join(", ") || [s.name, s.legalName ?? "", ...(s.aliases ?? [])].map((n) => splitCode(n).code).find(Boolean) || null;

export function SupplierDirectory({ d, today, canEdit, onOpen, onNew, editor, picked = [], onPick, onMerge }: { d: ScenarioData; today: string; canEdit: boolean; onOpen: (id: string, op?: Operation) => void; onNew: () => void; editor?: React.ReactNode; picked?: string[]; onPick?: (ids: string[]) => void; onMerge?: () => void }) {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("ativos");
  const [page, setPage] = useState(0); const [size, setSize] = useState(10); const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(() => d.suppliers.filter((s) => !s.mergedInto)
    .filter((s) => status === "todos" || supplierActive(s, today) === (status === "ativos"))
    .filter((s) => { const q = normalizeSupplierName(search); return !q || [s.name, s.legalName ?? "", ...(s.aliases ?? [])].some((n) => normalizeSupplierName(n).includes(q)); })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [d.suppliers, status, search, today]);
  const pages = Math.max(1, Math.ceil(list.length / size)); const pg = Math.min(page, pages - 1);
  const rows = list.slice(pg * size, pg * size + size);
  const s = list.find((x) => x.id === sel) ?? rows[0] ?? null;
  const pickSet = new Set(picked); const canPick = canEdit && !!onPick;
  const toggle = (id: string) => onPick?.(pickSet.has(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const listIds = new Set(list.map((x) => x.id)); const outside = picked.filter((id) => !listIds.has(id));
  const eligible = picked.filter((id) => d.suppliers.some((x) => x.id === id && !x.mergedInto));
  const pageAll = rows.length > 0 && rows.every((x) => pickSet.has(x.id));
  const invalid = d.suppliers.filter((x) => invalidSupplierName(x.name)).length;
  return <div className="sup-layout">
    <section className="sup-list min-w-0">
      <div className="sup-filters">
        <label className="sup-field grow"><span>Buscar fornecedor</span><span className="sup-search"><Search className="size-4" /><input aria-label="Buscar fornecedor" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Nome, razão social ou apelido" />{search && <button aria-label="Limpar busca" onClick={() => setSearch("")}><X className="size-4" /></button>}</span></label>
        <label className="sup-field"><span>Situação</span><select className="inp" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></label>
        <Button variant="outline" onClick={() => { setSearch(""); setStatus("ativos"); setPage(0); }}><FilterX className="size-4" />Limpar filtros</Button>
        {canEdit && <Button onClick={onNew}><Plus className="size-4" />Fornecedor</Button>}
      </div>
      {invalid > 0 && <p className="text-destructive text-sm">{invalid} fornecedor(es) sem nome válido — abra para corrigir. Nada é excluído automaticamente.</p>}
      {canPick && picked.length > 0 && <div className="sup-card sup-pickbar" role="region" aria-label="Fornecedores selecionados">
        <div className="flex flex-wrap items-center gap-2"><strong>{picked.length} selecionado(s)</strong>
          {outside.length > 0 && <span className="text-sm text-warning-foreground" role="status">{outside.length} fora do filtro atual</span>}
          <span className="grow" />
          <Button variant="outline" size="sm" onClick={() => onPick?.([])}>Limpar seleção</Button>
          <Button size="sm" disabled={eligible.length < 2} onClick={onMerge}><Merge className="size-4" />Unificar fornecedores</Button></div>
        <ul className="mt-2 flex flex-wrap gap-1">{picked.map((id) => { const x = d.suppliers.find((y) => y.id === id); return <li key={id} className="sup-chip"><span>{x?.name ?? "Não encontrado"} <code className="text-[11px] text-muted-foreground">{id}</code>{!listIds.has(id) && <em className="text-[11px]"> · fora do filtro</em>}</span><button aria-label={`Remover ${x?.name ?? id} da seleção`} onClick={() => toggle(id)}><X className="size-3" /></button></li>; })}</ul>
      </div>}
      <div className="sup-card overflow-x-auto">
        <table className="sup-table"><thead><tr>{canPick && <th className="w-8"><input type="checkbox" aria-label="Selecionar os fornecedores desta página" title="Seleciona somente as linhas desta página" checked={pageAll} onChange={() => onPick?.(pageAll ? picked.filter((id) => !rows.some((r) => r.id === id)) : [...new Set([...picked, ...rows.map((r) => r.id)])])} /></th>}<th>Fornecedor</th><th>Situação</th><th>Condição vigente</th><th className="text-center">Condições</th><th className="text-center">Ações</th></tr></thead>
          <tbody>{rows.map((x) => { const c = currentCondition(x, today); const act = supplierActive(x, today); return (
            <tr key={x.id} aria-selected={s?.id === x.id} onClick={() => setSel(x.id)}>
              {canPick && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Selecionar ${x.name}`} checked={pickSet.has(x.id)} onChange={() => toggle(x.id)} /></td>}
              <td><div className="flex items-center gap-3"><Building2 className="size-4 shrink-0 text-primary" /><div className="min-w-0"><div className="font-semibold">{invalidSupplierName(x.name) ? "Corrigir nome" : x.name}</div>{x.legalName && <div className="text-xs text-muted-foreground">{x.legalName}</div>}</div></div></td>
              <td><Pill tone={act ? "ok" : "muted"}>{act ? "Ativo" : "Inativo"}</Pill></td>
              <td>{c ? days(c.terms) : <span className="text-muted-foreground">Sem condição padrão</span>}</td>
              <td className="text-center"><span className="sup-count">{supplierConditions(x).length}</span></td>
              <td className="text-center">{canEdit && <Button variant="outline" size="icon" aria-label={`Editar ${x.name}`} onClick={(e) => { e.stopPropagation(); setSel(x.id); onOpen(x.id); }}><Pencil className="size-4" /></Button>}</td>
            </tr>); })}
            {!rows.length && <tr><td colSpan={canPick ? 6 : 5} className="text-center text-muted-foreground">Nenhum fornecedor encontrado.</td></tr>}</tbody></table>
      </div>
      <div className="sup-pager"><span>Mostrando {list.length ? pg * size + 1 : 0} a {Math.min(list.length, pg * size + size)} de {list.length} fornecedores</span>
        <select className="inp" aria-label="Itens por página" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}>{[10, 25, 50].map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
        <div className="flex gap-1"><Button variant="outline" size="icon" aria-label="Primeira" disabled={pg === 0} onClick={() => setPage(0)}><ChevronsLeft className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Anterior" disabled={pg === 0} onClick={() => setPage(pg - 1)}><ChevronLeft className="size-4" /></Button><span className="sup-count self-center">{pg + 1}/{pages}</span><Button variant="outline" size="icon" aria-label="Próxima" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}><ChevronRight className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Última" disabled={pg >= pages - 1} onClick={() => setPage(pages - 1)}><ChevronsRight className="size-4" /></Button></div>
      </div>
    </section>
    {editor ?? (s && <SupplierCard s={s} today={today} canEdit={canEdit} onOpen={onOpen} />)}
  </div>;
}

function SupplierCard({ s, today, canEdit, onOpen }: { s: Supplier; today: string; canEdit: boolean; onOpen: (id: string, op?: Operation) => void }) {
  const act = supplierActive(s, today); const conds = supplierConditions(s); const code = codeOf(s); const note = splitOrigin(s.note).text;
  return <aside className="sup-card sup-detail min-w-0" aria-label={`Fornecedor ${s.name}`}>
    <header className="sup-head">
      <span className="sup-avatar"><Building2 className="size-7" /></span>
      <div className="min-w-0 flex-1"><h2 className="sup-title">{s.name}</h2><p className="text-sm text-muted-foreground">{s.legalName ?? "Razão social não informada"}</p></div>
      <Pill tone={act ? "ok" : "muted"}>{act ? "Ativo" : "Inativo"}</Pill>
      {canEdit && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Ações do fornecedor"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpen(s.id)}>Editar dados</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen(s.id, { kind: act ? "inativar" : "reativar" })}>{act ? "Inativar fornecedor" : "Reativar fornecedor"}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen(s.id, { kind: "excluir" })}>Excluir fornecedor</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    </header>
    <div className="sup-info">
      <div><span className="lbl">CNPJ</span><div className="flex items-center gap-2 font-medium">{s.cnpj ?? <span className="text-muted-foreground">Não informado</span>}{s.cnpj && <button aria-label="Copiar CNPJ" onClick={() => void navigator.clipboard?.writeText(s.cnpj ?? "")}><Copy className="size-4 text-muted-foreground" /></button>}</div></div>
      <div><span className="lbl">Código de origem</span><div className="font-medium">{code ?? <span className="text-muted-foreground">Não informado</span>}</div></div>
      <div><span className="lbl">Apelidos</span><div className="font-medium">{s.aliases?.length ? <>{s.aliases.slice(0, 3).join(", ")} <span className="sup-count">{s.aliases.length}</span></> : <span className="text-muted-foreground">Nenhum</span>}</div></div>
      <div className="sm:col-span-3"><span className="lbl">Observação</span><div>{note || <span className="text-muted-foreground">—</span>}</div></div>
      {!!s.mergedFrom?.length && <div className="sm:col-span-3"><span className="lbl">Unificações</span><div className="text-sm">{s.mergedFrom.map((m) => `${m.ids.length} cadastro(s) incorporado(s) em ${fmtDate(m.at.slice(0, 10))}`).join("; ")}</div></div>}
    </div>
    <div className="sup-cond-head"><h3 className="flex items-center gap-2"><CreditCard className="size-5 text-primary" />Condições de pagamento ({conds.length})</h3>{canEdit && <Button onClick={() => onOpen(s.id, { kind: "new" })}><Plus className="size-4" />Nova condição</Button>}</div>
    <div className="space-y-2">{conds.map((c) => { const st = conditionState(s, c, today); const from = condPeriods(c).filter((p) => !p.cancelled).map((p) => p.from).filter(Boolean).sort().at(-1) ?? null; return (
      <div key={c.id} className={`sup-cond ${st.label === "Vigente" ? "sup-cond-on" : ""}`}>
        <CondIcon s={s} c={c} today={today} />
        <div className="min-w-0 flex-1"><div className="font-semibold">{c.name}</div><div className="text-sm">{days(c.terms)}</div><div className="mt-1 flex flex-wrap gap-1"><Pill tone={st.tone}>{st.label}</Pill>{c.scope && <span className="text-xs text-muted-foreground">{c.scope}</span>}</div></div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground"><CalendarClock className="size-4" />{c.kind === "simulacao" ? "Uso opcional" : from ? `Início em ${fmtDate(from)}` : c.from === null && condPeriods(c).length ? "Desde o cadastro" : "Vigência não informada"}</div>
        {canEdit && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`Ações da condição ${c.name}`}><MoreVertical className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          {!c.cancelled && <><DropdownMenuItem onSelect={() => onOpen(s.id, { kind: "edit", id: c.id })}>Editar</DropdownMenuItem>{c.kind !== "simulacao" && <DropdownMenuItem onSelect={() => onOpen(s.id, { kind: "activate", id: c.id })}>Definir como padrão</DropdownMenuItem>}<DropdownMenuItem onSelect={() => onOpen(s.id, { kind: "cancel", id: c.id })}>Inativar</DropdownMenuItem></>}
          <DropdownMenuItem onSelect={() => onOpen(s.id)}>Ver histórico</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>}
      </div>); })}
      {!conds.length && <p className="text-sm text-muted-foreground">Nenhuma condição cadastrada.</p>}
    </div>
  </aside>;
}
