# Fluxo de Caixa Sandrini — Regras, schema e critérios de aceite (NÃO homologado)

## Identificação derivada de notas parceladas importadas — 24/11/2026
- `documentGroups` reconhece séries numéricas A1/A2/A3 por origem, fornecedor exato, documento, pedido opcional e emissão; suporta datas seriais Excel e linhas não adjacentes. NoteId existente prevalece. Zeros à esquerda e séries/emissões diferentes não são fundidos.
- Lacunas, duplicatas, datas/documentos sem prova ou sufixos arbitrários permanecem individuais; não deduz total do maior sufixo isolado. Denominador da série completa é a quantidade observada; a ausência de uma parcela terminal não indicada na fonte é limite explícito.
- Nota 2409 de FOUR ALL: três linhas individuais, 1/3, 2/3, 3/3, preservando documentos 2409A1/A2/A3 e raw. Sem gravação, migração, mudança de valores/datas/baixas/etapas ou cálculo. Evidências e limites: `docs/notas-parceladas-importadas-2026-11-24.md`.

## Revisão global e recuperação de confirmação — 18/11/2026 14:55 UTC
- Salvar global captura revisão antes/depois das alterações de outros módulos, sem Recebimentos, sem cálculo diário e sem envio ao abrir/voltar. Confirmar usa o mesmo caminho isolado/versionado. Campos intactos não aparecem; vazio e zero são distintos.
- Pacote protegido antes do envio na chave existente: requestId, operações, captura das pendências, dependências e identificação humana da revisão. Ver alterações é somente leitura dessa captura, inclusive após recarga. Edições posteriores não modificam o pacote; a confirmação preserva essas edições e as pendências independentes.
- Escritas não têm repetição automática. Espera do envio limitada a 20s; recuperação consulta a auditoria até três vezes (pausas 0/1/3s, cada leitura limitada a 5s). Ausência de auditoria NÃO comprova erro do banco e NÃO permite liberar/revisar/descartar pacote desconhecido. Conferir confirmação repete apenas leituras com o requestId original.
- Confirmação é protegida antes de atualizar o cache. Se atualização/releitura falhar, o estado informa confirmação com atualização pendente; nova conferência não escreve. Patch canônico exige contexto/digest/versão exata; exceções usam releitura limitada, sem restaurar snapshot antigo. Auditoria/snapshot/SQL/schema intactos.
- Conflito/recusa explícita permite liberar para nova revisão; resultado desconhecido permanece protegido. A interface deixa de chamar ambos indistintamente de Salvando. Não há diagnóstico conclusivo de causa hospedada sem operação real.

## Salvamento de Recebimentos — 18/11/2026
- Grade, novo recebimento, contas/observações/exclusão e Geral da visão vertical acumulam alterações no rascunho existente (IndexedDB por usuário/organização); nada é salvo no banco a cada digitação. Simulações permanecem locais e viewer não grava.
- A página Recebimentos oferece revisão por data e plataforma/Geral, antes/depois, incluindo zero distinto de ausência. Voltar conserva valores; uma única confirmação envia somente os IDs revisados por `saveOperation`/`commitOps`. Não executa simulação diária na revisão e não altera estimativas, fórmulas, alertas, filtros ou snapshots.
- Barra global mantida: Salvar dos outros módulos exclui Recebimentos sem eliminá-los. Guardas só permitem recuperar exatamente a pendência de Recebimento capturada; fornecedores/contas/plataformas pendentes independentes não são incluídos. Edições posteriores ao envio são rebaseadas e preservadas.
- Pendências antigas continuam na mesma chave. RequestIds recuperados são conferidos na auditoria via leitura autenticada antes de novo envio; confirmação existente reconcilia a versão sem gravar novamente. Pacote isolado em confirmação conserva requestId e recuperação; resultado desconhecido não autoriza novo pacote. Lock do navegador e conferência de operação persistida protegem envios entre abas; versões/antes e dependências seguem validados no servidor. Não há mudança de schema, SQL, auditoria ou `snapshot_before`.
- Sucesso somente após confirmação e cache canônico na versão exata; exceções/duplicata exigem releitura segura. Falhas conservam valores; conflito permite liberar operação rejeitada, comparar banco/rascunho e revisar de novo, sem sobrescrita automática.
- Evidências e limitações: `docs/recebimentos-salvamento-2026-11-18.md`. Somente código/testes fictícios; nenhuma escrita financeira real ou publicação.

## Salvamento pontual — 18/11/2026
- Revisão de planejamento, efetivado e efetivação não executa simulação/impacto diário; mostra alterações da operação, abrangência compartilhada e totais pertinentes. O motor oficial do Fluxo permanece intacto.
- Sucesso continua condicionado ao banco. O servidor reutiliza a base normalizada nas conferências e responde com transição canônica completa (inclusive efeitos da normalização), versão de origem/destino, contexto e digest. O SQL existente grava exatamente o documento enviado e preserva `snapshot_before` e auditoria integral.
- Cache só recebe essa transição na versão exata e no mesmo contexto. Patch incompleto/corrompido, conflito, versões distintas, duplicata de retry ou resposta antiga exigem reconciliação/releitura; versão local nunca retrocede. Nenhuma atualização otimista ou remoção global de pendências.
- Preparação utiliza compartilhamento estrutural em vez de copiar o documento inteiro; cópias de condições/histórico afetados permanecem independentes. Persistência local existente não foi limpa; sucesso confirmado limpa somente a operação correspondente.

