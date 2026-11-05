import { strFromU8, unzipSync } from "fflate";
import type { Cell } from "./importer";

// Leitor SELETIVO de .xlsx/.xlsm: descompacta uma aba por vez, lê apenas valores CACHEADOS das colunas
// necessárias (pula o resto de cada linha) e ignora vbaProject.bin/calcChain.xml (VBA nunca é lido nem executado).
// Motivo: o XLSM real do CEO (31 MB, ~340 MB descompactado, matrizes distribuídas com milhões de células)
// leva ~25 s e ~2,8 GB com leitura completa — inviável no navegador.
export interface RawSheet { name: string; rows: Cell[][]; formulas: Record<string, string>; maxRow: number; cellsRead: number }

const unesc = (s: string) => (s.indexOf("&") < 0 ? s : s.replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g, (_, e: string) =>
  e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'" : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))));
const colIdx = (letters: string) => { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1; };
const textOf = (xml: string) => { let out = ""; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let m; while ((m = re.exec(xml))) out += m[1]; return unesc(out); };

function one(buf: Uint8Array, path: string): string | null {
  const f = unzipSync(buf, { filter: (x) => x.name === path });
  const u = f[path];
  return u ? strFromU8(u) : null;
}

export function listSheets(buf: Uint8Array): { name: string; path: string }[] {
  const wb = one(buf, "xl/workbook.xml") ?? "";
  const rels = one(buf, "xl/_rels/workbook.xml.rels") ?? "";
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && t) target.set(id, t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""));
  }
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unesc(/name="([^"]*)"/.exec(m[0])?.[1] ?? ""), path: target.get(/r:id="([^"]+)"/.exec(m[0])?.[1] ?? "") ?? "" }));
}

export function sharedStrings(buf: Uint8Array): string[] {
  const xml = one(buf, "xl/sharedStrings.xml");
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g; let m;
  while ((m = re.exec(xml))) out.push(m[1] ? textOf(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")) : "");
  return out;
}

/** Lê uma aba até `maxCols` colunas (0 = todas). Fórmulas só são guardadas para linhas ≤ formulaRows (análise). */
export function readSheet(buf: Uint8Array, path: string, sst: string[], maxCols: number, formulaRows = 4, maxRows = Infinity): Omit<RawSheet, "name"> {
  const xml = one(buf, path) ?? "";
  const rows: Cell[][] = [];
  const formulas: Record<string, string> = {};
  let cellsRead = 0, maxRow = 0;
  const lim = maxCols > 0 ? maxCols : Infinity;
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/y;
  let pos = xml.indexOf("<sheetData");
  while (pos >= 0) {
    const rs = xml.indexOf("<row ", pos);
    if (rs < 0) break;
    const rEnd = xml.indexOf(">", rs);
    const rNum = Number(/r="(\d+)"/.exec(xml.slice(rs, rEnd))?.[1] ?? rows.length + 1);
    if (rNum > maxRows) break;
    const close = xml.indexOf("</row>", rEnd);
    if (xml[rEnd - 1] === "/") { pos = rEnd + 1; continue; } // <row/> vazia
    const row: Cell[] = [];
    let p = rEnd + 1;
    while (p < close) {
      while (xml[p] === " " || xml[p] === "\n" || xml[p] === "\r" || xml[p] === "\t") p++;
      if (p >= close || !xml.startsWith("<c ", p)) break;
      cellRe.lastIndex = p;
      const m = cellRe.exec(xml);
      if (!m) break;
      const c = colIdx(m[1]!);
      if (c >= lim) break; // resto da linha não é lido (matriz distribuída)
      p = cellRe.lastIndex;
      const body = m[5];
      if (!body) continue;
      const t = /\bt="([^"]+)"/.exec(m[3]!)?.[1] ?? "n";
      if (rNum <= formulaRows) { const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1]; if (f) formulas[`${m[1]}${rNum}`] = "=" + unesc(f); }
      let v: Cell = null;
      if (t === "inlineStr") v = textOf(body);
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (raw === undefined) continue;
        if (t === "s") v = sst[Number(raw)] ?? "";
        else if (t === "str" || t === "e") v = unesc(raw); // erro (#REF!, #N/A…) preservado como texto → inválido no importador
        else if (t === "b") v = raw === "1";
        else { const n = Number(raw); v = Number.isFinite(n) ? n : unesc(raw); }
      }
      row[c] = v; cellsRead++;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    while (rows.length < rNum - 1) rows.push([]);
    rows[rNum - 1] = row;
    maxRow = rNum;
    pos = close + 6;
  }
  return { rows, formulas, maxRow, cellsRead };
}
