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
      return Object.keys(sample).map((k) => ({ label: PARAMS[k] ?? k, num: k === "saldoInicial", get: (o: R) => (k === "saldoInicial" ? money(o[k]) : txt(o[k])) }));
    default:
      return Object.keys(sample).filter((k) => !["id", "history", "origin", "importOrigin"].includes(k)).map((k) => ({ label: k, get: (o: R) => (typeof o[k] === "object" ? "" : txt(o[k])) }));
  }
}

function rowsFor(c: Change, d: ScenarioData): { cols: Col[]; before: R | null; after: R | null } {
  if (c.entity === "Meta de faturamento") {
    const cols: Col[] = [{ label: "Mês", get: () => c.id.split("-").reverse().join("/") }, { label: "Meta", num: true, get: (o) => money(o["v"]) }];
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

export function HistoryView({ entries, data, onRestore }: { entries: HistEntry[]; data: ScenarioData; onRestore?: (c: Change) => void }) {
  const list = coalesce(entries);
  if (!list.length) return <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>;
  return (
    <div className="max-h-[75vh] space-y-3 overflow-auto">
      {list.map((e, i) => (
        <section key={i} className="card p-2">
          <div className="mb-1 flex flex-wrap gap-3 text-xs">
            <b>{fmtDate(new Date(e.at).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }))}</b>
            <span>{new Date(e.at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
            <span className="text-muted-foreground">{e.user || "—"}</span>
          </div>
          {e.changes.map((c, j) => {
            const { cols, before, after } = rowsFor(c, data);
            return (
              <div key={j} className="mb-2 overflow-x-auto">
                <div className="mb-0.5 text-[11px] font-semibold">{c.entity} · {c.kind}
                  {onRestore && c.kind === "exclusão" && <button className="btn ml-2" onClick={() => onRestore(c)}>Restaurar</button>}</div>
                <table className="tbl"><thead><tr><th />{cols.map((k, n) => <th key={n} className={k.num ? "num" : ""}>{k.label}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="font-semibold">Antes</td>{cols.map((k, n) => <td key={n} className={k.num ? "num" : ""}>{before ? k.get(before) || "—" : "—"}</td>)}</tr>
                    <tr><td className="font-semibold">Depois</td>{cols.map((k, n) => {
                      const a = after ? k.get(after) : "", b = before ? k.get(before) : "";
                      const changed = a !== b;
                      return <td key={n} className={`${k.num ? "num" : ""} ${changed ? "bg-destructive/15 font-semibold text-destructive" : ""}`}>{after ? a || "—" : "—"}</td>;
                    })}</tr>
                  </tbody></table>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
