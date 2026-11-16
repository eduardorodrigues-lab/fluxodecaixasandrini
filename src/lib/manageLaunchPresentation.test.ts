import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import { managedDocument, type ManagedParcel } from "./manageLaunch";
import { eligiblePlanned, selectedPlanned, launchSummary } from "./manageLaunchPresentation";
import { effectivateManual } from "./efetivacao";

const ref = { kind: "planned" as const, id: "manchester" };
function fixture() {
  const d = emptyData();
  d.planned.push({ id: ref.id, supplierId: "s", categoryId: "cat", purchaseCode: "PROVISÃO2027-JULHO", document: "", notes: "", value: 62700, status: "ativo", baseDate: "2027-07-01", remainingOverride: null, installments: [1, 2, 3].map((n) => ({ amount: 20900, date: `2027-0${n + 6}-15`, extensionDate: null, extensionHistory: [] })) });
  return d;
}
describe("Seleção explícita do gerenciamento", () => {
  it("MANCHESTER 3×209: inicia vazia, seleciona uma/algumas/todas sem usar destaque", () => {
    const rows = managedDocument(fixture(), ref).parcels;
    expect(selectedPlanned(ref, rows, [])).toEqual([]);
    expect(selectedPlanned(ref, rows, [rows[0]?.key ?? ""]).map((p) => p.amount)).toEqual([20900]);
    expect(selectedPlanned(ref, rows, rows.slice(0, 2).map((p) => p.key)).reduce((s, p) => s + (p.amount ?? 0), 0)).toBe(41800);
    expect(selectedPlanned(ref, rows, rows.map((p) => p.key)).reduce((s, p) => s + (p.amount ?? 0), 0)).toBe(62700);
  });
  it("exclui pagas, canceladas, encerradas e efetivadas mesmo com chaves selecionadas", () => {
    const base = managedDocument(fixture(), ref).parcels[0]; if (!base) throw new Error();
    const rows: ManagedParcel[] = [base, { ...base, key: "paid", paid: 100 }, ...["cancelado", "encerrado", "efetivado"].map((status) => ({ ...base, key: status, status }))];
    expect(eligiblePlanned(ref, rows).map((p) => p.key)).toEqual([base.key]);
    expect(selectedPlanned(ref, rows, rows.map((p) => p.key)).map((p) => p.key)).toEqual([base.key]);
    expect(eligiblePlanned({ kind: "committed", id: "c" }, rows)).toEqual([]);
  });
  it("envia exatamente duas selecionadas ao caminho financeiro existente, sem pagamento", () => {
    const d = fixture(), rows = managedDocument(d, ref).parcels, chosen = selectedPlanned(ref, rows, rows.slice(0, 2).map((p) => p.key));
    effectivateManual(d, { id: "eff", plannedId: ref.id, at: "2026-11-16T16:36:00Z", effectiveDate: "2026-11-16", document: "", purchaseCode: "PROVISÃO2027-JULHO", selected: chosen.map((p) => p.key), eff: chosen.map((p) => ({ amount: p.amount ?? 0, date: p.date ?? "" })), rest: rows.slice(2).map((p) => ({ id: p.key, amount: p.amount ?? 0, date: p.date ?? "" })), substituted: 41800, rule: "Restante manual confirmado" });
    expect(d.committed.map((c) => c.value)).toEqual([20900, 20900]);
    expect(d.planned[0]?.remainingOverride?.value).toBe(20900);
    expect(d.payments).toEqual([]);
    const before = structuredClone(d), summary = launchSummary(d, ref, managedDocument(d, ref).parcels);
    expect(summary).toEqual({ effective: 41800, paid: 0, open: 41800, remaining: 20900, linkedTitles: 2 });
    expect(d).toEqual(before);
  });
});