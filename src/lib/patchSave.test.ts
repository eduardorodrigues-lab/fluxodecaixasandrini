import { describe, expect, it } from "vitest";
import { produce, setAutoFreeze } from "immer";
import { applyOps, diffData, mergeOps } from "./diff";
import { normalizeData } from "./engine/actions";
import type { ScenarioData } from "./engine/types";
setAutoFreeze(false);
const base = (): ScenarioData => normalizeData({ expenses: [
  { id: "a", categoryId: "", supplierId: "", document: "A", notes: "", value: 100.123, baseDate: "2026-11-01", termDays: 0, status: "ativo", extensionDate: null, extensionHistory: [] },
  { id: "b", categoryId: "", supplierId: "", document: "B", notes: "", value: 200, baseDate: "2026-11-01", termDays: 0, status: "ativo", extensionDate: null, extensionHistory: [] },
] });
const edit = (d: ScenarioData, fn: (x: ScenarioData) => void) => { const n = produce(d, (x) => { fn(x); }); return diffData(d, n); };

describe("gravação por alterações", () => {
  it("envia só o registro alterado e preserva precisão", () => {
    const ops = edit(base(), (x) => { x.expenses[0]!.value = 150.4567; });
    expect(ops).toHaveLength(1);
    expect(applyOps(base(), ops, true).data.expenses[0]!.value).toBe(150.4567);
  });
  it("dois usuários: alterações independentes são preservadas", () => {
    const u1 = edit(base(), (x) => { x.expenses[0]!.value = 1; });
    const u2 = edit(base(), (x) => { x.expenses[1]!.value = 2; });
    const after1 = applyOps(base(), u1, true).data;
    const r = applyOps(after1, u2, true);
    expect(r.conflicts).toHaveLength(0);
    expect(r.data.expenses.map((e) => e.value)).toEqual([1, 2]);
  });
  it("mesma informação alterada por outra pessoa gera conflito e não sobrescreve", () => {
    const u1 = edit(base(), (x) => { x.expenses[0]!.value = 1; });
    const u2 = edit(base(), (x) => { x.expenses[0]!.value = 9; });
    const r = applyOps(applyOps(base(), u1, true).data, u2, true);
    expect(r.conflicts).toHaveLength(1);
    expect(r.data.expenses[0]!.value).toBe(1);
  });
  it("repetição do mesmo envio não aplica duas vezes", () => {
    const ops = edit(base(), (x) => { x.expenses.push({ ...x.expenses[0]!, id: "c" }); });
    const once = applyOps(base(), ops, true).data;
    const twice = applyOps(once, ops, true);
    expect(twice.applied).toHaveLength(0);
    expect(twice.data.expenses).toHaveLength(3);
  });
  it("acumula edições mantendo o antes original; voltar ao original remove a pendência", () => {
    const d = base();
    const a = edit(d, (x) => { x.expenses[0]!.value = 5; });
    const d2 = applyOps(d, a, false).data;
    const b = edit(d2, (x) => { x.expenses[0]!.value = 100.123; });
    expect(mergeOps(a, b)).toHaveLength(0);
  });
});
