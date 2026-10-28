import * as XLSX from "xlsx";
import { excelSerialToISO, type Cell, type Entity } from "./importer";
import { parseBRDate } from "./dates";
import { roundCents } from "./money";
import type { Day } from "./engine/types";

// Leitura nativa .xlsx/.xlsm: lê apenas valores (cacheados). VBA NUNCA é executado nem carregado (bookVBA:false).
export type SheetKind = Entity | "fluxo" | "nao_mapeada" | "desconhecida";
const KNOWN: [string, SheetKind, string][] = [
  ["FLUXO DE CAIXA", "fluxo", "Matriz distribuída — NÃO importada; usada só para conciliação com valores cacheados"],
  ["RECEBIMENTOS", "receipts", "Recebimentos (entrada)"],
  ["PREVISAO DE VENDAS", "targets", "Metas/previsão mensal (entrada)"],
  ["TABELA_FORNECEDORES", "suppliers", "Fornecedores e prazos (entrada)"],
  ["TABELA_DESPESAS", "nao_mapeada", "Tabela de despesas — estrutura não confirmada; revisar antes de mapear"],
  ["COMPRAS DIRETAS_PLANEJADAS", "planned", "Previsões de compra (entrada)"],
  ["COMPRAS DIRETAS_EFETUADAS", "committed", "Compras efetivadas (entrada; coluna M exige mapeamento manual)"],
  ["DESPESAS E OUTRAS", "expenses", "Despesas (entrada)"],
];
export const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export function recognize(name: string): { kind: SheetKind; note: string } {
  const n = normName(name);
  const k = KNOWN.find(([x]) => n === x) ?? KNOWN.find(([x]) => n.startsWith(x));
  return k ? { kind: k[1], note: k[2] } : { kind: "desconhecida", note: "Aba não reconhecida — ignorada" };
}
export interface SheetInfo { name: string; kind: SheetKind; note: string; rows: Cell[][]; headerRow: number }
export function detectHeader(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) if ((rows[i] ?? []).filter((c) => typeof c === "string" && c.trim()).length >= 3) return i;
  return 0;
}
export function readWorkbook(buf: ArrayBuffer): SheetInfo[] {
  const wb = XLSX.read(buf, { type: "array", cellFormula: false, cellDates: false, bookVBA: false, cellHTML: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]!;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const r = recognize(name);
    return { name, ...r, rows, headerRow: detectHeader(rows) };
  });
}

// ---------- Conciliação com a aba FLUXO DE CAIXA (valores cacheados) ----------
const asDate = (c: Cell): string | null => (typeof c === "number" && c > 30000 && c < 80000 ? excelSerialToISO(c) : typeof c === "string" ? parseBRDate(c) : null);
export const METRICS: { key: string; label: string; re: RegExp; get: (d: Day) => number }[] = [
  { key: "saldo_ini", label: "Saldo inicial", re: /SALDO INICIAL/, get: (d) => d.saldoInicial },
  { key: "receb", label: "Recebimentos usados", re: /RECEB/, get: (d) => d.recUsado },
  { key: "saidas", label: "Saídas total", re: /SAIDAS|TOTAL SAIDA/, get: (d) => d.saidas },
  { key: "custo", label: "Custo de produto", re: /CUSTO/, get: (d) => d.planejada + d.comprometida },
  { key: "despesas", label: "Despesas", re: /DESPESA/, get: (d) => d.despesa },
  { key: "saldo_fim", label: "Saldo final", re: /SALDO FINAL/, get: (d) => d.saldoFinal },
];
export interface ReconRow { date: string; metric: string; excel: number | null; engine: number; diff: number | null }
export function reconcile(rows: Cell[][], days: Day[]) {
  let dateRow = -1, best = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const n = (rows[i] ?? []).filter((c) => asDate(c)).length;
    if (n > best) { best = n; dateRow = i; }
  }
  if (dateRow < 0 || best < 2) return { ok: false as const, message: "Linha de datas não encontrada na aba FLUXO DE CAIXA.", rows: [], labels: [] };
  const cols = new Map<string, number>();
  (rows[dateRow] ?? []).forEach((c, i) => { const d = asDate(c); if (d && !cols.has(d)) cols.set(d, i); });
  const labelOf = (r: Cell[]) => normName(String(r.slice(0, 4).find((c) => typeof c === "string" && c.trim()) ?? ""));
  const found: { metric: (typeof METRICS)[number]; row: number; label: string }[] = [];
  for (const m of METRICS) {
    const idx = rows.findIndex((r, i) => i > dateRow && m.re.test(labelOf(r ?? [])));
    if (idx >= 0) found.push({ metric: m, row: idx, label: labelOf(rows[idx]!) });
  }
  const out: ReconRow[] = [];
  for (const d of days) {
    const col = cols.get(d.date);
    if (col === undefined) continue;
    for (const f of found) {
      const raw = rows[f.row]?.[col];
      const excel = typeof raw === "number" ? roundCents(raw * 100) : null; // vazio ≠ zero
      const engine = f.metric.get(d);
      out.push({ date: d.date, metric: f.metric.label, excel, engine, diff: excel === null ? null : engine - excel });
    }
  }
  return { ok: true as const, message: `${cols.size} datas e ${found.length} linhas reconhecidas.`, rows: out, labels: found.map((f) => `${f.metric.label} ← linha ${f.row + 1} "${f.label}"`) };
}
