import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { prepareReplacement } from "../src/lib/replacementImport";
import { computeFlow } from "../src/lib/engine/engine";
import { excelSerialToISO } from "../src/lib/importer";
import { reconcile, type SheetInfo } from "../src/lib/xlsxImport";
const [input, output, evidenceFile] = process.argv.slice(2);
if (!input || !output?.startsWith("/tmp/")) throw new Error("entrada e pasta temporária obrigatórias");
const source = JSON.parse(readFileSync(input, "utf8")) as { sha256: string; sheets: SheetInfo[] };
const candidate = prepareReplacement(source.sheets, source.sha256, "FLUXO DE CAIXA SANDRINI 19.11.2026 (1) (1).xlsm");
const flow = source.sheets.find(s => s.kind === "fluxo");
if (!flow) throw new Error("Fluxo ausente");
const dates = (flow.rows[2] ?? []).map((v, c) => ({ date: c >= 3 && typeof v === "number" ? excelSerialToISO(v) : null, c })).filter(v => v.date !== null);
const first = dates[0], last = dates.at(-1);
if (!first?.date || !last?.date) throw new Error("Calendário ausente");
const opening = flow.rows[4]?.[first.c];
if (typeof opening !== "number") throw new Error("Saldo origem ausente");
candidate.data.params.startDate = first.date; candidate.data.params.saldoInicial = opening * 100; candidate.data.params.openingMode = "legado";
if (evidenceFile) {
  const evidence = JSON.parse(readFileSync(evidenceFile, "utf8")) as { sourceHash: string; openings: [string, number, string][]; datedExpenses: { row: number; date: string; cell: string; value: number }[] };
  if (evidence.sourceHash !== source.sha256) throw new Error("Evidência pertence a outra fonte");
  for (const [date, value, cell] of evidence.openings) {
    if (date === first.date) continue;
    candidate.data.adjustments.push({ date, value: value * 100, note: `Saldo origem explícito da fonte FLUXO DE CAIXA!${cell}; não é ajuste para fechar divergência nem saldo bancário` });
  }
  for (const repair of evidence.datedExpenses) {
    const entry = candidate.entries.find(e => e.entity === "expenses" && e.row === repair.row);
    if (!entry || entry.value !== repair.value) throw new Error("Reparo de data sem correspondência exata");
    // Re-run the already validated converter on source rows after a traceable date repair.
    const sheet = source.sheets.find(s => s.kind === "expenses");
    const row = sheet?.rows[repair.row - 1];
    if (!row || row[2] !== null) throw new Error("Reparo não aplicável");
    const originalRaw = [...entry.raw];
    row[2] = repair.date.split("-").reverse().join("/");
    const repaired = prepareReplacement(source.sheets, source.sha256, "FLUXO DE CAIXA SANDRINI 19.11.2026 (1) (1).xlsm");
    const record = repaired.data.expenses.find(e => e.importOrigin?.row === repair.row);
    if (!record) throw new Error("Reparo ainda inválido");
    if (record.importOrigin) record.importOrigin.raw = originalRaw;
    candidate.data.expenses.push(record);
    entry.raw = originalRaw; entry.id = record.id; entry.errors = []; entry.repairs.push(`Data C vazia reconstruída por célula única ${repair.cell}=${repair.value}, calendário linha 3=${repair.date}, G=0; raw original preservado`);
    const log = repaired.data.importLog.find(e => e.refId === record.id);
    if (log) candidate.data.importLog.push(log);
  }
}
const result = computeFlow(candidate.data, { start: first.date, end: last.date });
const reconciliation = reconcile(flow.rows, result.days);
mkdirSync(output, { recursive: true });
const serialized = JSON.stringify(candidate.data);
writeFileSync(`${output}/candidato.json`, serialized);
writeFileSync(`${output}/manifesto.json`, JSON.stringify({ ...candidate, data: undefined, candidateSha256: createHash("sha256").update(serialized).digest("hex"), horizon: [first.date, last.date], reconciliation: { ...reconciliation, rows: undefined }, counts: Object.fromEntries(Object.entries(candidate.data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length])) }, null, 2));
writeFileSync(`${output}/conciliacao.json`, JSON.stringify(reconciliation));
writeFileSync(`${output}/motor.json`, JSON.stringify(result));
console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(candidate.data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length])), quarantine: candidate.entries.filter(e => e.errors.length), classificationPending: candidate.entries.filter(e => e.classificationPending).length, horizon: [first.date, last.date], reconciliation: reconciliation.message }));