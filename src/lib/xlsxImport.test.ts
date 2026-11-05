import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { classify, convertCell, excelSerialToISO, mapRows, suggestMapping, type Cell } from "./importer";
import { adaptCategories, adaptTargets, layoutMapping, readWorkbook, reconcile, resolveByName } from "./xlsxImport";
import { computeFlow } from "./engine/engine";
import { normalizeData } from "./engine/actions";

// Fixtures FIÉIS à estrutura do XLSM do CEO (posições de linhas/colunas verificadas localmente pelo usuário).
// Valores do fluxo = pontos de referência CACHEADOS informados (não recalculados). Não é importação do arquivo real.
const COL_OCT1 = 641; // coluna XR
const SERIAL_OCT1 = 46296; // 01/10/2026
const LAST = COL_OCT1 + 40;
function ceoFluxo(opts: { dropSaldoFinal?: boolean } = {}): Cell[][] {
  const rows: Cell[][] = Array.from({ length: 32 }, () => []);
  const lab = (r: number, a: string, b: string, c = "") => { rows[r - 1]![0] = a; rows[r - 1]![1] = b; rows[r - 1]![2] = c; };
  rows[0]![0] = "DATA REFERÊNCIA";
  lab(3, "NATUREZA", "GRUPO", "DESCRIÇÃO");
  for (let c = 3; c <= LAST; c++) { const s = SERIAL_OCT1 + (c - COL_OCT1); rows[0]![c] = s - 10; rows[2]![c] = s; } // linha1 referência (−10), linha3 calendário real — mesma contagem
  lab(4, "ENTRADA", "TOTAL"); lab(5, "ENTRADA", "SALDO INICIAL"); lab(6, "ENTRADA", "RECEBIMENTO PREVISTO/REAL"); lab(7, "ENTRADA", "RECEBIMENTO ESTIMADO");
  lab(8, "SAÍDA", "TOTAL"); lab(9, "SAÍDA", "CUSTO DE PRODUTO"); lab(10, "SAÍDA", "CUSTO DE PRODUTO", "COMPRAS PLANEJADAS"); lab(11, "SAÍDA", "CUSTO DE PRODUTO", "COMPRAS COMPROMETIDAS");
  lab(12, "SAÍDA", "DESPESAS DIVERSAS", "TOTAL"); lab(13, "SAÍDA", "DESPESAS DIVERSAS", "ALUGUEL");
  if (!opts.dropSaldoFinal) lab(32, "RESULTADO", "SALDO FINAL");
  const put = (col: number, v: Record<number, number>) => { for (const [r, x] of Object.entries(v)) rows[Number(r) - 1]![col] = x; };
  put(COL_OCT1, { 5: 2183396.28, 6: 442225.87, 7: 0, 8: 123590.94, 9: 111833.29, 10: 0, 11: 111833.29, 12: 11757.65, 32: 2502031.21 });
  put(COL_OCT1 + 1, { 5: 2502031.21, 6: 417209.5, 7: 0, 8: 282119.93, 10: 0, 11: 116897.02, 12: 165222.91, 32: 2637120.78 });
  put(COL_OCT1 + 27, { 5: 1988081.42906, 6: 0, 7: 300228.04443, 8: 64009.76, 10: 0, 11: 32621.64, 12: 31388.12, 32: 2224299.71349 });
  return rows;
}
const days = computeFlow(normalizeData({ params: { startDate: "2026-10-01", saldoInicial: 0 }, targets: {} }), { start: "2026-10-01", end: "2026-10-28" }).days;

