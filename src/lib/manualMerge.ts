import { diffData, opKey, type Change } from "./diff";
import { supplierConditions, currentCondition } from "./notas";
import { normalizeSupplierName } from "./fornecedores";
import { relationsOf, financialFingerprint, supplierFamily, type Relations } from "./supplierUnification";
import type { ScenarioData, Supplier, SupplierCondition } from "./engine/types";

/** Unificação MANUAL por IDs exatos escolhidos pelo usuário. Pura; nunca agrupa por nomes/aliases nem de forma transitiva.
 *  Condições incorporadas entram sem vigência (nunca padrão automático); títulos antigos nunca são recalculados. */
export type DefaultDecision = "manter_principal" | "sem_padrao_existente";
export interface ManualMergeRequest { requestId: string; at: string; by: string; principalId: string; ids: string[]; finalName: string; reason: string; defaultDecision: DefaultDecision | null; cnpjDecision: string | null; acknowledged: string[] }
export interface ManualMergeRecord { finalName: string; previousName: string; defaultDecision: DefaultDecision; cnpjDecision: string | null; cnpjSet: string | null; acknowledged: string[];
  repointed: { entity: "planned" | "committed" | "expenses"; id: string; from: string }[]; conditionsAdded: string[]; conditionsMaterialized: boolean;
  aliasesAdded: string[]; hadAliases: boolean; sourceCodesAdded: { source: string; code: string }[] }
export interface MergeConflict { code: string; message: string; blocking: boolean }
export interface MergeReview {
  principal: Supplier | null; members: Supplier[]; ineligible: { id: string; reason: string }[]; conflicts: MergeConflict[];
  conditions: { supplierId: string; supplierName: string; condition: SupplierCondition; wasDefault: boolean; result: string }[];
  defaults: { supplierId: string; name: string; condition: string }[];
  aliasesAfter: string[]; before: Record<string, string>; after: Record<string, string>;
  relations: { id: string; name: string; rel: Relations }[]; total: Relations; unlinkedExpenses: { id: string; document: string; value: number }[];
  financeBefore: number; financeAfter: number; financeEqual: boolean; digest: string;
}
const T = (s: Supplier, today: string) => currentCondition(s, today);
const names = (s: Supplier) => [s.name, s.legalName ?? "", ...(s.aliases ?? [])].filter(Boolean);
const famCents = (d: ScenarioData, ids: Set<string>) => { const r = relationsOf(d, ids); return r.plannedCents + r.committedCents + r.expensesCents; };

/** Estado revisado: fornecedores selecionados + IDs/valores vinculados. Muda se qualquer selecionado ou vínculo mudar. */
export function mergeStateDigest(d: ScenarioData, ids: string[]) {
  const set = new Set(ids);
  const sups = ids.map((id) => d.suppliers.find((s) => s.id === id) ?? null);
  const recs = (["planned", "committed", "expenses"] as const).flatMap((k) => (d[k] as unknown as { id: string; supplierId: string; value: number }[]).filter((r) => set.has(r.supplierId)).map((r) => `${k}:${r.id}:${r.supplierId}:${r.value}`)).sort();
  return JSON.stringify([sups, recs]);
}

