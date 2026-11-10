import { askConfirm } from "@/lib/decisions";
// Relatório de Pagamentos do Dia: baixas realizadas (base real), uma linha por baixa; estornos à parte.
import { useMemo, useState } from "react";
import { DateInput } from "@/components/kit";
import { accountName, NO_ACCOUNT } from "@/lib/engine/banco";
import { committedDate, expenseDate } from "@/lib/engine/engine";
import { todaySP } from "@/lib/engine/actions";
import { parcelLabels } from "@/lib/notas";
import type { ScenarioData } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";

const FORM: Record<string, string> = { pix: "Pix", ted: "TED", doc: "DOC", boleto: "Boleto" };
export interface DayPayRow { id: string; supplier: string; document: string; parcel: string; due: string | null; form: string; origin: string; isCard: boolean; amount: number; note: string; reversed: boolean; reversalNote: string }

/** Baixas com data = `date` (somente dados recebidos; não inclui previsões nem simulações). */
export function dayPayments(d: ScenarioData, date: string) {
  const labels = parcelLabels(d);
  const rows: DayPayRow[] = d.payments.filter((p) => p.date === date).map((p) => {
    const c = p.titleKind === "committed" ? d.committed.find((x) => x.id === p.titleId) : undefined;
    const e = p.titleKind === "expense" ? d.expenses.find((x) => x.id === p.titleId) : undefined;
    const t = c ?? e;
    const isCard = p.method === "cartao";
    const op = isCard ? d.cardOps.find((o) => o.id === p.cardOpId) : undefined;
    const card = d.cards.find((k) => k.id === op?.cardId);
    const supplier = e?.invoiceOf ? `Fatura ${d.cards.find((k) => k.id === e.invoiceOf!.cardId)?.name ?? "cartão"}` : d.suppliers.find((s) => s.id === t?.supplierId)?.name ?? "—";
    return {
      id: p.id, supplier, document: t?.document || (c?.purchaseCode ?? "") || "—", parcel: c ? labels.get(c.id) ?? "—" : "1/1",
      due: c ? committedDate(c) : e ? expenseDate(e) : null, form: p.form ? FORM[p.form]! : "Não informada",
      origin: isCard ? `Cartão ${card ? `${card.name} ••${card.last4}` : ""}`.trim() : p.accountId ? accountName(d, p.accountId) : NO_ACCOUNT,
      isCard, amount: p.amount, note: p.note, reversed: !!p.reversedAt, reversalNote: p.reversalNote,
    };
  }).sort((a, b) => Number(a.isCard) - Number(b.isCard) || a.origin.localeCompare(b.origin) || a.supplier.localeCompare(b.supplier));
  const valid = rows.filter((r) => !r.reversed);
  const sub = new Map<string, { origin: string; isCard: boolean; total: number }>();
  for (const r of valid) { const s = sub.get(r.origin) ?? { origin: r.origin, isCard: r.isCard, total: 0 }; s.total += r.amount; sub.set(r.origin, s); }
  const bank = valid.filter((r) => !r.isCard).reduce((a, r) => a + r.amount, 0);
  const card = valid.filter((r) => r.isCard).reduce((a, r) => a + r.amount, 0);
  return { rows: valid, reversed: rows.filter((r) => r.reversed), subtotals: [...sub.values()], bank, card, total: bank + card };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const HEAD = ["Fornecedor / Favorecido", "Documento", "Parcela", "Vencimento", "Forma de pagamento", "Conta / Cartão de origem", "Valor pago", "Observação"];

export function PagamentosDia() {
  const { base, active, canEdit, update, official } = useApp();
  const d = base.data; // sempre a base real, nunca simulação
  const [date, setDate] = useState<string | null>(todaySP());
  const [showRev, setShowRev] = useState(false);
  const [edit, setEdit] = useState<{ id: string; v: string } | null>(null);
  const [err, setErr] = useState("");
  const r = useMemo(() => (date ? dayPayments(d, date) : null), [d, date]);
  const editable = canEdit && active.isBase;
  const saveNote = async () => {
    if (!edit) return;
    if (!await askConfirm("Confirmar a alteração da observação? Ela ficará registrada no histórico.")) return;
    const e = update((x) => { const p = x.payments.find((y) => y.id === edit.id); if (p) p.note = edit.v; });
    setErr(e ?? ""); if (!e) setEdit(null);
  };
  const print = () => {
    if (!r || !date) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const tr = (x: DayPayRow) => `<tr><td>${esc(x.supplier)}</td><td>${esc(x.document)}</td><td>${x.parcel}</td><td>${fmtDate(x.due)}</td><td>${x.form}</td><td>${esc(x.origin)}${x.isCard ? " <i>(cartão — não debita banco)</i>" : ""}</td><td class="n">${fmtBRL(x.amount)}</td><td class="obs">${esc(x.note)}</td></tr>`;
    const subs = r.subtotals.map((s) => `<tr><td>${esc(s.origin)}${s.isCard ? " (cartão)" : ""}</td><td class="n">${fmtBRL(s.total)}</td></tr>`).join("");
    const sig = (t: string) => `<div class="sig"><b>${t}</b><p>Assinatura: __________________________</p><p>Nome: ______________________________</p><p>Cargo: ______________________________</p><p>Data da assinatura: ____/____/________</p></div>`;
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    w.document.write(`<html><head><title>Pagamentos do dia ${fmtDate(date)}</title><style>@page{size:A4 landscape;margin:10mm}body{font:10px sans-serif;color:#000}table{width:100%;border-collapse:collapse;margin-top:6px}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #999;padding:3px 4px;text-align:left;vertical-align:top}th{background:#eee}.n{text-align:right;white-space:nowrap}.obs{width:22%;min-height:18px}.hd{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:4px}.tot{margin-top:8px;page-break-inside:avoid}.sigs{display:flex;gap:40px;margin-top:28px;page-break-inside:avoid}.sig{flex:1}.sig p{margin:14px 0}</style></head><body>
<div class="hd"><div><b style="font-size:13px">${esc(official.orgName || "Grupo Sandrini")}</b><br/>Relatório de Pagamentos do Dia</div><div style="text-align:right">Data dos pagamentos: <b>${fmtDate(date)}</b><br/>Emitido em ${now}</div></div>
<table><thead><tr>${HEAD.map((h, i) => `<th${i === 6 ? ' class="n"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${r.rows.map(tr).join("") || `<tr><td colspan="8">Nenhum pagamento realizado nesta data.</td></tr>`}</tbody></table>
<div class="tot"><table style="width:50%"><thead><tr><th>Subtotal por conta / cartão</th><th class="n">Valor</th></tr></thead><tbody>${subs}
<tr><td>Saídas bancárias</td><td class="n">${fmtBRL(r.bank)}</td></tr><tr><td>Pago com cartão (vai para a fatura; não debita banco)</td><td class="n">${fmtBRL(r.card)}</td></tr><tr><th>Total pago no dia</th><th class="n">${fmtBRL(r.total)}</th></tr></tbody></table>
${r.reversed.length ? `<p>Estornos nesta data (não compõem o total): ${r.reversed.length}</p>` : ""}</div>
<div class="sigs">${sig("Responsável pela elaboração")}${sig("Responsável pela conferência / aprovação")}</div></body></html>`);
    w.document.close();
    w.onload = () => w.print();
    setTimeout(() => { try { w.print(); } catch { /* já impresso */ } }, 400);
  };
  const Table = ({ rows, rev }: { rows: DayPayRow[]; rev?: boolean }) => (
    <table className="tbl"><thead><tr>{HEAD.map((h, i) => <th key={h} className={i === 6 ? "num" : ""}>{h}</th>)}{rev && <th>Motivo do estorno</th>}</tr></thead>
      <tbody>{rows.map((x) => <tr key={x.id}><td>{x.supplier}</td><td>{x.document}</td><td>{x.parcel}</td><td>{fmtDate(x.due)}</td><td>{x.form}</td><td>{x.isCard ? <span className="tag tag-ok">{x.origin}</span> : x.origin}</td><td className="num">{fmtBRL(x.amount)}</td>
        <td className="min-w-[220px]">{!rev && edit?.id === x.id ? <span className="flex gap-1"><input className="inp h-7 w-full" value={edit.v} onChange={(e) => setEdit({ id: x.id, v: e.target.value })} /><button className="btn btn-primary" onClick={saveNote}>Salvar</button><button className="btn" onClick={() => setEdit(null)}>Cancelar</button></span>
          : <span className="flex items-center gap-2"><span className="flex-1">{x.note || <span className="text-muted-foreground">—</span>}</span>{!rev && editable && <button className="btn" onClick={() => setEdit({ id: x.id, v: x.note })}>Editar</button>}</span>}</td>
        {rev && <td>{x.reversalNote}</td>}</tr>)}
        {!rows.length && <tr><td colSpan={rev ? 9 : 8} className="text-center text-muted-foreground">{rev ? "Nenhum estorno nesta data." : "Nenhum pagamento realizado nesta data."}</td></tr>}</tbody></table>
  );
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3 p-3 text-xs">
        <label><span className="lbl">Data dos pagamentos</span><DateInput value={date} onChange={setDate} /></label>
        <button className="btn" disabled={!r} onClick={print}>Imprimir / Salvar em PDF</button>
        <label className="flex items-center gap-1"><input type="checkbox" checked={showRev} onChange={(e) => setShowRev(e.target.checked)} /> Consultar estornos ({r?.reversed.length ?? 0})</label>
        {!active.isBase && <span className="tag tag-warn">Relatório mostra apenas pagamentos reais; simulações não entram.</span>}
      </div>
      {err && <p className="text-destructive">{err}</p>}
      {r && <>
        <div className="card overflow-auto"><Table rows={r.rows} /></div>
        <div className="card grid gap-1 p-3 text-xs md:w-1/2">
          {r.subtotals.map((s) => <div key={s.origin} className="flex justify-between"><span>{s.origin}{s.isCard && " (cartão)"}</span><b className="tabular-nums">{fmtBRL(s.total)}</b></div>)}
          <div className="mt-1 flex justify-between border-t border-border pt-1"><span>Saídas bancárias</span><b className="tabular-nums">{fmtBRL(r.bank)}</b></div>
          <div className="flex justify-between"><span>Pago com cartão (vai para a fatura; não debita banco)</span><b className="tabular-nums">{fmtBRL(r.card)}</b></div>
          <div className="flex justify-between text-sm"><span>Total pago no dia</span><b className="tabular-nums">{fmtBRL(r.total)}</b></div>
        </div>
        {showRev && <div className="card overflow-auto"><div className="p-2 font-semibold">Estornos (não compõem o total)</div><Table rows={r.reversed} rev /></div>}
      </>}
    </div>
  );
}
