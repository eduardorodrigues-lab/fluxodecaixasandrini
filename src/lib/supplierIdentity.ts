import type { ScenarioData } from "./engine/types";

export const identityName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();

/** Explicitly reviewed identity pairs only; never infer identity from terms or fuzzy names. */
export function linkSupplierIdentities(source: ScenarioData, pairs: [string, string][]) {
  const data = structuredClone(source);
  const redirects = new Map<string, string>();
  for (const [duplicateId, mainId] of pairs) {
    const old = data.suppliers.find((s) => s.id === duplicateId);
    const main = data.suppliers.find((s) => s.id === mainId);
    if (!old || !main || old.id === main.id) throw new Error("Par de fornecedores inválido.");
    main.aliases = [...new Set([...(main.aliases ?? []), old.name, ...(old.aliases ?? [])])];
    const ids = new Set((main.conditions ?? []).map((c) => c.id));
    if ((old.conditions ?? []).some((c) => ids.has(c.id))) throw new Error("Condição com identidade duplicada.");
    main.conditions = [...(main.conditions ?? []), ...(old.conditions ?? [])];
    // Retain the entire removed record's activity, periods, notes and original terms as provenance.
    const provenance = main as typeof main & { consolidatedSources?: typeof data.suppliers };
    provenance.consolidatedSources = [...(provenance.consolidatedSources ?? []), structuredClone(old)];
    data.suppliers = data.suppliers.filter((s) => s.id !== old.id);
    redirects.set(old.id, main.id);
  }
  const names = new Map<string, Set<string>>();
  for (const s of data.suppliers) for (const name of [s.name, ...(s.aliases ?? [])]) {
    if (["OUTROS", "MOCHILA ESCOLAR", "MOCHILA NOTEBOOK", "TESTE DE COMPRA JEAN", "COMPRA TESTE RENAN"].includes(identityName(s.name))) continue;
    const key = identityName(name);
    const set = names.get(key) ?? new Set<string>(); set.add(s.id); names.set(key, set);
  }
  const counts = { planned: 0, committed: 0, expenses: 0 };
  const pending: Record<string, number> = {};
  for (const collection of ["planned", "committed", "expenses"] as const) for (const row of data[collection]) {
    const choices = names.get(identityName(row.sourceSupplier ?? ""));
    const id = redirects.get(row.supplierId) ?? (row.supplierId || (choices?.size === 1 ? [...choices][0] : undefined));
    if (!id) { const name = row.sourceSupplier || "(nome ausente)"; pending[name] = (pending[name] ?? 0) + 1; continue; }
    // Supplier identity must not introduce fallback terms into a source obligation.
    if (collection === "planned") {
      const planned = row as ScenarioData["planned"][number];
      if (!planned.terms && !planned.installments?.length && !planned.remainingOverride) throw new Error(`Vínculo exigiria prazos cadastrais: ${planned.id}`);
    }
    if (id !== row.supplierId) { row.supplierId = id; counts[collection]++; }
  }
  return { data, counts, pending };
}