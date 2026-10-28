import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, IntInput, MoneyInput, PageHeader, ProfileBadge } from "@/components/kit";
import type { Params } from "@/lib/engine/types";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/referencias")({
  head: () => ({
    meta: [
      { title: "Referências · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Fornecedores, prazos, categorias, metas, redutores e saldo inicial." },
      { property: "og:title", content: "Referências · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Fornecedores, prazos, metas e parâmetros versionados." },
    ],
  }),
  component: Page,
});

const pct = (v: number) => +(v * 100).toFixed(4);
function Page() {
  const { active, update } = useApp();
  const d = active.data;
  const p = d.params;
  const setP = (patch: Partial<Params>) => update((x) => { Object.assign(x.params, patch); });
  return (
    <div className="space-y-3">
      <PageHeader title="Referências" sub={`Editando o cenário "${active.name}". Na base, alterações vão para rascunho e exigem confirmação.`}><ProfileBadge /></PageHeader>

      <section className="card p-3">
        <div className="lbl mb-2">Parâmetros de cálculo</div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label>Perfil<br /><select className="inp" value={p.profile} onChange={(e) => setP({ profile: e.target.value as Params["profile"] })}><option value="legado">Excel legado (padrão)</option><option value="web">Web</option></select></label>
          <label>Default redutor legado B2 (%)<br /><input className="inp num w-16" type="number" value={pct(p.legacyReducer)} onChange={(e) => setP({ legacyReducer: Number(e.target.value) / 100 })} /></label>
          <label>Divisor legado<br /><select className="inp" value={p.divisorLegado} onChange={(e) => setP({ divisorLegado: e.target.value as "30" | "dias" })}><option value="30">÷30 (fórmula conferida)</option><option value="dias">dias reais</option></select></label>
          <label>Default r1 web (%)<br /><input className="inp num w-16" type="number" value={pct(p.webR1)} onChange={(e) => setP({ webR1: Number(e.target.value) / 100 })} /></label>
          <label>Default r2 web (%)<br /><input className="inp num w-16" type="number" value={pct(p.webR2)} onChange={(e) => setP({ webR2: Number(e.target.value) / 100 })} /></label>
          <label>Divisor web<br /><select className="inp" value={p.divisorWeb} onChange={(e) => setP({ divisorWeb: e.target.value as "30" | "dias" })}><option value="dias">dias reais (fonte web)</option><option value="30">÷30</option></select></label>
          <label>Default defasagem (dias)<br /><IntInput value={p.lagDays} onChange={(v) => setP({ lagDays: v ?? 0 })} /></label>
          <label>Início do fluxo<br /><DateInput value={p.startDate} onChange={(v) => v && setP({ startDate: v })} /></label>
          <label>Saldo inicial<br /><MoneyInput value={p.saldoInicial} onChange={(v) => setP({ saldoInicial: v ?? 0 })} /></label>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Legado aplica só o redutor B2; o segundo redutor web nunca é aplicado ao legado. Perfil ativo não significa homologação.</p>
      </section>

      <section className="card overflow-auto p-3">
        <div className="mb-2 flex justify-between"><span className="lbl">Fornecedores e prazos (até 10; vazio ≠ zero)</span><button className="btn" onClick={() => update((x) => { x.suppliers.push({ id: uid(), name: "Novo fornecedor", group: "", terms: Array(10).fill(null) }); })}>+ Fornecedor</button></div>
        <table className="tbl"><thead><tr><th>Nome</th><th>Grupo</th>{Array.from({ length: 10 }, (_, i) => <th key={i} className="num">P{i + 1}</th>)}</tr></thead>
          <tbody>{d.suppliers.map((s) => (
            <tr key={s.id}>
              <td><input className="inp w-44" defaultValue={s.name} onBlur={(e) => update((x) => { x.suppliers.find((i) => i.id === s.id)!.name = e.target.value; })} /></td>
              <td><input className="inp w-28" defaultValue={s.group} onBlur={(e) => update((x) => { x.suppliers.find((i) => i.id === s.id)!.group = e.target.value; })} /></td>
              {Array.from({ length: 10 }, (_, i) => <td key={i} className="num"><IntInput value={s.terms[i] ?? null} onChange={(v) => update((x) => { x.suppliers.find((k) => k.id === s.id)!.terms[i] = v; })} /></td>)}
            </tr>
          ))}</tbody></table>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="card p-3">
          <div className="mb-2 flex justify-between"><span className="lbl">Categorias / grupos</span><button className="btn" onClick={() => update((x) => { x.categories.push({ id: uid(), name: "Nova categoria", kind: "despesa", group: "" }); })}>+</button></div>
          <table className="tbl"><tbody>{d.categories.map((c) => (
            <tr key={c.id}>
              <td><input className="inp w-32" defaultValue={c.name} onBlur={(e) => update((x) => { x.categories.find((i) => i.id === c.id)!.name = e.target.value; })} /></td>
              <td><select className="inp" value={c.kind} onChange={(e) => update((x) => { x.categories.find((i) => i.id === c.id)!.kind = e.target.value as typeof c.kind; })}><option value="planejada">planejada</option><option value="comprometida">comprometida</option><option value="despesa">despesa</option></select></td>
              <td><input className="inp w-20" defaultValue={c.group} onBlur={(e) => update((x) => { x.categories.find((i) => i.id === c.id)!.group = e.target.value; })} /></td>
            </tr>
          ))}</tbody></table>
        </section>
        <section className="card p-3">
          <div className="lbl mb-2">Metas mensais</div>
          <p className="text-xs">Faturamento, redutores, bases, divisor e defasagem são configurados POR MÊS na página <Link to="/metas" className="underline">Meta de Faturamento</Link> ({Object.keys(d.targetConfigs).length} mês(es) configurados). Os parâmetros gerais acima são apenas default para meses novos.</p>
        </section>
        <section className="card p-3">
          <div className="mb-2 flex justify-between"><span className="lbl">Ajustes manuais de saldo</span><button className="btn" onClick={() => update((x) => { x.adjustments.push({ date: x.params.startDate, value: 0, note: "" }); })}>+</button></div>
          <table className="tbl"><tbody>{d.adjustments.map((a, i) => (
            <tr key={i}>
              <td><DateInput value={a.date} onChange={(v) => v && update((x) => { x.adjustments[i]!.date = v; })} /></td>
              <td className="num"><MoneyInput value={a.value} onChange={(v) => update((x) => { x.adjustments[i]!.value = v; })} /></td>
              <td><button className="btn btn-danger" onClick={() => update((x) => { x.adjustments.splice(i, 1); })}>×</button></td>
            </tr>
          ))}</tbody></table>
          <p className="mt-1 text-[11px] text-muted-foreground">Valor (inclusive 0) substitui o saldo inicial do dia. Vazio = sem ajuste.</p>
        </section>
      </div>

      <p className="text-[11px] text-muted-foreground">Versionamento: cada confirmação na base gera versão auditada (Histórico / Auditoria) com antes/depois; para testar referências sem alterar a base, use Simulações.</p>
    </div>
  );
}