## Organização única e salvamento de fornecedores — 18/11/2026
- Organização oficial validada por leitura: `e197262e-1453-49b0-aad9-878e80602ee4`, 80 fornecedores, v173; Eduardo owner e Letícia editor. A outra organização tem ID distinto, zero fornecedores e v41, Letícia owner. Nomes iguais não significam base compartilhada. MADEIRA MADEIRA não encontrado nas coleções de fornecedores na leitura inicial desta rodada; o ID do erro/rascunho real não foi fornecido nem acessado, portanto não houve comparação com esse ID.
- Login resolve exclusivamente a membership oficial, sem seletores ou fallback pessoal. Servidor valida o contexto e o papel; viewer não grava, editor não herda owner pessoal. Convites somente para a organização oficial; criação automática de organizações foi desativada por alteração da função, sem modificar organizações, registros ou memberships existentes.
- Cadastros de fornecedores e condições agora usam operação isolada revisada, confirmação de commit e releitura. Guardam preenchimento local; falhas não anunciam sucesso. Histórico/vigência e congelamento de condições anteriores continuam nas funções existentes.
- Fornecedor inline fica no formulário, protegido com o preenchimento, e entra somente junto ao lançamento revisado que utiliza seu ID. Cancelar não cria fornecedor oficial. Parcelas/datas/boletos não são regenerados ao salvar. Planejamento editável também oferece cadastro inline e salvamento explícito de condição.
- Fornecedor/condições já pendentes podem ser incluídos por ID na operação mediante confirmação específica; outras pendências permanecem fora. Guardas financeiras não foram removidas. Antes/depois e dependências continuam validados no servidor; retry mantém requestId. A remoção da pendência reconhecida ocorre somente depois da confirmação/releitura; edições feitas durante o envio permanecem.
- Rascunhos de outra organização ficam isolados e não podem ser enviados à oficial. Sem migração/transplante, exclusão de organizações, alteração de memberships ou escrita de lançamentos reais nesta rodada. Não se promete recuperar memória anterior perdida nem o estado da aba real da Letícia, que não foi acessado.
- Navegador isolado: cadastro fornecedor + condição, releitura, lançamento efetivado de 3.158,40 com datas manuais 09/12/2026 e 11/01/2027 prorrogada a 15/01/2027; inline planejado protegido após reload e salvo após falha/retry. Memberships owner/editor/viewer/sem acesso com duas organizações de mesmo nome verificadas, sem carregamento oficial no caso sem acesso. Capturas em 1366 e 1920, nenhuma falha de execução. Todas funções do servidor interceptadas; sem escrita oficial.
- Limites: caso bloqueado recuperado por funções puras (ID, condições, datas, pendências separadas, conflito); não exercitado no navegador com o rascunho real. Convite/login/logout completos, duas abas concorrentes, todos os caminhos inline e recuperação de operação já enviada após reload não exercitados nesta rodada. Auditoria e concorrência hospedadas não testadas por gravação real.

## Planejamento e proteção do preenchimento — 17/11/2026 (rodada atual)
- Preenchimento de novo planejamento e edição protegido localmente por usuário, organização, modo, formulário e pedido/ID próprio. Inclui notas, parcelas, seleção, datas e base original de conferência. Recuperação invalida confirmações; revalidação compara registros atuais e impede sobrescrever concorrência. Não grava na organização. Armazenamento indisponível ou alteração local em outra aba gera aviso e não substitui o rascunho alheio.
- Proteção nova não recupera memória perdida antes de sua instalação. Operações enviadas continuam usando IndexedDB e retry idempotente existentes. Cancelar descarta somente por decisão explícita; falha mantém preenchimento.
- Novo planejamento aceita notas opcionais já no cadastro, por painéis laterais e lista, salvas planejadas. Documento simples pode ser convertido explicitamente em uma nota sem duplicar parcelas. Diferença sem cobertura por valores e vencimentos impede revisão; nunca se inventam datas para saldo sem nota.
- Revisão simples salva o valor previsto junto das parcelas pelo caminho isolado. Valor previsto atual e referência histórica são distintos: novas primeiras efetivações em lote guardam `referenceEvidence` (valor, fonte, data, usuário, pedido, antes/depois) no mesmo evento transacional. Relatório prefere essa evidência; registros antigos revisados sem prova continuam não comparáveis, sem backfill.
- Consultas inclui parcelas planejadas com documento/NF próprio, pesquisa, exportação e abertura do mesmo formulário. Planejado não é obrigação a pagar e não soma pagamentos.
- Evidência desta rodada: 89 testes pertinentes passaram. Navegador com todas funções interceptadas: simples criar/salvar/reabrir/editar e recuperar após reload; cinco notas planejadas; quatro notas + saldo datado; sete notas de 6.804 + quatro linhas originais zero, somente primeira efetivada, depois segunda e uma parcela da terceira; falha/retry com mesmo requestId; duas abas recuperam preenchimentos próprios. Datas da sétima nota verificadas em 1366/1920. Nenhum erro de execução capturado, nenhuma gravação real ou publicação.
- Limites: não houve verificação hospedada de concorrência/auditoria; retry após reload entre envio e resposta e todos os acessos legados não exercitados nesta rodada. Regeneração de condição de nota já salva fica bloqueada para preservar IDs: edição individual permanece disponível. Proteção local não recupera memória anterior perdida nem garante conservação se o navegador apagar seu armazenamento.

