# Roadmap

## Substituição financeira pela fonte única ea1c4241 — autorizada 19/11/2026
- [x] Regras finais: zero informado sem estimativa, centavos inteiros com resíduo por nota, geração da base nos rascunhos
- [x] Backup v188 verificado; gravação única 188→189 (d4a04a50-07b9-53ac-a80a-4039272cf398) relida e conferida
- [ ] 165 despesas com subgrupo provisório aguardam finalidade; baixas/contas/cartões/transferências a cadastrar pela equipe

## Estabilização abrir→editar→salvar→fechar→reabrir→reload — autorizado 19/11/2026
- [x] Causa da lentidão pós-confirmação: aba Consultas escondida recalculava tudo (~4–6 s) e previsões varriam todos os títulos por pedido; corrigido sem mudar resultados (Consultas idêntica em base fictícia)
- [x] Gravação confirmada com tela não atualizada: formulário trata como salvo e rascunho já contido na base não reaparece
- [x] Aceite fictício ~10,7 MB editor 19/19, owner 19/19, leitor 6/6; SQL rollback de idempotência/papéis; 385 testes; logs em docs/evidencias
- [x] Faixa mostra identificação do envio; pacote recuperado sem confirmação recebe 1 consulta automática só de leitura (sem reenvio); aceite editor 21/21
- [ ] Lançamento de hoje do editor não correlacionado: auditoria de hoje tem só uma gravação de editor (11:54 UTC, 184→185); falta a identificação do envio exibida na faixa
- [ ] Duplicata simultânea no servidor só por raciocínio de código; banco hospedado e navegador de produção não medidos

## Conferência dos demais acessos de salvamento — 18/11/2026
- [x] Inventário por leitura dos caminhos compartilhados/legados; estados propagados, descarte de rascunho protegido e consulta legada limitada
- [x] Regressões fictícias global/isolado, recuperação nove estados e resposta tardia; docs/salvamento-conferencia-geral-2026-11-18.md; limites hospedados preservados

## Confirmação lenta e erro na revisão — autorizado 18/11/2026 17:55 UTC
- [x] Resposta tardia reproduzida/corrigida em fixture; consulta na própria revisão sem reenvio e sem faixa residual após confirmação
- [x] Normalização/diff fictício ~12 MB mediana 118,0→58,2 ms; navegador completo 2.086,2→2.048,0 ms (sem ganho perceptível comprovado); 41 testes e browser global/isolado
- [x] Evidências/limites em docs/salvamento-confirmacao-tardia-2026-11-18.md; compilação OK, sem escrita real/publicação
- [ ] Causa e tempo do incidente hospedado não comprovados; pacote real não consultado/reenviado e banco real não medido

## Fluxo sem recortes e recuperação acionável — autorizado 18/11/2026 17:24 UTC
- [x] Remover filtros Fornecedor/Grupo do Fluxo e ignorar estado antigo sem limpar preferências de outros módulos
- [x] Consulta manual read-only independente de rejected, estados/motivos claros, pacote desconhecido bloqueado, exportação legada e conflito revisável; captura recusada arquivada
- [x] 37 testes, nove cenários browser de recuperação + regressão global/isolado + Fluxo com URL legada; compilação OK; docs/fluxo-recuperacao-2026-11-18.md; sem escrita real
- [ ] Incidente real e status definitivo de envios sem auditoria não comprovados; contrato atual só informa confirmação/ausência, sem autorização para concluir registro real

## Entradas clicáveis e revisão de lançamentos — autorizado 18/11/2026 17:08 UTC
- [x] Detalhamento somente visual do mesmo motor: diário/período, contas ausentes, saldo bancário separado, estimativas e transferências/estornos
- [x] Quadro atualizado por leitura em Files: pedido 1852, NF 017766350, aportes/Geral, M&S/Mococa; sem aplicação de lote
- [x] 44 testes e navegador fictício horizontal/vertical/simulação 1366/1920/390; compilação OK; zero escrita real; docs/entradas-detalhamento-2026-11-18.md
- [ ] Conciliação de NF 017766350, aportes/Geral e M&S/Mococa aguarda documentos/IDs/contas e revisão específica; nenhuma aplicação autorizada

