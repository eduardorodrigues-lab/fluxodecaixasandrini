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
  { key: "bankAccounts", label: "Conta bancária", id: (x) => String(x["id"]) },
  { key: "cards", label: "Cartão", id: (x) => String(x["id"]) },
  { key: "cardOps", label: "Operação no cartão", id: (x) => String(x["id"]) },
  { key: "transfers", label: "Transferência", id: (x) => String(x["id"]) },
  { key: "adjustments", label: "Ajuste de saldo", id: (x) => String(x["date"]) },
  { key: "importLog", label: "Registro de importação", id: (x) => String(x["key"]) },
];
// Comparação independente da ordem das chaves (o banco reordena chaves de objetos JSON ao gravar).
const stable = (v: unknown): unknown => (Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v);
const eq = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

export function diffData(a: ScenarioData, b: ScenarioData): Change[] {
  const out: Change[] = [];
  for (const c of COLLECTIONS) {
    if (a[c.key] === b[c.key]) continue; // edição com compartilhamento estrutural: coleção intocada
    const A = new Map(((a[c.key] ?? []) as unknown as Record<string, unknown>[]).map((x) => [c.id(x), x]));
    const B = new Map(((b[c.key] ?? []) as unknown as Record<string, unknown>[]).map((x) => [c.id(x), x]));
    for (const [id, x] of A) {
      const y = B.get(id);
      if (x === y) continue;
      if (!y) out.push({ entity: c.label, id, kind: "exclusão", before: x, after: null, fields: [] });
      else if (!eq(x, y)) out.push({ entity: c.label, id, kind: "alteração", before: x, after: y, fields: Object.keys({ ...x, ...y }).filter((k) => !eq(x[k], y[k])) });
    }
    for (const [id, y] of B) if (!A.has(id)) out.push({ entity: c.label, id, kind: "inclusão", before: null, after: y, fields: [] });
  }
  if (a.targets !== b.targets) {
  const months = new Set([...Object.keys(a.targets ?? {}), ...Object.keys(b.targets ?? {})]);
  for (const m of [...months].sort()) {
    const x = a.targets?.[m], y = b.targets?.[m];
    if (x !== y) out.push({ entity: "Meta de faturamento", id: m, kind: x == null ? "inclusão" : y == null ? "exclusão" : "alteração", before: x ?? null, after: y ?? null, fields: ["meta"] });
  }
  }
  if (a.targetConfigs !== b.targetConfigs) for (const m of new Set([...Object.keys(a.targetConfigs ?? {}), ...Object.keys(b.targetConfigs ?? {})])) {
    const x = a.targetConfigs?.[m], y = b.targetConfigs?.[m];
    if (!eq(x, y)) out.push({ entity: "Configuração financeira mensal", id: m, kind: !x ? "inclusão" : !y ? "exclusão" : "alteração", before: x ?? null, after: y ?? null, fields: Object.keys({ ...x, ...y }).filter((k) => k !== "history" && !eq(x?.[k as keyof typeof x], y?.[k as keyof typeof y])) });
  }
  if (a.params !== b.params && !eq(a.params, b.params)) {
    const keys = Object.keys({ ...a.params, ...b.params }) as (keyof ScenarioData["params"])[];
    const f = keys.filter((k) => !eq(a.params?.[k], b.params?.[k]));
    out.push({ entity: "Parâmetros", id: "params", kind: "alteração", before: Object.fromEntries(f.map((k) => [k, a.params?.[k]])), after: Object.fromEntries(f.map((k) => [k, b.params?.[k]])), fields: f });
  }
  if (a.platforms !== b.platforms && !eq(a.platforms, b.platforms)) out.push({ entity: "Plataformas", id: "platforms", kind: "alteração", before: a.platforms, after: b.platforms, fields: ["platforms"] });
  return out;
}

export function summarize(ch: Change[]): string {
  if (!ch.length) return "sem alterações";
  const by = new Map<string, number>();
  for (const c of ch) by.set(`${c.kind} ${c.entity}`, (by.get(`${c.kind} ${c.entity}`) ?? 0) + 1);
  return [...by].map(([k, n]) => `${n}× ${k}`).join("; ");
}

