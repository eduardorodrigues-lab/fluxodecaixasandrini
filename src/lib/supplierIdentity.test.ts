import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import { computeFlow } from "./engine/engine";
import { linkSupplierIdentities } from "./supplierIdentity";

describe("supplier identity without financial relinking", () => {
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