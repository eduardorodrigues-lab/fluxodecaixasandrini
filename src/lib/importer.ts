import { parseBRDate } from "./dates";
import { parseBRL, roundCents } from "./money";

export type Cell = string | number | boolean | null;
// Converte serial do Excel (sistema 1900) para ISO; vazio continua null (≠ zero).
export function excelSerialToISO(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null;
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}
export function convertCell(raw: Cell, type: string): { v: string | number | null; err?: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { v: null };
  if (type.startsWith("money")) { if (typeof raw === "number") return { v: roundCents(raw * 100) }; const v = parseBRL(String(raw)); return v === null ? { v: null, err: "inválido" } : { v }; }
  if (type.startsWith("date")) { if (typeof raw === "number") { const v = excelSerialToISO(raw); return v ? { v } : { v: null, err: "data serial inválida" }; } const v = parseBRDate(String(raw)); return v ? { v } : { v: null, err: "inválida (dd/mm/aaaa)" }; }
  if (type === "month") { if (typeof raw === "number") { const v = excelSerialToISO(raw); return v ? { v: v.slice(0, 7) } : { v: null, err: "mês inválido" }; } const t = String(raw).trim(); let m = /^(\d{1,2})\/(\d{4})$/.exec(t); if (m) return { v: `${m[2]}-${m[1]!.padStart(2, "0")}` }; m = /^(\d{4})-(\d{2})/.exec(t); if (m) return { v: `${m[1]}-${m[2]}` }; const d = parseBRDate(t); return d ? { v: d.slice(0, 7) } : { v: null, err: "mês inválido (mm/aaaa)" }; }
  if (type.startsWith("int")) { const n = typeof raw === "number" ? raw : Number(String(raw).trim()); return Number.isInteger(n) ? { v: n } : { v: null, err: "não inteiro" }; }
  return { v: typeof raw === "number" ? String(raw) : String(raw).trim() }; // fornecedores/documentos sempre texto
}

export function parseCSV(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type Entity = "planned" | "committed" | "expenses" | "suppliers" | "receipts" | "targets";
export interface FieldDef { key: string; label: string; type: "text" | "money" | "date" | "int" | "int?" | "money?" | "date?" | "month"; required?: boolean }
export const FIELDS: Record<Entity, FieldDef[]> = {
  planned: [
    { key: "supplier", label: "Fornecedor", type: "text", required: true }, { key: "purchaseCode", label: "Código compra", type: "text", required: true },
    { key: "document", label: "Documento", type: "text" }, { key: "value", label: "Valor orçado", type: "money", required: true }, { key: "baseDate", label: "Data base", type: "date", required: true },
  ],
  committed: [
    { key: "supplier", label: "Fornecedor", type: "text", required: true }, { key: "purchaseCode", label: "Código compra", type: "text" },
    { key: "document", label: "Documento", type: "text", required: true }, { key: "value", label: "Valor", type: "money", required: true },
    { key: "dueDate", label: "Vencimento", type: "date", required: true }, { key: "extensionDate", label: "Prorrogação", type: "date?" },
    { key: "legacyAbatement", label: "Base abatimento legado (M)", type: "money?" },
  ],
  expenses: [
    { key: "supplier", label: "Fornecedor", type: "text", required: true }, { key: "document", label: "Documento", type: "text", required: true },
    { key: "value", label: "Valor", type: "money", required: true }, { key: "baseDate", label: "Data base", type: "date", required: true }, { key: "termDays", label: "Prazo G (dias)", type: "int?" },
  ],
  suppliers: [
    { key: "name", label: "Fornecedor", type: "text", required: true }, { key: "group", label: "Grupo", type: "text" },
    ...Array.from({ length: 10 }, (_, i) => ({ key: `t${i + 1}`, label: `Prazo ${i + 1}`, type: "int?" as const })),
  ],
  receipts: [
    { key: "date", label: "Data", type: "date", required: true }, { key: "general", label: "Geral", type: "money?" },
    { key: "p1", label: "Plataforma 1", type: "money?" }, { key: "p2", label: "Plataforma 2", type: "money?" }, { key: "p3", label: "Plataforma 3", type: "money?" },
  ],
  targets: [{ key: "month", label: "Mês", type: "month", required: true }, { key: "meta", label: "Meta bruta", type: "money", required: true }],
};
// Sugestões de mapeamento por cabeçalho. "Base de abatimento legado (M)" NUNCA é sugerida automaticamente (ambígua: revisar).
export const HINTS: Record<string, RegExp> = {
  supplier: /fornec/i, purchaseCode: /c[oó]d/i, document: /doc|nf|nota|t[ií]tulo/i, value: /valor|vlr|or[cç]ado/i, baseDate: /data( base)?|emiss/i,
  dueDate: /venc/i, extensionDate: /prorrog/i, termDays: /prazo/i, name: /fornec|nome/i, group: /grupo/i, date: /^data/i, general: /geral/i, month: /m[eê]s/i, meta: /meta|previs/i,
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`t${i + 1}`, new RegExp(`(prazo|p)\\s*0?${i + 1}$`, "i")])),
};
export function suggestMapping(entity: Entity, header: Cell[]): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of FIELDS[entity]) {
    const exact = header.findIndex((h) => String(h ?? "").trim().toLowerCase() === f.label.toLowerCase());
    const re = HINTS[f.key];
    const idx = exact >= 0 ? exact : re ? header.findIndex((h, i) => !used.has(i) && re.test(String(h ?? "").trim())) : -1;
    out[f.key] = idx; if (idx >= 0) used.add(idx);
  }
  return out;
}
// Chave estável de identidade por entidade (para não duplicar na reimportação).
export const KEY_FIELDS: Record<Entity, string[]> = { planned: ["purchaseCode", "document", "baseDate"], committed: ["purchaseCode", "document", "dueDate"], expenses: ["document", "baseDate", "supplier"], suppliers: ["name"], receipts: ["date"], targets: ["month"] };

