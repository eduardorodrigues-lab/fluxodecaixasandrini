import { describe, it, expect } from "vitest";
import { demoData } from "@/test/demoFixture";
import { normalizeData } from "./engine/actions";
import { addSupplier, addSupplierCondition, currentCondition, reactivateCondition } from "./notas";
import { changeCondition, conditionImpact } from "./condicoes";
const at = "2026-11-10T13:00:00Z", today = "2026-11-10";
function setup() {
  const d = normalizeData(structuredClone(demoData()));
  addSupplier(d, { id: "s", name: "Fornecedor isolado", note: "" });
  addSupplierCondition(d, "s", { name: "À vista", terms: [0], from: "2026-11-01" }, "2026-11-01T10:00:00Z", "Ana", today);
  addSupplierCondition(d, "s", { name: "Parcelado", terms: [30, 60, 90], from: "2026-12-01" }, "2026-11-02T10:00:00Z", "Ana", today);
  const s = d.suppliers.find((s) => s.id === "s");
  if (!s || !s.conditions?.[0] || !s.conditions[1]) throw new Error("Fixture inválida");
  return { d, s, a: s.conditions[0].id, b: s.conditions[1].id };
}
describe("Condições protegidas", () => {
  it("editar prazos preserva a versão anterior e a previsão existente", () => {
    const { d, s, a } = setup();
    const p = structuredClone(d.planned[0]); if (!p) throw new Error("Fixture");
    Object.assign(p, { id: "prev", supplierId: "s", terms: null, installments: null, condition: { name: "À vista", terms: [0] } }); d.planned.push(p);
    const original = structuredClone(p.condition);
    changeCondition(d, "s", a, { kind: "edit", name: "Prazo corrigido", note: "Negociado", terms: [60, 90, 120] }, at, "Eduardo", today);
    expect(s.conditions?.[0]?.history?.[0]?.terms).toEqual([0]);
    expect(p.terms).toEqual([0]); expect(p.condition).toEqual(original); expect(s.conditions?.[0]?.terms).toEqual([60, 90, 120]);
  });
  it("cancelar vigente exige motivo e decisão explícita sem selecionar outra", () => {
    const { d, s, a } = setup();
    expect(() => changeCondition(d, "s", a, { kind: "cancel", reason: "Erro", replacementId: null, acknowledge: false }, at, "Ana", today)).toThrow(/Confirme/);
    expect(() => changeCondition(d, "s", a, { kind: "cancel", reason: "", replacementId: null, acknowledge: true }, at, "Ana", today)).toThrow(/motivo/);
    changeCondition(d, "s", a, { kind: "cancel", reason: "Erro", replacementId: null, acknowledge: true }, at, "Ana", today);
    expect(currentCondition(s, today)).toBeNull(); expect(s.terms).toEqual([]); expect(s.conditions?.[0]?.cancelled?.reason).toBe("Erro");
  });
  it("cancelar condição futura permite definir substituta para os períodos afetados", () => {
    const { d, s, a, b } = setup();
    expect(conditionImpact(s, b, today)).toEqual(["2026-12-01"]);
    changeCondition(d, "s", b, { kind: "cancel", reason: "Agendamento errado", replacementId: a, acknowledge: true }, at, "Ana", today);
    expect(currentCondition(s, "2026-12-02")?.id).toBe(a);
  });
  it("cancelar só uma ativação preserva a condição e não restaura outra automaticamente", () => {
    const { d, s, a } = setup();
    reactivateCondition(d, "s", a, "2027-01-01", "2026-11-03T10:00:00Z", "Ana", today);
    changeCondition(d, "s", a, { kind: "period", index: 1, reason: "Erro de data", replacementId: null, acknowledge: true }, at, "Ana", today);
    expect(s.conditions?.[0]?.cancelled).toBeUndefined(); expect(s.conditions?.[0]?.periods?.[1]?.cancelled?.reason).toBe("Erro de data");
    expect(currentCondition(s, "2027-01-01")).toBeNull(); expect(currentCondition(s, today)?.id).toBe(a);
  });
  it("exclusão bloqueia períodos de vigência mesmo cancelados", () => {
    const { d, a } = setup();
    expect(() => changeCondition(d, "s", a, { kind: "delete" }, at, "Ana", today)).toThrow(/vigência/);
  });
  it("exclui apenas condição nunca utilizada sem período ou vínculo", () => {
    const { d, s } = setup(); s.conditions?.push({ id: "livre", name: "Rascunho cadastrado", terms: [0], from: null, at, by: "Ana", periods: [] });
    changeCondition(d, "s", "livre", { kind: "delete" }, at, "Ana", today);
    expect(s.conditions?.some((c) => c.id === "livre")).toBe(false);
  });
  it("condição cancelada não pode ganhar nova ativação", () => {
    const { d, a } = setup(); changeCondition(d, "s", a, { kind: "cancel", reason: "Erro", replacementId: null, acknowledge: true }, at, "Ana", today);
    expect(() => reactivateCondition(d, "s", a, today, at, "Ana", today)).toThrow(/cancelada/);
  });
});