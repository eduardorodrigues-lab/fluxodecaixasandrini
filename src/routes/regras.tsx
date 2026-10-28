import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, WarningList } from "@/components/kit";
import { committedDate, computeFlow, expenseDate } from "@/lib/engine/engine";
import { fmtDate } from "@/lib/dates";
import { fmtNum } from "@/lib/money";
import { classify, FIELDS, mapRows, parseCSV, toCSV, type Entity, type ParsedRow } from "@/lib/importer";
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
  { id: "C", origem: "Excel antigo", regra: "Informado substitui estimativa", formula: "SE(soma dia≠0; informado; estimado)", status: "implementado; evolução futura só como opção distinta", teste: "Regra C" },
  { id: "C2", origem: "Web", regra: "Soma D:O inclui geral e plataformas", formula: "P=SOMA(plataformas+geral); R=P−Q", status: "implementado com alerta de dupla contagem", teste: "Regra C — dupla" },
  { id: "D1", origem: "Web", regra: "Parcelas planejadas", formula: "qtd=COUNT(prazos); parcela=valor/qtd; venc=base+prazo", status: "implementado", teste: "Regra D — vazio vs zero" },
  { id: "D2", origem: "Excel antigo", regra: "Abatimento planejadas", formula: "P=valor/COUNTIF(>0); Q=SUMIF(cód; M)/COUNTIF; R=P−Q", status: "implementado; M precisa ser importado", teste: "Regra D — abatimento / M ausente" },
  { id: "E", origem: "Excel antigo (macros)", regra: "Distribuição comprometidas/despesas", formula: "comprometidas: F em G; despesas: F em C+G se G não vazio", status: "implementado sem executar VBA", teste: "Regra F" },
  { id: "F", origem: "Web", regra: "Data efetiva realizados", formula: "compras: SE(J≠0;J;I); despesas: data original I", status: "implementado; divergência explícita", teste: "Regra F" },
  { id: "G", origem: "Web", regra: "Saldo e ajuste manual", formula: "final=inicial−saídas+recebimento; L não vazio substitui", status: "implementado", teste: "Regra G" },
  { id: "I", origem: "Proposta", regra: "Centavos e arredondamento", formula: "centavos inteiros; meio p/ longe do zero; resíduo reportado", status: "implementado", teste: "arredondamento 100/3" },
  { id: "P1", origem: "Proposta", regra: "Colisão de prazos na mesma data", formula: "macro sobrescreve; sistema soma + pendência", status: "pendente de decisão", teste: "colisão" },
];
const SOURCE_ISSUES = [
  "Web — planejadas no fluxo (col. E) usam faixa até a linha 1962, mas o cadastro vai até 3364. Diagnóstico da fonte; não reproduzido.",
  "Web — títulos N3385 contém #REF! mascarado por IFERROR, e o trecho seguinte tem referência deslocada. Não reproduzido nem corrigido sem conciliação.",
  "Legado — macros gravam em matriz lançamento × 2040–2191 dias; substituído por parcelas agregadas por data.",
  "Legado — Distribuir Seleção usa marca não vazia em D (planejadas/despesas) e E (efetuadas); seleção parcial não implementada nesta versão.",
  "Legado — demais parcelas de comprometidas/despesas estão comentadas nas macros ativas; não distribuídas.",
];

