import { describe, expect, it } from "vitest";
import { buildConsulta, filterConsulta, EMPTY_FILTER } from "@/components/Consultas";
import type { ScenarioData } from "@/lib/engine/types";
const c = (id: string, due: string, ext: string | null, value: number) => ({ id, supplierId: "s1", purchaseCode: "P1", document: "NF1", value, dueDate: due, extensionDate: ext, extensionHistory: [], extensionInfo: "", legacyAbatement: null, origin: "manual", plannedId: null, effectivationId: null, categoryId: "", notes: "", status: "ativo" });
const d = { suppliers: [{ id: "s1", name: "Alfa", group: "", terms: [] }, { id: "s2", name: "Beta", group: "", terms: [] }], categories: [], expenses: [],
  committed: [c("a", "2026-10-05", "2026-11-10", 10000), c("b", "2026-11-05", null, 10000)],
  payments: [{ id: "p", titleKind: "committed", titleId: "b", date: "2026-10-20", amount: 4000, note: "", reversedAt: null, reversalNote: "" }] } as unknown as ScenarioData;
describe("Consultas de boletos", () => {
  const rows = buildConsulta(d);
  it("numera parcelas e calcula pago/aberto", () => {
    const b = rows.find((r) => r.key.startsWith("committed:b"))!;
    expect(b.parcel).toBe("2/2"); expect(b.paid).toBe(4000); expect(b.open).toBe(6000); expect(b.state).toBe("Parcialmente pago");
  });
  it("período por vencimento usa a data prorrogada", () => {
    const r = filterConsulta(rows, { ...EMPTY_FILTER, from: "2026-11-01", to: "2026-11-30" });
    expect(r.map((x) => x.key.split("|")[0]).sort()).toEqual(["committed:a", "committed:b"]);
  });
  it("filtros combinados: em aberto + prorrogados", () => {
    expect(filterConsulta(rows, { ...EMPTY_FILTER, pay: "Em aberto", ext: "sim", supplier: "Alfa" }).length).toBe(1);
  });
  it("período por data do pagamento", () => {
    expect(filterConsulta(rows, { ...EMPTY_FILTER, by: "pag", from: "2026-10-01", to: "2026-10-31" }).length).toBe(1);
  });
});
