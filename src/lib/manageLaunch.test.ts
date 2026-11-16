import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import { documentGroups } from "./documentGroups";
import { applyManaged, managedDocument, validateManualRemaining } from "./manageLaunch";
import { effectivateManual, currentParcels } from "./efetivacao";
import { computeFlow } from "./engine/engine";
import { diffData, applyOps } from "./diff";
import type { Committed, ScenarioData } from "./engine/types";

function fixture() {
  const d = emptyData(); d.params.startDate = "2025-01-01";
  d.suppliers.push({ id: "s", name: "UZ3", group: "", terms: [] });
  d.categories.push({ id: "cat", name: "Mercadoria", kind: "compra", group: "" });
  d.committed = [1, 2, 3].map((n): Committed => ({ id: `c${n}`, supplierId: "", sourceSupplier: "UZ3 Indústria Textil Ltda", purchaseCode: "1456 - OK", document: `361186A${n}`, value: 2640000, dueDate: ["2026-10-06", "2026-11-05", "2026-12-05"][n - 1] ?? "", extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null, origin: "legado", plannedId: null, effectivationId: null, categoryId: "cat", notes: "", status: "ativo", importOrigin: { file: "original.xlsm", sheet: "COMPRAS DIRETAS_EFETUADAS", row: 4829 + n, raw: ["1456 - OK", "UZ3 Indústria Textil Ltda", `361186A${n}`, { d: "2026-06-02" }, null, 26400, { d: ["2026-10-06", "2026-11-05", "2026-12-05"][n - 1] }] } }));
  d.payments.push({ id: "pay", titleKind: "committed", titleId: "c1", amount: 2640000, date: "2026-10-06", note: "", reversedAt: null, reversalNote: "" });
  return d;
}
function edit(d: ScenarioData, id = "c2") {
  const ref = { kind: "committed" as const, id }; const doc = managedDocument(d, ref);
  return { ref, before: doc.parcels, parcels: structuredClone(doc.parcels), fields: doc.fields, initialFields: doc.fields, reason: "Negociação", at: "2026-11-16T15:57:00Z", by: "editor" };
}
describe("Gerenciamento autorizado", () => {
  it("UZ3 361186A1/A2/A3: documento 361186 e parcelas 1/3, 2/3, 3/3 sem alterar IDs, valores, baixas ou fluxo", () => {
    const d = fixture(), before = structuredClone(d), g = documentGroups(d).byId.get("c2");
    expect(g?.document).toBe("361186"); expect([...g?.labels.values() ?? []]).toEqual(["1/3", "2/3", "3/3"]);
    expect(g?.titles.map((c) => c.value)).toEqual([2640000, 2640000, 2640000]);
    expect(g?.titles.map((c) => c.dueDate)).toEqual(["2026-10-06", "2026-11-05", "2026-12-05"]);
    expect(d).toEqual(before); expect(computeFlow(d, { start: "2025-01-01", end: "2030-12-31" })).toEqual(computeFlow(before, { start: "2025-01-01", end: "2030-12-31" }));
  });
  it("não corta sufixo sem prova nem agrupa notas distintas do pedido 1456", () => {
    const d = fixture(); const extra = structuredClone(d.committed[0]); if (!extra) throw new Error(); extra.id = "other"; extra.document = "361185A1"; extra.importOrigin = null; d.committed.push(extra);
    const g = documentGroups(d); expect(g.byId.get("other")?.titles).toHaveLength(1); expect(g.byId.get("c2")?.titles).toHaveLength(3); expect(g.ambiguous.map((x) => x.id)).toContain("other");
  });
  it("colisão de série e fornecedor diferente não são mesclados", () => {
    const d = fixture(), duplicate = structuredClone(d.committed[0]); if (!duplicate) throw new Error(); duplicate.id = "duplicate"; d.committed.push(duplicate);
    expect(documentGroups(d).byId.get("c1")?.titles).toHaveLength(1);
    const other = fixture(); const row = other.committed[2]; if (!row) throw new Error(); row.sourceSupplier = "Outro";
    expect(documentGroups(other).byId.get("c1")?.titles.map((c) => c.sourceSupplier)).toEqual(["UZ3 Indústria Textil Ltda", "UZ3 Indústria Textil Ltda"]);
    expect(documentGroups(other).byId.get("c3")?.titles).toHaveLength(1);
  });
  it("valor/vencimento editam somente parcela selecionada e persistem por operações existentes", () => {
    const d = fixture(), before = structuredClone(d), inp = edit(d); const p = inp.parcels[1]; if (!p) throw new Error(); p.amount = 2500000; p.date = "2026-11-15"; applyManaged(d, inp);
    expect(d.committed[0]).toEqual(before.committed[0]); expect(d.committed[2]).toEqual(before.committed[2]); expect(d.committed[1]?.value).toBe(2500000);
    const reload = applyOps(before, JSON.parse(JSON.stringify(diffData(before, d))), true); expect(reload.conflicts).toEqual([]); expect(reload.data).toEqual(d);
    expect(documentGroups(d).byId.get("c2")?.titles).toHaveLength(3);
  });
  it("cancelamento conserva valor e baixa; efeito futuro da parcela é zero", () => {
    const d = fixture(), inp = edit(d); const p = inp.parcels[1]; if (!p) throw new Error(); p.status = "cancelado"; applyManaged(d, inp);
    expect(d.committed[1]?.value).toBe(2640000); expect(d.committed[1]?.status).toBe("cancelado"); expect(d.payments[0]?.amount).toBe(2640000);
    expect(computeFlow(d, { start: "2026-11-05", end: "2026-11-05" }).days[0]?.comprometida).toBe(0); expect(d.committed[1]?.editLog?.[0]?.by).toBe("editor");
  });
  it("parcelas pagas não podem ser editadas ou canceladas diretamente", () => {
    const d = fixture(), inp = edit(d); const p = inp.parcels[0]; if (!p) throw new Error(); p.status = "cancelado";
    expect(() => applyManaged(d, inp)).toThrow("pagamento protegida"); expect(d.payments[0]?.reversedAt).toBe(null);
  });
  it("campos compartilhados afetam somente documento inteiro, sem regravar identificação original no agrupamento", () => {
    const d = fixture(), inp = edit(d); inp.fields = { ...inp.fields, notes: "Prazo negociado" }; applyManaged(d, inp);
    expect(d.committed.map((c) => c.notes)).toEqual(["Prazo negociado", "Prazo negociado", "Prazo negociado"]); expect(d.committed.map((c) => c.document)).toEqual(["361186A1", "361186A2", "361186A3"]);
  });
  it("restante parcial é manual: vazio não é zero, R$0 exige confirmação e datas conferidas", () => {
    expect(validateManualRemaining(null, true, [])).not.toBe(""); expect(validateManualRemaining(0, false, [])).not.toBe(""); expect(validateManualRemaining(0, true, [])).toBe("");
    expect(validateManualRemaining(50000, true, [{ amount: 50000, date: null }])).not.toBe("");
    expect(validateManualRemaining(50000, true, [{ amount: 40000, date: "2026-12-05" }])).not.toBe("");
  });
  it("efetivação selecionada aplica saldo manual diferente da diferença matemática sem pagar", () => {
    const d = emptyData(); d.planned.push({ id: "pl", supplierId: "s", categoryId: "cat", document: "NF", purchaseCode: "P", value: 300000, baseDate: "2026-10-01", notes: "", status: "ativo", remainingOverride: null, installments: [1,2,3].map((n) => ({ amount: 100000, date: `2026-${9+n}-05`, extensionDate: null, extensionHistory: [] })) });
    const parcels = currentParcels(d, "pl"); effectivateManual(d, { id: "eff", plannedId: "pl", at: "2026-11-16T15:57:00Z", effectiveDate: "2026-11-16", document: "NF", purchaseCode: "P", selected: [parcels[0]?.key ?? ""], eff: [{ amount: 90000, date: "2026-10-05" }], rest: [{ id: "r2", amount: 80000, date: "2026-11-05" }, { id: "r3", amount: 70000, date: "2026-12-05" }], substituted: 100000, rule: "Saldo manual confirmado" });
    expect(d.planned[0]?.remainingOverride?.value).toBe(150000); expect(d.committed.map((c) => c.value)).toEqual([90000]); expect(d.payments).toEqual([]);
  });
  it("referência de outra organização não encontra registro; alterações concorrentes são recusadas", () => {
    expect(() => managedDocument(emptyData(), { kind: "committed", id: "c2" })).toThrow();
    const d = fixture(), inp = edit(d); const row = d.committed[1]; if (!row) throw new Error(); row.value += 1; expect(() => applyManaged(d, inp)).toThrow("mudou");
  });
});