// ---- Gravação por alterações (patch): só os registros alterados trafegam; o servidor confere cada "antes". ----
export interface Conflict { change: Change; server: unknown }
const opKey = (c: Change) => `${c.entity}|${c.id}`;
export { opKey };
/** Aplica alterações sobre a base com compartilhamento estrutural. check=true: recusa registro cujo valor atual
 *  difere do "antes" (mesma informação alterada por outra pessoa); valor já igual ao "depois" é ignorado (idempotente). */
export function applyOps(base: ScenarioData, ops: Change[], check: boolean): { data: ScenarioData; conflicts: Conflict[]; applied: Change[] } {
  const d = { ...base } as unknown as Record<string, unknown>;
  const copied = new Set<string>(); const idx = new Map<string, Map<string, number>>();
  const arr = (k: string) => { if (!copied.has(k)) { d[k] = [...((base as unknown as Record<string, unknown[]>)[k] ?? [])]; copied.add(k); } return d[k] as Record<string, unknown>[]; };
  const obj = (k: string) => { if (!copied.has(k)) { d[k] = { ...((base as unknown as Record<string, object>)[k] ?? {}) }; copied.add(k); } return d[k] as Record<string, unknown>; };
  const conflicts: Conflict[] = [], applied: Change[] = [];
  for (const op of ops) {
    const col = COLLECTIONS.find((c) => c.label === op.entity);
    let cur: unknown; let set: (v: unknown) => void;
    if (col) {
      const a = arr(col.key as string);
      let m = idx.get(col.key as string); if (!m) { m = new Map(a.map((x, i) => [col.id(x), i])); idx.set(col.key as string, m); }
      const i = m.get(op.id); cur = i == null ? null : a[i];
      set = (v) => { if (v == null) { if (i != null) { a.splice(i, 1); idx.delete(col.key as string); } } else if (i != null) a[i] = v as Record<string, unknown>; else { a.push(v as Record<string, unknown>); m!.set(op.id, a.length - 1); } };
    } else if (op.entity === "Meta de faturamento" || op.entity === "Configuração financeira mensal") {
      const o = obj(op.entity === "Meta de faturamento" ? "targets" : "targetConfigs"); cur = o[op.id] ?? null;
      set = (v) => { if (v == null) delete o[op.id]; else o[op.id] = v; };
    } else if (op.entity === "Parâmetros") {
      const o = obj("params"); const f = Object.keys((op.after ?? {}) as object);
      cur = Object.fromEntries(f.map((k) => [k, o[k]]));
      set = (v) => { Object.assign(o, v as object); };
    } else if (op.entity === "Plataformas") { cur = d["platforms"]; set = (v) => { d["platforms"] = v; }; }
    else throw new Error(`Alteração desconhecida: ${op.entity}`);
    const now = cur ?? null;
    if (eq(now, op.after ?? null)) continue;
    if (check && !eq(now, op.before ?? null)) { conflicts.push({ change: op, server: now }); continue; }
    set(op.after ?? null);
    applied.push({ ...op, before: now });
  }
  return { data: d as unknown as ScenarioData, conflicts, applied };
}
/** Acumula alterações novas sobre as pendentes: mantém o "antes" original e o "depois" mais recente. */
export function mergeOps(ops: Change[], delta: Change[]): Change[] {
  const m = new Map(ops.map((o) => [opKey(o), o]));
  for (const c of delta) {
    const k = opKey(c), o = m.get(k);
    let n: Change;
    if (!o) n = c;
    else if (c.entity === "Parâmetros") {
      const before = { ...(c.before as object), ...(o.before as object) } as Record<string, unknown>, after = { ...(o.after as object), ...(c.after as object) } as Record<string, unknown>;
      const f = Object.keys(after).filter((x) => !eq(before[x], after[x]));
      n = { ...o, before: Object.fromEntries(f.map((x) => [x, before[x]])), after: Object.fromEntries(f.map((x) => [x, after[x]])), fields: f };
      if (!f.length) { m.delete(k); continue; }
    } else {
      const x = o.before as Record<string, unknown> | null, y = c.after as Record<string, unknown> | null;
      n = { ...o, after: c.after, kind: x == null ? "inclusão" : y == null ? "exclusão" : "alteração", fields: x && y && typeof x === "object" ? Object.keys({ ...x, ...y }).filter((f) => !eq(x[f], y[f])) : o.fields };
    }
    if (eq(n.before ?? null, n.after ?? null)) m.delete(k); else m.set(k, n);
  }
  return [...m.values()];
}
