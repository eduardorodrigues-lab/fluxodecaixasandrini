# Fluxo de Caixa Sandrini — Regras, schema e critérios de aceite (NÃO homologado)

Nenhum arquivo real foi importado. Regras do legado extraídas por análise estática; Excel não recalculado; VBA nunca executado. Itens marcados **[aprovado]** são mudanças autorizadas por Eduardo — evolução, não equivalência literal com o Excel.

## Arquitetura
- Motor único `src/lib/engine/engine.ts` (`computeFlow` → `buildRows` → `toVertical`); vertical e CEO horizontal usam o mesmo `Row[]`, cenário, período e filtros.
- Ações de domínio puras em `src/lib/engine/actions.ts` (efetivar, reverter, pagar, estornar, prorrogar, normalizar); dashboard em `engine/dashboard.ts`; diff antes/depois em `src/lib/diff.ts`.
- Parcelas datadas agregadas por data; nunca matriz lançamento × dia.

## Base operacional e persistência
- **Base operacional única por organização**: login obrigatório. Tabelas `organizations`, `org_members`, `official_data` (documento JSON + `version`), `audit_log`. RLS: só membros leem a própria organização; nenhum acesso anônimo; nenhum usuário tem INSERT/UPDATE direto. Cada conta nova recebe organização própria (trigger); não existe autoinscrição em organização existente.
- Gravação somente via server function `commitOfficial` (verifica papel owner/editor, versão esperada, calcula diff no servidor) → RPC `commit_official` executável apenas pelo service role: controle otimista de versão (conflito → nada sobrescrito), idempotência por `request_id`, auditoria com antes/depois, usuário, e-mail, timestamp e snapshot anterior.
- **Sem dados demonstrativos no produto** (decisão de Eduardo, 05/11/2026): não há seletor demo/oficial. Antes do login só a tela de entrada; após login abre a organização (seletor só se houver mais de uma) ou estado vazio com cadastro inicial (Referências / Importação). Sem login, carregando ou com erro: nenhum dado financeiro, nenhum fallback. Dados de teste existem apenas nos testes automatizados (`src/test/demoFixture.ts`). Simulações e espaço demo antigos salvos no navegador são descartados na migração local. Testes: `src/test/entry-gate.test.tsx`.
- **Modo de trabalho Real / Simulação**: Simulação é cópia local por usuário+organização, banner permanente, sem gravar nem promover.
- **Simulações**: locais ao navegador, cópia isolada da base, banner permanente, sem promover/aplicar à base, sem registrar pagamentos. "Descartar hipóteses" recopia a base.

## Modo real (rascunho → revisão → confirmação)
Toda mutação da base (CRUD, edição inline, referências, metas, efetivações, pagamentos, prorrogações, importações, restaurações) vai para um rascunho em memória. A revisão mostra diff antes/depois por entidade e impacto (KPIs e primeiro dia afetado). Confirmar grava tudo de uma vez; cancelar descarta sem alterar nada. Botão desativado durante envio. Exclusões são recuperáveis pelo Histórico (restaura o "antes" para um novo rascunho).

## Conceitos
- **Planejado** = previsão. **Efetivado/Realizado** = compra ou pedido real (não é pagamento). **Pagamento** = baixa registrada (não é transferência bancária). Estado de pagamento derivado: Em aberto / Parcial / Pago / Cancelado.

