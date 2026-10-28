import { addDays, dateRange, daysInMonth, ym } from "../dates";
import { macroCurrency, roundCents } from "../money";
import type {
  Category, Committed, Day, Expense, FlowResult, Item, Params, Planned, Profile, Receipt, ScenarioData, Supplier, Warning,
} from "./types";

const isNum = (t: number | null | undefined): t is number => t !== null && t !== undefined && Number.isFinite(t);

// ---------- Regra A/B: estimativa diária ----------
export function dailyEstimate(p: Params, targets: Record<string, number>, date: string) {
  const ref = addDays(date, -p.lagDays);
  const month = ym(ref);
  const meta = targets[month];
  if (meta == null) return { value: 0, exact: 0, month, missing: true, liquid: 0, divisor: 0 };
  const dim = daysInMonth(ref);
  let liquid: number, divisor: number;
  if (p.profile === "legado") {
    liquid = meta * (1 - p.legacyReducer);
    divisor = p.divisorLegado === "30" ? 30 : dim;
  } else {
    const r1 = meta * p.webR1;
    const r2 = (meta - r1) * p.webR2;
    liquid = meta - r1 - r2;
    divisor = p.divisorWeb === "30" ? 30 : dim;
  }
  const exact = liquid / divisor;
  return { value: roundCents(exact), exact, month, missing: false, liquid, divisor };
}

// ---------- Regra C: recebimento informado ----------
export function receiptInformed(r: Receipt) {
  const plats = Object.values(r.platforms);
  const present = r.general !== null || plats.some(isNum);
  const platSum = plats.reduce<number>((a, v) => a + (isNum(v) ? v : 0), 0);
  const sum = platSum + (r.general ?? 0); // regra original SUM(D:O) inclui geral + plataformas
  const doubleCount = (r.general ?? 0) !== 0 && plats.some((v) => isNum(v) && v !== 0);
  return { sum, present, platSum, doubleCount };
}

// ---------- Regra D: planejadas ----------
export interface PlannedDist {
  parcels: { date: string; amount: number; exact: number; term: number }[];
  count: number; P: number; Q: number; R: number;
  health: "ok" | "abatimento_ausente" | "erro";
  roundingDiff: number; macroValue: number; linked: number;
  warnings: Warning[];
}
export function distributePlanned(pl: Planned, sup: Supplier | undefined, committed: Committed[], profile: Profile): PlannedDist {
  const warnings: Warning[] = [];
  const empty = (msg: string): PlannedDist => {
    warnings.push({ code: "PLAN_SEM_PRAZO", severity: "erro", message: msg, refId: pl.id });
    return { parcels: [], count: 0, P: 0, Q: 0, R: 0, health: "erro", roundingDiff: 0, macroValue: 0, linked: 0, warnings };
  };
  if (!sup) return empty(`Planejada ${pl.purchaseCode || pl.id}: fornecedor não encontrado.`);
  const terms = sup.terms.slice(0, 10);
  const linkedList = pl.purchaseCode
    ? committed.filter((c) => c.status !== "cancelado" && c.purchaseCode === pl.purchaseCode)
    : [];
  let used: number[], P: number, Q = 0, health: PlannedDist["health"] = "ok";
  if (profile === "web") {
    used = terms.filter(isNum); // zero numérico conta no COUNT
    if (!used.length) return empty(`Planejada ${pl.purchaseCode}: fornecedor sem prazos numéricos (COUNT=0).`);
    P = pl.value / used.length;
  } else {
    used = terms.filter((t): t is number => isNum(t) && t > 0); // COUNTIF(prazos,">0")
    if (!used.length) return empty(`Planejada ${pl.purchaseCode}: nenhum prazo > 0 (legado geraria #DIV/0!).`);
    P = pl.value / used.length;
    if (!pl.purchaseCode)
      warnings.push({ code: "PLAN_SEM_CODIGO", severity: "alerta", refId: pl.id, message: `Planejada sem código de compra: vínculo impossível, sem abatimento — risco de dupla contagem com efetuadas.` });
    const missing = linkedList.filter((c) => c.legacyAbatement === null);
    const known = linkedList.reduce((a, c) => a + (c.legacyAbatement ?? 0), 0);
    Q = known / used.length;
    if (missing.length) {
      health = "abatimento_ausente";
      warnings.push({ code: "PLAN_M_AUSENTE", severity: "erro", refId: pl.id, message: `Planejada ${pl.purchaseCode}: ${missing.length} efetuada(s) vinculada(s) sem "base de abatimento legado" (M). Saldo não confiável.` });
    }
  }
  const R = P - Q;
  if (R < 0)
    warnings.push({ code: "PLAN_NEGATIVO", severity: "alerta", refId: pl.id, message: `Planejada ${pl.purchaseCode}: saldo planejado negativo por parcela (mantido, não truncado).` });
  const parcels = used.map((t) => ({ date: addDays(pl.baseDate, t), amount: roundCents(R), exact: R, term: t }));
  const seen = new Set<string>();
  for (const pc of parcels) {
    if (seen.has(pc.date))
      warnings.push({ code: "PLAN_COLISAO", severity: "alerta", refId: pl.id, date: pc.date, message: `Planejada ${pl.purchaseCode}: duas parcelas na mesma data. A macro legada sobrescreve (atribuição); aqui são somadas. Pendência de conciliação.` });
    seen.add(pc.date);
  }
  const target = roundCents(R * used.length);
  const sum = parcels.reduce((a, p) => a + p.amount, 0);
  const roundingDiff = target - sum;
  if (roundingDiff !== 0)
    warnings.push({ code: "ARRED", severity: "info", refId: pl.id, message: `Planejada ${pl.purchaseCode}: diferença de arredondamento de ${roundingDiff} centavo(s) não redistribuída.` });
  return { parcels, count: used.length, P, Q, R, health, roundingDiff, macroValue: macroCurrency(R), linked: linkedList.length, warnings };
}

