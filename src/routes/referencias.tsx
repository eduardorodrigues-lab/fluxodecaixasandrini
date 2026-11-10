import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, IntInput, MoneyInput, PageHeader } from "@/components/kit";
import type { Params } from "@/lib/engine/types";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { uid, useApp } from "@/lib/store";
import { addSupplier, addSupplierCondition, condPeriods, currentCondition, invalidSupplierName, reactivateCondition, supplierConditions } from "@/lib/notas";
import { TermsEditor, termsLabel } from "@/components/TermsEditor";
import { todaySP } from "@/lib/engine/actions";
import { Field, SidePanel } from "@/components/NotaPanel";
import { Button } from "@/components/ui/button";
import { deleteSupplier, editSupplier, setSupplierActivity, supplierActive, supplierLinks } from "@/lib/fornecedores";
import type { Supplier } from "@/lib/engine/types";
import type { ScenarioData } from "@/lib/engine/types";

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
  const { user } = useApp();
  const [condOf, setCondOf] = useState<string | null>(null);
  const [newSup, setNewSup] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ativos");
  const [operation, setOperation] = useState<{ id: string; kind: "inativar" | "reativar" | "excluir" } | null>(null);
  const today = todaySP();
  const setP = (patch: Partial<Params>) => update((x) => { Object.assign(x.params, patch); });
  return (
    <div className="space-y-3">
      {newSup && <FornecedorPanel onCancel={() => setNewSup(false)} onSave={(f) => { const id = uid(); const e = update((x) => addSupplier(x, { id, ...f })); if (!e) { setNewSup(false); setCondOf(id); } return e; }} />}
      {editing && d.suppliers.some((s) => s.id === editing) && <FornecedorPanel initial={d.suppliers.find((s) => s.id === editing)} onCancel={() => setEditing(null)} onSave={(f) => { const e = update((x) => editSupplier(x, editing, f)); if (!e) setEditing(null); return e; }} />}
      {operation && <SupplierOperation d={d} operation={operation} onClose={() => setOperation(null)} onInactivate={() => setOperation({ id: operation.id, kind: "inativar" })} onConfirm={(from) => { const e = update((x) => operation.kind === "excluir" ? deleteSupplier(x, operation.id) : setSupplierActivity(x, operation.id, operation.kind === "reativar", from, new Date().toISOString(), user?.email ?? "")); if (!e) setOperation(null); return e; }} />}
      {condOf && d.suppliers.some((s) => s.id === condOf) && <CondicoesPanel d={d} supplierId={condOf} onClose={() => setCondOf(null)}
        onAdd={(c) => update((x) => addSupplierCondition(x, condOf, c, new Date().toISOString(), user?.email ?? "", today))}
        onReactivate={(id, from) => update((x) => reactivateCondition(x, condOf, id, from, new Date().toISOString(), user?.email ?? "", today))}
        onEdit={() => { setEditing(condOf); setCondOf(null); }} />}
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
        <div className="mb-2 flex justify-between"><span className="lbl">Fornecedores</span><button className="btn" onClick={() => setNewSup(true)}>+ Fornecedor</button></div>
        {d.suppliers.some((s) => invalidSupplierName(s.name)) && <p className="mb-2 text-destructive">{d.suppliers.filter((s) => invalidSupplierName(s.name)).length} fornecedor(es) sem nome válido ("Novo fornecedor" ou vazio) — abra para corrigir. Nada é excluído automaticamente.</p>}
        <label className="mb-2 flex items-center gap-2 text-xs">Situação<select className="inp" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></label>
        <table className="tbl"><thead><tr><th>Fornecedor</th><th>Apelidos</th><th>Situação</th><th>Condição vigente</th><th className="num">Condições</th><th>Ações</th></tr></thead>
          <tbody>{d.suppliers.filter((s) => statusFilter === "todos" || supplierActive(s, today) === (statusFilter === "ativos")).map((s) => { const c = currentCondition(s, today); const active = supplierActive(s, today); const future = s.activity?.filter((e) => e.from > today).sort((a, b) => a.from.localeCompare(b.from)).at(0); return (
            <tr key={s.id}>
              <td>{invalidSupplierName(s.name) ? <span className="tag tag-err">Corrigir nome{s.name.trim() ? `: ${s.name}` : ""}</span> : s.name}</td>
              <td className="max-w-48 whitespace-normal">{s.aliases?.join("; ") || "—"}</td>
              <td>{active ? "Ativo" : "Inativo"}{future && <div className="text-muted-foreground">{future.active ? "Reativação" : "Inativação"} em {fmtDate(future.from)}</div>}</td>
              <td>{c ? `${c.name} · ${termsLabel(c.terms)} dias` : "sem condição"}</td>
              <td className="num">{supplierConditions(s).length}</td>
              <td><div className="flex flex-wrap gap-1"><Button variant="outline" size="sm" onClick={() => setCondOf(s.id)}>Condições de pagamento</Button><Button variant="outline" size="sm" onClick={() => setEditing(s.id)}>Editar</Button><Button variant="outline" size="sm" onClick={() => setOperation({ id: s.id, kind: active ? "inativar" : "reativar" })}>{active ? "Inativar" : "Reativar"}</Button><Button variant="outline" size="sm" onClick={() => setOperation({ id: s.id, kind: "excluir" })}>Excluir</Button></div></td>
            </tr>); })}
            {!d.suppliers.some((s) => statusFilter === "todos" || supplierActive(s, today) === (statusFilter === "ativos")) && <tr><td colSpan={6} className="text-center text-muted-foreground">Nenhum fornecedor nesta situação.</td></tr>}</tbody></table>
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
  return (
    <SidePanel title={review ? "Revisar fornecedor" : initial ? "Editar fornecedor" : "Novo fornecedor"} onClose={onCancel} footer={review
      ? <><button className="btn" onClick={() => setReview(false)}>Voltar e editar</button><button className="btn btn-primary" onClick={() => setErr(onSave({ name, aliases, note }) ?? "")}>Confirmar fornecedor</button></>
      : <><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={bad} onClick={() => setReview(true)}>Revisar e confirmar</button></>}>
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

function CondicoesPanel({ d, supplierId, onClose, onAdd, onReactivate, onEdit }: { d: ScenarioData; supplierId: string; onClose: () => void; onAdd: (c: { name: string; terms: (number | null)[]; from: string | null; note: string }) => string | null; onReactivate: (id: string, from: string) => string | null; onEdit: () => void }) {
  const s = d.suppliers.find((x) => x.id === supplierId);
  if (!s) return null;
  const list = supplierConditions(s);
  const cur = currentCondition(s, todaySP());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [cnote, setCnote] = useState("");
  const [terms, setTerms] = useState<(number | null)[]>([null]);
  const [from, setFrom] = useState<string | null>(todaySP());
  const [react, setReact] = useState<{ id: string; from: string | null } | null>(null);
  const [err, setErr] = useState("");
  const dt = (at: string) => (at ? new Date(at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
  const add = () => {
    if (!window.confirm(`Confirmar a condição "${name}" (${termsLabel(terms)} dias, vigente a partir de ${fmtDate(from)})? As condições anteriores serão preservadas.`)) return;
    const e = onAdd({ name, terms, from, note: cnote }); setErr(e ?? "");
    if (!e) { setName(""); setCnote(""); setTerms([null]); setAdding(false); }
  };
  return (
    <SidePanel wide title="Fornecedor e condições de pagamento" sub={s.name} onClose={onClose} footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      <div className="mb-4 space-y-2"><div>{s.aliases?.join("; ") || "Sem apelidos"}</div><div>{s.note || "Sem observação"}</div><Button variant="outline" size="sm" onClick={onEdit}>Editar fornecedor</Button></div>
      <table className="tbl"><thead><tr><th>Condição</th><th>Prazos</th><th>Vigência</th><th>Cadastrada em</th><th>Responsável</th><th>Observação</th><th /></tr></thead>
        <tbody>{list.map((c) => <tr key={c.id}><td>{c.name}{c.id === cur?.id && <span className="tag tag-ok ml-1">vigente</span>}</td><td>{termsLabel(c.terms)} dias <span className="text-muted-foreground">({c.terms.filter((t) => t !== null).length} parc.)</span></td>
          <td>{condPeriods(c).map((p, i) => <div key={i} title={`Confirmado em ${dt(p.at)}${p.by ? ` por ${p.by}` : ""}`}>a partir de {p.from ? fmtDate(p.from) : "sempre"}{i > 0 && <span className="text-muted-foreground"> · {dt(p.at)} {p.by}</span>}</div>)}</td>
          <td>{dt(c.at)}</td><td>{c.by || "—"}</td><td>{c.note || "—"}</td>
          <td>{react?.id === c.id ? <span className="flex items-center gap-1"><DateInput value={react.from} onChange={(v) => setReact({ id: c.id, from: v })} /><button className="btn btn-primary" disabled={!react.from} onClick={() => { if (react.from && window.confirm(`Usar "${c.name}" como vigente a partir de ${fmtDate(react.from)}? Lançamentos já cadastrados não mudam.`)) { const e = onReactivate(c.id, react.from); setErr(e ?? ""); if (!e) setReact(null); } }}>Confirmar</button><button className="btn" onClick={() => setReact(null)}>Cancelar</button></span>
            : <button className="btn" onClick={() => setReact({ id: c.id, from: todaySP() })}>Usar como vigente a partir de…</button>}</td></tr>)}
          {!list.length && <tr><td colSpan={7} className="text-center text-muted-foreground">Nenhuma condição cadastrada.</td></tr>}</tbody></table>
      {!adding ? <button className="btn btn-primary mt-3" onClick={() => setAdding(true)}>Cadastrar condição de pagamento</button> :
      <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
        <div className="text-sm font-semibold">Nova condição</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field l="Nome da condição *"><input className="inp h-8 w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Parcelado" /></Field>
          <Field l="Início da vigência *"><DateInput value={from} onChange={setFrom} /></Field>
          <Field l="Observação (opcional, só informativa)"><input className="inp h-8 w-72" value={cnote} onChange={(e) => setCnote(e.target.value)} placeholder="Ex.: negociada só para o pedido 123" /></Field>
        </div>
        <TermsEditor terms={terms} onChange={setTerms} />
        <div className="flex gap-2"><button className="btn" onClick={() => setAdding(false)}>Cancelar</button><button className="btn btn-primary" disabled={!name.trim() || !terms.some((t) => t !== null) || !from} onClick={add}>Revisar e confirmar condição</button></div>
      </div>}
      {err && <p className="mt-2 text-destructive">{err}</p>}
    </SidePanel>
  );
}

function SupplierOperation({ d, operation, onClose, onConfirm, onInactivate }: { d: ScenarioData; operation: { id: string; kind: "inativar" | "reativar" | "excluir" }; onClose: () => void; onConfirm: (from: string) => string | null; onInactivate: () => void }) {
  const [from, setFrom] = useState<string | null>(todaySP());
  const [error, setError] = useState("");
  const s = d.suppliers.find((x) => x.id === operation.id);
  const links = supplierLinks(d, operation.id);
  const blocked = operation.kind === "excluir" && links.length > 0;
  return <SidePanel title={`${operation.kind === "excluir" ? "Excluir" : operation.kind === "inativar" ? "Inativar" : "Reativar"} fornecedor`} sub={s?.name ?? ""} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button>{blocked ? <Button onClick={onInactivate}>Inativar em vez de excluir</Button> : <Button disabled={!from} onClick={() => setError(onConfirm(from ?? "") ?? "")}>Confirmar</Button>}</>}>
    {blocked ? <p className="text-destructive">Exclusão bloqueada: possui {links.join(", ")}. Nenhum dado relacionado será apagado.</p> : operation.kind === "excluir" ? <p>Excluir este cadastro sem vínculos? A exclusão ficará no Histórico / Auditoria.</p> : <><Field l="Início da vigência"><DateInput value={from} onChange={setFrom} /></Field><p>Registros anteriores, condições e pagamentos permanecem disponíveis. A situação muda somente para novos lançamentos a partir desta data.</p></>}
    {!!s?.activity?.length && <div><h3 className="font-semibold">Histórico de situação</h3>{s.activity.map((e, i) => <p key={i}>{e.active ? "Reativado" : "Inativo"} desde {fmtDate(e.from)} · {new Date(e.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {e.by || "—"}</p>)}</div>}
    {error && <p className="text-destructive">{error}</p>}
  </SidePanel>;
}