## Várias notas por pedido — 17/11/2026
- Pedido único → notas independentes → títulos por parcela. Lote ou inclusões posteriores usam o formulário vertical existente e commitOps isolado, com IDs fixos na revisão/retry. Um evento por operação guarda notas, seleção substituída uma única vez e restante antes/depois; reversão do evento continua sendo do lote inteiro, protegida por baixas/efetivações posteriores.
- Cada nota confirma documento, total, efetivação, base dos prazos, condição copiada (somente sugestão explicitamente gerada), valores/vencimentos e boleto opcional. Nova geração não copia boletos para repartições. Prorrogação preserva vencimento original e justificativa. Condição futura não recalcula títulos.
- Uma/algumas/todas previsões podem ser substituídas por quantidade livre de notas/parcelas reais. Restante manual é conferido uma vez por operação; vazio não é zero; zero confirmado encerra. Pedido encerrado aceita novas notas após revisão explícita de ampliação, sem restante negativo fictício. Documento potencialmente repetido no mesmo fornecedor exige conferência, não união/bloqueio definitivo.
- Referência e definição de comparação existentes preservadas: acumulado anterior + novas notas + restante confirmado. Não há fotografia/backfill. Campos opcionais novos: Committed.effectiveDate/baseDate e Effectivation.manual.notes; registros anteriores não são preenchidos. Auditoria transacional existente guarda inclusões e antes/depois do pedido; marcador com autor/horário/justificativa não invalida artificialmente a referência.
- Evidência: 112 testes focados (14 novos), navegador isolado 1366/1536: uma nota salva/reload, outras duas juntas no mesmo pedido já encerrado, revisão/save/reload, busca por boleto e CSV. Resultado 1 pedido/3 notas/12 títulos/0 baixas; zero chamadas oficiais. 7×4 e seleção/restante/concorrência/retry cobertos por funções puras. Sem escrita real, migração ou publicação; persistência/auditoria hospedadas e concorrência multiusuário real não verificadas. Aviso de hidratação esperado pela substituição do contexto somente no cliente da fixture.

## Gerenciar lançamento — 16/11/2026
- Planejamento em formulário vertical Dados gerais / Condição / Parcelas / Resumo, com histórico recolhível; efetivação com blocos Efetivado e restante Planejada na mesma tela vertical; linhas permanecem individuais. Agrupamento importado é somente consulta: série numérica A1…An exige células de identificação/fornecedor/pedido/data e linhas consecutivas na origem comprovada. IDs, identificações originais pesquisáveis e baixas não são regravados. Séries ambíguas ficam individuais e listadas para revisão.
- Valores/datas/prorrogação alteram somente parcelas escolhidas; campos compartilhados afetam o documento inteiro, não todas as notas de um pedido. Redistribuição de valores exige seleção, total explícito e revisão; resíduo na última selecionada. Notas com noteId explícito permitem novas parcelas numeradas após a maior existente, sem modificar numeração/contagem históricas das pagas; notas sem vínculo explícito bloqueiam aumento para não inferir agrupamento. Quantidade planejada pode aumentar com IDs novos ou diminuir por cancelamento explícito, preservando IDs e origem existentes; remover linha nova descarta só o rascunho. Condições não alteram datas retroativamente sem ação explícita.
- Efetivar seleciona esta/algumas/todas, não paga; saldo restante previsto é informado manualmente e deve conferir com suas parcelas/datas. Vazio não é zero; encerramento exige informar e confirmar R$ 0. Referência matemática nunca se aplica automaticamente. Sugestões reutilizam applySuggestion: manter valores de origem; igualar cada restante ao total efetivado somente com uma origem selecionada; diferença = restante original − (substituído − efetivado); total original − efetivado. Aplicar sugestão preserva datas e não confirma saldo. Documento potencialmente repetido exige conferência explícita. Selecionar uma previsão ao criar efetivado abre o gerenciamento seguro, sem o antigo restante automático.
- Cancelamento conserva valor original e status/histórico; efeito futuro zero. Planejada usa itens de restante com zero e valor anterior no registro de edição existente, sem alterar schema; consulta mantém o valor original visível. Parcela com baixa ativa não pode ser editada/cancelada diretamente. Estornos seguem mecanismo próprio existente, sem transferência bancária ou exclusão da baixa.
- Revisão mostra somente afetadas, antes/depois e escopo compartilhado, sem cálculo diário. Justificativa obrigatória para valores/datas/cancelamento/efetivação. **Confirmar e salvar** grava somente a operação revisada por commitOps, sem segundo Salvar externo. Cancelar antes de confirmar não aplica, simulações e permissões continuam isoladas.

## Salvamento isolado de Lançamentos — 16/11/2026
- Criação, gerenciamento planejado/efetivado, efetivação, cancelamento e prorrogação compartilham confirmação explícita. Pagamentos do gerenciamento e estornos de Lançamentos usam o mesmo envio isolado. Não há autosave; outros módulos continuam com rascunho/Salvar externo.
- Payload antes/depois, IDs e requestId permanecem fixos no retry. Antes de enviar, operação é protegida em IndexedDB por usuário/organização; erro, timeout ou conflito deixam recuperação disponível. Sucesso exige resposta ok/duplicate/noop e releitura com versão pelo menos igual à confirmada. Auditoria continua no RPC transacional existente, uma vez por requestId.
- Pendências anteriores no mesmo registro ou dependência bloqueiam envio com identificação concreta; usuário revisa/salva ou descarta explicitamente essas pendências antes de nova revisão. Não são incluídas automaticamente. Independentes continuam recuperáveis e marcadas após sucesso. Alterações durante espera são rebaseadas sobre o que foi salvo, não apagadas por reset global.
- Dependências de leitura (fornecedor, previsão, títulos vinculados, efetivações e baixas) são conferidas no servidor antes do patch; nova baixa concorrente impede cancelamento baseado em título desatualizado. Concorrência entre leitura e RPC repete o mesmo ID, reaplicando conferências; não há trava global entre usuários. Sem schema/migração/backfill.
- Evidências desta rodada: testes de função e navegador com servidor fictício, nenhuma escrita de teste real. Sucesso com releitura/reload, clique duplo, falha antes de gravação, perda da resposta após gravação e retry, cancelamento, concorrência distinta/mesmo campo, recuperação após recarga, pendência independente, simulação e viewer. Auditoria hospedada/volume integral e todas as combinações de ações no navegador não homologados.