## Regras
- **A Meta**: Legado (padrão): líquido = meta·(1−B2 global); diária = líquido/30 (configurável dias reais). Web: red1=meta·r1; red2=(meta−red1)·r2; líquido/dias reais. Ex.: 273.000, 25%, 18% → 167.895 e 5.415,967741935. Perfis não se misturam. Diária arredondada ao centavo por dia (meio p/ longe do zero), valor exato exibido em Meta de Faturamento. Meta ausente → estimativa 0 + pendência erro.
- **B Defasagem**: dia D usa meta do mês de D − N dias corridos; sem ajuste de fim de semana/feriado.
- **C Recebimentos [aprovado]**: ausente (todos vazios) → estimativa; qualquer valor informado, inclusive **zero confirmado**, substitui a estimativa. (Legado usava estimativa quando soma=0.) Geral + plataformas são somados (D:O) com alerta de dupla contagem, sem correção.
- **D Previsões**: Web COUNT(prazos numéricos, zero conta); Legado COUNTIF(>0), P−Q com Q = Σ M / n somente de efetuadas **legadas** vinculadas por código (sem vínculo explícito). M ausente → `abatimento_ausente` (erro). R negativo mantido. **[aprovado]** parcelas na mesma data são somadas; resíduo de arredondamento vai na **última parcela** e é exibido.
- **Efetivação [aprovado]**: vínculo estável `plannedId`/`effectivationId`; valores/parcelas/vencimentos livres (sugestão dos prazos do fornecedor). Parcial: sugere restante = restante previsto − efetivado; usuário confirma/ajusta valor e datas próprias (`remainingOverride`). Concluída: previsão `encerrado`. Sem restante explícito, o valor efetivado é abatido das parcelas padrão. Idempotente por id. Reversão auditada (cancela parcelas, restaura previsão; bloqueada com pagamento ativo ou efetivação posterior). Previsão com efetivação vinculada ignora M legado do mesmo código (alerta `PLAN_DUPLO_MECANISMO`) — sem abatimento duplo. Migração: efetuada antiga com M → origem `legado`; sem M → `manual`.
- **Pagamentos [aprovado]**: saída na data do pagamento + somente o pendente no vencimento vigente. Pagamento antes do início do fluxo reduz o aberto, não sai de novo (alerta de escopo: deve estar no saldo inicial). Não permite exceder o pendente. Estorno marca `reversedAt` (histórico preservado).
- **Prorrogação [aprovado]**: confirmada altera o vencimento vigente (compras e despesas, ambos perfis); original e histórico preservados; nunca apaga pagamento. Campo K apenas informativo. Testes de prorrogação → Simulação.
- **G Saldo**: final = inicial − saídas + recebimento usado; ajuste manual (0 válido) substitui o inicial do dia. Entradas Total inclui saldo inicial; saldos nunca somados como movimentação.
- **Dashboard**: aberto = efetivados + despesas − pagamentos ativos; exclui quitados/cancelados/previsão; vencido não é inferido como pago. Mostra maior fornecedor, ranking com títulos, vencidos, 7/15/30 dias, previsão restante separada, saldo mínimo/data, primeiro negativo, necessidade de caixa = max(0, −saldo mínimo).
- **H Pendências da fonte**: faixa E até linha 1962 vs 3364; #REF! em N3385 — registrados, não reproduzidos.

## Importação XLSX/XLSM/CSV
SheetJS lê apenas valores cacheados (`bookVBA:false`). Reconhece abas FLUXO DE CAIXA (só conciliação), RECEBIMENTOS, PREVISÃO DE VENDAS, TABELA_FORNECEDORES, TABELA_DESPESAS (não mapeada — revisar), COMPRAS DIRETAS_PLANEJADAS, COMPRAS DIRETAS_EFETUADAS, DESPESAS E OUTRAS. Linha de cabeçalho detectada/editável, mapeamento sugerido (coluna M nunca sugerida), datas seriais e dd/mm/aaaa, vazio ≠ zero, fornecedor/documento como texto, origem arquivo/aba/linha, chave estável + hash (idêntico ignorado, divergente = conflito, cadastro existente sem log = conflito). Linhas válidas entram no rascunho; gravação só após confirmação. Conciliação compara saldo inicial, recebimentos, saídas, custo, despesas e saldo final diários com o cache da aba FLUXO DE CAIXA.

## Schema (ScenarioData)
params, platforms, suppliers{terms[10]}, categories, targets{YYYY-MM→centavos}, planned{status ativo|cancelado|encerrado, remainingOverride, origin}, committed{dueDate, extensionDate, extensionHistory, extensionInfo(K), legacyAbatement(M), origin legado|efetivacao|manual, plannedId, effectivationId, importOrigin}, expenses{termDays, extensionDate, extensionHistory}, effectivations{kind, value, committedIds, prev, reversedAt}, payments{titleKind, titleId, date, amount, reversedAt}, receipts, adjustments, importLog{entity,key,hash,refId,origin}.