## Lacunas de revisão e confirmação — autorizado 18/11/2026 14:55 UTC
- [x] Substituir envio global direto por revisão identificada e pacote protegido; preservar confirmação isolada
- [x] Estados explícitos, tempo limite e consultas read-only limitadas; recuperação com o mesmo requestId, sem escrita automática
- [x] 49 testes e navegador fictício global/isolado: volta, duplo clique, perda de resposta, offline, pacote/reload, conflito e edição durante envio; relatório docs/salvamento-confirmacao-2026-11-18.md
- [ ] Resultado de rascunhos legados sem captura e sem auditoria encontrada depende de evidência hospedada; bloqueados conservadoramente sem novo envio. Banco real e duas abas simultâneas não testados nesta rodada.

## Salvamento de Recebimentos — autorizado 18/11/2026
- [x] Revisão isolada por data/origem, grade e Fluxo; mesma proteção/recuperação de pendências sem salvar outras entidades
- [x] Confirmação autoritativa/versionada, requestId protegido, leitura de envio legado confirmado e conflito recuperável
- [x] 43 testes e compilação OK; navegador fictício ~12 MB: revisão/voltar/confirmar/reabrir, zero, múltiplas datas, novo, legado, perda de resposta/reload/retry, conflito; 1366/1920/390. Evidências em docs/recebimentos-salvamento-2026-11-18.md; sem publicação/escrita real
- [ ] Banco hospedado, duas abas simultâneas e falhas de armazenamento não testados; dados reais não autorizados, limites descritos no relatório

## Salvamento pontual — autorizado 18/11/2026
- [x] Remover cálculo diário da revisão; manter alterações da operação e histórico
- [x] Resposta canônica confirmada com aplicação por versão exata e releitura segura nas exceções
- [x] Conferência por leitura dos acessos alternativos; revisão antiga filtra mantidas e Dados da nota explicita antes/depois; 30 testes e compilação OK; inventário em docs/salvamento-conferencia-acessos.md
- [x] 96 testes distintos, compilação, navegador ~12 MB: descrição mediana 5,29→2,03s; fornecedor/condição/inline/reload, 12 parcelas/datas e perda de resposta/retry/fallback. Evidências em docs/salvamento-medicoes-2026-11-18.md; sem publicação/escrita real
- [ ] Medianas antes/depois individuais de todos os cenários e duas abas concorrentes no navegador não executadas nesta rodada; banco hospedado não medido por proibição de gravações reais

## Organização única e fornecedores — autorizado 18/11/2026
- [x] IDs/memberships lidos; somente oficial, sem seletores/fallback; função de criação automática desativada sem alterar registros/memberships
- [x] Fornecedores/condições isolados e protegidos localmente; inline local/atômico; recuperação seletiva por ID com confirmação e pendências independentes preservadas
- [x] Testes focados e navegador fictício: roles/sem acesso/mesmo nome, fornecedor+condição/reload/efetivado com datas manuais, inline planejado/reload/falha/retry; zero escrita real/publicação
- [ ] Convite/login/logout completos, duas abas e recuperação pós-envio no navegador não verificados; auditoria/concorrência hospedada bloqueadas por proibição de gravações reais

## Planejamento simples e múltiplas notas — autorizado 17/11/2026 18:45
- [x] Proteção local do preenchimento por contexto, recuperação sem autorização antiga e descarte explícito
- [x] Cadastro com notas opcionais, edição compatível, valor previsto revisado e saldo coberto por datas
- [x] Consultas e busca com NF planejada; evidência histórica em novas primeiras efetivações
- [x] 89 testes; browser fixture simples/save/reopen/edit/reload, 5 notas, 4+saldo datado, 7×4+zeros/seletiva/segunda/parcial, falha/retry e duas abas; datas 1366/1920.
- [ ] Auditoria/concorrência hospedada, retry após reload entre envio/resposta e cobertura individual dos acessos legados: não verificados nesta rodada; somente testes fictícios autorizados.
- [ ] Persistência/concorrência hospedada real não testada: gravações reais não autorizadas

