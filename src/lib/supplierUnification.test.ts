import { describe, expect, it } from "vitest";
import type { ScenarioData, Supplier } from "./engine/types";
import { applyMerge, classifyConditionName, cnpjCandidates, financialFingerprint, principalOf, proposeUnification, revertMerge, supplierFamily } from "./supplierUnification";
import { resolveSupplier, filterSuppliers, resolveSupplierStrict, resolveBySourceCode, buildSupplier, emptySupplierInput, createSupplierFull } from "./fornecedores";
import { currentCondition } from "./notas";

const T = (...t: number[]) => [...t, ...Array(10 - t.length).fill(null)] as (number | null)[];
const sup = (id: string, name: string, terms = T(), extra: Partial<Supplier> = {}): Supplier => ({ id, name, group: "", terms, ...extra });
const data = (suppliers: Supplier[], committed: { id: string; supplierId: string; value: number }[] = []) =>
  ({ suppliers, planned: [], committed, expenses: [], importLog: [], payments: [], effectivations: [] } as unknown as ScenarioData);
const base = () => data([
  sup("a", "ADIDAS", T(42, 56, 70)), sup("a1", "ADIDAS A PARTIR DE 08/06", T(58, 70, 84)), sup("a2", "ADIDAS SIMULAÇÃO", T(88, 100, 114)),
  sup("a3", "633 - ADIDAS DO BRASIL LTDA"), sup("a4", "Adidas do Brasil Ltda"),
  sup("nb", "NEW BALANCE", T(60, 90, 120)), sup("nb1", "NEW BALANCE A PARTIR DE MAIO/2026", T(90, 120, 150)), sup("nr", "335 - NEW BRASIL ARTIGOS"),
  sup("u", "UZ3 INDUSTRIAL (COLISÃO)", T(120)), sup("u1", "UZ3 INDUSTRIAL (COLISÃO) - CONDIÇÃO PRORROGADA SOMENTE DOS PEDIDOS 1728 E 1453", T(150)),
  sup("x", "MASH", T(90)), sup("x1", "MASH INDUSTRIA E COMERCIO"),
], [{ id: "c1", supplierId: "a3", value: 12345 }, { id: "c2", supplierId: "a1", value: 100 }, { id: "c3", supplierId: "nr", value: 777 }]);

describe("proposta de unificação", () => {
  const { groups } = proposeUnification(base());
  const g = (n: string) => groups.find((x) => x.principalName === n)!;
  it("ADIDAS agrupa razão social e condições, sem presumir ano ausente", () => {
    expect(g("ADIDAS").members.map((m) => m.id).sort()).toEqual(["a", "a1", "a2", "a3", "a4"]);
    const c = g("ADIDAS").members.find((m) => m.id === "a1")!.condition!;
    expect(c).toMatchObject({ from: null, missingYear: true, terms: T(58, 70, 84) });
    expect(g("ADIDAS").members.find((m) => m.id === "a2")!.condition!.kind).toBe("simulacao");
    expect(g("ADIDAS").conditionNotes.join()).toMatch(/sem ano/);
  });
  it("NEW BALANCE não absorve NEW BRASIL", () => {
    expect(g("NEW BALANCE").members.map((m) => m.id)).not.toContain("nr");
    expect(g("NEW BALANCE").members.find((m) => m.id === "nb1")!.condition!.from).toBe("2026-05-01");
  });
  it("colisão UZ3 fica pendente", () => expect(g("UZ3 INDUSTRIAL (COLISÃO)").status).toBe("pendente"));
  it("semelhança por prefixo não é alta confiança", () => expect(g("MASH").members.find((m) => m.id === "x1")!.confidence).toBe("revisao"));
  it("conta relações e centavos", () => expect(g("ADIDAS").relations).toMatchObject({ committed: 2, committedCents: 12445 }));
  it("CNPJs diferentes nunca são unidos pela proposta", () => {
    const d = data([sup("p", "KLIN", T(30)), sup("q", "Klin", T(30), { cnpj: "1" }), sup("r", "KLIN", T(30), { cnpj: "2" })]);
    expect(proposeUnification(d).groups.flatMap((x) => x.members.map((m) => m.id))).not.toEqual(expect.arrayContaining(["q", "r"]));
  });
});