## Critérios de aceite (cobertos por testes em `src/lib/**/*.test.ts`)
Redutores web; divisor 30 × dias reais e fevereiro bissexto; defasagem na virada; meta ausente = pendência; zero confirmado × ausente; dupla contagem; vazio × zero de prazo; datas corridas; abatimento M e M ausente; soma de parcelas coincidentes; resíduo na última; prorrogação confirmada preservando original; ajuste manual 0; igualdade vertical/horizontal; efetivação parcial 6000 (45/75) mantendo 4000 em datas próprias, concluída, idempotência, múltiplas, sem abatimento duplo, reversão; pagamentos parcial/total/estorno/antes do início/excesso; prorrogação não apaga pagamento; dashboard; rascunho não altera base e cancelar não muda nada; normalização; XLSX: abas, datas seriais, texto, vazio, idempotência, conflito, conciliação. Autorização verificada manualmente: leitura anônima vazia e RPC de gravação negada a anônimos.

## Limitações reais
Fluxo autenticado completo (login → gravar na base oficial) não verificado de ponta a ponta nesta entrega (sem conta de teste confirmada). Convite de novos membros a uma organização não implementado (cada conta tem a própria). Rascunho fica em memória (recarregar a página descarta). "Distribuir Seleção" e feriados não modelados. Arquivo .xlsm real ainda não anexado.

## Revisão 28/10/2026 — Importação CEO, conciliação e compartilhamento

### Conciliação (aba FLUXO DE CAIXA)
- Calendário = **linha 3** com A=NATUREZA, B=GRUPO, C=DESCRIÇÃO e datas reais em D+. A **linha 1** contém datas de REFERÊNCIA defasadas (−10 dias) e nunca é usada como calendário; a defasagem detectada é só exibida.
- Rótulos lidos em conjunto de A/B/C. Linhas esperadas: 5 saldo inicial, 6 recebimento previsto/real, 7 recebimento estimado, 8 saídas total (SAÍDA|TOTAL), 9 custo de produto, 10 planejadas, 11 comprometidas, 12 despesas total, 32 saldo final (RESULTADO|SALDO FINAL). Se a linha esperada não confere, busca única; várias candidatas = ambíguo.
- Recebimento usado do Excel = linha 6 + linha 7.
- **Bloqueio**: sem cabeçalho da linha 3, sem datas, ou faltando saldo inicial/recebimentos/saídas/saldo final → `ok=false`, "CONCILIAÇÃO BLOQUEADA" com ausências listadas. Cache nunca é presumido atual.
- Aritmética interna do cache (inicial − saídas + 6 + 7 − final) exibida; o cache tem precisão maior que centavos (ex.: 1.988.081,42906), comparação em centavos → diferenças < R$ 0,01 são arredondamento.
- Pontos de referência extraídos localmente do XLSM real (cache, não recalculado) usados como fixture: 01/10/2026 (XR), 02/10/2026 (XS), 28/10/2026 (YS).

### Cabeçalhos e adaptadores por aba (layout CEO verificado, cabeçalho na linha 3, editável)
- COMPRAS DIRETAS_PLANEJADAS: A código, B fornecedor, C data faturamento, D alterar (ignorado), **E valor orçado**, F:O prazos (0 ≠ vazio, gravados na própria previsão), P/Q/R calculados **não importados**.
- COMPRAS DIRETAS_EFETUADAS: A código, B fornecedor, C identificador do título (texto, ex. 33181A1), D data faturamento, E alterar, F valor, G vencimento, M base de abatimento manual.
- DESPESAS E OUTRAS: A tipo (categoria), B descrição, C data, F valor, G prazo, L grupo.
- RECEBIMENTOS (real, formato longo): A código (REAL/Previsão), B MARKET PLACE (nome), C data, D mês, E dia semana, F valor líquido; calendário G+ ignorado. Plataforma resolvida pelo nome do arquivo (normalizado); nome novo vira plataforma com o MESMO nome do arquivo e vigência = primeira data (revisar/conciliar grafias).
- PREVISÃO DE VENDAS (real): meses nas colunas (linha 1 mm/aaaa, linha 2 líquido = SUM(linhas 7:1006)·(1−B2), linha 3 "TOTAL" = SUM(linhas 7:20) — parcial, só informativa, linha 6 datas, linhas 7+ componentes) → transposto. **Meta bruta = soma de todas as linhas 7+** (inclui linhas sem rótulo), conferida contra o líquido cacheado; B2 (redutor) e C2 (defasagem) do arquivo gravados no mês importado. Sem componentes = meta ausente.
- TABELA_DESPESAS: só A (tipo) e B (grupo); D+ ignorado; mesmo tipo com grupos diferentes = conflito.
- Fora do layout verificado: detecção de cabeçalho por padrões de campos da aba (não "primeira linha com 3 textos").
- TABELA_FORNECEDORES (real): A nome, B:I 8 prazos ("1o PAG."…"8o PAG.").
- Fornecedores/categorias resolvidos por nome normalizado (acentos/caixa/espaços); nome duplicado = conflito, linha pulada; fornecedor existente nunca sobrescrito por reimportação.
- Planejada com prazos próprios usa-os no lugar dos prazos do fornecedor.