## Várias notas no mesmo pedido — autorizado 17/11/2026
- [x] Lote atômico com notas independentes, escopo único substituído, restante manual e revisão no formulário vertical existente
- [x] 112 testes focados (14 novos); navegador 1366/1536 uma nota + duas posteriores/revisão/save/reload/busca/CSV: 1 pedido, 3 notas, 12 títulos, 0 baixas/calls oficiais. Sem migração/publicação
- [ ] Persistência/auditoria hospedadas e concorrência multiusuário real: não verificadas, gravações reais de teste não autorizadas

## Número do boleto por parcela — autorizado 17/11/2026
- [x] Metadado opcional, formulários/efetivação/Gerenciar, busca/consultas/exportação e histórico sem mudança financeira
- [x] 8 testes novos + regressões; navegador fixture 1366/1536 criação/revisão/salvar/Gerenciar/busca/CSV/reload/limpar paga; baixa preservada, zero chamadas oficiais. Persistência hospedada e efetivação parcial no navegador não verificadas (parcial coberta em teste puro); nada publicado

## Aba principal Planejado × Efetivado — autorizado 17/11/2026
- [x] Reutilizar relatório, acesso /lancamentos?tab=pva, retorno preserva filtros, categoria/subgrupo, KPIs comparáveis e cobertura/exportação integral
- [x] 40 testes focados; navegador fixture 1366/1536/768/390: filtros, cobertura, ausência, notas, CSV, troca de abas e reload; zero chamadas de escrita
- [x] Compilação automática OK; nenhuma escrita oficial ou publicação. Base real não homologada; sem fotografia dedicada/autor no evento, limitações existentes preservadas. Fixture injeta contexto apenas no cliente, causando aviso esperado de hidratação no teste, não prova de erro em produção.

## Salvamento da operação revisada — autorizado 16/11/2026
- [x] Confirmar e salvar somente operação/dependências revisadas; pendências independentes preservadas, sobrepostas bloqueadas explicitamente
- [x] Recuperação/idempotência, falhas/conflitos, reconciliação e edições durante espera; simulação isolada e viewer
- [x] Testes focados e navegador fixture com releitura/reload, sem escrita oficial ou publicação
- [ ] Auditoria/persistência hospedadas e concorrência multiusuário real não testadas: gravações reais de teste não autorizadas; todos os caminhos integrados não exercitados individualmente no navegador

## Formulários verticais — autorizado 16/11/2026
- [x] Edição planejada vertical e efetivação com blocos reais/restantes juntos; seleção explícita, sugestões e revisão
- [x] 69 testes focados; inclusão/cancelamento e IDs, fluxo por data, proteção de pagas, concorrência, sugestões e regressão filtros; navegador fixture 1366/1536 com revisão/desistência, seleção 1/2/3, efetivação parcial relida e zero gravações
- [x] Notas com noteId comprovado permitem adicionar parcela e cancelar existente, sem renumerar histórico pago; notas legadas sem vínculo não recebem IDs inferidos
- [ ] Verificação hospedada de concorrência/volume integral não executada: testes usam fixture e funções de leitura interceptadas; publicação e gravações reais não autorizadas


## Filtros interativos de Lançamentos — autorizado 16/11/2026
- [x] Painel compacto Planejada/Efetivado, critérios combinados/chips/ordenação, CSV e totais completos antes da paginação; pesquisa e Gerenciar preservados
- [x] Datas por parcela via auditoria/histórico existentes; importação não vira cadastro original, ausentes Não disponível; sem escrita de metadados
- [x] Testes focados e navegador isolado 1366/1536/768/390: Mais filtros, chips, limpar, trocar abas, ordenar, exportar 2.000 registros com 50 na tela e abrir Gerenciar; zero funções de escrita
- [x] Mesma amostra v160, 3 repetições: consulta+digitação+estabilidade 361186A2 Planejada 0,77→1,07s / Efetivado 0,85→1,08s; MANCHESTER 1,13→1,29s / 0,85→1,03s. Variação entre execuções, sem benchmark integral nem ganho alegado
- [ ] Cadastro/última alteração históricos fora das últimas 200 auditorias ou sem histórico inequívoco indisponíveis; sem backfill/schema autorizado. Navegador real integral não medido; menu existente precisa ser recolhido abaixo de 900px

