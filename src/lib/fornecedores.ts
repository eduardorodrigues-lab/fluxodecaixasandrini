import type { ScenarioData, Supplier } from "./engine/types";

export const normalizeSupplierName = (name: string) => name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
export const supplierNames = (s: Supplier) => [s.name, ...(s.aliases ?? [])];
export const supplierActive = (s: Supplier, date: string) => {
  const events = [...(s.activity ?? [])].filter((e) => e.from <= date).sort((a, b) => a.from.localeCompare(b.from) || a.at.localeCompare(b.at));
  return events.at(-1)?.active ?? true;
};
export function validateSupplierNames(d: ScenarioData, id: string, name: string, aliases: string[]) {
  const names = [name, ...aliases].map(normalizeSupplierName);
  if (!names[0] || names[0] === "novo fornecedor") throw new Error("Informe o nome do fornecedor.");
  if (names.some((n) => !n) || new Set(names).size !== names.length) throw new Error("Informe apelidos distintos e não vazios.");
  const other = d.suppliers.find((s) => s.id !== id && supplierNames(s).some((n) => names.includes(normalizeSupplierName(n))));
  if (other) throw new Error(`Nome ou apelido já associado ao fornecedor "${other.name}". Os cadastros não serão unidos.`);
}
export function editSupplier(d: ScenarioData, id: string, f: { name: string; aliases: string[]; note: string }) {
  const s = d.suppliers.find((x) => x.id === id);
  if (!s) throw new Error("Fornecedor não encontrado.");
  validateSupplierNames(d, id, f.name, f.aliases);
  Object.assign(s, { name: f.name.trim(), aliases: f.aliases.map((n) => n.trim()), note: f.note.trim() });
}
export function setSupplierActivity(d: ScenarioData, id: string, active: boolean, from: string, at: string, by: string) {
  const s = d.suppliers.find((x) => x.id === id);
  if (!s) throw new Error("Fornecedor não encontrado.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(from)) || new Date(from).toISOString().slice(0, 10) !== from) throw new Error("Informe uma data válida.");
  s.activity = [...(s.activity ?? []), { active, from, at, by }];
}
export function supplierLinks(d: ScenarioData, id: string): string[] {
  const s = d.suppliers.find((x) => x.id === id);
  const reasons: string[] = [];
  if (s && (s.conditions?.length || s.terms.some((t) => t !== null) || s.termsHistory?.length)) reasons.push("condições de pagamento");
  if ([...d.planned, ...d.committed, ...d.expenses].some((x) => x.supplierId === id)) reasons.push("lançamentos e suas obrigações/histórico");
  if (d.importLog.some((x) => x.refId === id)) reasons.push("histórico de importação");
  return reasons;
}
export function deleteSupplier(d: ScenarioData, id: string) {
  const reasons = supplierLinks(d, id);
  if (reasons.length) throw new Error(`Exclusão bloqueada: fornecedor possui ${reasons.join(", ")}. Use Inativar.`);
  d.suppliers = d.suppliers.filter((s) => s.id !== id);
}
export function resolveSupplier(d: ScenarioData, name: string, date?: string) {
  return d.suppliers.find((s) => (!date || supplierActive(s, date)) && supplierNames(s).some((n) => normalizeSupplierName(n) === normalizeSupplierName(name)));
}