// ---------- Regras E/F: datas efetivas ----------
export function committedDate(c: Committed, profile: Profile): string {
  return profile === "web" ? c.extensionDate || c.dueDate : c.dueDate;
}
export function expenseDate(e: Expense, p: Params): string | null {
  const original = isNum(e.termDays) ? addDays(e.baseDate, e.termDays) : null;
  if (p.profile === "web" && p.webExpenseUseExtension && e.extensionDate) return e.extensionDate;
  return original;
}

export interface FlowOptions { start: string; end: string; filter?: { supplierId?: string; group?: string } }

export function computeFlow(data: ScenarioData, opt: FlowOptions): FlowResult {
  const p = data.params;
  const warnings: Warning[] = [];
  const supMap = new Map(data.suppliers.map((s) => [s.id, s]));
  const f = opt.filter ?? {};
  const filtered = !!(f.supplierId || f.group);
  const pass = (supplierId: string) => {
    if (f.supplierId && supplierId !== f.supplierId) return false;
    if (f.group && supMap.get(supplierId)?.group !== f.group) return false;
    return true;
  };
  const byDate = new Map<string, Item[]>();
  const push = (d: string, it: Item) => {
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(it);
  };
  const supName = (id: string) => supMap.get(id)?.name ?? "(sem fornecedor)";

  for (const pl of data.planned) {
    if (pl.status === "cancelado") continue;
    const dist = distributePlanned(pl, supMap.get(pl.supplierId), data.committed, p.profile);
    warnings.push(...dist.warnings);
    if (!pass(pl.supplierId)) continue;
    for (const pc of dist.parcels)
      push(pc.date, { source: "planejada", refId: pl.id, categoryId: pl.categoryId, amount: pc.amount, label: `${supName(pl.supplierId)} · ${pl.purchaseCode}`, note: `prazo ${pc.term}d${dist.health !== "ok" ? " · " + dist.health : ""}` });
  }
  for (const c of data.committed) {
    if (c.status === "cancelado") continue;
    if (p.profile === "legado" && c.extensionDate)
      warnings.push({ code: "LEG_PRORROG", severity: "info", refId: c.id, message: `Efetuada ${c.purchaseCode}: perfil legado usa vencimento original (G); prorrogação ignorada.` });
    if (!pass(c.supplierId)) continue;
    push(committedDate(c, p.profile), { source: "comprometida", refId: c.id, categoryId: c.categoryId, amount: c.value, label: `${supName(c.supplierId)} · ${c.purchaseCode} · ${c.document}` });
  }
  for (const e of data.expenses) {
    if (e.status === "cancelado") continue;
    const d = expenseDate(e, p);
    if (!d) {
      warnings.push({ code: "DESP_SEM_PRAZO", severity: "alerta", refId: e.id, message: `Despesa ${e.document}: prazo (G) vazio — não distribuída.` });
      continue;
    }
    if (p.profile === "web" && e.extensionDate && !p.webExpenseUseExtension)
      warnings.push({ code: "WEB_DESP_ORIG", severity: "info", refId: e.id, message: `Despesa ${e.document}: perfil Web usa data ORIGINAL; prorrogação não aplicada (divergência da fonte).` });
    if (!pass(e.supplierId)) continue;
    push(d, { source: "despesa", refId: e.id, categoryId: e.categoryId, amount: e.value, label: `${supName(e.supplierId)} · ${e.document}` });
  }
  const recByDate = new Map<string, { sum: number; present: boolean; items: Item[] }>();
  for (const r of data.receipts) {
    const inf = receiptInformed(r);
    if (inf.doubleCount)
      warnings.push({ code: "REC_DUPLA", severity: "alerta", refId: r.id, date: r.date, message: `Recebimento ${r.date}: geral e plataformas preenchidos. A regra original soma ambos — possível dupla contagem (não corrigido).` });
    const cur = recByDate.get(r.date) ?? { sum: 0, present: false, items: [] };
    cur.sum += inf.sum;
    cur.present ||= inf.present;
    cur.items.push({ source: "recebimento", refId: r.id, amount: inf.sum, label: `Recebimento informado${inf.doubleCount ? " (possível dupla contagem)" : ""}` });
    recByDate.set(r.date, cur);
  }
  const adjMap = new Map(data.adjustments.filter((a) => a.value !== null).map((a) => [a.date, a]));

  const days: Day[] = [];
  let carried = p.saldoInicial;
  for (const d of dateRange(p.startDate, opt.end)) {
    let ini = carried;
    let ajuste: Day["ajuste"] = null;
    const items: Item[] = [];
    const adj = adjMap.get(d);
    if (adj && adj.value !== null) {
      ajuste = { value: adj.value, diff: adj.value - ini, note: adj.note };
      items.push({ source: "ajuste", amount: adj.value, label: `Saldo substituído manualmente (dif. ${adj.value - ini})`, note: adj.note });
      ini = adj.value;
    }
    const est = dailyEstimate(p, data.targets, d);
    const rec = recByDate.get(d);
    const recInformado = rec?.sum ?? 0;
    const usouInformado = recInformado !== 0; // regra legado: informado != 0 substitui
    const recUsado = usouInformado ? recInformado : est.value;
    if (rec) items.push(...rec.items);
    items.push({ source: "estimativa", amount: est.value, label: `Estimativa (meta ${est.month}${est.missing ? " ausente" : ""})`, note: usouInformado ? "não usada: informado ≠ 0" : "usada" });
    const out = byDate.get(d) ?? [];
    items.push(...out);
    let planejada = 0, comprometida = 0, despesa = 0;
    const byCat: Record<string, number> = {};
    for (const it of out) {
      if (it.source === "planejada") planejada += it.amount;
      else if (it.source === "comprometida") comprometida += it.amount;
      else despesa += it.amount;
      const k = it.categoryId || "_sem";
      byCat[k] = (byCat[k] ?? 0) + it.amount;
    }
    const saidas = planejada + comprometida + despesa;
    const saldoFinal = ini - saidas + recUsado;
    days.push({ date: d, saldoInicial: ini, ajuste, recInformado, recInformadoPresente: !!rec?.present, recEstimado: est.value, recEstimadoExato: est.exact, usouInformado, recUsado, planejada, comprometida, despesa, byCat, saidas, entradasTotal: ini + recUsado, saldoFinal, items });
    carried = saldoFinal;
  }
  const outside = [...byDate.keys()].filter((d) => d < p.startDate).length;
  if (outside) warnings.push({ code: "ANTES_INICIO", severity: "alerta", message: `${outside} data(s) com saídas antes da data inicial do fluxo — não entram no saldo.` });
  const slice = days.filter((d) => d.date >= opt.start && d.date <= opt.end);
  let menor: Day | undefined = slice[0];
  for (const d of slice) if (!menor || d.saldoFinal < menor.saldoFinal) menor = d;
  return {
    days: slice, warnings, filtered,
    kpis: {
      saldoFinal: slice.at(-1)?.saldoFinal ?? 0,
      menorSaldo: menor?.saldoFinal ?? 0,
      menorSaldoData: menor ? menor.date : "",
      entradasSemSaldo: slice.reduce((a, d) => a + d.recUsado, 0),
      saidas: slice.reduce((a, d) => a + d.saidas, 0),
    },
  };
}

