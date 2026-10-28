import * as XLSX from "xlsx";
import { excelSerialToISO, FIELDS, HINTS, type Cell, type Entity } from "./importer";
import { parseBRDate } from "./dates";
import { roundCents } from "./money";
import type { Day } from "./engine/types";

// Leitura nativa .xlsx/.xlsm: lê apenas valores (cacheados). VBA NUNCA é executado nem carregado (bookVBA:false).
export type SheetKind = Entity | "fluxo" | "categorias" | "desconhecida";
const KNOWN: [string, SheetKind, string][] = [
  ["FLUXO DE CAIXA", "fluxo", "Matriz distribuída — NÃO importada; usada só para conciliação com valores cacheados"],
  ["RECEBIMENTOS", "receipts", "Recebimentos A:F (calendário G+ ignorado)"],
  ["PREVISAO DE VENDAS", "targets", "Meses horizontais — adaptador transpõe metas"],
  ["TABELA_FORNECEDORES", "suppliers", "Fornecedores e prazos"],
  ["TABELA_DESPESAS", "categorias", "Categorias: só A (tipo) e B (grupo); matriz D+ ignorada"],
  ["COMPRAS DIRETAS_PLANEJADAS", "planned", "Previsões (E = valor orçado; P/Q/R calculados ignorados)"],
  ["COMPRAS DIRETAS_EFETUADAS", "committed", "Efetivadas (M = base abatimento manual)"],
  ["DESPESAS E OUTRAS", "expenses", "Despesas"],
];
export const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export function recognize(name: string): { kind: SheetKind; note: string } {
  const n = normName(name);
  const k = KNOWN.find(([x]) => n === x) ?? KNOWN.find(([x]) => n.startsWith(x));
  return k ? { kind: k[1], note: k[2] } : { kind: "desconhecida", note: "Aba não reconhecida — ignorada" };
}

// Layout verificado do arquivo CEO: cabeçalho na LINHA 3 (índice 2), colunas fixas por letra.
// Só é aplicado se a linha 3 confirmar os padrões; senão cai na detecção por padrões de campo (editável na tela).
const col = (l: string) => l.charCodeAt(0) - 65;
const terms = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`t${i + 1}`, col("F") + i]));
export const CEO_LAYOUT: Partial<Record<Entity, { header: number; check: [number, RegExp][]; map: Record<string, number> }>> = {
  planned: { header: 2, check: [[0, /COD/], [1, /FORNEC/]], map: { purchaseCode: 0, supplier: 1, baseDate: 2, value: col("E"), document: -1, ...terms } },
  committed: { header: 2, check: [[0, /COD/], [1, /FORNEC/]], map: { purchaseCode: 0, supplier: 1, document: 2, baseDate: 3, value: col("F"), dueDate: col("G"), extensionDate: -1, legacyAbatement: col("M") } },
  expenses: { header: 2, check: [[0, /TIPO|DESPESA/], [2, /DATA/]], map: { category: 0, document: 1, baseDate: 2, value: col("F"), termDays: col("G"), group: col("L"), supplier: -1 } },
  suppliers: { header: 2, check: [[0, /FORNEC|NOME/]], map: {} },
  receipts: { header: 2, check: [[0, /DATA/]], map: {} },
};
const txt = (c: Cell) => normName(String(c ?? ""));
function scoreHeader(row: Cell[], kind: Entity): number {
  const f = FIELDS[kind];
  return f.filter((x) => { const re = HINTS[x.key]; return re && row.some((c) => typeof c === "string" && c.length <= 40 && re.test(c.trim())); }).length;
}
/** Linha de cabeçalho: layout CEO confirmado (linha 3) ou, por padrões de campos da aba, a linha com mais campos reconhecidos. */
export function detectHeader(rows: Cell[][], kind: SheetKind): number {
  if (kind === "fluxo" || kind === "categorias" || kind === "targets" || kind === "desconhecida") return 0;
  const L = CEO_LAYOUT[kind];
  if (L && L.check.every(([c, re]) => re.test(txt(rows[L.header]?.[c] ?? null)))) return L.header;
  let best = 0, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) { const s = scoreHeader(rows[i] ?? [], kind); if (s > bestScore) { best = i; bestScore = s; } }
  return best;
}
/** Mapeamento sugerido: colunas fixas do layout CEO quando a linha de cabeçalho é a verificada; senão por nome de cabeçalho. */
export function layoutMapping(kind: Entity, rows: Cell[][], headerRow: number, fallback: (h: Cell[]) => Record<string, number>): { map: Record<string, number>; fixed: boolean } {
  const L = CEO_LAYOUT[kind];
  const h = rows[headerRow] ?? [];
  if (L && headerRow === L.header && Object.keys(L.map).length && L.check.every(([c, re]) => re.test(txt(h[c] ?? null)))) {
    const base = fallback(h);
    return { map: { ...base, ...L.map }, fixed: true };
  }
  const m = fallback(kind === "receipts" ? h.slice(0, 6) : h);
  return { map: m, fixed: false };
}

