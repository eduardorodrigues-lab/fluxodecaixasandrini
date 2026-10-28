import type { ScenarioData } from "./engine/types";

// Diferença antes/depois por entidade — usada na revisão (cliente) e na auditoria (servidor).
export interface Change { entity: string; id: string; kind: "inclusão" | "alteração" | "exclusão"; before: unknown; after: unknown; fields: string[] }

const COLLECTIONS: { key: keyof ScenarioData; label: string; id: (x: Record<string, unknown>) => string }[] = [
  { key: "suppliers", label: "Fornecedor", id: (x) => String(x["id"]) },
  { key: "categories", label: "Categoria", id: (x) => String(x["id"]) },
  { key: "planned", label: "Previsão (planejada)", id: (x) => String(x["id"]) },
  { key: "committed", label: "Efetivado (compra/pedido)", id: (x) => String(x["id"]) },
  { key: "expenses", label: "Despesa", id: (x) => String(x["id"]) },
  { key: "effectivations", label: "Efetivação", id: (x) => String(x["id"]) },
  { key: "payments", label: "Pagamento (baixa)", id: (x) => String(x["id"]) },
  { key: "receipts", label: "Recebimento", id: (x) => String(x["id"]) },
  { key: "adjustments", label: "Ajuste de saldo", id: (x) => String(x["date"]) },
  { key: "importLog", label: "Registro de importação", id: (x) => String(x["key"]) },
];
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffData(a: ScenarioData, b: ScenarioData): Change[] {
  const out: Change[] = [];
  for (const c of COLLECTIONS) {
    const A = new Map(((a[c.key] ?? []) as unknown as Record<string, unknown>[]).map((x) => [c.id(x), x]));
    const B = new Map(((b[c.key] ?? []) as unknown as Record<string, unknown>[]).map((x) => [c.id(x), x]));
    for (const [id, x] of A) {
      const y = B.get(id);
      if (!y) out.push({ entity: c.label, id, kind: "exclusão", before: x, after: null, fields: [] });
      else if (!eq(x, y)) out.push({ entity: c.label, id, kind: "alteração", before: x, after: y, fields: Object.keys({ ...x, ...y }).filter((k) => !eq(x[k], y[k])) });
    }
    for (const [id, y] of B) if (!A.has(id)) out.push({ entity: c.label, id, kind: "inclusão", before: null, after: y, fields: [] });
  }
  const months = new Set([...Object.keys(a.targets ?? {}), ...Object.keys(b.targets ?? {})]);
  for (const m of [...months].sort()) {
    const x = a.targets?.[m], y = b.targets?.[m];
    if (x !== y) out.push({ entity: "Meta de faturamento", id: m, kind: x == null ? "inclusão" : y == null ? "exclusão" : "alteração", before: x ?? null, after: y ?? null, fields: ["meta"] });
  }
  if (!eq(a.params, b.params)) {
    const keys = Object.keys({ ...a.params, ...b.params }) as (keyof ScenarioData["params"])[];
    const f = keys.filter((k) => !eq(a.params?.[k], b.params?.[k]));
    out.push({ entity: "Parâmetros", id: "params", kind: "alteração", before: Object.fromEntries(f.map((k) => [k, a.params?.[k]])), after: Object.fromEntries(f.map((k) => [k, b.params?.[k]])), fields: f });
  }
  if (!eq(a.platforms, b.platforms)) out.push({ entity: "Plataformas", id: "platforms", kind: "alteração", before: a.platforms, after: b.platforms, fields: ["platforms"] });
  return out;
}

export function summarize(ch: Change[]): string {
  if (!ch.length) return "sem alterações";
  const by = new Map<string, number>();
  for (const c of ch) by.set(`${c.kind} ${c.entity}`, (by.get(`${c.kind} ${c.entity}`) ?? 0) + 1);
  return [...by].map(([k, n]) => `${n}× ${k}`).join("; ");
}
