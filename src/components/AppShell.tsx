import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useApp } from "@/lib/store";

const NAV = [
  { to: "/", label: "Fluxo" },
  { to: "/lancamentos", label: "Lançamentos" },
  { to: "/recebimentos", label: "Recebimentos" },
  { to: "/referencias", label: "Referências" },
  { to: "/simulacoes", label: "Simulações" },
  { to: "/regras", label: "Regras e Conciliação" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { state, active, setActive, savedAt, storageError } = useApp();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border px-4 py-4">
          <div className="text-[10px] uppercase tracking-widest text-sidebar-primary">Grupo Sandrini</div>
          <div className="text-sm font-semibold">Fluxo de Caixa</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="block rounded px-3 py-1.5 text-xs hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" }}>{n.label}</Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3 text-[11px]">
          <label className="block text-sidebar-primary">Cenário ativo</label>
          <select className="w-full rounded bg-sidebar-accent px-1.5 py-1 text-xs" value={active.id} onChange={(e) => setActive(e.target.value)}>
            {state.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="leading-snug opacity-80">Salvo apenas neste navegador{savedAt ? ` · ${savedAt.toLocaleTimeString("pt-BR")}` : ""}. Sem backend/multiusuário.</p>
          {storageError && <p className="text-sidebar-primary">{storageError}</p>}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-warning bg-warning-soft px-4 py-1 text-[11px] text-warning-foreground">
          DADOS DEMONSTRATIVOS · versão inicial não homologada e sem dados reais migrados · cenário: <b>{active.name}</b>{!active.isBase && " (simulação — não altera a base)"}
        </div>
        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
