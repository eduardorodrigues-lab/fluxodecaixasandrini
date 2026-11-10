import { describe, expect, it } from "vitest";
import { demoData } from "../../test/demoFixture";
import { effectivate, normalizeData } from "./actions";
import { buildRows, computeFlow, itemKind, itemSub } from "./engine";
import type { ScenarioData } from "./types";

const row = (rows: ReturnType<typeof buildRows>, key: string) => rows.find((r) => r.key === key)!;

describe("Categorias Compra/Despesa + subgrupos", () => {
  it("migração: kinds antigos por etapa (planejada/comprometida) viram compra; IDs e vínculos preservados", () => {
    const n = normalizeData({ categories: [{ id: "a", name: "Merc", kind: "planejada" }, { id: "b", name: "Merc", kind: "comprometida" }, { id: "c", name: "Luz", kind: "despesa" }], planned: [{ id: "p", categoryId: "a" }] });
    expect(n.categories.map((c) => c.kind)).toEqual(["compra", "compra", "despesa"]);
    expect(n.planned[0]!.categoryId).toBe("a");
  });

  it("totais idênticos nos modos consolidada e etapa; compras + despesas = saídas", () => {
    const d = demoData();
    const res = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" });
    const a = buildRows(res, d.categories, "consolidada");
    const b = buildRows(res, d.categories, "etapa");
    for (const k of ["saidas", "compras", "despesas", "saldo_fim", "entradas"]) expect(row(a, k).total).toBe(row(b, k).total);
    expect(row(a, "compras").total + row(a, "despesas").total).toBe(row(a, "saidas").total);
    // etapa: planejada + efetuada = total da categoria
    expect(row(b, "compras_plan").total + row(b, "compras_efet").total).toBe(row(b, "compras").total);
    expect(row(b, "despesas_plan").total + row(b, "despesas_efet").total).toBe(row(b, "despesas").total);
  });

  it("subgrupos com o mesmo nome somam juntos (IDs distintos mesclados)", () => {
    const d = demoData(); // c1 e c2 = "Mercadorias para revenda"
    const res = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" });
    const rows = buildRows(res, d.categories, "consolidada");
    const subs = rows.filter((r) => r.parent === "compras");
    expect(subs.filter((r) => r.label === "Mercadorias para revenda")).toHaveLength(1);
    expect(subs.reduce((s, r) => s + r.total, 0)).toBe(row(rows, "compras").total);
  });

  it("despesa planejada entra em Despesas; efetivação herda o subgrupo e não duplica a previsão", () => {
    const d = demoData();
    d.planned.push({ id: "pd", supplierId: "s4", purchaseCode: "DEMO-D900", document: "PREV-LUZ", value: 300000, baseDate: "2026-10-05", categoryId: "c3", notes: "", status: "ativo", remainingOverride: null });
    const antes = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" });
    const rowsA = buildRows(antes, d.categories, "consolidada");
    const aluguelA = rowsA.find((r) => r.parent === "despesas" && r.label === "Aluguel")!;
    expect(aluguelA.total).toBeGreaterThan(1200000); // despesa d1 (1.200.000) + parcelas da previsão
    expect(row(rowsA, "compras").total).toBe(antes.kpis.saidas - row(rowsA, "despesas").total);

    // Efetiva 200.000 da previsão de despesa: título herda c3 (despesa), restante 100.000 continua previsto.
    effectivate(d, { id: "efd1", plannedId: "pd", kind: "parcial", at: "2026-10-06T12:00:00.000Z", installments: [{ value: 200000, date: "2026-11-10", document: "NF-LUZ" }], remaining: null });
    const ef = d.committed.find((c) => c.effectivationId === "efd1")!;
    expect(ef.categoryId).toBe("c3");
    expect(itemKind(d.categories, { source: "comprometida", label: "", amount: 0, categoryId: ef.categoryId })).toBe("despesa");
    expect(itemSub(d.categories, { source: "comprometida", label: "", amount: 0, categoryId: ef.categoryId })).toBe("Aluguel");

    const depois = computeFlow(d, { start: "2026-10-01", end: "2026-12-31" });
    const rowsD = buildRows(depois, d.categories, "etapa");
    const aluguelPlan = rowsD.find((r) => r.parent === "despesas_plan" && r.label === "Aluguel")!;
    const aluguelEfet = rowsD.find((r) => r.parent === "despesas_efet" && r.label === "Aluguel")!;
    // planejado restante (100.000) + efetuado (200.000 + 1.200.000 da d1) = sem duplicar a previsão
    expect(aluguelPlan.total).toBe(100000);
    expect(aluguelEfet.total).toBe(200000 + 1200000);
    expect(row(rowsD, "despesas").total).toBe(row(rowsA, "despesas").total); // total da categoria não muda
  });

  it("item sem subgrupo: despesa importada classifica como Despesa; previsão sem subgrupo como Compra", () => {
    const cats = demoData().categories;
    expect(itemKind(cats, { source: "despesa", label: "", amount: 1 })).toBe("despesa");
    expect(itemKind(cats, { source: "planejada", label: "", amount: 1 })).toBe("compra");
    expect(itemSub(cats, { source: "despesa", label: "", amount: 1 })).toBe("(sem subgrupo)");
  });

  it("cenário sem categorias cadastradas não quebra o motor", () => {
    const d: ScenarioData = normalizeData({ params: { startDate: "2026-10-01" }, planned: [{ id: "p", supplierId: "", purchaseCode: "", document: "", value: 1000, baseDate: "2026-10-01", categoryId: "", notes: "", status: "ativo", remainingOverride: null, terms: [10] }] });
    const res = computeFlow(d, { start: "2026-10-01", end: "2026-10-31" });
    const rows = buildRows(res, d.categories, "etapa");
    expect(row(rows, "saidas").total).toBe(res.kpis.saidas);
    expect(row(rows, "compras").total + row(rows, "despesas").total).toBe(res.kpis.saidas);
  });
});
