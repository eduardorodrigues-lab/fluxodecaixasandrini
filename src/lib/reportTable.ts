export type ReportValue = string | number | null | undefined;
export interface ReportSort { column: number; direction: "asc" | "desc" }
export const normalizeSearch = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("pt-BR");
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const empty = (v: ReportValue) => v == null || v === "" || v === "—";
export const dateValue = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
};
export const parcelValue = (s: string): number | null => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};
/** Presentation only: retain source objects and stable ties; blanks stay last in both directions. */
export function queryReport<T>(rows: T[], query: string, sort: ReportSort | null, values: (r: T) => ReportValue[], search: (r: T) => ReportValue[] = values): T[] {
  const q = normalizeSearch(query);
  const filtered = rows.filter((r) => !q || normalizeSearch(search(r).map((v) => v ?? "").join(" ")).includes(q));
  if (!sort) return filtered;
  return filtered.map((row, index) => ({ row, index })).sort((a, b) => {
    const x = values(a.row)[sort.column], y = values(b.row)[sort.column];
    if (empty(x) || empty(y)) return Number(empty(x)) - Number(empty(y)) || a.index - b.index;
    const c = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
    return (sort.direction === "asc" ? c : -c) || a.index - b.index;
  }).map(({ row }) => row);
}
export function reportCSV(head: string[], rows: string[][]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return "\uFEFF" + [head, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
}