### Compartilhamento
- Organização escolhida explicitamente (própria × convidada); sem escolha resolve apenas se única ou a própria — nunca arbitrária.
- Página Equipe (só owner): convite individual (e-mail, papel editor/viewer, validade 1–30 dias). Token aleatório de 32 bytes exibido uma vez; servidor guarda só SHA-256. Nenhum e-mail enviado.
- Aceite: usuário autenticado, e-mail igual ao convidado, checkbox de confirmação explícita; recusa outro e-mail, expirado, revogado e reutilizado.
- Revogação de convite e de acesso; último owner não removível; auditoria de acesso (criado/revogado/aceito/acesso revogado).
- Teste controlado em `tests/sql/team_authz.sql` (usuários fictícios, transação desfeita): viewer não grava, editor grava, não membro não grava nem lê, convites inválidos recusados, último owner protegido.

### Critérios de aceite — estado real
- Atendido com testes automatizados: reconhecimento/aritmética com fixtures fiéis; cabeçalhos reais; transposição de metas; regras de convite/papéis (TS + SQL controlado).
- **Pendente**: gravação do arquivo real em uma organização (exige login de Eduardo e escolha da organização — ver "Validação do XLSM real"); login e gravação ponta a ponta com conta real confirmada; aceite de convite ponta a ponta com dois usuários reais (não criado convite para pessoas reais).

## Validação do XLSM real `Fluxo_CEO_Sandrini.xlsm` (05/11/2026)
Arquivo anexado ao chat (31,8 MB). Analisado só no ambiente de desenvolvimento; **não** copiado para public/, assets ou bundle; nenhum dado gravado em organização. Leitura somente de valores cacheados (e fórmulas das linhas 1–4 para diagnóstico); `vbaProject.bin` e `calcChain.xml` nunca lidos.

### Leitura / desempenho
- Leitura completa (SheetJS): ~25 s e ~2,8 GB de memória — inviável no navegador. Substituída por leitor seletivo (`src/lib/xlsxFast.ts`): uma aba por vez, só colunas-fonte (planejadas A:S, efetuadas A:M, despesas A:M, recebimentos A:F, fornecedores A:K, TABELA_DESPESAS A:C; FLUXO e PREVISÃO completas por terem poucas linhas). Resultado: ~5 s, ~0,9 GB no processo de teste, ~175 mil células lidas em vez de milhões.
- Dependência `xlsx` estava ausente do projeto (typecheck falhava) — instalada; usada só nos testes.

