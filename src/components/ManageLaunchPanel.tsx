import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput, MoneyInput } from "@/components/kit";
import { CatSubFields, Field, SidePanel, SupplierSearch } from "@/components/NotaPanel";
import { BaixasList, PagamentoPanel } from "@/components/BancoPanels";
import { applyManaged, flowImpact, managedDocument, redistributeSelected, validateManualRemaining, type LaunchRef, type ManagedParcel } from "@/lib/manageLaunch";
import { eligiblePlanned, selectedPlanned, parcelSituation, launchSummary } from "@/lib/manageLaunchPresentation";
import { HistoryView } from "@/components/HistoryView";
import { askConfirm } from "@/lib/decisions";
import { currentParcels, effectivateManual } from "@/lib/efetivacao";
import { distributePlanned } from "@/lib/engine/engine";
import { guardClose } from "@/components/NotaPanel";
import { registerPaymentBatch, coverTitleWithCard } from "@/lib/engine/banco";
import { reversePayment, todaySP } from "@/lib/engine/actions";
import { supplierIdentity } from "@/lib/supplierIdentity";
import { splitOrigin } from "@/lib/originText";
import { fmtBRL } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { uid, useApp } from "@/lib/store";
import type { ScenarioData } from "@/lib/engine/types";

export function ManageLaunchPanel({ launch, onClose }: { launch: LaunchRef; onClose: () => void }) {
  const { active, update, canEdit, user, audit, allSims } = useApp();
  const d = active.data;
  const [initial] = useState(() => managedDocument(d, launch));
  const [parcels, setParcels] = useState(initial.parcels);
  const [fields, setFields] = useState(initial.fields);
  const [tab, setTab] = useState("Resumo"), [reason, setReason] = useState("");
  const [eff, setEff] = useState(false), [selected, setSelected] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null), [checked, setChecked] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState<string | null>(todaySP());
  const [review, setReview] = useState<{ data: ScenarioData; impacts: ReturnType<typeof flowImpact> } | null>(null);
  const [error, setError] = useState(""), [pay, setPay] = useState<ManagedParcel | null>(null);
  const [effId] = useState(() => `ef-${uid()}`);
  const [spreadTotal, setSpreadTotal] = useState<number | null>(null);
  const [spreadKeys, setSpreadKeys] = useState<string[]>([]);
  const dirty = eff || JSON.stringify(parcels) !== JSON.stringify(initial.parcels) || JSON.stringify(fields) !== JSON.stringify(initial.fields);
  const patch = (key: string, p: Partial<ManagedParcel>) => { setParcels((all) => all.map((r) => r.key === key ? { ...r, ...p } : r)); setChecked(false); };
  const eligible = eligiblePlanned(launch, parcels);
  const chosen = selectedPlanned(launch, parcels, selected);
  const chosenKeys = chosen.map((p) => p.key);
  const chosenTotal = chosen.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const summary = launchSummary(d, launch, parcels);
  const category = d.categories.find((c) => c.id === fields.categoryId);
  const situation = (p: ManagedParcel) => parcelSituation(p, launch.kind === "planned");
  const focus = (p: ManagedParcel) => p.key === launch.parcel || (p.id === launch.id && launch.kind !== "planned");
  const shown = (v: string | undefined) => v?.trim() || "Não informado";
  const nextDue = parcels.filter((p) => p.status !== "cancelado" && (launch.kind === "planned" ? p.status === "ativo" : (p.amount ?? 0) > p.paid)).sort((a, b) => (a.extension ?? a.date ?? "9999").localeCompare(b.extension ?? b.date ?? "9999"));
  const rest = parcels.filter((p) => !chosenKeys.includes(p.key) && p.status !== "cancelado");
  const original = initial.parcels.reduce((s, p) => s + p.original, 0);
  const history = useMemo(() => active.isBase ? audit.filter((a) => a.changes.some((c) => initial.records.some((r) => r.id === c.id))) : (allSims.find((s) => s.id === active.id)?.history ?? []).filter((a) => a.changes.some((c) => initial.records.some((r) => r.id === c.id))).map((a, i) => ({ id: String(i), at: a.at, user_email: a.user, changes: a.changes })), [audit, initial, active.id, active.isBase, allSims]);
  const build = (base: ScenarioData) => {
    if (eff) {
      const pl = base.planned.find((p) => p.id === launch.id);
      if (!pl || distributePlanned(pl, base.suppliers.find((s) => s.id === pl.supplierId), base.committed, base.params.profile, base.effectivations).health !== "ok") throw new Error("Planejamento com abatimento pendente. Confira os vínculos antes de efetivar.");
    }
    const plannedDraft = eff ? parcels.map((p) => chosenKeys.includes(p.key) ? initial.parcels.find((old) => old.key === p.key) ?? p : p) : parcels;
    applyManaged(base, { ref: launch, before: initial.parcels, parcels: plannedDraft, fields, initialFields: initial.fields, reason, at: new Date().toISOString(), by: user?.email ?? "" });
    if (!eff) return;
    if (!reason.trim()) throw new Error("Informe a justificativa da efetivação.");
    const err = validateManualRemaining(remaining, checked, rest); if (err) throw new Error(err);

    if (!chosen.length || chosen.some((p) => p.status === "cancelado" || p.amount === null || p.amount <= 0 || !p.date)) throw new Error("Selecione parcelas ativas com valores e vencimentos conferidos.");
    if (!effectiveDate) throw new Error("Informe a data da efetivação.");
    const current = currentParcels(d, launch.id);
    effectivateManual(base, { id: effId, plannedId: launch.id, at: new Date().toISOString(), effectiveDate, document: fields.document, purchaseCode: fields.purchaseCode, selected: chosenKeys,
      eff: chosen.map((p) => ({ amount: p.amount ?? 0, date: p.date ?? "" })), rest: rest.map((p) => ({ id: p.key, amount: p.amount ?? 0, date: p.extension ?? p.date ?? "" })),
      substituted: current.filter((p) => chosenKeys.includes(p.key)).reduce((s, p) => s + p.amount, 0), rule: `${reason} · saldo restante informado e confirmado: ${fmtBRL(remaining)} · ${user?.email ?? ""}` });
    chosen.forEach((p, i) => { const title = base.committed.find((c) => c.id === `${effId}-${i + 1}`); if (title && p.extension) { title.extensionDate = p.extension; title.extensionHistory.push({ at: new Date().toISOString(), from: null, to: p.extension, note: reason }); } });
  };
  const prepare = () => {
    try { const next = structuredClone(d); build(next); setReview({ data: next, impacts: flowImpact(d, next) }); setError(""); } catch (e) { setError((e as Error).message); }
  };
  const confirm = () => { const e = update(build); if (e) setError(e); else onClose(); };
  const changeSelection = (keys: string[]) => { setSelected(keys); setRemaining(null); setChecked(false); };
  const labels = ["Resumo", "Parcelas", "Dados do documento", "Histórico"];
  const finance = [["Planejado original", launch.kind === "planned" ? initial.record.value : null], ["Saldo restante previsto", summary.remaining], ["Efetivado", summary.effective], ["Pago", summary.paid], ["Efetivado em aberto", summary.open]] as const;
  const startEffectivation = (keys: string[]) => { changeSelection(keys); setEff(true); setSpreadKeys([]); setError(""); };
  if (pay) return <PagamentoPanel d={d} kind={launch.kind === "expense" ? "expense" : "committed"} titleId={pay.id} label={`${initial.fields.document} · ${pay.label}`} onCancel={() => setPay(null)} onConfirm={(r) => {
    const kind = launch.kind === "expense" ? "expense" : "committed";
    const e = update((x) => r.origin === "conta" ? registerPaymentBatch(x, { batchId: uid(), titleKind: kind, titleId: pay.id, lines: r.lines, note: r.note, form: r.form }) : coverTitleWithCard(x, { id: uid(), at: new Date().toISOString(), by: user?.email ?? "", titleKind: kind, titleId: pay.id, cardId: r.cardId, date: r.date, amount: r.amount, fee: r.fee, installments: r.installments, form: "boleto" }));
    if (e) { setError(e); return false; } onClose(); return true;
  }} />;
  return <SidePanel expanded wide centered={!!review} title={review ? "Revisar lançamento" : "Gerenciar lançamento"} sub={`${supplierIdentity(d, initial.record).name} · Documento ${initial.fields.document || "Não informado"} · Pedido ${initial.fields.purchaseCode || "Não informado"}`} onClose={onClose} dirty={dirty} footer={review ? <><Button variant="outline" onClick={() => setReview(null)}>Voltar</Button><Button variant="outline" onClick={guardClose(dirty, onClose)}>Cancelar</Button><Button disabled={!canEdit} onClick={confirm}>Confirmar alterações</Button></> : <><Button variant="outline" onClick={guardClose(dirty, onClose)}>Cancelar</Button><Button disabled={!canEdit || !dirty} onClick={prepare}>Revisar antes de salvar</Button></>}>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {review ? <>
      <table className="tbl"><thead><tr><th>Parcela</th><th>Escopo</th><th>Antes → depois</th><th>Vencimento → depois</th><th>Status → depois</th></tr></thead><tbody>{parcels.map((p) => { const b = initial.parcels.find((x) => x.key === p.key); return <tr key={p.key}><td>{p.label}</td><td>{chosenKeys.includes(p.key) && eff ? "Efetivar" : JSON.stringify(b) === JSON.stringify(p) ? "Não afetada" : "Alterada"}</td><td>{fmtBRL(b?.original)} → {fmtBRL(p.amount)}</td><td>{fmtDate(b?.extension ?? b?.date)} → {fmtDate(p.extension ?? p.date)}</td><td>{b?.status} → {eff && chosenKeys.includes(p.key) ? "Efetivado" : p.status === "cancelado" ? "Cancelado (efeito futuro zero)" : p.status}</td></tr>; })}</tbody></table>
      {JSON.stringify(fields) !== JSON.stringify(initial.fields) && <div><h3 className="font-semibold">Dados compartilhados — documento inteiro</h3>{(Object.keys(fields) as (keyof typeof fields)[]).filter((k) => fields[k] !== initial.fields[k]).map((k) => <p key={k}>{({ supplierId: "Fornecedor", categoryId: "Subgrupo", purchaseCode: "Pedido", document: "Documento", notes: "Descrição" })[k]}: {k === "supplierId" ? supplierIdentity(d, { supplierId: initial.fields[k] }).name : k === "categoryId" ? d.categories.find((c) => c.id === initial.fields[k])?.name : initial.fields[k]} → {k === "supplierId" ? supplierIdentity(d, { supplierId: fields[k] }).name : k === "categoryId" ? d.categories.find((c) => c.id === fields[k])?.name : fields[k]}</p>)}</div>}
      {eff && <p>Saldo restante previsto confirmado manualmente: <b>{fmtBRL(remaining)}</b>. Efetivar não registra pagamento.</p>}
      <p>Justificativa: {reason || "Alteração de dados do documento"}</p>
      <p className="text-muted-foreground">Confirmar prepara alterações não salvas; a base só é gravada no botão Salvar do sistema.</p><h3 className="font-semibold">Impacto por data no fluxo</h3><div className="max-h-64 overflow-auto"><table className="tbl"><thead><tr><th>Data</th><th>Saídas antes → depois</th><th>Saldo final antes → depois</th></tr></thead><tbody>{review.impacts.map((p) => <tr key={p.date}><td>{fmtDate(p.date)}</td><td>{fmtBRL(p.before)} → {fmtBRL(p.after)}</td><td>{fmtBRL(p.balanceBefore)} → {fmtBRL(p.balanceAfter)}</td></tr>)}</tbody></table>{!review.impacts.length && <p>Sem alteração financeira no período 2025–2030.</p>}</div>
    </> : <>
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">{labels.map((l) => <Button key={l} size="sm" variant={tab === l ? "default" : "outline"} onClick={() => setTab(l)}>{l}</Button>)}</div>
      {tab === "Resumo" && <>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 border-b border-border pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {[["Fornecedor", supplierIdentity(d, initial.record).name], ["Categoria / subgrupo", category ? `${category.kind === "compra" ? "Compra" : "Despesa"} / ${category.name}` : ""], ["Pedido", fields.purchaseCode], ["Documento", fields.document], ["Descrição", splitOrigin(fields.notes).text], ["Parcelas", `${parcels.length} · ${Object.entries(parcels.reduce<Record<string, number>>((counts, p) => { const label = situation(p); counts[label] = (counts[label] ?? 0) + 1; return counts; }, {})).map(([label, count]) => `${count} ${label.toLocaleLowerCase("pt-BR")}`).join(" · ")}`]].map(([label, value]) => <div key={label}><dt className="lbl">{label}</dt><dd className="break-words font-medium">{shown(value)}</dd></div>)}
        </dl>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">{finance.map(([label, value]) => <div key={label}><dt className="lbl">{label}</dt><dd className="font-semibold tabular-nums">{value === null ? "Não se aplica" : fmtBRL(value)}</dd></div>)}</dl>
        {summary.linkedTitles > 0 && <p>{summary.linkedTitles} parcela(s) já efetivada(s) vinculada(s). O saldo restante previsto é separado do efetivado e não compõe o aberto.</p>}
        <section><h3 className="font-semibold">Próximos vencimentos</h3><div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">{nextDue.slice(0, 3).map((p) => <p key={p.key}>Parcela {p.label} · {p.extension || p.date ? fmtDate(p.extension ?? p.date) : "Não informado"} · {fmtBRL(p.amount)} · {situation(p)}</p>)}{!nextDue.length && <p>Sem parcelas pendentes.</p>}</div></section>
        <section><h3 className="mb-2 font-semibold">Prévia das parcelas</h3><table className="tbl"><thead><tr><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Situação</th></tr></thead><tbody>{parcels.map((p) => <tr key={p.key} className={focus(p) ? "launch-focus" : ""}><td>{p.label}{focus(p) && <span className="block text-warning-foreground">Parcela em destaque</span>}</td><td>{fmtBRL(p.status === "cancelado" ? p.original : p.amount)}</td><td>{p.extension || p.date ? fmtDate(p.extension ?? p.date) : "Não informado"}</td><td>{situation(p)}</td></tr>)}</tbody></table></section>
        <Button variant="outline" onClick={() => setTab("Parcelas")}>Gerenciar parcelas ({parcels.length})</Button>
      </>}
      {tab === "Parcelas" && <>
        {launch.kind === "planned" && <section className="space-y-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!canEdit || !eligible.length} onClick={() => changeSelection(eligible.map((p) => p.key))}>Selecionar todas as planejadas</Button><Button size="sm" variant="outline" onClick={() => changeSelection([])}>Limpar seleção</Button><span role="status">{chosen.length}/{eligible.length} planejadas selecionadas · {fmtBRL(chosenTotal)}</span></div>
          <div className="flex flex-wrap gap-2"><Button disabled={!canEdit || !chosen.length} onClick={() => startEffectivation(chosenKeys)}>Efetivar selecionadas ({chosen.length})</Button><Button variant="outline" disabled={!canEdit || !eligible.length} onClick={() => startEffectivation(eligible.map((p) => p.key))}>Efetivar documento inteiro</Button>{eff && <Button variant="outline" onClick={() => { setEff(false); setChecked(false); }}>Voltar à edição de parcelas</Button>}</div>
          <p className="text-muted-foreground">Somente as planejadas elegíveis serão efetivadas; pagas, canceladas, encerradas e já efetivadas ficam excluídas. Efetivar não registra pagamento. A parcela em destaque não é selecionada automaticamente.</p>
        </section>}
        {eff && <section className="grid gap-4 border-l-2 border-primary pl-4 sm:grid-cols-2"><Field l="Data da efetivação"><DateInput value={effectiveDate} onChange={setEffectiveDate} /></Field><p className="self-center font-medium">Revisão da efetivação · {chosen.length} selecionada(s) · {fmtBRL(chosenTotal)}</p></section>}
        <div><table className="tbl launch-parcels" aria-label="Parcelas do documento"><colgroup>{Array.from({ length: 8 }, (_, i) => <col key={i} />)}</colgroup><thead><tr><th><input type="checkbox" aria-label="Selecionar todas as planejadas elegíveis" disabled={!canEdit || !eligible.length} checked={eligible.length > 0 && chosen.length === eligible.length} ref={(node) => { if (node) node.indeterminate = chosen.length > 0 && chosen.length < eligible.length; }} onChange={(e) => changeSelection(e.target.checked ? eligible.map((p) => p.key) : [])} /></th><th>Parcela / identificação</th><th>Valor</th><th>Vencimento original</th><th>Prorrogar para</th><th>Pago</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{parcels.map((p) => <tr key={p.key} className={`${focus(p) ? "launch-focus" : ""} ${chosenKeys.includes(p.key) ? "launch-selected" : ""}`} aria-label={`Parcela ${p.label}`}>
          <td data-label="Efetivar"><input aria-label={`Efetivar parcela ${p.label}`} type="checkbox" disabled={!canEdit || !eligible.some((e) => e.key === p.key)} checked={chosenKeys.includes(p.key)} onChange={() => changeSelection(chosenKeys.includes(p.key) ? chosenKeys.filter((k) => k !== p.key) : [...chosenKeys, p.key])} /></td>
          <td data-label="Parcela">{p.label}<small className="block">{(() => { const r = initial.records.find((r) => r.id === p.id); return shown(r && "importOrigin" in r && typeof r.importOrigin?.raw?.[2] === "string" ? r.importOrigin.raw[2] : r?.document); })()}</small>{focus(p) && <small className="block text-warning-foreground">Em destaque</small>}</td>
          <td data-label="Valor">{p.status === "cancelado" ? fmtBRL(p.original) : <fieldset disabled={!canEdit || p.paid > 0}><MoneyInput value={p.amount} onChange={(amount) => patch(p.key, { amount })} /></fieldset>}</td>
          <td data-label="Vencimento original"><fieldset disabled={!canEdit || p.paid > 0 || p.status === "cancelado"}><DateInput value={p.date} onChange={(date) => patch(p.key, { date })} /></fieldset></td>
          <td data-label="Prorrogar para"><fieldset disabled={!canEdit || p.paid > 0 || p.status === "cancelado"}><DateInput allowEmpty value={p.extension} onChange={(extension) => patch(p.key, { extension })} /></fieldset></td>
          <td data-label="Pago" className="num">{fmtBRL(p.paid)}</td><td data-label="Situação">{situation(p)}</td>
          <td data-label="Ações"><div className="flex flex-col gap-2"><Button size="sm" variant="outline" disabled={!canEdit || p.paid > 0 || p.status === "cancelado"} onClick={() => patch(p.key, { status: "cancelado" })}>Cancelar parcela</Button>{launch.kind !== "planned" && <Button size="sm" variant="outline" disabled={!active.isBase || !canEdit || dirty || p.status === "cancelado" || p.paid >= (p.amount ?? 0)} onClick={() => setPay(p)}>Registrar pagamento</Button>}</div></td>
        </tr>)}</tbody></table></div>
        <Button variant="destructive" disabled={!canEdit || parcels.some((p) => p.paid > 0)} onClick={() => { setParcels((all) => all.map((p) => ({ ...p, status: "cancelado" }))); setChecked(false); }}>Cancelar documento</Button>
        {!eff && <details><summary>Redistribuir valores — seleção independente</summary><div className="space-y-2 py-2"><p>Esta seleção é exclusiva da redistribuição, não utiliza a seleção de efetivação. Cancelar parcela usa apenas o botão da respectiva linha.</p>{parcels.map((p) => <label className="mr-3 inline-flex gap-1" key={p.key}><input type="checkbox" disabled={p.paid > 0 || p.status === "cancelado" || !canEdit} checked={spreadKeys.includes(p.key)} onChange={() => setSpreadKeys(spreadKeys.includes(p.key) ? spreadKeys.filter((k) => k !== p.key) : [...spreadKeys, p.key])} />{p.label}</label>)}<Field l="Total a redistribuir nas selecionadas"><MoneyInput value={spreadTotal} onChange={setSpreadTotal} /></Field><Button variant="outline" disabled={!canEdit || !spreadKeys.length} onClick={async () => { try { const next = redistributeSelected(parcels, spreadKeys, spreadTotal); if (await askConfirm(`Redistribuir ${fmtBRL(spreadTotal)} em ${spreadKeys.length} parcelas selecionadas, com resíduo na última? Datas e outras parcelas não mudam.`, { title: "Redistribuir valores?", action: "Preparar redistribuição" })) { setParcels(next); setChecked(false); } } catch (e) { setError((e as Error).message); } }}>Preparar redistribuição</Button></div></details>}
        {eff && <><Field l="Saldo restante previsto (informação manual)"><MoneyInput value={remaining} onChange={(v) => { setRemaining(v); setChecked(false); }} /></Field><p className="text-muted-foreground">Referência matemática: {fmtBRL(original - parcels.filter((p) => chosenKeys.includes(p.key)).reduce((s, p) => s + (p.amount ?? 0), 0))}. Não é aplicada automaticamente.</p><label className="flex gap-2"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />Conferi o saldo restante informado e os vencimentos das parcelas não selecionadas; R$ 0,00 encerra o restante.</label></>}
        <Field l="Justificativa para valores, datas, efetivação ou cancelamento"><textarea className="inp w-full" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {launch.kind !== "planned" && initial.parcels.filter((p) => p.paid > 0).map((p) => <div key={p.key}><h3 className="font-semibold">Baixas — parcela {p.label}</h3><BaixasList d={d} kind={launch.kind === "expense" ? "expense" : "committed"} titleId={p.id} canReverse={active.isBase && canEdit && !dirty} onReverse={(id, n) => { const e = update((x) => reversePayment(x, id, n, new Date().toISOString())); if (e) setError(e); else onClose(); }} /></div>)}
      </>}
      {tab === "Dados do documento" && <><p className="text-warning-foreground">Alterações destes campos afetam todas as {parcels.length} parcelas deste documento, não outras notas do mesmo pedido.</p><fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2"><CatSubFields d={d} kind={d.categories.find((c) => c.id === fields.categoryId)?.kind ?? "compra"} categoryId={fields.categoryId} onChange={(_, categoryId) => setFields({ ...fields, categoryId })} /><Field l="Fornecedor"><SupplierSearch d={d} existing value={fields.supplierId} onChange={(supplierId) => setFields({ ...fields, supplierId })} /></Field>{([['purchaseCode', 'Pedido'], ['document', 'Documento'], ['notes', 'Descrição']] as const).map(([key, label]) => <Field key={key} l={label}><input className="inp" value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} disabled={!canEdit} /></Field>)}</fieldset></>}
      {tab === "Histórico" && <>{initial.records.map((r) => <div key={r.id}>{r.editLog?.map((h, i) => <p key={i}>{fmtDate(h.at.slice(0, 10))} {h.at.slice(11, 19)} · {h.by} · {splitOrigin(h.note).text} · {fmtBRL(h.before.amount)} → {fmtBRL(h.after.amount)} · {fmtDate(h.before.date)} → {fmtDate(h.after.date)}</p>)}{'extensionHistory' in r && r.extensionHistory.map((h, i) => <p key={`ext-${i}`}>{fmtDate(h.at.slice(0, 10))} · {fmtDate(h.from)} → {fmtDate(h.to)} · {splitOrigin(h.note).text}</p>)}</div>)}<HistoryView data={d} entries={history.map((a) => ({ at: a.at, user: a.user_email ?? "", changes: a.changes.filter((c) => initial.records.some((r) => r.id === c.id)) }))} />{!history.length && !initial.records.some((r) => r.editLog?.length) && <p>Sem alterações registradas neste documento.</p>}</>}
    </>}
  </SidePanel>;
}