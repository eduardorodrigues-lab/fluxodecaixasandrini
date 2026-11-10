import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HistoryView } from "@/components/HistoryView";
import { PageHeader } from "@/components/kit";
import type { ScenarioData } from "@/lib/engine/types";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/historico")({
  head: () => ({ meta: [
    { title: "Histórico e Auditoria · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Alterações confirmadas com antes/depois, usuário e data; recuperação de exclusões." },
    { property: "og:title", content: "Histórico e Auditoria · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Auditoria das alterações confirmadas." },
  ] }),
  component: Page,
});

const ENTITY_KEY: Record<string, keyof ScenarioData> = {
  "Fornecedor": "suppliers", "Categoria": "categories", "Previsão (planejada)": "planned", "Efetivado (compra/pedido)": "committed", "Despesa": "expenses", "Recebimento": "receipts", "Ajuste de saldo": "adjustments",
};

function Page() {
  const { audit, update, active, sims, base } = useApp();
  const [tab, setTab] = useState("real");
  const restore = (entity: string, before: unknown) => {
    const k = ENTITY_KEY[entity];
    if (!k) return;
    const e = update((x) => {
      const arr = x[k] as unknown as { id?: string; date?: string }[];
      const b = before as { id?: string; date?: string };
      if (arr.some((i) => (b.id ? i.id === b.id : i.date === b.date))) throw new Error("Registro já existe na base atual.");
      arr.push(JSON.parse(JSON.stringify(before)));
    });
    alert(e ?? "Registro restaurado.");
  };
  const [simId, setSimId] = useState<string | null>(null);
  const sim = tab === "sims" ? sims.find((s) => s.id === simId) : undefined;
  const entries = tab === "real" ? audit.map((a) => ({ at: a.at, user: a.user_email ?? "", changes: a.changes })) : sim?.history ?? [];
  const when = (at: string) => new Date(at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <div className="space-y-3">
      <PageHeader title="Histórico / Auditoria" sub="Cada registro mostra data, horário, quem alterou e a linha completa antes e depois; em vermelho o que mudou." />
      <div className="flex flex-wrap gap-1 text-xs">
        <button className={`btn ${tab === "real" ? "btn-primary" : ""}`} onClick={() => setTab("real")}>Fluxo real</button>
        <button className={`btn ${tab === "sims" ? "btn-danger" : ""}`} onClick={() => { setTab("sims"); setSimId(null); }}>Simulações</button>
      </div>
      {tab === "sims" && !sim ? (
        sims.length ? <table className="tbl"><thead><tr><th>Simulação</th><th>Criada por</th><th>Data e horário</th><th className="num">Alterações</th></tr></thead>
          <tbody>{sims.map((s) => <tr key={s.id} className="cursor-pointer hover:bg-secondary" onClick={() => setSimId(s.id)}><td className="font-semibold">{s.name}</td><td>{s.createdBy || "—"}</td><td>{when(s.createdAt)}</td><td className="num">{s.history?.length ?? 0}</td></tr>)}</tbody></table>
          : <p className="text-xs text-muted-foreground">Nenhuma simulação criada.</p>
      ) : <>
      {sim && <div className="flex items-center gap-2 text-sm"><button className="btn" onClick={() => setSimId(null)}>← Voltar às simulações</button><b>Simulação: {sim.name}</b></div>}
      <HistoryView entries={entries} data={tab === "real" ? base.data : sim?.data ?? base.data} scope={sim ? `Simulação: ${sim.name}` : "Fluxo real"}
        onRestore={tab === "real" && active.isBase ? (c) => ENTITY_KEY[c.entity] && restore(c.entity, c.before) : undefined} />
      </>}
    </div>
  );
}
