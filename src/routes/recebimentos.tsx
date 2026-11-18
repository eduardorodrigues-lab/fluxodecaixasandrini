import { askText, askConfirm } from "@/lib/decisions";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, MoneyInput, PageHeader } from "@/components/kit";
import { dailyEstimate, platformActiveOn, receiptInformed, receiptPlatformIssues } from "@/lib/engine/engine";
import { addPlatform, deletePlatform, setReceiptPlatform, todaySP, updatePlatform } from "@/lib/engine/actions";
import type { Platform, Receipt, ScenarioData } from "@/lib/engine/types";
import { accountName, defaultAccountFor, NO_ACCOUNT, setPlatformDefaultAccount, setReceiptAccount } from "@/lib/engine/banco";
import { AccountSearch } from "@/components/BancoPanels";
import { SidePanel } from "@/components/NotaPanel";
import { fmtDate } from "@/lib/dates";
import { fmtNum } from "@/lib/money";
import { uid, useApp } from "@/lib/store";
import { pendingSearch } from "@/lib/pendencias";
import { usePendingFocus } from "@/components/PendingFocus";
import { receiptPlatformEntries } from "@/lib/receiptMigration";
import { DecisionWindow } from '@/components/DecisionDialog';
import { Button } from '@/components/ui/button';
import { receiptReview } from '@/lib/receiptOperation';
import type { ReviewedOperation } from '@/lib/operationSave';
import { measureSavePhase } from '@/lib/saveTiming';

