import { it, expect } from "vitest";
import { normalizeData } from "./engine/actions";
import { computeFlow } from "./engine/engine";
import { computeDashboard } from "./engine/dashboard";
import { cardReport, titlesReport, supplierSlot, signedMoney } from "./dashboardReport";
it("quinze KPIs preservados; relatório fonte fecha cada indicador monetário sem somar ranking ao maior", () => {
  const d = normalizeData({ params: { startDate: "2026-11-01", saldoInicial: 0 }, suppliers: [{ id: "A", name: "Fornecedor A", terms: [], group: "" }, { id: "B", name: "Fornecedor B", terms: [], group: "" }], committed: [
    { id: "c1", supplierId: "A", document: "NF1", value: 1000000, dueDate: "2026-11-12", status: "ativo", parcelNo: 1, parcelCount: 2 },
    { id: "c2", supplierId: "B", document: "NF2", value: 500000, dueDate: "2026-11-15", status: "ativo" },
  ], payments: [{ id: "p", titleKind: "committed", titleId: "c1", amount: 200000, date: "2026-11-02", reversedAt: null }] });
  const flow = computeFlow(d, { start: "2026-11-01", end: "2026-11-30" }), k = computeDashboard(d, flow, "2026-11-11", { start: "2026-11-01", end: "2026-11-30" });
  expect(k.cards).toHaveLength(15);
  for (const c of k.cards.filter((c) => c.kind !== "day")) expect(cardReport(d, c, flow.days).total).toBe(c.value);
  const total = k.cards.find((c) => c.key === "total"); expect(total?.value).toBe(1300000);
  const report = titlesReport(d, k.titles); expect(report.rows.find((r) => r.supplierId === "A")?.cells[2]?.text).toBe("1/2");
  const selected = report.rows.filter((r) => r.group === "A"); expect(selected.reduce((s, r) => s + r.value, 0)).toBe(800000);
  expect(report.groups.reduce((s, g) => s + g.value, 0)).toBe(report.total);
});
it("cor estável vinculada ao ID e sinais independentes do fornecedor", () => {
  expect(supplierSlot("A")).toBe(supplierSlot("A")); expect(supplierSlot("A")).not.toBe(supplierSlot("B"));
  expect(signedMoney(-10000)).toContain("−"); expect(signedMoney(10000)).toContain("+"); expect(signedMoney(0)).not.toContain("+");
});