## Consolidação autorizada de recebimentos — 16/11/2026
- Migração explícita, sem reimportação: aliases confirmados consolidam IDs de plataforma; MELI SP/MG e AMAZON SP/MG permanecem separados, Menswear/Sports seguem o mapeamento autorizado. GERAL não é plataforma. TIKTOK é cadastro sem valores históricos.
- A ordem operacional persistida é a ordem do array de plataformas; GERAL vem após plataformas e antes das colunas calculadas. Cadastros inesperados permanecem, sem exclusão por contagem alvo.
- Valores mantêm precisão importada, zero/null/ausente e natureza realizado/previsto; IDs de recebimentos e todos os campos de origem ficam preservados. `consolidatedSources` guarda cadastros originais, incluindo vigências; `platformMigration.sources` registra componentes/IDs/contas/resíduos originais. Auditoria usa autoria/data reais do servidor.
- Contas diferentes em uma categoria da mesma linha ou vigências bancárias incompatíveis bloqueiam a migração antes de gravar; não há escolha arbitrária nem compensação financeira. A validação real compara somas por dia/natureza, motor completo e coleções não autorizadas antes e após gravação versionada.

## Dashboard e relatório mensal aprovados — 11/11/2026
- Dashboard mantém os 15 KPIs e seus escopos originais. Quatro gráficos iniciais: saldo diário, fornecedores em aberto, vencimentos no período e despesas por subgrupo. Expansão abaixo dos KPIs, relatório fonte paginado e card sequencial Dados/Observações/Legenda. Seleção gráfica filtra registros/total; minimizar preserva filtros compartilhados.
- Metas: 13 colunas completas, edição multicélula local antes de `update`, revisão conjunta e confirmação atômica. Valores revisados usam D1=bruto×p1, D2=(bruto−D1)×p2. Base histórica de meses não editados fica preservada; renomear sozinho não altera cálculo, percentuais ou precisão. Nomes por mês auditados. Segundo deflator legado permanece 0% até alteração explícita.
- Datas do relatório são resolvidas por `dailyEstimate` para cada data do horizonte completo permitido (defasagem 0–120), respeitando o parâmetro do mês de destino. Agrupar intervalos somente após resolução; informado inclusive zero suprime estimativa. Detalhamento mostra datas estimadas e suprimidas separadas.
- Novo mês mm/aaaa com máscara e seletor mês/ano, validação e duplicidade; padrões opcionais somente meses novos. Meses ordenados cronologicamente. Rascunhos por modo/organização não se propagam ao trocar contexto.
- Números positivos azuis, negativos vermelhos, zero neutro; deduções com sinal negativo. Cor de fornecedor por ID separada da semântica dos valores. Sem importação de nomes/valores fictícios do HTML aprovado.
- Evidências desta entrega: 184 testes em 23 arquivos aprovados, incluindo 8 novos testes de relatório. Navegador com organização fictícia e todas as funções de servidor interceptadas: 15 KPIs, quatro gráficos, expansão de cada indicador/gráfico, filtragem clique/teclado, paginação e minimizar; 13 colunas, edição de dois meses, renomear, validar/duplicidade/mês+ano, revisar/voltar/descartar/confirmar/reload, histórico fictício e fluxo vertical/CEO. Uma gravação interceptada; simulação sem outra gravação. Desktop 1366×768 e 1920×1080 com menu aberto/recolhido; sem scroll de página medido, tabela expandida contida na área. Mobile 390×844: revisão centralizada, gráficos e informação empilhados, tabelas largas com scroll interno para preservar colunas.
- Limites: persistência e auditoria hospedadas não foram escritas para teste; respostas de teste simulam servidor/auditoria. Desempenho visual com todo o volume da organização real e todos os comprimentos possíveis de nomes não aferido. O card informativo pode rolar internamente quando a legenda é longa; mobile preserva tabelas com scroll horizontal interno. Nenhum dado real alterado, nenhuma publicação.

## Correção da distribuição diária — 11/11/2026
- Causa reproduzida: o seletor alterava o rascunho, mas a memória mostrava apenas o líquido (independente do divisor), sem estimativa/dia. A revisão também omitia a diária; a persistência mensal já guardava `financial.divisor`. O fluxo usava centavos arredondados a cada dia, perdendo precisão nas projeções revisadas.
- Rascunho, coluna mensal e fluxo usam `estimateMonth`. Deflator 1 sobre bruto, deflator 2 sequencial após a primeira redução na configuração aprovada; bases anteriormente cadastradas são preservadas até revisão. Líquido dividido por 30 ou pelos dias corridos do mês/ano **de origem** da meta (28/29/30/31), não do destino após defasagem. Janeiro líquido R$ 93.000: /30 = R$ 3.100 e /31 = R$ 3.000 por dia.
- A prévia mostra imediatamente diária/divisor e a revisão compara antes/depois. Confirmar versiona e audita a configuração do mês pelo salvamento existente; cancelar não grava. Recarregar mantém a opção confirmada; simulações continuam isoladas.
- /30 é apenas divisor: todos os dias do calendário seguem projetados, inclusive o 31º; não há redistribuição para forçar total mensal. Projeções de meses financeiros revisados preservam precisão; BRL arredonda só na apresentação. Meses de origem ainda não revisados conservam o cálculo histórico, sem migração financeira silenciosa.
- Informado, inclusive zero confirmado, continua substituindo estimativa. Vertical e CEO usam os mesmos valores.
- Evidências: 176 testes passaram (11 novos em `distribuicaoDiaria.test.ts`); compilação automática OK. `scripts/e2e/metas-distribuicao-isolado.py` intercepta todas as funções de servidor: janeiro troca R$ 3.100 → R$ 3.000 no rascunho, revisão/voltar preserva escolha, uma confirmação fictícia, coluna e seletor mantidos após reload; no fluxo fevereiro 01–10 usa R$ 3.000 de janeiro e dia 11 usa R$ 3.100 de fevereiro, nas duas visões. Simulação troca para /30 sem gravação real; reload retorna real /dias. Formulário conferido em 1280×1800 e 390×844; sem erros de execução. Persistência/auditoria hospedadas não foram escritas para testar: verificadas por caminho existente e testes de serialização/diff, com servidor fictício no navegador. Nada publicado ou alterado na organização real.

