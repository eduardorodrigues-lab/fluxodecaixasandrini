import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Entrar · Fluxo de Caixa Sandrini" },
    { name: "description", content: "Acesso da equipe financeira ao fluxo de caixa do Grupo Sandrini." },
    { property: "og:title", content: "Entrar · Fluxo de Caixa Sandrini" },
    { property: "og:description", content: "Acesso da equipe financeira ao fluxo de caixa do Grupo Sandrini." },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [signup, setSignup] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <div className="card max-w-md p-4 text-sm">Conectado como <b>{user.email}</b>. <button className="btn btn-primary ml-2" onClick={() => nav({ to: "/" })}>Abrir fluxo de caixa</button></div>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    const r = signup
      ? await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (r.error) return setMsg(r.error.message);
    if (signup && !r.data.session) return setMsg("Conta criada. Confirme pelo link enviado ao seu e-mail antes de entrar. Cada nova conta recebe sua própria organização vazia.");
    nav({ to: "/" });
  };
  return (
    <div className="card mx-auto mt-8 max-w-sm p-5">
      <h1 className="mb-1 text-base font-semibold">{signup ? "Criar conta" : "Entrar"}</h1>
      <p className="mb-3 text-xs text-muted-foreground">Entre com sua conta. Para acessar a organização de outra pessoa é necessário convite; uma conta nova começa com organização própria vazia.</p>
      <form onSubmit={submit} className="space-y-2">
        <input className="inp w-full" type="email" required placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="inp w-full" type="password" required minLength={8} placeholder="senha (mín. 8)" value={pass} onChange={(e) => setPass(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}</button>
      </form>
      <button className="btn mt-2 w-full" onClick={async () => { const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (r.error) setMsg(String(r.error.message ?? r.error)); }}>Continuar com Google</button>
      <button className="mt-3 text-xs underline" onClick={() => setSignup(!signup)}>{signup ? "Já tenho conta" : "Criar nova conta"}</button>
      {msg && <p className="mt-2 text-xs text-destructive">{msg}</p>}
    </div>
  );
}
