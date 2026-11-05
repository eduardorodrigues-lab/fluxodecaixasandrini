import { describe, expect, it } from "vitest";
import { computeFlow, dailyEstimate } from "./engine";
import { addPlatform, deletePlatform, normalizeData, setMonthTarget, setReceiptPlatform, todaySP, updatePlatform } from "./actions";
import { baseMovedSince, editSession, migrateSims, purgeUser, scopeKey, visibleDraft } from "../session";

describe("Metas mensais versionadas", () => {
  const base = () => normalizeData({ params: { profile: "web", webR1: 0.25, webR2: 0.18, divisorWeb: "dias", lagDays: 0, startDate: "2026-10-01" }, targets: { "2026-10": 27300000, "2026-11": 27300000 } });
  it("migração: meses existentes ganham snapshot e mantêm o mesmo resultado (outubro 273.000 → 5.415,97/dia)", () => {
    const raw = { params: { profile: "web", webR1: 0.25, webR2: 0.18, divisorWeb: "dias", lagDays: 0, startDate: "2026-10-01" }, targets: { "2026-10": 27300000 } };
    const d = normalizeData(raw);
    expect(d.targetConfigs["2026-10"]).toMatchObject({ gross: 27300000, webR1: 0.25, webR2: 0.18, version: 1 });
    const a = dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs);
    const b = dailyEstimate(d.params, raw.targets, "2026-10-15"); // sem configs (comportamento antigo)
    expect(a.value).toBe(541597); expect(b.value).toBe(a.value);
  });
  it("meses com redutores diferentes; editar um não muda o outro nem o histórico", () => {
    const d = base();
    setMonthTarget(d, "2026-11", { webR1: 0.1, webR2: 0 }, "promo", "t1");
    expect(dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs).value).toBe(541597);
    expect(dailyEstimate(d.params, d.targets, "2026-11-15", d.targetConfigs).value).toBe(819000); // 273000×0,9/30
    expect(d.targetConfigs["2026-11"]!.version).toBe(2);
    expect(d.targetConfigs["2026-11"]!.history.at(-1)!.before!.webR1).toBe(0.25);
    expect(d.targetConfigs["2026-10"]!.version).toBe(1);
  });
  it("parâmetro geral é só default de mês novo: não reescreve meses existentes", () => {
    const d = base();
    d.params.webR1 = 0.5;
    expect(dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs).value).toBe(541597);
    setMonthTarget(d, "2026-12", { gross: 3100000 }, "novo", "t");
    expect(d.targetConfigs["2026-12"]!.webR1).toBe(0.5);
  });
  it("r2 sobre bruto (opção explícita) e legado com redutor por mês sem segundo redutor", () => {
    const d = base();
    setMonthTarget(d, "2026-10", { r2Base: "bruto" }, "base", "t");
    const e = dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs);
    expect(e.r2).toBeCloseTo(27300000 * 0.18, 6);
    d.params.profile = "legado";
    setMonthTarget(d, "2026-10", { legacyReducer: 0.3, divisorLegado: "30" }, "l", "t");
    const l = dailyEstimate(d.params, d.targets, "2026-10-15", d.targetConfigs);
    expect(l.r2).toBe(0); expect(l.value).toBe(Math.round(27300000 * 0.7 / 30));
  });
  it("defasagem por mês: dia de novembro usa a defasagem configurada em novembro", () => {
    const d = base();
    setMonthTarget(d, "2026-11", { lagDays: 10 }, "lag", "t");
    expect(dailyEstimate(d.params, d.targets, "2026-11-05", d.targetConfigs).month).toBe("2026-10");
    expect(dailyEstimate(d.params, d.targets, "2026-10-05", d.targetConfigs).month).toBe("2026-10");
    expect(() => setMonthTarget(d, "2026-11", { webR1: 1.2 }, "x", "t")).toThrow();
  });
});

