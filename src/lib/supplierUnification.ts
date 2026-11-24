import type { ScenarioData, Supplier, SupplierCondition } from "./engine/types";
import { identityName } from "./supplierIdentity";

/** Mapeamentos nome comercial → razão social informados por Eduardo. São PROPOSTAS: só viram unificação após aprovação. */
export const COMMERCIAL_LEGAL: [string, string][] = [
  ["ADIDAS", "633 - ADIDAS DO BRASIL LTDA"], ["BIBI", "103 - CALCADOS BIBI LTDA"], ["BLACK WHITE SPORTS", "191473 - BLACK WHITE SPORTS"],
  ["CHANTAL", "648 - PRODUTOS ORTOPEDICOS"], ["DANPER", "INDUSTRIA E COMERCIO DE CALCADOS DANPER LTDA"], ["DASS NORDESTE", "152 - DASS NORDESTE CALCADOS"],
  ["DEMOCRATA", "DEMOCRATA CALCADOS E ARTEFATOS DE COURO LTDA"], ["DJM TEX", "12834 - DJM TEX LTDA"], ["DUALT", "164 - DUALT INDUSTRIA DE"],
  ["FERRACINI", "810 - CALCADOS FERRACINI LTDA"], ["FILA", "199 - FILA BRASIL LTDA"], ["FOUR ALL", "788 - FOUR ALL PRIME"],
  ["HANES BRANDS", "226 - HANESBRANDS BRASIL TÊXTIL"], ["JOTAPE", "828 - CALCADOS JOTA PE LTDA"], ["KLIN", "KLIN PRODUTOS INFANTIS LTDA"],
  ["MANCHESTER", "CALCADOS MANCHESTER LTDA"], ["MASH", "76850 - MASH INDUSTRIA E"], ["MCM", "1764 - MCM MALHAS E"], ["MGS", "328 - MGS INDÚSTRIA E COMÉRCIO"],
  ["NADU", "194480 - NADU CONFECCOES LTDA"], ["NEW BRASIL", "335 - NEW BRASIL ARTIGOS"], ["PEGADA", "1748 - CALCADOS PEGADA"], ["PUMA", "372 - PUMA SPORTS LTDA"],
  ["RIDE GROUP", "RIDE GROUP CALCADOS LTDA"], ["ROSSI", "764 - AMADEO ROSSI IMPORTACAO"], ["SELENE", "399 - SELENE INDUSTRIA TEXTIL S"],
  ["SIGVARIS", "405 - SIGVARIS DO BRASIL"], ["SKECHERS", "414 - SKECHERS DO BRASIL"], ["SOUND - ZOTTO", "56875 - ZOTTO CALCADOS LTDA"],
  ["STAR FLEX", "1758 - STAR FLEX CALCADOS LTDA"], ["TOMMY", "303 - TOMMY HILFIGER DO BRASIL"], ["VENOSAN", "785 - VENOSAN BRASIL LTDA"], ["VRG", "649 - VRG COM TEC CONFEC E VAR"],
];
/** Nomes comerciais cuja raiz colide com outras empresas: variantes exigem revisão individual. */
export const COLLISION_ROOTS = ["UZ3 INDUSTRIAL"];
/** Raízes sem cadastro "original" exato, informadas por Eduardo. */
export const EXTRA_ROOTS = ["WALL BERMUDA TACTEL"];