## Rapidez da busca de Lançamentos — autorizado 16/11/2026
- [x] Baseline e comparação no mesmo navegador: amostra v160 (600 planejadas/2.000 títulos/1.700 baixas/78 fornecedores), 3 repetições; contagens atuais lidas
- [x] Modelos lazy por snapshot, pagamentos tipo+ID, busca normalizada reutilizada, abas ocultas memoizadas; painel/motor/persistência preservados
- [x] 58 testes: ordenação/filtros/totais/CSV sintéticos, invalidação por novos snapshots; 6 consultas com contagem e DOM idênticos; compilação OK
- [x] Painel isolado com efetivação parcial relida, 0 commits; hashes oficiais v164/v41 idênticos antes/depois
- [ ] Volume completo e consulta 361186A2 com resultados reais: baseline completo excedeu limite; consulta ausente na amostra. Paridade integral da cópia real/exportação e salvar/trocar org no navegador não verificadas nesta rodada

## Correção focada do gerenciamento — 16/11/2026
- [x] Painel amplo, resumo financeiro e prévia sem duplicar previsão/efetivado
- [x] Seleção explícita elegível, efetivação segura e ações visíveis
- [x] 43 testes; navegador isolado MANCHESTER 3×209 em 1366/1536/1920, seleção 1/2/3, revisão manual e releitura de uma efetivada; zero commits
- [x] Mesmos motores/caminhos de persistência; base real v164 e hash idênticos; compilação OK
- [ ] Conferência direta do pedido real não concluída: navegação autenticada não estabilizou no teste; celular não conferido nesta rodada

## Gerenciar lançamentos — autorizado 16/11/2026
- [x] Agrupamento somente consulta; Lançamentos/Consultas/Dashboard integrados; UZ3 conferido autenticado
- [x] Painel único, edição por escopo, cancelamento protegido, redistribuição selecionada e revisão por data
- [x] Efetivação selecionada com restante manual confirmado e sem pagamento; caminho antigo redirecionado
- [x] 52 testes focados, navegador isolado parcial sem gravações; comparação 2.191 dias/10 contas e hash real idênticos
- [ ] Identificações ambíguas: 3.483 registros mantidos individuais, aguardam comprovação/decisão
- [ ] Alterar quantidade de parcelas: não habilitado; requer definição de continuidade dos IDs e baixas antes de implementação

## Migração autorizada de recebimentos (2026-11-16)
- [x] Base v160 lida e backup recuperável; 28→17 plataformas + Geral; 1.225 linhas e 913 componentes preservados
- [x] Oito testes focados; ZERO diferenças por dia/natureza, bancos e 2.191 dias de fluxo 2025–2030 antes/após gravação
- [x] Commit único autenticado v160→161, 102 recebimentos + plataformas auditados; releitura real e ordem das 18 colunas na tela; não publicado

## Condições e identidade completa (2026-11-13)
- [x] Backup v158; 95 nomes recuperados por ID e linha original; 2 efetivados vinculados; nomes genéricos mantidos sem vínculo
- [x] Identidade histórica consistente nos relatórios/filtros e busca em Cadastros
- [x] ZERO financeiro em 2.191 dias e totais; commits autenticados v158→159→160/releitura/auditoria; 13 testes e navegador real desktop; não publicado
- [ ] Confirmar identidades sem equivalência comprovada: 12.708 registros; decisão de Eduardo necessária, sem criar cadastros

