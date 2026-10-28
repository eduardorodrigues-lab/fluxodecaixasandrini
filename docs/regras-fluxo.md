# Fluxo de Caixa Sandrini — Regras, schema e critérios de aceite (NÃO homologado)

Nenhum arquivo real foi importado. Regras do legado extraídas por análise estática; Excel não recalculado; VBA nunca executado. Itens marcados **[aprovado]** são mudanças autorizadas por Eduardo — evolução, não equivalência literal com o Excel.

## Arquitetura
- Motor único `src/lib/engine/engine.ts` (`computeFlow` → `buildRows` → `toVertical`); vertical e CEO horizontal usam o mesmo `Row[]`, cenário, período e filtros.
- Ações de domínio puras em `src/lib/engine/actions.ts` (efetivar, reverter, pagar, estornar, prorrogar, normalizar); dashboard em `engine/dashboard.ts`; diff antes/depois em `src/lib/diff.ts`.
- Parcelas datadas agregadas por data; nunca matriz lançamento × dia.

## Espaços de dados e persistência
- **Base oficial (Lovable Cloud)**: login obrigatório. Tabelas `organizations`, `org_members`, `official_data` (documento JSON + `version`), `audit_log`. RLS: só membros leem a própria organização; nenhum acesso anônimo; nenhum usuário tem INSERT/UPDATE direto. Cada conta nova recebe organização própria (trigger); não existe autoinscrição em organização existente.
- Gravação somente via server function `commitOfficial` (verifica papel owner/editor, versão esperada, calcula diff no servidor) → RPC `commit_official` executável apenas pelo service role: controle otimista de versão (conflito → nada sobrescrito), idempotência por `request_id`, auditoria com antes/depois, usuário, e-mail, timestamp e snapshot anterior.
- **Demonstrativo**: dados fictícios só no navegador (localStorage), mesma mecânica de rascunho/auditoria local, nunca enviados à base oficial.
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
- RECEBIMENTOS: só A:F; calendário G+ ignorado.
- PREVISÃO DE VENDAS: meses nas colunas (linha 1 mm/aaaa, linha 2 líquido, linha 3 faturamento cacheado, linha 6 datas, linhas 7+ componentes) → transposto; meta bruta candidata = linha 3 (exige confirmação); faturamento vazio = meta ausente; redução implícita (1 − L2/L3) exibida.
- TABELA_DESPESAS: só A (tipo) e B (grupo); D+ ignorado; mesmo tipo com grupos diferentes = conflito.
- Fora do layout verificado: detecção de cabeçalho por padrões de campos da aba (não "primeira linha com 3 textos").
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
- **Pendente**: importação do arquivo real (upload ao projeto falhou com HTTP 403 no armazenamento; o arquivo não chegou ao projeto); login e gravação ponta a ponta com conta real confirmada; aceite de convite ponta a ponta com dois usuários reais (não criado convite para pessoas reais).
