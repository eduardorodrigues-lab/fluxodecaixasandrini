import { createFileRoute } from "@tanstack/react-router";
import { DateInput, MoneyInput, PageHeader, ProfileBadge } from "@/components/kit";
import { dailyEstimate, receiptInformed } from "@/lib/engine/engine";
import { fmtNum } from "@/lib/money";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/recebimentos")({
  head: () => ({
    meta: [
      { title: "Recebimentos · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Recebimentos por plataforma ou geral, comparados à estimativa." },
      { property: "og:title", content: "Recebimentos · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Recebimentos por plataforma ou geral." },
    ],
  }),
  component: Page,
});

function Page() {
  const { active, update } = useApp();
  const d = active.data;
  const list = [...d.receipts].sort((a, b) => a.date.localeCompare(b.date));
  const set = (id: string, fn: (r: (typeof d.receipts)[number]) => void) => update((x) => { const r = x.receipts.find((i) => i.id === id); if (r) fn(r); });
  return (
    <div>
      <PageHeader title="Recebimentos" sub="Preencha por plataforma OU geral. Regra legado: soma informada do dia ≠ 0 substitui a estimativa; zero usa a estimativa.">
        <ProfileBadge /><button className="btn btn-primary" onClick={() => update((x) => { x.receipts.push({ id: uid(), date: x.params.startDate, platforms: {}, general: null, notes: "" }); })}>+ Recebimento</button>
      </PageHeader>
      <div className="mb-2 rounded border border-warning bg-warning-soft p-2 text-xs text-warning-foreground">A regra original SOMA(D:O) inclui geral e plataformas. Se ambos estiverem preenchidos, o valor é somado e marcado como possível dupla contagem — nada é corrigido automaticamente.</div>
      <div className="card overflow-auto">
        <table className="tbl">
          <thead><tr><th>Data</th>{d.platforms.map((p) => <th key={p} className="num">{p}</th>)}<th className="num">Geral</th><th className="num">Soma (P)</th><th className="num">Estimativa (Q)</th><th className="num">Diferença (R=P−Q)</th><th>Uso no fluxo</th><th>Obs.</th><th /></tr></thead>
          <tbody>{list.map((r) => {
            const inf = receiptInformed(r);
            const est = dailyEstimate(d.params, d.targets, r.date);
            return (
              <tr key={r.id}>
                <td><DateInput value={r.date} onChange={(v) => v && set(r.id, (x) => { x.date = v; })} /></td>
                {d.platforms.map((p) => <td key={p}><MoneyInput value={r.platforms[p] ?? null} onChange={(v) => set(r.id, (x) => { x.platforms[p] = v; })} /></td>)}
                <td><MoneyInput value={r.general} onChange={(v) => set(r.id, (x) => { x.general = v; })} /></td>
                <td className="num">{inf.present ? fmtNum(inf.sum) : ""}</td>
                <td className="num">{fmtNum(est.value)}</td>
                <td className={`num ${inf.sum - est.value < 0 ? "neg" : ""}`}>{inf.present ? fmtNum(inf.sum - est.value) : ""}</td>
                <td>{inf.doubleCount && <span className="tag tag-warn mr-1">possível dupla contagem</span>}{inf.sum !== 0 ? <span className="tag tag-ok">informado</span> : <span className="tag tag-warn">{inf.present ? "zero → estimativa" : "estimativa"}</span>}</td>
                <td><input className="inp w-32" defaultValue={r.notes} onBlur={(e) => set(r.id, (x) => { x.notes = e.target.value; })} /></td>
                <td><button className="btn btn-danger" onClick={() => update((x) => { x.receipts = x.receipts.filter((i) => i.id !== r.id); })}>Excluir</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Se houver mais de um registro na mesma data, o fluxo agrega a soma do dia. "Zero informado" não é tratado como confirmação de ausência de entrada (regra legado).</p>
    </div>
  );
}
