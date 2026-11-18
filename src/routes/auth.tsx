import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Entrar · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Acesso da equipe financeira ao fluxo de caixa do Grupo Sandrini." },
    { property: "og:title", content: "Entrar · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Acesso da equipe financeira ao fluxo de caixa do Grupo Sandrini." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <div className="card max-w-md p-4 text-sm">Conectado como <b>{user.email}</b>. <button className="btn btn-primary ml-2" onClick={() => nav({ to: "/" })}>Abrir fluxo de caixa</button></div>;
  const first = false;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const r = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pass });
      if (r.error) return setMsg("E-mail ou senha inválidos.");
      nav({ to: "/" });
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card mx-auto mt-8 max-w-sm p-5">
      <h1 className="mb-1 text-base font-semibold">{first ? "Primeiro acesso (administrador)" : "Entrar"}</h1>
      <p className="mb-3 text-xs text-muted-foreground">{first ? "Nenhuma conta existe ainda. Crie o acesso do administrador; depois, novas pessoas só entram por convite em Equipe." : "Acesso restrito. Contas são criadas somente por convite do administrador."}</p>
      <form onSubmit={submit} className="space-y-2">
        {first && <input className="inp w-full" required maxLength={120} placeholder="nome" value={name} onChange={(e) => setName(e.target.value)} />}
        <input className="inp w-full" type="email" required placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="inp w-full" type="password" required minLength={first ? 8 : 1} placeholder={first ? "senha (mín. 8)" : "senha"} value={pass} onChange={(e) => setPass(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Aguarde…" : first ? "Criar acesso e entrar" : "Entrar"}</button>
      </form>
      {msg && <p className="mt-2 text-xs text-destructive">{msg}</p>}
    </div>
  );
}