// ---------- Modelo de linhas compartilhado pelas DUAS visões ----------
export type TotalMode = "sum" | "first" | "last" | "entradas";
export interface Row {
  key: string; label: string; nature: string; group: string; level: number; parent?: string;
  values: number[]; total: number; totalMode: TotalMode; emphasis?: boolean;
  match?: (it: Item) => boolean;
}
export function rowTotal(values: number[], mode: TotalMode, days: Day[]): number {
  if (mode === "first") return values[0] ?? 0;
  if (mode === "last") return values.at(-1) ?? 0;
  if (mode === "entradas") return (days[0]?.saldoInicial ?? 0) + days.reduce((a, d) => a + d.recUsado, 0);
  return values.reduce((a, v) => a + v, 0);
}
export function buildRows(res: FlowResult, cats: Category[]): Row[] {
  const D = res.days;
  const rows: Row[] = [];
  const add = (r: Omit<Row, "total">) => rows.push({ ...r, total: rowTotal(r.values, r.totalMode, D) });
  add({ key: "entradas", label: "Entradas Total", nature: "Entradas", group: "", level: 0, values: D.map((d) => d.entradasTotal), totalMode: "entradas", emphasis: true });
  add({ key: "saldo_ini", label: "Saldo Inicial", nature: "Entradas", group: "Saldo", level: 1, parent: "entradas", values: D.map((d) => d.saldoInicial), totalMode: "first", match: (i) => i.source === "ajuste" });
  add({ key: "rec_real", label: "Recebimento Previsto/Real", nature: "Entradas", group: "Recebimentos", level: 1, parent: "entradas", values: D.map((d) => (d.usouInformado ? d.recInformado : 0)), totalMode: "sum", match: (i) => i.source === "recebimento" });
  add({ key: "rec_est", label: "Recebimento Estimado", nature: "Entradas", group: "Recebimentos", level: 1, parent: "entradas", values: D.map((d) => (d.usouInformado ? 0 : d.recEstimado)), totalMode: "sum", match: (i) => i.source === "estimativa" });
  add({ key: "saidas", label: "Saídas Total", nature: "Saídas", group: "", level: 0, values: D.map((d) => d.saidas), totalMode: "sum", emphasis: true, match: (i) => ["planejada", "comprometida", "despesa"].includes(i.source) });
  add({ key: "custo", label: "Custo de Produto", nature: "Saídas", group: "Compras", level: 1, parent: "saidas", values: D.map((d) => d.planejada + d.comprometida), totalMode: "sum", match: (i) => i.source === "planejada" || i.source === "comprometida" });
  const catRows = (kind: "planejada" | "comprometida" | "despesa", parent: string, group: string) => {
    for (const c of cats.filter((c) => c.kind === kind)) {
      add({ key: `cat_${c.id}`, label: c.name, nature: "Saídas", group, level: parent === "despesas" ? 2 : 3, parent, values: D.map((d) => d.byCat[c.id] ?? 0), totalMode: "sum", match: (i) => i.categoryId === c.id && i.source === kind });
    }
  };
  add({ key: "planejada", label: "Compras Planejadas", nature: "Saídas", group: "Compras", level: 2, parent: "custo", values: D.map((d) => d.planejada), totalMode: "sum", match: (i) => i.source === "planejada" });
  catRows("planejada", "planejada", "Compras");
  add({ key: "comprometida", label: "Compras Comprometidas", nature: "Saídas", group: "Compras", level: 2, parent: "custo", values: D.map((d) => d.comprometida), totalMode: "sum", match: (i) => i.source === "comprometida" });
  catRows("comprometida", "comprometida", "Compras");
  add({ key: "despesas", label: "Despesas Diversas", nature: "Saídas", group: "Despesas", level: 1, parent: "saidas", values: D.map((d) => d.despesa), totalMode: "sum", match: (i) => i.source === "despesa" });
  catRows("despesa", "despesas", "Despesas");
  add({ key: "saldo_fim", label: "Saldo Final", nature: "Saldo", group: "", level: 0, values: D.map((d) => d.saldoFinal), totalMode: "last", emphasis: true });
  return rows;
}
// Visão vertical: transposição do MESMO modelo de linhas.
export function toVertical(rows: Row[], days: Day[]) {
  return days.map((d, i) => ({ date: d.date, day: d, cells: Object.fromEntries(rows.map((r) => [r.key, r.values[i]])) as Record<string, number> }));
}
