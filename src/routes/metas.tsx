import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecisionWindow } from "@/components/DecisionDialog";
import { HistoryView } from "@/components/HistoryView";
import { MonthInput } from "@/components/MonthInput";
import { useAvailableArea } from "@/components/AvailableArea";
import { addDays, fmtDate, fmtMonth } from "@/lib/dates";
import { computeFlow } from "@/lib/engine/engine";
import { financialConfig } from "@/lib/financeConfig";
import { applyMonthEdits, monthCalculation, monthEdit, monthImpactDates, intervalLabel, parseMonth, previewMonthEdits, type MonthEdit } from "@/lib/monthReport";
import type { FinancialConfig } from "@/lib/engine/types";
import { moneyTone, signedMoney } from "@/lib/dashboardReport";
import { fmtNum, parseBRL } from "@/lib/money";
import { askConfirm, askText } from "@/lib/decisions";
import { useApp } from "@/lib/store";
import { pendingSearch } from "@/lib/pendencias";
import { usePendingFocus } from "@/components/PendingFocus";
export const Route = createFileRoute("/metas")({ validateSearch: pendingSearch, head: () => ({ meta: [
  { title: "Meta de Faturamento · Fluxo de Caixa Sandrini" }, { name: "description", content: "Relatório mensal editável de faturamento, deflatores, distribuição diária e impacto no caixa." },
  { property: "og:title", content: "Meta de Faturamento · Fluxo de Caixa Sandrini" }, { property: "og:description", content: "Metas mensais com cálculo sequencial, revisão e histórico auditado." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), component: Page });
const pct = (v: number) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
function NumericCell({ value, onChange, label, percent = false, disabled }: { value: number; onChange: (n: number) => void; label: string; percent?: boolean; disabled: boolean }) {
  const [invalid, setInvalid] = useState(false);
  return <input key={String(value)} aria-label={label} aria-invalid={invalid} title={invalid ? "Informe um valor válido" : label} className={`inp w-full num ${invalid ? "border-destructive" : ""}`} disabled={disabled} inputMode="decimal" defaultValue={percent ? pct(value) : fmtNum(value)} onBlur={(e) => {
    const text = e.target.value.replace(/%/g, "").trim();
    const n = percent ? Number(text.replace(/\./g, "").replace(",", ".")) / 100 : parseBRL(text);
    if (n === null || !text || !Number.isFinite(n) || n < 0 || percent && n >= 1) { setInvalid(true); e.target.setCustomValidity("Informe um valor válido."); return; }
    setInvalid(false); e.target.setCustomValidity(""); onChange(n);
  }} />;
}
function Page() {
  const { active, official } = useApp();
  return <MonthPage key={`${official.orgId}-${active.id}`} />;
}
function MonthPage() {
  const { focus } = Route.useSearch(); usePendingFocus(focus);
  const { active, ui, update, canEdit, audit, sims, user, official } = useApp(); const d = active.data;
  const { ref, height } = useAvailableArea();
  const [edits, setEdits] = useState<Record<string, MonthEdit>>({}), [defaults, setDefaults] = useState<FinancialConfig | null>(null), [removed, setRemoved] = useState<string[]>([]);
  const [newMonth, setNewMonth] = useState(""), [error, setError] = useState(""), [review, setReview] = useState(false), [history, setHistory] = useState<string | null>(null), [dates, setDates] = useState<string | null>(null), [showDefaults, setShowDefaults] = useState(false);
  const [origin, setOrigin] = useState(() => ({ id: active.id, org: official.orgId, data: structuredClone(d) }));
  const [page, setPage] = useState(0);
  const dirty = Object.keys(edits).length > 0 || removed.length > 0 || !!defaults;
  // A scenario switch unmounts the editor, never carries an operation-local draft across organizations.
  const scopeChanged = origin.id !== active.id || origin.org !== official.orgId;
  const preview = useMemo(() => { try { const next = previewMonthEdits(d, edits, defaults); for (const m of removed) { delete next.targets[m]; delete next.targetConfigs[m]; } return next; } catch { return d; } }, [d, edits, defaults, removed]);
  const monthSet = new Set([...Object.keys(d.targets), ...Object.keys(edits)]);
  if (focus && /^\d{4}-(0[1-9]|1[0-2])$/.test(focus)) monthSet.add(focus);
  for (let s = `${ui.start.slice(0, 7)}-01`; s.slice(0, 7) <= ui.end.slice(0, 7); s = `${addDays(s, 32).slice(0, 7)}-01`) monthSet.add(s.slice(0, 7));
  const months = [...monthSet].filter((m) => !removed.includes(m)).sort();
  const size = Math.max(3, Math.floor((height - 220) / 56)), pages = Math.max(1, Math.ceil(months.length / size)), current = Math.min(page, pages - 1);
  const patch = (month: string, p: Partial<MonthEdit>, f?: Partial<FinancialConfig>) => {
    if (scopeChanged) { setError("O modo de trabalho mudou. Descarte este rascunho antes de editar novamente."); return; }
    setEdits((old) => { const existing = old[month] ?? monthEdit(d, month); return { ...old, [month]: { ...existing, ...p, financial: { ...existing.financial, ...f, base2: "apos_r1" } } }; }); setError("");
  };
  const rename = async (number: 1 | 2, month?: string) => {
    const chosen = month ? [month] : months.filter((m) => preview.targets[m] !== undefined);
    const nameKey = number === 1 ? "deflator1Name" : "deflator2Name";
    const currentName = monthEdit(preview, chosen[0] ?? ui.start.slice(0, 7)).financial[nameKey] ?? `Deflator ${number}`;
    const name = await askText("O nome identifica o deflator; renomear não muda os percentuais nem o cálculo.", currentName, { title: `Renomear deflator ${number}`, action: "Usar nome no rascunho", input: { label: "Nome do deflator", initial: currentName } });
    if (!name) return;
    if (name.length > 60) { setError("Nome deve ter até 60 caracteres."); return; }
    setEdits((old) => {
      const next = { ...old };
      for (const m of chosen) {
        const existing = next[m] ?? monthEdit(d, m);
        // Renaming alone preserves every financial number and the historical base.
        next[m] = { ...existing, financial: { ...existing.financial, [nameKey]: name } };
      } return next;
    });
  };
  const discard = async () => { if (!dirty || await askConfirm("Descartar as alterações de metas ainda não confirmadas?", { title: "Descartar alterações?", action: "Descartar", destructive: true })) { setEdits({}); setRemoved([]); setDefaults(null); setError(""); setReview(false); } };
  const prepareReview = () => {
    if (scopeChanged) { setError("O modo de trabalho mudou. Descarte o rascunho e reabra a página."); return; }
    if (ref.current?.querySelector('[aria-invalid="true"]')) { setError("Confira os campos inválidos antes de revisar."); return; }
    try { previewMonthEdits(d, edits, defaults); setError(""); setReview(true); } catch (e) { setError((e as Error).message); }
  };
  const changed = [...new Set([...Object.keys(edits), ...removed])].sort();
  const flowBefore = useMemo(() => review ? computeFlow(d, { start: ui.start, end: ui.end }) : null, [review, d, ui]);
  const flowAfter = useMemo(() => review ? computeFlow(preview, { start: ui.start, end: ui.end }) : null, [review, preview, ui]);
  const confirm = () => {
    const e = update((next) => {
      for (const m of changed) if (JSON.stringify(next.targetConfigs[m] ?? null) !== JSON.stringify(origin.data.targetConfigs[m] ?? null)) throw new Error(`A meta de ${fmtMonth(m)} mudou. Descarte e confira a versão atual.`);
      applyMonthEdits(next, edits, new Date().toISOString(), defaults);
      for (const m of removed) { delete next.targets[m]; delete next.targetConfigs[m]; }
    });
    if (e) setError(e); else { setReview(false); setEdits({}); setDefaults(null); setRemoved([]); setError(""); setOrigin({ id: active.id, org: official.orgId, data: structuredClone(preview) }); }
  };
  const historyEntries = active.isBase ? audit.map((entry) => ({ at: entry.at, user: entry.user_email ?? "", changes: entry.changes })) : sims.find((s) => s.id === active.id)?.history ?? [];
  const names = [1, 2].map((n) => { const key = n === 1 ? "deflator1Name" : "deflator2Name"; const all = new Set(months.map((m) => monthEdit(preview, m).financial[key] ?? `Deflator ${n}`)); return all.size === 1 ? [...all][0] : `Deflator ${n}`; });
  return <div ref={ref} className="metas-page" style={{ "--available-height": `${height}px` } as React.CSSProperties}>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-lg font-semibold">Meta de Faturamento</h1><p className="text-xs text-muted-foreground">{active.isBase ? "Fluxo real" : `Simulação ${active.name}`}{dirty ? ` · ${changed.length} meses em rascunho` : ""}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setShowDefaults(!showDefaults)}>Padrões para novos meses</Button><Button disabled={!dirty} variant="outline" onClick={discard}>Descartar</Button><Button disabled={!dirty || !canEdit} onClick={prepareReview}>Revisar e confirmar</Button></div></header>
    {showDefaults && <div className="metas-defaults"><strong>Padrões opcionais · somente novos meses</strong><label>Deflator 1 (%)<NumericCell label="Padrão deflator 1" percent value={(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)).deflator1} disabled={!canEdit} onChange={(deflator1) => setDefaults({ ...(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)), deflator1 })} /></label><label>Deflator 2 (%)<NumericCell label="Padrão deflator 2" percent value={(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)).deflator2} disabled={!canEdit} onChange={(deflator2) => setDefaults({ ...(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)), deflator2 })} /></label><label>Distribuição<select disabled={!canEdit} className="inp" value={(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)).divisor} onChange={(e) => setDefaults({ ...(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)), divisor: e.target.value as FinancialConfig["divisor"] })}><option value="30">30 dias</option><option value="dias">Dias reais</option></select></label><label>Defasagem<input disabled={!canEdit} aria-label="Padrão defasagem" className="inp w-16" type="number" min={0} max={120} value={(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)).lagDays} onChange={(e) => setDefaults({ ...(defaults ?? d.params.financialDefaults ?? financialConfig(d.params)), lagDays: Number(e.target.value) })} /></label></div>}
    <div className="metas-table-wrap"><table className="tbl metas-table"><colgroup>{[7,10,6,8,9,6,8,9,7,5,9,10,6].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup><thead><tr><th>Mês/ano</th><th className="num">Faturamento<br />(R$)</th><th>{names[0]} (%)<Button size="icon" variant="ghost" title="Renomear deflator 1" aria-label="Renomear deflator 1" onClick={() => rename(1)}><Pencil className="size-3" /></Button></th><th className="num">Redução 1<br />(R$)</th><th className="num">Após deflator 1<br />(R$)</th><th>{names[1]} (%)<Button size="icon" variant="ghost" title="Renomear deflator 2" aria-label="Renomear deflator 2" onClick={() => rename(2)}><Pencil className="size-3" /></Button></th><th className="num">Redução 2<br />(R$)</th><th className="num">Líquido projetado<br />(R$)</th><th>Distribuição diária</th><th>Defasagem<br />(dias)</th><th className="num">Estimativa/dia<br />(R$)</th><th>Datas de fluxo impactadas</th><th>Histórico</th></tr></thead><tbody>{months.slice(current * size, (current + 1) * size).map((month) => {
      const edit = monthEdit(preview, month), e = monthCalculation(preview, month), defined = preview.targets[month] !== undefined, impact = defined ? monthImpactDates(preview, month) : null;
      return <tr key={month} id={`pending-${month}`} tabIndex={-1} className={edits[month] ? "bg-accent/40" : ""}><td><strong>{fmtMonth(month)}</strong>{edits[month] && <small className="block text-muted-foreground">Rascunho</small>}<Button size="icon" variant="ghost" className="size-6" disabled={!canEdit} title={`Remover ${fmtMonth(month)} do rascunho`} aria-label={`Remover mês ${fmtMonth(month)}`} onClick={() => setRemoved([...removed, month])}><Trash2 className="size-3" /></Button></td>
      <td><NumericCell label={`Faturamento ${fmtMonth(month)}`} value={edit.gross} disabled={!canEdit} onChange={(gross) => patch(month, { gross })} /></td><td><NumericCell label={`Deflator 1 ${fmtMonth(month)}`} percent value={edit.financial.deflator1} disabled={!canEdit} onChange={(deflator1) => patch(month, {}, { deflator1 })} />{edit.financial.deflator1Name && <span className="block text-muted-foreground">{edit.financial.deflator1Name}</span>}</td><td className={`num ${moneyTone(-e.r1)}`}>{defined ? signedMoney(-e.r1) : "—"}</td><td className={`num ${moneyTone(e.gross - e.r1)}`}>{defined ? signedMoney(e.gross - e.r1) : "—"}</td><td><NumericCell label={`Deflator 2 ${fmtMonth(month)}`} percent value={edit.financial.deflator2} disabled={!canEdit} onChange={(deflator2) => patch(month, {}, { deflator2 })} />{edit.financial.deflator2Name && <span className="block text-muted-foreground">{edit.financial.deflator2Name}</span>}</td><td className={`num ${moneyTone(-e.r2)}`}>{defined ? signedMoney(-e.r2) : "—"}</td><td className={`num ${moneyTone(e.liquid)}`}>{defined ? signedMoney(e.liquid) : "—"}</td><td><select aria-label={`Distribuição diária ${fmtMonth(month)}`} className="inp w-full" disabled={!canEdit} value={edit.financial.divisor} onChange={(ev) => patch(month, {}, { divisor: ev.target.value as FinancialConfig["divisor"] })}><option value="30">30 dias</option><option value="dias">Dias reais</option></select></td><td><input aria-label={`Defasagem ${fmtMonth(month)}`} className="inp w-full num" disabled={!canEdit} type="number" min={0} max={120} value={edit.financial.lagDays} onChange={(ev) => patch(month, {}, { lagDays: Number(ev.target.value) })} /></td><td className={`num ${moneyTone(e.exact)}`} aria-live="polite">{defined ? signedMoney(e.exact) : "—"}</td><td>{impact ? <><span>{intervalLabel(impact.estimated)}</span><Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setDates(month)}>{impact.estimated.length} estimadas · {impact.suppressed.length} informadas</Button></> : "Não definida"}</td><td><Button size="icon" variant="ghost" title={`Histórico ${fmtMonth(month)}`} aria-label={`Histórico ${fmtMonth(month)}`} onClick={() => setHistory(month)}><History className="size-4" /></Button></td></tr>;
    })}</tbody></table></div>
    <footer className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><label>Novo mês<MonthInput value={newMonth} onChange={(value) => { setNewMonth(value); setError(""); }} /></label><Button variant="outline" disabled={!canEdit} onClick={() => { const m = parseMonth(newMonth); if (!m) { setError("Informe mês de 01 a 12 e ano com quatro dígitos (mm/aaaa)."); return; } if (monthSet.has(m) && !removed.includes(m)) { setError("Este mês já está no relatório."); return; } setRemoved(removed.filter((x) => x !== m)); setEdits({ ...edits, [m]: monthEdit(preview, m) }); setNewMonth(""); setPage(0); }}>Adicionar mês</Button></div><div className="flex items-center gap-2 text-xs"><span>{months.length} meses · Página {current + 1}/{pages}</span><Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Próxima</Button></div></footer>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {review && <DecisionWindow title="Revisar metas de faturamento" description={`${active.isBase ? "Fluxo real" : `Simulação ${active.name}`} · ${user?.email ?? ""}`} wide footer={<><Button variant="outline" onClick={() => setReview(false)}>Voltar</Button><Button variant="outline" onClick={discard}>Descartar</Button><Button disabled={!canEdit || scopeChanged} onClick={confirm}>Confirmar metas</Button></>}>
      {changed.map((m) => { const before = monthEdit(d, m), after = monthEdit(preview, m), eb = monthCalculation(d, m), ea = monthCalculation(preview, m); return <section key={m} className="border-b border-border pb-3"><h3 className="font-semibold">{fmtMonth(m)}{removed.includes(m) ? " · Remoção" : d.targets[m] === undefined ? " · Novo mês" : ""}</h3><table className="tbl"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{[
        ["Faturamento", signedMoney(before.gross), signedMoney(after.gross)], ["Nome deflator 1", before.financial.deflator1Name ?? "Deflator 1", after.financial.deflator1Name ?? "Deflator 1"], ["Deflator 1", `${pct(before.financial.deflator1)}%`, `${pct(after.financial.deflator1)}%`], ["Redução 1", signedMoney(-eb.r1), signedMoney(-ea.r1)], ["Após deflator 1", signedMoney(eb.gross - eb.r1), signedMoney(ea.gross - ea.r1)], ["Nome deflator 2", before.financial.deflator2Name ?? "Deflator 2", after.financial.deflator2Name ?? "Deflator 2"], ["Deflator 2", `${pct(before.financial.deflator2)}%`, `${pct(after.financial.deflator2)}%`], ["Redução 2", signedMoney(-eb.r2), signedMoney(-ea.r2)], ["Base sequencial", before.financial.base2 === "bruto" ? "Faturamento bruto" : "Após deflator 1", "Após deflator 1"], ["Líquido", signedMoney(eb.liquid), signedMoney(ea.liquid)], ["Distribuição", before.financial.divisor === "30" ? "30 dias" : "Dias reais", after.financial.divisor === "30" ? "30 dias" : "Dias reais"], ["Defasagem", `${before.financial.lagDays} dias`, `${after.financial.lagDays} dias`], ["Estimativa/dia", signedMoney(eb.exact), signedMoney(ea.exact)], ["Datas estimadas", intervalLabel(monthImpactDates(d, m).estimated), removed.includes(m) ? "Meta removida" : intervalLabel(monthImpactDates(preview, m).estimated)],
      ].map(([field, b, a]) => <tr key={field}><td>{field}</td><td>{b}</td><td className={b !== a ? "text-negative" : ""}>{a}</td></tr>)}</tbody></table></section>; })}
      {defaults && <p>Padrões de novos meses: {pct(defaults.deflator1)}% / {pct(defaults.deflator2)}% · {defaults.divisor === "30" ? "30 dias" : "Dias reais"} · {defaults.lagDays} dias. Meses existentes não são reescritos.</p>}
      <p>Saldo final de {fmtDate(ui.start)} a {fmtDate(ui.end)}: {signedMoney(flowBefore?.kpis.saldoFinal ?? 0)} → {signedMoney(flowAfter?.kpis.saldoFinal ?? 0)}. Diferença: {signedMoney((flowAfter?.kpis.saldoFinal ?? 0) - (flowBefore?.kpis.saldoFinal ?? 0))}.</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </DecisionWindow>}
    {history && <DecisionWindow wide title={`Histórico da meta · ${fmtMonth(history)}`} description={active.isBase ? "Fluxo real · data e usuário da auditoria" : `Simulação ${active.name}`} footer={<Button variant="outline" onClick={() => setHistory(null)}>Fechar</Button>}><HistoryView data={d} scope={active.isBase ? "Fluxo real" : `Simulação ${active.name}`} entries={historyEntries.map((e) => ({ ...e, changes: e.changes.filter((c) => c.id === history && ["Meta de faturamento", "Configuração financeira mensal"].includes(c.entity)) })).filter((e) => e.changes.length > 0)} />{d.targetConfigs[history]?.history.length ? <details><summary>Memória de origem e versões</summary>{d.targetConfigs[history]?.history.map((h, i) => <p key={i}>{h.at ? new Date(h.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Data não registrada na origem"} · Versão {h.version} · {h.note}</p>)}</details> : null}</DecisionWindow>}
    {dates && <DecisionWindow title={`Datas impactadas · ${fmtMonth(dates)}`} wide description="Meta resolvida diariamente pelo motor; recebimento informado, inclusive zero, substitui estimativa." footer={<Button variant="outline" onClick={() => setDates(null)}>Fechar</Button>}><h3>Estimativa utilizada</h3><p>{intervalLabel(monthImpactDates(preview, dates).estimated)}</p><h3>Suprimidas por recebimento informado</h3><p>{intervalLabel(monthImpactDates(preview, dates).suppressed)}</p><h3>Datas que consultam esta meta</h3><p>{intervalLabel(monthImpactDates(preview, dates).dates)}</p></DecisionWindow>}
  </div>;
}