describe("Plataformas", () => {
  const d0 = () => normalizeData({ params: { startDate: "2026-10-01" }, platforms: ["Loja A", "Loja B"], receipts: [{ id: "r1", date: "2026-10-02", platforms: { "Loja A": 100000 }, general: null, notes: "" }] });
  it("migração de rótulos para ID estável; recebimento passa a referenciar o ID", () => {
    const d = d0();
    expect(d.platforms.map((p) => [p.id, p.name])).toEqual([["plat-1", "Loja A"], ["plat-2", "Loja B"]]);
    expect(d.receipts[0]!.platforms).toEqual({ "plat-1": 100000 });
  });
  it("renomear não quebra recebimentos anteriores; histórico registrado", () => {
    const d = d0();
    updatePlatform(d, "plat-1", { name: "Marketplace A" }, "renomeada", "t");
    expect(d.receipts[0]!.platforms["plat-1"]).toBe(100000);
    expect(d.platforms[0]!.history.at(-1)).toMatchObject({ field: "name", from: "Loja A", to: "Marketplace A" });
    expect(computeFlow(d, { start: "2026-10-02", end: "2026-10-02" }).days[0]!.recInformado).toBe(100000);
  });
  it("inativar: histórico permanece; novo lançamento após inativação só como residual com nota; não reativa; não exclui referenciada", () => {
    const d = d0();
    updatePlatform(d, "plat-1", { end: "2026-10-31" }, "encerrada", "t");
    d.receipts.push({ id: "r2", date: "2026-11-10", platforms: {}, general: null, notes: "", residual: {} });
    expect(() => setReceiptPlatform(d, "r2", "plat-1", 5000, null, "t")).toThrow(/residual/);
    setReceiptPlatform(d, "r2", "plat-1", 5000, "repasse final do marketplace", "t");
    const f = computeFlow(d, { start: "2026-10-01", end: "2026-11-30" });
    expect(f.days.find((x) => x.date === "2026-11-10")!.recInformado).toBe(5000); // não ocultado
    expect(f.warnings.some((w) => w.code === "PLAT_RESIDUAL")).toBe(true);
    expect(f.days.find((x) => x.date === "2026-10-02")!.recInformado).toBe(100000);
    expect(() => updatePlatform(d, "plat-1", { end: null }, "reativar", "t")).toThrow();
    expect(() => deletePlatform(d, "plat-1")).toThrow();
    deletePlatform(d, "plat-2");
    expect(d.platforms).toHaveLength(1);
  });
  it("edição retroativa usa a vigência na DATA do lançamento; antes do início é recusado", () => {
    const d = d0();
    addPlatform(d, { id: "77", name: "Nova", start: "2026-11-01", importedCode: "77" }, "t");
    d.receipts.push({ id: "r3", date: "2026-10-15", platforms: {}, general: null, notes: "", residual: {} });
    expect(() => setReceiptPlatform(d, "r3", "77", 100, null, "t")).toThrow(/não estava vigente/);
    expect(() => addPlatform(d, { id: "x", name: "nova", start: "2026-11-01" }, "t")).toThrow();
  });
  it("ID importado sem cadastro: valor mantido e pendência explícita (não inventa nome)", () => {
    const d = d0();
    d.receipts.push({ id: "r4", date: "2026-10-03", platforms: { "999": 700 }, general: null, notes: "", residual: {} });
    const f = computeFlow(d, { start: "2026-10-03", end: "2026-10-03" });
    expect(f.days[0]!.recInformado).toBe(700);
    expect(f.warnings.some((w) => w.code === "PLAT_DESCONHECIDA")).toBe(true);
  });
});

describe("Sessão: isolamento e concorrência otimista", () => {
  const base = normalizeData({});
  it("expectedVersion é snapshot do primeiro edit; refetch no meio da edição gera conflito", () => {
    let server = { version: 3 };
    const commit = (expected: number) => (expected === server.version ? "ok" : "conflict");
    let s = editSession(null, "oficial:u1:o1", base, 3, (x) => { x.params.saldoInicial = 1; }, () => "r1");
    server = { version: 4 }; // outra pessoa gravou; app recarregou a base (v4)
    s = editSession(s, "oficial:u1:o1", base, 4, (x) => { x.params.saldoInicial = 2; }, () => "r2");
    expect(s.baseVersion).toBe(3);
    expect(s.requestId).toBe("r1");
    expect(baseMovedSince(s, 4)).toBe(true);
    expect(commit(s.baseVersion)).toBe("conflict");
  });
  it("troca de usuário/organização não reutiliza rascunho nem simulações", () => {
    const s = editSession(null, scopeKey("u1", "o1")!, base, 1, () => {}, () => "r");
    expect(visibleDraft(s, scopeKey("u2", "o1"))).toBeNull();
    expect(visibleDraft(s, scopeKey("u1", "o2"))).toBeNull();
    expect(visibleDraft(s, scopeKey("u1", "o1"))).toBe(s);
    expect(scopeKey(null, "o1")).toBeNull();
    const n = editSession(s, "oficial:u2:o1", base, 7, () => {}, () => "r9");
    expect([n.baseVersion, n.requestId]).toEqual([7, "r9"]);
    const sims = migrateSims({ demo: [], oficial: [{ id: "x" }], "oficial:u1:o1": [{ id: "a" }], "oficial:u2:o1": [{ id: "b" }] });
    expect(Object.keys(sims).sort()).toEqual(["oficial:u1:o1", "oficial:u2:o1"]); // "demo" e "oficial" sem dono descartados
    expect(Object.keys(purgeUser(sims, "u1")).sort()).toEqual(["oficial:u2:o1"]);
  });
  it("hoje em America/Sao_Paulo, não UTC", () => {
    expect(todaySP(new Date("2026-10-29T01:30:00Z"))).toBe("2026-10-28");
    expect(todaySP(new Date("2026-10-29T03:30:00Z"))).toBe("2026-10-29");
  });
});
