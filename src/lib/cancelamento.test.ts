import { describe, expect, it } from "vitest";
import { titleStatus } from "./engine/engine";
import { defaultFlowPeriod, mondayOf, todayInSaoPaulo } from "./dates";

describe("cancelamento", () => {
  it("parcela cancelada de R$120,00 sem pagamento: aberto e obrigação zero, original preservado", () => {
    const s = titleStatus(12000, "cancelado", []);
    expect([s.open, s.obligation, s.original, s.cancelledValue, s.state]).toEqual([0, 0, 12000, 12000, "Cancelado"]);
  });
  it("cancelada com pagamento mantém o pago e não abre saldo", () => {
    const s = titleStatus(12000, "cancelado", [{ id: "p", titleKind: "expense", titleId: "x", amount: 5000, date: "2026-11-20" } as never]);
    expect([s.paid, s.open, s.paidOnCancelled]).toEqual([5000, 0, 5000]);
  });
  it("ativa continua com aberto = valor − pago", () => {
    expect(titleStatus(12000, "ativo", []).open).toBe(12000);
  });
});

describe("abertura do Fluxo", () => {
  it("24/11/2026 → 23/11/2026", () => expect(defaultFlowPeriod(new Date("2026-11-24T14:54:00Z")).start).toBe("2026-11-23"));
  it("domingo pertence à semana iniciada na segunda anterior", () => expect(mondayOf("2026-11-29")).toBe("2026-11-23"));
  it("virada de ano", () => expect(mondayOf("2027-01-01")).toBe("2026-12-28"));
  it("virada de mês", () => expect(mondayOf("2026-12-02")).toBe("2026-11-30"));
  it("fuso São Paulo: 02:00 UTC de terça ainda é segunda", () => expect(todayInSaoPaulo(new Date("2026-11-24T02:00:00Z"))).toBe("2026-11-23"));
});