export interface SheetInfo { name: string; kind: SheetKind; note: string; rows: Cell[][]; headerRow: number }
export function readWorkbook(buf: ArrayBuffer): SheetInfo[] {
  const wb = XLSX.read(buf, { type: "array", cellFormula: false, cellDates: false, bookVBA: false, cellHTML: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]!;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const r = recognize(name);
    return { name, ...r, rows, headerRow: detectHeader(rows, r.kind) };
  });
}

// ---------- Adaptadores específicos ----------
const asDate = (c: Cell): string | null => (typeof c === "number" && c > 30000 && c < 80000 ? excelSerialToISO(c) : typeof c === "string" ? parseBRDate(c) : null);
const asMonth = (c: Cell): string | null => {
  if (typeof c === "number") { const d = asDate(c); return d ? d.slice(0, 7) : null; }
  const m = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(String(c ?? "")); return m ? `${m[2]}-${m[1]!.padStart(2, "0")}` : (asDate(c)?.slice(0, 7) ?? null);
};
const cents = (c: Cell) => (typeof c === "number" ? roundCents(c * 100) : null);

export interface TargetRow { month: string; column: number; faturamento: number | null; liquido: number | null; reducaoImplicita: number | null; components: { label: string; value: number | null }[]; errors: string[] }
/** PREVISÃO DE VENDAS: meses nas COLUNAS. Linha1 mm/aaaa, linha2 líquido, linha3 faturamento (cache), linha6 datas, linhas 7+ componentes. */
export function adaptTargets(rows: Cell[][]): { ok: boolean; message: string; rows: TargetRow[] } {
  const r1 = rows[0] ?? [], r6 = rows[5] ?? [];
  const width = Math.max(r1.length, r6.length);
  const out: TargetRow[] = [];
  let firstCol = -1;
  for (let c = 0; c < width; c++) {
    const month = asMonth(r1[c] ?? null) ?? asDate(r6[c] ?? null)?.slice(0, 7) ?? null;
    if (!month) continue;
    if (firstCol < 0) firstCol = c;
    const fat = cents(rows[2]?.[c] ?? null), liq = cents(rows[1]?.[c] ?? null);
    const errors: string[] = [];
    if (fat === null) errors.push("Faturamento (linha 3) vazio — meta ausente, não assumida como zero");
    if (out.some((o) => o.month === month)) errors.push("Mês repetido em outra coluna");
    const r6m = asDate(r6[c] ?? null)?.slice(0, 7);
    if (r6m && r6m !== month) errors.push(`Linha 6 (${r6m}) diverge da linha 1 (${month})`);
    out.push({ month, column: c, faturamento: fat, liquido: liq, reducaoImplicita: fat && liq !== null ? 1 - liq / fat : null, components: [], errors });
  }
  if (!out.length) return { ok: false, message: "Nenhum mês reconhecido na linha 1/linha 6.", rows: [] };
  for (let r = 6; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const label = String(row.slice(0, firstCol).find((c) => typeof c === "string" && c.trim()) ?? "").trim();
    if (!label) continue;
    for (const o of out) o.components.push({ label, value: cents(row[o.column] ?? null) });
  }
  return { ok: true, message: `${out.length} mês(es) reconhecidos (transpostos de colunas).`, rows: out };
}

export interface CategoryRow { line: number; name: string; group: string; errors: string[] }
/** TABELA_DESPESAS: A1 título, A2 "AGRUPAMENTO DE DESPESAS", a partir da linha 3: A tipo, B grupo. Colunas D+ (matriz diária) ignoradas. */
export function adaptCategories(rows: Cell[][]): CategoryRow[] {
  let start = 2;
  if (/TIPO|DESCRI|FORNEC/.test(txt(rows[2]?.[0] ?? null)) && /GRUPO/.test(txt(rows[2]?.[1] ?? null))) start = 3; // linha 3 é cabeçalho
  const out: CategoryRow[] = [];
  const seen = new Map<string, string>();
  for (let r = start; r < rows.length; r++) {
    const a = rows[r]?.[0], b = rows[r]?.[1];
    const name = a == null ? "" : String(a).trim(), group = b == null ? "" : String(b).trim();
    if (!name && !group) continue;
    const errors: string[] = [];
    if (!name) errors.push("Tipo (A) vazio");
    if (!group) errors.push("Grupo (B) vazio");
    const k = normName(name);
    if (seen.has(k) && seen.get(k) !== normName(group)) errors.push("Mesmo tipo com grupos diferentes — conflito");
    seen.set(k, normName(group));
    out.push({ line: r + 1, name, group, errors });
  }
  return out;
}

