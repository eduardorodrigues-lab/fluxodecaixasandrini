import { describe, expect, it } from "vitest";
import type { ScenarioData, Supplier } from "./engine/types";
import { applyManualMerge, mergeStateDigest, resolveSimulationRedirects, reviewManualMerge, revertManualMerge, validateMergeOps, type ManualMergeRequest } from "./manualMerge";
import { prepareCommit } from "./commitCore";
import { diffData, applyOps } from "./diff";
import { financialFingerprint, supplierFamily } from "./supplierUnification";
import { filterSuppliers, resolveSupplier, resolveSupplierStrict } from "./fornecedores";
import { currentCondition } from "./notas";
import { normalizeData } from "./engine/actions";
import { canCommitRole, pickOrg, SHARED_ORG_ID } from "./team";

const T = (...t: number[]) => [...t, ...Array(10 - t.length).fill(null)] as (number | null)[];
const sup = (id: string, name: string, terms = T(), extra: Partial<Supplier> = {}): Supplier => ({ id, name, group: "", terms, ...extra });
const fx = () => normalizeData({
  suppliers: [
    sup("p", "FOUR ALL", T(30, 60), { conditions: [{ id: "c0", name: "Original", terms: T(30, 60), from: null, at: "", by: "" }] }),
    sup("q", "788 FOUR ALL PRIME", T(45), { legalName: "FOUR ALL PRIME CONFECCOES LTDA", sourceCodes: [{ source: "FLUXO xlsm", code: "788" }],
      conditions: [{ id: "k1", name: "A PARTIR DE 17/03", terms: T(45, 75), from: "2026-03-17", at: "", by: "", kind: "especial", scope: "pedidos 1728", note: "obs" }] }),
    sup("r", "Four All", T()), sup("z", "OUTRA EMPRESA", T(10)),
  ],
  planned: [], committed: [
    { id: "t1", supplierId: "q", purchaseCode: "1", document: "2409", value: 12001, dueDate: "2026-12-01", payments: [] },
    { id: "t2", supplierId: "p", purchaseCode: "2", document: "9", value: 500, dueDate: "2026-12-02", payments: [] },
    { id: "t3", supplierId: "z", purchaseCode: "3", document: "1", value: 700, dueDate: "2026-12-03", payments: [] },
  ], expenses: [{ id: "e1", supplierId: "", document: "Four All", value: 99, baseDate: "2026-12-01" }],
  payments: [{ id: "pg1", refId: "t1", amount: 1000, date: "2026-11-20" }], receipts: [], importLog: [], effectivations: [],
} as unknown as ScenarioData);
const req = (o: Partial<ManualMergeRequest> = {}): ManualMergeRequest => ({ requestId: "11111111-1111-1111-1111-111111111111", at: "2026-11-24T00:00:00Z", by: "eduardo@x", principalId: "p", ids: ["p", "q", "r"], finalName: "FOUR ALL", reason: "mesma empresa comprovada", defaultDecision: "manter_principal", cnpjDecision: null, acknowledged: [], ...o });
const merged = (d = fx(), o: Partial<ManualMergeRequest> = {}) => { const c = structuredClone(d); applyManualMerge(c, req(o)); return c; };

