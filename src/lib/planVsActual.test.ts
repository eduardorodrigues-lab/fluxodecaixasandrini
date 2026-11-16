import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import { filterPva, planVsActual } from "./planVsActual";
import { pvaCells } from "@/components/PlanVsActual";
import type { Committed, Planned, ScenarioData } from "./engine/types";

const P = (id: string, code: string, value: number, x: Partial<Planned> = {}): Planned => ({ id, supplierId: "s1", purchaseCode: code, document: "", value, baseDate: "2026-01-01", categoryId: "", notes: "", status: "ativo", remainingOverride: null, ...x });
const C = (id: string, plannedId: string | null, value: number, x: Partial<Committed> = {}): Committed => ({ id, supplierId: "s1", purchaseCode: "", document: "NF" + id, value, dueDate: "2026-02-01", extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null, origin: "efetivacao", plannedId, effectivationId: null, categoryId: "", notes: "", status: "ativo", ...x });
const E = (id: string, plannedId: string, at: string, ids: string[], kind: "parcial" | "concluida" = "concluida") => ({ id, plannedId, at, kind, value: 0, committedIds: ids, prev: { status: "ativo" as const, remainingOverride: null }, reversedAt: null, reversalNote: "" });
function fixture(): ScenarioData {
  const d = emptyData();
  d.suppliers = [{ id: "s1", name: "FORNECEDOR TESTE", group: "", terms: [] }];
  d.planned = [P("p1", "BLACKFREE1803", 12576000, { status: "encerrado" }), P("p2", "BOX2001920", 19656000, { status: "encerrado" }), P("p3", "MASH2026/110", 1000000, { remainingOverride: { value: 600000, dates: [] } })];
  d.committed = [C("c1", "p1", 8400000), C("c2", "p1", 8400000, { document: "NFc1" }), C("c3", "p2", 19656000), C("c4", "p3", 400000)];
  d.effectivations = [E("e1", "p1", "2026-03-10T10:00:00Z", ["c1", "c2"]), E("e2", "p2", "2026-04-05T10:00:00Z", ["c3"]), E("e3", "p3", "2026-05-01T10:00:00Z", ["c4"], "parcial")];
  return d;
}
const row = (d: ScenarioData, id: string) => planVsActual(d).find((r) => r.plannedId === id)!;

describe("Planejado × Efetivado", () => {
  it("BLACKFREE: +42.240,00 (+33,59%) acima, concluído", () => {
    const r = row(fixture(), "p1");
    expect([r.total, r.diff, r.comparison, r.situation]).toEqual([16800000, 4224000, "Acima", "Concluído"]);
    expect(pvaCells(r)[7]).toBe("+33,59%");
  });
  it("BOX sem diferença; MASH parcial com restante confirmado conta no total", () => {
    expect(row(fixture(), "p2").comparison).toBe("Sem diferença");
    const r = row(fixture(), "p3");
    expect([r.effective, r.remaining, r.total, r.diff, r.situation]).toEqual([400000, 600000, 1000000, 0, "Parcial"]);
  });
  it("restante não confirmado = não comparável, nunca zero presumido", () => {
    const d = fixture(); d.planned[2]!.remainingOverride = null;
    const r = row(d, "p3"); expect([r.total, r.diff, r.comparison]).toEqual([null, null, "Não comparável"]);
  });
  it("referência zero comprovada: diferença R$ calculável e % não aplicável", () => {
    const d = fixture(); d.planned[0]!.value = 0;
    const r = row(d, "p1"); expect(r.diff).toBe(16800000); expect(pvaCells(r)[7]).toBe("Não aplicável");
  });
  it("previsão revisada após efetivação: referência não disponível", () => {
    const d = fixture(); d.planned[0]!.editLog = [{ at: "2026-03-11T00:00:00Z", by: "x", note: "", before: { amount: 1, date: null }, after: { amount: 2, date: null } }];
    expect(row(d, "p1").baseline).toBeNull(); expect(row(d, "p1").comparison).toBe("Não comparável");
  });
  it("título cancelado e efetivação revertida ficam fora; pago não soma de novo", () => {
    const d = fixture(); d.committed[1]!.status = "cancelado";
    d.payments = [{ id: "pg", titleKind: "committed", titleId: "c1", date: "2026-03-20", amount: 8400000, note: "", reversedAt: null, reversalNote: "" }];
    const r = row(d, "p1"); expect(r.effective).toBe(8400000); expect(r.cancelledValue).toBe(8400000);
    d.effectivations[2]!.reversedAt = "2026-05-02"; d.committed[3]!.plannedId = null;
    expect(row(d, "p3")).toBeUndefined();
  });
  it("vínculo ambíguo não soma em duas previsões nem associa por código compartilhado", () => {
    const d = fixture(); d.effectivations.push(E("e4", "p2", "2026-04-06T00:00:00Z", ["c4"]));
    expect(row(d, "p3").comparison).toBe("Não comparável"); expect(row(d, "p2").reason).toMatch(/ambíguo/);
    const d2 = fixture(); d2.planned.push(P("p9", "BLACKFREE1803", 1)); expect(row(d2, "p9")).toBeUndefined();
  });
  it("período filtra por efetivação datada; colunas permanecem acumuladas; exportação = conjunto filtrado completo", () => {
    const d = fixture(); d.effectivations.push(E("e5", "p1", "2026-06-01T00:00:00Z", []));
    const rows = filterPva(planVsActual(d), { from: "2026-06-01", to: "2026-06-30", supplier: "", comparison: "", situation: "" });
    expect(rows.map((r) => r.plannedId)).toEqual(["p1"]); expect(rows[0]!.effective).toBe(16800000);
    expect(filterPva(planVsActual(d), { from: null, to: null, supplier: "", comparison: "Acima", situation: "" }).map(pvaCells).length).toBe(1);
  });
  it("é leitura pura: não altera os dados", () => {
    const d = fixture(); const before = JSON.stringify(d); planVsActual(d); expect(JSON.stringify(d)).toBe(before);
  });
});
