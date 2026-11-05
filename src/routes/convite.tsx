import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/kit";
import { fmtDate } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { ACCEPT_MSG } from "@/lib/team";
import { acceptInvite, inviteInfo, publicInviteInfo, registerFromInvite } from "@/lib/team.functions";

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
  if (!user) return <Register token={token} />;
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

function Register({ token }: { token: string }) {
  const fInfo = useServerFn(publicInviteInfo), fReg = useServerFn(registerFromInvite);
  const q = useQuery({ queryKey: ["publicInvite", token], queryFn: () => fInfo({ data: { token } }), retry: false });
  const [pass, setPass] = useState(""); const [pass2, setPass2] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const i = q.data;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (pass !== pass2) return setMsg("As senhas não conferem.");
    setBusy(true); setMsg("");
    try {
      const r = await fReg({ data: { token, password: pass } });
      if (r.status === "exists") return setMsg("Já existe conta com este e-mail. Entre e abra o link novamente.");
      if (r.status !== "ok" || !r.email) return setMsg(ACCEPT_MSG[r.status] ?? "Não foi possível concluir o cadastro.");
      const s = await supabase.auth.signInWithPassword({ email: r.email, password: pass });
      if (s.error) return setMsg("Cadastro concluído. Entre pela tela de acesso.");
      window.location.assign("/");
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3"><PageHeader title="Convite" />
      <section className="card max-w-md p-4 text-xs">
        {q.isLoading ? "Carregando…" : !i || i.status !== "ok" ? "Convite inexistente." : i.state !== "pendente" ? <>Convite {i.state}. <Link to="/auth" className="underline">Entrar</Link></> : <>
          <dl className="mb-3 grid grid-cols-[90px_1fr] gap-1">
            <dt>Nome</dt><dd><b>{i.full_name}</b></dd><dt>E-mail</dt><dd><b>{i.email}</b></dd><dt>Setor</dt><dd>{i.sector}</dd><dt>Permissão</dt><dd>{i.role}</dd><dt>Organização</dt><dd>{i.org_name}</dd>
          </dl>
          <form onSubmit={submit} className="space-y-2">
            <input className="inp w-full" type="password" required minLength={8} placeholder="defina sua senha (mín. 8)" value={pass} onChange={(e) => setPass(e.target.value)} />
            <input className="inp w-full" type="password" required minLength={8} placeholder="repita a senha" value={pass2} onChange={(e) => setPass2(e.target.value)} />
            <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Aguarde…" : "Criar acesso"}</button>
          </form>
          <p className="mt-2">Já tem conta? <Link to="/auth" className="underline">Entrar</Link> e abra o link novamente.</p>
        </>}
        {msg && <p className="mt-2 text-destructive">{msg}</p>}
      </section>
    </div>
  );
}
