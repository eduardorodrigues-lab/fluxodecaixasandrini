import { describe, expect, it } from "vitest";
import { normalizeData } from "@/lib/engine/actions";
import { computeFlow } from "@/lib/engine/engine";
import { buildPendencias, monthsByYear } from "./pendencias";

const empty = () => normalizeData({ params: { startDate: "2026-12-01", lagDays: 0, profile: "legado" } });
describe("Pendências do fluxo", () => {
  it("meta ausente permite cálculo incompleto e é atenção, não erro", () => {
    const data = empty();
    const result = computeFlow(data, { start: "2026-12-01", end: "2026-12-02" });
    expect(buildPendencias(result.warnings, data, "2026-12-01", "2026-12-02").find((g) => g.code === "META_AUSENTE")?.severity).toBe("alerta");
    expect(result.days.map((d) => d.recEstimado)).toEqual([0, 0]);
  });
  it("agrupa ocorrências do mesmo problema sem perder registros", () => {
    const data = empty();
    data.receipts = ["r1", "r2"].map((id) => ({ id, date: "2026-12-02", platforms: {}, general: 100, notes: "" }));
    const groups = buildPendencias(data.receipts.map((r) => ({ code: "REC_DUPLA", severity: "alerta" as const, message: "", refId: r.id, date: r.date })), data, "2026-12-01", "2026-12-31");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
  });
  it("separa meses no período dos meses anteriores, considerando a defasagem", () => {
    const data = empty(); data.params.lagDays = 10;
    const result = computeFlow(data, { start: "2027-01-01", end: "2027-01-15" });
    const groups = buildPendencias(result.warnings, data, "2027-01-01", "2027-01-15");
    expect(groups.filter((g) => g.current).flatMap((g) => g.items.flatMap((i) => i.months))).toEqual(["2026-12", "2027-01"]);
    expect(groups.filter((g) => !g.current).flatMap((g) => g.items.flatMap((i) => i.months))).toEqual(["2026-11"]);
  });
  it("organiza dezembro/2026 a novembro/2030 por ano sem duplicar meses", () => {
    const months = Array.from({ length: 48 }, (_, n) => new Date(Date.UTC(2026, 11 + n, 1)).toISOString().slice(0, 7));
    const years = monthsByYear([...months, "2026-12"]);
    expect(Object.keys(years)).toEqual(["2026", "2027", "2028", "2029", "2030"]);
    expect(years["2026"]).toEqual(["2026-12"]);
    expect(years["2030"]).toHaveLength(11);
  });
  it("plataforma desconhecida mantém o valor e é atenção", () => {
    const data = empty(); data.receipts.push({ id: "r", date: "2026-12-01", platforms: { missing: 500 }, general: null, notes: "" });
    const result = computeFlow(data, { start: "2026-12-01", end: "2026-12-01" });
    expect(result.days[0]?.recUsado).toBe(500);
    expect(buildPendencias(result.warnings, data, "2026-12-01", "2026-12-01").find((g) => g.code === "PLAT_DESCONHECIDA")?.severity).toBe("alerta");
  });
});