export function reviewManualMerge(d: ScenarioData, ids: string[], principalId: string | null, finalName: string, today: string): MergeReview {
  const uniq = [...new Set(ids)];
  const ineligible: MergeReview["ineligible"] = []; const members: Supplier[] = [];
  for (const id of uniq) { const s = d.suppliers.find((x) => x.id === id); if (!s) ineligible.push({ id, reason: "não existe nesta organização" }); else if (s.mergedInto) ineligible.push({ id, reason: `já incorporado a ${s.mergedInto}` }); else members.push(s); }
  const principal = members.find((s) => s.id === principalId) ?? null;
  const conflicts: MergeConflict[] = [];
  if (members.length < 2) conflicts.push({ code: "minimo", message: "Selecione pelo menos 2 fornecedores elegíveis.", blocking: true });
  if (ineligible.length) conflicts.push({ code: "inelegivel", message: `${ineligible.length} selecionado(s) inelegível(is): remova-os da seleção.`, blocking: true });
  if (!principal) conflicts.push({ code: "principal", message: "Escolha o cadastro principal.", blocking: true });
  if (!finalName.trim()) conflicts.push({ code: "nome", message: "Informe o nome comercial final.", blocking: true });
  const cnpjs = [...new Set(members.map((s) => (s.cnpj ?? "").replace(/\D/g, "")).filter(Boolean))];
  if (cnpjs.length > 1) conflicts.push({ code: "cnpj", message: `CNPJs diferentes (${cnpjs.join(", ")}): escolha qual fica no principal ou cancele. Os demais permanecem nos cadastros incorporados.`, blocking: true });
  const byNs = new Map<string, Set<string>>(); for (const s of members) for (const c of s.sourceCodes ?? []) { const k = c.source.trim().toUpperCase(); byNs.set(k, (byNs.get(k) ?? new Set()).add(c.code.trim())); }
  for (const [ns, codes] of byNs) if (codes.size > 1) conflicts.push({ code: `codigo:${ns}`, message: `Códigos diferentes na mesma origem "${ns}": ${[...codes].join(", ")}. Confirme que são a mesma empresa.`, blocking: true });
  const legal = [...new Set(members.map((s) => s.legalName).filter(Boolean).map((x) => normalizeSupplierName(x!)))];
  if (legal.length > 1) conflicts.push({ code: "razao", message: `Razões sociais diferentes: ${members.map((s) => s.legalName).filter(Boolean).join(" | ")}. A do principal é mantida; as demais viram apelidos. Confirme.`, blocking: true });
  const defaults = members.map((s) => ({ s, c: T(s, today) })).filter((x) => x.c).map((x) => ({ supplierId: x.s.id, name: x.s.name, condition: x.c!.name }));
  const conditions = members.flatMap((s) => supplierConditions(s).map((c) => ({ supplierId: s.id, supplierName: s.name, condition: c, wasDefault: T(s, today)?.id === c.id,
    result: s.id === principal?.id ? "Permanece como está no principal" : "Copiada para o principal SEM vigência (não vira padrão); original preservada no cadastro incorporado" })));
  const aliasesAfter = principal ? [...new Set([...(principal.aliases ?? []), ...(principal.name !== finalName.trim() ? [principal.name] : []), ...members.filter((s) => s.id !== principal.id).flatMap(names)])].filter((n) => n !== finalName.trim()) : [];
  const show = (s: Supplier | null) => s ? { Nome: s.name, "Razão social": s.legalName ?? "—", CNPJ: s.cnpj ?? "—", Códigos: (s.sourceCodes ?? []).map((c) => `${c.source}:${c.code}`).join(", ") || "—", Apelidos: (s.aliases ?? []).join(", ") || "—", Condições: String(supplierConditions(s).length) } : {};
  const relations = members.map((s) => ({ id: s.id, name: s.name, rel: relationsOf(d, new Set([s.id])) }));
  const set = new Set(members.map((s) => s.id)); const total = relationsOf(d, set);
  const memberNames = new Set(members.flatMap(names).map(normalizeSupplierName));
  const unlinkedExpenses = (d.expenses as unknown as { id: string; supplierId: string; document: string; value: number }[]).filter((e) => !e.supplierId && memberNames.has(normalizeSupplierName(e.document ?? ""))).map((e) => ({ id: e.id, document: e.document, value: e.value }));
  let after: Record<string, string> = {}; let financeAfter = famCents(d, set); let financeEqual = true;
  if (principal && !conflicts.some((c) => c.blocking && !["cnpj", "razao"].includes(c.code) && !c.code.startsWith("codigo:"))) {
    try {
      const clone = structuredClone(d);
      applyManualMerge(clone, { requestId: "previa", at: "", by: "", principalId: principal.id, ids: members.map((s) => s.id), finalName, reason: "prévia", defaultDecision: "manter_principal", cnpjDecision: cnpjs[0] ?? null, acknowledged: conflicts.map((c) => c.code) });
      after = show(clone.suppliers.find((s) => s.id === principal.id)!);
      financeAfter = famCents(clone, supplierFamily(clone, principal.id));
      financeEqual = financialFingerprint(clone) === financialFingerprint(d) && financeAfter === famCents(d, set);
    } catch { financeEqual = false; }
  }
  return { principal, members, ineligible, conflicts, conditions, defaults, aliasesAfter, before: show(principal), after, relations, total, unlinkedExpenses, financeBefore: famCents(d, set), financeAfter, financeEqual, digest: mergeStateDigest(d, uniq) };
}

