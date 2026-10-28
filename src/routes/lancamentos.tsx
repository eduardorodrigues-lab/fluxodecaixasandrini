import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, IntInput, MoneyInput, PageHeader, ProfileBadge } from "@/components/kit";
import { committedDate, distributePlanned, expenseDate } from "@/lib/engine/engine";
import type { Committed, Expense, Planned, ScenarioData } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/lancamentos")({
  head: () => ({
    meta: [
      { title: "Lançamentos · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Compras planejadas, compras comprometidas e despesas." },
      { property: "og:title", content: "Lançamentos · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Compras planejadas, comprometidas e despesas." },
    ],
  }),
  component: Page,
});

type Tab = "planned" | "committed" | "expenses";
const TABS: { k: Tab; l: string }[] = [{ k: "planned", l: "Compras planejadas" }, { k: "committed", l: "Compras comprometidas (realizadas)" }, { k: "expenses", l: "Despesas" }];

function Page() {
  const { active, update } = useApp();
  const d = active.data;
  const [tab, setTab] = useState<Tab>("planned");
  const sup = (id: string) => d.suppliers.find((s) => s.id === id);
  const cats = (kind: string) => d.categories.filter((c) => c.kind === kind);
  const set = <K extends Tab>(k: K, id: string, patch: Partial<ScenarioData[K][number]>) => update((x) => { const it = (x[k] as { id: string }[]).find((i) => i.id === id); if (it) Object.assign(it, patch); });
  const del = (k: Tab, id: string) => update((x) => { (x[k] as { id: string }[]) = (x[k] as { id: string }[]).filter((i) => i.id !== id); });
  const add = () => update((x) => {
    const s0 = x.suppliers[0]?.id ?? "";
    const today = x.params.startDate;
    if (tab === "planned") x.planned.push({ id: uid(), supplierId: s0, purchaseCode: "", document: "", value: 0, baseDate: today, categoryId: cats("planejada")[0]?.id ?? "", notes: "", status: "ativo" });
    if (tab === "committed") x.committed.push({ id: uid(), supplierId: s0, purchaseCode: "", document: "", value: 0, dueDate: today, extensionDate: null, extensionInfo: "", legacyAbatement: null, categoryId: cats("comprometida")[0]?.id ?? "", notes: "", status: "ativo" });
    if (tab === "expenses") x.expenses.push({ id: uid(), supplierId: s0, document: "", value: 0, baseDate: today, termDays: 0, extensionDate: null, categoryId: cats("despesa")[0]?.id ?? "", notes: "", status: "ativo" });
  });
  const SupSel = ({ v, on }: { v: string; on: (v: string) => void }) => <select className="inp w-40" value={v} onChange={(e) => on(e.target.value)}>{d.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
  const CatSel = ({ v, kind, on }: { v: string; kind: string; on: (v: string) => void }) => <select className="inp w-36" value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{cats(kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
  const StSel = ({ v, on }: { v: string; on: (v: "ativo" | "cancelado") => void }) => <select className="inp" value={v} onChange={(e) => on(e.target.value as "ativo" | "cancelado")}><option value="ativo">ativo</option><option value="cancelado">cancelado</option></select>;
  const Txt = ({ v, on, w = "w-24" }: { v: string; on: (v: string) => void; w?: string }) => <input className={`inp ${w}`} defaultValue={v} onBlur={(e) => e.target.value !== v && on(e.target.value)} />;

  return (
    <div>
      <PageHeader title="Lançamentos" sub="Alterações recalculam o fluxo imediatamente (sem botão Distribuir). Compra comprometida ≠ pagamento liquidado.">
        <ProfileBadge /><button className="btn btn-primary" onClick={add}>+ Novo lançamento</button>
      </PageHeader>
      <div className="mb-2 flex border-b border-border">{TABS.map((t) => <button key={t.k} className={`tab ${tab === t.k ? "tab-on" : ""}`} onClick={() => setTab(t.k)}>{t.l} ({(d[t.k] as unknown[]).length})</button>)}</div>
      <div className="card overflow-auto">
        {tab === "planned" && (
          <table className="tbl"><thead><tr><th>Fornecedor</th><th>Cód. compra</th><th>Documento</th><th className="num">Valor orçado</th><th>Data base</th><th>Categoria</th><th>Vínculo / parcelas (perfil ativo)</th><th>Estado</th><th>Obs.</th><th /></tr></thead>
            <tbody>{d.planned.map((p: Planned) => {
              const r = distributePlanned(p, sup(p.supplierId), d.committed, d.params.profile);
              return (
                <tr key={p.id}>
                  <td><SupSel v={p.supplierId} on={(v) => set("planned", p.id, { supplierId: v })} /></td>
                  <td><Txt v={p.purchaseCode} on={(v) => set("planned", p.id, { purchaseCode: v })} /></td>
                  <td><Txt v={p.document} on={(v) => set("planned", p.id, { document: v })} /></td>
                  <td><MoneyInput value={p.value} onChange={(v) => set("planned", p.id, { value: v ?? 0 })} /></td>
                  <td><DateInput value={p.baseDate} onChange={(v) => v && set("planned", p.id, { baseDate: v })} /></td>
                  <td><CatSel v={p.categoryId} kind="planejada" on={(v) => set("planned", p.id, { categoryId: v })} /></td>
                  <td className="text-[11px]">
                    <span className={`tag ${r.health === "ok" ? "tag-ok" : r.health === "erro" ? "tag-err" : "tag-warn"}`}>{r.health}</span> {r.linked} efetuada(s) vinculada(s)
                    <div className="text-muted-foreground">{r.parcels.map((pc) => `${fmtDate(pc.date)} ${fmtBRL(pc.amount)}`).join(" · ") || "sem parcelas"}</div>
                    {d.params.profile === "legado" && <div className={r.R < 0 ? "neg" : "text-muted-foreground"}>P {fmtBRL(r.P)} − Q {fmtBRL(r.Q)} = R {fmtBRL(r.R)} · macro Currency {r.macroValue.toFixed(4)}</div>}
                  </td>
                  <td><StSel v={p.status} on={(v) => set("planned", p.id, { status: v })} /></td>
                  <td><Txt v={p.notes} w="w-32" on={(v) => set("planned", p.id, { notes: v })} /></td>
                  <td><button className="btn btn-danger" onClick={() => confirm("Excluir lançamento?") && del("planned", p.id)}>Excluir</button></td>
                </tr>
              );
            })}</tbody></table>
        )}
        {tab === "committed" && (
          <table className="tbl"><thead><tr><th>Fornecedor</th><th>Cód. compra</th><th>Documento</th><th className="num">Valor</th><th>Venc. original</th><th>Prorrogação</th><th>Info prorrog. (K, informativo)</th><th className="num">Base abatimento legado (M)</th><th>Categoria</th><th>Data no fluxo</th><th>Estado</th><th /></tr></thead>
            <tbody>{d.committed.map((c: Committed) => (
              <tr key={c.id}>
                <td><SupSel v={c.supplierId} on={(v) => set("committed", c.id, { supplierId: v })} /></td>
                <td><Txt v={c.purchaseCode} on={(v) => set("committed", c.id, { purchaseCode: v })} />{c.purchaseCode && !d.planned.some((p) => p.purchaseCode === c.purchaseCode) && <div className="tag tag-warn">sem planejada</div>}</td>
                <td><Txt v={c.document} on={(v) => set("committed", c.id, { document: v })} /></td>
                <td><MoneyInput value={c.value} onChange={(v) => set("committed", c.id, { value: v ?? 0 })} /></td>
                <td><DateInput value={c.dueDate} onChange={(v) => v && set("committed", c.id, { dueDate: v })} /></td>
                <td><DateInput allowEmpty value={c.extensionDate} onChange={(v) => set("committed", c.id, { extensionDate: v })} /></td>
                <td><Txt v={c.extensionInfo} w="w-32" on={(v) => set("committed", c.id, { extensionInfo: v })} /></td>
                <td><MoneyInput value={c.legacyAbatement} onChange={(v) => set("committed", c.id, { legacyAbatement: v })} />{c.legacyAbatement === null && <div className="tag tag-err">ausente</div>}</td>
                <td><CatSel v={c.categoryId} kind="comprometida" on={(v) => set("committed", c.id, { categoryId: v })} /></td>
                <td>{fmtDate(committedDate(c, d.params.profile))}</td>
                <td><StSel v={c.status} on={(v) => set("committed", c.id, { status: v })} /></td>
                <td><button className="btn btn-danger" onClick={() => confirm("Excluir lançamento?") && del("committed", c.id)}>Excluir</button></td>
              </tr>
            ))}</tbody></table>
        )}
        {tab === "expenses" && (
          <table className="tbl"><thead><tr><th>Fornecedor</th><th>Documento</th><th className="num">Valor</th><th>Data base</th><th>Prazo G (dias)</th><th>Prorrogação</th><th>Categoria</th><th>Data no fluxo</th><th>Estado</th><th>Obs.</th><th /></tr></thead>
            <tbody>{d.expenses.map((e: Expense) => {
              const dt = expenseDate(e, d.params);
              return (
                <tr key={e.id}>
                  <td><SupSel v={e.supplierId} on={(v) => set("expenses", e.id, { supplierId: v })} /></td>
                  <td><Txt v={e.document} on={(v) => set("expenses", e.id, { document: v })} /></td>
                  <td><MoneyInput value={e.value} onChange={(v) => set("expenses", e.id, { value: v ?? 0 })} /></td>
                  <td><DateInput value={e.baseDate} onChange={(v) => v && set("expenses", e.id, { baseDate: v })} /></td>
                  <td><IntInput value={e.termDays} onChange={(v) => set("expenses", e.id, { termDays: v })} /></td>
                  <td><DateInput allowEmpty value={e.extensionDate} onChange={(v) => set("expenses", e.id, { extensionDate: v })} /></td>
                  <td><CatSel v={e.categoryId} kind="despesa" on={(v) => set("expenses", e.id, { categoryId: v })} /></td>
                  <td>{dt ? fmtDate(dt) : <span className="tag tag-warn">não distribuída</span>}</td>
                  <td><StSel v={e.status} on={(v) => set("expenses", e.id, { status: v })} /></td>
                  <td><Txt v={e.notes} w="w-32" on={(v) => set("expenses", e.id, { notes: v })} /></td>
                  <td><button className="btn btn-danger" onClick={() => confirm("Excluir lançamento?") && del("expenses", e.id)}>Excluir</button></td>
                </tr>
              );
            })}</tbody></table>
        )}
      </div>
    </div>
  );
}
