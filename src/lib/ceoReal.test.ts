import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import * as XLSX from "xlsx";
import { classify, mapRows, suggestMapping, type Cell, type Entity } from "./importer";
import { layoutMapping, readWorkbook, reconcile } from "./xlsxImport";
import { applyImportRows } from "./importApply";
import { emptyData, normalizeData, setMonthTarget } from "./engine/actions";
import { computeFlow } from "./engine/engine";
import { computeDashboard } from "./engine/dashboard";
import { adaptTargets } from "./xlsxImport";

let n = 0; const uid = () => `t${++n}`;
const at = "2026-11-05T00:00:00.000Z";

describe("Ajustes derivados do XLSM real", () => {
  it("linhas repetidas legítimas viram ocorrências #2 (o Excel soma todas), estáveis na reimportação", () => {
    const rows: Cell[][] = [["X", "D1", 46296, 100, 0], ["X", "D1", 46296, 100, 0], ["X", "D1", 46296, 100, 0]];
    const map = { category: 0, document: 1, baseDate: 2, value: 3, termDays: 4, supplier: -1, group: -1 };
    const p = classify(mapRows("expenses", rows, map, 4), []);
    expect(p.map((r) => r.status)).toEqual(["novo", "novo", "novo"]);
    expect(p[2]!.key.endsWith("#3")).toBe(true);
    const log = p.map((r) => ({ key: r.key, hash: r.hash }));
    expect(classify(mapRows("expenses", rows, map, 4), log).map((r) => r.status)).toEqual(["idêntico", "idêntico", "idêntico"]);
  });
  it("recebimentos formato longo: plataforma pelo NOME do arquivo, sem nome inventado; vigência = primeira data", () => {
    const x = emptyData();
    const map = { code: 0, platform: 1, date: 2, amount: 5, general: -1 };
    const rows: Cell[][] = [["REAL", "MELI SP ", 46297, 1, 1, 500], ["Previsão", "meli sp", 46296, 1, 1, 200], ["REAL", "LOJAS", 46296, 1, 1, 0]];
    const r = applyImportRows(x, "receipts", classify(mapRows("receipts", rows, map, 4), []), { file: "f", sheet: "RECEBIMENTOS", at, uid });
    expect(r.createdPlatforms).toEqual(["MELI SP", "LOJAS"]);
    expect(x.platforms[0]!.start).toBe("2026-10-01");
    const f = computeFlow(x, { start: "2026-10-01", end: "2026-10-02" });
    expect(f.days[0]!.recInformado).toBe(20000);
    expect(f.days[1]!.recInformado).toBe(50000);
  });
  it("títulos históricos importados = 'situação a confirmar': fora do aberto validado e do ranking; nunca pagos por data passada", () => {
    const x = emptyData();
    const map = { purchaseCode: 0, supplier: 1, document: 2, baseDate: 3, value: 5, dueDate: 6, extensionDate: -1, legacyAbatement: 12 };
    applyImportRows(x, "committed", classify(mapRows("committed", [["", "FORN A", "1B1", 46000, null, 100, 46000]], map, 4), []), { file: "f", sheet: "E", at, uid });
    expect(x.committed[0]!.paymentUnconfirmed).toBe(true);
    const flow = computeFlow(x, { start: "2026-10-01", end: "2026-10-31" });
    const dash = computeDashboard(x, flow, "2026-11-05", { start: "2026-10-01", end: "2026-10-31" });
    expect(dash.cards.find((c) => c.key === "overdue")!.value).toBe(0);
    expect(dash.ranking).toEqual([]);
    const u = dash.cards.find((c) => c.key === "unconfirmed")!;
    expect(u.value).toBe(10000);
    expect(u.titles![0]!.state).toBe("Situação a confirmar");
  });
  it("leitor seletivo não lê colunas além das colunas-fonte (matriz distribuída ignorada)", () => {
    const wb = XLSX.utils.book_new();
    const row = (a: Cell[]) => [...a, ...Array(30).fill(999)];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["t"], [null], ["LINHA DE DESPESA", "GRUPO"], row(["ALUGUEL", "ADM"])]), "TABELA_DESPESAS");
    const s = readWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer)[0]!;
    expect(s.rows[3]!.length).toBeLessThanOrEqual(3);
  });
});

// Teste com o arquivo REAL — roda só onde o XLSM está disponível localmente (nunca embutido no projeto).
const REAL = process.env.CEO_XLSM ?? "/mnt/user-uploads/Fluxo_CEO_Sandrini.xlsm";
describe.skipIf(!existsSync(REAL))("XLSM real do CEO (arquivo local)", () => {
  it("importa em memória e concilia outubro/2026 com o cache: 01/10 e 02/10 exatos; diferenças só de arredondamento da estimativa", () => {
    const b = readFileSync(REAL);
    const sheets = readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const x = emptyData(); x.params.profile = "legado";
    const tg = adaptTargets(sheets.find((s) => s.kind === "targets")!.rows);
    for (const t of tg.rows) if (!t.errors.length && t.faturamento !== null) setMonthTarget(x, t.month, { gross: t.faturamento, legacyReducer: tg.reducerB2!, divisorLegado: "30", lagDays: tg.lagC2! }, "teste", at);
    for (const e of ["suppliers", "planned", "committed", "expenses", "receipts"] as Entity[]) {
      const s = sheets.find((k) => k.kind === e)!;
      const lm = layoutMapping(e, s.rows, s.headerRow, (h) => suggestMapping(e, h));
      expect(lm.fixed).toBe(true);
      const rows = mapRows(e, s.rows.slice(s.headerRow + 1), lm.map, s.headerRow + 2).filter((r) => Object.values(r.values).some((v) => v !== null && v !== ""));
      applyImportRows(x, e, classify(rows, x.importLog), { file: "real", sheet: s.name, at, uid });
    }
    const fl = sheets.find((s) => s.kind === "fluxo")!.rows;
    const c = (fl[2] ?? []).findIndex((v, i) => i >= 3 && v === 46296);
    x.params.startDate = "2026-10-01"; x.params.saldoInicial = Math.round((fl[4]![c] as number) * 100);
    const rc = reconcile(fl, computeFlow(normalizeData(x), { start: "2026-10-01", end: "2026-10-31" }).days);
    expect(rc.ok).toBe(true);
    expect(rc.refOffsetDays).toBe(10);
    for (const d of ["2026-10-01", "2026-10-02"]) for (const r of rc.rows.filter((k) => k.date === d)) expect(r.diff).toBe(0);
    for (const r of rc.rows) if (/Saldo/.test(r.metric)) expect(Math.abs(r.diff ?? 0)).toBeLessThanOrEqual(10); else expect(r.diff ?? 0).toBe(0);
  }, 120000);
});
