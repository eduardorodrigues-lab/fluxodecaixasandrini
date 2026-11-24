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
export function editSupplier(d: ScenarioData, id: string, f: { name: string; aliases: string[]; note: string; legalName?: string; cnpj?: string }) {
  const s = d.suppliers.find((x) => x.id === id);
  if (!s) throw new Error("Fornecedor não encontrado.");
  validateSupplierNames(d, id, f.name, f.aliases);
  Object.assign(s, { name: f.name.trim(), aliases: f.aliases.map((n) => n.trim()), note: f.note.trim() });
  if (f.legalName !== undefined) { if (f.legalName.trim()) s.legalName = f.legalName.trim(); else delete s.legalName; }
  if (f.cnpj !== undefined) {
    const digits = f.cnpj.replace(/\D/g, "");
    if (digits && digits.length !== 14) throw new Error("CNPJ deve ter 14 dígitos.");
    if (digits && d.suppliers.some((o) => o.id !== id && !o.mergedInto && o.cnpj?.replace(/\D/g, "") === digits)) throw new Error("CNPJ já cadastrado em outro fornecedor. Os cadastros não serão unidos.");
    if (digits) s.cnpj = digits; else delete s.cnpj;
  }
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
  // Incorporados (mergedInto) reconhecem o nome antigo e redirecionam ao principal.
  const hit = d.suppliers.find((s) => s.mergedInto && supplierNames(s).some((n) => normalizeSupplierName(n) === normalizeSupplierName(name)));
  if (hit) { let cur = hit; for (let i = 0; i < 10 && cur.mergedInto; i++) { const nx = d.suppliers.find((x) => x.id === cur.mergedInto); if (!nx) break; cur = nx; } return cur; }
  return d.suppliers.find((s) => !s.mergedInto && (!date || supplierActive(s, date)) && supplierNames(s).some((n) => normalizeSupplierName(n) === normalizeSupplierName(name)));
}

/** Busca de fornecedores por nome principal e apelidos, ignorando maiúsculas e acentos.
 *  `date` restringe aos ativos na data; `includeInactive` traz inativos também (para consultas históricas). */