## Cadastros e Meta de Faturamento — revisão 11/11/2026
- Referências passa a se chamar Cadastros, mantendo a URL e os vínculos; abas Fornecedores e Categorias e subgrupos. Parâmetros e ajustes não ficam nessa página.
- Meta de Faturamento concentra bruto, dois deflatores, bases, reduções, líquido, divisor e defasagem; lista compacta e painel por mês. Base do primeiro = bruto; base do segundo = bruto ou líquido após primeira redução. Percentuais nunca somados automaticamente.
- Configuração mensal confirmada usa `financial`; na ausência, a regra de origem continua sendo lida sem alterar percentuais, divisor ou defasagem. Meses com só um deflator exigem definir o segundo ou confirmar explicitamente 0%. Referências Excel/Web aparecem apenas na memória/histórico, não como escolha operacional.
- Revisão compara configuração e líquido antes/depois por mês e impacto no saldo final do período selecionado; voltar/cancelar não persiste. Confirmar salva uma versão mensal auditada. Padrões preenchem apenas novos meses, sem atualizar meses cadastrados.
- As duas visões continuam usando o mesmo cálculo. Ajustes manuais de saldo ficam em área própria do Fluxo, com data, valor (zero válido), justificativa e confirmação. Ajustes anteriores não são excluídos na reorganização; a edição inline do ajuste passa a ser consulta. Saldo de origem, início do fluxo e conferência de transição ficam em Bancos; nunca se soma saldo de origem ao saldo das contas.
- Testes: `src/lib/financeConfig.test.ts` cobre preservação antes de confirmar, dois deflatores sequenciais, bases, padrões, igualdade entre visões, auditoria e ajustes em cenário isolado.

## Fornecedores e condições — revisão 10/11/2026
- Lista compacta com fornecedor/apelidos, situação, condição vigente e Gerenciar. Painel em Dados do fornecedor e Condições de pagamento; detalhes e histórico expansíveis.
- Edição de condição guarda versão anterior (nome, observação, prazos, data/usuário); não altera condições gravadas nos lançamentos e congela prazos das previsões legadas antes de mudar padrão.
- Cancelar condição exige motivo e confirmação; sai das escolhas para novos lançamentos, mantendo histórico/vínculos. Impacto vigente/futuro exige substituta explícita ou confirmação de ausência de padrão; nunca escolhe outra automaticamente.
- Cancelar uma ativação mantém o evento com motivo/data/usuário e a condição cadastrada. O período cancelado não restaura silenciosamente outra condição; a substituta é decisão explícita.
- Excluir condição somente sem utilização/vínculos, histórico ou períodos (inclusive cancelados). Vínculos legados sem identificação exata bloqueiam conservadoramente. Cancelar edição apenas descarta o formulário.
- Testes isolados: `src/lib/condicoes.test.ts`; nenhum registro real é criado para validação.

Nenhum arquivo real foi importado. Regras do legado extraídas por análise estática; Excel não recalculado; VBA nunca executado. Itens marcados **[aprovado]** são mudanças autorizadas por Eduardo — evolução, não equivalência literal com o Excel.

