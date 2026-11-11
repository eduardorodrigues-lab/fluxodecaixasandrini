import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { IntInput, MoneyInput, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { SidePanel, Field, guardClose } from "@/components/NotaPanel";
import { addDays, fmtDate, fmtMonth } from "@/lib/dates";
import { estimateMonth, monthTarget } from "@/lib/engine/engine";
import { removeMonthTarget } from "@/lib/engine/actions";
import { askConfirm } from "@/lib/decisions";
import { financialConfig, previewFinancialMonth, saveFinancialDefaults, saveFinancialMonth, validateFinancial } from "@/lib/financeConfig";
import type { FinancialConfig } from "@/lib/engine/types";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";
import { pendingSearch } from "@/lib/pendencias";
import { usePendingFocus } from "@/components/PendingFocus";

export const Route = createFileRoute("/metas")({
  validateSearch: pendingSearch,
  head: () => ({ meta: [
    { title: "Meta de Faturamento · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Faturamento mensal, deflatores e recebimentos projetados com revisão das configurações financeiras." },
    { property: "og:title", content: "Meta de Faturamento · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Metas mensais, configurações e memória de cálculo dos recebimentos." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Page,
});
const percent = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
function label(f: FinancialConfig) { return `${percent(f.deflator1)} sobre bruto; ${percent(f.deflator2)} sobre ${f.base2 === "bruto" ? "bruto" : "após a primeira redução"}; ÷ ${f.divisor === "30" ? "30" : "dias do mês"}; ${f.lagDays} dias de defasagem`; }
function estimate(d: ReturnType<typeof useApp>["active"]["data"], m: string) {
  const c = monthTarget(d.params, d.targets, d.targetConfigs, m);
  return estimateMonth(d.params, m, c);
}
function Page() {
  const { focus } = Route.useSearch(); usePendingFocus(focus);
  const { active, ui } = useApp(); const d = active.data;
  const [open, setOpen] = useState<string | null>(null); const [nm, setNm] = useState("");
  const months = new Set(Object.keys(d.targetConfigs));
  if (focus && /^\d{4}-(0[1-9]|1[0-2])$/.test(focus)) months.add(focus);
  for (let s = `${ui.start.slice(0, 7)}-01`; s.slice(0, 7) <= ui.end.slice(0, 7); s = `${addDays(s, 32).slice(0, 7)}-01`) months.add(s.slice(0, 7));
  return <div className="space-y-3">
    <PageHeader title="Meta de Faturamento"><Button variant="outline" onClick={() => setOpen("padroes")}>Configurações para novos meses</Button></PageHeader>
    {open && <MonthEditor key={open} month={open} onClose={() => setOpen(null)} />}
    <div className="overflow-auto"><table className="tbl"><thead><tr><th>Mês</th><th className="num">Faturamento bruto</th><th className="num">Líquido projetado</th><th className="num">Por dia</th><th>Defasagem</th><th>Ações</th></tr></thead><tbody>{[...months].sort().map((m) => {
      const c = d.targetConfigs[m], e = estimate(d, m);
      return <tr key={m} id={`pending-${m}`} tabIndex={-1}><td>{fmtMonth(m)}</td><td className="num">{c ? fmtBRL(c.gross) : "Não informado"}</td><td className="num">{c ? fmtBRL(Math.round(e.liquid)) : "—"}</td><td className="num">{c ? fmtBRL(e.value) : "—"}</td><td>{c ? `${financialConfig(d.params, c).lagDays} dias` : "—"}</td><td><Button size="sm" variant="outline" onClick={() => setOpen(m)}>{c ? "Ver cálculo / Editar" : "Definir meta"}</Button></td></tr>;
    })}</tbody></table></div>
    <div className="flex flex-wrap items-end gap-2"><Field l="Novo mês"><input aria-label="Novo mês" className="inp w-32" placeholder="aaaa-mm" value={nm} onChange={(e) => setNm(e.target.value)} /></Field><Button disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(nm) || !!d.targetConfigs[nm]} onClick={() => setOpen(nm)}>Adicionar mês</Button></div>
  </div>;
}
function MonthEditor({ month, onClose }: { month: string; onClose: () => void }) {
  const { active, update, canEdit, ui } = useApp(); const d = active.data; const defaults = month === "padroes"; const c = defaults ? undefined : d.targetConfigs[month];
  const original = defaults ? d.params.financialDefaults ?? financialConfig(d.params) : c ? financialConfig(d.params, c) : d.params.financialDefaults ?? financialConfig(d.params);
  const [f, setF] = useState<FinancialConfig>({ ...original }); const [gross, setGross] = useState<number | null>(c?.gross ?? 0);
  const [review, setReview] = useState(false); const [defined, setDefined] = useState(defaults || !!c?.financial || d.params.profile !== "legado" || !c);
  const [err, setErr] = useState("");
  const dirty = JSON.stringify(f) !== JSON.stringify(original) || gross !== (c?.gross ?? 0);
  const patch = (p: Partial<FinancialConfig>) => { setF({ ...f, ...p }); setErr(""); };
  let preview: ReturnType<typeof previewFinancialMonth> | null = null;
  try { if (!defaults && gross !== null) preview = previewFinancialMonth(d, month, gross, f, ui.start, ui.end); } catch { /* validated before review */ }
  const before = !defaults ? estimate(d, month) : null;
  const proposed = preview?.estimate;
  const r1 = proposed?.r1 ?? 0, r2 = proposed?.r2 ?? 0, liquid = proposed?.liquid ?? 0;
  const confirm = () => {
    const e = update((x) => { if (defaults) saveFinancialDefaults(x, f); else { if (JSON.stringify(x.targetConfigs[month] ?? null) !== JSON.stringify(c ?? null)) throw new Error("Este mês mudou enquanto o formulário estava aberto. Reabra para conferir."); saveFinancialMonth(x, month, gross ?? 0, f, new Date().toISOString()); } });
    if (e) setErr(e); else onClose();
  };
  return <SidePanel title={review ? "Revisar configuração financeira" : defaults ? "Configurações para novos meses" : `Meta · ${fmtMonth(month)}`} centered={review} wide onClose={onClose} dirty={dirty} footer={review ? <><Button variant="outline" onClick={() => setReview(false)}>Voltar</Button><Button disabled={!canEdit} onClick={confirm}>Confirmar configuração</Button></> : <><Button variant="outline" onClick={guardClose(dirty, onClose)}>Cancelar</Button><Button disabled={!canEdit || !defined} onClick={() => { try { if (gross === null) throw new Error("Informe o faturamento."); validateFinancial(f, defaults ? 0 : gross); setReview(true); } catch (e) { setErr((e as Error).message); } }}>Revisar alterações</Button></>}>
    {review ? <div className="space-y-3">
      <div className="hidden overflow-auto sm:block"><table className="tbl [&_td]:whitespace-normal"><thead><tr><th>Mês</th><th>Configuração atual</th><th>Configuração proposta</th><th className="num">Líquido antes</th><th className="num">Líquido depois</th><th className="num">Impacto no fluxo</th></tr></thead><tbody><tr><td>{defaults ? "Novos meses" : fmtMonth(month)}</td><td>{label(original)}{c && !c.financial && d.params.profile === "legado" && " · Apenas um deflator aplicado"}</td><td>{label(f)}</td><td className="num">{before ? fmtBRL(Math.round(before.liquid)) : "—"}</td><td className="num">{defaults ? "—" : fmtBRL(Math.round(liquid))}</td><td className="num">{preview ? fmtBRL(preview.impact) : "Sem alterar meses existentes"}</td></tr></tbody></table></div>
      <dl className="space-y-3 sm:hidden"><div><dt className="lbl">Mês</dt><dd>{defaults ? "Novos meses" : fmtMonth(month)}</dd></div><div><dt className="lbl">Configuração atual</dt><dd>{label(original)}{c && !c.financial && d.params.profile === "legado" && " · Apenas um deflator aplicado"}</dd></div><div><dt className="lbl">Configuração proposta</dt><dd>{label(f)}</dd></div><div><dt className="lbl">Líquido antes → depois</dt><dd>{before ? fmtBRL(Math.round(before.liquid)) : "—"} → {defaults ? "—" : fmtBRL(Math.round(liquid))}</dd></div><div><dt className="lbl">Impacto no fluxo</dt><dd>{preview ? fmtBRL(preview.impact) : "Sem alterar meses existentes"}</dd></div></dl>
      {!defaults && <p>Faturamento: {fmtBRL(c?.gross ?? 0)} → {fmtBRL(gross ?? 0)}. Impacto no saldo final de {fmtDate(ui.start)} a {fmtDate(ui.end)}{preview?.first ? `; primeira diferença em ${fmtDate(preview.first)}` : "; nenhuma diferença no período selecionado"}.</p>}
      {!defaults && <p>Estimativa/dia: {before ? fmtBRL(before.exact) : "—"} → {proposed ? fmtBRL(proposed.exact) : "—"}. Divisor: {proposed?.divisor ?? "—"} dias do mês de origem ({fmtMonth(month)}).</p>}
      <p>Cancelar ou voltar não altera os valores salvos.</p>
    </div> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        {!defaults && <Field l="Faturamento bruto previsto"><MoneyInput value={gross} onChange={setGross} className="w-full" /></Field>}
        <Field l="Deflator 1 (%)"><input aria-label="Deflator 1 (%)" className="inp" type="number" min="0" max="99.99" step="0.01" value={f.deflator1 * 100} onChange={(e) => patch({ deflator1: Number(e.target.value) / 100 })} /></Field>
        <Field l="Base do deflator 1"><select className="inp" value="bruto" onChange={() => {}}><option value="bruto">Faturamento bruto</option></select></Field>
        <Field l="Deflator 2 (%)"><input aria-label="Deflator 2 (%)" className="inp" type="number" min="0" max="99.99" step="0.01" value={f.deflator2 * 100} onChange={(e) => { patch({ deflator2: Number(e.target.value) / 100 }); setDefined(true); }} /></Field>
        <Field l="Base do deflator 2"><select className="inp" value={f.base2} onChange={(e) => patch({ base2: e.target.value as FinancialConfig["base2"] })}><option value="apos_r1">Após a primeira redução</option><option value="bruto">Faturamento bruto</option></select></Field>
        <Field l="Distribuição diária"><select className="inp" value={f.divisor} onChange={(e) => patch({ divisor: e.target.value as FinancialConfig["divisor"] })}><option value="30">Dividir por 30 dias</option><option value="dias">Dividir pelos dias reais do mês</option></select></Field>
        <Field l="Defasagem dos recebimentos (dias)"><IntInput value={f.lagDays} onChange={(v) => patch({ lagDays: v ?? -1 })} /></Field>
      </div>
      {!defined && <label className="flex gap-2"><input type="checkbox" checked={defined} onChange={(e) => setDefined(e.target.checked)} />Antes havia apenas um deflator. Confirmo manter o segundo em 0%.</label>}
      {defaults ? <p>Estes valores preenchem novos meses. Meses cadastrados permanecem inalterados.</p> : <details open><summary className="cursor-pointer font-semibold">Ver cálculo</summary><div className="mt-2 space-y-2"><p>Faturamento bruto → Deflator 1 → Deflator 2 → Líquido projetado → Distribuição diária → Defasagem → Fluxo.</p><p>{fmtBRL(gross ?? 0)} − {fmtBRL(r1)} − {fmtBRL(r2)} = {fmtBRL(liquid)}</p><p aria-live="polite">Estimativa/dia: {proposed ? fmtBRL(proposed.exact) : "—"} · {fmtBRL(liquid)} ÷ {proposed?.divisor ?? "—"} dias ({fmtMonth(month)}).</p><p>Defasagem: o dia do fluxo usa a meta da data menos a defasagem configurada no mês desse dia. A distribuição usa os dias do mês de origem da meta.</p>{c && !c.financial && <p>Memória da origem: {d.params.profile === "legado" ? "Excel legado, um deflator" : "Web, dois deflatores"}. Valores preservados até confirmar.</p>}{c?.history.map((h, i) => <p key={i}>Versão {h.version} · {h.at ? new Date(h.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"} · {h.note}</p>)}</div></details>}
      {c && canEdit && <Button variant="destructive" size="sm" onClick={async () => { if (await askConfirm(`Remover a meta de ${fmtMonth(month)}? A estimativa deste mês será zero e o fluxo mostrará uma pendência.`, { title: "Remover meta mensal?", action: "Remover meta", destructive: true })) { const e = update((x) => { removeMonthTarget(x, month); }); if (e) setErr(e); else onClose(); } }}>Remover meta</Button>}
    </>}
    {err && <p className="text-destructive" role="alert">{err}</p>}
  </SidePanel>;
}