describe("classificação de condição", () => {
  it("especial e simulação nunca padrão", () => {
    expect(classifyConditionName("CONDIÇÃO ÚNICA DE OPORTUNIDADE").kind).toBe("especial");
    expect(classifyConditionName("SIMULAÇÃO").kind).toBe("simulacao");
    expect(classifyConditionName("A PARTIR DE 18/03/2026 MUDAMOS").from).toBe("2026-03-18");
  });
});

describe("aplicação (fixture) — invariância, idempotência e reversão", () => {
  it("só muda supplierId; incorporados viram redirecionamento; rerun não duplica; revert restaura", () => {
    const d = base(); const before = structuredClone(d);
    const g = proposeUnification(d).groups.find((x) => x.principalName === "ADIDAS")!;
    const t = applyMerge(d, g, { requestId: "r1", at: "2026-11-24T00:00:00Z", by: "t" })!;
    expect(d.committed.map((c) => [c.id, c.value])).toEqual(before.committed.map((c) => [c.id, c.value]));
    expect(d.committed.filter((c) => c.supplierId === "a").map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(d.committed.find((c) => c.id === "c3")!.supplierId).toBe("nr");
    const a = d.suppliers.find((s) => s.id === "a")!;
    expect(a.conditions!.filter((c) => c.id !== "a-orig").every((c) => c.periods!.length === 0)).toBe(true);
    expect(currentCondition(a, "2026-11-24")!.id).toBe("a-orig"); // padrão pré-existente intocado; nenhuma incorporada vira vigente
    expect(financialFingerprint(d)).toBe(financialFingerprint(before));
    expect(applyMerge(d, g, { requestId: "r1", at: "x", by: "t" })).toBeNull();
    expect(principalOf(d, "a4")).toBe("a");
    expect(resolveSupplier(d, "ADIDAS SIMULAÇÃO")!.id).toBe("a");
    expect(filterSuppliers(d, "adidas").map((s) => s.id)).toEqual(["a"]);
    revertMerge(d, t);
    expect(d).toEqual(before);
  });
});

describe("revisão do mapeamento (regras de Eduardo)", () => {
  const d0 = () => data([sup("b", "BLACK FREE", T(30, 60)), sup("b1", "BLACK FREE CALÇADOS LTDA"), sup("dj", "DJM TEX", T(60)), sup("dj1", "DJM Tex - Será pago para FIDC", T(60)),
    sup("e", "ENERGY", T(90)), sup("e1", "Energy Ind. E Com. De Calçados Ltda", T(30)),
    sup("v", "VRG", T(120)), sup("v1", "VRG COM TEC CONFEC E VAR LTDA - TED Vrg Banco Itaú Cnpj 30.250.787/0001-00"), sup("v2", "VRG A PARTIR DE 10/2026", T(120, 150, 180))]);
  const g = (n: string) => proposeUnification(d0()).groups.find((x) => x.principalName === n)!;
  it("razão social nunca vira condição vazia", () => { const m = g("BLACK FREE").members.find((x) => x.id === "b1")!; expect(m.role).toBe("variante_nome"); expect(m.condition).toBeUndefined(); });
  it("FIDC é instrução de pagamento, não prazo", () => { const m = g("DJM TEX").members.find((x) => x.id === "dj1")!; expect(m.role).not.toBe("condicao"); expect(m.paymentInstruction).toMatch(/FIDC/); });
  it("nome jurídico com prazos próprios gera conflito explícito sem escolher ganhador", () => expect(g("ENERGY").conditionConflicts.length).toBe(1));
  it("CNPJ embutido vira candidato validado, não aplicado", () => { expect(g("VRG").cnpjCandidates).toEqual([{ id: "v1", cnpj: "30250787000100", valid: expect.any(Boolean) }]); expect(cnpjCandidates("11.111.111/1111-11")[0]!.valid).toBe(false); });
  it("vigência da fonte não é aplicada na união (sem padrão automático)", () => {
    const d = d0(); const gr = proposeUnification(d).groups.find((x) => x.principalName === "VRG")!; applyMerge(d, gr, { requestId: "r", at: "2026-11-24T00:00:00Z", by: "t" });
    const v = d.suppliers.find((s) => s.id === "v")!; expect(currentCondition(v, "2027-01-01")!.terms).toEqual(T(120)); expect(v.cnpj).toBeUndefined();
  });
  it("rollback preserva trabalho posterior (não restaura backup cegamente)", () => {
    const d = d0(); const gr = proposeUnification(d).groups.find((x) => x.principalName === "VRG")!; const t = applyMerge(d, gr, { requestId: "r", at: "x", by: "t" })!;
    const v = d.suppliers.find((s) => s.id === "v")!; v.note = "editado depois"; v.aliases!.push("VRG NOVO");
    revertMerge(d, t); expect(v.note).toBe("editado depois"); expect(v.aliases).toEqual(["VRG NOVO"]); expect(d.suppliers.find((s) => s.id === "v1")!.mergedInto).toBeUndefined();
  });
  it("resumo agrega família sem duplicar; resolução ambígua vai à revisão; código exige fonte", () => {
    const d = base(); const gr = proposeUnification(d).groups.find((x) => x.principalName === "ADIDAS")!; applyMerge(d, gr, { requestId: "r", at: "x", by: "t" });
    expect([...supplierFamily(d, "a3")].sort()).toEqual(["a", "a1", "a2", "a3", "a4"]);
    expect(resolveSupplierStrict(d, "adidas do brasil ltda")).toEqual({ status: "ok", id: "a" });
    const amb = data([sup("p", "X", T(), { aliases: ["ZETA"] }), sup("q", "ZETA")]); expect(resolveSupplierStrict(amb, "zeta").status).toBe("ambiguo");
    const sc = data([sup("p", "P", T(), { sourceCodes: [{ source: "FLUXO xlsm", code: "633" }] })]);
    expect(resolveBySourceCode(sc, "FLUXO xlsm", "633")).toEqual({ status: "ok", id: "p" }); expect(resolveBySourceCode(sc, "ERP", "633").status).toBe("nenhum");
  });
});
describe("cadastro completo de fornecedor", () => {
  const at = "2026-11-24T12:00:00Z";
  it("CNPJ opcional; condição sem início não vira padrão; nada inventado", () => {
    const d = data([]); const s = createSupplierFull(d, "n", { ...emptySupplierInput("NOVA"), conditions: [{ name: "Padrão 30/60", terms: [30, 60], from: null, note: "" }] }, at, "t");
    expect(s.cnpj).toBeUndefined(); expect(s.legalName).toBeUndefined(); expect(s.terms).toEqual([]); expect(currentCondition(s, "2026-11-24")).toBeNull();
  });
  it("condição exige nome e prazo; CNPJ inválido e duplicado recusados; código exige origem", () => {
    const d = data([sup("o", "OUTRA", T(), { cnpj: "30250787000100" })]);
    expect(() => buildSupplier(d, "n", { ...emptySupplierInput("N"), conditions: [{ name: "", terms: [null], from: null, note: "" }] }, at, "t")).toThrow(/nome/);
    expect(() => buildSupplier(d, "n", { ...emptySupplierInput("N"), cnpj: "123" }, at, "t")).toThrow(/14/);
    expect(() => buildSupplier(d, "n", { ...emptySupplierInput("N"), cnpj: "30.250.787/0001-00" }, at, "t")).toThrow(/já cadastrado/);
    expect(() => buildSupplier(d, "n", { ...emptySupplierInput("N"), sourceCode: "1" }, at, "t")).toThrow(/origem/);
  });
  it("vigência explícita define condição vigente só a partir da data", () => {
    const s = buildSupplier(data([]), "n", { ...emptySupplierInput("N"), conditions: [{ name: "A partir de dez", terms: [45], from: "2026-12-01", note: "" }] }, at, "t");
    expect(currentCondition(s, "2026-11-30")).toBeNull(); expect(currentCondition(s, "2026-12-01")!.name).toBe("A partir de dez");
  });
});
