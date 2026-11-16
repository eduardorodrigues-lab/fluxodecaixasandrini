import type { Platform, Receipt, ScenarioData } from "./engine/types";

export const RECEIPT_CATEGORY_ORDER = ["MELI SP", "MELI MG", "SHOPEE MENSWEAR", "SHOPEE SPORTS", "AMAZON SP", "AMAZON MG", "DAFITI", "TIKTOK", "MAGALU SP", "MUTUO BUYCLOCK", "BONIFICAÇÕES FORNECEDORES", "PE VERMEIO", "LOJAS", "LICITAÇÕES", "BRADESCO", "RENDIMENTO APLICAÇÕES", "ENTRADA EMPRÉSTIMO", "GERAL"] as const;
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();
const aliases: Record<string, string> = {};
for (const name of RECEIPT_CATEGORY_ORDER) aliases[norm(name)] = name;
for (const [target, names] of Object.entries({
  "SHOPEE MENSWEAR": ["SHOPEE TOP", "SHOPPE", "SHOPEE"],
  "SHOPEE SPORTS": ["SHOPEE MENOR", "SHOPEE MG"],
  "AMAZON SP": ["AMAZON"], "DAFITI": ["DAIFITI", "DAIFITI MG"],
  "MAGALU SP": ["MAGALU"], "LICITAÇÕES": ["LICITACAO", "LICITACOES"],
  "BONIFICAÇÕES FORNECEDORES": ["HANNES - BONIFICACAO", "VULCABRAS - BONIFICACAO", "TOPSHOES - BONIFICACAO"],
  "ENTRADA EMPRÉSTIMO": ["ENTRADA EMPRESTIMO SAFRA"],
})) for (const name of names) aliases[norm(name)] = target;
const generalNames = new Set(["GERAL", "RECEBIMENTO", "RECEBIMENTO BUY E SANDRINI", "FERIADO", "FINAL DE SEMANA"]);

/** Persisted platform array is the single operational column/selection order. */
export function receiptPlatformEntries(d: ScenarioData, r: Receipt) {
  const positions = new Map(d.platforms.map((p, i) => [p.id, i]));
  return Object.entries(r.platforms).sort(([a], [b]) => (positions.get(a) ?? Infinity) - (positions.get(b) ?? Infinity));
}

/** One-shot migration; never invoked on load or ordinary saves. Conflicts block before any write. */
export function migrateReceiptCategories(base: ScenarioData, at: string) {
  const d: ScenarioData = JSON.parse(JSON.stringify(base));
  const groups = new Map<string, Platform[]>();
  const unknown: string[] = [];
  for (const p of base.platforms) {
    const name = aliases[norm(p.name)] ?? (generalNames.has(norm(p.name)) ? "GERAL" : p.name);
    if (!aliases[norm(p.name)] && !generalNames.has(norm(p.name))) unknown.push(p.name);
    groups.set(name, [...(groups.get(name) ?? []), p]);
  }
  const mapping = new Map<string, string>();
  const platforms: Platform[] = [];
  for (const [name, sources] of groups) {
    if (name === "GERAL") { for (const p of sources) mapping.set(p.id, "general"); continue; }
    const primary = sources.find((p) => norm(p.name) === norm(name)) ?? sources[0];
    if (!primary) continue;
    // A merged default timeline must be unambiguous; originals stay recoverable in consolidatedSources.
    const timelines = sources.filter((p) => p.defaultAccounts?.length).map((p) => JSON.stringify(p.defaultAccounts));
    if (new Set(timelines).size > 1) throw new Error(`Vigências bancárias conflitantes: ${name}`);
    const next: Platform = JSON.parse(JSON.stringify(primary));
    next.name = name;
    next.start = sources.map((p) => p.start).sort()[0] ?? primary.start;
    next.end = sources.some((p) => p.end === null) ? null : sources.map((p) => p.end).filter((v): v is string => !!v).sort().at(-1) ?? null;
    if (timelines.length) next.defaultAccounts = JSON.parse(timelines[0] ?? "[]");
    next.consolidatedSources = sources.map((p) => JSON.parse(JSON.stringify(p)));
    next.history.push({ at, field: "consolidação autorizada", from: sources.map((p) => ({ id: p.id, name: p.name })), to: name, note: "Identidades e valores de origem preservados; auditoria com autoria e data do servidor." });
    platforms.push(next);
    for (const p of sources) mapping.set(p.id, primary.id);
  }
  if (!platforms.some((p) => p.name === "TIKTOK")) platforms.push({ id: "plat-tiktok", name: "TIKTOK", start: at.slice(0, 10), end: null, importedCode: null, history: [] });
  const order = new Map<string, number>(RECEIPT_CATEGORY_ORDER.map((n, i) => [n, i]));
  d.platforms = platforms.sort((a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity));
  for (const r of d.receipts) {
    const original: Receipt = JSON.parse(JSON.stringify(r));
    const values: Receipt["platforms"] = {};
    const accounts: NonNullable<Receipt["accountByPlatform"]> = {};
    const residual: NonNullable<Receipt["residual"]> = {};
    const accountSeen = new Map<string, string>();
    let changed = false;
    for (const [oldId, value] of Object.entries(original.platforms)) {
      const id = mapping.get(oldId) ?? oldId;
      changed ||= id !== oldId;
      const account = original.accountByPlatform?.[oldId];
      if (value != null) {
        const bank = account?.accountId ?? "";
        if (accountSeen.has(id) && accountSeen.get(id) !== bank) throw new Error(`Contas diferentes no recebimento ${r.id} (${r.date}), categoria ${id}`);
        accountSeen.set(id, bank);
      }
      if (id === "general") {
        if (value != null && r.general != null && (r.generalAccountId ?? "") !== (account?.accountId ?? "")) throw new Error(`Conta geral conflitante no recebimento ${r.id}`);
        if (value != null) { r.general = (r.general ?? 0) + value; if (account) r.generalAccountId = account.accountId; }
      } else {
        if (!(id in values)) values[id] = value;
        else if (value != null) values[id] = (values[id] ?? 0) + value;
        if (account) accounts[id] = account;
        if (original.residual?.[oldId]) residual[id] = original.residual[oldId];
      }
    }
    // Keep any old metadata with no value as well; no banking links are silently dropped.
    for (const [oldId, account] of Object.entries(original.accountByPlatform ?? {})) {
      const id = mapping.get(oldId) ?? oldId;
      if (id !== "general" && !accounts[id]) accounts[id] = account;
    }
    for (const [oldId, res] of Object.entries(original.residual ?? {})) residual[mapping.get(oldId) ?? oldId] ??= res;
    r.platforms = values;
    if (original.accountByPlatform) r.accountByPlatform = accounts;
    if (original.residual) r.residual = residual;
    if (changed) r.platformMigration = { at, sources: Object.entries(original.platforms).map(([id, value]) => ({ id, name: base.platforms.find((p) => p.id === id)?.name ?? id, value, account: original.accountByPlatform?.[id] ?? null, residual: original.residual?.[id] ?? null })), receiptId: original.id };
  }
  return { data: d, unknown, mapping: Object.fromEntries(mapping) };
}