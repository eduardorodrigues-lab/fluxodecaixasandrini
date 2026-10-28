import { describe, expect, it } from "vitest";
import { classify, mapRows, parseCSV } from "./importer";

describe("Importação CSV", () => {
  const csv = "Fornecedor;Codigo;Doc;Valor;Data\nAlfa;C1;OC1;1.000,50;05/10/2026\nAlfa;C2;OC2;abc;05/10/2026\n";
  const map = { supplier: 0, purchaseCode: 1, document: 2, value: 3, baseDate: 4 };
  it("valida e não duplica na reimportação", () => {
    const rows = mapRows("planned", parseCSV(csv).slice(1), map);
    expect(rows[0]!.values["value"]).toBe(100050);
    const first = classify(rows, []);
    expect(first.map((r) => r.status)).toEqual(["novo", "inválido"]);
    const again = classify(rows, [{ key: rows[0]!.key, hash: rows[0]!.hash }]);
    expect(again[0]!.status).toBe("idêntico");
    const changed = classify(mapRows("planned", parseCSV(csv.replace("1.000,50", "2.000,00")).slice(1), map), [{ key: rows[0]!.key, hash: rows[0]!.hash }]);
    expect(changed[0]!.status).toBe("conflito");
  });
});
