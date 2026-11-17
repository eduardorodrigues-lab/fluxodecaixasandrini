# Roadmap

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
