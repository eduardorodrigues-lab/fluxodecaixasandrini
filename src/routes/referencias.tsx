import { normalizeSupplierName } from "@/lib/fornecedores";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/kit";
import { uid, useApp } from "@/lib/store";
import { addSupplier, currentCondition, invalidSupplierName, supplierConditions } from "@/lib/notas";
import { termsLabel } from "@/components/TermsEditor";
import { todaySP } from "@/lib/engine/actions";
import { Field, SidePanel } from "@/components/NotaPanel";
import { askCloseDraft } from "@/lib/decisions";
import { Button } from "@/components/ui/button";
import { supplierActive } from "@/lib/fornecedores";
import type { Supplier } from "@/lib/engine/types";
import { FornecedorManager, type Operation } from "@/components/FornecedorManager";
import { SupplierCreateCard } from "@/components/SupplierForm";
import { createSupplierFull, emptySupplierInput, type SupplierInput } from "@/lib/fornecedores";
import { SupplierDirectory } from "@/components/SupplierDirectory";
import { SupplierMergePanel } from "@/components/SupplierMergePanel";
import { useOperationSave } from '@/components/useOperationSave';
import { useFormDraft } from '@/components/useFormDraft';

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
  const { active, update, canEdit } = useApp();
  const saving = useOperationSave();
  const [supplierId, setSupplierId] = useState(()=>{try {const key='fluxo:new-supplier-id';const id=sessionStorage.getItem(key)??uid();sessionStorage.setItem(key,id);return id;}catch{return uid();}});
  const d = active.data;
  const [condOf, setCondOf] = useState<string | null>(null);
  const [condOp, setCondOp] = useState<Operation | undefined>(undefined);
  const [newSup, setNewSup] = useState(false);
  const [picked, setPicked] = useState<string[]>([]); const [merging, setMerging] = useState(false);
  const canMerge = canEdit && active.isBase;
  const today = todaySP();
  const [tab, setTab] = useState("fornecedores");
  return (
    <div className="space-y-3">
      {saving.error && !newSup && <p role="alert" className="text-destructive">{saving.error}</p>}
      <PageHeader title="Cadastros" />
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <Button variant={tab === "fornecedores" ? "default" : "outline"} onClick={() => setTab("fornecedores")}>Fornecedores</Button>
        <Button variant={tab === "categorias" ? "default" : "outline"} onClick={() => setTab("categorias")}>Categorias e subgrupos</Button>
      </div>
      {tab === "fornecedores" && <SupplierDirectory d={d} today={today} canEdit={canEdit} onNew={() => { setMerging(false); setCondOf(null); setNewSup(true); }} onOpen={(id, op) => { setMerging(false); setNewSup(false); setCondOp(op); setCondOf(id); }}
        picked={canMerge ? picked : []} {...(canMerge ? { onPick: setPicked, onMerge: () => { setNewSup(false); setCondOf(null); setMerging(true); } } : {})}
        editor={merging ? <SupplierMergePanel key={picked.join(",")} ids={picked} onClose={() => setMerging(false)} onDone={(id) => { setMerging(false); setPicked([]); setCondOf(id); setCondOp(undefined); }} /> : newSup ? <NewSupplier recordId={supplierId} onDone={(id) => { setNewSup(false); if (id) { setCondOf(null); const next = uid(); setSupplierId(next); try { sessionStorage.setItem('fluxo:new-supplier-id', next); } catch { /* sem armazenamento */ } } }} />
          : condOf ? <FornecedorManager inline key={`${condOf}-${condOp?.kind ?? ""}-${condOp?.id ?? ""}`} supplierId={condOf} initialOp={condOp} onClose={() => { setCondOf(null); setCondOp(undefined); }} /> : undefined} />}
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

function NewSupplier({ recordId, onDone }: { recordId: string; onDone: (createdId: string | null) => void }) {
  const app = useApp(); const saving = useOperationSave();
  const [v, setV] = useState<SupplierInput>(emptySupplierInput());
  const protection = useFormDraft({ user: app.user?.id ?? "", org: app.official.orgId, mode: app.active.id, form: "novo-fornecedor", record: recordId }, v, (x) => { setV({ ...emptySupplierInput(), ...x }); });
  const dirty = JSON.stringify(v) !== JSON.stringify(emptySupplierInput());
  const cancel = async () => {
    if (saving.protected) { protection.flush(); onDone(null); return; }
    if (!dirty) { protection.clear(); onDone(null); return; }
    const choice = await askCloseDraft();
    if (choice === "keep") { protection.flush(); onDone(null); } else if (choice === "discard" && protection.clear()) onDone(null);
  };
  const confirm = async () => {
    const at = new Date().toISOString(); const by = app.user?.email ?? "";
    const ok = await saving.saveMutation(app.active.data, (x) => { createSupplierFull(x, recordId, v, at, by); }, [recordId]);
    if (ok) { protection.clear(); onDone(recordId); }
  };
  return <>{protection.recovered && <p role="status">Preenchimento recuperado; revise antes de confirmar.</p>}
    <SupplierCreateCard d={app.active.data} id={recordId} value={v} onChange={setV} dirty={dirty} onCancel={() => void cancel()} onConfirm={() => void confirm()} saving={saving.saving} saveLabel={saving.saving || saving.retrying ? saving.saveLabel : undefined} error={saving.error ?? ""} /></>;
}