### Quantidades (importação em memória, mesma rotina da tela)
| Entidade | Linhas | Novas | Inválidas (motivo) |
|---|---|---|---|
| Fornecedores | 86 | 86 | 0 |
| Categorias (TABELA_DESPESAS) | 97 (19 grupos) | 97 | 0 |
| Metas (meses) | 75 (10/2024–12/2030) | 75 | 0; B2=0,25, C2=10 |
| Previsões | 650 | 645 | 5 (código vazio) |
| Efetivadas | 5.337 | 5.333 | 4 (3 datas de faturamento inválidas, 1 documento vazio) |
| Despesas | 6.912 | 6.911 | 1 (data vazia) |
| Recebimentos | 1.182 | 1.182 | 0 |
- Linhas repetidas legítimas (o Excel soma todas): agora importadas como ocorrências `#2`, `#3`… da mesma chave (antes eram descartadas como conflito — causava diferença de R$ 3.561,73 em 01/10 e R$ 15.248,90 em 02/10).
- Fornecedores das efetuadas vêm como "código - nome" e não batem com TABELA_FORNECEDORES: 474 fornecedores criados como "(importado — revisar)" — **pede conciliação manual**.
- Recebimentos: 33 nomes de plataforma distintos, com grafias variantes (ex.: Daifiti/Dafiti, Shoppe/Shopee, Licitação/Licitações) e linhas que não são plataforma (FINAL DE SEMANA, FERIADO, RECEBIMENTO, Rendimento Aplicações, Empréstimo) — **pedem conciliação/renomeação**; 192 linhas com valor 1 (marcador?) e 27 sem código — confirmar.

### Colunas que pedem confirmação
- Efetuadas **M vazia em todas as linhas** (0 numéricas) → no Excel Q=0, previsões nunca são abatidas; código A preenchido em 2.666 linhas. Vínculos por código não são inferidos; aviso PLAN_M_AUSENTE onde há código coincidente.
- Efetuadas H:L (2º–6º pagamento) preenchidas em 1.275 linhas — a macro ativa distribui só G (F no vencimento G); não distribuído, pendência.
- Planejadas: 596 de 650 com valor E = 0. Fórmulas F:O: `VLOOKUP(...;$A:$G;2..7)` com K:O todas na coluna 7 e faixa só até G — prazos 6º–10º repetem o 6º e 7º/8º do fornecedor nunca são lidos. Diagnóstico da fonte, não reproduzido como regra; valores cacheados F:O importados como estão.
- FLUXO C1 = TODAY() cacheado em 05/10/2026: o cache é dessa data; não prova resultado atualizado.
- Aba "Alinhamentos": não reconhecida, ignorada.
- Pagamentos: o arquivo não informa baixas. Efetivadas e despesas importadas ficam **"Situação a confirmar"** (`paymentUnconfirmed`): continuam no fluxo pelo vencimento (como o Excel), mas não entram no aberto validado, vencidos nem ranking; card próprio no Dashboard. Vencimento passado nunca implica pago.

### Conciliação com o cache (perfil Excel legado, saldo inicial de 01/10/2026 do cache, outubro/2026)
- Calendário real linha 3 (2.191 datas), linha 1 = referência −10 dias; 9 linhas reconhecidas; resultado `ok`.
- 01/10 e 02/10: **todas** as métricas iguais ao cache em centavos (saldo inicial, informado, estimado, saídas, custo, planejadas, comprometidas, despesas, saldo final).
- 28/10: movimentos iguais; saldo inicial/final −R$ 0,06. Em todo o mês, movimentos idênticos e diferença máxima de saldo R$ 0,08 (31/10): a estimativa diária é arredondada a centavos por dia (política aprovada), o Excel acumula precisão total (ex.: 300.228,04443).
- Mudanças aprovadas e efeito observado: zero confirmado (sem efeito em outubro — dias com informado zero usaram estimativa como no Excel, pois não havia zero confirmado no arquivo); soma de parcelas na mesma data (4 avisos de colisão em previsões, sem valor em outubro); resíduo na última parcela/centavos (14 avisos de arredondamento).

### Como importar oficialmente (exige login de Eduardo)
1. Entrar, escolher a organização correta no seletor e o modo Real.
2. Regras e Conciliação → Importação → selecionar o mesmo arquivo `.xlsm`.
3. Por aba, nesta ordem: TABELA_DESPESAS (categorias), TABELA_FORNECEDORES, PREVISÃO DE VENDAS, COMPRAS DIRETAS_PLANEJADAS, COMPRAS DIRETAS_EFETUADAS, DESPESAS E OUTRAS, RECEBIMENTOS → "Mapear" → "Pré-visualizar" → "Adicionar ao rascunho".
4. Revisar o antes/depois na barra superior e confirmar (ou cancelar sem alterar nada).
5. FLUXO DE CAIXA → "Conciliar com motor" com o período 01/10/2026–31/10/2026.
Script de reprodução local: `bun scripts/validate-ceo-xlsm.ts <arquivo> /tmp/relatorio.json` (relatório contém agregados reais — manter fora do projeto). Teste `src/lib/ceoReal.test.ts` roda a conciliação quando o arquivo está disponível localmente.

