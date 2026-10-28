import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { IntInput, MoneyInput, PageHeader, ProfileBadge } from "@/components/kit";
import { addDays, daysInMonth, fmtDate, fmtMonth } from "@/lib/dates";
import { dailyEstimate, lagFor, monthTarget } from "@/lib/engine/engine";
import { removeMonthTarget, setMonthTarget } from "@/lib/engine/actions";
import type { Divisor, MonthTarget, R2Base } from "@/lib/engine/types";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/metas")({
  head: () => ({ meta: [
    { title: "Meta de Faturamento · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Metas mensais com redutores, bases, divisor e defasagem próprios por mês, com memória de cálculo." },
    { property: "og:title", content: "Meta de Faturamento · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Memória de cálculo da estimativa diária de recebimentos." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

const pct = (v: number) => Math.round(v * 10000) / 100;
const PctInput = ({ v, on }: { v: number; on: (n: number) => void }) => {
  const [t, setT] = useState(String(pct(v)).replace(".", ","));
  return <input className="inp num w-16" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => { const n = Number(t.replace(",", ".")); if (Number.isFinite(n) && n !== pct(v)) on(n / 100); else setT(String(pct(v)).replace(".", ",")); }} aria-label="percentual" />;
};

function Page() {
  const { active, update, ui } = useApp();
  const d = active.data;
  const p = d.params;
  const legacy = p.profile === "legado";
  const [nm, setNm] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const at = () => new Date().toISOString();
  const edit = (m: string, patch: Partial<Omit<MonthTarget, "version" | "history">>, note: string) => { const e = update((x) => setMonthTarget(x, m, patch, note, at())); setErr(e ?? ""); };
  const months = new Set(Object.keys(d.targetConfigs));
  for (let s = addDays(ui.start, -lagFor(p, d.targetConfigs, ui.start)); s.slice(0, 7) <= addDays(ui.end, -lagFor(p, d.targetConfigs, ui.end)).slice(0, 7); s = addDays(`${s.slice(0, 7)}-01`, 32)) months.add(s.slice(0, 7));
  return (
    <div className="space-y-3">
      <PageHeader title="Meta de Faturamento" sub={active.isBase ? "Cada mês tem faturamento, redutores, bases, divisor e defasagem próprios. Alterações vão para o rascunho e exigem revisão/confirmação." : "Simulação: alterações imediatas, isoladas e apenas visuais."}><ProfileBadge /></PageHeader>
      {err && <div className="rounded border border-destructive p-2 text-xs text-destructive">{err}</div>}
      <div className="card p-3 text-xs">
        <b>Perfil ativo: {legacy ? "Excel legado (referência conferida do CEO)" : "Web"}</b> — {legacy
          ? "líquido = bruto × (1 − redutor do mês); diária = líquido ÷ divisor do mês (fórmula conferida ÷30). Sem segundo redutor."
          : "red1 = bruto × r1; red2 = (base escolhida) × r2 — base original web = bruto − red1; líquido = bruto − red1 − red2; diária = líquido ÷ divisor do mês (fonte web: dias reais)."}
        {" "}Defasagem: o dia D usa a meta do mês de (D − defasagem); a defasagem vem da configuração do mês civil de D. Parâmetros gerais (Referências) são apenas default para meses NOVOS — nunca reescrevem meses existentes. Diferenças aprovadas em relação ao Excel: zero confirmado não usa estimativa; valores por mês editáveis.
      </div>
      <div className="card overflow-auto">
        <table className="tbl">
          <thead><tr>
            <th>Mês</th><th className="num">Faturamento bruto</th>
            {legacy ? <><th className="num">Redutor (%)</th><th>Base</th></> : <><th className="num">r1 (%)</th><th className="num">r2 (%)</th><th>Base r2</th></>}
            <th className="num">Redução 1</th>{!legacy && <th className="num">Redução 2</th>}<th className="num">Líquido</th><th>Divisor</th><th className="num">Estimativa diária</th><th className="num">Defasagem (d)</th><th>Datas de fluxo impactadas</th><th className="num">Versão</th><th>Ações</th>
          </tr></thead>
          <tbody>{[...months].sort().map((m) => {
            const own = d.targetConfigs[m];
            const c = monthTarget(p, d.targets, d.targetConfigs, m);
            const dim = daysInMonth(`${m}-01`);
            const ex = dailyEstimate({ ...p, lagDays: 0 }, c ? { [m]: c.gross } : {}, `${m}-01`, c ? { [m]: { ...c, lagDays: 0 } } : {});
            const lag = own?.lagDays ?? p.lagDays;
            const impacted = [addDays(`${m}-01`, lag), addDays(`${m}-${String(dim).padStart(2, "0")}`, lag)];
            const div = legacy ? c?.divisorLegado : c?.divisorWeb;
            return [
              <tr key={m}>
                <td>{fmtMonth(m)}</td>
                <td className="num"><MoneyInput value={own?.gross ?? null} onChange={(v) => { if (v === null) { if (own && confirm(`Remover a meta de ${fmtMonth(m)}? (estimativa 0 com alerta)`)) { const e = update((x) => removeMonthTarget(x, m)); setErr(e ?? ""); } } else edit(m, { gross: v }, "faturamento bruto"); }} />{!own && <div className="tag tag-err">meta ausente → estimativa 0</div>}</td>
                {own ? (legacy
                  ? <><td className="num"><PctInput v={own.legacyReducer} on={(n) => edit(m, { legacyReducer: n }, "redutor legado")} /></td><td>bruto</td></>
                  : <><td className="num"><PctInput v={own.webR1} on={(n) => edit(m, { webR1: n }, "r1")} /></td><td className="num"><PctInput v={own.webR2} on={(n) => edit(m, { webR2: n }, "r2")} /></td>
                      <td><select className="inp" value={own.r2Base} onChange={(e) => edit(m, { r2Base: e.target.value as R2Base }, "base r2")}><option value="apos_r1">bruto − red1 (web original)</option><option value="bruto">bruto</option></select></td></>)
                  : <td colSpan={legacy ? 2 : 3} className="text-muted-foreground">—</td>}
                <td className="num">{c ? fmtBRL(Math.round(ex.r1)) : "—"}</td>{!legacy && <td className="num">{c ? fmtBRL(Math.round(ex.r2)) : "—"}</td>}
                <td className="num">{c ? fmtBRL(Math.round(ex.liquid)) : "—"}</td>
                <td>{own ? <select className="inp" value={div} onChange={(e) => edit(m, legacy ? { divisorLegado: e.target.value as Divisor } : { divisorWeb: e.target.value as Divisor }, "divisor")}><option value="30">÷30</option><option value="dias">÷{dim} (dias reais)</option></select> : "—"}</td>
                <td className="num" title={c ? `exato ${ex.exact}` : ""}>{c ? fmtBRL(ex.value) : "—"}</td>
                <td className="num">{own ? <IntInput value={own.lagDays} onChange={(v) => v !== null && v !== own.lagDays && edit(m, { lagDays: v }, "defasagem")} /> : p.lagDays}</td>
                <td>{fmtDate(impacted[0])} a {fmtDate(impacted[1])}</td>
                <td className="num">{own ? `v${own.version}` : "—"}</td>
                <td>{own && <button className="btn" aria-expanded={open === m} onClick={() => setOpen(open === m ? null : m)}>Memória/histórico</button>}</td>
              </tr>,
              open === m && own && <tr key={m + "-h"}><td colSpan={legacy ? 13 : 15} className="bg-muted text-[11px]">
                <div><b>Memória de cálculo {fmtMonth(m)}:</b> bruto {fmtBRL(own.gross)} {legacy ? `× (1 − ${pct(own.legacyReducer)}%)` : `− ${pct(own.webR1)}% − ${pct(own.webR2)}% sobre ${own.r2Base === "apos_r1" ? "(bruto − red1)" : "bruto"}`} = líquido {fmtBRL(Math.round(ex.liquid))}; ÷ {ex.divisor} = {ex.exact.toFixed(6)} → {fmtBRL(ex.value)}/dia (arredondado ao centavo por dia). Aplica-se aos dias de fluxo cuja data − defasagem cai em {fmtMonth(m)}.</div>
                {own.history.length > 0 && <ul className="mt-1">{own.history.map((h, i) => <li key={i}>v{h.version} · {h.at ? fmtDate(h.at.slice(0, 10)) : "—"} · {h.note}{h.before ? ` · antes: bruto ${fmtBRL(h.before.gross)}, red ${pct(h.before.legacyReducer)}%, r1 ${pct(h.before.webR1)}%, r2 ${pct(h.before.webR2)}%, defasagem ${h.before.lagDays}d` : " · criação"}</li>)}</ul>}
              </td></tr>,
            ];
          })}</tbody>
        </table>
      </div>
      <div className="flex gap-2"><input className="inp w-28" placeholder="aaaa-mm" value={nm} onChange={(e) => setNm(e.target.value)} aria-label="novo mês" /><button className="btn" onClick={() => { if (/^\d{4}-\d{2}$/.test(nm) && !d.targetConfigs[nm]) { edit(nm, { gross: 0 }, "mês criado com defaults gerais"); setNm(""); } }}>+ Mês (usa defaults gerais)</button></div>
      <p className="text-[11px] text-muted-foreground">Vínculo com o fluxo: linha "Recebimento Estimado" das visões horizontal/vertical. Dias com recebimento informado (inclusive zero confirmado) não usam a estimativa.</p>
    </div>
  );
}
