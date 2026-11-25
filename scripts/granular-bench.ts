// Isolated benchmark (in-process PGlite, synthetic ~12 MB document). Not representative of hosted latency/network;
// compares the monolithic document write against granular per-record writes on the same engine.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { produce } from 'immer';
import { normalizeData } from '../src/lib/engine/actions';
import { diffData } from '../src/lib/diff';
import { commitGranular, type Query } from '../src/lib/granular/adapter';
const ORG = '00000000-0000-4000-8000-000000000001', ED = '00000000-0000-4000-8000-0000000000e1';
const sups = Array.from({ length: 1200 }, (_, i) => ({ id: `s${i}`, name: `FORN ${i}`, group: '', terms: [30, 60, null, null, null, null, null, null, null, null], aliases: [] }));
const committed = Array.from({ length: 24000 }, (_, i) => ({ id: `c${i}`, supplierId: `s${i % 1200}`, purchaseCode: `P${i}`, document: `NF${i}`, value: 10000 + i, dueDate: '2026-12-10', extensionDate: null, extensionHistory: [], extensionInfo: 'x'.repeat(40), legacyAbatement: null, origin: 'manual', plannedId: null, effectivationId: null, notes: 'Observação sintética '.repeat(4), status: 'ativo', categoryId: 'cat1', baseDate: '2026-11-10' }));
const planned = Array.from({ length: 3500 }, (_, i) => ({ id: `p${i}`, supplierId: `s${i % 1200}`, purchaseCode: `PP${i}`, value: 500000, baseDate: '2026-11-01', status: 'ativo', categoryId: 'cat1', notes: 'Previsão sintética '.repeat(5) }));
const d = normalizeData({ suppliers: sups, committed, planned, categories: [{ id: 'cat1', name: 'Mercadoria', kind: 'compra', group: '' }] });
const json = JSON.stringify(d);
const db = new PGlite(); const q: Query = async (s, p) => (await db.query(s, p as unknown[])).rows as never;
await db.exec(readFileSync('db/granular/test-stubs.sql', 'utf8')); await db.exec(readFileSync('db/granular/001_schema.sql', 'utf8'));
await db.exec(`INSERT INTO organizations VALUES ('${ORG}','B'); INSERT INTO org_members VALUES ('${ORG}','${ED}','editor'); CREATE TABLE doc(org_id uuid primary key, data jsonb, version int); CREATE TABLE doc_audit(id serial, snap jsonb, changes jsonb);`);
let t = performance.now(); await q('SELECT fin_import_document($1,$2::jsonb,1,$3)', [ORG, json, 'b']); console.log('carga granular', (performance.now() - t).toFixed(0), 'ms, MB', (json.length / 1e6).toFixed(1));
await q(`UPDATE fin_org_state SET mode='granular'`); await q('INSERT INTO doc VALUES ($1,$2::jsonb,1)', [ORG, json]);
const stats = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return `mediana ${s[Math.floor(s.length / 2)]!.toFixed(1)} ms · p95 ${s[Math.floor(s.length * 0.95)]!.toFixed(1)} ms (n=${s.length})`; };
const N = 40, docT: number[] = [], granT: number[] = []; let cur = d;
for (let i = 0; i < N; i++) {
  const next = produce(cur, (x) => { x.committed[i]!.value = 1 + i; }); const ops = diffData(cur, next); cur = next;
  t = performance.now(); // modelo atual: lê o documento inteiro, aplica, regrava inteiro e guarda snapshot anterior
  const row = (await q<{ data: unknown }>('SELECT data FROM doc WHERE org_id=$1 FOR UPDATE', [ORG]))[0]!;
  const data = row.data as typeof d; data.committed[i]!.value = 1 + i;
  await q('INSERT INTO doc_audit(snap,changes) VALUES ($1::jsonb,$2::jsonb)', [JSON.stringify(row.data), JSON.stringify(ops)]);
  await q('UPDATE doc SET data=$2::jsonb, version=version+1 WHERE org_id=$1', [ORG, JSON.stringify(data)]); docT.push(performance.now() - t);
  t = performance.now(); const r = await commitGranular(q, { orgId: ORG, actor: ED, email: 'b', requestId: crypto.randomUUID(), ops }); granT.push(performance.now() - t);
  if (r.status !== 'committed') throw new Error('falhou');
}
console.log('documento único:', stats(docT), '· payload ~', (json.length / 1e6).toFixed(1), 'MB lido+gravado');
console.log('granular:      ', stats(granT), '· payload', JSON.stringify(diffData(d, produce(d, (x) => { x.committed[0]!.value = 5; }))).length, 'bytes');
