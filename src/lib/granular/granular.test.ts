// @vitest-environment node
// Isolated database only (in-process PGlite). Never touches the project's backend.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { produce } from 'immer';
import { demoData } from '@/test/demoFixture';
import { diffData, applyOps, type Change } from '../diff';
import { normalizeData } from '../engine/actions';
import { buildRows, computeFlow } from '../engine/engine';
import type { ScenarioData } from '../engine/types';
import { applyDelta, commitGranular, readDelta, type Query } from './adapter';

const ORG = '00000000-0000-4000-8000-000000000001', OTHER = '00000000-0000-4000-8000-000000000002';
const EDITOR = '00000000-0000-4000-8000-0000000000e1', EDITOR2 = '00000000-0000-4000-8000-0000000000e2', VIEWER = '00000000-0000-4000-8000-0000000000f1', OUTSIDER = '00000000-0000-4000-8000-0000000000a1';
let db: PGlite; let q: Query; let base: ScenarioData;
const rid = () => crypto.randomUUID();
const commit = (ops: Change[], actor = EDITOR, requestId = rid(), dependencies?: { entity: string; id: string; data: unknown }[]) =>
  commitGranular(q, { orgId: ORG, actor, email: 'teste@example.test', requestId, ops, ...(dependencies ? { dependencies } : {}) });
const exported = async () => normalizeData((await q<{ d: unknown }>('SELECT public.fin_export_document($1) AS d', [ORG]))[0]!.d);
const flowTotals = (d: ScenarioData) => { const res = computeFlow(d, { start: '2026-01-01', end: '2027-12-31' }); return { days: res.days.map((x) => [x.date, x.saldoFinal ?? null, x.recUsado, x.planejada, x.comprometida, x.despesa]), rows: buildRows(res, d.categories).map((r) => [r.key, r.total]) }; };
const editValue = (d: ScenarioData, i: number, value: number) => diffData(d, produce(d, (x) => { x.committed[i]!.value = value; }));

beforeAll(async () => {
  db = new PGlite();
  q = async (sql, params) => (await db.query(sql, params as unknown[])).rows as never;
  await db.exec(readFileSync('db/granular/test-stubs.sql', 'utf8'));
  await db.exec(readFileSync('db/granular/001_schema.sql', 'utf8'));
  await db.exec(`INSERT INTO organizations VALUES ('${ORG}','Teste'),('${OTHER}','Outra');
    INSERT INTO org_members VALUES ('${ORG}','${EDITOR}','editor'),('${ORG}','${EDITOR2}','owner'),('${ORG}','${VIEWER}','viewer'),('${OTHER}','${OUTSIDER}','owner');`);
  const demo = normalizeData(demoData()); const t0 = demo.committed[0]!;
  base = normalizeData({ ...demo, committed: [...demo.committed, ...Array.from({ length: 40 }, (_, k) => ({ ...t0, id: `sint-${k}`, value: 1000 + k, document: `NF-S${k}` }))] });
  await q('SELECT public.fin_import_document($1,$2::jsonb,$3,$4)', [ORG, JSON.stringify(base), 7, 'sintetico']);
}, 60_000);

