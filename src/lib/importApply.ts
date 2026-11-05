import type { Entity, ParsedRow } from "./importer";
import type { ScenarioData } from "./engine/types";
import { setMonthTarget } from "./engine/actions";
import { normName, resolveByName } from "./xlsxImport";

// Aplica linhas "novo" já classificadas a um RASCUNHO (x). Compartilhado entre a tela Regras/Importação e o
// script de validação do XLSM real — a mesma regra de conversão nos dois lugares.
// Títulos históricos (efetivados/despesas) entram com paymentUnconfirmed=true: situação a confirmar, nunca "pago" por data passada.
export interface ApplyResult { applied: number; skipped: string[]; createdSuppliers: string[]; createdCategories: string[]; createdPlatforms: string[] }

export function applyImportRows(x: ScenarioData, entity: Entity, rows: ParsedRow[], ctx: { file: string; sheet: string; at: string; uid: () => string }): ApplyResult {
  const res: ApplyResult = { applied: 0, skipped: [], createdSuppliers: [], createdCategories: [], createdPlatforms: [] };
  const { at, uid } = ctx;
  for (const r of rows) {
    if (r.status && r.status !== "novo") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = r.values;
    const origin = { file: ctx.file, sheet: ctx.sheet || "CSV", row: r.line };
    const supOf = (): string | null => {
      if (v.supplier == null || String(v.supplier).trim() === "") return "";
      const r0 = resolveByName(x.suppliers, String(v.supplier));
      if ("id" in r0) return r0.id;
      if ("conflict" in r0) { res.skipped.push(`linha ${r.line}: fornecedor "${v.supplier}" ambíguo (${r0.conflict.length} cadastros)`); return null; }
      const s2 = { id: uid(), name: String(v.supplier).trim(), group: "(importado — revisar)", terms: Array(10).fill(null) };
      x.suppliers.push(s2); res.createdSuppliers.push(s2.name); return s2.id;
    };
    const catOf = (): string => {
      if (!v.category) return "";
      const r0 = resolveByName(x.categories, String(v.category));
      if ("id" in r0) return r0.id;
      if ("conflict" in r0) return "";
      const c2 = { id: uid(), name: String(v.category).trim(), kind: "despesa" as const, group: String(v.group ?? "(importado — revisar)") };
      x.categories.push(c2); res.createdCategories.push(c2.name); return c2.id;
    };
    const platOf = (name: string): string => {
      const n = normName(name);
      const hit = x.platforms.filter((p) => normName(p.name) === n || (p.importedCode != null && normName(p.importedCode) === n));
      if (hit.length === 1) return hit[0]!.id;
      if (hit.length > 1) { res.skipped.push(`linha ${r.line}: plataforma "${name}" ambígua`); return ""; }
      // Nome vem do próprio arquivo (não inventado); grafias diferentes ficam separadas até conciliação manual.
      const p = { id: uid(), name: name.trim(), start: v.date, end: null, importedCode: name.trim(), history: [{ at, field: "criação", from: null, to: name.trim(), note: `importado ${origin.sheet}:${origin.row} — revisar nome/vigência` }] };
      x.platforms.push(p); res.createdPlatforms.push(p.name); return p.id;
    };
    const needsSup = entity === "planned" || entity === "committed" || entity === "expenses";
    const sid = needsSup ? supOf() : "";
    if (sid === null) continue;
    const id = uid();
    const rowTerms = Array.from({ length: 10 }, (_, i) => (v[`t${i + 1}`] as number | null) ?? null);
    if (entity === "planned") x.planned.push({ id, supplierId: sid, terms: rowTerms.some((t) => t !== null) ? rowTerms : null, purchaseCode: String(v.purchaseCode ?? ""), document: String(v.document ?? ""), value: v.value, baseDate: v.baseDate, categoryId: "", notes: "importado", status: "ativo", remainingOverride: null, origin });
    if (entity === "committed") x.committed.push({ id, supplierId: sid, purchaseCode: String(v.purchaseCode ?? ""), document: String(v.document), value: v.value, dueDate: v.dueDate, extensionDate: v.extensionDate ?? null, extensionHistory: v.extensionDate ? [{ from: null, to: v.extensionDate, at, note: "importado" }] : [], extensionInfo: "", legacyAbatement: v.legacyAbatement ?? null, origin: v.legacyAbatement != null ? "legado" : "manual", plannedId: null, effectivationId: null, categoryId: "", notes: "importado", status: "ativo", importOrigin: origin, paymentUnconfirmed: true });
    if (entity === "expenses") x.expenses.push({ id, supplierId: sid, document: String(v.document), value: v.value, baseDate: v.baseDate, termDays: v.termDays ?? null, extensionDate: null, extensionHistory: [], categoryId: catOf(), notes: "importado", status: "ativo", importOrigin: origin, paymentUnconfirmed: true });
    if (entity === "suppliers") {
      const r0 = resolveByName(x.suppliers, String(v.name));
      if (!("missing" in r0)) { res.skipped.push(`linha ${r.line}: fornecedor "${v.name}" já existe — não sobrescrito (conflito)`); continue; }
      x.suppliers.push({ id, name: String(v.name), group: String(v.group ?? ""), terms: rowTerms });
    }
    if (entity === "receipts") {
      const plats: Record<string, number | null> = {};
      let general: number | null = v.general ?? null;
      if (v.platform != null && String(v.platform).trim() !== "") { const pid = platOf(String(v.platform)); if (!pid) continue; plats[pid] = v.amount ?? null; }
      else if (v.amount != null) general = (general ?? 0) + v.amount; // sem plataforma: valor geral
      x.receipts.push({ id, date: v.date, platforms: plats, general, notes: `importado ${origin.sheet}:${origin.row}${v.code ? ` · ${v.code}` : ""}`, residual: {} });
    }
    if (entity === "targets") setMonthTarget(x, v.month, { gross: v.meta }, `importado ${origin.sheet}:${origin.row}`, at);
    x.importLog.push({ entity, key: r.key, hash: r.hash, refId: entity === "targets" ? v.month : id, at, origin });
    res.applied++;
  }
  // Vigência inicial das plataformas criadas = primeira data com recebimento delas (evita alerta falso de "fora da vigência").
  for (const p of x.platforms) {
    if (!res.createdPlatforms.includes(p.name) || p.history[0]?.at !== at) continue;
    const ds = x.receipts.filter((r) => r.platforms[p.id] !== undefined).map((r) => r.date).sort();
    if (ds[0]) p.start = ds[0];
  }
  return res;
}
