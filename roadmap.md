# Roadmap

## Filtros interativos de Lançamentos — autorizado 16/11/2026
- [ ] Painel compacto Planejada/Efetivado, critérios combinados/chips/ordenação e totais completos antes da paginação; pesquisa e Gerenciar preservados
- [ ] Datas confiáveis por parcela via auditoria/histórico existentes, sem inventar cadastro original nem escrever metadados
- [ ] Testes focados, navegador 1366/1536/menor e medição na mesma amostra isolada; nenhuma escrita oficial/publicação

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
