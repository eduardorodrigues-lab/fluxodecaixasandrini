import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, IntInput, MoneyInput, PageHeader } from "@/components/kit";
import type { Params } from "@/lib/engine/types";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { uid, useApp } from "@/lib/store";
import { addSupplierCondition, currentCondition, supplierConditions } from "@/lib/notas";
import { todaySP } from "@/lib/engine/actions";
import { Field, SidePanel } from "@/components/NotaPanel";
import type { ScenarioData } from "@/lib/engine/types";

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
  const { user } = useApp();
  const [condOf, setCondOf] = useState<string | null>(null);
  const today = todaySP();
  const setP = (patch: Partial<Params>) => update((x) => { Object.assign(x.params, patch); });
  return (
    <div className="space-y-3">
      {condOf && <CondicoesPanel d={d} supplierId={condOf} onClose={() => setCondOf(null)} onAdd={(c) => { const e = update((x) => addSupplierCondition(x, condOf, c, new Date().toISOString(), user?.email ?? "", today)); return e; }} />}
      <PageHeader title="Referências" sub={`Editando o cenário "${active.name}". Na base, alterações vão para rascunho e exigem confirmação.`}></PageHeader>

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
        <div className="mb-2 flex justify-between"><span className="lbl">Fornecedores</span><button className="btn" onClick={() => update((x) => { x.suppliers.push({ id: uid(), name: "Novo fornecedor", group: "", terms: Array(10).fill(null) }); })}>+ Fornecedor</button></div>
        <table className="tbl"><thead><tr><th>Nome</th><th>Grupo</th><th>Condição vigente</th><th>Condições</th><th /></tr></thead>
          <tbody>{d.suppliers.map((s) => (
            <tr key={s.id}>
              <td><input className="inp w-44" defaultValue={s.name} onBlur={(e) => update((x) => { x.suppliers.find((i) => i.id === s.id)!.name = e.target.value; })} /></td>
              <td><input className="inp w-28" defaultValue={s.group} onBlur={(e) => update((x) => { x.suppliers.find((i) => i.id === s.id)!.group = e.target.value; })} /></td>
              <td>{(() => { const c = currentCondition(s, today); return c ? `${c.name} · ${c.terms.filter((t) => t !== null).join("/")} dias` : <span className="text-muted-foreground">sem condição</span>; })()}</td>
              <td className="num">{supplierConditions(s).length}</td>
              <td><button className="btn" onClick={() => setCondOf(s.id)}>Condições de pagamento</button></td>
            </tr>
          ))}</tbody></table>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="card p-3">
          <div className="mb-2 flex justify-between"><span className="lbl">Categorias e subgrupos</span><button className="btn" onClick={() => update((x) => { x.categories.push({ id: uid(), name: "Novo subgrupo", kind: "despesa", group: "" }); })}>+ Subgrupo</button></div>
          <table className="tbl"><thead><tr><th>Categoria</th><th>Nome do subgrupo</th></tr></thead><tbody>{d.categories.map((c) => (
            <tr key={c.id}>
              <td><select className="inp" value={c.kind} onChange={(e) => update((x) => { x.categories.find((i) => i.id === c.id)!.kind = e.target.value as typeof c.kind; })}><option value="compra">Compra</option><option value="despesa">Despesa</option></select></td>
              <td><input className="inp w-44" defaultValue={c.name} onBlur={(e) => update((x) => { x.categories.find((i) => i.id === c.id)!.name = e.target.value; })} /></td>
            </tr>
          ))}</tbody></table>
          <p className="mt-1 text-[11px] text-muted-foreground">Categoria é só Compra ou Despesa; planejada/efetuada são etapas do lançamento. Subgrupos com o mesmo nome somam juntos no fluxo.</p>
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

function CondicoesPanel({ d, supplierId, onClose, onAdd }: { d: ScenarioData; supplierId: string; onClose: () => void; onAdd: (c: { name: string; terms: (number | null)[]; from: string | null }) => string | null }) {
  const s = d.suppliers.find((x) => x.id === supplierId)!;
  const list = supplierConditions(s);
  const cur = currentCondition(s, todaySP());
  const [name, setName] = useState("");
  const [terms, setTerms] = useState<(number | null)[]>(Array(10).fill(null));
  const [from, setFrom] = useState<string | null>(todaySP());
  const [err, setErr] = useState("");
  const add = () => {
    if (!window.confirm(`Adicionar a condição "${name}"? As condições anteriores serão preservadas.`)) return;
    const e = onAdd({ name, terms, from }); setErr(e ?? "");
    if (!e) { setName(""); setTerms(Array(10).fill(null)); }
  };
  return (
    <SidePanel wide title="Condições de pagamento" sub={s.name} onClose={onClose} footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      <table className="tbl"><thead><tr><th>Condição</th><th>Prazos</th><th>Início da vigência</th><th>Cadastrada em</th><th>Responsável</th></tr></thead>
        <tbody>{list.map((c) => <tr key={c.id}><td>{c.name}{c.id === cur?.id && <span className="tag tag-ok ml-1">vigente</span>}</td><td>{c.terms.filter((t) => t !== null).join("/")} dias</td><td>{c.from ? fmtDate(c.from) : "—"}</td><td>{c.at ? new Date(c.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</td><td>{c.by || "—"}</td></tr>)}
          {!list.length && <tr><td colSpan={5} className="text-center text-muted-foreground">Nenhuma condição cadastrada.</td></tr>}</tbody></table>
      <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
        <div className="text-sm font-semibold">Nova condição</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field l="Nome da condição"><input className="inp h-8 w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Parcelado" /></Field>
          <Field l="Início da vigência"><DateInput value={from} onChange={setFrom} /></Field>
        </div>
        <div><span className="lbl">Prazos em dias (até 10; vazio ≠ zero)</span>
          <div className="mt-1 flex flex-wrap gap-1">{terms.map((t, i) => <label key={i} className="text-[11px]">P{i + 1}<br /><IntInput value={t} onChange={(v) => setTerms(terms.map((x, k) => (k === i ? v : x)))} /></label>)}</div></div>
        {err && <p className="text-destructive">{err}</p>}
        <button className="btn btn-primary" disabled={!name.trim() || !terms.some((t) => t !== null) || !from} onClick={add}>Adicionar condição</button>
      </div>
    </SidePanel>
  );
}
