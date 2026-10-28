// Datas ISO "YYYY-MM-DD" em UTC; dias corridos, sem ajuste de fim de semana/feriado.
const toD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
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
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return toS(toD(iso)) === iso ? iso : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return toS(toD(t)) === t ? t : null;
  return null;
}
export const weekday = (s: string) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][toD(s).getUTCDay()];
