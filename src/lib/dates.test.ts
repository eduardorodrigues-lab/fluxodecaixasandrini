import { describe, expect, it } from "vitest";
import { calendarDate, calendarIso, dateInputError, maskDateInput, parseBRDate } from "./dates";

describe("preenchimento de datas", () => {
  it("insere as barras e aceita data colada brasileira ou ISO", () => {
    expect(maskDateInput("10112026")).toBe("10/11/2026");
    expect(maskDateInput("10/11/2026")).toBe("10/11/2026");
    expect(maskDateInput("2026-11-10")).toBe("10/11/2026");
    expect(maskDateInput("101")).toBe("10/1");
  });
  it("rejeita dias inexistentes, mas aceita fevereiro bissexto", () => {
    expect(parseBRDate("31/04/2026")).toBeNull();
    expect(parseBRDate("29/02/2026")).toBeNull();
    expect(parseBRDate("29/02/2028")).toBe("2028-02-29");
    expect(dateInputError("31/04/2026")).not.toBe("");
    expect(dateInputError("10/11/2026")).toBe("");
  });
  it("rejeita período invertido em ambos os extremos, aceita igualdade", () => {
    expect(dateInputError("09/11/2026", false, "2026-11-10")).not.toBe("");
    expect(dateInputError("11/11/2026", false, null, "2026-11-10")).not.toBe("");
    expect(dateInputError("10/11/2026", false, "2026-11-10", "2026-11-10")).toBe("");
  });
  it("preserva o dia civil do calendário, inclusive nas viradas de mês", () => {
    for (const iso of ["2026-11-10", "2027-01-01", "2028-02-29"]) {
      const date = calendarDate(iso);
      expect(date).toBeInstanceOf(Date);
      if (!date) throw new Error("data inválida");
      expect(calendarIso(date)).toBe(iso);
      expect(date.getDate()).toBe(Number(iso.slice(8)));
    }
  });
  it("somente campos opcionais aceitam vazio", () => {
    expect(dateInputError("", true)).toBe("");
    expect(dateInputError("")).not.toBe("");
  });
});