/** Resolução de fornecedor/categoria por NOME normalizado; duplicidade = conflito explícito (nunca escolhe um arbitrário). */
export function resolveByName<T extends { id: string; name: string }>(list: T[], name: string): { id: string } | { conflict: T[] } | { missing: true } {
  const n = normName(name);
  const hits = list.filter((x) => normName(x.name) === n);
  return hits.length === 1 ? { id: hits[0]!.id } : hits.length > 1 ? { conflict: hits } : { missing: true };
}

// ---------- Conciliação com a aba FLUXO DE CAIXA (valores cacheados) ----------
// Layout CEO: linha1 = datas de REFERÊNCIA (defasadas); linha3 = A NATUREZA | B GRUPO | C DESCRIÇÃO | D+ datas REAIS.
// Rótulos lidos de A, B e C em conjunto. Linha esperada preferida; verificada pelo rótulo.
export interface MetricDef { key: string; label: string; row: number; re: RegExp; essential: boolean; get: (d: Day) => number }
export const METRICS: MetricDef[] = [
  { key: "saldo_ini", label: "Saldo inicial", row: 5, re: /SALDO INICIAL/, essential: true, get: (d) => d.saldoInicial },
  { key: "informado", label: "Recebimento previsto/real (informado)", row: 6, re: /RECEB.*(PREVIST|REAL|INFORM)/, essential: true, get: (d) => (d.usouInformado ? d.recInformado : 0) },
  { key: "estimado", label: "Recebimento estimado (usado)", row: 7, re: /RECEB.*ESTIMAD/, essential: true, get: (d) => (d.usouInformado ? 0 : d.recEstimado) },
  { key: "saidas", label: "Saídas total", row: 8, re: /^SAIDAS? TOTAL|^SAIDAS? .*TOTAL/, essential: true, get: (d) => d.saidas },
  { key: "custo", label: "Custo de produto", row: 9, re: /CUSTO/, essential: false, get: (d) => d.planejada + d.comprometida },
  { key: "planejadas", label: "Compras planejadas", row: 10, re: /PLANEJAD/, essential: false, get: (d) => d.planejada },
  { key: "comprometidas", label: "Compras comprometidas", row: 11, re: /COMPROMETID|EFETUAD|REALIZAD/, essential: false, get: (d) => d.comprometida },
  { key: "despesas", label: "Despesas total", row: 12, re: /DESPESA/, essential: false, get: (d) => d.despesa },
  { key: "saldo_fim", label: "Saldo final", row: 32, re: /SALDO FINAL/, essential: true, get: (d) => d.saldoFinal },
];
export const labelABC = (r: Cell[] | undefined) => [0, 1, 2].map((i) => txt(r?.[i] ?? null)).filter(Boolean).join(" ");
export interface ReconRow { date: string; metric: string; excel: number | null; excelRaw: number | null; engine: number; diff: number | null }
export interface ReconResult { ok: boolean; blocked: string[]; message: string; rows: ReconRow[]; labels: string[]; dateRow: number; refRow: number | null; refOffsetDays: number | null; arithmetic: { date: string; residual: number }[] }

export function findCalendarRow(rows: Cell[][]): number {
  const isHdr = (i: number) => /NATUREZA/.test(txt(rows[i]?.[0] ?? null)) && /GRUPO/.test(txt(rows[i]?.[1] ?? null)) && /DESCRI/.test(txt(rows[i]?.[2] ?? null));
  if (isHdr(2)) return 2;
  for (let i = 0; i < Math.min(rows.length, 10); i++) if (isHdr(i)) return i;
  return -1;
}

