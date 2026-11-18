# Conferência complementar do salvamento

Regra: confirmar salva somente o pacote revisado; confirmação tardia não vira falha falsa, consultas não reenviam, rascunhos protegidos não são descartados e Salvo exige confirmação autoritativa.

## Inventário lido nesta rodada
| Lugar | Caminho / resultado |
|---|---|
| Planejada simples/múltiplas notas e Efetivado/Gerenciar | PlannedLaunchForm, ManageLaunchPanel, useOperationSave: confirmação compartilhada; descarte protegido também após resultado desconhecido |
| Novo lançamento, fornecedor/condição inline, notas, parcela, prorrogação, efetivação antiga | lancamentos, NotaPanel: mesmo pacote congelado; estados propagados para esses acessos; sem alterações financeiras ou vínculos inferidos |
| Fornecedor novo, edição, condição, vigência/inativação | referencias, FornecedorManager: mesma confirmação; consulta identificada após envio; fechamento/descarte não limpa preenchimento em confirmação |
| Pagamentos e estornos em Lançamentos/Gerenciar | BancoPanels e chamadores: salvamento compartilhado; estado propagado; registros já pagos/estornados não modificados |
| Recebimentos grade e recuperação | recebimentos, store: confirmação compartilhada; consulta legada agora tem limite de cinco segundos; rejected legado em UNKNOWN não barra reconciliação read-only |
| Fluxo vertical (Geral) | index: update local, revisão na página Recebimentos; nenhum outro envio independente |
| Barra global, recuperação, conflito, pacote exportável | AppShell/store: revisão única, confirmação compartilhada, pacote imutável somente leitura; consultas read-only limitadas |
| Bancos/contas/cartões/faturas/transferências/saldo | bancos: update local seguido da revisão global compartilhada; nenhum envio próprio; preservado sem converter o módulo para outro modelo |
| Metas | metas: revisão local seguida de update e barra global; envio final compartilha confirmação; cálculo de prévia mensal existente não alterado |
| Histórico | historico: recuperação apenas local, mensagem distingue rascunho de salvo; revisão global ou de Recebimentos |
| Dashboard e Consultas | dashboard/Consultas: encaminham Gerenciar para o mesmo painel; sem gravação própria |
| Relatório de despesas | despesas: somente leitura, não salva |
| Simulações | simulacoes e saveSimulationOperation/store: local, sem promoção/envio oficial |
| Servidor financeiro | official.functions: commitOps, commitOfficial, getOfficial, checkCommitRequest lidos; membership, idempotência, versão, confirmação e fallback preservados; commitOfficial não tem chamador no app |
| Banco | commit_official na migração e definição fornecida no contexto: versão + auditoria/snapshot_before na mesma transação; não alterado/executado nesta rodada |
| Tarefas em segundo plano | busca em src/scripts não encontrou cron/job financeiro; proteção de formulário/local e rascunhos no store lidas, não fazem escrita oficial |

## Evidências e limites
Testes fictícios executados: global/isolado (revisão/voltar, envio único/duplo clique, resposta perdida, offline, reload, conflito, edição durante envio, outra pendência); recuperação em nove estados sem escrita; resposta tardia de 21 segundos com revisão fechada e faixa removida. Teste do hook garante proteção e mesmo ID/captura em nova consulta. Outros acessos da tabela foram conferidos por leitura, não todos individualmente no navegador.

Medições anteriores mantidas: normalização/diff fictício ~12 MB mediana 118,0→58,2 ms; total percebido 2.086,2→2.048,0 ms, sem ganho perceptível integral comprovado. Incidente/pacote real e tempos do banco hospedado não comprovados; duas abas simultâneas/concorrência hospedada não testadas. SQL lido, não exercitado no banco. Nenhuma publicação, escrita financeira real, alteração de permissões/configurações ou limpeza do navegador ativo.