## Arquitetura
- **Decisões e confirmações**: janelas próprias centralizadas, título curto, impacto objetivo, Cancelar secundário e ação nomeada; destrutivas vermelhas. Sem confirm/prompt/alert nativos, sem fechar por movimento/clique externo. Justificativas e datas solicitadas nestas janelas; formulários extensos continuam laterais e a revisão final centralizada, sem confirmação extra após a revisão. Cancelar não executa a ação. Exclusão de simulação preserva sua auditoria.
- **Pendências do fluxo**: avisos agrupados por problema e separados em Erros, Atenção e Informações. Metas ausentes são atenção (estimativa zero não confirma ausência de recebimentos); falhas que impedem distribuir registros são erros. Detalhes ficam disponíveis, meses organizados por ano, sem IDs internos. Ocorrências no período selecionado aparecem primeiro; anteriores/fora dele ficam recolhidas. Atalhos destacam o mês/registro, sem modificar os filtros compartilhados nem corrigir valores. Metadados de datas/meses nos avisos não alteram o cálculo.
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
- **A Meta**: Legado (padrão): líquido = meta·(1−B2 global); diária = líquido/30 (configurável dias reais). Web: red1=meta·r1; red2=(meta−red1)·r2; líquido/dias reais. Ex.: 273.000, 25%, 18% → 167.895 e 5.415,967741935. Perfis não se misturam. Diária arredondada ao centavo por dia (meio p/ longe do zero), valor exato exibido em Meta de Faturamento. Meta ausente → estimativa 0 + atenção na apresentação de Pendências do fluxo; não confirma ausência de recebimentos.
- **B Defasagem**: dia D usa meta do mês de D − N dias corridos; sem ajuste de fim de semana/feriado.
- **C Recebimentos [aprovado]**: ausente (todos vazios) → estimativa; qualquer valor informado, inclusive **zero confirmado**, substitui a estimativa. (Legado usava estimativa quando soma=0.) Geral + plataformas são somados (D:O) com alerta de dupla contagem, sem correção.
- **D Previsões**: Web COUNT(prazos numéricos, zero conta); Legado COUNTIF(>0), P−Q com Q = Σ M / n somente de efetuadas **legadas** vinculadas por código (sem vínculo explícito). M ausente → `abatimento_ausente` (erro). R negativo mantido. **[aprovado]** parcelas na mesma data são somadas; resíduo de arredondamento vai na **última parcela** e é exibido.
- **Efetivação [aprovado]**: vínculo estável `plannedId`/`effectivationId`; valores/parcelas/vencimentos livres (sugestão dos prazos do fornecedor). Parcial: sugere restante = restante previsto − efetivado; usuário confirma/ajusta valor e datas próprias (`remainingOverride`). Concluída: previsão `encerrado`. Sem restante explícito, o valor efetivado é abatido das parcelas padrão. **A parte da previsão substituída pode diferir do valor efetivado** (`substituted`, gravado na efetivação; registros antigos sem o campo = valor efetivado); a reversão devolve a parte substituída, não o valor efetivado. Idempotente por id. Reversão auditada (cancela parcelas, restaura previsão; bloqueada com pagamento ativo ou efetivação posterior). Previsão com efetivação vinculada ignora M legado do mesmo código (alerta `PLAN_DUPLO_MECANISMO`) — sem abatimento duplo. Migração: efetuada antiga com M → origem `legado`; sem M → `manual`.
- **Efetivar abre painel de conferência** (não converte de imediato): bloco "Previsão de origem" somente consulta + bloco "Dados da efetivação" editável (valor, condição cadastrada ou específica, data base, parcelas editáveis, parte substituída, manter/encerrar restante). Resumo antes de confirmar: restante antes, parte substituída, valor efetivado, restante após, condição efetiva, parcelas. Efetivar não registra pagamento.
- **Painéis laterais** fecham SOMENTE por X, Cancelar ou conclusão — nunca por mouse fora ou clique no fundo; com alterações não salvas, pedem confirmação antes de descartar. Listas/calendários/menus abertos pelo formulário não fecham o painel.
- **Busca de fornecedor** (Consultas, Novo lançamento e demais formulários): clique abre a lista; digitar filtra por nome e apelidos, ignorando maiúsculas/acentos (`filterSuppliers`); seleção por clique ou teclado vincula o identificador — texto digitado não vale como cadastro; sem correspondência mostra "Nenhum fornecedor encontrado"; lista em portal acima do painel. Consultas oferecem "Todos" e incluem inativos (com selo), filtrando pelos vínculos dos lançamentos. Novos lançamentos listam só fornecedores ativos na data. Fornecedores seguem o cenário: cópia da base disponível na simulação; cadastros de uma simulação não aparecem em outra nem na base real.
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

- Fornecedores: cadastro primeiro (nome obrigatório, observação opcional; "Novo fornecedor"/vazio bloqueados e sinalizados na lista para correção, sem exclusão automática); campo Grupo fora do cadastro. Condições com observação informativa (não afeta cálculo), prazos em lista dinâmica sem limite de 10 (motor, cartão até 360). "Usar como vigente a partir de…" cria novo período na condição existente; sugestão usa a vigente na data base; lançamentos existentes não mudam.


## Fornecedores: edição, apelidos e situação
- Relatórios e filtros usam o ID cadastrado quando válido; sem vínculo, usam nome histórico normalizado em chave distinta, com indicação de vínculo pendente. Nome realmente ausente mantém “Sem fornecedor”. Não inferir marca/razão social, não usar chave de apresentação para prazos ou abatimentos. Documento vazio permanece obrigação independente nos agrupamentos.
- Recuperação de descrições importadas usa a identidade da condição e a linha original, nunca posição na tela ou igualdade de prazos; nomes personalizados, vigências, períodos e cancelamentos ficam intactos. Observação da condição é informativa e separada do nome.
- Datas de preenchimento: calendário em português com seleção de mês/ano, máscara dd/mm/aaaa e colagem; datas inexistentes e períodos invertidos são rejeitados junto ao campo. O armazenamento permanece em dia civil ISO, sem converter seleção do calendário para UTC nem alterar cálculos financeiros.
- O identificador do fornecedor nunca muda ao editar nome principal, apelidos ou observação; condições, lançamentos, pagamentos, relatórios e histórico continuam vinculados.
- Busca reconhece nome principal ou apelido e mostra o cadastro principal. Colisão com nome/apelido de outro fornecedor bloqueia a gravação; cadastros nunca são unidos automaticamente.
- Inativação/reativação são eventos com data de início, usuário e horário. A partir da inativação, o fornecedor não é oferecido nem aceito em novos lançamentos; registros e obrigações existentes continuam consultáveis e operáveis.
- Exclusão só ocorre sem condições, lançamentos ou histórico de importação vinculados; com vínculo é bloqueada e oferece inativação, sem apagar dados relacionados. Alterações aparecem no Histórico / Auditoria com antes/depois.

## Efetivação com edição manual (protótipo aprovado — 10/11/2026)
- Ações: **Efetivar esta parcela** (linha) e **Efetivar documento** (seleção de parcelas ainda planejadas); **Ajustar planejamento** replaneja sem efetivar (substitui a antiga área "Definir restante").
- Carrega valores/vencimentos previstos atuais; não aplica a condição vigente do fornecedor. Reparcelar por condição é opcional e pede confirmação antes de apagar ajustes.
- Data da efetivação (negócio) é distinta do vencimento e do registro de auditoria.
- Previsão substituída ≠ valor efetivado: substituir integralmente 1.000 por 900 não gera saldo de 100; saldo só por parcial explícito ("Manter saldo não substituído em Planejada").
- Sugestões só ao clicar "Aplicar sugestão" (confirmação se houver valores personalizados; datas preservadas): Manter (9.900), Igualar — só com uma parcela de origem (9.000), Aplicar diferença também às restantes (9.800; redução adicional explícita), Manter total original (10.000). Centavos inteiros, resíduo na última; sem restantes nada é redistribuído. Quando a quantidade foi alterada manualmente, a sugestão usa as parcelas presentes na tabela (registrado na regra).
- Confirmação atômica (`effectivateManual` em `src/lib/efetivacao.ts`): títulos efetivados + restante por parcela com IDs estáveis (`remainingOverride.items`), sem abatimento FIFO; antes/depois por parcela gravado na efetivação e exibido em Detalhes. Previsão original, efetivações anteriores e pagamentos preservados; efetivar não paga. Reversão restaura o estado anterior, exigindo reverter primeiro efetivações manuais posteriores.
- Pendência: o antes/depois aparece em Lançamentos → Detalhes e no Histórico; ainda não há visão dedicada em Consultas.

