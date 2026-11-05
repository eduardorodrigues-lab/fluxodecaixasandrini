import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { Change } from "@/lib/diff";
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

const HIDE = new Set(["id", "history", "extensionHistory", "residual", "importOrigin", "origin"]);
const val = (v: unknown): string => {
  if (v == null || v === "") return "—";
  if (typeof v !== "object") return String(v);
  const o = Array.isArray(v) ? v : Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => !HIDE.has(k) && x != null && x !== ""));
  const t = JSON.stringify(o); return t.length > 160 ? t.slice(0, 160) + "…" : t;
};
interface Row { at: string; user: string; c: Change; field: string; before: unknown; after: unknown }
function flatten(list: { at: string; user: string; changes: Change[] }[]): Row[] {
  const out: Row[] = [];
  for (const e of list) for (const c of e.changes) {
    const fs = c.kind === "alteração" ? c.fields.filter((f) => !HIDE.has(f)) : [];
    if (!fs.length) out.push({ at: e.at, user: e.user, c, field: "—", before: c.before, after: c.after });
    else for (const f of fs) {
      const pick = (o: unknown) => (o && typeof o === "object" && !Array.isArray(o) && c.entity !== "Meta de faturamento" ? (o as Record<string, unknown>)[f] : o);
      out.push({ at: e.at, user: e.user, c, field: f, before: pick(c.before), after: pick(c.after) });
    }
  }
  return out;
}

function Page() {
  const { audit, update, active, sims } = useApp();
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
  const rows = tab === "real" ? flatten(audit.map((a) => ({ at: a.at, user: a.user_email ?? "", changes: a.changes }))) : flatten(sim?.history ?? []);
  return (
    <div className="space-y-3">
      <PageHeader title="Histórico / Auditoria" sub="Cada alteração registra data, horário, quem alterou, campo, antes e depois." />
      <div className="flex flex-wrap gap-1 text-xs">
        <button className={`btn ${tab === "real" ? "btn-primary" : ""}`} onClick={() => setTab("real")}>Fluxo real</button>
        {sims.map((s) => <button key={s.id} className={`btn ${tab === s.id ? "btn-danger" : ""}`} onClick={() => setTab(s.id)}>Simulação: {s.name}</button>)}
      </div>
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p> : (
        <div className="max-h-[75vh] overflow-auto">
          <table className="tbl"><thead><tr><th>Data</th><th>Horário</th><th>Alterado por</th><th>Tipo</th><th>Entidade</th><th>Campo</th><th>Antes</th><th>Depois</th><th /></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>
              <td>{fmtDate(new Date(r.at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }))}</td>
              <td>{new Date(r.at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
              <td>{r.user || "—"}</td><td>{r.c.kind}</td><td>{r.c.entity}</td><td>{r.field}</td>
              <td className="max-w-xs truncate font-mono text-[10px]" title={val(r.before)}>{val(r.before)}</td>
              <td className="max-w-xs truncate font-mono text-[10px]" title={val(r.after)}>{val(r.after)}</td>
              <td>{tab === "real" && r.c.kind === "exclusão" && ENTITY_KEY[r.c.entity] && active.isBase && <button className="btn" onClick={() => restore(r.c.entity, r.c.before)}>Restaurar</button>}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}
