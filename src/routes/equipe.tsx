import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/kit";
import { fmtDate } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { createInvite, getTeam, removeMember, revokeInvite } from "@/lib/team.functions";

export const Route = createFileRoute("/equipe")({
  head: () => ({ meta: [
    { title: "Equipe e acesso · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Convites individuais, papéis e revogação de acesso à organização." },
    { property: "og:title", content: "Equipe e acesso · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Gestão de acesso da organização." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

const ACTION: Record<string, string> = { convite_criado: "Convite criado", convite_revogado: "Convite revogado", convite_aceito: "Convite aceito", acesso_revogado: "Acesso revogado" };
const ERR: Record<string, string> = { forbidden: "Apenas owner pode fazer isso.", invalid: "Operação inválida.", last_owner: "Não é possível remover o último owner." };
const dt = (s: string | null) => (s ? `${fmtDate(s.slice(0, 10))} ${s.slice(11, 16)}` : "—");

function Page() {
  const { user, official } = useApp();
  const orgId = official.orgId;
  const qc = useQueryClient();
  const fTeam = useServerFn(getTeam), fCreate = useServerFn(createInvite), fRevoke = useServerFn(revokeInvite), fRemove = useServerFn(removeMember);
  const q = useQuery({ queryKey: ["official", "team", orgId], queryFn: () => fTeam({ data: { orgId } }), enabled: !!orgId && official.role === "owner" });
  const [email, setEmail] = useState(""); const [role, setRole] = useState<"editor" | "viewer">("viewer"); const [days, setDays] = useState(7);
  const [link, setLink] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["official", "team", orgId] });
  const run = async (fn: () => Promise<string>) => { if (busy) return; setBusy(true); setMsg(""); try { const s = await fn(); setMsg(s === "ok" ? "Feito." : ERR[s] ?? s); refresh(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };

  if (!user) return <div><PageHeader title="Equipe e acesso" /><p className="card p-3 text-xs">Disponível somente com login.</p></div>;
  if (official.role !== "owner") return <div><PageHeader title="Equipe e acesso" /><p className="card p-3 text-xs">Seu papel nesta organização é "{official.role || "—"}". Apenas owner gerencia acesso.</p></div>;
  const t = q.data;
  return (
    <div className="space-y-3">
      <PageHeader title="Equipe e acesso" />
      <p className="text-xs text-muted-foreground">Organização: <b>{official.orgName}</b>. Nenhum e-mail é enviado automaticamente: gere o link e entregue pessoalmente. Só a pessoa autenticada com o e-mail convidado consegue aceitar, com confirmação explícita. Não há autoinscrição pública.</p>
      <section className="card p-3">
        <div className="lbl mb-2">Novo convite individual</div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>E-mail<br /><input className="inp w-64" type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Papel<br /><select className="inp" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}><option value="viewer">viewer (somente leitura)</option><option value="editor">editor (grava com revisão)</option></select></label>
          <label>Validade (dias)<br /><input className="inp num w-16" type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          <button className="btn btn-primary" disabled={busy || !email} onClick={() => run(async () => { const r = await fCreate({ data: { orgId, email: email.trim(), role, days } }); if (r.status === "ok") { setLink(`${window.location.origin}/convite?t=${r.token}`); setEmail(""); } return r.status; })}>Gerar link</button>
        </div>
        {link && <div className="mt-2 text-xs"><p className="text-warning-foreground">Link exibido UMA vez (o servidor guarda só o hash). Copie agora:</p><div className="flex gap-2"><input className="inp flex-1 font-mono" readOnly value={link} /><button className="btn" onClick={() => navigator.clipboard.writeText(link)}>Copiar</button></div></div>}
        {msg && <p className="mt-2 text-xs">{msg}</p>}
      </section>
      {q.isError && <p className="card p-3 text-xs text-destructive">{(q.error as Error).message}</p>}
      {t?.allowed && <>
        <section className="card p-3"><div className="lbl mb-2">Membros</div>
          <table className="tbl"><thead><tr><th>E-mail</th><th>Papel</th><th>Desde</th><th /></tr></thead>
            <tbody>{t.members.map((m) => <tr key={m.user_id}><td>{m.email ?? m.user_id}{m.user_id === user.id && " (você)"}</td><td>{m.role}</td><td>{dt(m.created_at)}</td><td><button className="btn" disabled={busy} onClick={() => confirm(`Revogar acesso de ${m.email ?? m.user_id}?`) && run(() => fRemove({ data: { orgId, userId: m.user_id } }))}>Revogar acesso</button></td></tr>)}</tbody></table></section>
        <section className="card p-3"><div className="lbl mb-2">Convites</div>
          {t.invites.length === 0 ? <p className="text-xs">Nenhum convite.</p> : <table className="tbl"><thead><tr><th>E-mail</th><th>Papel</th><th>Criado</th><th>Expira</th><th>Estado</th><th /></tr></thead>
            <tbody>{t.invites.map((i) => { const st = i.revoked_at ? "revogado" : i.accepted_at ? "aceito" : new Date(i.expires_at) <= new Date() ? "expirado" : "pendente"; return <tr key={i.id}><td>{i.email}</td><td>{i.role}</td><td>{dt(i.created_at)}</td><td>{dt(i.expires_at)}</td><td>{st}</td><td>{st === "pendente" && <button className="btn" disabled={busy} onClick={() => run(() => fRevoke({ data: { orgId, inviteId: i.id } }))}>Revogar</button>}</td></tr>; })}</tbody></table>}</section>
        <section className="card p-3"><div className="lbl mb-2">Auditoria de acesso</div>
          {t.log.length === 0 ? <p className="text-xs">Sem eventos.</p> : <table className="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Papel</th></tr></thead>
            <tbody>{t.log.map((l) => <tr key={l.id}><td>{dt(l.at)}</td><td>{l.actor_email}</td><td>{ACTION[l.action] ?? l.action}</td><td>{l.target_email ?? l.target_user}</td><td>{l.role}</td></tr>)}</tbody></table>}</section>
      </>}
    </div>
  );
}
