import { describe, expect, it } from "vitest";
import type { ScenarioData, Supplier } from "./engine/types";
import { applyMerge, classifyConditionName, principalOf, proposeUnification, revertMerge } from "./supplierUnification";
import { resolveSupplier, filterSuppliers } from "./fornecedores";

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
    expect(g("ADIDAS").status).toBe("pendente");
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
    const original = structuredClone(d.suppliers.find((s) => s.id === "a")!);
    const t = applyMerge(d, g, { requestId: "r1", at: "2026-11-24T00:00:00Z", by: "t" })!;
    expect(d.committed.map((c) => [c.id, c.value])).toEqual(before.committed.map((c) => [c.id, c.value]));
    expect(d.committed.filter((c) => c.supplierId === "a").map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(d.committed.find((c) => c.id === "c3")!.supplierId).toBe("nr");
    const a = d.suppliers.find((s) => s.id === "a")!;
    expect(a.conditions!.filter((c) => c.kind === "padrao")).toHaveLength(1);
    expect(a.conditions!.find((c) => c.kind === "simulacao")!.periods).toEqual([]);
    expect(applyMerge(d, g, { requestId: "r1", at: "x", by: "t" })).toBeNull();
    expect(principalOf(d, "a4")).toBe("a");
    expect(resolveSupplier(d, "ADIDAS SIMULAÇÃO")!.id).toBe("a");
    expect(filterSuppliers(d, "adidas").map((s) => s.id)).toEqual(["a"]);
    revertMerge(d, t, original);
    expect(d).toEqual(before);
  });
});