/** Aplica sobre rascunho. Lança erro (sem alteração parcial no chamador que usa clone/produce) se algo não foi resolvido. */
export function applyManualMerge(d: ScenarioData, req: ManualMergeRequest): ManualMergeRecord {
  const ids = [...new Set(req.ids)];
  if (ids.length < 2 || !ids.includes(req.principalId)) throw new Error("Seleção inválida: principal deve estar entre os selecionados.");
  if (!req.reason.trim()) throw new Error("Informe a justificativa.");
  if (!req.finalName.trim()) throw new Error("Informe o nome comercial final.");
  if (!req.defaultDecision) throw new Error("Decida o tratamento da condição padrão.");
  const sups = ids.map((id) => { const s = d.suppliers.find((x) => x.id === id); if (!s) throw new Error(`Fornecedor ${id} não pertence a esta organização.`); if (s.mergedInto) throw new Error(`Fornecedor ${s.name} já foi incorporado.`); return s; });
  const p = sups.find((s) => s.id === req.principalId)!;
  const cnpjs = [...new Set(sups.map((s) => (s.cnpj ?? "").replace(/\D/g, "")).filter(Boolean))];
  if (cnpjs.length > 1 && (!req.cnpjDecision || !cnpjs.includes(req.cnpjDecision.replace(/\D/g, "")))) throw new Error("CNPJs divergentes sem decisão explícita.");
  const ns = new Map<string, Set<string>>(); for (const s of sups) for (const c of s.sourceCodes ?? []) { const k = c.source.trim().toUpperCase(); ns.set(k, (ns.get(k) ?? new Set()).add(c.code.trim())); }
  for (const [k, v] of ns) if (v.size > 1 && !req.acknowledged.includes(`codigo:${k}`)) throw new Error(`Códigos divergentes na origem ${k} sem confirmação.`);
  if (new Set(sups.map((s) => s.legalName).filter(Boolean).map((x) => normalizeSupplierName(x!))).size > 1 && !req.acknowledged.includes("razao")) throw new Error("Razões sociais divergentes sem confirmação.");
  const rec: ManualMergeRecord = { finalName: req.finalName.trim(), previousName: p.name, defaultDecision: req.defaultDecision, cnpjDecision: req.cnpjDecision, cnpjSet: null, acknowledged: [...req.acknowledged].sort(), repointed: [], conditionsAdded: [], conditionsMaterialized: !p.conditions && p.terms.some((t) => t !== null), aliasesAdded: [], hadAliases: p.aliases !== undefined, sourceCodesAdded: [] };
  const conds: SupplierCondition[] = supplierConditions(p).map((c) => ({ ...c }));
  const aliases = [...(p.aliases ?? [])];
  const addAlias = (n: string) => { if (n && n !== rec.finalName && !aliases.includes(n)) { aliases.push(n); rec.aliasesAdded.push(n); } };
  if (p.name !== rec.finalName) addAlias(p.name);
  for (const s of sups) {
    if (s.id === p.id) continue;
    for (const k of ["planned", "committed", "expenses"] as const) for (const r of d[k] as { id: string; supplierId: string }[]) if (r.supplierId === s.id) { rec.repointed.push({ entity: k, id: r.id, from: s.id }); r.supplierId = p.id; }
    for (const c of supplierConditions(s)) {
      const id = `${p.id}-m-${s.id}-${c.id}`;
      const orig = (c.periods ?? []).map((x) => `${x.from ?? "sem início"}${x.cancelled ? " (cancelado)" : ""}`).join(", ") || (c.from ?? "sem data");
      conds.push({ ...(JSON.parse(JSON.stringify(c)) as SupplierCondition), id, periods: [], from: null, note: [c.note, `Incorporada de "${s.name}" (${s.id}); vigência original: ${orig} — não aplicada`].filter(Boolean).join("\n") });
      rec.conditionsAdded.push(id);
    }
    names(s).forEach(addAlias);
    for (const c of s.sourceCodes ?? []) if (!(p.sourceCodes ?? []).some((x) => x.source === c.source && x.code === c.code) && !rec.sourceCodesAdded.some((x) => x.source === c.source && x.code === c.code)) rec.sourceCodesAdded.push({ ...c });
    s.mergedInto = p.id;
  }
  if (rec.conditionsAdded.length || p.conditions) p.conditions = conds; else rec.conditionsMaterialized = false;
  if (aliases.length || rec.hadAliases) p.aliases = aliases;
  if (rec.sourceCodesAdded.length) p.sourceCodes = [...(p.sourceCodes ?? []), ...rec.sourceCodesAdded];
  const chosen = req.cnpjDecision?.replace(/\D/g, "") ?? (cnpjs.length === 1 ? cnpjs[0]! : null);
  if (chosen && (p.cnpj ?? "").replace(/\D/g, "") !== chosen) { rec.cnpjSet = sups.find((s) => (s.cnpj ?? "").replace(/\D/g, "") === chosen)!.cnpj!; if (!p.cnpj) p.cnpj = rec.cnpjSet; else rec.cnpjSet = null; }
  p.name = rec.finalName;
  p.mergedFrom = [...(p.mergedFrom ?? []), { requestId: req.requestId, at: req.at, by: req.by, ids: sups.filter((s) => s.id !== p.id).map((s) => s.id), reason: req.reason.trim(), manual: rec }];
  return rec;
}

