import { useState } from "react";
import { DateInput } from "@/components/DateField";
import { accountName } from "@/lib/engine/banco";
import type { Change } from "@/lib/diff";
import { fmtDate } from "@/lib/dates";
import { fmtNum } from "@/lib/money";
import { financialConfig } from "@/lib/financeConfig";
import type { MonthTarget, ScenarioData } from "@/lib/engine/types";

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
const EMPTY = "Não preenchido";
const ABA: Record<string, string> = { "Recebimento": "Recebimentos", "Plataformas": "Recebimentos", "Previsão (planejada)": "Lançamentos", "Efetivado (compra/pedido)": "Lançamentos", "Despesa": "Lançamentos", "Efetivação": "Lançamentos", "Pagamento (baixa)": "Lançamentos", "Fornecedor": "Cadastros", "Categoria": "Cadastros", "Parâmetros": "Meta de Faturamento", "Ajuste de saldo": "Fluxo", "Configuração financeira mensal": "Meta de Faturamento", "Meta de faturamento": "Meta de Faturamento", "Conta bancária": "Bancos", "Cartão": "Bancos", "Transferência": "Bancos" };
const ACAO: Record<string, string> = { "inclusão": "Inclusão", "alteração": "Alteração", "exclusão": "Remoção" };
const txt = (v: unknown) => (v == null ? "" : String(v));
const STATUS: R = { ativo: "Ativo", cancelado: "Cancelado", encerrado: "Encerrado" };
const PARAMS: Record<string, string> = { profile: "Regra de cálculo inicial", legacyReducer: "Deflator inicial", webR1: "Deflator 1 inicial", webR2: "Deflator 2 inicial", divisorLegado: "Distribuição diária inicial (30 dias ou dias reais)", divisorWeb: "Distribuição diária inicial (configuração alternativa)", financialDefaults: "Configurações para novos meses", lagDays: "Defasagem (dias)", startDate: "Data inicial", saldoInicial: "Saldo inicial" };

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
      return [F("Nome", "name"), { label: "Apelidos", get: (o) => ((o["aliases"] as string[]) ?? []).join("; ") }, F("Observação", "note"), { label: "Histórico de situação", get: (o) => ((o["activity"] as { active: boolean; from: string; at: string; by: string }[]) ?? []).map((e) => `${e.active ? "Reativado" : "Inativo"} a partir de ${date(e.from)} · ${new Date(e.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${e.by}`).join("; ") }, { label: "Condições", get: (o) => ((o["conditions"] as { name: string; terms: (number | null)[] }[]) ?? []).map((c) => `${c.name}: ${c.terms.filter((x) => x !== null).join("/")} dias`).join("; ") }, { label: "Prazos (dias)", get: (o) => ((o["terms"] as unknown[]) ?? []).filter((x) => x != null).join(" / ") }];
    case "Categoria":
      return [F("Nome", "name"), F("Tipo", "kind"), F("Grupo", "group")];
    case "Ajuste de saldo":
      return [F("Data", "date", date), F("Valor", "value", money, true), F("Observação", "note")];
    case "Pagamento (baixa)":
      return [{ label: "Título", get: (o) => (o["titleKind"] === "expense" ? "Despesa" : "Compra") }, F("Data", "date", date), F("Valor", "amount", money, true), F("Observação", "note"), { label: "Forma", get: (o) => ({ pix: "Pix", ted: "TED", doc: "DOC", boleto: "Boleto" } as Record<string, string>)[String(o["form"] ?? "")] ?? "—" }, { label: "Origem", get: (o) => (o["method"] === "cartao" ? `Cartão ${d.cards.find((c) => c.id === d.cardOps.find((x) => x.id === o["cardOpId"])?.cardId)?.name ?? ""}`.trim() : accountName(d, o["accountId"] as string | null)) }, { label: "Estorno", get: (o) => (o["reversedAt"] ? `Estornado ${date(String(o["reversedAt"]).slice(0, 10))}` : "") }];
    case "Conta bancária":
      return [F("Banco", "bank"), F("Identificação", "label"), F("Titular", "holder"), F("Agência", "agency"), F("Conta", "account"), { label: "Situação", get: (o) => (o["active"] ? "Ativa" : "Inativa") }, F("Saldo inicial", "openingBalance", money, true), F("Data de referência", "openingDate", date)];
    case "Cartão":
      return [F("Nome", "name"), F("Final", "last4"), { label: "Conta", get: (o) => accountName(d, o["accountId"] as string) }, F("Fechamento (dia)", "closingDay"), F("Vencimento (dia)", "dueDay")];
    case "Transferência":
      return [{ label: "Origem", get: (o) => accountName(d, o["fromAccountId"] as string) }, { label: "Destino", get: (o) => accountName(d, o["toAccountId"] as string) }, F("Valor", "amount", money, true), F("Data", "date", date), F("Observação", "note"), { label: "Estorno", get: (o) => (o["reversedAt"] ? `Estornada: ${txt(o["reversalNote"])}` : "") }];
    case "Efetivação":
      return [F("Tipo", "kind"), F("Valor", "value", money, true), { label: "Data", get: (o) => date(String(o["at"] ?? "").slice(0, 10)) }, { label: "Estorno", get: (o) => (o["reversedAt"] ? "Estornada" : "") }];
    case "Configuração financeira mensal": {
      const config = (o: R) => financialConfig(d.params, o as unknown as MonthTarget);
      return [F("Faturamento bruto", "gross", money, true), { label: "Nome do deflator 1", get: (o) => String(o["deflator1Name"] ?? config(o).deflator1Name ?? "Deflator 1") }, { label: "Deflator 1", get: (o) => pct(config(o).deflator1) }, { label: "Base 1", get: () => "Faturamento bruto" }, { label: "Nome do deflator 2", get: (o) => String(o["deflator2Name"] ?? config(o).deflator2Name ?? "Deflator 2") }, { label: "Deflator 2", get: (o) => pct(config(o).deflator2) }, { label: "Base 2", get: (o) => config(o).base2 === "bruto" ? "Faturamento bruto" : "Após a primeira redução" }, { label: "Distribuição diária", get: (o) => config(o).divisor === "30" ? "30 dias" : "Dias reais do mês" }, { label: "Defasagem (dias)", get: (o) => String(config(o).lagDays) }];
    }
    case "Parâmetros":
      return Object.keys(sample).map((k) => ({ label: PARAMS[k] ?? k, num: k === "saldoInicial", get: (o: R) => (k === "financialDefaults" ? (o[k] ? (() => { const f = o[k] as { deflator1: number; deflator2: number; divisor: string; lagDays: number }; return `${pct(f.deflator1)} / ${pct(f.deflator2)} · ${f.divisor === "30" ? "30 dias" : "dias do mês"} · ${f.lagDays} dias`; })() : "Não configurado") : k === "saldoInicial" ? money(o[k]) : /Reducer|R1|R2/.test(k) ? pct(o[k]) : txt(o[k])) }));
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
    case "Configuração financeira mensal":
    case "Meta de faturamento": return mes(c.id);
    case "Plataformas": return "Cadastro de plataformas";
    case "Parâmetros": return "Parâmetros gerais";
    case "Recebimento": return `Recebimento de ${date(o["date"]) || "sem data"}`;
    case "Ajuste de saldo": return `Ajuste de saldo — ${date(o["date"])}`;
    case "Fornecedor": case "Categoria": return `${c.entity} — ${txt(o["name"])}`;
    default: return [c.entity.replace(/ \(.*\)/, ""), sup, o["document"] ? `doc. ${txt(o["document"])}` : ""].filter(Boolean).join(" — ");
  }
}

