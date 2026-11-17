import { describe, expect, it } from "vitest";
import { emptyData, normalizeData } from "./engine/actions";
import { applyNote, type NoteDraft } from "./notas";
import { applyManaged, managedDocument } from "./manageLaunch";
import { currentParcels, effectivateManual, initDraft } from "./efetivacao";
import { computeFlow } from "./engine/engine";
import { createLaunchPresentation } from "./launchPresentation";
import { queryIndexedReport, reportCSV } from "./reportTable";
import { buildConsulta, consultaCells } from "@/components/Consultas";
import { planVsActual } from "./planVsActual";
import { pvaExport } from "@/components/PlanVsActual";
import { applyOps, diffData } from "./diff";
import { dependenciesMatch, isolateOperation, operationDependencies, rebasePending } from "./operationSave";

function fixture(stage: NoteDraft["stage"] = "committed") {
  const d = emptyData();
  d.suppliers = [{ id: "s", name: "Teste", group: "", terms: [] }];
  d.categories = [{ id: "cat", kind: "compra", name: "Mercadoria", group: "" }];
  const n: NoteDraft = { stage, kind: "compra", categoryId: "cat", supplierId: "s", document: "XXXX", purchaseCode: "Pedido", description: "", total: 30000, baseDate: "2026-11-01", parcels: [
    { amount: 10000, date: "2026-11-10", ext: null, boletoNumber: "000XX-A/1" },
    { amount: 10000, date: "2026-11-20", ext: null, boletoNumber: "XXXXA2" },
    { amount: 10000, date: "2026-11-30", ext: null },
  ] };
  let i = 0; applyNote(d, n, { id: () => `id${++i}`, at: "2026-11-01T10:00:00Z" });
  return d;
}
function edit(d: ReturnType<typeof fixture>, kind: "committed" | "expense" | "planned", id: string, code: string | null) {
  const ref = { kind, id }, doc = structuredClone(managedDocument(d, ref));
  const parcels = doc.parcels.map((p, i) => i === 0 ? { ...p, boletoNumber: code } : p);
  applyManaged(d, { ref, beforeRecords: doc.records, before: doc.parcels, parcels, fields: doc.fields, initialFields: doc.fields, reason: "", at: "2026-11-17T13:34:00Z", by: "editor" });
}
describe("Número do boleto opcional por parcela", () => {
  it("cria três parcelas distintas/uma vazia sem trocar documento, IDs ou números automáticos", () => {
    const d = fixture();
    expect(d.committed.map(c => c.boletoNumber)).toEqual(["000XX-A/1", "XXXXA2", undefined]);
    expect(d.committed.map(c => [c.id, c.document, c.parcelNo])).toEqual([["id2", "XXXX", 1], ["id3", "XXXX", 2], ["id4", "XXXX", 3]]);
    expect(normalizeData(JSON.parse(JSON.stringify(d))).committed.map(c => c.boletoNumber)).toEqual(["000XX-A/1", "XXXXA2", undefined]);
  });
  it("efetivação parcial transfere só a correspondente; repartir não copia identificador", () => {
    const d = fixture("planned"), parcels = currentParcels(d, "id1");
    const first = parcels[0]; if (!first) throw new Error("Fixture incompleta");
    const dr = initDraft(parcels, [first.key]);
    expect(dr.eff.map(p => p.boletoNumber)).toEqual(["000XX-A/1"]);
    effectivateManual(d, { id: "ef", plannedId: "id1", at: "2026-11-17T10:00:00Z", effectiveDate: "2026-11-17", document: "NF", purchaseCode: "Pedido", selected: [first.key], eff: [{ amount: 5000, date: "2026-11-10", boletoNumber: dr.eff[0]?.boletoNumber }, { amount: 5000, date: "2026-11-11" }], rest: dr.rest.map(p => ({ id: p.id, amount: p.amount ?? 0, date: p.date ?? "", boletoNumber: p.boletoNumber })), substituted: 10000, rule: "Manual" });
    expect(d.committed.map(c => c.boletoNumber)).toEqual(["000XX-A/1", undefined]);
    expect(currentParcels(d, "id1").map(p => p.boletoNumber)).toEqual(["XXXXA2", undefined]);
    expect(pvaExport(planVsActual(d))).toContain("000XX-A/1");
  });
  for (const kind of ["committed", "expense"] as const) it(`corrige/limpa boleto pago em ${kind}, financeiro/baixas preservados e auditados`, () => {
    const d = fixture();
    if (kind === "expense") d.expenses.push({ id: "exp", supplierId: "s", categoryId: "cat", document: "361186A2", value: 10000.125, baseDate: "2026-11-10", termDays: 0, extensionDate: null, extensionHistory: [], status: "ativo", notes: "" });
    const id = kind === "expense" ? "exp" : "id2";
    d.payments.push({ id: "pay", titleKind: kind, titleId: id, amount: 10000, date: "2026-11-10", note: "", reversedAt: null, reversalNote: "" });
    const payments = structuredClone(d.payments), flow = computeFlow(d, { start: "2026-11-01", end: "2026-12-31" });
    const before = structuredClone(d);
    edit(d, kind, id, "000-A/2");
    const title = kind === "expense" ? d.expenses[0] : d.committed[0];
    expect(title?.boletoNumber).toBe("000-A/2");
    expect(title?.editLog?.at(-1)).toMatchObject({ by: "editor", at: "2026-11-17T13:34:00Z", note: "Número do boleto · Identificação da parcela", after: { boletoNumber: "000-A/2" } });
    expect(d.payments).toEqual(payments); expect(computeFlow(d, { start: "2026-11-01", end: "2026-12-31" })).toEqual(flow);
    if (kind === "committed") expect(d.committed.slice(1)).toEqual(before.committed.slice(1));
    edit(d, kind, id, null); expect(title?.boletoNumber).toBeNull(); expect(d.payments).toEqual(payments);
    const ref = { kind, id }, doc = managedDocument(d, ref);
    expect(() => applyManaged(d, { ref, before: doc.parcels, parcels: doc.parcels.map(p => ({ ...p, amount: 1 })), fields: doc.fields, initialFields: doc.fields, reason: "teste", at: "", by: "" })).toThrow("protegida");
  });
  it("identificação planejada não materializa nem recalcula e permanece por ID", () => {
    const d = fixture("planned"), before = structuredClone(d), flow = computeFlow(d, { start: "2026-11-01", end: "2026-12-31" });
    edit(d, "planned", "id1", "NOVO/01");
    expect(d.planned[0]?.installments).toEqual(before.planned[0]?.installments);
    expect(d.planned[0]?.remainingOverride).toBeNull(); expect(currentParcels(d, "id1")[0]?.boletoNumber).toBe("NOVO/01");
    expect(computeFlow(d, { start: "2026-11-01", end: "2026-12-31" })).toEqual(flow);
  });
  it("compatibilidade sem inferir 361186A2, valida tipo string sem converter número", () => {
    const d = fixture(); const c = d.committed[0]; if (!c) throw new Error(); delete c.boletoNumber; c.document = "361186A2";
    expect(normalizeData(d).committed[0]).not.toHaveProperty("boletoNumber");
    expect(() => normalizeData({ ...d, committed: [{ ...c, boletoNumber: 12 }] })).toThrow("texto");
  });
  it("busca/indexação e exportações retornam só parcela correta e invalidam em novo contexto", () => {
    const d = fixture(), old = createLaunchPresentation(d);
    expect(queryIndexedReport(old.committed, "000xx-a/1", null).map(r => r.row.t === "committed" ? r.row.c.id : r.row.e.id)).toEqual(["id2"]);
    edit(d, "committed", "id2", "NOVO-001");
    const next = createLaunchPresentation(normalizeData(d));
    expect(queryIndexedReport(next.committed, "000xx-a/1", null)).toHaveLength(0);
    expect(queryIndexedReport(next.committed, "novo-001", null)).toHaveLength(1);
    expect(queryIndexedReport(createLaunchPresentation(emptyData()).committed, "novo-001", null)).toHaveLength(0);
    expect(reportCSV(["boleto"], next.committed.map(r => [String(r.values[14])]))).toContain("NOVO-001");
    expect(buildConsulta(d).map(consultaCells).flat()).toContain("NOVO-001");
  });
  it("patch isolado relê identificação e preserva pendências independentes; conflito preserva rascunho", () => {
    const base = fixture(), pendingData = structuredClone(base); const other = pendingData.committed[1]; if (!other) throw new Error(); other.notes = "Pendência de outro registro";
    const pending = diffData(base, pendingData), reviewed = structuredClone(pendingData); edit(reviewed, "committed", "id2", "000-revisado");
    const ops = isolateOperation(pendingData, reviewed, pending), official = applyOps(base, ops, true).data;
    expect(official.committed[0]?.boletoNumber).toBe("000-revisado"); expect(official.committed[1]?.notes).toBe(""); expect(rebasePending(pending, ops)).toEqual(pending);
    expect(normalizeData(JSON.parse(JSON.stringify(official))).committed[0]?.boletoNumber).toBe("000-revisado");
    const op = { scope: "u:o", orgId: "o", requestId: "id", ops, dependencies: operationDependencies(pendingData, ops) };
    const concurrent = structuredClone(base); const c = concurrent.committed[0]; if (!c) throw new Error(); c.boletoNumber = "Letícia";
    expect(applyOps(concurrent, op.ops, true).conflicts).toHaveLength(1); expect(reviewed.committed[0]?.boletoNumber).toBe("000-revisado");
  });
});