## Categorias, subgrupos e apresentação das saídas (atualização 2026-11-10)

- **Categoria** é só a natureza do lançamento: **Compra** ou **Despesa**. Planejada/efetuada são ETAPAS do lançamento, não categorias. Cada registro de `categories` é um **subgrupo** (ex.: "Energia elétrica"); lançamentos vinculam ao subgrupo (`categoryId`).
- Migração: kinds antigos por etapa (`planejada`/`comprometida`) viram `compra` em `normalizeData`; IDs e vínculos preservados. Subgrupos com o MESMO nome somam juntos no fluxo (mescla por nome, não por ID).
- **Lançamentos** tem duas abas (Planejada, Efetivado) + Pagamentos (controle separado de baixas). Efetivado reúne compras/pedidos efetivados e despesas efetuadas na mesma lista, com filtro por categoria. A efetivação HERDA o subgrupo da previsão.
- **Fluxo**: saídas ficam sob Compras e Despesas. Filtro de apresentação (só muda a exibição, totais idênticos): **Consolidada por subgrupo** (Categoria → Subgrupo; planejado restante + efetuado juntos) ou **Separada por etapa** (Categoria → Planejada/Efetuada → Subgrupo). Planejado restante + efetuado sem duplicar previsão efetivada (inclusive parcial).
- Item sem subgrupo: despesa importada classifica como Despesa; previsão/efetivado sem subgrupo como Compra; rótulo "(sem subgrupo)".
- **Relatório de despesas** (/despesas): mesmos lançamentos do fluxo (sem cadastro separado), filtros por período, subgrupo e etapa.
- Testes: `src/lib/engine/subgrupos.test.ts` (migração de kinds, igualdade de totais entre modos, mescla por nome, despesa planejada + efetivação sem duplicar, fallback sem subgrupo).

## Nova nota por parcela (painel lateral)
- Botão Novo (Planejada/Efetivado) abre painel: Dados da nota → Condição de pagamento → Parcelas → Revisar e confirmar. Cancelar não grava; confirmação só com total das parcelas = valor da nota e campos obrigatórios.
- Parcelas geradas pela condição vigente do fornecedor (prazos numéricos; 0 conta), resíduo de centavos na última; editáveis, adicionar/remover, "Prorrogar para" vazio por padrão.
- Condição manual pode ser salva como nova condição do fornecedor: histórico em `termsHistory`; previsões antigas que usavam a condição anterior recebem os prazos antigos congelados.
- Planejada grava 1 previsão com `installments` próprias; efetivações abatem das primeiras parcelas (FIFO) sem duplicar. Efetivado grava 1 título por parcela com `noteId/parcelNo/parcelCount`.
- Tabelas: uma linha por parcela. "Editar esta parcela" muda só a parcela; "Editar dados da nota" aplica às irmãs (mesmo noteId). Prorrogação individual exige justificativa e preserva histórico; em simulação é só teste.
- Consultas agrupa por parcela ou por documento.