## Novo lançamento · Efetivado (Compra e Despesa)
- Após o fornecedor: escolher "Preencher manualmente" (quantidade → linhas com total dividido em centavos, vencimentos em branco) ou "Usar uma condição cadastrada como sugestão". A condição vigente nunca é aplicada automaticamente.
- Tabela editável Valor real / Vencimento real com calendário, adicionar/remover parcelas. Regerar linhas pede confirmação.
- Revisão mostra todas as parcelas e a conferência da soma; "Confirmar lançamento" exige marcar "Conferi os valores e vencimentos com o documento ou a negociação desta operação."
- Condições da operação não alteram o fornecedor nem outros lançamentos; salvar como nova condição é opcional. Efetivado = obrigação real confirmada, não paga.

## Carga real (11/11/2026, versões 115→139)
Fonte: FLUXO_DE_CAIXA_ORIGINAL.xlsm + Despesas_corrigidas.xlsx. Recebimento importado com soma do dia 0 aciona estimativa (IF(D6=0) da fonte); zero digitado no sistema continua substituindo. Meses importados e planejadas importadas usam valores exatos (sem arredondar ao centavo). Divergências da fonte não reproduzidas: GI4 (07/07/2025) exclui recebimentos; HL32 (05/08/2025) não subtrai saídas; JX7 (08/10/2025) estimativa digitada 0; RECEBIMENTOS 02/01/2027 com -1 sem linha fonte; distribuição de efetivadas 14–16/11/2026 desatualizada (total igual); arredondamento da macro nas planejadas. UR32 (15/07/2026) digitado foi importado como ajuste de saldo em 16/07/2026.
- Fluxo real: gravação somente ao clicar Salvar; rascunho protegido no navegador por usuário+organização; envio só dos registros alterados; conflito na mesma informação abre janela de decisão; alteração de valor/vencimento exige justificativa (registrada no próprio lançamento e na auditoria).

## Planejado × Efetivado (Consultas) — leitura
- Escopo por previsão; vínculos só explícitos (`Committed.plannedId` ou `committedIds` de efetivação não revertida). Título reivindicado por duas previsões = Não comparável.
- Referência = valor da previsão (a efetivação não altera `Planned.value`); revisão de valor após a 1ª efetivação torna a referência Não disponível. Não há fotografia dedicada gravada: lacuna para cobertura futura.
- Total atual = efetivado ativo + restante confirmado (encerrado=0, `remainingOverride`); sem restante confirmado = Não comparável. Pago não soma; cancelados à parte, não são economia. % Não aplicável com referência 0.
- Período filtra por data da efetivação; colunas acumuladas. Responsável da efetivação não é registrado no evento (Não disponível).

- Aba principal de Lançamentos reutiliza este relatório; Consultas oferece atalho. Categoria/subgrupo são os da previsão vinculada, sem inferir vínculos.
- KPIs usam somente os pedidos comparáveis do conjunto filtrado completo, antes de paginar (50 pedidos). Cobertura informa comparáveis/filtrados, motivos e exclusão por falta de data quando há período. Nenhum comparável = Não disponível, não zero.
- Percentual agregado = (soma total atual − soma referência) / soma referência; referência agregada zero = Não aplicável. Exportação inclui todos os pedidos filtrados e as mesmas definições/indicadores de cobertura; acumulados integrais, não valores restritos ao mês.


## Número do boleto por parcela — 17/11/2026
- Identificação opcional manual (`boletoNumber`: string/nulo/ausente), distinta de pedido, documento e numeração automática. Sem inferência de códigos históricos, geração, conversão numérica, validação bancária ou backfill.
- Títulos de compra/despesa guardam metadado no próprio ID; planejamento usa parcela própria/restante e mapa `boletoNumbers` por chave estável para editar identificação sem materializar nem recalcular valores. Efetivação transfere apenas o que a linha explicitamente contém; novas linhas/reparcelamento não copiam identificações.
- Gerenciar permite corrigir/limpar boleto inclusive em parcela paga; valores/datas/status/baixas continuam protegidos. Revisão mostra antes/depois; logs legíveis registram campo/autor/data. Confirmação segue operação isolada existente, sem autosave nem segundo salvar.
- Lista Efetivado, Consultas, detalhes e CSV (incluindo notas do Planejado × Efetivado) mostram identificação; busca normalizada por snapshot a inclui. Validação de tipo no cliente e na gravação existente, compatível com ausentes; nenhuma tabela/migração criada.
- Testes: fixtures com três parcelas/distintas/vazia, parcial/repartição sem cópia, compras/despesas pagas, editar/limpar, zeros e símbolos, compatibilidade, paridade financeira zero, patch/conflito/pendências, busca/cache/CSV. Navegador isolado: criar → revisar/confirmar → Gerenciar → corrigir → buscar/exportar → reload → limpar boleto pago mantendo baixa. Persistência hospedada não testada; nenhum dado oficial gravado. Ambiente browser injeta fixture no cliente e produz aviso esperado de hidratação.