export interface ParsedRow { line: number; values: Record<string, string | number | null>; errors: string[]; key: string; hash: string; status?: "novo" | "idêntico" | "conflito" | "inválido" }

export function mapRows(entity: Entity, rows: Cell[][], mapping: Record<string, number>, firstLine = 2): ParsedRow[] {
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const values: ParsedRow["values"] = {};
    for (const f of FIELDS[entity]) {
      const col = mapping[f.key];
      const raw = col == null || col < 0 ? null : (r[col] ?? null);
      const { v, err } = convertCell(raw, f.type);
      values[f.key] = v;
      if (err) errors.push(`${f.label} ${err}`);
      else if (v === null && f.required) errors.push(`${f.label} vazio`);
    }
    const key = entity + "|" + KEY_FIELDS[entity].map((k) => String(values[k] ?? "").toLowerCase()).join("|");
    const hash = hashStr(JSON.stringify(FIELDS[entity].map((f) => values[f.key])));
    return { line: idx + firstLine, values, errors, key, hash };
  });
}

export function classify(rows: ParsedRow[], log: { key: string; hash: string }[], existingKeys: Set<string> = new Set()): ParsedRow[] {
  const seen = new Map(log.map((l) => [l.key, l.hash]));
  const inFile = new Set<string>();
  return rows.map((r) => {
    if (r.errors.length) return { ...r, status: "inválido" };
    if (inFile.has(r.key)) return { ...r, status: "conflito", errors: ["chave repetida no arquivo"] };
    inFile.add(r.key);
    const prev = seen.get(r.key);
    if (prev === undefined) return existingKeys.has(r.key) ? { ...r, status: "conflito", errors: ["já existe cadastro com esta chave sem origem de importação — conciliar"] } : { ...r, status: "novo" };
    return { ...r, status: prev === r.hash ? "idêntico" : "conflito", errors: prev === r.hash ? [] : ["chave já importada com conteúdo diferente — requer conciliação"] };
  });
}

export function toCSV(header: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
}