describe("unificação manual por IDs exatos", () => {
  it("repõe vínculos só dos selecionados, mantém IDs/valores/pagamentos e totais iguais", () => {
    const d = fx(); const c = merged(d);
    expect(c.committed.map((x) => [x.id, x.supplierId, x.value])).toEqual([["t1", "p", 12001], ["t2", "p", 500], ["t3", "z", 700]]);
    expect(financialFingerprint(c)).toBe(financialFingerprint(d));
    expect(c.payments).toEqual(d.payments);
    expect([...supplierFamily(c, "p")].sort()).toEqual(["p", "q", "r"]);
  });
  it("não une por nome: 'Four All' fora da seleção não entra", () => {
    const c = merged(fx(), { ids: ["p", "q"] });
    expect(c.suppliers.find((s) => s.id === "r")!.mergedInto).toBeUndefined();
  });
  it("condições preservadas com nome/prazos/tipo/escopo e SEM vigência; padrão do principal mantido", () => {
    const c = merged(); const p = c.suppliers.find((s) => s.id === "p")!;
    const k = p.conditions!.find((x) => x.name === "A PARTIR DE 17/03")!;
    expect(k).toMatchObject({ terms: T(45, 75), kind: "especial", scope: "pedidos 1728", periods: [] });
    expect(k.note).toMatch(/2026-03-17/);
    expect(currentCondition(p, "2026-11-24")!.id).toBe("c0");
    expect(c.suppliers.find((s) => s.id === "q")!.conditions![0]!.from).toBe("2026-03-17"); // original intacta
  });
  it("título antigo nunca é recalculado pela condição", () => {
    const d = fx(); const c = merged(d);
    expect(JSON.stringify(c.committed.map(({ supplierId: _s, ...r }) => r))).toBe(JSON.stringify(d.committed.map(({ supplierId: _s, ...r }) => r)));
  });
  it("exige decisão de padrão, justificativa e principal entre os selecionados", () => {
    expect(() => merged(fx(), { defaultDecision: null })).toThrow(/padrão/);
    expect(() => merged(fx(), { reason: " " })).toThrow(/justificativa/);
    expect(() => merged(fx(), { principalId: "z" })).toThrow();
  });
  it("CNPJ divergente exige escolha explícita; código de mesma origem divergente exige confirmação", () => {
    const d = fx(); d.suppliers[0]!.cnpj = "11.111.111/0001-11"; d.suppliers[1]!.cnpj = "22.222.222/0001-22";
    expect(() => merged(d)).toThrow(/CNPJ/);
    expect(merged(d, { cnpjDecision: "11111111000111" }).suppliers[0]!.cnpj).toBe("11.111.111/0001-11");
    const e = fx(); e.suppliers[0]!.sourceCodes = [{ source: "FLUXO xlsm", code: "999" }];
    expect(() => merged(e)).toThrow(/Códigos/);
    expect(() => merged(e, { acknowledged: ["codigo:FLUXO XLSM"] })).not.toThrow();
    const f = fx(); f.suppliers[0]!.sourceCodes = [{ source: "OUTRA FONTE", code: "999" }];
    expect(() => merged(f)).not.toThrow(); // mesmo número em outra fonte não é conflito nem identidade
  });
  it("revisão: incorporados, conflitos, despesa sem vínculo como pendência, finanças iguais", () => {
    const r = reviewManualMerge(fx(), ["p", "q", "r"], "p", "FOUR ALL", "2026-11-24");
    expect(r.conflicts.filter((c) => c.blocking)).toEqual([]);
    expect(r.total).toMatchObject({ committed: 2, committedCents: 12501 });
    expect(r.unlinkedExpenses.map((e) => e.id)).toEqual(["e1"]);
    expect(r.financeEqual).toBe(true);
    expect(reviewManualMerge(fx(), ["p"], "p", "X", "2026-11-24").conflicts.some((c) => c.code === "minimo")).toBe(true);
  });
  it("incorporado sai da lista de ativos; nome histórico resolve ao principal; ambíguo vai à revisão", () => {
    const c = merged();
    expect(filterSuppliers(c, "four").map((s) => s.id)).toEqual(["p"]);
    expect(resolveSupplier(c, "788 FOUR ALL PRIME")!.id).toBe("p");
    expect(resolveSupplierStrict(c, "788 FOUR ALL PRIME")).toEqual({ status: "ok", id: "p" });
    const d = fx(); d.suppliers.push(sup("w", "FOUR ALL")); expect(resolveSupplierStrict(d, "FOUR ALL").status).toBe("ambiguo");
  });
  it("reversão desfaz só a trilha e preserva trabalho posterior", () => {
    const d = fx(); const c = merged(d);
    c.committed.push({ ...c.committed[0]!, id: "t9", supplierId: "p" });
    c.committed[1]!.supplierId = "z"; // alterado depois
    const kept = revertManualMerge(c, "p", req().requestId);
    expect(c.committed.find((x) => x.id === "t1")!.supplierId).toBe("q");
    expect(c.committed.find((x) => x.id === "t9")!.supplierId).toBe("p");
    expect(c.suppliers.every((s) => !s.mergedInto)).toBe(true);
    expect(c.suppliers[0]!.name).toBe("FOUR ALL");
    expect(c.suppliers[0]!.conditions!.map((x) => x.id)).toEqual(["c0"]);
    expect(kept).toEqual([]);
  });
  it("simulação antiga resolve redirecionamentos da mesma base sem tocar o real", () => {
    const sim = fx(); const off = merged();
    expect(resolveSimulationRedirects(sim, off)).toBe(1);
    expect(sim.committed[0]!.supplierId).toBe("p");
    expect(off.committed[0]!.supplierId).toBe("p");
  });
});

