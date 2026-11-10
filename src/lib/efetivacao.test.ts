import { describe, expect, it } from "vitest";
import { applyNote, generateParcels, type NoteDraft } from "@/lib/notas";
import { computeFlow } from "@/lib/engine/engine";
import { normalizeData, reverseEffectivation } from "@/lib/engine/actions";
import { adjustPlanned, applySuggestion, currentParcels, diffParcels, draftTotals, effectivateManual, initDraft, validateDraft } from "@/lib/efetivacao";
import type { ScenarioData } from "@/lib/engine/types";
import { demoData as demo } from "@/test/demoFixture";

const T = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300];
function setup(): { d: ScenarioData; id: string } {
  const d = normalizeData(structuredClone(demo()));
  const n: NoteDraft = { stage: "planned", kind: "compra", categoryId: d.categories.find((c) => c.kind === "compra")!.id, supplierId: d.suppliers[0]!.id, purchaseCode: "EFM", document: "", description: "", total: 1000000, baseDate: "2026-10-01", parcels: generateParcels(1000000, "2026-10-01", T) };
  let k = 0; applyNote(d, n, { id: () => "pm" + k++, at: "2026-11-10T12:00:00Z" });
  return { d, id: d.planned.find((p) => p.purchaseCode === "EFM")!.id };
}
const run = (d: ScenarioData, id: string, sel: string[], eff: { amount: number; date: string }[], rest: { id: string; amount: number | null; date: string | null; origin: string | null }[], substituted: number, eid = "e1") =>
  effectivateManual(d, { id: eid, plannedId: id, at: "2026-11-10T12:00:00Z", effectiveDate: "2026-11-09", document: "NF-1", purchaseCode: "EFM", selected: sel, eff, rest: rest.map((r) => ({ id: r.id, amount: r.amount!, date: r.date! })), substituted, rule: "teste" });

describe("Efetivação com edição manual — exemplo 10×1.000 com a 1ª substituída por 900", () => {
  const ctx = () => { const { d, id } = setup(); const parcels = currentParcels(d, id); const sel = [parcels[0]!.key]; const dr = initDraft(parcels, sel); return { d, id, parcels, sel, dr }; };
  it.each([["manter", 900000, 990000], ["igualar", 810000, 900000], ["diferenca", 890000, 980000], ["total", 910000, 1000000]] as const)("%s → planejado %i, total %i", (mode, planned, total) => {
    const { parcels, sel, dr } = ctx();
    const rest = applySuggestion(mode, dr.rest, { parcels, selected: sel, substituted: 100000, effTotal: 90000 });
    const t = draftTotals([{ amount: 90000, date: "2026-10-31" }], rest, parcels);
    expect(t.restTotal).toBe(planned); expect(t.after).toBe(total); expect(rest.map((r) => r.date)).toEqual(dr.rest.map((r) => r.date));
  });
  it("substituir integralmente 1.000 por 900 não deixa resíduo de 100 e o fluxo soma restante + efetivado sem duplicar", () => {
    const { d, id, sel, dr } = ctx();
    run(d, id, sel, [{ amount: 90000, date: "2026-11-05" }], dr.rest, 100000);
    const p = currentParcels(d, id); expect(p.length).toBe(9); expect(p.reduce((a, x) => a + x.amount, 0)).toBe(900000);
    const out = (x: ScenarioData) => computeFlow(x, { start: "2026-10-01", end: "2027-12-31" }).days.reduce((a, r) => a + r.saidas, 0);
    expect(out(d) - out(setup().d)).toBe(-10000);
    expect(d.payments.length).toBe(setup().d.payments.length); // efetivar não paga
  });
  it("centavos: resíduo na última; aumento funciona; sem restantes não divide por zero", () => {
    const { parcels, sel, dr } = ctx();
    const r = applySuggestion("total", dr.rest, { parcels, selected: sel, substituted: 100000, effTotal: 90001 });
    expect(r.slice(0, 8).every((x) => x.amount === 101111)).toBe(true); expect(r[8]!.amount).toBe(101111); expect(r.reduce((a, x) => a + x.amount!, 0)).toBe(909999);
    const up = applySuggestion("diferenca", dr.rest, { parcels, selected: sel, substituted: 100000, effTotal: 120000 });
    expect(up.reduce((a, x) => a + x.amount!, 0)).toBe(920000);
    expect(applySuggestion("total", [], { parcels, selected: sel, substituted: 0, effTotal: 1 })).toEqual([]);
    expect(() => applySuggestion("igualar", dr.rest, { parcels, selected: [parcels[0]!.key, parcels[1]!.key], substituted: 0, effTotal: 1 })).toThrow();
  });
  it("bloqueia negativos e inválidos", () => {
    expect(validateDraft([{ amount: -1, date: "2026-10-01" }], [], 0, 0, "2026-10-01").length).toBeGreaterThan(0);
    expect(validateDraft([{ amount: 100, date: "2026-10-01" }], [{ id: "x", amount: 0, date: "2026-10-01", origin: null }], 100, 100, "2026-10-01").length).toBeGreaterThan(0);
    expect(validateDraft([{ amount: 100, date: "2026-10-01" }], [], 200, 100, "2026-10-01")).toContain("A previsão substituída não pode exceder as parcelas selecionadas.");
    expect(validateDraft([{ amount: 100, date: "2026-10-01" }], [], 100, 100, null)).toContain("Informe a data da efetivação.");
  });
});

