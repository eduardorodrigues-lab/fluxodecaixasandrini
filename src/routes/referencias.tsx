import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, IntInput, MoneyInput, PageHeader } from "@/components/kit";
import type { Params } from "@/lib/engine/types";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { uid, useApp } from "@/lib/store";
import { addSupplier, currentCondition, invalidSupplierName, supplierConditions } from "@/lib/notas";
import { termsLabel } from "@/components/TermsEditor";
import { todaySP } from "@/lib/engine/actions";
import { Field, guardClose, SidePanel } from "@/components/NotaPanel";
import { Button } from "@/components/ui/button";
import { supplierActive } from "@/lib/fornecedores";
import type { Supplier } from "@/lib/engine/types";
import { FornecedorManager } from "@/components/FornecedorManager";

export const Route = createFileRoute("/referencias")({
  head: () => ({
    meta: [
      { title: "Referências · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Fornecedores, prazos, categorias, metas, redutores e saldo inicial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [condOf, setCondOf] = useState<string | null>(null);
  const [newSup, setNewSup] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ativos");
  const today = todaySP();
  const setP = (patch: Partial<Params>) => update((x) => { Object.assign(x.params, patch); });
  return (
    <div className="space-y-3">
      {newSup && <FornecedorPanel onCancel={() => setNewSup(false)} onSave={(f) => { const id = uid(); const e = update((x) => addSupplier(x, { id, ...f })); if (!e) { setNewSup(false); setCondOf(id); } return e; }} />}
      {condOf && <FornecedorManager key={condOf} supplierId={condOf} onClose={() => setCondOf(null)} />}
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

      <section className="min-w-0 p-3">
        <div className="mb-2 flex justify-between"><span className="lbl">Fornecedores</span><button className="btn" onClick={() => setNewSup(true)}>+ Fornecedor</button></div>
        {d.suppliers.some((s) => invalidSupplierName(s.name)) && <p className="mb-2 text-destructive">{d.suppliers.filter((s) => invalidSupplierName(s.name)).length} fornecedor(es) sem nome válido ("Novo fornecedor" ou vazio) — abra para corrigir. Nada é excluído automaticamente.</p>}
        <label className="mb-2 flex items-center gap-2 text-xs">Situação<select className="inp" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></label>
        <table className="tbl table-fixed [&_td]:whitespace-normal [&_td]:break-words [&_th]:whitespace-normal"><thead><tr><th className="w-[30%]">Fornecedor</th><th className="w-[16%]">Situação</th><th>Condição vigente</th><th className="w-24">Ações</th></tr></thead>
          <tbody>{d.suppliers.filter((s) => statusFilter === "todos" || supplierActive(s, today) === (statusFilter === "ativos")).map((s) => { const c = currentCondition(s, today); const active = supplierActive(s, today); return (
            <tr key={s.id}>
              <td>{invalidSupplierName(s.name) ? "Corrigir nome" : s.name}{!!s.aliases?.length && <div className="text-muted-foreground">{s.aliases.join("; ")}</div>}</td>
              <td>{active ? "Ativo" : "Inativo"}</td>
              <td>{c ? `${c.name} · ${termsLabel(c.terms).replaceAll("/", " / ")} dias` : "Sem condição padrão"}<div className="text-muted-foreground">{supplierConditions(s).length} condição(ões)</div></td>
              <td><Button variant="outline" size="sm" onClick={() => setCondOf(s.id)}>Gerenciar</Button></td>
            </tr>); })}
            {!d.suppliers.some((s) => statusFilter === "todos" || supplierActive(s, today) === (statusFilter === "ativos")) && <tr><td colSpan={4} className="text-center text-muted-foreground">Nenhum fornecedor nesta situação.</td></tr>}</tbody></table>
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

function FornecedorPanel({ initial, onCancel, onSave }: { initial?: Supplier | undefined; onCancel: () => void; onSave: (f: { name: string; aliases: string[]; note: string }) => string | null }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [aliases, setAliases] = useState<string[]>(initial?.aliases ?? []);
  const [review, setReview] = useState(false);
  const [err, setErr] = useState("");
  const bad = invalidSupplierName(name);
  const dirty = name !== (initial?.name ?? "") || note !== (initial?.note ?? "") || JSON.stringify(aliases) !== JSON.stringify(initial?.aliases ?? []);
  return (
    <SidePanel title={review ? "Revisar fornecedor" : initial ? "Editar fornecedor" : "Novo fornecedor"} onClose={onCancel} dirty={dirty} footer={review
      ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" onClick={() => setErr(onSave({ name, aliases, note }) ?? "")}>Confirmar fornecedor</button></>
      : <><button className="btn" onClick={guardClose(dirty, onCancel)}>Cancelar</button><button className="btn btn-primary" disabled={bad} onClick={() => setReview(true)}>Revisar e confirmar</button></>}>
      {review ? <div className="space-y-2"><div><span className="lbl">Nome do fornecedor</span><div className="font-medium">{name.trim()}</div></div><div><span className="lbl">Observação</span><div>{note.trim() || "—"}</div></div><div><span className="lbl">Apelidos</span><div>{aliases.join("; ") || "—"}</div></div>{initial && <div className="border-t border-border pt-2">Antes: {initial.name} · {initial.aliases?.join("; ") || "sem apelidos"} · {initial.note || "sem observação"}</div>}</div>
        : <div className="space-y-3">
          <Field l="Nome do fornecedor *"><input className="inp h-8 w-full" placeholder="Novo fornecedor" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field l="Apelidos / nomes alternativos">{aliases.map((alias, i) => <div key={i} className="flex gap-2"><input aria-label={`Apelido ${i + 1}`} className="inp min-w-0 flex-1" value={alias} onChange={(e) => setAliases(aliases.map((a, k) => k === i ? e.target.value : a))} /><Button variant="outline" size="sm" onClick={() => setAliases(aliases.filter((_, k) => k !== i))}>Remover</Button></div>)}</Field>
          <Button variant="outline" size="sm" onClick={() => setAliases([...aliases, ""])}>Adicionar apelido</Button>
          <Field l="Observação (opcional)"><textarea className="inp min-h-16 w-full" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>}
      {err && <p className="text-destructive">{err}</p>}
    </SidePanel>
  );
}
