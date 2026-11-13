import type { ScenarioData } from "./engine/types";

export interface SupplierSource { supplierId?: string | undefined; sourceSupplier?: string | undefined; origin?: unknown; importOrigin?: { sheet?: string | undefined; raw?: unknown[] | undefined } | null | undefined }
/** Historical display identity never supplies terms or changes a stored financial relationship. */
export function sourceSupplierName(row?: SupplierSource) {
  if (row?.sourceSupplier?.trim()) return row.sourceSupplier.trim();
  const origin = row?.importOrigin ?? (typeof row?.origin === "object" ? row.origin as SupplierSource["importOrigin"] : undefined);
  const index = origin?.sheet === "Lançamentos" ? 3 : origin?.sheet?.startsWith("COMPRAS DIRETAS") ? 1 : -1;
  const value = index >= 0 ? origin?.raw?.[index] : undefined;
  return typeof value === "string" ? value.trim() : "";
}
export function supplierIdentity(data: Pick<ScenarioData, "suppliers">, row?: SupplierSource) {
  const supplier = data.suppliers.find((s) => s.id === row?.supplierId);
  if (supplier) return { key: supplier.id, name: supplier.name, pending: false };
  const name = sourceSupplierName(row);
  return { key: name ? `pending:${identityName(name)}` : "supplier:none", name: name || "Sem fornecedor", pending: !!name };
}
export function supplierIdentityOptions(data: ScenarioData) {
  const options = new Map(data.suppliers.map((s) => [s.id, { key: s.id, name: s.name, pending: false }]));
  for (const row of [...data.planned, ...data.committed, ...data.expenses]) {
    const identity = supplierIdentity(data, row);
    options.set(identity.key, identity);
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
export function matchesSupplier(data: Pick<ScenarioData, "suppliers">, row: SupplierSource, filter?: string) {
  return !filter || supplierIdentity(data, row).key === filter;
}

/** Only exact names/aliases, optionally preceded by a numeric source code. No brand/legal-name inference. */
export function resolveSupplierLinks(source: ScenarioData) {
  const data = structuredClone(source);
  const names = new Map<string, Set<string>>();
  for (const s of data.suppliers) for (const name of [s.name, ...(s.aliases ?? [])]) {
    const key = identityName(name); const ids = names.get(key) ?? new Set<string>(); ids.add(s.id); names.set(key, ids);
  }
  const counts = { planned: 0, committed: 0, expenses: 0 };
  const pending: Record<string, number> = {};
  for (const collection of ["planned", "committed", "expenses"] as const) for (const row of data[collection]) {
    if (row.supplierId) continue;
    const name = sourceSupplierName(row), normalized = identityName(name);
    const ids = names.get(normalized) ?? names.get(normalized.replace(/^\d+\s*-\s*/, ""));
    const id = ids?.size === 1 ? [...ids][0] : undefined;
    const safeTerms = collection !== "planned" || "terms" in row && !!row.terms || "installments" in row && !!row.installments?.length || "remainingOverride" in row && !!row.remainingOverride;
    if (id && safeTerms) { row.supplierId = id; counts[collection]++; }
    else { const key = name ? identityName(name) : "(nome ausente)"; pending[key] = (pending[key] ?? 0) + 1; }
  }
  return { data, counts, pending };
}

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