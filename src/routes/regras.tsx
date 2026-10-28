import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, WarningList } from "@/components/kit";
import { committedDate, computeFlow, expenseDate } from "@/lib/engine/engine";
import { readWorkbook, reconcile, type SheetInfo } from "@/lib/xlsxImport";
import { fmtDate } from "@/lib/dates";
import { fmtNum } from "@/lib/money";
import { classify, FIELDS, mapRows, parseCSV, suggestMapping, toCSV, type Cell, type Entity, type ParsedRow } from "@/lib/importer";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/regras")({
  head: () => ({
    meta: [
      { title: "Regras e Conciliação · Fluxo de Caixa Sandrini" },
      { name: "description", content: "Catálogo de regras, pendências, importação e exportação." },
      { property: "og:title", content: "Regras e Conciliação · Fluxo de Caixa Sandrini" },
      { property: "og:description", content: "Catálogo de regras, pendências e importação CSV." },
    ],
  }),
  component: Page,
});

const CATALOG: { id: string; origem: string; regra: string; formula: string; status: string; teste: string }[] = [
  { id: "A1", origem: "Web", regra: "Meta diária com dois redutores", formula: "red1=meta·r1; red2=(meta−red1)·r2; dia=(meta−red1−red2)/DAY(EOMONTH)", status: "implementado (perfil Web)", teste: "Regra A — Web" },
  { id: "A2", origem: "Excel antigo", regra: "Previsão com redutor global B2", formula: "HLOOKUP(mês defasado)·(1−B2)/30", status: "implementado (perfil legado, padrão)", teste: "Regra A — Legado" },
  { id: "B", origem: "Excel antigo / Web", regra: "Defasagem", formula: "mês(data − defasagem); dias corridos", status: "implementado", teste: "Regra B" },
  { id: "C", origem: "Proposta aprovada (evolui Excel antigo)", regra: "Informado substitui estimativa; zero confirmado ≠ ausente", formula: "SE(informado presente; informado; estimado) — legado era SE(soma≠0)", status: "implementado (mudança aprovada, não equivalência literal)", teste: "Regra C" },
  { id: "C2", origem: "Web", regra: "Soma D:O inclui geral e plataformas", formula: "P=SOMA(plataformas+geral); R=P−Q", status: "implementado com alerta de dupla contagem", teste: "Regra C — dupla" },
  { id: "D1", origem: "Web", regra: "Parcelas planejadas", formula: "qtd=COUNT(prazos); parcela=valor/qtd; venc=base+prazo", status: "implementado", teste: "Regra D — vazio vs zero" },
  { id: "D2", origem: "Excel antigo", regra: "Abatimento planejadas", formula: "P=valor/COUNTIF(>0); Q=SUMIF(cód; M)/COUNTIF; R=P−Q", status: "implementado; M precisa ser importado", teste: "Regra D — abatimento / M ausente" },
  { id: "E", origem: "Excel antigo (macros)", regra: "Distribuição comprometidas/despesas", formula: "comprometidas: F em G; despesas: F em C+G se G não vazio", status: "implementado sem executar VBA", teste: "Regra F" },
  { id: "F", origem: "Proposta aprovada", regra: "Prorrogação confirmada", formula: "vencimento vigente = prorrogação confirmada senão original; histórico preservado; K informativo", status: "implementado (substitui F web/legado)", teste: "Prorrogação" },
  { id: "PG", origem: "Proposta aprovada", regra: "Pagamentos por título", formula: "saída na data paga + restante no vencimento; antes do início reduz aberto sem nova saída", status: "implementado", teste: "Pagamentos" },
  { id: "EF", origem: "Proposta aprovada", regra: "Efetivação de previsão", formula: "vínculo explícito; parcial mantém restante confirmado; concluída encerra; M legado não abate quando há vínculo", status: "implementado", teste: "Efetivação" },
  { id: "G", origem: "Web", regra: "Saldo e ajuste manual", formula: "final=inicial−saídas+recebimento; L não vazio substitui", status: "implementado", teste: "Regra G" },
  { id: "I", origem: "Proposta aprovada", regra: "Centavos e arredondamento", formula: "centavos inteiros; resíduo na última parcela, exibido", status: "implementado", teste: "arredondamento 100/3" },
  { id: "P1", origem: "Proposta aprovada", regra: "Parcelas na mesma data", formula: "SOMA (macro sobrescrevia)", status: "implementado", teste: "colisão" },
];
const SOURCE_ISSUES = [
  "Web — planejadas no fluxo (col. E) usam faixa até a linha 1962, mas o cadastro vai até 3364. Diagnóstico da fonte; não reproduzido.",
  "Web — títulos N3385 contém #REF! mascarado por IFERROR, e o trecho seguinte tem referência deslocada. Não reproduzido nem corrigido sem conciliação.",
  "Legado — macros gravam em matriz lançamento × 2040–2191 dias; substituído por parcelas agregadas por data.",
  "Legado — Distribuir Seleção usa marca não vazia em D (planejadas/despesas) e E (efetuadas); seleção parcial não implementada nesta versão.",
  "Legado — demais parcelas de comprometidas/despesas estão comentadas nas macros ativas; não distribuídas.",
];

