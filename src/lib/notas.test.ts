import { describe, expect, it } from "vitest";
import { applyNote, editCommittedNote, editPlannedParcel, extendPlannedParcel, generateParcels, adjustLast, parcelsTotal, saveSupplierCondition, validateNote, type NoteDraft } from "@/lib/notas";
import { distributePlanned, computeFlow } from "@/lib/engine/engine";
import { effectivate, normalizeData, registerPayment } from "@/lib/engine/actions";
import { buildConsulta, groupByDocument } from "@/components/Consultas";
import type { ScenarioData } from "@/lib/engine/types";
import { demoData as demo } from "@/test/demoFixture";

let n = 0; const ids = { id: () => "id" + n++, at: "2026-11-10T12:00:00Z" };
const base = (): ScenarioData => normalizeData(structuredClone(demo()));
const draft = (d: ScenarioData, stage: NoteDraft["stage"], total = 100001, terms = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300]): NoteDraft => ({ stage, kind: "compra", categoryId: d.categories.find((c) => c.kind === "compra")!.id, supplierId: d.suppliers[0]!.id, purchaseCode: "PX", document: "NF-9", description: "teste", total, baseDate: "2026-10-01", parcels: generateParcels(total, "2026-10-01", terms) });

describe("Nova nota por parcela", () => {
  it("gera 10 parcelas com resíduo de centavos na última e total exato", () => {
    const p = generateParcels(100001, "2026-10-01", [30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(p.length).toBe(10); expect(p[0]!.amount).toBe(10000); expect(p[9]!.amount).toBe(10001); expect(parcelsTotal(p)).toBe(100001);
    expect(p[0]!.date).toBe("2026-10-31");
  });
  it("bloqueia diferença e dados obrigatórios; ajuste na última resolve", () => {
    const d = base(); const n0 = draft(d, "committed");
    const bad = { ...n0, parcels: n0.parcels.map((x, i) => (i === 0 ? { ...x, amount: x.amount + 5 } : x)) };
    expect(validateNote(bad)).toContain("Total das parcelas difere do valor da nota.");
    expect(validateNote({ ...bad, parcels: adjustLast(bad.parcels, 100001) })).toEqual([]);
    expect(validateNote({ ...n0, supplierId: "", baseDate: null }).length).toBe(2);
    expect(() => applyNote(d, bad, ids)).toThrow();
  });
  it("cancelar (não aplicar) não grava nada; efetivado gera 1 título por parcela", () => {
    const d = base(); const before = d.committed.length;
    draft(d, "committed"); expect(d.committed.length).toBe(before);
    applyNote(d, draft(d, "committed"), ids);
    const mine = d.committed.filter((c) => c.document === "NF-9");
    expect(mine.length).toBe(10); expect(mine.map((c) => c.parcelNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(mine.reduce((a, c) => a + c.value, 0)).toBe(100001);
  });
  it("prorrogação e pagamento ficam isolados na parcela; editar nota altera irmãs", () => {
    const d = base(); applyNote(d, draft(d, "committed"), ids);
    const mine = d.committed.filter((c) => c.document === "NF-9");
    d.committed.find((c) => c.id === mine[2]!.id)!.extensionDate = null;
    registerPayment(d, { id: "pg-nota-1", titleKind: "committed", titleId: mine[0]!.id, amount: 5000, date: "2026-10-31", note: "" });
    const rows = buildConsulta(d).filter((r) => r.document === "NF-9");
    expect(rows.filter((r) => r.paid > 0).length).toBe(1);
    editCommittedNote(d, mine[0]!.id, { document: "NF-10" });
    expect(d.committed.filter((c) => c.document === "NF-10").length).toBe(10);
    const g = groupByDocument(buildConsulta(d).filter((r) => r.document === "NF-10"));
    expect(g.length).toBe(1); expect(g[0]!.value).toBe(100001); expect(g[0]!.paid).toBe(5000); expect(g[0]!.state).toBe("Parcialmente pago");
  });
  it("planejada: prorrogar/editar uma parcela não muda as outras; histórico preservado", () => {
    const d = base(); applyNote(d, draft(d, "planned", 30000, [30, 60, 90]), ids);
    const pl = d.planned.at(-1)!;
    expect(() => extendPlannedParcel(d, pl.id, 1, "2026-12-15", "", ids.at)).toThrow();
    extendPlannedParcel(d, pl.id, 1, "2026-12-15", "acordo", ids.at);
    editPlannedParcel(d, pl.id, 2, { amount: 12000 });
    const dist = distributePlanned(pl, undefined, d.committed, d.params.profile, d.effectivations);
    expect(dist.parcels.map((p) => [p.date, p.amount])).toEqual([["2026-10-31", 10000], ["2026-12-15", 10000], ["2026-12-30", 12000]]);
    expect(pl.installments![1]!.extensionHistory.length).toBe(1); expect(pl.installments![0]!.extensionDate).toBeNull();
  });
  it("efetivação parcial de planejada por parcelas não duplica", () => {
    const d = base(); applyNote(d, draft(d, "planned", 30000, [30, 60, 90]), ids);
    const pl = d.planned.at(-1)!;
    effectivate(d, { id: "ef1", plannedId: pl.id, kind: "parcial", at: ids.at, installments: [{ value: 12000, date: "2026-11-05", document: "NF-E" }], remaining: null });
    const dist = distributePlanned(pl, undefined, d.committed, d.params.profile, d.effectivations);
    expect(dist.remaining).toBe(18000); expect(dist.parcels.map((p) => p.amount)).toEqual([8000, 10000]);
    const f = computeFlow(d, { start: "2026-10-01", end: "2027-01-31" });
    const sum = (src: string) => f.days.flatMap((x) => x.items).filter((i) => i.refId === pl.id || d.committed.some((c) => c.id === i.refId && c.plannedId === pl.id)).reduce((a, i) => a + (i.source === src ? i.amount : 0), 0);
    expect(sum("planejada") + sum("comprometida")).toBe(30000);
  });
  it("nota criada na simulação não grava no real", () => {
    const real = base(); const sim: ScenarioData = JSON.parse(JSON.stringify(real));
    applyNote(sim, draft(sim, "committed"), ids);
    expect(real.committed.some((c) => c.document === "NF-9")).toBe(false);
    expect(sim.committed.filter((c) => c.document === "NF-9").length).toBe(10);
  });
  it("salvar nova condição preserva histórico e congela previsões antigas", () => {
    const d = base(); const s = d.suppliers[0]!; const old = [...s.terms];
    const legacy = d.planned.filter((p) => p.supplierId === s.id && !p.terms);
    saveSupplierCondition(d, s.id, [15, 45], ids.at);
    expect(s.terms).toEqual([15, 45]); expect(s.termsHistory!.length).toBe(2);
    for (const p of legacy) expect(p.terms).toEqual(old);
  });
});