function PlatCompare({ c }: { c: Change }) {
  const map = (a: unknown) => new Map(((a as R[]) ?? []).map((p) => [String(p["id"]), p]));
  const b = map(c.before), a = map(c.after);
  const ids = [...new Set([...b.keys(), ...a.keys()])];
  const F: [string, (p: R | undefined) => string][] = [["Nome", (p) => (p ? txt(p["name"]) : "")], ["Início", (p) => (p ? date(p["start"]) : "")], ["Inativação", (p) => (p ? date(p["end"]) : "")]];
  return (
    <div className="overflow-x-auto"><table className="tbl hist-cmp"><thead><tr><th>Plataforma</th><th />{F.map(([l]) => <th key={l}>{l}</th>)}</tr></thead>
      <tbody>{ids.flatMap((id) => {
        const pb = b.get(id), pa = a.get(id), name = txt((pa ?? pb)?.["name"]);
        return [
          <tr key={id + "b"}><td className="font-semibold" rowSpan={2}>{name}</td><td>Antes</td>{F.map(([l, g]) => <td key={l}>{pb ? g(pb) || EMPTY : "Não existia"}</td>)}</tr>,
          <tr key={id + "a"}><td>Depois</td>{F.map(([l, g]) => { const x = pa ? g(pa) : "", y = pb ? g(pb) : ""; return <td key={l} className={x !== y ? "bg-destructive/15 font-semibold text-destructive" : ""}>{pa ? x || EMPTY : "Removida"}</td>; })}</tr>,
        ];
      })}</tbody></table></div>
  );
}

