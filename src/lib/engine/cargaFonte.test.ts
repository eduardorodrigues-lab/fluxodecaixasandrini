import { describe, expect, it } from "vitest";
import { emptyData } from "./actions";
import { computeFlow, distributePlanned } from "./engine";
import type { Planned } from "./types";

// Regras da carga da fonte Excel: zero da fonte aciona estimativa; precisão da fonte preservada.
const base = () => { const x = emptyData(); x.params = { ...x.params, profile: "legado", startDate: "2026-01-11", saldoInicial: 0, lagDays: 10, legacyReducer: 0.25, divisorLegado: "30" }; x.targets = { "2026-01": 100_000 }; x.targetConfigs = {}; return x; };
describe("carga fonte Excel", () => {
  it("recebimento importado com soma zero usa a estimativa (IF(D6=0) da fonte)", () => {
    const x = base();
    x.receipts = [{ id: "r", date: "2026-01-11", platforms: {}, general: 0, notes: "", legacyZeroEstimate: true }];
    const d = computeFlow(x, { start: "2026-01-11", end: "2026-01-11" }).days[0]!;
    expect(d.usouInformado).toBe(false);
    expect(d.recUsado).toBe(2500);
  });
  it("zero digitado no sistema continua substituindo a estimativa", () => {
    const x = base();
    x.receipts = [{ id: "r", date: "2026-01-11", platforms: {}, general: 0, notes: "" }];
    expect(computeFlow(x, { start: "2026-01-11", end: "2026-01-11" }).days[0]!.recUsado).toBe(0);
  });
  it("mês importado da fonte mantém estimativa diária exata (sem arredondar ao centavo)", () => {
    const x = base(); x.targets = { "2026-01": 100_001 };
    x.targetConfigs = { "2026-01": { gross: 100_001, legacyReducer: 0.25, divisorLegado: "30", webR1: 0, webR2: 0, r2Base: "apos_r1", divisorWeb: "dias", lagDays: 10, sourceExact: true, version: 1, history: [] } };
    expect(computeFlow(x, { start: "2026-01-11", end: "2026-01-11" }).days[0]!.recUsado).toBeCloseTo(100_001 * 0.75 / 30, 9);
  });
  it("planejada importada distribui R exato por prazo (R$ 9.606,667 não vira 9.606,67)", () => {
    const pl: Planned = { id: "p", supplierId: "", purchaseCode: "X", document: "", value: 960666.7 * 3, baseDate: "2026-01-01", categoryId: "", notes: "", status: "ativo", remainingOverride: null, terms: [30, 60, 90, 0, null, null, null, null, null, null], origin: { file: "f", sheet: "s", row: 1 } };
    const r = distributePlanned(pl, undefined, [], "legado");
    expect(r.parcels.map((p) => p.amount)).toEqual([960666.7, 960666.7, 960666.7].map((v) => (v * 3) / 3));
  });
});
