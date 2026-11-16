import { fmtBRL } from "./money";

/** Proveniência técnica conhecida: "(ABA linha N, coluna N)" e frases da carga. Somente renderização. */
const PATTERNS: RegExp[] = [
  /Saldo substituído na fonte\s*\([^()]*linha\s*\d+[^()]*\)\.?/gi,
  /\((?:[A-ZÇÃÕÉ ]{3,}\s+)?linha\s*\d+(?:\s*,\s*coluna\s*[\dA-Z]+)?\)/g,
];

export function splitOrigin(text: string | null | undefined): { text: string; origin: string[] } {
  if (!text) return { text: "", origin: [] };
  const origin: string[] = [];
  let t = text;
  for (const p of PATTERNS) t = t.replace(p, (m) => { origin.push(m.trim()); return ""; });
  t = t.replace(/\s{2,}/g, " ").replace(/^\s*[·;,.-]\s*|\s*[·;,-]\s*$/g, "").trim();
  return { text: t, origin };
}

/** Formata "(dif. <centavos>)" gerado pelo cálculo como valor em reais. */
export function presentLabel(label: string): string {
  return label.replace(/\(dif\. (-?\d+(?:\.\d+)?)\)/, (_, c) => `(diferença ${fmtBRL(Number(c))})`);
}
