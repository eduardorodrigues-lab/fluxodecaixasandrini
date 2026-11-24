import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import type { Committed } from "./engine/types";
import { computeFlow } from "./engine/engine";
import { documentGroups } from "./documentGroups";
import { managedDocument } from "./manageLaunch";
import { createLaunchPresentation } from "./launchPresentation";
import { buildConsulta } from "@/components/Consultas";
import { queryIndexedReport } from "./reportTable";

function fixture(base = "2409", supplier = "FOUR ALL PRIME CONFECCOES LTDA") {
  const d = emptyData();
  d.suppliers.push({ id: supplier, name: supplier, terms: [], group: "" });
  d.committed = [1, 2, 3].map((n): Committed => ({
    id: `${supplier}-${base}-${n}`, supplierId: supplier, sourceSupplier: supplier,
    purchaseCode: "", document: `${base}A${n}`, value: 163200,
    dueDate: ["2026-03-19", "2026-04-17", "2026-05-18"][n - 1] ?? "",
    extensionDate: n === 2 ? "2026-04-20" : null, extensionHistory: [], extensionInfo: "",
    legacyAbatement: null, origin: "legado", plannedId: null, effectivationId: null,
    categoryId: "", notes: "", status: "ativo", boletoNumber: `000${n}`,
    importOrigin: { file: "fonte.xlsm", sheet: "COMPRAS DIRETAS_EFETUADAS",
      row: [1424, 1908, 2511][n - 1] ?? 0,
      raw: [null, supplier, `${base}A${n}`, 46009, null, 1632, [46100, 46129, 46160][n - 1]] },
  }));
  return d;
}
function first(d: ReturnType<typeof fixture>) {
  const row = d.committed[0]; if (!row) throw new Error("Fixture vazia"); return row;
}