function Page() {
  const { active, ui, update, state, addImportLog } = useApp();
  const d = active.data;
  const res = useMemo(() => computeFlow(d, { start: ui.start, end: ui.end }), [d, ui.start, ui.end]);
  const [entity, setEntity] = useState<Entity>("planned");
  const [rows, setRows] = useState<string[][]>([]);
  const [fileMsg, setFileMsg] = useState("");
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [result, setResult] = useState("");
  const header = rows[0] ?? [];
  const scenarioLog = state.importLog.filter((l) => l.scenarioId === active.id);

  const onFile = async (f: File) => {
    setPreview(null); setResult("");
    if (/\.(xlsx|xlsm|xls)$/i.test(f.name)) { setRows([]); setFileMsg("Leitura de .xlsx/.xlsm não está disponível nesta versão (e macros VBA nunca são executadas). Exporte a planilha como CSV (separador ;) e importe aqui."); return; }
    const text = await f.text();
    const parsed = parseCSV(text);
    setRows(parsed); setFileMsg(`${f.name}: ${Math.max(parsed.length - 1, 0)} linha(s) de dados.`);
    const auto: Record<string, number> = {};
    for (const fd of FIELDS[entity]) auto[fd.key] = (parsed[0] ?? []).findIndex((h) => h.trim().toLowerCase() === fd.label.toLowerCase());
    setMapping(auto);
  };
  const doPreview = () => setPreview(classify(mapRows(entity, rows.slice(1), mapping), scenarioLog));
  const confirmImport = () => {
    if (!preview) return;
    const novos = preview.filter((r) => r.status === "novo");
    const log: typeof state.importLog = [];
    update((x) => {
      for (const r of novos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v: any = r.values;
        let sup = x.suppliers.find((s) => s.name.toLowerCase() === String(v.supplier).toLowerCase());
        if (!sup) { sup = { id: uid(), name: String(v.supplier), group: "(importado)", terms: Array(10).fill(null) }; x.suppliers.push(sup); }
        const id = uid();
        if (entity === "planned") x.planned.push({ id, supplierId: sup.id, purchaseCode: String(v.purchaseCode ?? ""), document: String(v.document ?? ""), value: v.value as number, baseDate: v.baseDate as string, categoryId: "", notes: "importado CSV", status: "ativo" });
        if (entity === "committed") x.committed.push({ id, supplierId: sup.id, purchaseCode: String(v.purchaseCode ?? ""), document: String(v.document), value: v.value as number, dueDate: v.dueDate as string, extensionDate: (v.extensionDate as string) ?? null, extensionInfo: "", legacyAbatement: (v.legacyAbatement as number) ?? null, categoryId: "", notes: "importado CSV", status: "ativo" });
        if (entity === "expenses") x.expenses.push({ id, supplierId: sup.id, document: String(v.document), value: v.value as number, baseDate: v.baseDate as string, termDays: (v.termDays as number) ?? null, extensionDate: null, categoryId: "", notes: "importado CSV", status: "ativo" });
        log.push({ scenarioId: active.id, entity, key: r.key, hash: r.hash, refId: id, at: new Date().toISOString() });
      }
    });
    addImportLog(log);
    const c = (s: string) => preview.filter((r) => r.status === s).length;
    setResult(`Importados: ${novos.length}. Idênticos ignorados: ${c("idêntico")}. Conflitos não importados: ${c("conflito")}. Inválidos: ${c("inválido")}. Salvo localmente no navegador.`);
    setPreview(null);
  };
  const download = (name: string, csv: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); };
  const sname = (id: string) => d.suppliers.find((s) => s.id === id)?.name ?? "";
  const exportFlow = () => download("fluxo.csv", toCSV(["Data", "Saldo inicial", "Recebimento usado", "Informado?", "Planejadas", "Comprometidas", "Despesas", "Saídas", "Saldo final"], res.days.map((x) => [fmtDate(x.date), fmtNum(x.saldoInicial), fmtNum(x.recUsado), x.usouInformado ? "sim" : "não", fmtNum(x.planejada), fmtNum(x.comprometida), fmtNum(x.despesa), fmtNum(x.saidas), fmtNum(x.saldoFinal)])));
  const exportLanc = () => download("lancamentos.csv", toCSV(["Tipo", "Fornecedor", "Código", "Documento", "Valor", "Data no fluxo", "Estado"], [
    ...d.planned.map((p) => ["planejada", sname(p.supplierId), p.purchaseCode, p.document, fmtNum(p.value), fmtDate(p.baseDate) + " (base)", p.status]),
    ...d.committed.map((c) => ["comprometida", sname(c.supplierId), c.purchaseCode, c.document, fmtNum(c.value), fmtDate(committedDate(c, d.params.profile)), c.status]),
    ...d.expenses.map((e) => ["despesa", sname(e.supplierId), "", e.document, fmtNum(e.value), fmtDate(expenseDate(e, d.params) ?? ""), e.status]),
  ]));

  return (
    <div className="space-y-3">
      <PageHeader title="Regras e Conciliação" sub="Catálogo extraído por análise estática das fórmulas; sem recálculo do Excel e sem homologação." />
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
        <div className="lbl mb-2">Importação CSV (mapeamento → prévia → validação → confirmação)</div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <select className="inp" value={entity} onChange={(e) => { setEntity(e.target.value as Entity); setPreview(null); }}><option value="planned">Compras planejadas</option><option value="committed">Compras comprometidas</option><option value="expenses">Despesas</option></select>
          <input type="file" accept=".csv,.txt,.xlsx,.xlsm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <span className="text-muted-foreground">{fileMsg}</span>
        </div>
        {header.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-3">
            {FIELDS[entity].map((f) => (
              <label key={f.key} className="text-xs">{f.label}{f.required && " *"}<br />
                <select className="inp" value={mapping[f.key] ?? -1} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}><option value={-1}>— não mapear —</option>{header.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}</select>
              </label>
            ))}
            <button className="btn self-end" onClick={doPreview}>Gerar prévia</button>
          </div>
        )}
        {preview && (
          <>
            <div className="max-h-72 overflow-auto"><table className="tbl"><thead><tr><th>Linha</th><th>Situação</th>{FIELDS[entity].map((f) => <th key={f.key}>{f.label}</th>)}<th>Problemas</th></tr></thead>
              <tbody>{preview.map((r) => <tr key={r.line}><td>{r.line}</td><td><span className={`tag ${r.status === "novo" ? "tag-ok" : r.status === "idêntico" ? "" : r.status === "conflito" ? "tag-warn" : "tag-err"}`}>{r.status}</span></td>{FIELDS[entity].map((f) => <td key={f.key}>{f.type.startsWith("money") ? fmtNum(r.values[f.key] as number | null) : f.type.startsWith("date") ? fmtDate(r.values[f.key] as string | null) : String(r.values[f.key] ?? "")}</td>)}<td className="text-destructive">{r.errors.join("; ")}</td></tr>)}</tbody></table></div>
            {entity === "committed" && preview.some((r) => r.values["legacyAbatement"] == null) && <p className="mt-1 text-xs text-warning-foreground">Linhas sem "Base de abatimento legado (M)": o abatimento das planejadas vinculadas ficará marcado como não confiável.</p>}
            <button className="btn btn-primary mt-2" disabled={!preview.some((r) => r.status === "novo")} onClick={confirmImport}>Confirmar importação de {preview.filter((r) => r.status === "novo").length} linha(s) nova(s)</button>
          </>
        )}
        {result && <p className="mt-2 text-xs font-medium text-primary">{result}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">Identidade estável: chave por entidade (código+documento+data) e hash do conteúdo. Reimportar a mesma linha é ignorado; mesma chave com conteúdo diferente vira conflito e não sobrescreve. Prazos de fornecedores criados na importação ficam vazios.</p>
      </section>
      <section className="card flex gap-2 p-3"><button className="btn" onClick={exportFlow}>Exportar fluxo do período (CSV)</button><button className="btn" onClick={exportLanc}>Exportar lançamentos (CSV)</button></section>
    </div>
  );
}
