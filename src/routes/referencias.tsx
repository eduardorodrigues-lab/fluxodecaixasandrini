import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/kit";
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
      { title: "Cadastros · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Fornecedores, condições de pagamento, categorias e subgrupos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Cadastros · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Cadastros de fornecedores, categorias e subgrupos." },
    ],
  }),
  component: Page,
});

function Page() {
  const { active, update } = useApp();
  const d = active.data;
  const [condOf, setCondOf] = useState<string | null>(null);
  const [newSup, setNewSup] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ativos");
  const today = todaySP();
  const [tab, setTab] = useState("fornecedores");
  return (
    <div className="space-y-3">
      {newSup && <FornecedorPanel onCancel={() => setNewSup(false)} onSave={(f) => { const id = uid(); const e = update((x) => addSupplier(x, { id, ...f })); if (!e) { setNewSup(false); setCondOf(id); } return e; }} />}
      {condOf && <FornecedorManager key={condOf} supplierId={condOf} onClose={() => setCondOf(null)} />}
      <PageHeader title="Cadastros" />
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <Button variant={tab === "fornecedores" ? "default" : "outline"} onClick={() => setTab("fornecedores")}>Fornecedores</Button>
        <Button variant={tab === "categorias" ? "default" : "outline"} onClick={() => setTab("categorias")}>Categorias e subgrupos</Button>
      </div>
      {tab === "fornecedores" && (
      <section className="min-w-0 p-3">
        <div className="mb-2 flex justify-between"><span className="lbl">Fornecedores</span><Button variant="outline" size="sm" onClick={() => setNewSup(true)}>+ Fornecedor</Button></div>
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

      )}
      {tab === "categorias" && <div>
        <section className="min-w-0 overflow-auto p-3">
          <div className="mb-2 flex justify-between"><span className="lbl">Categorias e subgrupos</span><Button variant="outline" size="sm" onClick={() => update((x) => { x.categories.push({ id: uid(), name: "Novo subgrupo", kind: "despesa", group: "" }); })}>+ Subgrupo</Button></div>
          <table className="tbl"><thead><tr><th>Categoria</th><th>Nome do subgrupo</th></tr></thead><tbody>{d.categories.map((c) => (
            <tr key={c.id}>
              <td><select className="inp" value={c.kind} onChange={(e) => update((x) => { const item = x.categories.find((i) => i.id === c.id); if (item) item.kind = e.target.value as typeof c.kind; })}><option value="compra">Compra</option><option value="despesa">Despesa</option></select></td>
              <td><input className="inp w-44" defaultValue={c.name} onBlur={(e) => update((x) => { const item = x.categories.find((i) => i.id === c.id); if (item) item.name = e.target.value; })} /></td>
            </tr>
          ))}</tbody></table>
          <p className="mt-1 text-[11px] text-muted-foreground">Categoria é só Compra ou Despesa; planejada/efetuada são etapas do lançamento. Subgrupos com o mesmo nome somam juntos no fluxo.</p>
        </section>
      </div>}
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
    <SidePanel centered={review} title={review ? "Revisar fornecedor" : initial ? "Editar fornecedor" : "Novo fornecedor"} onClose={onCancel} dirty={dirty} footer={review
      ? <><button className="btn" onClick={() => setReview(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => setErr(onSave({ name, aliases, note }) ?? "")}>Confirmar fornecedor</button></>
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
