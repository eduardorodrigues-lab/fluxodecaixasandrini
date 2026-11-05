// Validação programática do XLSM real do CEO (somente leitura de valores cacheados; VBA nunca lido/executado).
// Uso: bun scripts/validate-ceo-xlsm.ts <arquivo.xlsm> [saida.json]
// NÃO grava em nenhuma organização: aplica a importação num cenário EM MEMÓRIA apenas para conciliar com o cache.
// O relatório contém agregados financeiros reais — gravar fora do projeto (ex.: /tmp), nunca em public/ ou assets.
import { readFileSync, writeFileSync } from "fs";
import { classify, mapRows, suggestMapping, type Entity, type ParsedRow } from "../src/lib/importer";
import { adaptCategories, adaptTargets, layoutMapping, readWorkbook, reconcile, type SheetInfo } from "../src/lib/xlsxImport";
import { applyImportRows } from "../src/lib/importApply";
import { emptyData, setMonthTarget } from "../src/lib/engine/actions";
import { computeFlow } from "../src/lib/engine/engine";

const file = process.argv[2]!;
const outPath = process.argv[3] ?? "/tmp/ceo-validacao.json";
const t0 = performance.now();
const buf = readFileSync(file);
const sheets = readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const readMs = Math.round(performance.now() - t0);
const rssMB = Math.round(process.memoryUsage().rss / 1e6);
const report: Record<string, unknown> = { arquivo: file.split("/").pop(), bytes: buf.byteLength, leitura: { ms: readMs, rssMB, abas: sheets.map((s) => ({ nome: s.name, tipo: s.kind, linhas: s.rows.length, colunasLidas: s.colsRead || "todas", celulasLidas: s.cellsRead, cabecalho: s.headerRow + 1 })) } };

let n = 0; const uid = () => `imp-${++n}`;
const at = "2026-11-05T00:00:00.000Z";
const x = emptyData();
const by = (k: string) => sheets.find((s) => s.kind === k);
const ents: Record<string, unknown> = {};
const top = (rows: ParsedRow[]) => { const m = new Map<string, number>(); for (const r of rows) for (const e of r.errors) { const k = e.replace(/\d+/g, "#"); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6); };

// Categorias (TABELA_DESPESAS A/B)
const cat = by("categorias");
if (cat) { const list = adaptCategories(cat.rows); for (const c of list) if (!c.errors.length && !x.categories.some((k) => k.name === c.name)) x.categories.push({ id: uid(), name: c.name, kind: "despesa", group: c.group }); ents.categorias = { linhas: list.length, comErro: list.filter((c) => c.errors.length).length, grupos: [...new Set(list.map((c) => c.group))].length }; }
// Metas
const tg = by("targets");
if (tg) { const a = adaptTargets(tg.rows); const ok = a.rows.filter((t) => !t.errors.length && t.faturamento !== null); for (const t of ok) setMonthTarget(x, t.month, { gross: t.faturamento!, ...(a.reducerB2 !== null ? { legacyReducer: a.reducerB2, divisorLegado: "30" as const } : {}), ...(a.lagC2 !== null ? { lagDays: a.lagC2 } : {}) }, "validação", at);
  ents.metas = { meses: a.rows.length, validos: ok.length, B2: a.reducerB2, C2: a.lagC2, primeiro: a.rows[0]?.month, ultimo: a.rows.at(-1)?.month, erros: a.rows.filter((t) => t.errors.length).map((t) => `${t.month}: ${t.errors.join("; ")}`).slice(0, 8), out2026: a.rows.find((t) => t.month === "2026-10") }; }
x.params.profile = "legado";

const order: Entity[] = ["suppliers", "planned", "committed", "expenses", "receipts"];
for (const e of order) {
  const s = sheets.find((k) => k.kind === e) as SheetInfo | undefined;
  if (!s) { ents[e] = "ABA AUSENTE — pendência"; continue; }
  const lm = layoutMapping(e, s.rows, s.headerRow, (h) => suggestMapping(e, h));
  const parsed = mapRows(e, s.rows.slice(s.headerRow + 1), lm.map, s.headerRow + 2).filter((r) => Object.values(r.values).some((v) => v !== null && v !== ""));
  const cls = classify(parsed, x.importLog);
  const cnt = (st: string) => cls.filter((r) => r.status === st).length;
  const ap = applyImportRows(x, e, cls, { file: String(report.arquivo), sheet: s.name, at, uid });
  ents[e] = { aba: s.name, cabecalho: s.headerRow + 1, layoutCEO: lm.fixed, mapeamento: lm.map, linhas: parsed.length, novos: cnt("novo"), conflitos: cnt("conflito"), invalidos: cnt("inválido"), aplicados: ap.applied, pulados: ap.skipped.length, exemplosPulados: ap.skipped.slice(0, 5), fornecedoresCriados: ap.createdSuppliers.length, categoriasCriadas: ap.createdCategories.length, plataformasCriadas: ap.createdPlatforms, errosPrincipais: top(cls) };
}

