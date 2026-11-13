import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import { computeFlow } from "./engine/engine";
import { linkSupplierIdentities, resolveSupplierLinks, supplierIdentity, supplierIdentityOptions } from "./supplierIdentity";
import { computeDashboard, openTitles } from "./engine/dashboard";
import { titlesReport } from "./dashboardReport";
import { buildConsulta, filterConsulta, groupByDocument, EMPTY_FILTER, consultaCells } from "../components/Consultas";
import { reportCSV } from "./reportTable";

describe("supplier identity without financial relinking", () => {
  it("links only exact aliases and numeric-prefixed evidence, not brand/legal-name similarity", () => {
    const d = emptyData(); d.suppliers = [{ id: "s", name: "Marca", aliases: ["Empresa Ltda"], group: "", terms: [30] }];
    d.committed = ["123 - Empresa Ltda", "émpresa ltda", "Marca Brasil Ltda"].map((sourceSupplier, i) => ({ id: `${i}`, supplierId: "", sourceSupplier, value: 100, status: "ativo", dueDate: "2026-11-13", document: "" } as never));
    const r = resolveSupplierLinks(d);
    expect(r.counts.committed).toBe(2); expect(r.data.committed.map((c) => c.supplierId)).toEqual(["s", "s", ""]);
    expect(d.committed.every((c) => !c.supplierId)).toBe(true);
    d.suppliers.push({ id: "generic", name: "OUTROS", group: "", terms: [] });
    d.committed.push({ ...d.committed[0], id: "generic-title", supplierId: "", sourceSupplier: "OUTROS" } as never);
    expect(resolveSupplierLinks(d).data.committed.at(-1)?.supplierId).toBe("");
  });
  it("keeps pending names distinct through ranking, filters, grouping and export with unchanged global totals", () => {
    const d = emptyData(); d.params.startDate = "2026-11-13";
    d.committed = ["Álfa Ltda", "Beta Ltda", ""].map((sourceSupplier, i) => ({ id: `${i}`, supplierId: "", sourceSupplier, value: [200, 100, 50][i], status: "ativo", dueDate: "2026-11-13", document: "", categoryId: "", purchaseCode: "" } as never));
    const flow = computeFlow(d, { start: "2026-11-13", end: "2026-11-13" });
    const dashboard = computeDashboard(d, flow, "2026-11-13", { start: "2026-11-13", end: "2026-11-13" });
    expect(dashboard.ranking.map((r) => r.supplier)).toEqual(["Álfa Ltda", "Beta Ltda", "Sem fornecedor"]);
    expect(dashboard.cards.find((c) => c.key === "top")?.value).toBe(200);
    expect(dashboard.cards.find((c) => c.key === "total")?.value).toBe(350);
    const report = titlesReport(d, openTitles(d)); expect(report.groups).toHaveLength(3); expect(report.total).toBe(350);
    const key = supplierIdentity(d, d.committed[0]).key;
    expect(openTitles(d, { supplierId: key })).toHaveLength(1);
    expect(computeFlow(d, { start: "2026-11-13", end: "2026-11-13", filter: { supplierId: key } }).days[0]?.comprometida).toBe(200);
    const rows = buildConsulta(d); expect(groupByDocument(rows)).toHaveLength(3);
    expect(filterConsulta(rows, { ...EMPTY_FILTER, supplier: key }).map((r) => r.supplier)).toEqual(["Álfa Ltda"]);
    expect(reportCSV(["Fornecedor"], rows.map((r) => [consultaCells(r)[0] ?? ""]))).toContain("Álfa Ltda");
    expect(supplierIdentityOptions(d).map((r) => r.key)).toContain(key);
  });
  it("reads the original supplier column only for known source layouts and groups linked aliases by real ID", () => {
    const d = emptyData(); d.suppliers = [{ id: "s", name: "Principal", group: "", terms: [] }];
    expect(supplierIdentity(d, { supplierId: "s", sourceSupplier: "Apelido" })).toEqual({ key: "s", name: "Principal", pending: false });
    expect(supplierIdentity(d, { importOrigin: { sheet: "Lançamentos", raw: ["", "", "", "Histórico"] } }).name).toBe("Histórico");
    expect(supplierIdentity(d, { importOrigin: { sheet: "desconhecida", raw: ["não é fornecedor"] } }).name).toBe("Sem fornecedor");
  });
  it("preserves both confirmed POLO GO conditions and the original source name", () => {
    const d = emptyData();
    d.suppliers = [{ id: "p", name: "POLO GO", group: "", terms: [102, 132, 162], conditions: [{ id: "c1", name: "original", terms: [102, 132, 162], from: null, at: "", by: "" }] }, { id: "q", name: "POLO GO A PARTIR DE 02/2026 CONT.2026", group: "", terms: [120, 150, 180], conditions: [{ id: "c2", name: "nova", terms: [120, 150, 180], from: null, at: "", by: "" }] }];
    const r = linkSupplierIdentities(d, [["q", "p"]]);
    expect(r.data.suppliers).toHaveLength(1);
    expect(r.data.suppliers[0]?.conditions?.map((c) => c.terms)).toEqual([[102,132,162],[120,150,180]]);
    expect(r.data.suppliers[0]?.aliases).toContain("POLO GO A PARTIR DE 02/2026 CONT.2026");
  });
  it("links MASH with exact source terms and no financial difference", () => {
    const d = emptyData(); d.params.startDate = "2026-01-01";
    d.suppliers = [{ id: "m", name: "MASH", terms: [90,120,150], group: "" }];
    d.planned = [{ id: "p", supplierId: "", sourceSupplier: "mÁsh", purchaseCode: "", document: "", value: 960666.7, baseDate: "2026-01-01", categoryId: "", notes: "", status: "ativo", terms: [30,60], remainingOverride: null, origin: { file: "source", sheet: "planned", row: 1 } }];
    const r = linkSupplierIdentities(d, []);
    expect(r.counts.planned).toBe(1);
    expect(r.data.planned[0]).toEqual({ ...d.planned[0], supplierId: "m" });
    const opt = { start: "2026-01-01", end: "2026-05-01" };
    expect(computeFlow(r.data,opt).days.map((day)=>({...day,items:[]}))).toEqual(computeFlow(d,opt).days.map((day)=>({...day,items:[]})));
  });
  it("blocks supplier fallback and leaves ambiguous identities unlinked", () => {
    const d = emptyData();d.suppliers = [{id:"a",name:"MASH",terms:[30],group:""},{id:"b",name:"mash",terms:[60],group:""}];
    d.planned=[{id:"p",supplierId:"",sourceSupplier:"MASH",purchaseCode:"",document:"",value:0,baseDate:"",categoryId:"",notes:"",status:"ativo",remainingOverride:null}];
    expect(linkSupplierIdentities(d,[]).counts.planned).toBe(0);
    d.suppliers.pop();expect(()=>linkSupplierIdentities(d,[])).toThrow("Vínculo exigiria prazos cadastrais");
  });
});