### Efetivação com notas lado a lado (nov/2026)
Notas do rascunho aparecem em painéis laterais com rolagem horizontal; cada nota tem documento, total, datas, condição e parcelas próprias. O restante do pedido fica em bloco compartilhado abaixo, com confirmação manual única; o resumo fixo mostra "Não confirmado"/"Aguardando confirmação" até a conferência. Notas já efetivadas aparecem recolhidas, só consulta. Regras financeiras inalteradas.

## Pedido com várias notas — referência e prévia (17/11/2026)
- Causa do "Planejado antes 0,00": o cabeçalho somava as parcelas salvas (todas 0 quando a previsão foi importada com valor 0) e ignorava o "Valor total previsto" digitado no rascunho; a referência vinha do valor salvo (0), gerando diferença negativa.
- Agora a referência é o valor salvo quando positivo; se o salvo for 0, usa o valor digitado no rascunho e o grava na confirmação, com histórico 0 → valor. Referência positiva salva nunca é reescrita pela efetivação.
- Prévia do restante = referência − efetivado anterior vinculado − selecionado agora; abaixo de zero aparece como Excedente separado e exige confirmação. A prévia não redistribui nada: "Usar prévia" e "Distribuir prévia nas restantes (datas mantidas)" só por clique; o restante continua confirmado manualmente e precisa igualar a soma das parcelas restantes.
- Notas e parcelas têm seleção (cabeçalho com estado parcial e por parcela), em Cards ou Lista completa sobre o mesmo rascunho. Parcelas de nota não selecionadas entram no restante planejado (sem o número da nota, limitação atual).
- Voltar à edição do planejamento mantém notas e valores no rascunho.

### Notas conhecidas que permanecem planejadas (pedido com várias NFs)
- Parcelas de nota não selecionadas ficam no restante confirmado com identificação própria (`RemainingItem.note`: NF, condição, data base, data de efetivação prevista, nº/qtde da parcela, vencimento original e prorrogação); `date` do item continua sendo a data efetiva usada no fluxo. Os IDs são os mesmos ao efetivar depois (título = mesmo ID), sem duplicar previsão.
- Ao reabrir, essas notas voltam como painéis "Planejada (salva)" e saem da lista de parcelas genéricas.
- Linhas genéricas de R$ 0,00 não selecionadas são substituídas pelo detalhamento das notas: não exigem valor, não persistem no restante e ficam registradas no histórico (evento `manual.before` e editLog). Linhas genéricas positivas continuam exigindo valor/data e soma igual ao restante confirmado.
- É possível salvar notas conhecidas sem efetivar nenhuma (sem evento de efetivação; histórico no editLog).
- Erros de restante indicam a nota/parcela e o campo.
- Outros caminhos (Gerenciar, Ajustar, nota avulsa ligada ao pedido, restante genérico): preservam ou bloqueiam sem apagar a identificação das notas planejadas.

## Preparação de substituição autorizada — 19/11/2026 (sem corte)
- Adaptador isolado `replacementImport` recebe somente as abas da fonte e seu SHA256, nunca a base anterior. IDs determinísticos por origem; grafias de fornecedores não são fundidas por semelhança.
- Pedido/documento vazios são opcionais; data faturamento `-` é ausente quando vencimento G está comprovado. Valor ausente não vira zero. Quarentena é explícita no manifesto.
- Despesas seguem o contrato existente: títulos importados em `expenses`, situação de pagamento a confirmar, sem cutoff e sem baixa. Classificação não prova etapa de despesa nem pagamento; essa limitação bloqueia eventual distinção planejada/efetivada sem evidência.
- Fonte numérica preserva frações de centavos, recebimentos literais 1, zero e vazio. `REAL` não confirma crédito bancário (`realized=false`). Nenhum pagamento, conta, cartão, transferência ou efetivação anterior entra no candidato.
- Substituições de saldo do FLUXO só podem vir de células literais ou fórmulas aritméticas explícitas da própria fonte, documentadas célula a célula; não são ajustes compensatórios nem saldos bancários. Divergências de fórmulas de resultado não são corrigidas por lançamento artificial.
- Reconciliação reconhece “Saldo disponível projetado” pelo rótulo; relatório local compara todo calendário, componentes e saldo, separando diferença nova e herdada. Cache incoerente nunca constitui paridade validada.
- Testes sintéticos do adaptador e leitura não constituem execução oficial nem prova de restauração hospedada. Corte exige pausa acordada, backup da versão mais recente, restauração isolada comprovada e troca atômica/versionada/idempotente pelo caminho oficial existente.

## Substituição pela fonte única (19/11/2026, versão 189)
- Base ativa recriada só da fonte SHA256 ea1c4241…; pagamentos, efetivações, ajustes, contas e transferências antigos ficaram somente no backup v188 e no snapshot_before da auditoria.
- Recebimentos importados: zero informado permanece zero (não aciona estimativa); dia sem registro usa estimativa.
- Valores em centavos inteiros (meio para longe do zero); parcelas da mesma nota (fornecedor+documento exatos) preservam o total arredondado com resíduo na última; cada delta fica no manifesto.
- Compras da aba EFETUADAS = efetivado sem baixa; despesas = título a confirmar, nunca pagas por data; sem cutoff.
- Rascunhos do navegador de gerações anteriores da base não são reabertos.

## Cancelamento e abertura do Fluxo (24/11/2026)
- Título cancelado: obrigação vigente e saldo em aberto = 0; valor original permanece no registro/histórico (`titleStatus.original`/`cancelledValue`). Pagamentos ativos não são apagados; o alerta PAG_CANCELADO pede estorno/crédito explícito.
- Consultas mostram "Obrigação vigente" e, separadamente, "Cancelado (valor original)".
- Fluxo abre na segunda-feira da semana vigente em America/Sao_Paulo até o fim do mês seguinte; período escolhido pelo usuário não é sobrescrito durante o uso.