/** Reversão pela trilha: desfaz só o que esta unificação fez; trabalho posterior permanece. Nunca restaura backup inteiro. */
export function revertManualMerge(d: ScenarioData, principalId: string, requestId: string): string[] {
  const p = d.suppliers.find((s) => s.id === principalId); const e = p?.mergedFrom?.find((m) => m.requestId === requestId);
  if (!p || !e?.manual) throw new Error("Unificação não encontrada.");
  const m = e.manual; const kept: string[] = [];
  for (const r of m.repointed) { const x = (d[r.entity] as { id: string; supplierId: string }[]).find((y) => y.id === r.id); if (x?.supplierId === p.id) x.supplierId = r.from; else kept.push(`${r.entity}:${r.id} alterado depois — mantido`); }
  for (const id of e.ids) { const s = d.suppliers.find((x) => x.id === id); if (s?.mergedInto === p.id) delete s.mergedInto; }
  const added = new Set(m.conditionsAdded);
  if (p.conditions) { const c = p.conditions.filter((x) => !added.has(x.id) || !!x.periods?.length || !!x.history?.length); if (c.length !== p.conditions.filter((x) => !added.has(x.id)).length) kept.push("condição incorporada recebeu vigência/edição depois — mantida");
    if (m.conditionsMaterialized && c.length === 1 && c[0]!.id === `${p.id}-orig` && !c[0]!.history?.length) delete p.conditions; else p.conditions = c; }
  if (p.aliases) { p.aliases = p.aliases.filter((a) => !m.aliasesAdded.includes(a)); if (!p.aliases.length && !m.hadAliases) delete p.aliases; }
  if (m.sourceCodesAdded.length) { p.sourceCodes = (p.sourceCodes ?? []).filter((c) => !m.sourceCodesAdded.some((x) => x.source === c.source && x.code === c.code)); if (!p.sourceCodes.length) delete p.sourceCodes; }
  if (m.cnpjSet && p.cnpj === m.cnpjSet) delete p.cnpj;
  if (p.name === m.finalName) p.name = m.previousName; else kept.push("nome alterado depois — mantido");
  p.mergedFrom = p.mergedFrom!.filter((x) => x.requestId !== requestId); if (!p.mergedFrom.length) delete p.mergedFrom;
  return kept;
}