export const Route = createFileRoute("/recebimentos")({
  validateSearch: pendingSearch,
  head: () => ({
    meta: [
      { title: "Recebimentos · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Recebimentos por plataforma ou geral, cadastro de plataformas e comparação à estimativa." },
      { property: "og:title", content: "Recebimentos · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Recebimentos por plataforma ou geral." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const now = () => new Date().toISOString();
const pfState = (p: Platform, today: string) => (p.end && p.end < today ? "inativa" : p.start > today ? "futura" : "ativa");

function Page() {
  const { focus } = Route.useSearch();
  usePendingFocus(focus);
  const app = useApp();
  const { active, update, ui } = app;
  const d = active.data;
  const [err, setErr] = useState("");
  const [review, setReview] = useState<ReviewedOperation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const receiptChanges=app.changes.filter(p=>p.entity==='Recebimento');
  const revise=async()=>{
    setErr(''); setSaving(true); setSaved(false);
    try {
      if(active.isBase && await app.reconcileReceiptDraft()) {
        setErr('Confirmação anterior conferida. Os valores salvos foram atualizados; revise as edições que ainda restam.'); return;
      }
      const started=performance.now();
      const prepared=app.prepareReceiptOperation();
      if(!prepared.ops.length)return;
      setReview({...prepared,scope:`${app.user?.id}:${app.official.orgId}`,orgId:app.official.orgId,requestId:crypto.randomUUID()});
      measureSavePhase('prepare',started);
    } catch(e){setErr((e as Error).message);} finally{setSaving(false);}
  };
  const confirm=async()=>{
    if(!review || saving)return;
    setSaving(true);setErr('');
    try{await app.saveOperation(review);setReview(null);setSaved(true);}
    catch(e){setErr((e as Error).message);if(review.rejected)setReview(null);}finally{setSaving(false);}
  };
  const act = (fn: Parameters<typeof update>[0]) => { setSaved(false); const e = update(fn); setErr(e ?? ""); return !e; };
  const [pStart, setPStart] = useState<string | null>(ui.start);
  const [pEnd, setPEnd] = useState<string | null>(ui.end);
  const [dir, setDir] = useState<"todos" | "acima" | "abaixo">("todos");
  const [sort, setSort] = useState<{ k: "date" | "sum" | "est" | "diff"; asc: boolean }>({ k: "date", asc: true });
  const [showPf, setShowPf] = useState(false);
  const [accFor, setAccFor] = useState<string | null>(null);
  const fs = pStart ?? ui.start, fe = pEnd ?? ui.end;
  const calc = (r: (typeof d.receipts)[number]) => { const inf = receiptInformed(r); const est = r.date ? dailyEstimate(d.params, d.targets, r.date, d.targetConfigs).value : 0; return { inf, est, diff: inf.sum - est }; };
  const undated = d.receipts.filter((r) => !r.date);
  const dated = d.receipts.filter((r) => r.date && r.date >= fs && r.date <= fe).map((r) => ({ r, c: calc(r) }))
    .filter(({ c }) => dir === "todos" || (c.inf.present && (dir === "acima" ? c.diff > 0 : c.diff < 0)))
    .sort((a, b) => { const v = sort.k === "date" ? a.r.date.localeCompare(b.r.date) : sort.k === "sum" ? a.c.inf.sum - b.c.inf.sum : sort.k === "est" ? a.c.est - b.c.est : a.c.diff - b.c.diff; return sort.asc ? v : -v; });
  const list = [...undated, ...dated.map((x) => x.r)];
  const targeted = d.receipts.find((r) => r.id === focus);
  const targetOutside = targeted && !list.some((r) => r.id === targeted.id);
  if (targetOutside) list.unshift(targeted);
  const sh = (k: typeof sort.k, label: string, num = true) => <th className={`${num ? "num" : ""} cursor-pointer select-none`} onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : k === "date" }))}>{label}{sort.k === k ? (sort.asc ? " ▲" : " ▼") : ""}</th>;
  const today = todaySP();
  // A ordem persistida das categorias é comum a todos os períodos; ausência não vira zero.
  const cols = d.platforms;
  const unknown = [...new Set(list.flatMap((r) => Object.keys(r.platforms).filter((k) => r.platforms[k] != null && !d.platforms.some((p) => p.id === k))))];
  const set = (id: string, fn: (r: (typeof d.receipts)[number]) => void) => act((x) => { const r = x.receipts.find((i) => i.id === id); if (r) fn(r); });
  const setPf = async (rid: string, pid: string, v: number | null, date: string) => {
    const pf = d.platforms.find((p) => p.id === pid);
    if(!pf)return;
    let note: string | null = null;
    if (v !== null && !platformActiveOn(pf, date) && pf.end && date > pf.end) {
      note = await askText(`"${pf.name}" foi inativada em ${fmtDate(pf.end)}. Registrar como REPASSE RESIDUAL? Informe a nota (obrigatória):`);
      if (!note) return;
    }
    act((x) => setReceiptPlatform(x, rid, pid, v, note, now()));
  };
  return (
    <div className="space-y-3">
      <PageHeader title="Recebimentos" sub="Vazio (não informado) usa estimativa; ZERO confirmado é valor informado. Linha com valor só grava com data.">
        <button className="btn" onClick={() => setShowPf(true)}>Plataformas</button><button className="btn btn-primary" onClick={() => act((x) => { x.receipts.push({ id: uid(), date: "", platforms: {}, general: null, notes: "", residual: {} }); })}>+ Recebimento</button>
      </PageHeader>
      {active.isBase && app.canEdit && <div className="flex flex-wrap items-center gap-2 border-y border-border py-2 text-xs" role="status">
        <span>{saving ? 'Conferindo salvamento…' : saved ? 'Recebimentos salvos após confirmação.' : receiptChanges.length ? `${receiptChanges.length} recebimento(s) com alterações não salvas; proteção local pelo navegador.` : 'Nenhuma alteração de recebimentos.'}</span>
        <Button variant="outline" size="sm" disabled={saving || !receiptChanges.length || !!app.pendingOperation} onClick={()=>void revise()}>Revisar e salvar recebimentos</Button>
        {app.protectErr && <span className="text-destructive">{app.protectErr}</span>}
      </div>}
      {review && <DecisionWindow wide title="Revisar recebimentos" description="Somente os recebimentos abaixo serão salvos. Outras alterações permanecem separadas." footer={<div className="flex gap-2">
        <Button variant="outline" disabled={saving || !!app.pendingOperation} onClick={()=>setReview(null)}>Voltar à edição</Button>
        <Button disabled={saving || (!!app.pendingOperation && (app.pendingOperation.requestId!==review.requestId || !!app.pendingOperation.rejected))} onClick={()=>void confirm()}>{saving?'Salvando…':app.pendingOperation?'Tentar novamente a confirmação':'Confirmar e salvar'}</Button>
      </div>}>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <table className="tbl"><thead><tr><th>Data</th><th>Plataforma / campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{receiptReview(review.ops,d.platforms).map((r,i)=>{
          const show=(v:unknown)=>v==null?'Não informado':r.money?fmtNum(v as number):r.field==='Data'?fmtDate(v as string):typeof v==='boolean'?v?'Sim':'Não':typeof v==='object'?JSON.stringify(v):String(v);
          return <tr key={`${r.id}:${i}`}><td>{fmtDate(r.date)||'Sem data'}</td><td>{r.field}</td><td>{show(r.before)}</td><td>{show(r.after)}</td></tr>;
        })}</tbody></table>
        <p className="mt-2 text-xs text-warning-foreground">Plataformas + Geral seguem somados. Vazio usa estimativa; zero informado permanece zero.</p>
      </DecisionWindow>}
      {err && <div className="rounded border border-destructive p-2 text-xs text-destructive">{err}</div>}
      {targetOutside && <p className="text-xs text-warning-foreground">O recebimento selecionado foi destacado fora dos filtros atuais. Os filtros foram mantidos.</p>}
      <div className="rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">Valores das plataformas e do campo Geral são somados no total do dia. Quando ambos estão preenchidos na mesma data, o sistema exibe alerta de possível duplicidade; nada é corrigido automaticamente.</div>
      {unknown.length > 0 && <div className="rounded border border-destructive p-2 text-xs text-destructive">Recebimentos com plataforma não cadastrada (ID {unknown.join(", ")}): valores mantidos; cadastre a plataforma com esse código para conciliar.</div>}
      <div className="filter-bar text-xs">
        <label>De<br /><DateInput allowEmpty value={pStart} maxDate={pEnd} onChange={setPStart} /></label>
        <label>Até<br /><DateInput allowEmpty value={pEnd} minDate={pStart} onChange={setPEnd} /></label>
        <label>Mostrar<br /><select className="inp" value={dir} onChange={(e) => setDir(e.target.value as typeof dir)}><option value="todos">Todos os dias</option><option value="acima">Recebido acima do previsto</option><option value="abaixo">Recebido abaixo do previsto</option></select></label>
        <span className="text-muted-foreground">{dated.length} dia(s) · clique no título da coluna para ordenar</span>
      </div>
      <div className="card max-h-[75vh] overflow-auto">
        <table className="tbl tbl-stick1 receipts-table">
          <colgroup>
            <col className="receipts-date" />
            {cols.map((p) => <col key={p.id} className="receipts-money" />)}
            <col className="receipts-money" />
            <col span={3} className="receipts-calculated" />
            <col className="receipts-flow" />
            <col className="receipts-accounts" />
            <col className="receipts-realized" />
            <col className="receipts-notes" />
            <col className="receipts-actions" />
          </colgroup>
          <thead><tr>{sh("date", "Data", false)}{cols.map((p) => <th key={p.id} className="num" >{p.name}{p.end && <div className="text-[10px] font-normal">inativa desde {fmtDate(p.end)}</div>}</th>)}<th className="num">Geral</th>{sh("sum", "Soma (P)")}{sh("est", "Estimativa (Q)")}{sh("diff", "Diferença (R=P−Q)")}<th>Uso no fluxo</th><th>Contas</th><th>Realizado</th><th>Obs.</th><th /></tr></thead>
          <tbody>{list.length === 0 ? <tr><td colSpan={cols.length + 10} className="text-muted-foreground">Nenhum recebimento no período.</td></tr> : list.map((r) => {
            const { inf } = calc(r);
            const est = { value: calc(r).est };
            const issues = receiptPlatformIssues(d.platforms, r);
            return (
              <tr key={r.id} id={`pending-${r.id}`} tabIndex={-1} className={!r.date || focus === r.id ? "bg-warning-soft" : ""}>
                <td><DateInput allowEmpty value={r.date || null} onChange={(v) => set(r.id, (x) => { x.date = v ?? ""; })} />{!r.date && inf.present && <div className="tag tag-err">informe a data</div>}</td>
                {cols.map((p) => {
                  const on = platformActiveOn(p, r.date);
                  const res = r.residual?.[p.id];
                  return <td key={p.id} className="num">{on || r.platforms[p.id] != null || (p.end && r.date > p.end)
                    ? <><MoneyInput value={r.platforms[p.id] ?? null} onChange={(v) => setPf(r.id, p.id, v, r.date)} />{res && <div className="tag tag-warn" title={res.note}>residual</div>}</>
                    : <span className="text-[11px] text-muted-foreground">fora de vigência</span>}</td>;
                })}
                <td className="num"><MoneyInput value={r.general} onChange={(v) => set(r.id, (x) => { x.general = v; })} /></td>
                <td className="num">{inf.present ? fmtNum(inf.sum) : ""}</td>
                <td className="num">{r.date ? fmtNum(est.value) : ""}</td>
                <td className={`num ${inf.sum - est.value < 0 ? "neg" : ""}`}>{inf.present ? fmtNum(inf.sum - est.value) : ""}</td>
                <td>{inf.doubleCount && <span className="tag tag-warn mr-1">possível dupla contagem</span>}{inf.present ? <span className="tag tag-ok">{inf.confirmedZero ? "zero confirmado" : "informado"}</span> : <span className="tag tag-warn">não informado → estimativa</span>}{issues.filter((i) => i.severity !== "info").map((i, k) => <div key={k} className="tag tag-err" title={i.message}>{i.code === "PLAT_FORA_VIGENCIA" ? "fora de vigência" : "plataforma desconhecida"}</div>)}</td>
                <td>{inf.present ? <button className="btn" onClick={() => setAccFor(r.id)}>{receiptAccountsLabel(d, r)}</button> : ""}</td>
                <td className="text-center"><input type="checkbox" aria-label="Creditado em conta" checked={!!r.realized} disabled={!inf.present} onChange={(e) => set(r.id, (x) => { x.realized = e.target.checked; })} /></td>
                <td><input className="inp w-32" aria-label={`Observações ${r.date || r.id}`} value={r.notes} onChange={(e) => set(r.id, (x) => { x.notes = e.target.value; })} /></td>
                <td><button className="btn btn-danger" onClick={async () => await askConfirm(`O recebimento de ${fmtDate(r.date) || "data não informada"} será excluído do cenário atual. O histórico será preservado.`, { title: "Excluir recebimento?", action: "Excluir recebimento", destructive: true }) && act((x) => { x.receipts = x.receipts.filter((i) => i.id !== r.id); })}>Excluir</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {showPf && <div className="fixed inset-0 z-40 flex justify-end bg-foreground/30">
        <aside className="h-full w-full max-w-2xl overflow-auto bg-background p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-2 flex justify-end"><button className="btn" onClick={() => setShowPf(false)}>Fechar</button></div>
          <Platforms today={today} act={act} />
        </aside>
      </div>}
      {accFor && <ReceiptAccounts d={d} rid={accFor} act={act} onClose={() => setAccFor(null)} />}
      <p className="text-[11px] text-muted-foreground">Mesma data com mais de um registro: o fluxo soma o dia. Renomear uma plataforma não altera recebimentos anteriores.</p>
    </div>
  );
}

function Platforms({ today, act }: { today: string; act: (fn: (x: import("@/lib/engine/types").ScenarioData) => void) => boolean }) {
  const { active } = useApp();
  const d = active.data;
  const [name, setName] = useState(""); const [start, setStart] = useState<string | null>(today); const [code, setCode] = useState("");
  const refs = (id: string) => d.receipts.filter((r) => r.platforms[id] != null).length;
  const [defFor, setDefFor] = useState<string | null>(null);
  const [defFrom, setDefFrom] = useState<string | null>(today); const [defAcc, setDefAcc] = useState(""); const [defNote, setDefNote] = useState("");
  return (
    <section className="card overflow-auto p-3">
      {defFor && <div className="mb-3 space-y-2 rounded-md border border-primary p-3 text-xs">
        <b>Conta padrão de {d.platforms.find((p) => p.id === defFor)?.name}</b>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2"><label>Válida a partir de<br /><DateInput value={defFrom} onChange={setDefFrom} /></label><label>Conta<br /><AccountSearch d={d} label="Conta padrão" value={defAcc} onChange={setDefAcc} /></label>
          <label className="md:col-span-2">Observação<br /><input className="inp h-8 w-full" value={defNote} onChange={(e) => setDefNote(e.target.value)} /></label></div>
        <p className="text-muted-foreground">Vale até a próxima mudança. Recebimentos já lançados mantêm a conta gravada; nenhum valor é transferido.</p>
        <div className="flex gap-2"><button className="btn" onClick={() => setDefFor(null)}>Cancelar</button><button className="btn btn-primary" disabled={!defFrom || !defAcc} onClick={async () => { if (!await askConfirm("Esta conta será o padrão a partir da data informada. Recebimentos anteriores manterão a conta gravada.", { title: "Salvar conta padrão?", action: "Salvar conta padrão" })) return; if (act((x) => setPlatformDefaultAccount(x, defFor, defFrom!, defAcc, defNote, now()))) { setDefFor(null); setDefAcc(""); setDefNote(""); } }}>Confirmar</button></div>
      </div>}
      <div className="lbl mb-2">Plataformas</div>
      <table className="tbl">
        <thead><tr><th>Nome</th><th>Início vigência</th><th>Inativação</th><th>Status</th><th>Conta padrão (vigência)</th><th className="num">Recebimentos</th><th>Ações</th></tr></thead>
        <tbody>{d.platforms.map((p) => (
          <tr key={p.id}>
            <td><input className="inp w-40" defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && act((x) => updatePlatform(x, p.id, { name: e.target.value }, "renomeada", now()))} /></td>
            <td><DateInput value={p.start} onChange={async (v) => v && v !== p.start && await askConfirm(`A vigência de ${p.name} começará em ${fmtDate(v)}. Os recebimentos já registrados serão mantidos.`, { title: "Alterar vigência?", action: "Salvar vigência" }) && act((x) => updatePlatform(x, p.id, { start: v }, "início alterado", now()))} /></td>
            <td>{p.end ? fmtDate(p.end) : <span className="text-muted-foreground">—</span>}</td>
            <td><span className={`tag ${pfState(p, today) === "ativa" ? "tag-ok" : "tag-warn"}`}>{pfState(p, today)}</span></td>
            <td>{(p.defaultAccounts ?? []).map((x, i) => <div key={i}>desde {fmtDate(x.from)}: {accountName(d, x.accountId)}</div>)}
              <button className="btn mt-1" disabled={!d.bankAccounts.some((a) => a.active)} onClick={() => setDefFor(p.id)}>Definir conta padrão</button></td>
            <td className="num">{refs(p.id)}</td>
            <td className="space-x-1 whitespace-nowrap">
              {!p.end && <button className="btn" onClick={async () => { const v = await askText(`A plataforma “${p.name}” será inativada a partir da data informada. Recebimentos anteriores e histórico serão preservados.`, today, { title: "Inativar plataforma?", action: "Inativar", destructive: true, input: { label: "Data de inativação", initial: today, type: "date" } }); if (v) act((x) => updatePlatform(x, p.id, { end: v }, "inativada", now())); }}>Inativar</button>}
              <button className="btn btn-danger" disabled={refs(p.id) > 0} title={refs(p.id) ? "Referenciada: não pode ser excluída (inative)" : ""} onClick={async () => await askConfirm(`Excluir ${p.name}?`) && act((x) => deletePlatform(x, p.id))}>Excluir</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
        <label>Nome<br /><input className="inp w-40" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Início vigência<br /><DateInput value={start} onChange={setStart} /></label>
        <label>Código importado (opcional)<br /><input className="inp w-28" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={!name.trim() || !start} onClick={() => { if (act((x) => addPlatform(x, { id: code.trim() || "plat-" + uid().slice(0, 8), name, start: start!, importedCode: code.trim() || null }, now()))) { setName(""); setCode(""); } }}>+ Plataforma</button>
      </div>
    </section>
  );
}

function receiptAccountsLabel(d: ScenarioData, r: Receipt) {
  const ids = [...Object.entries(r.platforms).filter(([, v]) => v != null).map(([k]) => r.accountByPlatform?.[k]?.accountId ?? null), ...(r.general != null ? [r.generalAccountId ?? null] : [])];
  const uniq = [...new Set(ids)];
  if (uniq.length === 1) return uniq[0] ? accountName(d, uniq[0]).split(" · ")[0] : NO_ACCOUNT;
  return `${uniq.length} contas`;
}
function ReceiptAccounts({ d, rid, act, onClose }: { d:ScenarioData; rid: string; act: (fn: (x: ScenarioData) => void) => boolean; onClose: () => void }) {
  const r = d.receipts.find((x) => x.id === rid);
  if (!r) return null;
  const rows = [...receiptPlatformEntries(d, r).filter(([, v]) => v != null).map(([pid, v]) => {
    const pf = d.platforms.find((p) => p.id === pid);
    return { key: pid, name: pf?.name ?? "Plataforma", value: v!, acc: r.accountByPlatform?.[pid]?.accountId ?? "", override: !!r.accountByPlatform?.[pid]?.override, sug: pf && r.date ? defaultAccountFor(pf, r.date) : null };
  }), ...(r.general != null ? [{ key: "general", name: "Geral (sem plataforma)", value: r.general, acc: r.generalAccountId ?? "", override: true, sug: null }] : [])];
  return <SidePanel title="Contas do recebimento" sub={r.date ? fmtDate(r.date) : "sem data"} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Fechar</button>}>
    <table className="tbl"><thead><tr><th>Origem</th><th className="num">Valor</th><th>Conta</th></tr></thead>
      <tbody>{rows.map((x) => <tr key={x.key}><td>{x.name}</td><td className="num">{fmtNum(x.value)}</td><td>
        <div className="mb-1">{x.acc ? accountName(d, x.acc) : <span className="tag tag-warn">{NO_ACCOUNT}</span>}{x.acc && !x.override && <span className="ml-1 text-muted-foreground">(padrão na data)</span>}{x.override && x.key !== "general" && x.acc && <span className="ml-1 tag tag-warn">alterada só neste recebimento</span>}</div>
        <div className="flex gap-1"><div className="flex-1"><AccountSearch d={d} label={`Alterar somente neste recebimento ${x.name}`} value="" onChange={(v) => v && act((y) => setReceiptAccount(y, rid, x.key, v))} /></div>
          {x.sug && x.sug !== x.acc && <button className="btn" onClick={() => act((y) => { setReceiptAccount(y, rid, x.key, x.sug); const t = y.receipts.find((i) => i.id === rid); if (t?.accountByPlatform?.[x.key]) t.accountByPlatform[x.key]!.override = false; })}>Usar padrão</button>}</div>
      </td></tr>)}</tbody></table>
    <p className="text-muted-foreground">Escolher uma conta acima vale somente para este recebimento. A conta fica gravada no registro e não muda se o padrão da plataforma mudar.</p>
  </SidePanel>;
}
