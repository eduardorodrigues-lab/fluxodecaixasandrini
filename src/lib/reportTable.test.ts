import { describe, expect, it } from "vitest";
import { dateValue, parcelValue, queryReport, reportCSV } from "./reportTable";
import { buildConsulta, consultaCells, consultaReport, EMPTY_FILTER } from "@/components/Consultas";
import { dayPayments, dayReport, summarizeDayPayments } from "@/components/PagamentosDia";
import { emptyData } from "./engine/actions";

describe("Busca e ordenação dos relatórios", () => {
  it("pt-BR natural, acentos/maiúsculas equivalentes e empates estáveis", () => {
    const rows = ["Álvaro 10", "alvaro 2", "ÁLVARO 2", "Beta"];
    expect(queryReport(rows, "  ALVARO  ", { column: 0, direction: "asc" }, (r) => [r])).toEqual(["alvaro 2", "ÁLVARO 2", "Álvaro 10"]);
  });
  it("zero é valor e vazios ficam no fim nas duas direções, sem mutar a fonte", () => {
    const rows = [null, 10, 0, undefined, 2];
    expect(queryReport(rows, "", { column: 0, direction: "asc" }, (r) => [r])).toEqual([0, 2, 10, null, undefined]);
    expect(queryReport(rows, "", { column: 0, direction: "desc" }, (r) => [r])).toEqual([10, 2, 0, null, undefined]);
    expect(rows).toEqual([null, 10, 0, undefined, 2]);
  });
  it("datas por timestamp e parcela 2 antes de 10", () => {
    expect(queryReport(["01/12/2026", "30/01/2026"], "", { column: 0, direction: "asc" }, (r) => [dateValue(r.split("/").reverse().join("-"))])).toEqual(["30/01/2026", "01/12/2026"]);
    expect(queryReport(["10/10", "2/10"], "", { column: 0, direction: "asc" }, (r) => [parcelValue(r)])).toEqual(["2/10", "10/10"]);
  });
  it("busca e ordenação antecedem recorte e preservam identidade da linha", () => {
    const rows = [{ name: "João", value: 10 }, { name: "Joao", value: 2 }, { name: "Beta", value: 0 }];
    const result = queryReport(rows, "joao", { column: 1, direction: "asc" }, (r) => [r.name, r.value]);
    expect(result.slice(0, 1)[0]).toBe(rows[1]); expect(result).toHaveLength(2);
  });
  it("consultas: aliases, nomes e campos formatados, filtros, grupos, totais e todas linhas exportadas", () => {
    const d = emptyData();
    d.suppliers.push({ id: "z", name: "Álvaro", aliases: ["Calçados"], terms: [], group: "" });
    const title = (id: string, value: number, dueDate: string) => ({ id, supplierId: "z", document: "NF2", purchaseCode: "PED10", value, dueDate, extensionDate: null, extensionHistory: [], categoryId: "", status: "ativo", notes: "Descrição especial" });
    d.committed.push(title("b", 1000, "2026-12-01") as never, title("a", 2000, "2026-11-30") as never);
    const all = buildConsulta(d);
    const rows = consultaReport(all, { ...EMPTY_FILTER, pay: "Em aberto" }, true, " CALCADOS ", { column: 5, direction: "desc" });
    expect(rows).toHaveLength(1); expect(rows[0]?.value).toBe(3000); expect(rows[0]?.open).toBe(3000); expect(rows[0]?.parcel).toBe("2 parcela(s)");
    expect(consultaReport(all, EMPTY_FILTER, true, "30,00", null)[0]?.value).toBe(3000);
    expect(consultaReport(all, EMPTY_FILTER, false, "30/11/2026", null)).toHaveLength(1);
    expect(consultaReport(all, EMPTY_FILTER, false, "20,00", null)).toHaveLength(1);
    expect(consultaReport(all, EMPTY_FILTER, false, "ped10", null)).toHaveLength(2);
    const exported = consultaReport(all, EMPTY_FILTER, false, "", { column: 5, direction: "asc" });
    const csv = reportCSV(["Fornecedor"], exported.map(consultaCells));
    expect(csv.split("\r\n")).toHaveLength(3); expect(exported.map((r) => r.value)).toEqual([1000, 2000]);
  });
  it("pagamentos do dia: busca por conta/obs, totais filtrados e estorno fora do total", () => {
    const d = emptyData();
    d.payments.push({ id: "p1", titleKind: "committed", titleId: "inexistente", date: "2026-11-11", amount: 1000, note: "Taxa ÁGUA", reversalNote: "", reversedAt: null }, { id: "p2", titleKind: "committed", titleId: "inexistente", date: "2026-11-11", amount: 2000, note: "agua", reversedAt: "2026-11-11", reversalNote: "Duplicado" });
    const raw = dayPayments(d, "2026-11-11");
    const rows = dayReport([...raw.rows, ...raw.reversed], " AGUA ", { column: 6, direction: "desc" });
    const r = summarizeDayPayments(rows);
    expect(rows.map((x) => x.id)).toEqual(["p2", "p1"]); expect(r.total).toBe(1000); expect(r.reversed).toHaveLength(1);
    expect(dayReport(rows, "10,00", null)).toHaveLength(1); expect(dayReport(rows, "Duplicado", null)).toHaveLength(1);
  });
});