describe("Seleção, edição manual e vínculos", () => {
  it("selecionar 3 de 10 não toca as outras; repartir efetivação; parcial mantém saldo explícito", () => {
    const { d, id } = setup(); const parcels = currentParcels(d, id);
    const sel = [parcels[2]!.key, parcels[5]!.key, parcels[7]!.key]; const dr = initDraft(parcels, sel);
    const rest = [...dr.rest, { id: "saldo", amount: 50000, date: parcels[7]!.date, origin: null }]; // saldo explícito da parcial
    run(d, id, sel, [{ amount: 100000, date: "2026-12-01" }, { amount: 150000, date: "2027-01-01" }], rest, 250000);
    const after = currentParcels(d, id);
    expect(after.filter((p) => p.key !== "saldo").map((p) => p.key)).toEqual(dr.rest.map((r) => r.id));
    expect(after.reduce((a, p) => a + p.amount, 0)).toBe(750000);
    expect(d.committed.filter((c) => c.effectivationId === "e1").map((c) => c.value)).toEqual([100000, 150000]);
    const diff = diffParcels(parcels, sel, rest);
    expect(diff.filter((x) => x.kind === "efetivada").length).toBe(3); expect(diff.filter((x) => x.kind === "adicionada").length).toBe(1);
  });
  it("edição manual de valores/datas, remoção e adição aparecem no antes/depois; cancelar não grava", () => {
    const { d, id } = setup(); const parcels = currentParcels(d, id); const sel = [parcels[0]!.key]; const dr = initDraft(parcels, sel);
    const snap = JSON.stringify(d);
    const rest = dr.rest.map((r, i) => i === 0 ? { ...r, amount: 123456, date: "2027-02-02" } : r).filter((_, i) => i !== 1).concat({ id: "nova", amount: 1000, date: "2028-01-01", origin: null });
    expect(JSON.stringify(d)).toBe(snap); // rascunho não altera dados
    const kinds = diffParcels(parcels, sel, rest).map((x) => x.kind);
    expect(kinds).toContain("alterada"); expect(kinds).toContain("removida"); expect(kinds).toContain("adicionada");
    run(d, id, sel, [{ amount: 90000, date: "2026-11-01" }], rest, 100000);
    const ef = d.effectivations.find((e) => e.id === "e1")!;
    expect(ef.manual!.before.length).toBe(10); expect(ef.manual!.after.length).toBe(9);
    expect(d.planned.find((p) => p.id === id)!.installments!.length).toBe(10); // origem preservada
  });
  it("idempotente, reversão restaura e bloqueia fora de ordem; segunda efetivação usa IDs estáveis (sem FIFO)", () => {
    const { d, id } = setup(); let p = currentParcels(d, id); let dr = initDraft(p, [p[0]!.key]);
    run(d, id, [p[0]!.key], [{ amount: 100000, date: "2026-11-01" }], dr.rest, 100000);
    run(d, id, [p[0]!.key], [{ amount: 100000, date: "2026-11-01" }], dr.rest, 100000);
    expect(d.committed.filter((c) => c.effectivationId === "e1").length).toBe(1);
    p = currentParcels(d, id); const last = p[p.length - 1]!; dr = initDraft(p, [last.key]);
    run(d, id, [last.key], [{ amount: 100000, date: "2027-08-01" }], dr.rest, 100000, "e2");
    expect(currentParcels(d, id).map((x) => x.key)).toEqual(p.slice(0, -1).map((x) => x.key));
    expect(() => reverseEffectivation(d, "e1", "x", "2026-11-11")).toThrow();
    reverseEffectivation(d, "e2", "x", "2026-11-11"); reverseEffectivation(d, "e1", "x", "2026-11-11");
    expect(currentParcels(d, id).reduce((a, x) => a + x.amount, 0)).toBe(1000000);
  });
  it("efetivar todas encerra; ajustar planejamento altera quantidade/total sem efetivar", () => {
    const { d, id } = setup(); const p = currentParcels(d, id);
    adjustPlanned(d, id, [{ id: "a", amount: 300000, date: "2027-01-01" }, { id: "b", amount: 200000, date: "2027-02-01" }]);
    expect(currentParcels(d, id).reduce((a, x) => a + x.amount, 0)).toBe(500000);
    expect(p.length).toBe(10); expect(d.effectivations.length).toBe(0);
    const q = currentParcels(d, id);
    run(d, id, q.map((x) => x.key), [{ amount: 500000, date: "2027-01-01" }], [], 500000);
    expect(d.planned.find((x) => x.id === id)!.status).toBe("encerrado");
  });
  it("simulação: aplicar em cópia não altera a base", () => {
    const { d, id } = setup(); const sim = structuredClone(d); const p = currentParcels(sim, id);
    run(sim, id, [p[0]!.key], [{ amount: 1, date: "2026-11-01" }], initDraft(p, [p[0]!.key]).rest, 100000);
    expect(d.effectivations.length).toBe(0); expect(currentParcels(d, id).length).toBe(10);
  });
});
