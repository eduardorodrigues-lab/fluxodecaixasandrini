import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DateInput, MoneyInput, PageHeader, ProfileBadge } from "@/components/kit";
import { dailyEstimate, platformActiveOn, receiptInformed, receiptPlatformIssues } from "@/lib/engine/engine";
import { addPlatform, deletePlatform, setReceiptPlatform, todaySP, updatePlatform } from "@/lib/engine/actions";
import type { Platform } from "@/lib/engine/types";
import { fmtDate } from "@/lib/dates";
import { fmtNum } from "@/lib/money";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/recebimentos")({
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
  const { active, update, ui } = useApp();
  const d = active.data;
  const [err, setErr] = useState("");
  const act = (fn: Parameters<typeof update>[0]) => { const e = update(fn); setErr(e ?? ""); return !e; };
  const [pStart, setPStart] = useState<string | null>(ui.start);
  const [pEnd, setPEnd] = useState<string | null>(ui.end);
  const [dir, setDir] = useState<"todos" | "acima" | "abaixo">("todos");
  const [sort, setSort] = useState<{ k: "date" | "sum" | "est" | "diff"; asc: boolean }>({ k: "date", asc: true });
  const [showPf, setShowPf] = useState(false);
  const fs = pStart ?? ui.start, fe = pEnd ?? ui.end;
  const calc = (r: (typeof d.receipts)[number]) => { const inf = receiptInformed(r); const est = r.date ? dailyEstimate(d.params, d.targets, r.date, d.targetConfigs).value : 0; return { inf, est, diff: inf.sum - est }; };
  const undated = d.receipts.filter((r) => !r.date);
  const dated = d.receipts.filter((r) => r.date && r.date >= fs && r.date <= fe).map((r) => ({ r, c: calc(r) }))
    .filter(({ c }) => dir === "todos" || (c.inf.present && (dir === "acima" ? c.diff > 0 : c.diff < 0)))
    .sort((a, b) => { const v = sort.k === "date" ? a.r.date.localeCompare(b.r.date) : sort.k === "sum" ? a.c.inf.sum - b.c.inf.sum : sort.k === "est" ? a.c.est - b.c.est : a.c.diff - b.c.diff; return sort.asc ? v : -v; });
  const list = [...undated, ...dated.map((x) => x.r)];
  const sh = (k: typeof sort.k, label: string, num = true) => <th className={`${num ? "num" : ""} cursor-pointer select-none`} onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : k === "date" }))}>{label}{sort.k === k ? (sort.asc ? " ▲" : " ▼") : ""}</th>;
  const today = todaySP();
  // Colunas dinâmicas: plataformas vigentes em algum dia do período OU com valores nos recebimentos listados (inclui inativas históricas).
  const cols = d.platforms.filter((p) => (p.start <= fe && (!p.end || p.end >= fs)) || list.some((r) => r.platforms[p.id] != null));
  const unknown = [...new Set(list.flatMap((r) => Object.keys(r.platforms).filter((k) => r.platforms[k] != null && !d.platforms.some((p) => p.id === k))))];
  const set = (id: string, fn: (r: (typeof d.receipts)[number]) => void) => act((x) => { const r = x.receipts.find((i) => i.id === id); if (r) fn(r); });
  const setPf = (rid: string, pid: string, v: number | null, date: string) => {
    const pf = d.platforms.find((p) => p.id === pid)!;
    let note: string | null = null;
    if (v !== null && !platformActiveOn(pf, date) && pf.end && date > pf.end) {
      note = prompt(`"${pf.name}" foi inativada em ${fmtDate(pf.end)}. Registrar como REPASSE RESIDUAL? Informe a nota (obrigatória):`);
      if (!note) return;
    }
    act((x) => setReceiptPlatform(x, rid, pid, v, note, now()));
  };
  return (
    <div className="space-y-3">
      <PageHeader title="Recebimentos" sub="Vazio (não informado) usa estimativa; ZERO confirmado é valor informado. Linha com valor só grava com data.">
        <ProfileBadge /><button className="btn" onClick={() => setShowPf(true)}>Plataformas</button><button className="btn btn-primary" onClick={() => act((x) => { x.receipts.push({ id: uid(), date: "", platforms: {}, general: null, notes: "", residual: {} }); })}>+ Recebimento</button>
      </PageHeader>
      {err && <div className="rounded border border-destructive p-2 text-xs text-destructive">{err}</div>}
      <div className="rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">A regra original SOMA(D:O) inclui geral e plataformas. Se ambos estiverem preenchidos, o valor é somado e marcado como possível dupla contagem — nada é corrigido automaticamente.</div>
      {unknown.length > 0 && <div className="rounded border border-destructive p-2 text-xs text-destructive">Recebimentos com plataforma não cadastrada (ID {unknown.join(", ")}): valores mantidos; cadastre a plataforma com esse código para conciliar.</div>}
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label>De<br /><DateInput value={pStart} onChange={setPStart} /></label>
        <label>Até<br /><DateInput value={pEnd} onChange={setPEnd} /></label>
        <label>Mostrar<br /><select className="inp" value={dir} onChange={(e) => setDir(e.target.value as typeof dir)}><option value="todos">Todos os dias</option><option value="acima">Recebido acima do previsto</option><option value="abaixo">Recebido abaixo do previsto</option></select></label>
        <span className="text-muted-foreground">{dated.length} dia(s) · clique no título da coluna para ordenar</span>
      </div>
      <div className="card max-h-[75vh] overflow-auto">
        <table className="tbl">
          <thead><tr>{sh("date", "Data", false)}{cols.map((p) => <th key={p.id} className="num" >{p.name}{p.end && <div className="text-[10px] font-normal">inativa desde {fmtDate(p.end)}</div>}</th>)}<th className="num">Geral</th>{sh("sum", "Soma (P)")}{sh("est", "Estimativa (Q)")}{sh("diff", "Diferença (R=P−Q)")}<th>Uso no fluxo</th><th>Obs.</th><th /></tr></thead>
          <tbody>{list.length === 0 ? <tr><td colSpan={cols.length + 8} className="text-muted-foreground">Nenhum recebimento no período.</td></tr> : list.map((r) => {
            const { inf } = calc(r);
            const est = { value: calc(r).est };
            const issues = receiptPlatformIssues(d.platforms, r);
            return (
              <tr key={r.id} className={!r.date ? "bg-warning-soft" : ""}>
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
                <td><input className="inp w-32" defaultValue={r.notes} onBlur={(e) => set(r.id, (x) => { x.notes = e.target.value; })} /></td>
                <td><button className="btn btn-danger" onClick={() => act((x) => { x.receipts = x.receipts.filter((i) => i.id !== r.id); })}>Excluir</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {showPf && <div className="fixed inset-0 z-40 flex justify-end bg-foreground/30" onClick={() => setShowPf(false)}>
        <aside className="h-full w-full max-w-2xl overflow-auto bg-background p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-2 flex justify-end"><button className="btn" onClick={() => setShowPf(false)}>Fechar</button></div>
          <Platforms today={today} act={act} />
        </aside>
      </div>}
      <p className="text-[11px] text-muted-foreground">Mesma data com mais de um registro: o fluxo soma o dia. Recebimentos referenciam a plataforma pelo ID estável — renomear não altera registros anteriores.</p>
    </div>
  );
}

function Platforms({ today, act }: { today: string; act: (fn: (x: import("@/lib/engine/types").ScenarioData) => void) => boolean }) {
  const { active } = useApp();
  const d = active.data;
  const [name, setName] = useState(""); const [start, setStart] = useState<string | null>(today); const [code, setCode] = useState("");
  const refs = (id: string) => d.receipts.filter((r) => r.platforms[id] != null).length;
  return (
    <section className="card overflow-auto p-3">
      <div className="lbl mb-2">Plataformas</div>
      <table className="tbl">
        <thead><tr><th>Nome</th><th>Início vigência</th><th>Inativação</th><th>Status</th><th className="num">Recebimentos</th><th>Ações</th></tr></thead>
        <tbody>{d.platforms.map((p) => (
          <tr key={p.id}>
            <td><input className="inp w-40" defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && act((x) => updatePlatform(x, p.id, { name: e.target.value }, "renomeada", now()))} /></td>
            <td><DateInput value={p.start} onChange={(v) => v && v !== p.start && act((x) => updatePlatform(x, p.id, { start: v }, "início alterado", now()))} /></td>
            <td>{p.end ? fmtDate(p.end) : <span className="text-muted-foreground">—</span>}</td>
            <td><span className={`tag ${pfState(p, today) === "ativa" ? "tag-ok" : "tag-warn"}`}>{pfState(p, today)}</span></td>
            <td className="num">{refs(p.id)}</td>
            <td className="space-x-1 whitespace-nowrap">
              {!p.end && <button className="btn" onClick={() => { const v = prompt("Data de inativação (aaaa-mm-dd). Plataforma inativada não é reativada:", today); if (v) act((x) => updatePlatform(x, p.id, { end: v }, "inativada", now())); }}>Inativar</button>}
              <button className="btn btn-danger" disabled={refs(p.id) > 0} title={refs(p.id) ? "Referenciada: não pode ser excluída (inative)" : ""} onClick={() => confirm(`Excluir ${p.name}?`) && act((x) => deletePlatform(x, p.id))}>Excluir</button>
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