function Compare({ c, d }: { c: Change; d: ScenarioData }) {
  if (c.entity === "Plataformas") return <PlatCompare c={c} />;
  const { cols, before, after } = rowsFor(c, d);
  return (
    <div className="overflow-x-auto">
      <table className="tbl hist-cmp"><thead><tr><th />{cols.map((k, n) => <th key={n} className={k.num ? "num" : ""}>{k.label}</th>)}</tr></thead>
        <tbody>
          <tr><td className="font-semibold">Antes</td>{cols.map((k, n) => <td key={n} className={k.num ? "num" : ""}>{before ? k.get(before) || EMPTY : "Registro não existia"}</td>)}</tr>
          <tr><td className="font-semibold">Depois</td>{cols.map((k, n) => {
            const a = after ? k.get(after) : "", b = before ? k.get(before) : "";
            return <td key={n} className={`${k.num ? "num" : ""} ${a !== b ? "bg-destructive/15 font-semibold text-destructive" : ""}`}>{after ? a || EMPTY : "Registro removido"}</td>;
          })}</tr>
        </tbody></table>
    </div>
  );
}

const dt = (at: string) => fmtDate(new Date(at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
const hr = (at: string) => new Date(at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Impressão numa janela própria: o layout do app (altura fixa/rolagem) cortava o conteúdo.
function printDetail(sel = ".print-area") {
  const el = document.querySelector(sel);
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!el || !w) return;
  const css = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join("");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><title>Histórico de alterações</title>${css}<style>.no-print{display:none!important}body{background:#fff;padding:12px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-area{width:100%!important;height:auto!important;overflow:visible!important;box-shadow:none!important}@page{size:A4 portrait;margin:8mm}html,body{width:auto!important;height:auto!important;overflow:visible!important}.overflow-x-auto,.overflow-y-auto{overflow:visible!important}table{width:100%!important;table-layout:fixed;font-size:8px!important}th,td{white-space:normal!important;word-break:break-word;overflow-wrap:anywhere;padding:2px 3px!important}section{break-inside:avoid}</style></head><body>${el.outerHTML}</body></html>`);
  w.document.close();
  // Imprime uma única vez, só depois de todas as folhas de estilo carregarem (antes saía sem formatação).
  let done = false;
  const go = () => { if (done || w.closed) return; done = true; w.focus(); w.print(); w.close(); };
  const links = [...w.document.querySelectorAll('link[rel="stylesheet"]')] as HTMLLinkElement[];
  Promise.all(links.map((l) => (l.sheet ? Promise.resolve() : new Promise<void>((r) => { l.onload = () => r(); l.onerror = () => r(); }))))
    .then(() => w.document.fonts?.ready).then(() => setTimeout(go, 150));
}

interface Line { at: string; user: string; seq: number; entry: HistEntry; c: Change; aba: string; reg: string; campo: string; b: string; a: string }

function describe(c: Change, d: ScenarioData): { campo: string; b: string; a: string } {
  if (c.entity === "Meta de faturamento") return { campo: "Meta mensal", b: c.before == null ? "Não cadastrado" : money(c.before), a: c.after == null ? "Removido" : money(c.after) };
  const { cols, before, after } = rowsFor(c, d);
  const filled = (o: R) => cols.map((k) => [k.label, k.get(o)] as const).filter(([, v]) => v);
  if (c.kind === "inclusão") { const f = filled(after ?? {}); return { campo: f.map(([l]) => l).join(", ") || "—", b: "Não cadastrado", a: f.map(([l, v]) => `${l}: ${v}`).join("; ") || "Incluído" }; }
  if (c.kind === "exclusão") { const f = filled(before ?? {}); return { campo: f.map(([l]) => l).join(", ") || "—", b: f.map(([l, v]) => `${l}: ${v}`).join("; ") || "Existente", a: "Removido" }; }
  const diff = cols.filter((k) => (before ? k.get(before) : "") !== (after ? k.get(after) : ""));
  if (diff.length === 1) { const k = diff[0]!; return { campo: k.label, b: (before && k.get(before)) || EMPTY, a: (after && k.get(after)) || EMPTY }; }
  return { campo: diff.map((k) => k.label).join(", "), b: diff.map((k) => `${k.label}: ${(before && k.get(before)) || EMPTY}`).join("; "), a: diff.map((k) => `${k.label}: ${(after && k.get(after)) || EMPTY}`).join("; ") };
}

export function HistoryView({ entries, data, scope = "Fluxo real", onRestore }: { entries: HistEntry[]; data: ScenarioData; scope?: string; onRestore?: ((c: Change) => void) | undefined }) {
  const [open, setOpen] = useState<{ line: Line; full: boolean } | null>(null);
  // Cada confirmação é preservada (sem fundir); ordem: mais recente primeiro, desempate pela sequência de gravação.
  const lines: Line[] = entries.flatMap((e, ei) => e.changes.filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after)).map((c, ci) => ({ at: e.at, user: e.user, seq: ei * 1000 + ci, entry: e, c, aba: ABA[c.entity] ?? c.entity, reg: recordLabel(c, data), ...describe(c, data) })))
    .sort((x, y) => y.at.localeCompare(x.at) || x.seq - y.seq);
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [who, setWho] = useState("");
  const users = [...new Set(lines.map((l) => l.user).filter(Boolean))].sort();
  const iso = (at: string) => new Date(at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const vis = lines.filter((l) => (!from || iso(l.at) >= from) && (!to || iso(l.at) <= to) && (!who || l.user === who));
  const exportCsv = () => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [["Data", "Horário", "Usuário", "Ambiente", "Aba", "Registro", "Ação", "Campo", "Antes", "Depois"], ...vis.map((l) => [dt(l.at), hr(l.at), l.user, scope, l.aba, l.reg, ACAO[l.c.kind] ?? "", l.campo, l.b, l.a])];
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `historico-${scope.replace(/\W+/g, "-").toLowerCase()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  const filters = (
    <div className="no-print mb-2 flex flex-wrap items-end gap-2 text-xs">
      <label><div className="lbl">De</div><DateInput allowEmpty value={from || null} maxDate={to || null} onChange={(v) => setFrom(v ?? "")} /></label>
      <label><div className="lbl">Até</div><DateInput allowEmpty value={to || null} minDate={from || null} onChange={(v) => setTo(v ?? "")} /></label>
      <label><div className="lbl">Usuário</div><select className="inp" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Todos</option>{users.map((u) => <option key={u}>{u}</option>)}</select></label>
      {(from || to || who) && <button className="btn" onClick={() => { setFrom(""); setTo(""); setWho(""); }}>Limpar</button>}
      <span className="ml-auto" /><button className="btn" onClick={exportCsv} disabled={!vis.length}>Exportar planilha</button>
      <button className="btn btn-primary" onClick={() => printDetail(".hist-list")} disabled={!vis.length}>Imprimir</button>
    </div>
  );
  if (!lines.length) return <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>;
  const days = new Map<string, Line[]>();
  for (const l of vis) { const k = dt(l.at); days.set(k, [...(days.get(k) ?? []), l]); }
  const sel = open?.line;
  const shown = sel ? (open!.full ? sel.entry.changes.filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after)) : [sel.c]) : [];
  const title = sel ? [sel.aba, sel.reg.replace(/^.*? — /, ""), `${ACAO[sel.c.kind]}${sel.c.kind === "alteração" && sel.campo && !sel.campo.includes(",") ? ` do ${sel.campo}` : ""}`].join(" · ") : "";
  return (
    <>
      {filters}
      {!vis.length && <p className="text-xs text-muted-foreground">Nenhuma alteração no filtro escolhido.</p>}
      <div className="hist-list max-h-[75vh] space-y-4 overflow-auto">
        <div className="hidden text-sm font-semibold print:block">Histórico — {scope}{from || to ? ` · ${from ? fmtDate(from) : "início"} a ${to ? fmtDate(to) : "hoje"}` : ""}{who ? ` · ${who}` : ""}</div>
        {[...days].map(([day, ls]) => (
          <section key={day}>
            <div className="mb-1 text-sm font-semibold">{day} — {ls.length} {ls.length === 1 ? "alteração" : "alterações"}</div>
            <table className="tbl"><thead><tr><th>Horário</th><th>Usuário</th><th>Aba</th><th>Registro</th><th>Ação</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
              <tbody>{ls.map((l) => (
                <tr key={l.seq + l.at} className="cursor-pointer hover:bg-secondary" onClick={() => setOpen({ line: l, full: false })}>
                  <td>{hr(l.at)}</td><td>{l.user || "—"}</td><td>{l.aba}</td><td>{l.reg}</td><td>{ACAO[l.c.kind]}</td>
                  <td className="max-w-xs truncate" title={l.campo}>{l.campo}</td><td className="max-w-xs truncate" title={l.b}>{l.b}</td><td className="max-w-xs truncate font-semibold" title={l.a}>{l.a}</td>
                </tr>
              ))}</tbody></table>
          </section>
        ))}
      </div>
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30" onClick={() => setOpen(null)}>
          <aside className="print-area h-full w-[96vw] overflow-y-auto bg-background p-4 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between border-b border-border pb-2">
              <div><div className="text-base font-semibold">{open!.full ? "Confirmação completa" : title}</div>
                <div className="text-xs text-muted-foreground">Detalhamento da alteração{open!.full ? ` · ${shown.length} registro(s)` : ""}</div></div>
              <div className="no-print flex gap-1">
                {sel.entry.changes.length > 1 && <button className="btn" onClick={() => setOpen({ line: sel, full: !open!.full })}>{open!.full ? "Ver só este registro" : "Ver confirmação completa"}</button>}
                <button className="btn btn-primary" onClick={() => printDetail()}>Imprimir</button><button className="btn" onClick={() => setOpen(null)}>Fechar</button></div>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded border border-border bg-secondary p-2 text-xs md:grid-cols-4">
              <div><div className="lbl">Usuário</div>{sel.user || "—"}</div>
              <div><div className="lbl">Data</div>{dt(sel.at)}</div>
              <div><div className="lbl">Horário</div>{hr(sel.at)}</div>
              <div><div className="lbl">Ambiente</div>{scope}</div>
            </div>
            <div className="space-y-4">{shown.map((c, j) => (
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