## Vínculo real de fornecedores (2026-11-13)
- [x] Backup v157, 24 pares inequívocos; 95 condições preservadas; 797 planejadas/92 compras/1 despesa vinculadas
- [x] Commit único autenticado v157→158 e releitura exata; 2.191 dias e avisos iguais; 3 testes focados; nomes ambíguos/ausentes reportados, sem alteração financeira

## Modernização visual (2026-11-13)
- [x] Atualizar estilos compartilhados, menu, títulos, filtros, formulários e tabelas sem mudar lógica
- [x] Melhorar legibilidade dos 15 indicadores e gráficos preservando expansão/relatório/observações
- [x] 12 testes focados; 11 páginas autenticadas, expansão e formulário; desktop 1366×768/mobile 390×844; sem gravação real/publicação

## Busca e ordenação em Lançamentos (2026-11-11)
- [x] Planejada, Efetivado, baixas e subvisões/detalhes de Consultas: busca, cabeçalhos e estado independente
- [x] Totais, impressão/exportação filtrados e ordenados; 190 testes e navegador desktop 1280×1800 com dados interceptados; sem escrita real/publicação

## Dashboard e Meta de Faturamento aprovados (2026-11-11)
- [x] Dashboard: preservar 15 KPIs, quatro gráficos, expansão inline, relatório paginado e informações sequenciais
- [x] Metas: 13 colunas, edição multicélula, mês/ano, nomes, revisão atômica, histórico e datas reais impactadas
- [x] 184 testes e compilação automática; navegador isolado 1366×768/1920×1080/390×844, capturas e matriz; sem dados fictícios reais nem publicação

## Correção pontual da distribuição diária (2026-11-11)
- [x] Investigar seletor, prévia, configuração persistida e recebimento no fluxo
- [x] Corrigir cálculo/prévia sem alterar metas reais ou regras de origem não revisadas
- [x] 176 testes: meses 28/29/30/31, defasagem, informado/zero, precisão, auditoria e isolamento
- [x] Navegador: seletor → revisão/voltar → confirmação → coluna → reload → fluxo vertical/CEO, simulação isolada e celular; funções interceptadas, uma gravação fictícia, nenhuma real; compilação automática OK

## Cadastros e configuração financeira unificada (2026-11-11)
- [x] Renomear Referências e separar fornecedores/categorias em abas
- [x] Metas compactas, edição/revisão mensal e padrões sem sobrescrever histórico
- [x] Cálculo compartilhado com transição explícita preservando números anteriores
- [x] Ajustes de saldo no Fluxo; saldo de origem e transição em Bancos
- [x] 165 testes; navegador desktop/mobile com organização fictícia, revisão/voltar/confirmar e ajuste; sem gravação real/publicação

## Datas padronizadas (2026-11-10)
- [x] Calendário em portal e máscara manual/colar em todos os campos (inclusive auditoria, decisões e datas do restante previsto)
- [x] Validação de datas/períodos e dia civil; 146 testes, mais teste em UTC+14; navegador desktop/mobile isolado sem gravações reais, compilação sem erros

## Confirmações centralizadas (2026-11-10)
- [x] Substituir avisos nativos e unificar decisões/revisões, mantendo formulários laterais
- [x] 141 testes; desktop/mobile isolado: cancelar/excluir simulação, descarte protegido, revisão e pagamento confirmado uma vez com leitura na tela; sem gravação real/publicação

## Pendências do fluxo (2026-11-10)
- [x] Agrupar avisos, linguagem clara, gravidade e detalhes por ano/período
- [x] Atalhos contextualizados sem alterar os filtros do fluxo ou valores
- [x] 139 testes; navegador desktop/mobile com organização fictícia, zero gravações reais

## Reorganização de fornecedores e condições (2026-11-10)
- [x] Lista compacta e Gerenciar com duas abas; formulários sem cortes
- [x] Editar/versionar, cancelar condição/ativação e exclusão protegida
- [x] Testes isolados, documentação e conferência desktop/mobile

