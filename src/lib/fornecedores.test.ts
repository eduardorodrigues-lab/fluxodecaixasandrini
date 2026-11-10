import { describe, expect, it } from "vitest";
import { applyNote, generateParcels, addSupplier, addSupplierCondition } from "@/lib/notas";
import { deleteSupplier, editSupplier, filterSuppliers, resolveSupplier, setSupplierActivity, supplierActive } from "@/lib/fornecedores";
import { normalizeData } from "@/lib/engine/actions";
import { demoData } from "@/test/demoFixture";
import type { ScenarioData } from "@/lib/engine/types";
const base = (): ScenarioData => normalizeData(structuredClone(demoData()));
describe("Cadastro de fornecedores", () => {
  it("edita nome e apelidos mantendo identificador e busca o mesmo cadastro", () => {
    const d = base(); const s = d.suppliers[0]!; const id = s.id;
    editSupplier(d, id, { name: "Empresa Exemplo Ltda.", aliases: ["Marca Exemplo", "Exemplo Calçados"], note: "x" });
    expect(s.id).toBe(id); expect(resolveSupplier(d, "exemplo calcados")?.id).toBe(id);
  });
  it("alerta colisão de nome ou apelido sem unir cadastros", () => {
    const d = base(); const [a, b] = d.suppliers; const n = d.suppliers.length;
    editSupplier(d, a!.id, { name: a!.name, aliases: ["Marca Única"], note: "" });
    expect(() => editSupplier(d, b!.id, { name: b!.name, aliases: ["marca unica"], note: "" })).toThrow(/já associado/);
    expect(d.suppliers.length).toBe(n);
  });
  it("inativo a partir da data não aceita novo lançamento e pode ser reativado", () => {
    const d = base(); const s = d.suppliers[0]!;
    setSupplierActivity(d, s.id, false, "2026-11-10", "2026-11-09T12:00:00Z", "ana");
    expect(supplierActive(s, "2026-11-09")).toBe(true); expect(supplierActive(s, "2026-11-10")).toBe(false);
    const n = { stage: "planned" as const, kind: "compra" as const, categoryId: d.categories[0]!.id, supplierId: s.id, purchaseCode: "", document: "", description: "", total: 1000, baseDate: "2026-11-10", parcels: generateParcels(1000, "2026-11-10", [0]) };
    expect(() => applyNote(d, n, { id: () => "x", at: "2026-11-10T12:00:00Z" })).toThrow(/inativo/);
    setSupplierActivity(d, s.id, true, "2026-11-11", "2026-11-10T12:00:00Z", "ana");
    expect(supplierActive(s, "2026-11-11")).toBe(true); expect(s.activity?.length).toBe(2);
  });
  it("busca filtra por nome e apelido, ignorando maiúsculas e acentos, e respeita inatividade", () => {
    const d = base(); const s = d.suppliers[0]!;
    editSupplier(d, s.id, { name: "Açúcar do Vale Ltda.", aliases: ["Vale Doce"], note: "" });
    expect(filterSuppliers(d, "acucar").map((x) => x.id)).toContain(s.id); // sem acento
    expect(filterSuppliers(d, "VALE DOCE").map((x) => x.id)).toContain(s.id); // apelido, maiúsculas
    expect(filterSuppliers(d, "").length).toBe(d.suppliers.length); // lista completa ao clicar
    expect(filterSuppliers(d, "zzz-inexistente")).toHaveLength(0); // "Nenhum fornecedor encontrado"
    setSupplierActivity(d, s.id, false, "2026-11-10", "2026-11-09T12:00:00Z", "ana");
    expect(filterSuppliers(d, "vale", { date: "2026-11-10" }).map((x) => x.id)).not.toContain(s.id); // novo lançamento: só ativos
    expect(filterSuppliers(d, "vale", { includeInactive: true }).map((x) => x.id)).toContain(s.id); // consultas: inclui inativos
  });
  it("exclui somente sem condições ou lançamentos vinculados", () => {
    const d = base(); addSupplier(d, { id: "livre", name: "Criado por engano", note: "" }); deleteSupplier(d, "livre");
    expect(d.suppliers.some((s) => s.id === "livre")).toBe(false);
    addSupplier(d, { id: "cond", name: "Com condição", note: "" }); addSupplierCondition(d, "cond", { name: "À vista", terms: [0], from: null }, "2026-11-10T12:00:00Z", "ana", "2026-11-10");
    expect(() => deleteSupplier(d, "cond")).toThrow(/Inativar/); expect(d.suppliers.some((s) => s.id === "cond")).toBe(true);
    const used = d.planned[0]!.supplierId; expect(() => deleteSupplier(d, used)).toThrow(/lançamentos/);
  });
});