/** Validação no servidor: qualquer operação que mexa em redirecionamento de fornecedor precisa ser EXATAMENTE a unificação
 *  recalculada sobre a base atual (IDs da mesma organização/documento, não incorporados, vínculos atuais). Payload manipulado → recusa. */
export function validateMergeOps(base: ScenarioData, ops: Change[], actor: string | null): string | null {
  const sup = ops.filter((o) => o.entity === "Fornecedor");
  const touches = sup.filter((o) => { const b = o.before as Supplier | null, a = o.after as Supplier | null; return (b?.mergedInto ?? null) !== (a?.mergedInto ?? null) || JSON.stringify(b?.mergedFrom ?? []) !== JSON.stringify(a?.mergedFrom ?? []); });
  if (!touches.length) return null;
  const heads = touches.filter((o) => ((o.after as Supplier | null)?.mergedFrom?.length ?? 0) > ((o.before as Supplier | null)?.mergedFrom?.length ?? 0));
  if (heads.length !== 1) return "Unificação inválida: alteração de redirecionamento fora do procedimento de unificação.";
  const head = heads[0]!; const a = head.after as Supplier; const e = a.mergedFrom!.at(-1)!;
  if (!e.manual) return "Unificação inválida: registro de revisão ausente.";
  if (actor !== null && e.by !== actor) return "Unificação inválida: usuário divergente da sessão.";
  const clone = structuredClone(base);
  try { applyManualMerge(clone, { requestId: e.requestId, at: e.at, by: e.by, principalId: head.id, ids: [head.id, ...e.ids], finalName: e.manual.finalName, reason: e.reason ?? "", defaultDecision: e.manual.defaultDecision, cnpjDecision: e.manual.cnpjDecision, acknowledged: e.manual.acknowledged }); }
  catch (x) { return `Unificação recusada: ${(x as Error).message}`; }
  const expected = new Map(diffData(base, clone).map((o) => [opKey(o), JSON.stringify(o.after)]));
  const got = new Map(ops.map((o) => [opKey(o), JSON.stringify(o.after)]));
  if (expected.size !== got.size || [...expected].some(([k, v]) => got.get(k) !== v)) return "Unificação recusada: fornecedores ou vínculos mudaram desde a revisão. Revise novamente; nada foi gravado.";
  return null;
}

/** Simulação local antiga: resolve vínculos de incorporados para o principal da MESMA base oficial; nunca grava no real. */
export function resolveSimulationRedirects(sim: ScenarioData, official: ScenarioData): number {
  const red = new Map(official.suppliers.filter((s) => s.mergedInto).map((s) => [s.id, s.mergedInto!]));
  const root = (id: string) => { let c = id; for (let i = 0; i < 20 && red.has(c); i++) c = red.get(c)!; return c; };
  let n = 0;
  for (const k of ["planned", "committed", "expenses"] as const) for (const r of sim[k] as { supplierId: string }[]) if (r.supplierId && red.has(r.supplierId) && official.suppliers.some((s) => s.id === root(r.supplierId))) { r.supplierId = root(r.supplierId); n++; }
  return n;
}
export const mergeOpsKeys = (ops: Change[]) => ops.map(opKey);
