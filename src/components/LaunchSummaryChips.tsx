import { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu';
import { fmtBRL } from '@/lib/money';
import type { LaunchTotals } from '@/lib/unifiedLaunch';

const NOTE = 'Totais separados por etapa; não representam a soma líquida de documentos vinculados.';

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return <p className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-muted-foreground">{k}</span><b className={`num ${warn ? 'text-warning-foreground' : 'text-foreground'}`}>{v}</b></p>;
}

/** Indicador compacto (48–56 px) do cabeçalho: rótulo pequeno + valor; detalhes abrem ao expandir. */
function Chip({ label, value, details, align }: { label: string; value: number; details: ReactNode; align: 'end' | 'center' }) {
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={`${label}: ${fmtBRL(value)}. Expandir detalhes.`}
        className="flex min-h-12 max-h-14 flex-col justify-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-1">
          <span className="lbl whitespace-nowrap text-[11px] leading-none">{label}</span>
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" aria-hidden />
        </span>
        <span className="num whitespace-nowrap text-sm font-semibold leading-none text-foreground">{fmtBRL(value)}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align={align} sideOffset={6} className="w-72 space-y-0.5 p-2 text-xs">
      {details}
      <p className="mt-1 border-t border-border pt-1 text-[11px] leading-snug text-muted-foreground">{NOTE}</p>
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** Dois indicadores lado a lado: Planejamento remanescente e Efetivação — obrigação vigente.
 *  Valores vindos exatamente do mesmo resumo do conjunto filtrado da listagem unificada. */
export function LaunchSummaryChips({ totals }: { totals: LaunchTotals | null }) {
  if (!totals) return null;
  return <>
    <Chip align="end" label="Planejamento remanescente" value={totals.remaining} details={<>
      <Row k="Parcelas em planejamento" v={totals.plannedCount.toLocaleString('pt-BR')} />
      <Row k="Saldo planejado remanescente" v={fmtBRL(totals.remaining)} />
      {totals.unavailable > 0 && <Row k="Sem valor distribuído" v={String(totals.unavailable)} warn />}
      {totals.plannedCancelled !== 0 && <Row k="Planejamento cancelado (valor original)" v={fmtBRL(totals.plannedCancelled)} />}
    </>} />
    <Chip align="end" label="Efetivação — obrigação vigente" value={totals.obligation} details={<>
      <Row k="Parcelas efetivadas" v={totals.actualCount.toLocaleString('pt-BR')} />
      <Row k="Obrigação vigente" v={fmtBRL(totals.obligation)} />
      <Row k="Pago" v={fmtBRL(totals.paid)} />
      <Row k="Saldo em aberto" v={fmtBRL(totals.open)} />
      <Row k="Valores registrados (inclui originais cancelados)" v={fmtBRL(totals.original)} />
    </>} />
  </>;
}