// Diagnósticos de colunas que pedem confirmação
const efet = by("committed")!, desp = by("expenses")!, plan = by("planned")!, rec = by("receipts")!, flx = by("fluxo")!;
const dataRows = (s: SheetInfo) => s.rows.slice(s.headerRow + 1).filter((r) => r.some((c) => c !== null && c !== ""));
const num = (c: unknown) => typeof c === "number";
report.diagnostico = {
  efetuadas_M_numerico: dataRows(efet).filter((r) => num(r[12])).length,
  efetuadas_codigoA_preenchido: dataRows(efet).filter((r) => r[0] != null && String(r[0]).trim()).length,
  efetuadas_H_L_parcelas_extras: dataRows(efet).filter((r) => r.slice(7, 12).some(num)).length,
  despesas_prazos_H_K_alem_de_G: dataRows(desp).filter((r) => r.slice(7, 11).some((c) => num(c) && (c as number) > 0)).length,
  despesas_G_vazio: dataRows(desp).filter((r) => r[6] == null).length,
  planejadas_valorE_zero: dataRows(plan).filter((r) => r[4] === 0).length,
  planejadas_formulas_prazos_linha4: Object.fromEntries(Object.entries(plan.formulas ?? {}).filter(([k]) => /^[F-O]4$/.test(k))),
  recebimentos_codigos: Object.fromEntries([...dataRows(rec).reduce((m, r) => m.set(String(r[0] ?? "").trim() || "(vazio)", (m.get(String(r[0] ?? "").trim() || "(vazio)") ?? 0) + 1), new Map<string, number>())]),
  recebimentos_valor_1_placeholder: dataRows(rec).filter((r) => r[5] === 1).length,
  fluxo_flags_C: { C6: flx.rows[5]?.[2], C11: flx.rows[10]?.[2], C12: flx.rows[11]?.[2] },
  fluxo_C1_TODAY_cache: flx.rows[0]?.[2],
};

// Conciliação: motor (dados importados em memória) vs cache FLUXO DE CAIXA, outubro/2026.
const fl = flx.rows;
const dateCol = (fl[2] ?? []).findIndex((c, i) => i >= 3 && c === 46296);
const saldo1 = fl[4]?.[dateCol];
x.params.startDate = "2026-10-01";
x.params.saldoInicial = typeof saldo1 === "number" ? Math.round(saldo1 * 100) : 0;
const res = computeFlow(x, { start: "2026-10-01", end: "2026-10-31" });
const rc = reconcile(fl, res.days);
const pick = ["2026-10-01", "2026-10-02", "2026-10-28"];
report.conciliacao = { ok: rc.ok, mensagem: rc.message, bloqueios: rc.blocked, rotulos: rc.labels, refOffsetDias: rc.refOffsetDays,
  aritmeticaCache: rc.arithmetic.filter((a) => pick.includes(a.date)),
  dias: pick.map((d) => ({ data: d, linhas: rc.rows.filter((r) => r.date === d).map((r) => ({ m: r.metric, excel: r.excel, motor: r.engine, dif: r.diff })) })),
  diasComDiferenca: [...new Set(rc.rows.filter((r) => r.diff !== null && Math.abs(r.diff) > 1).map((r) => r.date))].length,
  avisosMotor: [...res.warnings.reduce((m, w) => m.set(w.code, (m.get(w.code) ?? 0) + 1), new Map<string, number>())] };
report.entidades = ents;
report.totalMs = Math.round(performance.now() - t0);
writeFileSync(outPath, JSON.stringify(report, null, 1));
console.log(`leitura ${readMs} ms, rss ${rssMB} MB, total ${report.totalMs} ms → ${outPath}`);