export function filterSuppliers(d: ScenarioData, query: string, opts: { includeInactive?: boolean; date?: string | undefined } = {}): Supplier[] {
  const q = normalizeSupplierName(query);
  return d.suppliers
    .filter((s) => !s.mergedInto)
    .filter((s) => opts.includeInactive || !opts.date || supplierActive(s, opts.date))
    .filter((s) => !q || supplierNames(s).some((n) => normalizeSupplierName(n).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
/** Campos do cadastro completo (Cadastros e dentro do lançamento). CNPJ, razão social e código são opcionais; nada é inventado. */
export interface SupplierInput {
  name: string; legalName: string; cnpj: string; sourceSource: string; sourceCode: string; aliases: string[]; note: string; active: boolean;
  conditions: { name: string; terms: (number | null)[]; from: string | null; note: string }[];
}
export const emptySupplierInput = (name = ""): SupplierInput => ({ name, legalName: "", cnpj: "", sourceSource: "", sourceCode: "", aliases: [], note: "", active: true, conditions: [] });
/** Mensagens de validação (vazio = válido). Cada condição precisa de nome próprio e ao menos um prazo inteiro ≥ 0. */
export function supplierInputErrors(d: ScenarioData, id: string, f: SupplierInput): string[] {
  const e: string[] = [];
  try { validateSupplierNames(d, id, f.name, f.aliases.map((a) => a.trim()).filter(Boolean)); } catch (x) { e.push((x as Error).message); }
  const digits = f.cnpj.replace(/\D/g, "");
  if (digits && digits.length !== 14) e.push("CNPJ deve ter 14 dígitos (ou ficar em branco).");
  if (digits && d.suppliers.some((o) => o.id !== id && !o.mergedInto && o.cnpj?.replace(/\D/g, "") === digits)) e.push("CNPJ já cadastrado em outro fornecedor. Os cadastros não serão unidos.");
  if (f.sourceCode.trim() && !f.sourceSource.trim()) e.push("Informe a origem do código (ex.: FLUXO xlsm).");
  f.conditions.forEach((c, i) => {
    if (!c.name.trim()) e.push(`Condição ${i + 1}: informe o nome.`);
    if (!c.terms.some((t) => t !== null)) e.push(`Condição ${i + 1}: informe ao menos um prazo.`);
    if (c.terms.some((t) => t !== null && (!Number.isInteger(t) || t < 0))) e.push(`Condição ${i + 1}: prazos devem ser dias inteiros ≥ 0.`);
  });
  if (new Set(f.conditions.map((c) => normalizeSupplierName(c.name))).size !== f.conditions.length) e.push("Condições precisam de nomes distintos.");
  return e;
}
/** Monta o fornecedor completo (pura). Condição sem início fica "Sem vigência": nunca vira padrão automaticamente. */
export function buildSupplier(d: ScenarioData, id: string, f: SupplierInput, at: string, by: string): Supplier {
  const errs = supplierInputErrors(d, id, f);
  if (errs.length) throw new Error(errs.join(" "));
  if (d.suppliers.some((x) => x.id === id)) throw new Error("Fornecedor já cadastrado.");
  const digits = f.cnpj.replace(/\D/g, "");
  const conditions = f.conditions.map((c, i) => ({ id: `${id}-c${i + 1}`, name: c.name.trim(), terms: [...c.terms], from: c.from, at, by, note: c.note.trim(), periods: c.from ? [{ from: c.from, at, by }] : [] }));
  const s: Supplier = { id, name: f.name.trim(), group: "", terms: [], note: f.note.trim(), aliases: f.aliases.map((a) => a.trim()).filter(Boolean), conditions };
  if (f.legalName.trim()) s.legalName = f.legalName.trim();
  if (digits) s.cnpj = digits;
  if (f.sourceCode.trim()) s.sourceCodes = [{ source: f.sourceSource.trim(), code: f.sourceCode.trim() }];
  if (!f.active) s.activity = [{ active: false, from: at.slice(0, 10), at, by }];
  const today = at.slice(0, 10);
  const cur = conditions.filter((c) => c.from && c.from <= today).sort((a, b) => (b.from ?? "").localeCompare(a.from ?? ""))[0];
  if (cur) s.terms = [...cur.terms];
  return s;
}
export function createSupplierFull(d: ScenarioData, id: string, f: SupplierInput, at: string, by: string) { const s = buildSupplier(d, id, f, at, by); d.suppliers.push(s); return s; }
/** Código de origem com namespace (fonte+código); edição sem apagar códigos de outras fontes. */
export function setSupplierSourceCode(d: ScenarioData, id: string, source: string, code: string) {
  const s = d.suppliers.find((x) => x.id === id); if (!s) throw new Error("Fornecedor não encontrado.");
  if (code.trim() && !source.trim()) throw new Error("Informe a origem do código.");
  const rest = (s.sourceCodes ?? []).filter((c) => c.source !== source.trim());
  const next = code.trim() ? [...rest, { source: source.trim(), code: code.trim() }] : rest;
  if (next.length) s.sourceCodes = next; else delete s.sourceCodes;
}
/** Resolução estrita (organização = documento atual): só devolve o principal quando o nome/apelido aponta a UM único principal; senão vai à revisão. */
export function resolveSupplierStrict(d: ScenarioData, name: string): { status: "ok"; id: string } | { status: "ambiguo"; ids: string[] } | { status: "nenhum" } {
  const q = normalizeSupplierName(name); if (!q) return { status: "nenhum" };
  const root = (id: string) => { let cur = id; for (let i = 0; i < 20; i++) { const s = d.suppliers.find((x) => x.id === cur); if (!s?.mergedInto) return cur; cur = s.mergedInto; } return cur; };
  const ids = [...new Set(d.suppliers.filter((s) => supplierNames(s).some((n) => normalizeSupplierName(n) === q)).map((s) => root(s.id)))];
  return ids.length === 1 ? { status: "ok", id: ids[0]! } : ids.length ? { status: "ambiguo", ids } : { status: "nenhum" };
}
/** Código de origem sempre com namespace (fonte); o mesmo número em outra fonte não identifica o fornecedor. */
export function resolveBySourceCode(d: ScenarioData, source: string, code: string): { status: "ok"; id: string } | { status: "ambiguo"; ids: string[] } | { status: "nenhum" } {
  const ids = [...new Set(d.suppliers.filter((s) => !s.mergedInto && s.sourceCodes?.some((c) => c.source === source && c.code === code)).map((s) => s.id))];
  return ids.length === 1 ? { status: "ok", id: ids[0]! } : ids.length ? { status: "ambiguo", ids } : { status: "nenhum" };
}