export function reconcile(rows: Cell[][], days: Day[]): ReconResult {
  const blocked: string[] = [];
  const empty = (msg: string): ReconResult => ({ ok: false, blocked: [msg], message: msg, rows: [], labels: [], dateRow: -1, refRow: null, refOffsetDays: null, arithmetic: [] });
  const dateRow = findCalendarRow(rows);
  if (dateRow < 0) return empty("Cabeçalho NATUREZA | GRUPO | DESCRIÇÃO (linha 3) não encontrado — conciliação bloqueada (não se adivinha a linha de datas).");
  const cols = new Map<string, number>();
  (rows[dateRow] ?? []).forEach((c, i) => { if (i < 3) return; const d = asDate(c); if (d && !cols.has(d)) cols.set(d, i); });
  if (cols.size < 1) return empty("Linha 3 sem datas a partir da coluna D — conciliação bloqueada.");
  // Linha 1 = datas de referência (defasadas): só informativo, nunca usada como calendário.
  let refOffsetDays: number | null = null;
  const firstCol = Math.min(...cols.values());
  const ref = asDate(rows[0]?.[firstCol] ?? null), real = asDate(rows[dateRow]?.[firstCol] ?? null);
  if (ref && real && dateRow !== 0) refOffsetDays = Math.round((Date.parse(real) - Date.parse(ref)) / 86400000);

  const found: { m: MetricDef; row: number; label: string }[] = [];
  for (const m of METRICS) {
    const pref = m.row - 1;
    let idx = m.re.test(labelABC(rows[pref])) ? pref : -1;
    if (idx < 0) {
      const hits = rows.map((r, i) => (i > dateRow && m.re.test(labelABC(r)) ? i : -1)).filter((i) => i >= 0);
      if (hits.length === 1) idx = hits[0]!;
      else if (hits.length > 1) blocked.push(`${m.label}: linha esperada ${m.row} não confere e há ${hits.length} candidatas (${hits.map((h) => h + 1).join(", ")}) — ambíguo`);
    }
    if (idx >= 0) found.push({ m, row: idx, label: labelABC(rows[idx]) });
    else if (m.essential && !blocked.some((b) => b.startsWith(m.label))) blocked.push(`${m.label}: linha não encontrada (esperada ${m.row})`);
    else if (!m.essential) blocked.push(`(não essencial) ${m.label}: não encontrada`);
  }
  const essentialMissing = METRICS.filter((m) => m.essential && !found.some((f) => f.m.key === m.key));
  const out: ReconRow[] = [];
  const arithmetic: { date: string; residual: number }[] = [];
  const raw = (key: string, c: number) => { const f = found.find((x) => x.m.key === key); const v = f ? rows[f.row]?.[c] : null; return typeof v === "number" ? v : null; };
  let matched = 0;
  for (const d of days) {
    const c = cols.get(d.date);
    if (c === undefined) continue;
    matched++;
    for (const f of found) {
      const v = raw(f.m.key, c);
      const excel = v === null ? null : roundCents(v * 100); // vazio ≠ zero
      const engine = f.m.get(d);
      out.push({ date: d.date, metric: f.m.label, excel, excelRaw: v, engine, diff: excel === null ? null : engine - excel });
    }
    // Recebimento usado = linha 6 + linha 7 (não só a primeira).
    const i6 = raw("informado", c), i7 = raw("estimado", c);
    if (i6 !== null || i7 !== null) {
      const v = (i6 ?? 0) + (i7 ?? 0);
      out.push({ date: d.date, metric: "Recebimento usado (6+7)", excel: roundCents(v * 100), excelRaw: v, engine: d.recUsado, diff: d.recUsado - roundCents(v * 100) });
    }
    const si = raw("saldo_ini", c), sa = raw("saidas", c), sf = raw("saldo_fim", c);
    if (si !== null && sa !== null && sf !== null) arithmetic.push({ date: d.date, residual: si - sa + (i6 ?? 0) + (i7 ?? 0) - sf });
  }
  if (!matched) blocked.push("Nenhuma data do período ativo existe na linha 3 do Excel");
  const ok = essentialMissing.length === 0 && matched > 0 && !blocked.some((b) => !b.startsWith("(não essencial)"));
  return {
    ok, blocked, dateRow, refRow: refOffsetDays !== null ? 0 : null, refOffsetDays, rows: out, arithmetic,
    message: ok ? `Calendário da linha ${dateRow + 1} (${cols.size} datas reais); ${found.length} linhas reconhecidas; ${matched} dia(s) do período comparados. Cache não é presumido atual.`
      : `CONCILIAÇÃO BLOQUEADA: ${blocked.filter((b) => !b.startsWith("(não essencial)")).join("; ")}`,
    labels: found.map((f) => `${f.m.label} ← linha ${f.row + 1} "${f.label}"`),
  };
}
