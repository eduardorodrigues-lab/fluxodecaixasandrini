import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MoneyInput, PageHeader, ProfileBadge } from "@/components/kit";
import { addDays, daysInMonth, fmtDate, fmtMonth } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/metas")({
  head: () => ({ meta: [
    { title: "Meta de Faturamento · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Metas mensais, redutores, divisor, estimativa diária e defasagem com memória de cálculo." },
    { property: "og:title", content: "Meta de Faturamento · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Memória de cálculo da estimativa diária de recebimentos." },
  ] }),
  component: Page,
});

function Page() {
  const { active, update, ui } = useApp();
  const d = active.data;
  const p = d.params;
  const [nm, setNm] = useState("");
  const legacy = p.profile === "legado";
  const months = new Set(Object.keys(d.targets));
  for (let s = addDays(ui.start, -p.lagDays); s.slice(0, 7) <= addDays(ui.end, -p.lagDays).slice(0, 7); s = addDays(`${s.slice(0, 7)}-01`, 32)) months.add(s.slice(0, 7));
  return (
    <div className="space-y-3">
      <PageHeader title="Meta de Faturamento" sub="Base da estimativa diária de recebimentos. Alterações vão para o rascunho e exigem confirmação (histórico em Auditoria)."><ProfileBadge /></PageHeader>
      <div className="card p-3 text-xs">
        <b>Perfil ativo: {legacy ? "Excel legado (padrão para validação do CEO)" : "Web"}</b> — {legacy
          ? `líquido = meta × (1 − redutor global B2 ${p.legacyReducer * 100}%); diária = líquido ÷ ${p.divisorLegado === "30" ? "30 (fórmula conferida)" : "dias reais do mês"}. Sem segundo redutor.`
          : `red1 = meta × ${p.webR1 * 100}%; red2 = (meta − red1) × ${p.webR2 * 100}%; líquido = meta − red1 − red2; diária = líquido ÷ ${p.divisorWeb === "dias" ? "dias reais do mês" : "30"}.`}
        {" "}Defasagem {p.lagDays} dias corridos: o dia D usa a meta do mês de (D − {p.lagDays}). Política: estimativa diária arredondada ao centavo (meio para longe do zero) por dia; valor exato mostrado. Perfis e redutores não se misturam. Parâmetros em <Link to="/referencias" className="underline">Referências</Link>.
      </div>
      <div className="card overflow-auto">
        <table className="tbl"><thead><tr><th>Mês</th><th className="num">Meta bruta</th>{legacy ? <th className="num">Redutor global</th> : <><th className="num">Redutor 1 (base meta)</th><th className="num">Redutor 2 (base meta−red1)</th></>}<th className="num">Líquido</th><th className="num">Divisor</th><th className="num">Diária exata</th><th className="num">Diária usada</th><th>Datas do fluxo impactadas</th></tr></thead>
          <tbody>{[...months].sort().map((m) => {
            const meta = d.targets[m];
            const dim = daysInMonth(`${m}-01`);
            const r1 = meta == null ? 0 : legacy ? meta * p.legacyReducer : meta * p.webR1;
            const r2 = meta == null || legacy ? 0 : (meta - r1) * p.webR2;
            const liq = meta == null ? 0 : meta - r1 - r2;
            const div = (legacy ? p.divisorLegado : p.divisorWeb) === "30" ? 30 : dim;
            const ex = liq / div;
            return (
              <tr key={m} className={meta == null ? "bg-warning-soft" : ""}>
                <td>{fmtMonth(m)}</td>
                <td><MoneyInput value={meta ?? null} onChange={(v) => update((x) => { if (v === null) delete x.targets[m]; else x.targets[m] = v; })} />{meta == null && <div className="tag tag-err">meta ausente → estimativa 0</div>}</td>
                <td className="num">{fmtBRL(Math.round(r1))}</td>{!legacy && <td className="num">{fmtBRL(Math.round(r2))}</td>}
                <td className="num">{fmtBRL(Math.round(liq))}</td><td className="num">{div}{div !== 30 && " (dias reais)"}</td>
                <td className="num font-mono text-[11px]">{(ex / 100).toFixed(9)}</td><td className="num">{fmtBRL(Math.round(ex))}</td>
                <td>{fmtDate(addDays(`${m}-01`, p.lagDays))} a {fmtDate(addDays(`${m}-${String(dim).padStart(2, "0")}`, p.lagDays))}</td>
              </tr>
            );
          })}</tbody></table>
      </div>
      <div className="flex gap-2"><input className="inp w-28" placeholder="aaaa-mm" value={nm} onChange={(e) => setNm(e.target.value)} /><button className="btn" onClick={() => { if (/^\d{4}-\d{2}$/.test(nm)) { update((x) => { x.targets[nm] ??= 0; }); setNm(""); } }}>+ Mês</button></div>
      <p className="text-[11px] text-muted-foreground">Vínculo com o fluxo: linha "Recebimento Estimado" da visão horizontal/vertical; clique no valor do dia para ver o mês de meta usado. Dias com recebimento informado (inclusive zero confirmado) não usam a estimativa.</p>
    </div>
  );
}