## Complemento fornecedores (2026-11-10)
- [x] Edição e apelidos com validação de colisões e vínculos estáveis
- [x] Vigência de inativação/reativação; exclusão protegida; filtros e histórico
- [x] Testes isolados sem gravar dados reais
- [x] Verificação desktop/mobile no navegador (fornecedores com dados isolados)

- [ ] A Efetivações independentes + correção M legado (plannedRemaining / distributePlanned) + vínculo de título legado + timeline
- [ ] B Metas mensais versionadas (bruto, r1, r2, bases, divisor, defasagem por mês) + migração
- [ ] C Alinhamento de tabelas em todas as páginas + screenshots 1440/1280/menor
- [ ] D Cards do dashboard clicáveis com drilldown, filtros/período, sem vencimento, hoje America/Sao_Paulo
- [ ] E Cadastro de plataformas (ID estável, vigência, inativação, residual)
- [ ] F Isolamento de simulações/rascunho por usuário+org; expectedVersion snapshot; confirmação ao trocar
- [ ] Docs, AGENTS, testes, verificação visual

- [x] Validação do XLSM real (leitor seletivo, layouts reais, conciliação outubro/2026)

Pendências externas: gravação oficial do XLSM (login de Eduardo + organização), login real ponta a ponta.

## Categorias/subgrupos e saídas (2026-11-10) — concluído
- [x] Categoria = Compra/Despesa; subgrupos; migração de kinds antigos preservando vínculos
- [x] Lançamentos com 2 abas + pagamentos; efetivação herda subgrupo
- [x] Fluxo: Compras/Despesas com filtro consolidada/etapa (totais idênticos, testado)
- [x] Relatório de despesas (/despesas) com filtros período/subgrupo/etapa
- [ ] Verificação visual das telas no navegador

## Pedido 1852 — efetivação seletiva bloqueada por linhas R$ 0,00
- [x] Linhas genéricas 0 substituídas pelo detalhamento; notas não selecionadas planejadas com NF/IDs; salvar notas sem efetivar; resumo final na revisão; testes e navegador (fixture)

## Salvamento lento, fornecedor inline e editores (19/11)
- [x] Histórico/auditoria fora da carga e do salvamento normais; carregado sob demanda em Histórico, Metas, painel e tabela de lançamentos
- [x] Leitura grande no servidor só após membership validada; commit com nova tentativa limitada só em corrida de versão comprovada
- [x] Fechar janelas na hora sem edição; com edição: Continuar / Manter rascunho e fechar / Descartar; fechar durante envio mantém acompanhamento
- [x] Rascunho local fora do caminho da digitação, com gravação da última tecla ao fechar/recarregar
- [x] Pacote congelado só após captura; reenvio explícito do mesmo pacote após consulta sem confirmação
- [x] Fornecedor inline + lançamento gravados em uma confirmação (fixture)
- [ ] Incidente real (resultado desconhecido) e tempos do banco hospedado: não verificados sem gravação real; identificador do pacote do navegador da usuária não disponível

## Substituição — preparação da nova fonte única (19/11, sem corte)
- [x] SHA atual conferido; candidato serializado sem fonte financeira anterior, IDs/referências testados
- [x] Classificação por linha e valores/estados preservados; 46 testes (40 sintéticos + 6 candidato local)
- [x] 2.191 dias comparados por componente/saldo, diferenças novas/herdadas e inconsistências fonte documentadas
- [x] Pacote v2: candidato, manifesto, hashes, CSVs e tabela exaustiva; base ativa intacta
- [ ] Paridade financeira final: 12 títulos novos fora da matriz fonte (R$37.641,48), fórmulas/saldo inconsistentes e -1 sem linha; requer fonte corrigida ou decisão explícita sobre essas inconsistências, nunca ajuste artificial
- [ ] Classificação definitiva: 165 linhas/98 descrições sem finalidade comprovada; propostas específicas no CSV, não aprovadas silenciosamente
- [ ] Quarentena: planejada166 sem valor e despesa3786 zero sem data; conservar no manifesto até evidência suficiente
- [ ] Corte posterior: horário de pausa, backup da versão no corte e restauração isolada verificada; não autorizado nesta etapa
