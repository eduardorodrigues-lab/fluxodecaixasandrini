import { describe, it, expect } from "vitest";
import { splitOrigin, presentLabel } from "./originText";
describe("originText", () => {
  it("remove referência técnica do ajuste", () => { const s = splitOrigin("Saldo substituído na fonte (FLUXO DE CAIXA linha 5, coluna 653)"); expect(s.text).toBe(""); expect(s.origin).toHaveLength(1); });
  it("mantém parte útil de nota mista", () => expect(splitOrigin("Negociado prazo 30 dias (FLUXO DE CAIXA linha 5, coluna 653)").text).toBe("Negociado prazo 30 dias"));
  it("preserva nota de negócio com 'linha' e 'fonte'", () => { const n = "Nova linha de produtos; fonte: proposta do fornecedor"; expect(splitOrigin(n)).toEqual({ text: n, origin: [] }); });
  it("diferença em reais", () => expect(presentLabel("Saldo substituído manualmente (dif. -100)")).toMatch(/diferença -R\$\s?1,00/));
});
describe("originText cadastro", () => {
  it("remove nota de carga de fornecedor", () => expect(splitOrigin("Importado FLUXO_DE_CAIXA_ORIGINAL.xlsm · TABELA_FORNECEDORES linha 10").text).toBe(""));
  it("mantém negociação", () => expect(splitOrigin("Prazo negociado com Ana · Importado X.xlsm · TABELA_FORNECEDORES linha 19").text).toBe("Prazo negociado com Ana"));
});
