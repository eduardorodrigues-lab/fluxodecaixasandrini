import type { Committed, ScenarioData } from "./engine/types";

export interface DocumentGroup { key: string; document: string; titles: Committed[]; labels: Map<string, string> }
export interface DocumentIndex { byId: Map<string, DocumentGroup>; ambiguous: { id: string; document: string; reason: string }[] }


/** Presentation only. Imported A-number series require corroborating source cells and contiguous rows. */
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
    const m = /^(\d{4,})A([1-9]\d*)$/.exec(identifier);
    if (!m) {
      if (!c.importOrigin && c.supplierId && c.document) { const key = JSON.stringify([c.supplierId, c.purchaseCode, c.document]); explicit.set(key, [...(explicit.get(key) ?? []), c]); }
      continue;
    }
    const o = c.importOrigin, raw = o?.raw;
    if (!o || o.sheet !== "COMPRAS DIRETAS_EFETUADAS" || !raw || (c.document !== identifier && c.document !== m[1]) || raw[1] !== c.sourceSupplier || typeof raw[0] !== "string" || !c.sourceSupplier?.trim()) {
      ambiguous.push({ id: c.id, document: c.document, reason: "Identificação sem comprovação suficiente na origem" }); continue;
    }
    const base = m[1]; if (!base) continue;
    const key = JSON.stringify([c.sourceSupplier, c.supplierId, o.file, o.sheet, raw[0], raw[3], base]);
    candidates.set(key, [...(candidates.get(key) ?? []), { title: c, base, number: Number(m[2]) }]);
  }
  for (const [key, titles] of explicit) {
    const sorted = [...titles].sort((a, b) => (a.parcelNo ?? 0) - (b.parcelNo ?? 0) || a.dueDate.localeCompare(b.dueDate));
    const group: DocumentGroup = { key, document: sorted[0]?.document ?? "", titles: sorted, labels: new Map(sorted.map((c, i) => [c.id, `${c.parcelNo ?? i + 1}/${c.parcelCount ?? sorted.length}`])) };
    for (const c of sorted) byId.set(c.id, group);
  }
  for (const [key, entries] of candidates) {
    entries.sort((a, b) => a.number - b.number);
    const firstRow = entries[0]?.title.importOrigin?.row;
    const sourceDate = (c: Committed) => { const value = c.importOrigin?.raw?.[6]; return value && typeof value === "object" && "d" in value ? String(value.d) : typeof value === "string" ? value : ""; };
    const safe = entries.length > 1 && firstRow !== undefined && entries.every((x, i) => x.number === i + 1 && x.title.importOrigin?.row === firstRow + i && !!sourceDate(x.title) && (!i || sourceDate(x.title) > sourceDate(entries[i - 1]?.title ?? x.title)));
    const unrelated = d.committed.some((c) => !entries.some((e) => e.title.id === c.id) && c.importOrigin?.file === entries[0]?.title.importOrigin?.file && c.importOrigin?.sheet === entries[0]?.title.importOrigin?.sheet && entries.some((e) => Math.abs((c.importOrigin?.row ?? -100) - (e.title.importOrigin?.row ?? 100)) === 1) && c.document.match(/^(\d{4,})A([1-9]\d*)$/)?.[1] === entries[0]?.base && c.sourceSupplier === entries[0]?.title.sourceSupplier);
    if (!safe || unrelated) { for (const x of entries) ambiguous.push({ id: x.title.id, document: x.title.document, reason: "Série incompleta, duplicada ou com sequência de origem/vencimentos ambígua" }); continue; }
    const group: DocumentGroup = { key, document: entries[0]?.base ?? "", titles: entries.map((x) => x.title), labels: new Map(entries.map((x) => [x.title.id, `${x.number}/${entries.length}`])) };
    for (const x of entries) byId.set(x.title.id, group);
  }
  return { byId, ambiguous };
}