describe('persistência granular em banco isolado', () => {
  it('carga + reconstrução: paridade por registro, vínculo, dia e categoria', async () => {
    const back = await exported();
    expect(diffData(base, back)).toEqual([]);
    expect(flowTotals(back)).toEqual(flowTotals(base));
  });
  it('gravação recusada antes do corte (feature flag) e carga não repete', async () => {
    await expect(commit(editValue(base, 0, 1))).rejects.toThrow(/granular_disabled/);
    await expect(q('SELECT public.fin_import_document($1,$2::jsonb,$3,$4)', [ORG, '{}', 8, 'x'])).rejects.toThrow(/already_imported/);
    await q(`UPDATE fin_org_state SET mode='granular' WHERE org_id=$1`, [ORG]);
  });
  it('permissões: leitor e outra organização não gravam; RLS isola leitura', async () => {
    const ops = editValue(base, 0, 12345);
    await expect(commit(ops, VIEWER)).rejects.toThrow(/forbidden/);
    await expect(commit(ops, OUTSIDER)).rejects.toThrow(/forbidden/);
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${OUTSIDER}',false);`);
    const seen = await q<{ n: number }>('SELECT count(*)::int AS n FROM fin_committed');
    await expect(q('UPDATE fin_committed SET body = body')).rejects.toThrow();
    await expect(q(`SELECT public.fin_commit($1,$2,'x',$3,'d','[]'::jsonb)`, [ORG, OUTSIDER, rid()])).rejects.toThrow(/permission denied/);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${EDITOR}',false);`);
    const own = await q<{ n: number }>('SELECT count(*)::int AS n FROM fin_committed');
    await db.exec('RESET ROLE');
    expect(seen[0]!.n).toBe(0); expect(own[0]!.n).toBe(base.committed.length);
  });
  it('100→150→200 no mesmo registro: ordem preservada, resposta antiga não sobrescreve, histórico ordenado', async () => {
    const d0 = await exported(); const i = 1; const id = d0.committed[i]!.id;
    const d100 = produce(d0, (x) => { x.committed[i]!.value = 10000; }), d150 = produce(d100, (x) => { x.committed[i]!.value = 15000; }), d200 = produce(d150, (x) => { x.committed[i]!.value = 20000; });
    const r100 = rid(), op100 = diffData(d0, d100);
    expect((await commit(op100, EDITOR, r100)).status).toBe('committed');
    expect((await commit(diffData(d100, d150))).status).toBe('committed');
    expect((await commit(diffData(d150, d200))).status).toBe('committed');
    const late = await commit(op100, EDITOR, r100); // resposta perdida/atrasada reenviada com a mesma identificação
    expect(late.replayed).toBe(true);
    expect((await exported()).committed.find((c) => c.id === id)!.value).toBe(20000);
    const hist = await q<{ v: number }>(`SELECT (after->>'value')::int AS v FROM fin_audit WHERE record_id=$1 ORDER BY seq`, [id]);
    expect(hist.map((h) => h.v)).toEqual([10000, 15000, 20000]);
    const stale = await commit(diffData(d0, produce(d0, (x) => { x.committed[i]!.value = 99; }))); // "antes" desatualizado
    expect(stale.status).toBe('conflict');
  });
  it('mesma identificação com conteúdo diferente é recusada', async () => {
    const d = await exported(); const r = rid();
    await commit(editValue(d, 2, 777), EDITOR, r);
    await expect(commit(editValue(d, 2, 778), EDITOR, r)).rejects.toThrow(/payload_mismatch/);
  });
  it('dois editores: registros diferentes gravam; mesmo registro gera conflito sem sobrescrever', async () => {
    const d = await exported();
    const [a, b] = await Promise.all([commit(editValue(d, 3, 3333), EDITOR), commit(editValue(d, 4, 4444), EDITOR2)]);
    expect([a.status, b.status]).toEqual(['committed', 'committed']);
    const first = await commit(editValue(d, 5, 5555), EDITOR);
    const second = await commit(editValue(d, 5, 6666), EDITOR2);
    expect(first.status).toBe('committed'); expect(second.status).toBe('conflict');
    expect((await exported()).committed[5]!.value).toBe(5555);
  });
  it('lote atômico de 20+ parcelas: um conflito impede tudo; fora da seleção intacto', async () => {
    const d = await exported(); const n = Math.min(22, d.committed.length - 1);
    const next = produce(d, (x) => { for (let i = 0; i < n; i++) x.committed[i]!.notes = `lote ${i}`; });
    const ops = diffData(d, next);
    await commit(editValue(d, 0, 1), EDITOR2); // outra pessoa altera um item do lote antes
    expect((await commit(ops)).status).toBe('conflict');
    const after = await exported();
    expect(after.committed.slice(1, n).every((c, k) => c.notes === d.committed[k + 1]!.notes)).toBe(true);
  });
  it('fornecedor + condição + lançamento juntos; dependência alterada por outro bloqueia', async () => {
    const d = await exported(); const sup = d.suppliers[0]!;
    const next = produce(d, (x) => { x.suppliers.push({ ...JSON.parse(JSON.stringify(sup)), id: 'novo-sup', name: 'NOVO SINT' }); x.committed.push({ ...JSON.parse(JSON.stringify(d.committed[0]!)), id: 'novo-tit', supplierId: 'novo-sup' }); });
    expect((await commit(diffData(d, next))).status).toBe('committed');
    const cur = await exported();
    const dep = [{ entity: 'Fornecedor', id: sup.id, data: cur.suppliers.find((s) => s.id === sup.id) }];
    await commit(diffData(cur, produce(cur, (x) => { x.suppliers.find((s) => s.id === sup.id)!.name = 'RENOMEADO'; })), EDITOR2);
    const r = await commit(editValue(cur, 6, 616), EDITOR, rid(), dep);
    expect(r.status).toBe('conflict'); expect(r.conflicts?.[0]?.dependency).toBe(true);
  });
  it('leitura incremental reproduz o documento sem recarga integral; recuperação inclui escritas após o corte', async () => {
    const cached = await exported(); const since = Number((await q<{ s: string }>('SELECT max(changed_seq) AS s FROM fin_committed'))[0]!.s);
    const d1 = produce(cached, (x) => { x.receipts[0] && (x.receipts[0].general = 0); x.targets['2027-01'] = 123456; });
    await commit(diffData(cached, d1));
    const delta = await readDelta(q, ORG, since);
    expect(delta.ops.length).toBeLessThan(10);
    const diff = diffData(normalizeData(applyDelta(cached, delta.ops)), await exported()); if (diff.length) console.log(JSON.stringify(diff).slice(0, 1500));
    expect(diff).toEqual([]);
    // zero explícito preservado (≠ vazio)
    if (cached.receipts[0]) expect((await exported()).receipts[0]!.general).toBe(0);
    // "rollback" = documento exportado das linhas atuais (não o JSON congelado), igual a aplicar as mesmas alterações ao documento
    expect(diffData(normalizeData(applyOps(cached, diffData(cached, d1), false).data), await exported())).toEqual([]);
  });
  it('falha transacional não deixa gravação parcial nem operação registrada', async () => {
    const d = await exported(); const r = rid();
    const ops = [...editValue(d, 7, 7070), { entity: 'Desconhecida', id: 'x', kind: 'alteração', before: null, after: {}, fields: [] } as Change];
    await expect(commit(ops, EDITOR, r)).rejects.toThrow(/entidade desconhecida/);
    expect((await exported()).committed[7]!.value).toBe(d.committed[7]!.value);
    expect((await q('SELECT 1 FROM fin_operations WHERE request_id=$1', [r])).length).toBe(0);
  });
});
