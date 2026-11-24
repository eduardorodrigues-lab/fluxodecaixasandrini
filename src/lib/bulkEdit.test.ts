import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import { applyBulk, bulkKey, expandToDocuments, planBulk, snapshotOf, type BulkAction } from "./bulkEdit";
import { applyManaged, managedDocument } from "./manageLaunch";
import { documentGroups } from "./documentGroups";
import { computeFlow } from "./engine/engine";
import type { Committed, ScenarioData } from "./engine/types";

function fixture() {
  const d = emptyData(); d.params.startDate = "2026-11-01";
  d.categories.push({ id: "cat", name: "Mercadoria", kind: "compra", group: "" }, { id: "cat2", name: "Fretes", kind: "despesa", group: "" });
  const t = (id: string, due: string, extra: Partial<Committed> = {}): Committed => ({ id, supplierId: "s", purchaseCode: "P", document: "NF1", value: 10000, dueDate: due, extensionDate: null, extensionHistory: [], extensionInfo: "", legacyAbatement: null, origin: "manual", plannedId: null, effectivationId: null, categoryId: "cat", notes: "", status: "ativo", condition: null, ...extra } as Committed);
  d.committed = [t("a", "2026-12-01", { noteId: "n", parcelNo: 1, parcelCount: 2 }), t("b", "2027-01-01", { noteId: "n", parcelNo: 2, parcelCount: 2 }), t("c", "2026-12-10", { document: "NF2" })];
  d.payments.push({ id: "p", titleKind: "committed", titleId: "b", amount: 4000, date: "2026-11-20", note: "", reversedAt: null, reversalNote: "" });
  return d;
}
const items = (d: ScenarioData, ids: string[]) => ids.map((id) => ({ kind: "committed" as const, id, seen: snapshotOf(d, "committed", id)! }));
const run = (d: ScenarioData, ids: string[], action: BulkAction) => applyBulk(d, { items: items(d, ids), action, reason: "Lote", at: "2026-11-24T12:00:00Z", by: "ed" });

describe("Edição em massa", () => {
  it("afeta só os IDs selecionados e registra antes/depois", () => {
    const d = fixture(), untouched = structuredClone(d.committed[2]);
    run(d, ["a"], { type: "extend", date: "2026-12-15" });
    expect(d.committed[0]?.extensionDate).toBe("2026-12-15");
    expect(d.committed[0]?.extensionHistory).toHaveLength(1);
    expect(d.committed[0]?.editLog?.[0]?.before.date).toBe("2026-12-01");
    expect(d.committed[2]).toEqual(untouched);
  });
  it("documento inteiro só amplia por vínculo comprovado", () => {
    const d = fixture();
    expect(expandToDocuments(d, [bulkKey("committed", "a")]).sort()).toEqual(["committed:a", "committed:b"]);
    expect(expandToDocuments(d, [bulkKey("committed", "c")])).toEqual(["committed:c"]);
  });
  it("parcela com pagamento bloqueia cancelamento do lote inteiro sem mutação parcial", () => {
    const d = fixture(), before = structuredClone(d);
    expect(() => run(d, ["a", "b"], { type: "cancel" })).toThrow(/estorno/);
    expect(d).toEqual(before);
  });
  it("cancelar zera obrigação vigente nos totais e retira do Fluxo", () => {
    const d = fixture();
    const plan = planBulk(d, { items: items(d, ["a", "c"]), action: { type: "cancel" }, reason: "x" });
    expect(plan.totals).toMatchObject({ before: 20000, after: 0 });
    run(d, ["a", "c"], { type: "cancel" });
    const flow = computeFlow(d, { start: "2026-12-01", end: "2026-12-10" });
    expect(flow.days.reduce((s, x) => s + x.saidas, 0)).toBe(0);
    expect(d.committed[0]?.value).toBe(10000);
  });
  it("alteração concorrente depois da seleção vira conflito", () => {
    const d = fixture(), sel = items(d, ["a"]);
    d.committed[0]!.value = 12345;
    expect(() => applyBulk(d, { items: sel, action: { type: "value", amount: 5000 }, reason: "x", at: "", by: "" })).toThrow(/outra pessoa/);
  });
  it("valor vazio não vira zero e justificativa é obrigatória", () => {
    const d = fixture();
    expect(() => run(d, ["a"], { type: "value", amount: null })).toThrow(/vazio não é zero/);
    expect(() => applyBulk(d, { items: items(d, ["a"]), action: { type: "category", categoryId: "cat2" }, reason: " ", at: "", by: "" })).toThrow(/justificativa/);
  });
  it("prorrogação antes do vencimento original é recusada", () => {
    const d = fixture();
    expect(() => run(d, ["a"], { type: "extend", date: "2026-11-01" })).toThrow(/anterior/);
  });
});

describe("Adicionar parcela a efetivado existente", () => {
  it("documento sem vínculo de nota ganha vínculo explícito, preserva ID/valor e mostra 1/2 e 2/2", () => {
    const d = fixture(), ref = { kind: "committed" as const, id: "c" }, doc = managedDocument(d, ref);
    const parcels = [...structuredClone(doc.parcels), { key: "c2new", id: "c2new", label: "2 (nova)", original: 0, amount: 5000, date: "2027-01-10", extension: null, status: "ativo", paid: 0 }];
    applyManaged(d, { ref, before: doc.parcels, parcels, fields: doc.fields, initialFields: doc.fields, reason: "Nova parcela negociada", at: "2026-11-24T12:00:00Z", by: "ed" });
    const c = d.committed.find((x) => x.id === "c")!, n = d.committed.find((x) => x.id === "c2new")!;
    expect([c.value, c.dueDate, c.noteId]).toEqual([10000, "2026-12-10", "nota-c"]);
    expect([n.value, n.noteId, n.parcelNo]).toEqual([5000, "nota-c", 2]);
    const g = documentGroups(d).byId.get("c")!;
    expect([g.labels.get("c"), g.labels.get("c2new")]).toEqual(["1/2", "2/2"]);
    expect(managedDocument(d, ref).parcels.reduce((s, p) => s + (p.amount ?? 0), 0)).toBe(15000);
  });
  it("nota com parcela paga preserva pagamentos e números existentes", () => {
    const d = fixture(), ref = { kind: "committed" as const, id: "a" }, doc = managedDocument(d, ref), pays = structuredClone(d.payments), b = structuredClone(d.committed[1]);
    applyManaged(d, { ref, before: doc.parcels, parcels: [...structuredClone(doc.parcels), { key: "a3", id: "a3", label: "3 (nova)", original: 0, amount: 100, date: "2027-02-01", extension: null, status: "ativo", paid: 0 }], fields: doc.fields, initialFields: doc.fields, reason: "x", at: "", by: "" });
    expect(d.payments).toEqual(pays); expect(d.committed[1]).toEqual(b); expect(d.committed.find((x) => x.id === "a3")?.parcelNo).toBe(3);
  });
});
