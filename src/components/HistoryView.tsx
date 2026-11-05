import { useState } from "react";
import type { Change } from "@/lib/diff";
import { fmtDate } from "@/lib/dates";
import { fmtNum } from "@/lib/money";
import type { ScenarioData } from "@/lib/engine/types";

// Histórico legível: cada registro agrupa as alterações de um mesmo envio; cada item mostra a linha
// completa Antes / Depois com as mesmas colunas da tela, destacando em vermelho só as células alteradas.
export interface HistEntry { at: string; user: string; changes: Change[] }
type R = Record<string, unknown>;
interface Col { label: string; get: (o: R) => string; num?: boolean }

const money = (v: unknown) => (v == null || v === "" ? "" : fmtNum(Number(v)));
const date = (v: unknown) => (v ? fmtDate(String(v)) : "");
const pct = (v: unknown) => (v == null || v === "" ? "" : `${(Number(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const mes = (ym: string) => { const [y, m] = ym.split("-"); return `${MESES[Number(m) - 1] ?? m}/${y}`; };
const EMPTY = "Sem preenchimento";
const ABA: Record<string, string> = { "Recebimento": "Recebimentos", "Plataformas": "Recebimentos", "Previsão (planejada)": "Lançamentos", "Efetivado (compra/pedido)": "Lançamentos", "Despesa": "Lançamentos", "Efetivação": "Lançamentos", "Pagamento (baixa)": "Lançamentos", "Fornecedor": "Referências", "Categoria": "Referências", "Parâmetros": "Referências", "Ajuste de saldo": "Referências", "Meta de faturamento": "Meta de Faturamento" };
const ACAO: Record<string, string> = { "inclusão": "Inclusão", "alteração": "Alteração", "exclusão": "Remoção" };
const txt = (v: unknown) => (v == null ? "" : String(v));
const STATUS: R = { ativo: "Ativo", cancelado: "Cancelado", encerrado: "Encerrado" };
const PARAMS: Record<string, string> = { profile: "Perfil", legacyReducer: "Redutor legado", webR1: "Redutor Web 1", webR2: "Redutor Web 2", divisorLegado: "Divisor legado", divisorWeb: "Divisor Web", lagDays: "Defasagem (dias)", startDate: "Data inicial", saldoInicial: "Saldo inicial" };

function columns(entity: string, d: ScenarioData, sample: R): Col[] {
  const sup = (id: unknown) => d.suppliers.find((s) => s.id === id)?.name ?? (id ? "(fornecedor removido)" : "");
  const cat = (id: unknown) => d.categories.find((c) => c.id === id)?.name ?? (id ? "(categoria removida)" : "");
  const st = (v: unknown) => txt(STATUS[String(v)] ?? v);
  const F = (label: string, k: string, f: (v: unknown) => string = txt, num = false): Col => ({ label, get: (o) => f(o[k]), num });
  switch (entity) {
    case "Recebimento":
      return [F("Data", "date", date),
        ...d.platforms.map((p) => ({ label: p.name, num: true, get: (o: R) => money((o["platforms"] as R | undefined)?.[p.id]) })),
        F("Geral", "general", money, true), F("Observações", "notes")];
    case "Previsão (planejada)":
      return [F("Fornecedor", "supplierId", sup), F("Código compra", "purchaseCode"), F("Documento", "document"), F("Valor", "value", money, true), F("Data base", "baseDate", date), F("Categoria", "categoryId", cat), F("Situação", "status", st), F("Observações", "notes")];
    case "Efetivado (compra/pedido)":
      return [F("Fornecedor", "supplierId", sup), F("Código compra", "purchaseCode"), F("Documento", "document"), F("Valor", "value", money, true), F("Vencimento", "dueDate", date), F("Prorrogação", "extensionDate", date), F("Categoria", "categoryId", cat), F("Situação", "status", st), F("Observações", "notes")];
    case "Despesa":
      return [F("Fornecedor", "supplierId", sup), F("Documento", "document"), F("Valor", "value", money, true), F("Data base", "baseDate", date), F("Prazo (dias)", "termDays"), F("Prorrogação", "extensionDate", date), F("Categoria", "categoryId", cat), F("Situação", "status", st), F("Observações", "notes")];
    case "Fornecedor":
      return [F("Nome", "name"), F("Grupo", "group"), { label: "Prazos (dias)", get: (o) => ((o["terms"] as unknown[]) ?? []).filter((x) => x != null).join(" / ") }];
    case "Categoria":
      return [F("Nome", "name"), F("Tipo", "kind"), F("Grupo", "group")];
    case "Ajuste de saldo":
      return [F("Data", "date", date), F("Valor", "value", money, true), F("Observação", "note")];
    case "Pagamento (baixa)":
      return [{ label: "Título", get: (o) => (o["titleKind"] === "expense" ? "Despesa" : "Compra") }, F("Data", "date", date), F("Valor", "amount", money, true), F("Observação", "note"), { label: "Estorno", get: (o) => (o["reversedAt"] ? `Estornado ${date(String(o["reversedAt"]).slice(0, 10))}` : "") }];
    case "Efetivação":
      return [F("Tipo", "kind"), F("Valor", "value", money, true), { label: "Data", get: (o) => date(String(o["at"] ?? "").slice(0, 10)) }, { label: "Estorno", get: (o) => (o["reversedAt"] ? "Estornada" : "") }];
    case "Parâmetros":
      return Object.keys(sample).map((k) => ({ label: PARAMS[k] ?? k, num: k === "saldoInicial", get: (o: R) => (k === "saldoInicial" ? money(o[k]) : /Reducer|R1|R2/.test(k) ? pct(o[k]) : txt(o[k])) }));
    default:
      return Object.keys(sample).filter((k) => !["id", "history", "origin", "importOrigin"].includes(k)).map((k) => ({ label: k, get: (o: R) => (typeof o[k] === "object" ? "" : txt(o[k])) }));
  }
}

function rowsFor(c: Change, d: ScenarioData): { cols: Col[]; before: R | null; after: R | null } {
  if (c.entity === "Meta de faturamento") {
    const cols: Col[] = [{ label: "Mês", get: () => mes(c.id) }, { label: "Meta", num: true, get: (o) => money(o["v"]) }];
    return { cols, before: c.before == null ? null : { v: c.before }, after: c.after == null ? null : { v: c.after } };
  }
  if (c.entity === "Plataformas") {
    const toR = (a: unknown) => Object.fromEntries(((a as R[]) ?? []).map((p) => [String(p["id"]), `${p["name"]}${p["end"] ? ` (inativa ${date(p["end"])})` : ""}`]));
    const b = toR(c.before), a = toR(c.after);
    const ids = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    const cols = ids.map((id) => ({ label: d.platforms.find((p) => p.id === id)?.name ?? "Plataforma", get: (o: R) => txt(o[id]) }));
    return { cols, before: b, after: a };
  }
  const before = c.before as R | null, after = c.after as R | null;
  return { cols: columns(c.entity, d, { ...(before ?? {}), ...(after ?? {}) }), before, after };
}

// Junta edições seguidas do mesmo usuário (até 60 s) num único registro; por item mantém o primeiro "antes" e o último "depois".
export function coalesce(list: HistEntry[]): HistEntry[] {
  const sorted = [...list].sort((a, b) => b.at.localeCompare(a.at));
  const out: HistEntry[] = [];
  for (const e of sorted) {
    const g = out[out.length - 1];
    const gap = g ? (Date.parse(g.at) - Date.parse(e.at)) / 1000 : Infinity;
    if (!g || g.user !== e.user || gap > 60) { out.push({ at: e.at, user: e.user, changes: [...e.changes] }); continue; }
    for (const c of e.changes) {
      const i = g.changes.findIndex((x) => x.entity === c.entity && x.id === c.id);
      if (i < 0) g.changes.push(c);
      else { const n = g.changes[i]!; g.changes[i] = { ...n, before: c.before, kind: c.kind === "inclusão" ? "inclusão" : n.kind === "exclusão" ? "exclusão" : n.kind }; }
    }
  }
  for (const g of out) g.changes = g.changes.filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after));
  return out.filter((g) => g.changes.length);
}

function recordLabel(c: Change, d: ScenarioData): string {
  const o = ((c.after ?? c.before) ?? {}) as R;
  const sup = d.suppliers.find((x) => x.id === o["supplierId"])?.name;
  switch (c.entity) {
    case "Meta de faturamento": return `Meta de faturamento — ${mes(c.id)}`;
    case "Plataformas": return "Cadastro de plataformas";
    case "Parâmetros": return "Parâmetros gerais";
    case "Recebimento": return `Recebimento — ${date(o["date"]) || "sem data"}`;
    case "Ajuste de saldo": return `Ajuste de saldo — ${date(o["date"])}`;
    case "Fornecedor": case "Categoria": return `${c.entity} — ${txt(o["name"])}`;
    default: return [c.entity.replace(/ \(.*\)/, ""), sup, o["document"] ? `doc. ${txt(o["document"])}` : ""].filter(Boolean).join(" — ");
  }
}

function Compare({ c, d }: { c: Change; d: ScenarioData }) {
  const { cols, before, after } = rowsFor(c, d);
  return (
    <div className="overflow-x-auto">
      <table className="tbl hist-cmp"><thead><tr><th />{cols.map((k, n) => <th key={n} className={k.num ? "num" : ""}>{k.label}</th>)}</tr></thead>
        <tbody>
          <tr><td className="font-semibold">Antes</td>{cols.map((k, n) => <td key={n} className={k.num ? "num" : ""}>{before ? k.get(before) || EMPTY : EMPTY}</td>)}</tr>
          <tr><td className="font-semibold">Depois</td>{cols.map((k, n) => {
            const a = after ? k.get(after) : "", b = before ? k.get(before) : "";
            return <td key={n} className={`${k.num ? "num" : ""} ${a !== b ? "bg-destructive/15 font-semibold text-destructive" : ""}`}>{after ? a || EMPTY : EMPTY}</td>;
          })}</tr>
        </tbody></table>
    </div>
  );
}

const dt = (at: string) => fmtDate(new Date(at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
const hr = (at: string) => new Date(at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function HistoryView({ entries, data, scope = "Fluxo real", onRestore }: { entries: HistEntry[]; data: ScenarioData; scope?: string; onRestore?: ((c: Change) => void) | undefined }) {
  const [open, setOpen] = useState<number | null>(null);
  const list = coalesce(entries);
  if (!list.length) return <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>;
  const sel = open != null ? list[open] : null;
  return (
    <>
      <div className="max-h-[75vh] overflow-auto">
        <table className="tbl"><thead><tr><th>Data</th><th>Horário</th><th>Usuário</th><th>Aba</th><th>Registro</th><th>Ação</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
          <tbody>{list.map((e, i) => {
            const lines = e.changes.map((c) => {
              const { cols, before, after } = rowsFor(c, data);
              const diff = c.kind === "alteração" ? cols.filter((k) => (before ? k.get(before) : "") !== (after ? k.get(after) : "")) : [];
              const reg = recordLabel(c, data);
              if (c.kind !== "alteração") return { c, reg, campo: "—", b: c.kind === "inclusão" ? EMPTY : "Existente", a: c.kind === "exclusão" ? "Removido" : "Incluído" };
              if (diff.length === 1) { const k = diff[0]!; return { c, reg, campo: k.label, b: (before && k.get(before)) || EMPTY, a: (after && k.get(after)) || EMPTY }; }
              const names = diff.map((k) => k.label);
              return { c, reg, campo: `${diff.length} campos: ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`, b: "Ver detalhe", a: "Ver detalhe" };
            });
            return lines.map((l, j) => (
              <tr key={`${i}-${j}`} className={`cursor-pointer hover:bg-secondary ${j === 0 ? "border-t-2 border-border" : ""}`} onClick={() => setOpen(i)}>
                <td>{j === 0 ? dt(e.at) : ""}</td><td>{j === 0 ? hr(e.at) : ""}</td><td>{j === 0 ? e.user || "—" : ""}</td>
                <td>{ABA[l.c.entity] ?? l.c.entity}</td><td>{l.reg}</td><td>{ACAO[l.c.kind]}</td><td className="max-w-xs truncate" title={l.campo}>{l.campo}</td>
                <td className="max-w-xs truncate" title={l.b}>{l.b}</td><td className="max-w-xs truncate font-semibold" title={l.a}>{l.a}</td>
              </tr>
            ));
          })}</tbody></table>
      </div>
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30" onClick={() => setOpen(null)}>
          <aside className="print-area h-full w-[96vw] overflow-y-auto bg-background p-4 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between border-b border-border pb-2">
              <div><div className="text-base font-semibold">Detalhamento da alteração</div>
                <div className="text-xs text-muted-foreground">{sel.changes.length} registro(s) nesta confirmação</div></div>
              <div className="no-print flex gap-1"><button className="btn btn-primary" onClick={() => window.print()}>Imprimir</button><button className="btn" onClick={() => setOpen(null)}>Fechar</button></div>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded border border-border bg-secondary p-2 text-xs md:grid-cols-4">
              <div><div className="lbl">Usuário</div>{sel.user || "—"}</div>
              <div><div className="lbl">Data</div>{dt(sel.at)}</div>
              <div><div className="lbl">Horário</div>{hr(sel.at)}</div>
              <div><div className="lbl">Onde</div>{scope}</div>
            </div>
            <div className="space-y-4">{sel.changes.map((c, j) => (
              <section key={j} className="rounded border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="tag">{ABA[c.entity] ?? c.entity}</span>
                  <b className="text-sm">{recordLabel(c, data)}</b>
                  <span className={`tag ${c.kind === "exclusão" ? "tag-warn" : ""}`}>{ACAO[c.kind]}</span>
                  {onRestore && c.kind === "exclusão" && <button className="btn ml-auto" onClick={() => onRestore(c)}>Restaurar</button>}
                </div>
                <Compare c={c} d={data} />
              </section>
            ))}</div>
          </aside>
        </div>
      )}
    </>
  );
}