describe("Conciliação — matriz CEO fiel", () => {
  const r = reconcile(ceoFluxo(), days);
  const get = (date: string, metric: string) => r.rows.find((x) => x.date === date && x.metric === metric);
  it("usa a linha 3 (calendário real), não a linha 1 (referência defasada), mesmo com contagem igual", () => {
    expect(r.ok).toBe(true);
    expect(r.dateRow).toBe(2);
    expect(r.refOffsetDays).toBe(10);
    expect(get("2026-10-01", "Saldo inicial")!.excel).toBe(218339628);
  });
  it("lê rótulos A/B/C em conjunto nas linhas esperadas", () => {
    expect(r.labels).toContain('Saldo inicial ← linha 5 "ENTRADA SALDO INICIAL"');
    expect(r.labels).toContain('Saídas total ← linha 8 "SAIDA TOTAL"');
    expect(r.labels).toContain('Saldo final ← linha 32 "RESULTADO SALDO FINAL"');
    expect(r.labels).toContain('Despesas total ← linha 12 "SAIDA DESPESAS DIVERSAS TOTAL"');
    expect(get("2026-10-02", "Compras comprometidas")!.excel).toBe(11689702);
    expect(get("2026-10-02", "Despesas total")!.excel).toBe(16522291);
  });
  it("recebimento usado = linha 6 + linha 7 (28/10: informado 0 → estimado)", () => {
    expect(get("2026-10-01", "Recebimento usado (6+7)")!.excel).toBe(44222587);
    expect(get("2026-10-28", "Recebimento usado (6+7)")!.excel).toBe(30022804);
    expect(get("2026-10-28", "Recebimento usado (6+7)")!.excelRaw).toBeCloseTo(300228.04443, 5);
  });
  it("aritmética do cache fecha nos 3 pontos de referência (resíduo só de arredondamento < 1 centavo)", () => {
    expect(r.arithmetic.map((a) => a.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-28"]);
    for (const a of r.arithmetic) expect(Math.abs(a.residual)).toBeLessThan(0.005);
    expect(get("2026-10-28", "Saldo final")!.excel).toBe(222429971); // 2224299.71349 → centavos
  });
  it("bloqueia resultado saudável se métrica essencial ausente", () => {
    const b = reconcile(ceoFluxo({ dropSaldoFinal: true }), days);
    expect(b.ok).toBe(false);
    expect(b.message).toMatch(/BLOQUEADA.*Saldo final/);
  });
  it("bloqueia se não há cabeçalho NATUREZA/GRUPO/DESCRIÇÃO (não adivinha linha de datas)", () => {
    const rows = ceoFluxo(); rows[2]![0] = null;
    rows[2]![1] = null; rows[2]![2] = null;
    expect(reconcile(rows, days).ok).toBe(false);
    expect(reconcile([["SALDO INICIAL", 1]], days).ok).toBe(false);
  });
});

// ---------- Cabeçalhos reais (linha 3) ----------
function book() {
  const wb = XLSX.utils.book_new();
  const add = (rows: Cell[][], name: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  const prazos = Array.from({ length: 10 }, (_, i) => `PRAZO ${i + 1}`);
  add([["COMPRAS DIRETAS PLANEJADAS — AVISO: não alterar fórmulas", "Compras", "Colunas", "F:O"], [], ["CÓDIGO", "FORNECEDOR", "DATA FATURAMENTO", "ALTERAR", "VALOR", ...prazos, "P", "Q", "R"],
    ["PC1", "00123", 46300, null, 10000, 30, 60, 0, null, null, null, null, null, null, null, 3333.33, 0, 3333.33]], "COMPRAS DIRETAS_PLANEJADAS");
  add([["COMPRAS EFETUADAS", "Compras", "Colunas"], [], ["CÓDIGO", "FORNECEDOR", "TÍTULO", "DATA FATURAMENTO", "ALTERAR", "VALOR", "VENCIMENTO", "H", "I", "J", "K", "L", "BASE ABATIMENTO"],
    ["PC1", "00123", "33181A1", 46300, null, 6000, 46345, null, null, null, null, null, 6000]], "COMPRAS DIRETAS_EFETUADAS");
  add([["DESPESAS", "x", "y"], [], ["TIPO", "DESCRIÇÃO", "DATA", "D", "E", "VALOR", "PRAZO", "H", "I", "J", "K", "GRUPO"],
    ["ALUGUEL", "Aluguel loja 1", 46296, null, null, 5000, 0, null, null, null, null, "ADMINISTRATIVO"]], "DESPESAS E OUTRAS");
  add([[null, "10/2026", "11/2026"], ["LÍQUIDO", 167895, 153750], ["FATURAMENTO", 273000, null], [], [], [null, 46296, 46327], ["COMPONENTE A", 100, 200]], "PREVISÃO DE VENDAS");
  add([["TABELA DESPESAS"], ["AGRUPAMENTO DE DESPESAS"], ["ALUGUEL", "ADMINISTRATIVO", null, 1, 2], ["ENERGIA", "ADMINISTRATIVO"], ["ALUGUEL", "OUTRO"]], "TABELA_DESPESAS");
  add([["x"]], "Outra");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("Importação XLSX — layout CEO", () => {
  const sheets = readWorkbook(book());
  const S = (n: string) => sheets.find((s) => s.name === n)!;
  it("reconhece abas e tipos; desconhecida ignorada", () => {
    expect(sheets.map((s) => s.kind)).toEqual(["planned", "committed", "expenses", "targets", "categorias", "desconhecida"]);
  });
  it("planejadas: cabeçalho linha 3 (não o título da linha 1); E = valor orçado; F:O prazos com 0 ≠ vazio; R ignorado", () => {
    const s = S("COMPRAS DIRETAS_PLANEJADAS");
    expect(s.headerRow).toBe(2);
    const { map, fixed } = layoutMapping("planned", s.rows, s.headerRow, (h) => suggestMapping("planned", h));
    expect(fixed).toBe(true);
    expect(map).toMatchObject({ purchaseCode: 0, supplier: 1, baseDate: 2, value: 4, t1: 5, t3: 7, t10: 14 });
    const v = mapRows("planned", s.rows.slice(3), map, 4)[0]!.values;
    expect(v).toMatchObject({ purchaseCode: "PC1", supplier: "00123", value: 1000000, t1: 30, t2: 60, t3: 0, t4: null, baseDate: excelSerialToISO(46300) });
  });
  it("efetuadas: C = identificador do título como texto; M = base abatimento manual", () => {
    const s = S("COMPRAS DIRETAS_EFETUADAS");
    const { map } = layoutMapping("committed", s.rows, s.headerRow, (h) => suggestMapping("committed", h));
    const v = mapRows("committed", s.rows.slice(3), map, 4)[0]!.values;
    expect(v).toMatchObject({ document: "33181A1", value: 600000, dueDate: excelSerialToISO(46345), legacyAbatement: 600000, baseDate: excelSerialToISO(46300) });
  });
  it("despesas: A tipo, B descrição, C data, F valor, G prazo (0 válido), L grupo", () => {
    const s = S("DESPESAS E OUTRAS");
    const { map } = layoutMapping("expenses", s.rows, s.headerRow, (h) => suggestMapping("expenses", h));
    const p = mapRows("expenses", s.rows.slice(3), map, 4)[0]!;
    expect(p.errors).toEqual([]);
    expect(p.values).toMatchObject({ category: "ALUGUEL", document: "Aluguel loja 1", value: 500000, termDays: 0, group: "ADMINISTRATIVO" });
  });
  it("previsão de vendas (estrutura real): bruto = Σ linhas 7+ (inclui linha sem rótulo e além da 20); L2 = bruto·(1−B2); L3 parcial só informativa", () => {
    const R: Cell[][] = Array.from({ length: 22 }, () => []);
    R[0] = ["FLUXO DE CAIXA SANDRINI", "x", "DEFASAGEM EM DIAS", 999, "10/2026", "11/2026", "12/2026"];
    R[1] = ["PREVISÃO DE VENDAS (FATURAMENTO)", 0.25, 10, "TOTAL LÍQUIDO DE DESCONTOS", (10000000 - 1000000 + 405000 + 5000) * 0.75, 7500000, 1];
    R[2] = [null, null, null, "TOTAL", 9405000, null, null];
    R[5] = ["ORIGEM", "DESCONTOS", "PESO", "OBS", 46296, 46327, 46357];
    R[6] = ["BASE DE VENDAS", 0.3, 1, 0, 10000000, 10000000, null];
    R[7] = ["REDUTOR SANDRINI", 0.33, 0, 0, -1000000, null, null];
    R[8] = [null, null, 0, 0, 405000, null, null];
    R[21] = ["COMPONENTE L22", null, null, null, 5000, null, null];
    const a = adaptTargets(R);
    expect(a.reducerB2).toBe(0.25); expect(a.lagC2).toBe(10);
    expect(a.rows.map((r) => r.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(a.rows[0]).toMatchObject({ faturamento: 941000000, liquido: 705750000, totalLinha3: 940500000, errors: [] });
    expect(a.rows[1]).toMatchObject({ faturamento: 1000000000, errors: [] });
    expect(a.rows[2]!.faturamento).toBeNull();
    expect(a.rows[2]!.errors[0]).toMatch(/meta ausente/);
  });
  it("líquido cacheado incoerente com Σ·(1−B2) é sinalizado (cache desatualizado), não aceito em silêncio", () => {
    const R: Cell[][] = [["T", null, null, null, "10/2026"], ["P", 0.25, 10, "L", 100], [], [], [], [null, null, null, null, 46296], ["A", null, null, null, 1000]];
    expect(adaptTargets(R).rows[0]!.errors.join()).toMatch(/cache desatualizado/);
  });
  it("TABELA_DESPESAS: só A/B, ignora D+, conflito de grupo explícito", () => {
    const c = adaptCategories(S("TABELA_DESPESAS").rows);
    expect(c.map((x) => [x.name, x.group])).toEqual([["ALUGUEL", "ADMINISTRATIVO"], ["ENERGIA", "ADMINISTRATIVO"], ["ALUGUEL", "OUTRO"]]);
    expect(c[2]!.errors[0]).toMatch(/conflito/);
  });
  it("fornecedor resolvido por nome normalizado; duplicado = conflito", () => {
    const l = [{ id: "1", name: "Têxtil Ação" }, { id: "2", name: "Beta" }, { id: "3", name: "beta " }];
    expect(resolveByName(l, "TEXTIL ACAO")).toEqual({ id: "1" });
    expect("conflict" in resolveByName(l, "BETA")).toBe(true);
    expect(resolveByName(l, "Gama")).toEqual({ missing: true });
  });
});

describe("Importação — tipos e idempotência", () => {
  it("datas seriais, vazio ≠ zero", () => {
    expect(convertCell(0, "money?").v).toBe(0);
    expect(convertCell(null, "money?").v).toBeNull();
    expect(excelSerialToISO(45658)).toBe("2025-01-01");
  });
  it("reimportação idêntica ignorada; mesma chave com conteúdo diferente = conflito", () => {
    const h: Cell[] = ["Fornecedor", "Código", "Documento", "Valor", "Data"];
    const map = suggestMapping("planned", h);
    const rows = mapRows("planned", [["00123", "PC1", 456, 1000.5, 46300]], map);
    expect(classify(rows, [])[0]!.status).toBe("novo");
    const log = [{ key: rows[0]!.key, hash: rows[0]!.hash }];
    expect(classify(rows, log)[0]!.status).toBe("idêntico");
    expect(classify(mapRows("planned", [["00123", "PC1", 456, 2000, 46300]], map), log)[0]!.status).toBe("conflito");
  });
});

describe("Planejada com prazos próprios (F:O importados)", () => {
  it("usa os prazos da linha em vez dos do fornecedor", () => {
    const d = normalizeData({ params: { startDate: "2026-10-01", saldoInicial: 0, profile: "legado" }, targets: {},
      suppliers: [{ id: "s", name: "S", group: "", terms: [10, null, null, null, null, null, null, null, null, null] }],
      planned: [{ id: "p", supplierId: "s", purchaseCode: "X", document: "", value: 100000, baseDate: "2026-10-01", categoryId: "", notes: "", status: "ativo", remainingOverride: null, terms: [30, 60, null, null, null, null, null, null, null, null] }] });
    const f = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" }).days.filter((x) => x.planejada);
    expect(f.map((x) => [x.date, x.planejada])).toEqual([["2026-10-31", 50000], ["2026-11-30", 50000]]);
  });
});
