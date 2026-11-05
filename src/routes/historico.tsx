import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/kit";
import { fmtDate } from "@/lib/dates";
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
  const { audit, update, active } = useApp();
  const restore = (entity: string, before: unknown) => {
    const k = ENTITY_KEY[entity];
    if (!k) return;
    const e = update((x) => {
      const arr = x[k] as unknown as { id?: string; date?: string }[];
      const b = before as { id?: string; date?: string };
      if (arr.some((i) => (b.id ? i.id === b.id : i.date === b.date))) throw new Error("Registro já existe na base atual.");
      arr.push(JSON.parse(JSON.stringify(before)));
    });
    alert(e ?? "Registro restaurado no rascunho. Revise e confirme para gravar.");
  };
  return (
    <div className="space-y-3">
      <PageHeader title="Histórico / Auditoria" sub={`cada confirmação grava antes/depois, usuário e data/hora.`} />
      {!active.isBase && <p className="text-xs text-destructive">Simulação ativa: restaurações só são possíveis na base.</p>}
      {audit.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma alteração confirmada.</p> : audit.map((a) => (
        <details key={a.id} className="card p-2 text-xs">
          <summary className="cursor-pointer"><b>{fmtDate(a.at.slice(0, 10))} {new Date(a.at).toLocaleTimeString("pt-BR")}</b> · {a.user_email || "—"} · v{a.version_from}→v{a.version_to} · {a.summary}</summary>
          <table className="tbl mt-2"><thead><tr><th>Tipo</th><th>Entidade</th><th>Id</th><th>Campos</th><th>Antes</th><th>Depois</th><th /></tr></thead>
            <tbody>{a.changes.map((c, i) => <tr key={i}><td>{c.kind}</td><td>{c.entity}</td><td className="font-mono text-[10px]">{c.id}</td><td>{c.fields.join(", ")}</td>
              <td className="max-w-xs truncate font-mono text-[10px]" title={JSON.stringify(c.before)}>{JSON.stringify(c.before)}</td>
              <td className="max-w-xs truncate font-mono text-[10px]" title={JSON.stringify(c.after)}>{JSON.stringify(c.after)}</td>
              <td>{c.kind === "exclusão" && ENTITY_KEY[c.entity] && active.isBase && <button className="btn" onClick={() => restore(c.entity, c.before)}>Restaurar</button>}</td></tr>)}</tbody></table>
        </details>
      ))}
    </div>
  );
}
