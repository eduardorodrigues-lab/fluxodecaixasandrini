import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeFlow } from "./engine/engine";
import { normalizeData } from "./engine/actions";
import type { ScenarioData } from "./engine/types";
const path = process.env['REPLACEMENT_CANDIDATE'];
describe.skipIf(!path)("candidato local da fonte autorizada — sem escrita", () => {
  const read = () => { if (!path) throw new Error("arquivo candidato necessário"); return JSON.parse(readFileSync(path, "utf8")) as ScenarioData; };
  it("NF372802 contém quatro parcelas 1701 e as datas informadas por Eduardo", () => {
    const d = read(); const titles = d.committed.filter(c => /^372802A[1-4]$/.test(c.document));
    expect(titles.map(c => [c.document, c.value, c.dueDate])).toEqual([["372802A1", 170100, "2027-03-11"], ["372802A2", 170100, "2027-04-10"], ["372802A3", 170100, "2027-05-10"], ["372802A4", 170100, "2027-06-09"]]);
    expect(titles.find(c => c.document === "372802A4")?.importOrigin?.row).toBe(5503);
  });
  it("oito NFs são 32 títulos e 54432, sem reaplicar as seis planejadas antigas", () => {
    const d = read(); const titles = d.committed.filter(c => c.purchaseCode === "1852 - OK");
    expect(titles.length).toBe(32); expect(titles.reduce((sum, c) => sum + c.value, 0)).toBe(5443200);
    expect(new Set(titles.map(c => c.document.replace(/A\d+$/, ""))).size).toBe(8);
    expect(titles.every(c => c.plannedId === null && c.effectivationId === null && c.paymentUnconfirmed)).toBe(true);
  });
  it("mantém 206 valores explícitos 1 sem crédito bancário", () => { const d = read(); expect(d.receipts.filter(r => r.origin?.raw?.[5] === 1).length).toBe(206); expect(d.receipts.every(r => r.realized === false && !r.generalAccountId && !r.accountByPlatform)).toBe(true); });
  it("não carrega pagamentos, efetivações, contas, cartões ou transferências antigos", () => { const d = read(); for (const key of ['payments', 'effectivations', 'bankAccounts', 'cards', 'transfers', 'cardOps'] as const) expect(d[key]).toEqual([]); expect(d.adjustments.every(a => a.note.includes("Saldo origem explícito da fonte"))).toBe(true); });
  it("IDs únicos e vínculos cadastrados íntegros após serialização", () => { const d = read(); const records = [...d.planned, ...d.committed, ...d.expenses, ...d.receipts, ...d.suppliers, ...d.platforms, ...d.categories]; expect(new Set(records.map(r => r.id)).size).toBe(records.length); const suppliers = new Set(d.suppliers.map(s => s.id)); expect([...d.planned, ...d.committed].every(r => suppliers.has(r.supplierId))).toBe(true); });
  it("normalizar e reler candidato não muda fluxo nem perdas monetárias", () => { const d = read(); const options = { start: "2026-11-11", end: "2030-12-31" }; const before = computeFlow(d, options); const restored = normalizeData(JSON.parse(JSON.stringify(d))); expect(computeFlow(restored, options).days).toEqual(before.days); });
});