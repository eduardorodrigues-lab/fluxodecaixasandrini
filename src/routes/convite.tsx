import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/kit";
import { fmtDate } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { ACCEPT_MSG } from "@/lib/team";
import { acceptInvite, inviteInfo } from "@/lib/team.functions";

export const Route = createFileRoute("/convite")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s["t"] === "string" ? (s["t"] as string) : "" }),
  head: () => ({ meta: [
    { title: "Convite · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Aceite de convite individual para a organização." },
    { property: "og:title", content: "Convite · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Aceite de convite com confirmação explícita." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { t } = Route.useSearch();
  const { user, setOrgId } = useApp();
  const qc = useQueryClient();
  const fInfo = useServerFn(inviteInfo), fAccept = useServerFn(acceptInvite);
  // Remove o token da barra de endereço após ler (não fica em histórico/compartilhamentos de tela).
  const [token] = useState(t);
  useEffect(() => { if (t) window.history.replaceState(null, "", "/convite"); }, [t]);
  const q = useQuery({ queryKey: ["invite", token, user?.id], queryFn: () => fInfo({ data: { token } }), enabled: !!user && !!token, retry: false });
  const [ok, setOk] = useState(false); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  if (!token) return <div><PageHeader title="Convite" /><p className="card p-3 text-xs">Link de convite inválido.</p></div>;
  if (!user) return <div><PageHeader title="Convite" /><p className="card p-3 text-xs">Entre com a conta do e-mail convidado para ver o convite. <Link to="/auth" className="underline">Entrar</Link> e depois abra o link novamente.</p></div>;
  const i = q.data;
  return (
    <div className="space-y-3"><PageHeader title="Convite" />
      <section className="card p-3 text-xs">
        {q.isLoading ? "Carregando…" : q.isError ? <span className="text-destructive">{(q.error as Error).message}</span> : !i || i.status !== "ok" ? "Convite inexistente." : <>
          <p>Organização: <b>{i.org_name}</b> · Papel: <b>{i.role}</b> · Para: <b>{i.email}</b> · Expira: {i.expires_at ? fmtDate(i.expires_at.slice(0, 10)) : "—"} · Estado: <b>{i.state}</b></p>
          {!i.emailMatches && <p className="mt-1 text-destructive">{ACCEPT_MSG["email_mismatch"]} (você entrou como {user.email})</p>}
          {i.state === "pendente" && i.emailMatches && <>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Confirmo que quero entrar nesta organização com o papel {i.role}.</label>
            <button className="btn btn-primary mt-2" disabled={!ok || busy} onClick={async () => { setBusy(true); try { const r = await fAccept({ data: { token, confirm: true } }); setMsg(ACCEPT_MSG[r.status] ?? r.status); if (r.status === "ok" && r.org_id) { await qc.invalidateQueries({ queryKey: ["official"] }); setOrgId(r.org_id); } } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }}>Aceitar convite</button>
          </>}
          {msg && <p className="mt-2">{msg}</p>}
        </>}
      </section>
    </div>
  );
}
