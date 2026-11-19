import { describe, expect, it } from "vitest";
import { classifyReplacementExpense, finalizeReplacementCents, fractionalCentFields, prepareReplacement, replacementFinancialEmpty } from "./replacementImport";
import type { SheetInfo } from "./xlsxImport";
const hash = "ea1c4241d2268fb7198c187dcd95db0f4ee328016159e4364bb4e903db338cbe";
const sheet = (kind: SheetInfo["kind"], header: unknown[], row: unknown[]): SheetInfo => ({ name: kind, kind, note: "", headerRow: 2, rows: [[], [], header, row] as SheetInfo["rows"] });
const source = () => [sheet("planned", ["COD", "FORNECEDOR"], [null, "F", 46330, null, 100, 30]), sheet("committed", ["COD", "FORNECEDOR"], ["1852 - OK", "F", null, 46330, null, 1701, 46547]), sheet("expenses", ["TIPO", "DESCRIÇÃO", "DATA"], ["Outras despesas", "Plano de saúde", 46330, null, null, 10, 0]), sheet("receipts", ["COD", "MARKET", "DATA"], ["REAL", "P", 46330, null, null, 1]), { name: "targets", kind: "targets" as const, note: "", headerRow: 0, rows: [[null, null, null, null, "11/2026"], [null, 0.25, 10, null, 75], [], [], [], [null, null, null, null, 46327], [null, null, null, null, 100]] }];
describe("preparação de substituição isolada", () => {
  it("aceita pedido/documento ausentes sem inventar nota", () => { const x = prepareReplacement(source(), hash, "f"); expect(x.data.planned[0]?.purchaseCode).toBe(""); expect(x.data.committed[0]?.document).toBe(""); expect(x.data.committed[0]?.value).toBe(170100); });
  it("mantém recebimento 1 sem inferir crédito e não herda baixas/contas", () => { const x = prepareReplacement(source(), hash, "f"); expect(Object.values(x.data.receipts[0]?.platforms ?? {})).toEqual([100]); expect(x.data.receipts[0]?.realized).toBe(false); expect(replacementFinancialEmpty(x.data)).toBe(true); expect(x.data.committed[0]?.paymentUnconfirmed).toBe(true); });
  it("reconstrução da mesma fonte tem IDs e documento idênticos", () => { expect(prepareReplacement(source(), hash, "f").data).toEqual(prepareReplacement(source(), hash, "f").data); });
  it("adaptador preserva fração antes da regra final de centavos", () => { const s = source(); const r = s[1]?.rows[3]; if (!r) throw new Error("fixture"); r[5] = 1701.001; expect(prepareReplacement(s, hash, "f").data.committed[0]?.value).toBe(170100.1); });
  it("vazio não vira zero e permanece em quarentena explícita", () => { const s = source(); const r = s[0]?.rows[3]; if (!r) throw new Error("fixture"); r[4] = null; const x = prepareReplacement(s, hash, "f"); expect(x.data.planned.length).toBe(0); expect(x.entries[0]?.value).toBeNull(); expect(x.entries[0]?.errors).toEqual(["Valor orçado (E) vazio"]); });
  it("código prefixado não cria vínculo nem aplica a antiga exceção do pedido", () => { const x = prepareReplacement(source(), hash, "f"); expect(x.data.committed[0]?.purchaseCode).toBe("1852 - OK"); expect(x.data.committed[0]?.plannedId).toBeNull(); expect(x.data.effectivations).toEqual([]); });
  it("data faturamento traço não bloqueia vencimento comprovado", () => { const s = source(); const r = s[1]?.rows[3]; if (!r) throw new Error("fixture"); r[3] = "-"; const x = prepareReplacement(s, hash, "f"); expect(x.data.committed[0]?.dueDate).toBe("2027-06-09"); expect(x.data.committed[0]?.baseDate).toBeUndefined(); });
  for (const [text, expected] of [["Plano de saúde", "Despesas com Pessoal"], ["Exames periódicos", "Despesas com Pessoal"], ["Vale alimentação", "Despesas com Pessoal"], ["Tarifa Bradesco", "Tarifas e Serviços Bancários"], ["ADS Marketing", "Publicidade e Marketing"], ["Software", "Softwares e Tecnologia"], ["Honorários contábeis", "Serviços Contábeis e Jurídicos"], ["Energia elétrica", "Utilidades e Telecomunicações"], ["Manutenção", "Manutenção e Conservação"], ["Obras", "Obras e Construções"]]) it(`classifica ${text}`, () => { expect(classifyReplacementExpense("OUTRAS DESPESAS", text ?? "").subgroup).toBe(expected); });
  it("zero informado em recebimento não aciona estimativa (regra final)", () => { const x = prepareReplacement(source(), hash, "f"); expect(x.data.receipts.every(r => r.legacyZeroEstimate === false)).toBe(true); });
  it("marca a geração da base pela fonte", () => { expect(prepareReplacement(source(), hash, "f").data.params.baseGeneration).toBe(`xlsm-${hash}`); });
  it("centavos inteiros: nota preserva total arredondado com resíduo na última parcela", () => {
    const d = prepareReplacement(source(), hash, "f").data; const c = d.committed[0]!;
    const mk = (id: string, due: string, value: number, row: number) => ({ ...c, id, dueDate: due, value, document: "NF9", sourceSupplier: "X", importOrigin: { file: "f", sheet: "s", row, raw: [] } });
    d.committed = [mk("a", "2027-01-01", 3333.333, 1), mk("b", "2027-02-01", 3333.333, 2), mk("c", "2027-03-01", 3333.334, 3), { ...mk("d", "2027-01-01", 100.4, 4), document: "NF10" }];
    const deltas = finalizeReplacementCents(d);
    expect(d.committed.map(x => x.value)).toEqual([3333, 3333, 3334, 100]);
    expect(deltas.filter(x => x.id === "d")[0]?.rule).toBe("parcela única arredondada");
    expect(fractionalCentFields(d)).toEqual([]);
  });
});
