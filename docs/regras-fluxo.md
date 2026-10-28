# Fluxo de Caixa Sandrini — Regras e schema (versão inicial, NÃO homologada)

Dados exibidos são DEMONSTRATIVOS. Nenhum arquivo real foi importado. Regras extraídas por análise estática das fórmulas/macros; o Excel não foi recalculado. Macros VBA nunca são executadas.

## Arquitetura
- Motor único: `src/lib/engine/engine.ts` (`computeFlow` → `buildRows` → `toVertical`). Visão vertical e horizontal consomem o mesmo `Row[]` gerado com o mesmo cenário, período e filtros.
- Sem matriz lançamento × dia: cada lançamento gera parcelas datadas, agregadas por data no cálculo.
- Recalcula a cada edição (sem botão Distribuir).
- Persistência: `localStorage` do navegador (`fluxo-sandrini:v1`), via `StorageAdapter` em `src/lib/store.tsx`. Sem backend, sem autenticação, sem multiusuário. Para backend: implementar um adapter com tabelas por `organization_id`, RLS por membro da organização, nenhum acesso anônimo.

## Perfis
- **Excel legado (padrão)**: estimativa = meta(mês de data−defasagem)·(1−B2)/divisor (padrão 30). Sem segundo redutor.
- **Web**: red1=meta·r1; red2=(meta−red1)·r2; líquido=meta−red1−red2; dia=líquido/dias reais. Ex.: 273.000, 25%, 18% → 167.895 e 5.415,967741935/dia.
- Divisores configuráveis por perfil. Perfil ativo exibido nas duas visões. Perfil ≠ homologação.

## Regras
- **B Defasagem**: data referência = data − N dias corridos; sem ajuste de fim de semana/feriado.
- **C Recebimento**: soma informada do dia ≠ 0 → usa informado; senão estimativa. Zero não é confirmação. Nunca soma informado+estimado. Soma inclui geral + plataformas (regra D:O); ambos preenchidos → alerta de possível dupla contagem, sem correção.
- **D Planejadas**:
  - Web: qtd=COUNT(prazos numéricos) — zero conta, vazio não; parcela=valor/qtd; venc=base+prazo.
  - Legado: P=valor/COUNTIF(prazos>0); Q=Σ M das efetuadas com mesmo código / COUNTIF; R=P−Q distribuído em cada prazo >0. M é campo importado; se ausente em qualquer efetuada vinculada, saúde=`abatimento_ausente` + erro. R negativo mantido. Colisão de datas: macro sobrescreve, sistema soma e registra pendência. Sem código → sem vínculo (alerta).
- **E/F Realizados**: comprometidas — legado usa vencimento G; web usa prorrogação J se preenchida, senão I. Campo K apenas informativo. Despesas: data = base + G quando G não vazio (G=0 permitido); web usa data original mesmo com prorrogação (opção explícita para mudar). Compra comprometida ≠ pagamento liquidado.
- **G Saldo**: saldo final = inicial − saídas + recebimento usado; inicial do dia seguinte = final anterior, salvo ajuste manual (0 válido) que substitui e registra diferença. Entradas Total = saldo inicial + recebimento usado. Saldos nunca são somados como movimentação (totais de período: saldo inicial = primeiro dia; saldo final = último).
- **H Pendências da fonte**: faixa E até linha 1962 vs cadastro 3364; #REF! mascarado em N3385. Registrados, não reproduzidos.
- **I Dinheiro**: centavos inteiros; arredondamento meio-para-longe-do-zero por parcela/dia; resíduo (ex.: 100/3 → 3×33,33, dif. 0,01) reportado, nunca redistribuído. Valor equivalente Currency VBA (4 casas) exibido.

## Schema (ScenarioData)
| Entidade | Campos |
|---|---|
| params | profile, legacyReducer, webR1, webR2, divisorLegado, divisorWeb, lagDays, startDate, saldoInicial, webExpenseUseExtension |
| suppliers | id, name, group, terms[10] (null=vazio) |
| categories | id, name, kind (planejada/comprometida/despesa), group |
| targets | "YYYY-MM" → meta (centavos) |
| planned | id, supplierId, purchaseCode, document, value, baseDate, categoryId, notes, status |
| committed | id, supplierId, purchaseCode, document, value, dueDate, extensionDate, extensionInfo, legacyAbatement (M), categoryId, notes, status |
| expenses | id, supplierId, document, value, baseDate, termDays, extensionDate, categoryId, notes, status |
| receipts | id, date, platforms{nome→valor\|null}, general, notes |
| adjustments | date, value (null = sem ajuste), note |

AppState: scenarios[] (base + simulações, cada uma com cópia de dados e `refHistory` de versões das referências), activeId, importLog[] (scenarioId, entity, key, hash, refId).

## Importação
CSV (`;` ou `,`) com mapeamento, prévia e validação; confirmação grava só linhas `novo`. Chave estável + hash: idêntico é ignorado, conteúdo diferente vira conflito. `.xlsx/.xlsm` não lidos nesta versão. Exportação CSV do fluxo e lançamentos.

## Limitações
Sem backend/autenticação/multiusuário; sem leitura xlsx; "Distribuir Seleção" parcial não implementada; feriados não modelados; dados demonstrativos.
