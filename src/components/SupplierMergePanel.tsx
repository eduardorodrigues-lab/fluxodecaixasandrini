import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, GitMerge, Link2, ShieldCheck, X } from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "@/lib/store";
import { useOperationSave } from "./useOperationSave";
import { applyManualMerge, mergeStateDigest, reviewManualMerge, type DefaultDecision } from "@/lib/manualMerge";
import { termsLabel } from "./TermsEditor";
import { fmtBRL as brl } from "@/lib/money";
import { todaySP } from "@/lib/engine/actions";
import { fmtDate } from "@/lib/dates";

/** Revisão + confirmação única da unificação manual dentro do card principal (sem painel por cima). */
export function SupplierMergePanel({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: (principalId: string) => void }) {
  const app = useApp(); const saving = useOperationSave(); const d = app.active.data;
  const today = todaySP();
  const [frozen] = useState(() => ({ digest: mergeStateDigest(d, ids), ids: [...ids] }));
  const [principalId, setPrincipalId] = useState<string | null>(null);
  const [finalName, setFinalName] = useState("");
  const [reason, setReason] = useState(""); const [ack, setAck] = useState<string[]>([]); const [cnpj, setCnpj] = useState<string | null>(null);
  const [decision, setDecision] = useState<DefaultDecision | null>(null); const [msg, setMsg] = useState("");
  const r = useMemo(() => reviewManualMerge(d, frozen.ids, principalId, finalName, today), [d, frozen.ids, principalId, finalName, today]);
  const stale = mergeStateDigest(d, frozen.ids) !== frozen.digest;
  const pDefault = r.principal ? r.defaults.find((x) => x.supplierId === r.principal!.id) : undefined;
  const needAck = r.conflicts.filter((c) => c.code === "razao" || c.code.startsWith("codigo:"));
  const blocking = r.conflicts.filter((c) => c.blocking && c.code !== "cnpj" && !needAck.includes(c));
  const cnpjs = [...new Set(r.members.map((s) => (s.cnpj ?? "").replace(/\D/g, "")).filter(Boolean))];
  // Após envio capturado, repetir reenvia o MESMO requestId (o servidor reconhece/recusa duplicata); nunca nova operação.
  const ready = !stale && !blocking.length && needAck.every((c) => ack.includes(c.code)) && (cnpjs.length < 2 || !!cnpj) && !!decision && reason.trim().length >= 5 && r.financeEqual;
  const confirm = async () => {
    if ((!ready && !saving.retrying) || !r.principal) return; setMsg("");
    const by = app.user?.email ?? ""; const at = new Date().toISOString(); const requestId = crypto.randomUUID();
    const ok = await saving.saveMutation(d, (x) => { applyManualMerge(x, { requestId, at, by, principalId: r.principal!.id, ids: frozen.ids, finalName, reason, defaultDecision: decision, cnpjDecision: cnpj, acknowledged: ack }); }, frozen.ids);
    if (ok) onDone(r.principal.id);
  };
  const rel = (k: keyof typeof r.total) => r.total[k];
  return <aside className="sup-card sup-detail merge-panel min-w-0" aria-label="Unificar fornecedores">
    <header className="sup-head"><span className="sup-avatar"><GitMerge className="size-7" /></span>
      <div className="min-w-0 flex-1"><h2 className="sup-title">Unificar fornecedores</h2><p className="text-sm text-muted-foreground">{frozen.ids.length} cadastros escolhidos por ID. Nada é gravado até “Confirmar unificação”.</p></div>
      <Button variant="ghost" size="icon" aria-label="Fechar unificação" onClick={onClose}><X className="size-4" /></Button></header>
    {stale && !saving.retrying && <p role="alert" className="text-destructive">Um fornecedor selecionado ou seus vínculos mudou desde a abertura. Feche e revise novamente; nada foi gravado.</p>}
    <section><h3>1. Cadastro principal (mantém o ID)</h3>
      <div className="space-y-1">{r.members.map((s) => <label key={s.id} className="flex items-start gap-2"><input type="radio" name="principal" checked={principalId === s.id} onChange={() => { setPrincipalId(s.id); setFinalName(s.name); }} /><span><strong>{s.name}</strong> <code className="text-xs text-muted-foreground">{s.id}</code>{s.legalName && <span className="block text-xs text-muted-foreground">{s.legalName}</span>}</span></label>)}</div>
      {r.ineligible.map((x) => <p key={x.id} className="text-destructive text-sm">{x.id}: {x.reason}</p>)}
      <label className="mt-2 block"><span className="lbl">Nome comercial final</span><input className="inp w-full" aria-label="Nome comercial final" value={finalName} onChange={(e) => setFinalName(e.target.value)} disabled={!principalId} /></label>
    </section>
    {r.principal && <>
      <section><h3><Link2 className="size-4 text-primary" />2. Incorporados → principal</h3>
        <table><thead><tr><th>Incorporado</th><th>ID</th><th>Destino</th></tr></thead><tbody>{r.members.filter((s) => s.id !== r.principal!.id).map((s) => <tr key={s.id}><td>{s.name}</td><td><code className="text-xs">{s.id}</code></td><td>{finalName || r.principal!.name} <code className="text-xs">{r.principal!.id}</code></td></tr>)}</tbody></table>
        <p className="mt-1 text-sm"><span className="lbl">Apelidos/referências históricas após:</span> {r.aliasesAfter.join(", ") || "—"}</p>
        <p className="text-xs text-muted-foreground">Incorporados ficam como redirecionamento rastreável (não aparecem como ativos). Somente estes IDs são unidos — nenhum outro por nome ou apelido.</p>
      </section>
      <section><h3>3. Dados cadastrais antes / depois</h3>
        <table><thead><tr><th>Campo</th><th>Antes (principal)</th><th>Depois</th></tr></thead><tbody>{Object.keys(r.before).map((k) => <tr key={k}><td>{k}</td><td>{r.before[k]}</td><td>{r.after[k] ?? "—"}</td></tr>)}</tbody></table>
      </section>
      <section><h3><AlertTriangle className="size-4 text-warning-foreground" />4. Conflitos</h3>
        {!r.conflicts.length && <p className="text-sm">Nenhum conflito de identidade.</p>}
        {blocking.map((c) => <p key={c.code} className="text-destructive text-sm">{c.message}</p>)}
        {cnpjs.length > 1 && <div className="text-sm"><p>{r.conflicts.find((c) => c.code === "cnpj")?.message}</p>{cnpjs.map((c) => <label key={c} className="mr-3"><input type="radio" name="cnpj" checked={cnpj === c} onChange={() => setCnpj(c)} /> {c}</label>)}</div>}
        {needAck.map((c) => <label key={c.code} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ack.includes(c.code)} onChange={() => setAck(ack.includes(c.code) ? ack.filter((x) => x !== c.code) : [...ack, c.code])} /><span>{c.message}</span></label>)}
      </section>
      <section><h3><CreditCard className="size-4 text-primary" />5. Condições preservadas ({r.conditions.length})</h3>
        <div className="overflow-x-auto"><table><thead><tr><th>Cadastro</th><th>Condição</th><th>Prazos</th><th>Tipo</th><th>Datas / restrições</th><th>Resultado</th></tr></thead><tbody>{r.conditions.map((c) => <tr key={`${c.supplierId}-${c.condition.id}`}><td>{c.supplierName}</td><td>{c.condition.name}{c.wasDefault && <span className="sup-pill sup-pill-ok ml-1">vigente hoje</span>}{c.condition.cancelled && <span className="sup-pill sup-pill-bad ml-1">inativa</span>}</td><td>{termsLabel(c.condition.terms) || "Sem prazos"}</td><td>{c.condition.kind ?? "—"}</td><td>{[...(c.condition.periods ?? []).map((p) => p.from ? fmtDate(p.from) : "sem início"), c.condition.scope, c.condition.note].filter(Boolean).join(" · ") || "—"}</td><td className="text-xs">{c.result}</td></tr>)}</tbody></table></div>
        <div className="mt-2 text-sm" role="group" aria-label="Condição padrão">
          <p className="font-medium">Condição padrão — decisão obrigatória</p>
          {pDefault ? <label className="flex gap-2"><input type="radio" name="dec" checked={decision === "manter_principal"} onChange={() => setDecision("manter_principal")} /><span>Manter como está a vigência atual do principal (“{pDefault.condition}”). Condições dos incorporados entram sem vigência.</span></label>
            : <label className="flex gap-2"><input type="radio" name="dec" checked={decision === "sem_padrao_existente"} onChange={() => setDecision("sem_padrao_existente")} /><span>O principal fica sem condição vigente; a condição padrão será definida manualmente depois.</span></label>}
          {r.defaults.filter((x) => x.supplierId !== r.principal!.id).map((x) => <p key={x.supplierId} className="text-xs text-muted-foreground">Padrão anterior de “{x.name}”: “{x.condition}” — preservado no cadastro incorporado; NÃO é herdado como vigente.</p>)}
        </div>
      </section>
      <section><h3>6. Vínculos afetados</h3>
        <table><thead><tr><th>Cadastro</th><th>Planejadas</th><th>Efetivadas</th><th>Despesas</th><th>Parcelas</th><th>Pagamentos</th><th>Documentos</th><th>Pedidos</th><th>Importação</th></tr></thead><tbody>
          {r.relations.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.rel.planned}</td><td>{x.rel.committed}</td><td>{x.rel.expenses}</td><td>{x.rel.parcels}</td><td>{x.rel.payments}</td><td>{x.rel.documents}</td><td>{x.rel.purchaseCodes}</td><td>{x.rel.importLog}</td></tr>)}
          <tr className="font-semibold"><td>Total</td><td>{rel("planned")}</td><td>{rel("committed")}</td><td>{rel("expenses")}</td><td>{rel("parcels")}</td><td>{rel("payments")}</td><td>{rel("documents")}</td><td>{rel("purchaseCodes")}</td><td>{rel("importLog")}</td></tr></tbody></table>
        <p className="mt-1 text-xs text-muted-foreground">Valores, datas, vencimentos, prorrogações, parcelas, pagamentos e situações não mudam; só o fornecedor vinculado passa ao principal. Nenhum título é recalculado.</p>
        {r.unlinkedExpenses.length > 0 && <p className="mt-1 text-sm text-warning-foreground">Não migráveis: {r.unlinkedExpenses.length} despesa(s) sem fornecedor vinculado com texto igual a um nome selecionado — ficam como pendência separada, sem vínculo por texto.</p>}
      </section>
      <section><h3><ShieldCheck className="size-4 text-primary" />7. Resumo financeiro</h3>
        <p className="text-sm">Antes (soma dos selecionados): <strong>{brl(r.financeBefore)}</strong> · Depois (principal consolidado): <strong>{brl(r.financeAfter)}</strong> {r.financeEqual ? <span className="sup-pill sup-pill-ok"><CheckCircle2 className="size-3" />iguais</span> : <span className="sup-pill sup-pill-bad">diferença — confirmação bloqueada</span>}</p>
      </section>
      <section><h3>8. Justificativa</h3><textarea className="inp w-full" rows={2} aria-label="Justificativa" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da unificação (fica no histórico)" /></section>
    </>}
    {(msg || saving.error) && <p role="alert" className="text-destructive">{msg || saving.error}</p>}
    <footer className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
      <Button variant="outline" onClick={onClose} disabled={saving.saving}>Cancelar</Button>
      <Button onClick={() => void confirm()} disabled={(!ready && !saving.retrying) || saving.saving}>{saving.saving || saving.retrying ? saving.saveLabel : "Confirmar unificação"}</Button>
    </footer>
  </aside>;
}
