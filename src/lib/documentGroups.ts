import type { Committed, ScenarioData } from "./engine/types";

export interface DocumentGroup { key: string; document: string; titles: Committed[]; labels: Map<string, string> }
export interface DocumentIndex { byId: Map<string, DocumentGroup>; ambiguous: { id: string; document: string; reason: string }[] }


/** Presentation only. Imported A-number series require matching source identities and dates,
 * not adjacent worksheet rows (the source can be ordered by due date).
 * Existing note IDs always take precedence; this never writes inferred links to records.
 */
export function documentGroups(d: Pick<ScenarioData, "committed">): DocumentIndex {
  const byId = new Map<string, DocumentGroup>(), ambiguous: DocumentIndex["ambiguous"] = [];
  const candidates = new Map<string, { title: Committed; base: string; number: number }[]>();
  const explicit = new Map<string, Committed[]>();
  for (const c of d.committed) {
    const single: DocumentGroup = { key: c.id, document: c.document, titles: [c], labels: new Map([[c.id, "1/1"]]) };
    byId.set(c.id, single);
    if (c.noteId) { const key = JSON.stringify([c.supplierId || c.sourceSupplier, c.noteId]); explicit.set(key, [...(explicit.get(key) ?? []), c]); continue; }
    const rawDocument = c.importOrigin?.raw?.[2];
    const identifier = typeof rawDocument === "string" ? rawDocument : c.document;
    const m = /^(\d+)A([1-9]\d*)$/.exec(identifier);
    if (!m) {
      if (!c.importOrigin && c.supplierId && c.document) { const key = JSON.stringify([c.supplierId, c.purchaseCode, c.document]); explicit.set(key, [...(explicit.get(key) ?? []), c]); }
      continue;
    }
    const o = c.importOrigin, raw = o?.raw;
    if (!o?.file || o.sheet !== "COMPRAS DIRETAS_EFETUADAS" || !raw || raw[2] !== identifier || (c.document !== identifier && c.document !== m[1]) || raw[1] !== c.sourceSupplier || !c.sourceSupplier?.trim() || !sourceDate(raw[3]) || !sourceDate(raw[6]) || !Number.isSafeInteger(Number(m[2]))) {
      ambiguous.push({ id: c.id, document: c.document, reason: "Identificação sem comprovação suficiente na origem" }); continue;
    }
    const base = m[1]; if (!base) continue;
    // Missing purchase codes are valid; neither fuzzy supplier names nor document prefixes
    // establish a link. Separate source dates/orders and pre-existing links stay separate.
    const key = JSON.stringify([c.sourceSupplier, c.supplierId, o.file, o.sheet, raw[0] ?? "", sourceDate(raw[3]), base, c.plannedId, c.effectivationId]);
    candidates.set(key, [...(candidates.get(key) ?? []), { title: c, base, number: Number(m[2]) }]);
  }
  for (const [key, titles] of explicit) {
    const sorted = [...titles].sort((a, b) => (a.parcelNo ?? 0) - (b.parcelNo ?? 0) || a.dueDate.localeCompare(b.dueDate));
    const group: DocumentGroup = { key, document: sorted[0]?.document ?? "", titles: sorted, labels: new Map(sorted.map((c, i) => [c.id, `${c.parcelNo ?? i + 1}/${c.parcelCount ?? sorted.length}`])) };
    for (const c of sorted) byId.set(c.id, group);
  }
  for (const [key, entries] of candidates) {
    entries.sort((a, b) => a.number - b.number);
    const safe = entries.length > 1 && new Set(entries.map(x => x.title.importOrigin?.row)).size === entries.length && entries.every((x, i) => x.number === i + 1 && Number.isInteger(x.title.importOrigin?.row) && (!i || sourceDate(x.title.importOrigin?.raw?.[6]) > sourceDate(entries[i - 1]?.title.importOrigin?.raw?.[6])));
    if (!safe) { for (const x of entries) ambiguous.push({ id: x.title.id, document: x.title.document, reason: "Série incompleta, duplicada ou com sequência de origem/vencimentos ambígua; total de parcelas não comprovado" }); continue; }
    const group: DocumentGroup = { key, document: entries[0]?.base ?? "", titles: entries.map((x) => x.title), labels: new Map(entries.map((x) => [x.title.id, `${x.number}/${entries.length}`])) };
    for (const x of entries) byId.set(x.title.id, group);
  }
  return { byId, ambiguous };
}

/** Compare source dates only, never changed due dates/extensions. Excel serials are
 * converted without timezone serialization; malformed/missing dates cannot prove a series. */
function sourceDate(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 2958466) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = typeof value === "string" ? value : value && typeof value === "object" && "d" in value && typeof value.d === "string" ? value.d : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : "";
}