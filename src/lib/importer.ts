import { parseBRDate } from "./dates";
import { parseBRL } from "./money";

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

export type Entity = "planned" | "committed" | "expenses";
export interface FieldDef { key: string; label: string; type: "text" | "money" | "date" | "int" | "money?" | "date?"; required?: boolean }
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
    { key: "value", label: "Valor", type: "money", required: true }, { key: "baseDate", label: "Data base", type: "date", required: true }, { key: "termDays", label: "Prazo G (dias)", type: "int" },
  ],
};
// Chave estável de identidade por entidade (para não duplicar na reimportação).
export const KEY_FIELDS: Record<Entity, string[]> = { planned: ["purchaseCode", "document", "baseDate"], committed: ["purchaseCode", "document", "dueDate"], expenses: ["document", "baseDate", "supplier"] };

export interface ParsedRow { line: number; values: Record<string, string | number | null>; errors: string[]; key: string; hash: string; status?: "novo" | "idêntico" | "conflito" | "inválido" }

export function mapRows(entity: Entity, rows: string[][], mapping: Record<string, number>): ParsedRow[] {
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const values: ParsedRow["values"] = {};
    for (const f of FIELDS[entity]) {
      const col = mapping[f.key];
      const raw = col == null || col < 0 ? "" : (r[col] ?? "").trim();
      if (!raw) { values[f.key] = null; if (f.required) errors.push(`${f.label} vazio`); continue; }
      if (f.type.startsWith("money")) { const v = parseBRL(raw); if (v === null) errors.push(`${f.label} inválido`); values[f.key] = v; }
      else if (f.type.startsWith("date")) { const v = parseBRDate(raw); if (!v) errors.push(`${f.label} inválida (dd/mm/aaaa)`); values[f.key] = v; }
      else if (f.type === "int") { const n = Number(raw); if (!Number.isInteger(n)) errors.push(`${f.label} não inteiro`); values[f.key] = Number.isInteger(n) ? n : null; }
      else values[f.key] = raw;
    }
    const key = entity + "|" + KEY_FIELDS[entity].map((k) => String(values[k] ?? "").toLowerCase()).join("|");
    const hash = hashStr(JSON.stringify(FIELDS[entity].map((f) => values[f.key])));
    return { line: idx + 2, values, errors, key, hash };
  });
}

export function classify(rows: ParsedRow[], log: { key: string; hash: string }[]): ParsedRow[] {
  const seen = new Map(log.map((l) => [l.key, l.hash]));
  const inFile = new Set<string>();
  return rows.map((r) => {
    if (r.errors.length) return { ...r, status: "inválido" };
    if (inFile.has(r.key)) return { ...r, status: "conflito", errors: ["chave repetida no arquivo"] };
    inFile.add(r.key);
    const prev = seen.get(r.key);
    if (prev === undefined) return { ...r, status: "novo" };
    return { ...r, status: prev === r.hash ? "idêntico" : "conflito", errors: prev === r.hash ? [] : ["chave já importada com conteúdo diferente — requer conciliação"] };
  });
}

export function toCSV(header: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
}