## Controle bancário (contas, cartões, baixas multicontas, transferências)
- Contas: banco, identificação, titular, agência/conta, ativa/inativa; UM saldo inicial por conta = saldo ao FIM do dia de referência. Só movimentos com data > referência entram (sem recontar). Correção do saldo exige justificativa e fica no histórico da conta e na auditoria.
- Cartões vinculados à conta (nome, final, fechamento, vencimento). Compra no cartão (`Expense.cardId`, registrada em Bancos → Cartões com Categoria/Subgrupo) não debita banco; antes do fechamento entra no fluxo projetado como "Projeção de fatura" no vencimento previsto; "Fechar fatura" cria UMA despesa (`invoiceOf`) com o total e vincula as compras; saída bancária só na baixa da fatura. Fatura duplicada por cartão/mês é bloqueada. Compromissos existentes não são reclassificados.
- Plataforma: conta padrão por início de vigência (vale até a próxima). Ao lançar valor, a conta vigente na data é GRAVADA no recebimento; mudar o padrão não reatribui o passado nem gera transferência. "Alterar somente neste recebimento" grava override. Geral sem plataforma: conta escolhida no recebimento.
- Recebimento informado ≠ realizado: só entra no saldo realizado da conta com `realized` marcado ("Realizado"). Estimativa só no fluxo projetado.
- Pagamento multicontas: várias linhas (conta, valor, data) confirmadas juntas (`batchId`), todas ou nenhuma; soma ≤ saldo pendente; juros/multa/desconto NÃO suportados (excedente bloqueado com explicação); linhas idênticas bloqueadas; reenvio idempotente; concorrência protegida pela versão do documento no servidor. Baixas antigas sem conta = "Conta não informada" (nunca inferida).
- Simulação: permite transferência de teste e troca de conta do recebimento, só no cenário (rótulo SIMULAÇÃO); registro de pagamento continua bloqueado.
- Autorização: `scripts/sql/test-bank-authz.sql` (rollback total) e E2E isolado `scripts/e2e/bancos-isolado.py` (servidor interceptado, org fictícia).
- Transferência: um registro com as duas pernas (atômico), origem≠destino, valor > 0; neutra no consolidado; estorno com motivo. Tarifas = despesa separada.
- Saldo inicial do fluxo: regra legado (Referências) até "Confirmar transição" em Bancos → Saldo inicial do fluxo; depois usa a soma dos saldos realizados das contas na véspera do início. Nunca soma os dois. Transição bloqueada se alguma conta ativa não tem saldo inicial ou tem referência posterior.
- Pendências: juros/multa/desconto; conciliação com extrato bancário importado (OFX) não implementada; contas/saldos reais ainda não cadastrados.
- Cartão — duas operações (Bancos → Cartões e faturas): "Pagar lançamento existente" (título efetivado em aberto, compra ou despesa) e "Adicionar nova compra". Ambas geram parcelas do cartão (1–24, resíduo na última, uma por fatura) com o subgrupo original e vínculo `cardOpId`.
  - Cobertura grava baixa `method: "cartao"` (liquidação do fornecedor, "Quitado com cartão"): reduz a pendência, não debita banco, não entra no extrato; a parte não coberta segue no vencimento original. Não pode exceder a pendência; idempotente por id; revisão antes de gravar. Previsões precisam ser efetivadas antes.
  - Rastreio: título → operação no cartão → parcelas → fatura → baixas bancárias da fatura (uma ou mais contas). Parcela de cartão não recebe baixa direta.
  - Estorno da operação cancela parcelas e estorna a liquidação, mantendo histórico; bloqueado se alguma parcela está em fatura fechada. "Reabrir fatura" só sem pagamento ativo.

- Novo lançamento: primeiro passo escolhe Planejada ou Efetivado (não pela aba). Planejada aceita código/documento vazios; Efetivado exige documento e pode vincular previsão ativa: substitui parte via efetivação, restante continua planejado ou é encerrado. Validações só ao avançar.

- Registrar pagamento: forma (Pix/TED/DOC/Boleto) e origem. Conta bancária: uma ou mais contas, cada uma debitada só pela sua parte. Cartão (só Boleto): cartão, valor, data, tarifas e parcelamento; quita o boleto total/parcial, valor+tarifas viram parcelas da fatura, sem débito bancário até pagar a fatura. Revisão, baixas e histórico mostram forma, origem e vínculo boleto→operação→fatura.

- Relatório de Pagamentos do Dia (Lançamentos → Consultas): só baixas reais da data (nunca simulação/previsão), uma linha por baixa, subtotais por conta/cartão, cartão separado das saídas bancárias, estornos fora do total e consultáveis; observação editável com confirmação e histórico; impressão A4 com cabeçalho repetido, total e assinaturas.

- Fornecedor único com várias condições de pagamento (nome, prazos, início da vigência, cadastrada em, responsável); novas condições não apagam as anteriores; prazos vigentes do motor = última condição vigente. Planejada: sugere a vigente, permite outra ou específica; parcelas só após confirmar. Efetivação: mesmo fornecedor, mostra condição da previsão, condição real grava só nos títulos daquela efetivação. Condição específica não altera o fornecedor; "Salvar como nova condição" é separado e confirmado.
