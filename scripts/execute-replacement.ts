// One-shot audited replacement through the same contract as commitOfficial: caller membership (RLS) → expected version
// → normalize/diff → service RPC commit_official (version check, idempotent request_id, audit + snapshot_before).
// Never retries blindly: any error/timeout is reconciled by reading audit_log for the fixed requestId.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeData } from "../src/lib/engine/actions";
import { diffData, summarize } from "../src/lib/diff";
import { computeFlow } from "../src/lib/engine/engine";
import { fractionalCentFields } from "../src/lib/replacementImport";
const [mode, candidatePath, backupPath, expectedBackupSha, sourcePath, out] = process.argv.slice(2);
const ORG = "e197262e-1453-49b0-aad9-878e80602ee4", SOURCE_SHA = "ea1c4241d2268fb7198c187dcd95db0f4ee328016159e4364bb4e903db338cbe";
if (!["dry", "execute"].includes(mode ?? "") || !candidatePath || !backupPath || !expectedBackupSha || !sourcePath || !out?.startsWith("/tmp/")) throw new Error("uso: dry|execute candidato backup sha fonte /tmp/saida");
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const log: Record<string, unknown> = { mode, at: new Date().toISOString() };
const save = () => writeFileSync(out, JSON.stringify(log, null, 2));
if (sha(readFileSync(sourcePath)) !== SOURCE_SHA) throw new Error("SHA256 da fonte divergente");
const candidateText = readFileSync(candidatePath, "utf8"); log.candidateSha256 = sha(candidateText);
const backupBuf = readFileSync(backupPath); if (sha(backupBuf) !== expectedBackupSha) throw new Error("backup divergente do hash registrado");
const backup = JSON.parse(backupBuf.toString("utf8")) as { org_id: string; version: number; data: unknown };
if (backup.org_id !== ORG) throw new Error("backup de outra organização");
const candidate = normalizeData(JSON.parse(candidateText));
if (candidate.params.baseGeneration !== `xlsm-${SOURCE_SHA}`) throw new Error("candidato sem geração da fonte");
const frac = fractionalCentFields(candidate); if (frac.length) throw new Error("centavos fracionários no candidato");
// Request id fixed by candidate content → retry of the same candidate is idempotent in commit_official.
const h = sha(`sandrini-replacement|${ORG}|${log.candidateSha256}`);
const requestId = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; log.requestId = requestId;
const url = process.env.SUPABASE_URL!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!, pub = process.env.SUPABASE_PUBLISHABLE_KEY!;
const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "{}") as { access_token?: string; user?: { id: string; email?: string } };
if (!url || !service || !pub || !session.access_token || !session.user) throw new Error("credenciais de execução ausentes");
const admin = createClient(url, service, { auth: { persistSession: false } });
const userClient = createClient(url, pub, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
const audited = async () => { const { data, error } = await admin.from("audit_log").select("version_from, version_to, at, summary").eq("org_id", ORG).eq("request_id", requestId).maybeSingle(); if (error) throw new Error("falha ao consultar auditoria"); return data; };
async function main() {
  const { data: mem, error: me } = await userClient.from("org_members").select("org_id, role").eq("user_id", session.user!.id).eq("org_id", ORG).maybeSingle();
  if (me || !mem) throw new Error("membership não confirmada pela própria sessão"); if (mem.role !== "owner") throw new Error("papel sem autorização de substituição");
  log.actor = { id: session.user!.id, email: session.user!.email, role: mem.role };
  const prior = await audited(); if (prior) { log.alreadyApplied = prior; save(); console.log(JSON.stringify(log)); return; }
  const { data: cur, error: ce } = await admin.from("official_data").select("data, version").eq("org_id", ORG).single();
  if (ce || !cur) throw new Error("falha ao ler oficial");
  log.versionRead = cur.version;
  if (cur.version !== backup.version) { log.aborted = "versão avançou após o backup; refazer leitura/backup — nada gravado"; save(); console.log(JSON.stringify(log)); return; }
  // Backup integrity/restore payload: identical to current official after the same normalization the contract applies.
  const curN = normalizeData(cur.data), backN = normalizeData(backup.data);
  log.backupRestoreDiff = diffData(curN, backN).length;
  if (log.backupRestoreDiff !== 0) throw new Error("backup não reproduz a base atual");
  // Full before/after of every removed/added record duplicates snapshot_before (old document, same audit row) and the new
  // official version; a 46 MB payload exceeded the gateway limit (first attempt: 520, verified not applied). Inclusions and
  // exclusions keep entity/id/kind/fields; alterations keep complete before/after.
  const changes = diffData(curN, candidate).map(c => c.kind === "alteração" ? c : { ...c, before: null, after: null, fields: c.fields });
  const summary = `Substituição integral pela fonte única ${SOURCE_SHA.slice(0, 12)} (candidato ${String(log.candidateSha256).slice(0, 12)}): ` + summarize(changes) + ". Valores completos: antes = snapshot_before desta auditoria; depois = versão gravada.";
  log.changes = changes.length; log.changesBytes = JSON.stringify(changes).length; log.summary = summary;
  if (mode === "dry") { save(); console.log(JSON.stringify(log)); return; }
  const t0 = Date.now();
  const { data: res, error } = await admin.rpc("commit_official", { _org: ORG, _user: session.user!.id, _email: session.user!.email ?? "", _expected: cur.version, _data: candidate as never, _request: requestId, _summary: summary, _changes: changes as never });
  log.rpcMs = Date.now() - t0; log.rpc = error ? { error: error.code ?? error.message } : res;
  if (error) { log.reconciled = await audited(); }
  const { data: after } = await admin.from("official_data").select("data, version").eq("org_id", ORG).single();
  if (after) {
    const a = normalizeData(after.data);
    log.after = { version: after.version, diffToCandidate: diffData(a, candidate).length, counts: Object.fromEntries(Object.entries(a).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length])), generation: a.params.baseGeneration };
    const opt = { start: "2025-01-01", end: "2030-12-31" };
    log.flowEqual = JSON.stringify(computeFlow(a, opt).days) === JSON.stringify(computeFlow(candidate, opt).days);
  }
  log.audit = await audited(); save(); console.log(JSON.stringify(log));
}
main().catch(e => { log.error = (e as Error).message; save(); console.error(JSON.stringify(log)); process.exit(1); });
