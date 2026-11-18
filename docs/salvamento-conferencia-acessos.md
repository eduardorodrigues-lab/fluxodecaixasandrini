# Conferência dos acessos de salvamento — 18/11/2026

Regra: revisar apenas a operação, sem calcular impacto diário; anunciar Salvo só após confirmação, preservando rascunhos, datas manuais, auditoria e pendências independentes.

| Lugar conferido por leitura nesta conferência | Resultado |
|---|---|
| Cadastros → novo fornecedor (`referencias.tsx`) | Revisão de cadastro, confirmação via operação isolada; sem cálculo diário. |
| Gerenciar fornecedor/condições (`FornecedorManager.tsx`) | Confirmação compartilhada, antes/depois e histórico; análise de vigência é cadastro, não simulação diária de caixa. |
| Fornecedor/condição inline (`SupplierSearch`, `ConditionPicker`, `NovaNota`) | Cadastro local entra só com lançamento; parcelas geradas explicitamente; sem impacto diário. |
| Novo Planejado/Efetivado (`NovaNota`, `lancamentos.tsx`) | Revisão dos campos/parcelas novos; espera resultado compartilhado antes de fechar. |
| Editar planejamento/Adicionar notas/efetivação seletiva (`PlannedLaunchForm.tsx`) | Sem `flowImpact`; corrigida seleção apenas visual que fazia parcela intacta aparecer na revisão sem efetivação. |
| Gerenciar efetivado/despesa (`ManageLaunchPanel.tsx`) | Sem impacto diário; alterações por parcela e compartilhadas, nomes antes/depois. |
| Editar parcela/Prorrogar (`ParcelaPanel`, `ProrrogarPanel`) | Confirmação pontual valor/data e justificativa, sem simulação diária. |
| Editar dados gerais da nota (`DadosNotaPanel`) | Lacuna corrigida: confirmação agora lista campos alterados antes/depois com nomes e abrangência; não permite confirmar sem alteração. |
| Efetivar/Ajustar antigo (`EfetivarPanel` em `lancamentos.tsx`) | Não calcula fluxo diário; corrigida revisão para omitir parcelas mantidas. |
| Consultas (`Consultas.tsx`) | Abre gerenciamento compartilhado por referência; alternativa sem callback é somente consulta, sem gravação. |
| Dashboard (`dashboard.tsx`) | Gerenciamento abre o mesmo painel; cálculo diário restante é a consulta oficial do dashboard, preservada por escopo. |
| Confirmação/recuperação (`useOperationSave`, `store`, `operationSave`, `supplierOperation`) | Mesmo envio isolado, proteção local, IDs fixos, validação de dependências e aplicação por versão exata ou releitura. |
| Proteção local (`useFormDraft`, `draftStore`) | Separada por contexto; recuperação não restaura autorização anterior; armazenamento não foi limpo. |
| Servidor (`commitOps`, `getOfficial`, `listAudit`) | Autenticação/contexto/papel, antes/depois/dependências, comprovante canônico e auditoria. Nenhuma simulação diária. |
| Função SQL `commit_official` | Definição lida: controle de versão/idempotência, documento e `snapshot_before` na mesma transação; não alterada. |
| `commitOfficial` completo | Definição lida; não há chamador produtivo nos cadastros/lançamentos pesquisados. Não alterado. |
| `flowImpact` em `manageLaunch.ts` | Definição permanece, mas sem chamador nos componentes de revisão. Não roda nesses caminhos. |

Sem tarefa em segundo plano encontrada nesses caminhos; confirmação é iniciada pelo usuário. Pesquisa, exportação, filtros e menus não foram modificados.

Metas, Fluxo, Simulações e Relatório de despesas mantêm cálculos de consulta/projeção fora do escopo de cadastros/lançamentos. A busca de chamadas identificou o impacto na revisão de Metas; não foi removido porque o pedido limita a retirada aos cadastros/lançamentos. Não se afirma execução de todos esses módulos nesta conferência.

Validação adicional: 30 testes pertinentes passaram após as três correções; compilação automática OK. A conferência adicional foi por leitura e testes, não um novo percurso completo de navegador. Permanecem os limites da entrega anterior: banco hospedado não medido/testado por gravação real, medianas antes/depois por todos os cenários não obtidas, concorrência simultânea de duas abas não exercitada no navegador. A comparação fictícia de descrição de 12 MB permanece 5,29 → 2,03 segundos; nenhuma extrapolação para produção.

Nenhuma publicação, escrita real, migração, alteração de permissões ou modificação de registros já pagos/encerrados.