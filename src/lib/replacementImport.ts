// Read-only replacement preparation; never accepts an existing financial base.
import { emptyData } from "./engine/actions";
import { applyImportRows } from "./importApply";
import { classify, hashStr, mapRows, suggestMapping, type Cell, type Entity } from "./importer";
import { adaptTargets, layoutMapping, normName, type SheetInfo } from "./xlsxImport";
import type { ScenarioData } from "./engine/types";

export const replacementSubgroups = ["Aluguéis e Locações", "Aquisição de Imobilizado", "Consultoria e Assessoria", "Consórcios", "Despesas Administrativas", "Despesas com Pessoal", "Despesas com Veículos", "Distribuição de Lucros", "Empréstimos Bancários", "Financiamentos", "Fretes e Logística", "Impostos e Tributos", "Investimentos Financeiros", "Manutenção e Conservação", "Materiais de Consumo e Limpeza", "Mútuos entre Empresas", "Obras e Construções", "Outras Despesas Operacionais", "Publicidade e Marketing", "Seguros", "Serviços Contábeis e Jurídicos", "Softwares e Tecnologia", "Tarifas e Serviços Bancários", "Taxas e Comissões de Marketplaces", "Utilidades e Telecomunicações"];
export function classifyReplacementExpense(type: string, description: string) {
  const d = normName(description), t = normName(type), text = `${t} ${d}`;
  const rules: [RegExp, string][] = [
    [/017766350|MADEIRA.?MADEIRA|MAMADEIRAMAMADEIRA/, "Obras e Construções"],
    [/PONTO MAIS|CIEE|IPEFAE|INSTITUTO DE PESQUISAS|SWILLE|SWILE/, "Despesas com Pessoal"],
    [/\b13[º°]|COMPLEMENTO.*META|REEMBOLSO.*FACULDADE|PADARIA|CAFE |\bRH\b/, "Despesas com Pessoal"],
    [/CHAT GPT|CHATGPT|RECARGA PROGRAMA/, "Softwares e Tecnologia"],
    [/PNEU|CAMINHONEIRO|VELOTA|AERO SPARK/, "Despesas com Veículos"],
    [/BANCO SAFRA.*CONTRATO/, "Empréstimos Bancários"],
    [/PLANO DE SAUDE|BRADSAUDE|ODONTOPREV|EXAMES PERIOD|SWIL+E|CESTA BASICA|PRATO CHEIO|REEMBOLSO FUNCION|CONVENIO FARMAC|CAFE FUNCION|MASSIMO ZANETTI|CAFE DA MANHA|SALGAD|FESTINHA|ANIVERSARIANTE|CAMPANHA ESCOLHA|ENDOMARKETING|RECRUTAMENTO|CONTRATACAO|HUNTER|VALE (ALIMENT|TRANSP)|FERIAS|RESCIS|RECISAO|SALARIO|PRO LABORE|FGTS|INSS|SINDICAL|CURSOS|TREINAMENT|POS GRADUACAO/, "Despesas com Pessoal"],
    [/TARIFA|ANUIDADE|PACOTE (PJ|DE SERVICOS)|CESTA PJ|JUROS|MULTA|EMOLUMENTO|TAXA (BANCARIA|DE CARTAO|DO CAMBIO)|DEB.? IOF|IOF /, "Tarifas e Serviços Bancários"],
    [/\bADS\b|PUBLICIDADE|MARKETING|CREATOR|LETREIRO|MIDIA GRAFICA/, "Publicidade e Marketing"],
    [/MARKETPLACE.*TAX|TAX.*MARKETPLACE|COMISSAO.*VEND|TAXA DE LIBERACAO.*PLATAFORMA/, "Taxas e Comissões de Marketplaces"],
    [/SOFTWARE|SISTEMA|\bHUB\b|MOEDAS|MARGEM|LOVABLE|TRAY|DOMINIO|EMAIL|TECNOLOGIA|GERENCIAMENTO DE T.I|INFORMATICA|NUCLEO DE INFORMACAO|APPLE.COM\/BILL|FABRICA DE CODIGOS/, "Softwares e Tecnologia"],
    [/CONTAB|ADVOC|JURID|JUDIC|TRIBUNAL|TJSP|MANDADO|MANDATO|CUSTAS|CERTIFICADO DIGITAL|CERTIFICADO DA SANDRINI|AGAPE|AUDITORIA/, "Serviços Contábeis e Jurídicos"],
    [/ENERGIA|ELETRICA|AGUA E ESGOTO|SABESP|TELEFON|TELECOM|\bVIVO\b|INTERNET|GALAO AGUA|AGUA SANDRINI/, "Utilidades e Telecomunicações"],
    [/OBRA|CONSTRU|REFORMA|CONCRETO|CONCRETAGEM|TINTAS|ELETRICISTA|CABOS PARA LUZ|CAIXA DAGUA|ALDARY/, "Obras e Construções"],
    [/MANUTEN|CONSERTO|REPARO|INSTALACAO|MONTAGEM|FECHADURA|AJUSTE PORTA|DEDET|DETETIZ|LANDINI|LADINI/, "Manutenção e Conservação"],
    [/LIMPEZA|CONSUMO|EMBALAGE|DESCARTAV|PAPELARIA|\bPILHA\b|DISPENSER|COPOS|GJR ETIQUET|SUPRIMENT|RNK COMERCIAL|JUPTER|HIGIENITA|ENVELOPES|F.C.? DOTA|QUADRO DE AVISOS/, "Materiais de Consumo e Limpeza"],
    [/ALUGUEL|LOCACAO|LOCADORA/, "Aluguéis e Locações"],
    [/IMOBILIZADO|CADEIRA|MOV[EÉ]IS|MESA DE ESCRITORIO|CELULAR|MICROFONE|CAIXAS DE SOM|COMPUTADOR|IPHONE|CONNECT CELL|CALDAN|CALLDAN|OPCAO SJ|BENELLI|CORTINAS|PERSIANAS/, "Aquisição de Imobilizado"],
    [/CONSORCIO/, "Consórcios"], [/FINANCIAMENTO/, "Financiamentos"], [/EMPRESTIMO|CONTA GARANTIDA|CONTRATO 6214417/, "Empréstimos Bancários"],
    [/DISTRIBUICAO DE LUCRO/, "Distribuição de Lucros"], [/APLICACAO FINANCEIRA|CAPITALIZACAO|INVESTIMENTO/, "Investimentos Financeiros"],
    [/SEGURO|ALLIANZ/, "Seguros"], [/FRETE|LOGISTICA|EXPEDICAO|TRANSPORT|CORREIOS|SFERA|DHL/, "Fretes e Logística"],
    [/VEICUL|GASOLINA|COMBUSTIV|ABASTEC|SEM PARAR|FROTA|AUTOMOT|PNEUS|LICENCIAMENTO|DIESEL|MERCEDES|ZONA AZUL/, "Despesas com Veículos"],
    [/IMPOST|TRIBUTO|ICMS|DIFAL|IPTU|ISS-QN|SIMPLES|PIS|COFINS|GNRE|SEFAZ|IRPJ|CSLL|PARCELAMENTO|ALVARA|FISCALIZACAO|PREFEITURA/, "Impostos e Tributos"],
    [/CONSULTORIA|ASSESSORIA|ASSESORIA|ACESSORIA|RADAR/, "Consultoria e Assessoria"],
    [/MUTUO|APORTE|TRANSFER|TRANSF|TRANFS|DINHEIRO LOJAS/, "Mútuos entre Empresas"],
    [/IMPORTACAO|ANTES DO EMBARQUE/, "Fretes e Logística"],
    [/CARTAO|FATURA|FAT DO |GASTOS - MARKETPLACE|PROVISAO DE GASTOS CD|REEMBOLSO|DESPACHANTE|CARTORIO/, "Despesas Administrativas"],
    [/HOTEL|HOSPEDAGEM|VIAGEM|PASSAGEM|AIRBNB|RESTAURANTE|COQUETE|CONFRATERN|SEGURANCA|GUARDINHA|LL ALARMES|HOYALT|ROYALT|DOACAO|PAROQUIA|CIESP|PROVISAO DE CONTINGENCIA|DESPESAS DIVERSAS|GASTOS - (ESTOQUE|SUPRIMENTOS|RENAN)|DESPESA.*CARTAO|GASTO.*CARTAO|CARTAO DE CREDITO EMPRESARIAL|DIFERENCA FATURA|PG DE CARTAO|SANTANDER EMPRESAS GOLD|ESTORNO/, "Despesas Administrativas"],
  ];
  // Description decides before a generic source type; M&S/shops remain expenses, never bank transfers.
  const hit = rules.find(([re]) => re.test(d)) ?? rules.find(([re]) => re.test(t));
  if (hit) return { subgroup: hit[1], evidence: `TIPO + descrição; regra ${hit[0].source}`, pending: false };
  return { subgroup: "Despesas Administrativas", evidence: `Proposta provisória: finalidade ausente em ${text}; conferir identificação específica`, pending: true };
}
export interface ReplacementEntry { sheet: string; row: number; entity: string; id: string | null; raw: Cell[]; value: number | null; errors: string[]; repairs: string[]; subgroup?: string; classificationPending?: boolean; evidence?: string }
export function prepareReplacement(sheets: SheetInfo[], sourceHash: string, file: string) {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error("SHA256 da fonte obrigatório");
  const data = emptyData(), entries: ReplacementEntry[] = [];
  const at = "2026-11-19T16:34:00.000Z";
  const id = (entity: string, key: string) => `src-${sourceHash.slice(0, 12)}-${entity}-${hashStr(key)}`;
  data.categories = [{ id: id("cat", "compra"), name: "Mercadoria para a revenda", kind: "compra", group: "" }, ...replacementSubgroups.map(name => ({ id: id("cat", name), name, kind: "despesa" as const, group: "" }))];
  // Exact original spelling, not financial aliases. Only whitespace at the edges is trimmed.
  const supplierNames = new Map<string, (number | null)[]>();
  for (const s of sheets) {
    if (s.kind === "suppliers") for (const r of s.rows.slice(s.headerRow + 1)) if (typeof r[0] === "string" && r[0].trim()) supplierNames.set(r[0].trim(), Array.from({ length: 10 }, (_, i) => typeof r[i + 1] === "number" ? r[i + 1] as number : null));
    if (s.kind === "planned" || s.kind === "committed") for (const r of s.rows.slice(s.headerRow + 1)) {
      const name = r[1] === null || r[1] === undefined ? "" : String(r[1]).trim();
      if (name && !supplierNames.has(name)) supplierNames.set(name, Array(10).fill(null));
    }
  }
  data.suppliers = [...supplierNames].map(([name, terms]) => ({ id: id("sup", name), name, terms, group: "", note: "Identificação exata da fonte; sem aliases herdados" }));
  for (const entity of ["planned", "committed", "expenses", "receipts"] as Entity[]) {
    const sheet = sheets.find(s => s.kind === entity);
    if (!sheet) throw new Error(`Aba essencial ausente: ${entity}`);
    const { map, fixed } = layoutMapping(entity, sheet.rows, sheet.headerRow, h => suggestMapping(entity, h));
    if (!fixed) throw new Error(`Cabeçalho não confirmado: ${sheet.name}`);
    const parsed = mapRows(entity, sheet.rows.slice(sheet.headerRow + 1), map, sheet.headerRow + 2);
    for (const row of parsed) {
      const raw = sheet.rows[row.line - 1] ?? [];
      if (!raw.some(v => v !== null && v !== "")) continue;
      const valueColumn = entity === "planned" ? 4 : 5;
      const sourceValue = typeof raw[valueColumn] === "number" ? raw[valueColumn] as number : null;
      const repairs: string[] = [];
      row.errors = row.errors.filter(error => {
        if (error === "Código compra vazio" || error === "Documento vazio" || error === "Descrição/Documento vazio") { repairs.push(`${error}: opcional, mantido vazio sem inventar identificador`); return false; }
        return true;
      });
      if (entity === "committed" && raw[3] === "-") {
        row.values['baseDate'] = null;
        row.errors = row.errors.filter(error => !error.startsWith("Data faturamento"));
        repairs.push("Data faturamento '-' significa não informada; vencimento G explícito preservado");
      }
      // Preserve every literal source amount, including fractional cents, zero, 1 and missing.
      if (sourceValue !== null) row.values[entity === "receipts" ? "amount" : "value"] = sourceValue * 100;
      if (entity === "committed" && typeof raw[12] === "number") row.values['legacyAbatement'] = raw[12] * 100;
      const entry: ReplacementEntry = { sheet: sheet.name, row: row.line, entity, id: null, raw, value: sourceValue, errors: [...row.errors], repairs };
      entries.push(entry);
      if (row.errors.length) continue; // explicit quarantine in manifest, never silent omission
      const originalSupplier = String(row.values['supplier'] ?? "").trim();
      row.values['supplier'] = null;
      if (entity === "expenses") {
        const classification = classifyReplacementExpense(String(raw[0] ?? ""), String(raw[1] ?? ""));
        row.values['category'] = classification.subgroup;
        entry.subgroup = classification.subgroup; entry.classificationPending = classification.pending; entry.evidence = classification.evidence;
      }
      row.key = `${sourceHash}|${sheet.name}|${row.line}`;
      row.hash = hashStr(JSON.stringify(raw));
      const recordId = id(entity, `${sheet.name}:${row.line}`);
      const result = applyImportRows(data, entity, classify([row], data.importLog), { file, sheet: sheet.name, at, uid: () => recordId });
      if (result.applied !== 1) { entry.errors.push(...result.skipped); continue; }
      entry.id = recordId;
      const origin = { file, sheet: sheet.name, row: row.line, raw };
      if (entity === "planned") {
        const record = data.planned.at(-1);
        if (record) { record.origin = origin; record.sourceSupplier = originalSupplier; record.supplierId = id("sup", originalSupplier); record.categoryId = data.categories[0]?.id ?? ""; }
      }
      if (entity === "committed") {
        const record = data.committed.at(-1);
        if (record) { record.importOrigin = origin; record.sourceSupplier = originalSupplier; record.supplierId = id("sup", originalSupplier); record.document = String(raw[2] ?? ""); const baseDate = row.values['baseDate']; if (typeof baseDate === "string") record.baseDate = baseDate; record.categoryId = data.categories[0]?.id ?? ""; }
      }
      if (entity === "expenses") { const record = data.expenses.at(-1); if (record) { record.importOrigin = origin; record.document = String(raw[1] ?? ""); } }
      if (entity === "receipts") {
        const record = data.receipts.at(-1);
        if (record) { record.origin = origin; record.legacyZeroEstimate = true; record.realized = false; record.kind = normName(String(raw[0] ?? "")) === "REAL" ? "realizado" : "previsto"; }
      }
    }
  }
  // Platform IDs created by the general adapter are remapped deterministically by exact name.
  const platformIds = new Map<string, string>();
  for (const p of data.platforms) { const next = id("plat", p.name); platformIds.set(p.id, next); p.id = next; }
  for (const r of data.receipts) r.platforms = Object.fromEntries(Object.entries(r.platforms).map(([key, value]) => [platformIds.get(key) ?? key, value]));
  const targetSheet = sheets.find(s => s.kind === "targets");
  if (!targetSheet) throw new Error("Previsão de vendas ausente");
  const targetRows = adaptTargets(targetSheet.rows);
  if (targetRows.reducerB2 === null || targetRows.lagC2 === null) throw new Error("Redutor/defasagem ausentes na fonte");
  data.params.legacyReducer = targetRows.reducerB2; data.params.lagDays = targetRows.lagC2;
  for (const target of targetRows.rows) {
    const gross = targetSheet.rows.slice(6).reduce((sum, r) => sum + (typeof r[target.column] === "number" ? r[target.column] as number : 0), 0) * 100;
    entries.push({ sheet: targetSheet.name, row: 2, entity: "targets", id: target.month, raw: [target.month, gross / 100, target.liquido], value: gross / 100, errors: target.errors, repairs: [] });
    if (target.faturamento === null || target.errors.length) continue;
    data.targets[target.month] = gross;
    data.targetConfigs[target.month] = { gross, legacyReducer: targetRows.reducerB2, divisorLegado: "30", webR1: 0, webR2: 0, r2Base: "apos_r1", divisorWeb: "30", lagDays: targetRows.lagC2, sourceExact: true, version: 1, history: [] };
  }
  return { data, entries, sourceHash, paymentRule: "Efetuadas = efetivado sem baixa; despesas = título importado com situação a confirmar, nunca pago por data. Nenhum cutoff. Recebimento REAL é rótulo da fonte, realized=false sem prova bancária." };
}
export function replacementFinancialEmpty(data: ScenarioData) {
  return [data.payments, data.effectivations, data.adjustments, data.transfers, data.bankAccounts, data.cards, data.cardOps].every(rows => rows.length === 0);
}