describe("Identificação derivada de parcelas importadas", () => {
  it("2409A1/A2/A3 = nota 2409, parcelas 1/3, 2/3, 3/3, mesmo sem pedido e em linhas distantes", () => {
    const d = fixture(), g = documentGroups(d).byId.get(first(d).id);
    expect(g?.document).toBe("2409");
    expect([...g?.labels.values() ?? []]).toEqual(["1/3", "2/3", "3/3"]);
    expect(g?.titles.map(c => c.document)).toEqual(["2409A1", "2409A2", "2409A3"]);
  });
  it("listagem, busca original, Consultas e Gerenciar reutilizam a mesma interpretação por ID", () => {
    const d = fixture(), list = createLaunchPresentation(d).committed, consulta = buildConsulta(d);
    expect(list.map(r => r.values[4])).toEqual(["2409", "2409", "2409"]);
    expect(queryIndexedReport(list, "2409A2", null).map(r => r.row.t === "committed" ? r.row.c.id : "")).toEqual([d.committed[1]?.id]);
    expect(consulta.map(r => [r.document, r.parcel])).toEqual([["2409", "1/3"], ["2409", "2/3"], ["2409", "3/3"]]);
    expect(managedDocument(d, { kind: "committed", id: first(d).id }).parcels.map(p => p.label)).toEqual(["1/3", "2/3", "3/3"]);
    expect(list.every(r => r.row.t === "committed" && d.committed.includes(r.row.c))).toBe(true);
  });
  it("mesmo número em fornecedores diferentes e fontes diferentes não mescla notas", () => {
    const d = fixture(), other = fixture("2409", "Outro fornecedor");
    d.committed.push(...other.committed);
    const anotherFile = fixture().committed.map(c => ({ ...c, id: `${c.id}-file`, importOrigin: c.importOrigin ? { ...c.importOrigin, file: "outra.xlsm" } : null }));
    d.committed.push(...anotherFile);
    const index = documentGroups(d);
    expect(index.byId.get(first(d).id)?.titles.map(c => c.id)).toEqual(d.committed.slice(0, 3).map(c => c.id));
    expect(index.byId.get(first(other).id)?.titles).toHaveLength(3);
    expect(index.byId.get(anotherFile[0]?.id ?? "")?.titles).toHaveLength(3);
  });
  it("notas distintas, zeros à esquerda, séries e datas de emissão diferentes permanecem distintas", () => {
    const d = fixture();
    d.committed.push(...fixture("02409").committed, ...fixture("2410").committed);
    const series = fixture().committed.map(c => ({ ...c, id: `${c.id}-series`, importOrigin: c.importOrigin ? { ...c.importOrigin, raw: ["OUTRA SÉRIE", c.sourceSupplier, c.document, 46009, null, 1632, c.importOrigin.raw?.[6]] } : null }));
    d.committed.push(...series);
    const later = fixture().committed.map(c => ({ ...c, id: `${c.id}-later`, importOrigin: c.importOrigin ? { ...c.importOrigin, raw: [null, c.sourceSupplier, c.document, 46010, null, 1632, c.importOrigin.raw?.[6]] } : null }));
    d.committed.push(...later);
    const index = documentGroups(d);
    expect(new Set(d.committed.map(c => index.byId.get(c.id)?.key)).size).toBe(5);
    expect(index.byId.get(first(fixture("02409")).id)?.document).toBe("02409");
  });
  for (const missing of [1, 2]) it(`parcela ${missing} ausente: não deduz total pelo maior sufixo`, () => {
    const d = fixture(); d.committed = d.committed.filter(c => !c.document.endsWith(`A${missing}`));
    const index = documentGroups(d);
    expect(index.ambiguous).toHaveLength(2);
    expect([...index.byId.values()].every(g => g.titles.length === 1 && g.document.includes("A"))).toBe(true);
  });
  it("duplicata de parcela não prova uma nota única", () => {
    const d = fixture(); d.committed.push({ ...first(d), id: "duplicada" });
    const index = documentGroups(d);
    expect(index.ambiguous).toHaveLength(4);
    expect(index.byId.get(first(d).id)?.titles).toHaveLength(1);
  });
  for (const invalid of ["source", "date", "suffix", "manual", "edited", "single", "rawDocument", "sameRow"] as const) it(`não interpreta sufixo arbitrário: ${invalid}`, () => {
    const d = fixture();
    if (invalid === "source") d.committed.forEach(c => { c.sourceSupplier = "Nome semelhante"; });
    if (invalid === "date") d.committed.forEach(c => { if (c.importOrigin?.raw) c.importOrigin.raw[3] = null; });
    if (invalid === "suffix") d.committed.forEach(c => { c.document = c.document.replace("A", "B"); if (c.importOrigin?.raw) c.importOrigin.raw[2] = c.document; });
    if (invalid === "manual") d.committed.forEach(c => { c.importOrigin = null; });
    if (invalid === "edited") d.committed.forEach(c => { c.document = "NOTA NOVA"; });
    if (invalid === "single") d.committed = [first(d)];
    if (invalid === "rawDocument") d.committed.forEach(c => { if (c.importOrigin?.raw) c.importOrigin.raw[2] = null; });
    if (invalid === "sameRow") d.committed.forEach(c => { if (c.importOrigin) c.importOrigin.row = 1424; });
    expect([...documentGroups(d).byId.values()].every(g => g.titles.length === 1)).toBe(true);
  });
  it("noteId existente prevalece; organizações/cenários são avaliados separadamente", () => {
    const d = fixture(); d.committed.forEach(c => { c.noteId = c.id; c.parcelNo = 1; c.parcelCount = 1; });
    expect([...documentGroups(d).byId.values()].every(g => g.titles.length === 1)).toBe(true);
    expect(documentGroups(emptyData()).byId.size).toBe(0);
  });
  it("normalização não muda IDs, raw, valores, datas, prorrogações, baixas, etapa ou totais do Fluxo", () => {
    const d = fixture();
    d.payments.push({ id: "p", titleKind: "committed", titleId: first(d).id, amount: 20000, date: "2026-03-19", note: "", reversedAt: null, reversalNote: "" });
    const before = structuredClone(d), flow = computeFlow(d, { start: "2025-01-01", end: "2030-12-31" });
    documentGroups(d); buildConsulta(d); createLaunchPresentation(d).committed; managedDocument(d, { kind: "committed", id: first(d).id });
    expect(d).toEqual(before);
    expect(d.committed.reduce((s, c) => s + c.value, 0)).toBe(489600);
    expect(computeFlow(d, { start: "2025-01-01", end: "2030-12-31" })).toEqual(flow);
  });
});