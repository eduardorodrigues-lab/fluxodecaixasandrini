import { describe, expect, it } from "vitest";
import { emptyData } from "./engine/actions";
import { receiptInformed } from "./engine/engine";
import { migrateReceiptCategories, RECEIPT_CATEGORY_ORDER, receiptPlatformEntries } from "./receiptMigration";
const at = "2026-11-16T13:20:00Z";
const fixture = () => {
  const d = emptyData();
  d.platforms = ["SHOPEE", "SHOPPE", "SHOPEE MENOR", "SHOPEE MG", "SHOPEE MENSWEAR", "SHOPEE SPORTS"].map((name, i) => ({ id: String(i), name, start: "2025-01-01", end: null, importedCode: name, history: [] }));
  return d;
};
describe("consolidação autorizada dos recebimentos", () => {
  it("soma aliases preservando zero, null e ausência sem arredondar", () => {
    const d = fixture();
    d.receipts = [{ id: "r", date: "2026-01-01", platforms: { "0": 0, "1": null, "2": 12.125, "3": 0.25 }, general: null, notes: "" }];
    const r = migrateReceiptCategories(d, at).data.receipts[0];
    expect(r?.platforms).toEqual({ "4": 0, "5": 12.375 });
    const original = d.receipts[0];
    if (!original) throw new Error("fixture");
    expect(receiptInformed(original).sum).toBe(r && receiptInformed(r).sum);
    expect(r?.platformMigration?.sources).toHaveLength(4);
  });
  it("null-only remains null and absent never becomes an invented zero", () => {
    const d = fixture(); d.receipts = [{ id: "n", date: "2026-01-01", platforms: { "0": null, "1": null }, general: null, notes: "" }];
    const r = migrateReceiptCategories(d, at).data.receipts[0];
    expect(r?.platforms).toEqual({ "4": null });
    expect(r && receiptInformed(r).present).toBe(false);
  });
  it("Sports and Menswear are separate with stable existing final IDs", () => {
    const r = migrateReceiptCategories(fixture(), at);
    expect(r.mapping).toMatchObject({ "0": "4", "1": "4", "2": "5", "3": "5", "4": "4", "5": "5" });
  });
  it("same-date lines retain different accounts and realized/forecast segregation", () => {
    const d = fixture();
    d.receipts = [false, true].map((realized, i) => ({ id: `r${i}`, date: "2026-01-01", kind: realized ? "realizado" : "previsto", realized, platforms: { [String(i)]: 100 }, accountByPlatform: { [String(i)]: { accountId: i ? "B" : "A", override: true } }, general: null, notes: "" }));
    const r = migrateReceiptCategories(d, at).data.receipts;
    expect(r.map((x) => [x.id, x.realized, x.accountByPlatform?.["4"]?.accountId])).toEqual([["r0", false, "A"], ["r1", true, "B"]]);
  });
  it("blocks different accounts within a merged component instead of choosing", () => {
    const d = fixture(); d.receipts = [{ id: "r", date: "2026-01-01", platforms: { "0": 100, "1": 200 }, accountByPlatform: { "0": { accountId: "A", override: false }, "1": { accountId: "B", override: false } }, general: null, notes: "" }];
    expect(() => migrateReceiptCategories(d, at)).toThrow("Contas diferentes");
    expect(d.receipts[0]?.platforms).toEqual({ "0": 100, "1": 200 });
  });
  it("preserves bank periods and blocks incompatible defaults", () => {
    const d = fixture(); const a = d.platforms[0], b = d.platforms[1];
    if (!a || !b) throw new Error("fixture");
    a.defaultAccounts = [{ from: "2025-01-01", accountId: "A", at, note: "original" }];
    expect(migrateReceiptCategories(d, at).data.platforms.find((p) => p.name === "SHOPEE MENSWEAR")?.defaultAccounts).toEqual(a.defaultAccounts);
    b.defaultAccounts = [{ from: "2025-01-01", accountId: "B", at, note: "original" }];
    expect(() => migrateReceiptCategories(d, at)).toThrow("Vigências bancárias conflitantes");
  });
  it("orders exactly 18 categories, Geral last; TikTok has no invented receipts", () => {
    const d = emptyData(); d.platforms = [...RECEIPT_CATEGORY_ORDER].reverse().filter((n) => n !== "GERAL" && n !== "TIKTOK").map((name) => ({ id: name, name, start: "2025-01-01", end: null, importedCode: null, history: [] }));
    const next = migrateReceiptCategories(d, at).data;
    expect([...next.platforms.map((p) => p.name), "GERAL"]).toEqual(RECEIPT_CATEGORY_ORDER);
    expect(next.receipts).toHaveLength(0);
    expect(receiptPlatformEntries(next, { id: "r", date: "", platforms: { "MELI MG": 2, "MELI SP": 1 }, general: null, notes: "" }).map(([id]) => id)).toEqual(["MELI SP", "MELI MG"]);
  });
  it("preserves unexpected platforms and unrelated collections", () => {
    const d = fixture(); d.platforms.push({ id: "u", name: "NÃO MAPEADA", start: "2025-01-01", end: null, importedCode: null, history: [] });
    const r = migrateReceiptCategories(d, at);
    expect(r.unknown).toEqual(["NÃO MAPEADA"]);
    expect(r.data.platforms.at(-1)?.id).toBe("u");
    expect(r.data.payments).toEqual(d.payments);
    expect(r.data.params).toEqual(d.params);
  });
});