export const norm = (s: string) => identityName(s).replace(/[^A-Z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();
export function splitCode(name: string): { code: string | null; rest: string } {
  const m = /^\s*(\d{2,7})\s*-\s*(.+)$/.exec(name);
  return m ? { code: m[1] ?? null, rest: m[2] ?? name } : { code: null, rest: name };
}
export type ConditionKind = "padrao" | "especial" | "historica" | "simulacao" | "vigencia";
/** Classificação textual da variante. Nunca vira padrão automaticamente: só a condição "original" é candidata a padrão. */
export function classifyConditionName(qualifier: string): { kind: ConditionKind; from: string | null; missingYear: boolean } {
  const q = norm(qualifier);
  const full = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(q);
  const my = /(\d{1,2})\/(\d{4})/.exec(q) ?? /(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(\d{4})/.exec(q);
  const months = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  let from: string | null = null;
  if (full) from = `${full[3]}-${full[2]!.padStart(2, "0")}-${full[1]!.padStart(2, "0")}`;
  else if (my) { const m = /^\d+$/.test(my[1]!) ? Number(my[1]) : months.indexOf(my[1]!) + 1; if (m >= 1 && m <= 12) from = `${my[2]}-${String(m).padStart(2, "0")}-01`; }
  const dated = /\d{1,2}\/\d{1,2}|A PARTIR|EM DIANTE|PRA FRENTE|CONT/.test(q);
  const kind: ConditionKind = /SIMULA/.test(q) ? "simulacao" : /OPORTUNIDADE|ESPECIAL|SOMENTE|PEDIDO|UNICA/.test(q) || (!/A PARTIR|EM DIANTE|PRA FRENTE/.test(q) && /JUNHO|JULHO|AGOSTO|MARCO|ABRIL|DEZEMBRO/.test(q)) ? "especial" : dated ? "vigencia" : "especial";
  return { kind, from: kind === "vigencia" || kind === "especial" ? from : null, missingYear: dated && !from };
}

export interface Member { id: string; name: string; role: "principal" | "razao_social" | "variante_nome" | "condicao"; evidence: string; confidence: "alta" | "revisao"; condition?: { name: string; terms: (number | null)[]; kind: ConditionKind; from: string | null; missingYear: boolean } }
export interface Relations { planned: number; committed: number; expenses: number; parcels: number; payments: number; importLog: number; plannedCents: number; committedCents: number; expensesCents: number; paidCents: number }
export interface Group { principalId: string; principalName: string; legalName: string | null; sourceCode: string | null; members: Member[]; status: "aprovavel" | "pendente"; pending: string[]; relations: Relations }

const emptyRel = (): Relations => ({ planned: 0, committed: 0, expenses: 0, parcels: 0, payments: 0, importLog: 0, plannedCents: 0, committedCents: 0, expensesCents: 0, paidCents: 0 });
type Rec = { supplierId: string; value: number; installments?: unknown[]; payments?: { amount?: number }[] };
export function relationsOf(d: ScenarioData, ids: Set<string>): Relations {
  const r = emptyRel();
  const add = (k: "planned" | "committed" | "expenses", x: Rec) => {
    if (!ids.has(x.supplierId)) return;
    r[k]++; r[`${k}Cents`] += Math.round(x.value ?? 0); r.parcels += Array.isArray(x.installments) ? x.installments.length : 1;
    for (const p of x.payments ?? []) { r.payments++; r.paidCents += Math.round(p.amount ?? 0); }
  };
  (d.planned as unknown as Rec[]).forEach((x) => add("planned", x)); (d.committed as unknown as Rec[]).forEach((x) => add("committed", x)); (d.expenses as unknown as Rec[]).forEach((x) => add("expenses", x));
  r.importLog = d.importLog.filter((x) => ids.has(x.refId ?? "")).length;
  return r;
}

const hasTerms = (s: Supplier) => s.terms.some((t) => t !== null && t !== 0);
/** Proposta determinística de unificação. Não altera `d`. Similaridade só gera revisão; nada é mesclado aqui. */
export function proposeUnification(d: ScenarioData): { groups: Group[]; unmatched: { id: string; name: string; reason: string }[] } {
  const live = d.suppliers.filter((s) => !s.mergedInto);
  const byNorm = new Map<string, Supplier[]>();
  for (const s of live) { const k = norm(s.name); byNorm.set(k, [...(byNorm.get(k) ?? []), s]); }
  const used = new Set<string>(); const groups: Group[] = [];
  const roots = new Map<string, string | null>();
  for (const [c, l] of COMMERCIAL_LEGAL) roots.set(norm(c), l);
  for (const r of EXTRA_ROOTS) roots.set(norm(r), null);
  for (const s of live) if (hasTerms(s) && !splitCode(s.name).code) { const n = norm(s.name); if (![...roots.keys()].some((r) => n !== r && n.startsWith(r + " "))) if (!roots.has(n)) roots.set(n, null); }
  const sortedRoots = [...roots.keys()].sort((a, b) => b.length - a.length);
  for (const root of [...roots.keys()].sort()) {
    const legal = roots.get(root) ?? null;
    const pending: string[] = [];
    let principals = (byNorm.get(root) ?? []).filter((x) => !used.has(x.id));
    let evidence = "nome comercial exato";
    if (!principals.length) {
      const legalHits = legal ? [...(byNorm.get(norm(legal)) ?? []), ...(byNorm.get(norm(splitCode(legal).rest)) ?? [])].filter((x) => !used.has(x.id)) : [];
      const variants = live.filter((x) => !used.has(x.id) && norm(x.name).startsWith(root + " "));
      const pick = legalHits[0] ?? (variants.length > 1 ? variants[0] : undefined);
      if (!pick) continue;
      principals = [pick]; evidence = "sem cadastro com o nome comercial exato; principal provisório";
      pending.push("Não existe cadastro com o nome comercial exato: confirmar qual cadastro será o principal.");
    }
    const sorted = [...principals].sort((a, b) => Number(hasTerms(b)) - Number(hasTerms(a)) || a.id.localeCompare(b.id));
    const p = sorted[0]!;
    const members: Member[] = [{ id: p.id, name: p.name, role: "principal", evidence, confidence: "alta" }];
    for (const x of sorted.slice(1)) members.push({ id: x.id, name: x.name, role: "variante_nome", evidence: "mesmo nome ignorando maiúsculas/acentos/espaços", confidence: hasTerms(x) && hasTerms(p) && x.terms.join() !== p.terms.join() ? "revisao" : "alta" });
    const collision = COLLISION_ROOTS.some((c) => root.startsWith(norm(c)));
    if (legal) {
      const { rest } = splitCode(legal);
      for (const key of new Set([norm(legal), norm(rest)])) for (const s of byNorm.get(key) ?? []) if (s.id !== p.id && !used.has(s.id))
        members.push({ id: s.id, name: s.name, role: "razao_social", evidence: key === norm(legal) ? "razão social com código de origem idêntica ao mapeamento informado" : "razão social idêntica ao mapeamento (maiúsc./acentos ignorados), sem código", confidence: "alta" });
      const lr = norm(rest);
      for (const s of live) if (!members.some((m) => m.id === s.id) && !used.has(s.id)) { const n = norm(splitCode(s.name).rest); if (n !== lr && (n.startsWith(lr) || lr.startsWith(n)) && n.length >= 6) members.push({ id: s.id, name: s.name, role: "variante_nome", evidence: "razão social semelhante (prefixo); semelhança não basta", confidence: "revisao" }); }
    }
    for (const s of live) {
      if (s.id === p.id || used.has(s.id) || members.some((m) => m.id === s.id)) continue;
      const n = norm(s.name);
      if (!n.startsWith(root + " ")) continue;
      if (sortedRoots.some((r) => r.length > root.length && (n === r || n.startsWith(r + " ")))) continue;
      const qualifier = s.name.slice(s.name.toUpperCase().indexOf(p.name.toUpperCase()) + p.name.length).replace(/^[\s\-–]+/, "") || s.name;
      const c = classifyConditionName(qualifier);
      const review = collision || c.missingYear || !hasTerms(s);
      members.push({ id: s.id, name: s.name, role: "condicao", evidence: `variante de condição com prefixo "${p.name}"${collision ? "; raiz em colisão" : ""}`, confidence: review ? "revisao" : "alta", condition: { name: qualifier, terms: [...s.terms], kind: c.kind, from: c.from, missingYear: c.missingYear } });
    }
    const cnpjOf = (id: string) => live.find((x) => x.id === id)?.cnpj?.replace(/\D/g, "") || "";
    const anchor = cnpjOf(p.id) || members.map((m) => cnpjOf(m.id)).find(Boolean) || "";
    const divergent = members.filter((m) => m.id !== p.id && cnpjOf(m.id) && cnpjOf(m.id) !== anchor);
    if (divergent.length) { pending.push(`CNPJ divergente em ${divergent.map((m) => `"${m.name}"`).join(", ")}: excluído(s) do grupo; matriz/filial exige revisão.`); for (const m of divergent) members.splice(members.indexOf(m), 1); }
    if (collision) pending.push("Raiz em colisão: confirmar individualmente se cada cadastro pertence à mesma empresa.");
    if (members.some((m) => m.condition?.missingYear)) pending.push("Vigência sem ano na fonte: informar ano antes de agendar (fica sem início).");
    if (members.some((m) => m.confidence === "revisao" && m.role !== "condicao")) pending.push("Há nomes apenas semelhantes; confirmar ou excluir do grupo.");
    if (legal && !members.some((m) => m.role === "razao_social")) pending.push(`Razão social "${legal}" não encontrada exatamente na base.`);
    if (members.length < 2) continue;
    members.forEach((m) => used.add(m.id));
    const ids = new Set(members.map((m) => m.id));
    const sc = legal ? splitCode(legal).code : null;
    groups.push({ principalId: p.id, principalName: p.name, legalName: legal, sourceCode: sc, members, status: pending.length || members.some((m) => m.confidence === "revisao") ? "pendente" : "aprovavel", pending, relations: relationsOf(d, ids) });
  }
  // exact duplicates (case/accent/space) without commercial root: review only
  const unmatched: { id: string; name: string; reason: string }[] = [];
  for (const [k, list] of byNorm) if (list.length > 1 && list.some((s) => !used.has(s.id))) for (const s of list) unmatched.push({ id: s.id, name: s.name, reason: `nome normalizado repetido "${k}" (${list.length} cadastros) — revisar` });
  for (const [c] of COMMERCIAL_LEGAL) if ((byNorm.get(norm(c)) ?? []).length === 0 && !groups.some((g) => norm(g.principalName).startsWith(norm(c)) || (g.legalName && norm(g.legalName) === norm(COMMERCIAL_LEGAL.find((x) => x[0] === c)![1])))) unmatched.push({ id: "", name: c, reason: "nome comercial do mapeamento não encontrado exatamente na base" });
  return { groups, unmatched };
}

export interface MergeTrail { requestId: string; at: string; by: string; principalId: string; incorporated: { id: string; name: string; role: Member["role"] }[]; repointed: { entity: "planned" | "committed" | "expenses"; id: string; from: string }[]; conditionsAdded: string[] }

/** Aplica UM grupo aprovado (pura, sobre rascunho). Idempotente por requestId; preserva IDs, valores, datas e parcelas.
 *  Incorporados ficam como redirecionamentos (`mergedInto`) com nome como alias; nada é apagado. */
export function applyMerge(d: ScenarioData, g: Pick<Group, "principalId" | "legalName" | "sourceCode" | "members">, meta: { requestId: string; at: string; by: string }): MergeTrail | null {
  const p = d.suppliers.find((s) => s.id === g.principalId);
  if (!p) throw new Error("Principal não encontrado.");
  if (p.mergedFrom?.some((m) => m.requestId === meta.requestId)) return null;
  if (p.mergedInto) throw new Error("Principal já incorporado a outro cadastro.");
  const trail: MergeTrail = { ...meta, principalId: p.id, incorporated: [], repointed: [], conditionsAdded: [] };
  const base: SupplierCondition[] = (p.conditions ?? (p.terms.some((t) => t !== null) ? [{ id: `${p.id}-orig`, name: "Condição original", terms: [...p.terms], from: null, at: meta.at, by: meta.by, kind: "padrao" }] : [])).map((c) => ({ ...c }));
  for (const m of g.members) {
    if (m.id === p.id) continue;
    const s = d.suppliers.find((x) => x.id === m.id);
    if (!s) throw new Error(`Cadastro incorporado ${m.id} não encontrado.`);
    if (s.mergedInto) throw new Error(`Cadastro ${s.name} já foi incorporado.`);
    for (const k of ["planned", "committed", "expenses"] as const) for (const r of d[k] as { id: string; supplierId: string }[]) if (r.supplierId === s.id) { trail.repointed.push({ entity: k, id: r.id, from: s.id }); r.supplierId = p.id; }
    if (m.role === "condicao" && m.condition) {
      const id = `${p.id}-m-${s.id}`;
      base.push({ id, name: m.condition.name, terms: [...m.condition.terms], from: m.condition.from, at: meta.at, by: meta.by, note: `Incorporada de "${s.name}" (${s.id})${m.condition.missingYear ? "; vigência sem ano na fonte" : ""}`, kind: m.condition.kind, periods: m.condition.kind === "vigencia" && m.condition.from ? [{ from: m.condition.from, at: meta.at, by: meta.by }] : [] });
      trail.conditionsAdded.push(id);
    }
    p.aliases = [...new Set([...(p.aliases ?? []), s.name, ...(s.aliases ?? [])])];
    s.mergedInto = p.id;
    trail.incorporated.push({ id: s.id, name: s.name, role: m.role });
  }
  p.conditions = base;
  if (g.legalName && !p.legalName) p.legalName = g.legalName;
  if (g.sourceCode && !p.sourceCodes?.some((c) => c.code === g.sourceCode)) p.sourceCodes = [...(p.sourceCodes ?? []), { source: "FLUXO xlsm", code: g.sourceCode }];
  p.mergedFrom = [...(p.mergedFrom ?? []), { requestId: meta.requestId, at: meta.at, by: meta.by, ids: trail.incorporated.map((x) => x.id) }];
  return trail;
}
/** Reverte pela trilha (pura). Restaura vínculos e cadastros sem tocar valores. */
export function revertMerge(d: ScenarioData, t: MergeTrail, original: Supplier) {
  for (const r of t.repointed) { const x = (d[r.entity] as { id: string; supplierId: string }[]).find((y) => y.id === r.id); if (x && x.supplierId === t.principalId) x.supplierId = r.from; }
  for (const i of t.incorporated) { const s = d.suppliers.find((x) => x.id === i.id); if (s) delete s.mergedInto; }
  d.suppliers = d.suppliers.map((s) => (s.id === t.principalId ? structuredClone(original) : s));
}
/** Segue redirecionamento de incorporados (importação futura por nome antigo cai no principal). */
export function principalOf(d: Pick<ScenarioData, "suppliers">, id: string): string {
  let cur = id; const seen = new Set<string>();
  for (;;) { const s = d.suppliers.find((x) => x.id === cur); if (!s?.mergedInto || seen.has(cur)) return cur; seen.add(cur); cur = s.mergedInto; }
}
