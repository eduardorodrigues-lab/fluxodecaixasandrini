// Local read-only evidence extraction. Financial output must stay outside the repository.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readWorkbook } from "../src/lib/xlsxImport";
const [file, output, expected] = process.argv.slice(2);
if (!file || !output || !expected) throw new Error("arquivo, saída e SHA256 obrigatórios");
if (!output.startsWith("/tmp/")) throw new Error("saída financeira somente em /tmp");
const b = readFileSync(file);
const sha256 = createHash("sha256").update(b).digest("hex");
if (sha256 !== expected) throw new Error("SHA256 divergente; nenhuma conversão executada");
const sheets = readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
writeFileSync(output, JSON.stringify({ sha256, sheets }));
console.log(JSON.stringify({ sha256, sheets: sheets.map(s => ({ name: s.name, kind: s.kind, rows: s.rows.length })) }));