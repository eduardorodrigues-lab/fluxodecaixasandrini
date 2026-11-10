// Datas ISO "YYYY-MM-DD" em UTC; dias corridos, sem ajuste de fim de semana/feriado.
const toD = (s: string) => {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toS = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => {
  const d = toD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toS(d);
};
export const ym = (s: string) => s.slice(0, 7);
export const daysInMonth = (s: string) => {
  const d = toD(s);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};
export function dateRange(a: string, b: string): string[] {
  const out: string[] = [];
  if (!a || !b || a > b) return out;
  for (let s = a; s <= b; s = addDays(s, 1)) out.push(s);
  return out;
}
export const fmtDate = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
export const fmtMonth = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
export function parseBRDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return toS(toD(iso)) === iso ? iso : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return toS(toD(t)) === t ? t : null;
  return null;
}
export const weekday = (s: string) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][toD(s).getUTCDay()];

/** Display-only input mask; ISO paste is converted to the Brazilian format. */
export function maskDateInput(text: string) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) ? parseBRDate(text.trim()) : null;
  if (iso) return fmtDate(iso);
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
}
// Calendar dates use local civil components, never ISO/UTC conversion.
export function calendarDate(iso: string | null): Date | undefined {
  if (!iso || !parseBRDate(iso)) return undefined;
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  const date = new Date(0); date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
  return date;
}
export function calendarIso(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateInputError(text: string, allowEmpty = false, min?: string | null, max?: string | null) {
  if (!text.trim()) return allowEmpty ? "" : "Informe a data.";
  const date = parseBRDate(text);
  if (!date) return "Data inválida. Use dd/mm/aaaa e um dia existente.";
  if (min && date < min || max && date > max) return "A data final não pode ser anterior à data inicial.";
  return "";
}
