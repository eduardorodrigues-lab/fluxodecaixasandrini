// Valores monetários armazenados em CENTAVOS inteiros.
// Política de arredondamento: meio para longe do zero, aplicada apenas no valor final de cada parcela/dia.
export function roundCents(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
}

// Equivalente ao tipo Currency do VBA (4 casas decimais em reais).
export function macroCurrency(cents: number): number {
  return Math.round((cents / 100) * 10000) / 10000;
}

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const fmtBRL = (c: number | null | undefined) => (c == null ? "" : fmt.format(c / 100));
export const fmtNum = (c: number | null | undefined) =>
  c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "1.234,56" | "1234.56" | "" -> centavos | null (vazio é diferente de zero)
export function parseBRL(s: string): number | null {
  const t = s.trim().replace(/R\$\s?/, "");
  if (t === "") return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  return Number.isFinite(n) ? roundCents(n * 100) : null;
}