describe("servidor: validação contra payload manipulado e concorrência", () => {
  const org = SHARED_ORG_ID; const rid = "22222222-2222-2222-2222-222222222222";
  it("operação legítima passa; replay aplicado é no-op (idempotência de conteúdo)", async () => {
    const d = fx(); const ops = diffData(d, merged(d));
    const r = await prepareCommit(d, org, rid, ops, undefined, "eduardo@x");
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(financialFingerprint(r.next)).toBe(financialFingerprint(d));
    expect((await prepareCommit(r.next, org, rid, ops, undefined, "eduardo@x")).status).not.toBe("ready");
  });
  it("payload manipulado (vínculo extra, usuário diferente, só mergedInto) é recusado", async () => {
    const d = fx(); const after = merged(d); after.committed[2]!.supplierId = "p";
    expect((await prepareCommit(d, org, rid, diffData(d, after), undefined, "eduardo@x")).status).toBe("conflict");
    expect((await prepareCommit(d, org, rid, diffData(d, merged(d)), undefined, "leticia@x")).status).toBe("conflict");
    const only = structuredClone(d); only.suppliers[1]!.mergedInto = "p";
    expect(validateMergeOps(d, diffData(d, only), null)).toMatch(/fora do procedimento/);
    const fake = merged(d); fake.suppliers[1]!.mergedInto = "z";
    expect(validateMergeOps(d, diffData(d, fake), null)).toBeTruthy();
  });
  it("vínculo novo após a revisão (outra sessão) recusa sem gravação parcial", async () => {
    const d = fx(); const ops = diffData(d, merged(d)); const digest = mergeStateDigest(d, ["p", "q", "r"]);
    const other = structuredClone(d); other.committed.push({ ...d.committed[0]!, id: "t5", supplierId: "r" });
    expect(mergeStateDigest(other, ["p", "q", "r"])).not.toBe(digest);
    const r = await prepareCommit(other, org, rid, ops, undefined, "eduardo@x");
    expect(r.status).toBe("conflict");
    expect(applyOps(other, ops, true).conflicts.length + (r.status === "conflict" ? 1 : 0)).toBeGreaterThan(0);
  });
  it("segunda unificação concorrente do mesmo cadastro é recusada", async () => {
    const d = fx(); const a = diffData(d, merged(d, { ids: ["p", "q"] }));
    const first = await prepareCommit(d, org, rid, a, undefined, "eduardo@x"); if (first.status !== "ready") throw new Error();
    const b = diffData(d, merged(d, { requestId: "33333333-3333-3333-3333-333333333333", principalId: "r", ids: ["r", "q"], finalName: "Four All", by: "leticia@x" }));
    expect((await prepareCommit(first.next, org, "33333333-3333-3333-3333-333333333333", b, undefined, "leticia@x")).status).toBe("conflict");
  });
  it("papéis e organização: leitor nunca grava; org alheia sem associação", () => {
    expect(canCommitRole("owner")).toBe(true); expect(canCommitRole("editor")).toBe(true);
    expect(canCommitRole("viewer")).toBe(false); expect(canCommitRole(undefined)).toBe(false);
    expect(pickOrg([{ org_id: "00000000-0000-0000-0000-000000000099" }], "u", null)).toBeNull();
  });
});
