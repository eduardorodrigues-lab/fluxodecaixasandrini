# Roadmap

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