function Page() {
  const { active, ui, update } = useApp();
  const d = active.data;
  const res = useMemo(() => computeFlow(d, { start: ui.start, end: ui.end }), [d, ui.start, ui.end]);
  const [entity, setEntity] = useState<Entity>("planned");
  const [rows, setRows] = useState<Cell[][]>([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheet, setSheet] = useState("");
  const [fileMsg, setFileMsg] = useState("");
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [result, setResult] = useState("");
  const [recon, setRecon] = useState<ReturnType<typeof reconcile> | null>(null);
  const header = rows[headerIdx] ?? [];
  const pickSheet = (list: SheetInfo[], name: string) => {
    const s = list.find((x) => x.name === name); if (!s) return;
    setSheet(name); setPreview(null); setRecon(null);
    setRows(s.rows); setHeaderIdx(s.headerRow);
    if (s.kind !== "fluxo" && s.kind !== "nao_mapeada" && s.kind !== "desconhecida") { setEntity(s.kind); setMapping(suggestMapping(s.kind, s.rows[s.headerRow] ?? [])); }
  };
  const onFile = async (f: File) => {
    setPreview(null); setResult(""); setRecon(null); setFileName(f.name); setSheets([]); setSheet("");
    if (/\.(xlsx|xlsm)$/i.test(f.name)) {
      try {
        const list = readWorkbook(await f.arrayBuffer());
        setSheets(list);
        setFileMsg(`${f.name}: ${list.length} aba(s). Somente valores cacheados lidos; macros VBA não são executadas.`);
        const first = list.find((s) => s.kind !== "desconhecida" && s.kind !== "fluxo" && s.kind !== "nao_mapeada");
        if (first) pickSheet(list, first.name);
      } catch (e) { setFileMsg(`Falha ao ler planilha: ${(e as Error).message}. Nada importado.`); }
      return;
    }
    const parsed = parseCSV(await f.text());
    setRows(parsed); setHeaderIdx(0); setFileMsg(`${f.name}: ${Math.max(parsed.length - 1, 0)} linha(s) de dados (CSV).`);
    setMapping(suggestMapping(entity, parsed[0] ?? []));
  };
  const existing = useMemo(() => {
    const k = new Set<string>();
    for (const s of d.suppliers) k.add(`suppliers|${s.name.toLowerCase()}`);
    for (const m of Object.keys(d.targets)) k.add(`targets|${m}`);
    for (const r of d.receipts) k.add(`receipts|${r.date}`);
    return k;
  }, [d]);
  const doPreview = () => setPreview(classify(mapRows(entity, rows.slice(headerIdx + 1), mapping, headerIdx + 2), d.importLog, existing));
  const confirmImport = () => {
    if (!preview) return;
    const novos = preview.filter((r) => r.status === "novo");
    const at = new Date().toISOString();
    const err = update((x) => {
      for (const r of novos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v: any = r.values;
        const origin = { file: fileName, sheet: sheet || "CSV", row: r.line };
        const supOf = () => { let s = x.suppliers.find((i) => i.name.toLowerCase() === String(v.supplier).toLowerCase()); if (!s) { s = { id: uid(), name: String(v.supplier), group: "(importado — revisar)", terms: Array(10).fill(null) }; x.suppliers.push(s); } return s.id; };
        const id = uid();
        if (entity === "planned") x.planned.push({ id, supplierId: supOf(), purchaseCode: String(v.purchaseCode ?? ""), document: String(v.document ?? ""), value: v.value, baseDate: v.baseDate, categoryId: "", notes: "importado", status: "ativo", remainingOverride: null, origin });
        if (entity === "committed") x.committed.push({ id, supplierId: supOf(), purchaseCode: String(v.purchaseCode ?? ""), document: String(v.document), value: v.value, dueDate: v.dueDate, extensionDate: v.extensionDate ?? null, extensionHistory: v.extensionDate ? [{ from: null, to: v.extensionDate, at, note: "importado" }] : [], extensionInfo: "", legacyAbatement: v.legacyAbatement ?? null, origin: v.legacyAbatement != null ? "legado" : "manual", plannedId: null, effectivationId: null, categoryId: "", notes: "importado", status: "ativo", importOrigin: origin });
        if (entity === "expenses") x.expenses.push({ id, supplierId: supOf(), document: String(v.document), value: v.value, baseDate: v.baseDate, termDays: v.termDays ?? null, extensionDate: null, extensionHistory: [], categoryId: "", notes: "importado", status: "ativo", importOrigin: origin });
        if (entity === "suppliers") x.suppliers.push({ id, name: String(v.name), group: String(v.group ?? ""), terms: Array.from({ length: 10 }, (_, i) => (v[`t${i + 1}`] as number | null) ?? null) });
        if (entity === "receipts") { const plats: Record<string, number | null> = {}; ["p1", "p2", "p3"].forEach((k, i) => { if (v[k] != null) plats[x.platforms[i] ?? `Plataforma ${i + 1}`] = v[k]; }); x.receipts.push({ id, date: v.date, platforms: plats, general: v.general ?? null, notes: `importado ${origin.sheet}:${origin.row}` }); }
        if (entity === "targets") x.targets[v.month] = v.meta;
        x.importLog.push({ entity, key: r.key, hash: r.hash, refId: entity === "targets" ? v.month : id, at, origin });
      }
    });
    const c = (s: string) => preview.filter((r) => r.status === s).length;
    setResult(err ? `Erro: ${err}` : `${novos.length} linha(s) adicionadas ao RASCUNHO (ainda não gravadas — revise e confirme na barra superior). Idênticas ignoradas: ${c("idêntico")}. Conflitos não importados: ${c("conflito")}. Inválidas: ${c("inválido")}.`);
    setPreview(null);
  };
  const download = (name: string, csv: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); };
  const sname = (id: string) => d.suppliers.find((s) => s.id === id)?.name ?? "";
  const exportFlow = () => download("fluxo.csv", toCSV(["Data", "Saldo inicial", "Recebimento usado", "Informado?", "Planejadas", "Efetivadas", "Despesas", "Saídas", "Saldo final"], res.days.map((x) => [fmtDate(x.date), fmtNum(x.saldoInicial), fmtNum(x.recUsado), x.usouInformado ? "sim" : "não", fmtNum(x.planejada), fmtNum(x.comprometida), fmtNum(x.despesa), fmtNum(x.saidas), fmtNum(x.saldoFinal)])));
  const exportLanc = () => download("lancamentos.csv", toCSV(["Tipo", "Fornecedor", "Código", "Documento", "Valor", "Data no fluxo", "Estado"], [
    ...d.planned.map((p) => ["previsão", sname(p.supplierId), p.purchaseCode, p.document, fmtNum(p.value), fmtDate(p.baseDate) + " (base)", p.status]),
    ...d.committed.map((c) => ["efetivado", sname(c.supplierId), c.purchaseCode, c.document, fmtNum(c.value), fmtDate(committedDate(c)), c.status]),
    ...d.expenses.map((e) => ["despesa", sname(e.supplierId), "", e.document, fmtNum(e.value), fmtDate(expenseDate(e) ?? ""), e.status]),
  ]));
  const fluxoSheet = sheets.find((s) => s.kind === "fluxo");
  const reconDiffs = recon?.ok ? recon.rows.filter((r) => r.diff !== 0) : [];

  return (
    <div className="space-y-3">
      <PageHeader title="Regras e Conciliação" sub="Catálogo extraído por análise estática; mudanças aprovadas marcadas. Sem homologação." />
      <section className="card overflow-auto p-3">
        <div className="lbl mb-2">Catálogo de regras</div>
        <table className="tbl"><thead><tr><th>ID</th><th>Origem</th><th>Regra</th><th>Fórmula</th><th>Situação</th><th>Teste automatizado</th></tr></thead>
          <tbody>{CATALOG.map((r) => <tr key={r.id}><td>{r.id}</td><td><span className="tag tag-ok">{r.origem}</span></td><td>{r.regra}</td><td className="font-mono text-[11px]">{r.formula}</td><td>{r.status}</td><td>{r.teste}</td></tr>)}</tbody></table>
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-3"><div className="lbl mb-2">Pendências da fonte (diagnóstico)</div><ul className="list-disc space-y-1 pl-4 text-xs">{SOURCE_ISSUES.map((s) => <li key={s}>{s}</li>)}</ul></section>
        <section className="card p-3"><div className="lbl mb-2">Pendências do cenário ativo</div><WarningList items={res.warnings} /></section>
      </div>
      <section className="card p-3">
        <div className="lbl mb-2">Importação XLSX/XLSM/CSV (abas → mapeamento → prévia → validação → rascunho → confirmação)</div>
        <p className="mb-2 text-[11px] text-muted-foreground">Arquivo de referência esperado: "FLUXO DE CAIXA SANDRINI visão antiga excel que o ceo quer ver (1).xlsm" — ainda não anexado; nenhum dado real foi importado.</p>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <input type="file" accept=".csv,.txt,.xlsx,.xlsm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <span className="text-muted-foreground">{fileMsg}</span>
        </div>
        {sheets.length > 0 && (
          <table className="tbl mb-2"><thead><tr><th>Aba</th><th>Reconhecida como</th><th>Linhas</th><th>Observação</th><th /></tr></thead>
            <tbody>{sheets.map((s) => <tr key={s.name} className={s.name === sheet ? "bg-accent" : ""}><td>{s.name}</td><td>{s.kind}</td><td className="num">{s.rows.length}</td><td>{s.note}</td><td>{s.kind === "fluxo" ? <button className="btn" onClick={() => setRecon(reconcile(s.rows, res.days))}>Conciliar com motor</button> : s.kind !== "desconhecida" && s.kind !== "nao_mapeada" && <button className="btn" onClick={() => pickSheet(sheets, s.name)}>Mapear</button>}</td></tr>)}</tbody></table>
        )}
        {header.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-3 text-xs">
            <label>Tipo de dado<br /><select className="inp" value={entity} onChange={(e) => { const en = e.target.value as Entity; setEntity(en); setMapping(suggestMapping(en, header)); setPreview(null); }}>
              <option value="planned">Previsões de compra</option><option value="committed">Compras efetivadas</option><option value="expenses">Despesas</option><option value="suppliers">Fornecedores/prazos</option><option value="receipts">Recebimentos</option><option value="targets">Metas mensais</option></select></label>
            <label>Linha do cabeçalho<br /><input className="inp num w-14" type="number" min={1} value={headerIdx + 1} onChange={(e) => { const h = Math.max(0, Number(e.target.value) - 1); setHeaderIdx(h); setMapping(suggestMapping(entity, rows[h] ?? [])); }} /></label>
            {FIELDS[entity].map((f) => (
              <label key={f.key}>{f.label}{f.required && " *"}<br />
                <select className="inp" value={mapping[f.key] ?? -1} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}><option value={-1}>— não mapear —</option>{header.map((h, i) => <option key={i} value={i}>{String(h ?? "") || `Coluna ${i + 1}`}</option>)}</select>
              </label>
            ))}
            <button className="btn self-end" onClick={doPreview}>Gerar prévia</button>
          </div>
        )}
        {entity === "committed" && header.length > 0 && <p className="mb-2 text-xs text-warning-foreground">Coluna M ("base de abatimento legado") não é sugerida automaticamente: confirme manualmente qual coluna é M. Sem M, abatimentos ficam marcados como não confiáveis.</p>}
        {preview && (
          <>
            <div className="max-h-72 overflow-auto"><table className="tbl"><thead><tr><th>Linha</th><th>Situação</th>{FIELDS[entity].map((f) => <th key={f.key}>{f.label}</th>)}<th>Problemas</th></tr></thead>
              <tbody>{preview.map((r) => <tr key={r.line}><td>{r.line}</td><td><span className={`tag ${r.status === "novo" ? "tag-ok" : r.status === "idêntico" ? "" : r.status === "conflito" ? "tag-warn" : "tag-err"}`}>{r.status}</span></td>{FIELDS[entity].map((f) => <td key={f.key}>{f.type.startsWith("money") ? fmtNum(r.values[f.key] as number | null) : f.type.startsWith("date") ? fmtDate(r.values[f.key] as string | null) : String(r.values[f.key] ?? "")}</td>)}<td className="text-destructive">{r.errors.join("; ")}</td></tr>)}</tbody></table></div>
            <button className="btn btn-primary mt-2" disabled={!preview.some((r) => r.status === "novo")} onClick={confirmImport}>Adicionar {preview.filter((r) => r.status === "novo").length} linha(s) nova(s) ao rascunho</button>
          </>
        )}
        {result && <p className="mt-2 text-xs font-medium text-primary">{result}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">Identidade estável: chave por entidade + hash do conteúdo, registradas com origem arquivo/aba/linha. Reimportação idêntica é ignorada; mesma chave com conteúdo diferente vira conflito. Vazio ≠ zero; datas seriais e dd/mm/aaaa aceitas; fornecedores/documentos lidos como texto. Matrizes distribuídas (aba FLUXO DE CAIXA) nunca são importadas.</p>
      </section>
      {(fluxoSheet || recon) && (
        <section className="card p-3">
          <div className="lbl mb-2">Conciliação com valores cacheados da aba FLUXO DE CAIXA</div>
          {!recon ? <p className="text-xs">Clique em "Conciliar com motor" na aba FLUXO DE CAIXA.</p> : !recon.ok ? <p className="text-xs text-destructive">{recon.message}</p> : <>
            <p className="text-xs">{recon.message} Linhas: {recon.labels.join(" · ") || "nenhuma"}. Divergências: {reconDiffs.length} de {recon.rows.length} comparações.</p>
            <p className="mb-2 text-[11px] text-muted-foreground">Valores cacheados podem estar desatualizados (Excel não recalculado). Divergências esperadas por mudanças aprovadas: zero confirmado, soma de parcelas coincidentes, resíduo na última parcela, prorrogação confirmada, pagamentos, efetivações. Meta ou M ausentes aparecem como pendência, nunca como valor saudável.</p>
            <div className="max-h-72 overflow-auto"><table className="tbl"><thead><tr><th>Data</th><th>Métrica</th><th className="num">Excel (cache)</th><th className="num">Motor</th><th className="num">Diferença</th></tr></thead>
              <tbody>{reconDiffs.slice(0, 500).map((r, i) => <tr key={i}><td>{fmtDate(r.date)}</td><td>{r.metric}</td><td className="num">{r.excel === null ? "vazio" : fmtNum(r.excel)}</td><td className="num">{fmtNum(r.engine)}</td><td className="num neg">{r.diff === null ? "—" : fmtNum(r.diff)}</td></tr>)}</tbody></table></div>
          </>}
        </section>
      )}
      <section className="card flex gap-2 p-3"><button className="btn" onClick={exportFlow}>Exportar fluxo do período (CSV)</button><button className="btn" onClick={exportLanc}>Exportar lançamentos (CSV)</button></section>
    </div>
  );
}
