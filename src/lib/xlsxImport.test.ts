import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { classify, convertCell, excelSerialToISO, mapRows, suggestMapping } from "./importer";
import { readWorkbook, reconcile } from "./xlsxImport";
import { computeFlow } from "./engine/engine";
import { normalizeData } from "./engine/actions";

// Planilha sintética de TESTE (não é o arquivo real do cliente).
function book() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Fornecedor", "Código", "Documento", "Valor", "Data"],
    ["00123", "PC1", 456, 1000.5, 46300],
    ["Beta", "PC2", "OC2", null, "05/10/2026"],
  ]), "COMPRAS DIRETAS_PLANEJADAS");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["", 46296, 46297],
    ["SALDO INICIAL", 1000, 900],
    ["SALDO FINAL", 900, 850],
  ]), "Fluxo de Caixa");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "Outra");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("Importação XLSX nativa", () => {
  const sheets = readWorkbook(book());
  it("reconhece abas por nome (acentos/caixa) e ignora desconhecidas", () => {
    expect(sheets.map((s) => s.kind)).toEqual(["planned", "fluxo", "desconhecida"]);
  });
  it("datas seriais, vazio ≠ zero, fornecedor/documento como texto, origem por linha", () => {
    const s = sheets[0]!;
    const map = suggestMapping("planned", s.rows[s.headerRow]!);
    expect(map).toMatchObject({ supplier: 0, purchaseCode: 1, document: 2, value: 3, baseDate: 4 });
    const rows = mapRows("planned", s.rows.slice(s.headerRow + 1), map, s.headerRow + 2);
    expect(rows[0]!.values).toMatchObject({ supplier: "00123", document: "456", value: 100050, baseDate: excelSerialToISO(46300) });
    expect(rows[0]!.line).toBe(2);
    expect(rows[1]!.values["value"]).toBeNull();
    expect(rows[1]!.errors).toContain("Valor previsto vazio".replace(" previsto", " orçado"));
    expect(convertCell(0, "money?").v).toBe(0);
    expect(convertCell(null, "money?").v).toBeNull();
    expect(excelSerialToISO(45658)).toBe("2025-01-01");
  });
  it("reimportação idempotente e conflito explícito", () => {
    const s = sheets[0]!;
    const map = suggestMapping("planned", s.rows[s.headerRow]!);
    const rows = mapRows("planned", s.rows.slice(1), map);
    expect(classify(rows, []).map((r) => r.status)).toEqual(["novo", "inválido"]);
    const log = [{ key: rows[0]!.key, hash: rows[0]!.hash }];
    expect(classify(rows, log)[0]!.status).toBe("idêntico");
    const changed = mapRows("planned", [["00123", "PC1", 456, 2000, 46300]], map);
    expect(classify(changed, log)[0]!.status).toBe("conflito");
  });
  it("conciliação diária com valores cacheados da aba FLUXO DE CAIXA", () => {
    const d = normalizeData({ params: { startDate: excelSerialToISO(46296), saldoInicial: 100000 }, targets: {} });
    const days = computeFlow(d, { start: excelSerialToISO(46296)!, end: excelSerialToISO(46297)! }).days;
    const r = reconcile(sheets[1]!.rows, days);
    expect(r.ok).toBe(true);
    const si = r.rows.filter((x) => x.metric === "Saldo inicial");
    expect(si[0]!.diff).toBe(0);
    expect(si[1]!.diff).toBe(100000 - 90000);
  });
});
