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
  const sim = sims.find((s) => s.id === tab);
  const entries = tab === "real" ? audit.map((a) => ({ at: a.at, user: a.user_email ?? "", changes: a.changes })) : sim?.history ?? [];
  return (
    <div className="space-y-3">
      <PageHeader title="Histórico / Auditoria" sub="Cada registro mostra data, horário, quem alterou e a linha completa antes e depois; em vermelho o que mudou." />
      <div className="flex flex-wrap gap-1 text-xs">
        <button className={`btn ${tab === "real" ? "btn-primary" : ""}`} onClick={() => setTab("real")}>Fluxo real</button>
        {sims.map((s) => <button key={s.id} className={`btn ${tab === s.id ? "btn-danger" : ""}`} onClick={() => setTab(s.id)}>Simulação: {s.name}</button>)}
      </div>
      <HistoryView entries={entries} data={tab === "real" ? base.data : sim?.data ?? base.data}
        onRestore={tab === "real" && active.isBase ? (c) => ENTITY_KEY[c.entity] && restore(c.entity, c.before) : undefined} />
    </div>
  );
}
