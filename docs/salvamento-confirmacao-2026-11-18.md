# Revisão e confirmação — 18/11/2026, solicitação 14:55 UTC

## Causas comprovadas por código e execução fictícia
- `AppShell` chamava `commitDraft` diretamente, sem revisão. `runCommitDraft` enviava todas as pendências não recebimentos, repetia escrita em `retry` e aguardava invalidação/releitura global antes de encerrar `saving`. A grade de Recebimentos já revisava isoladamente; essa implementação anterior não cobria os demais acessos globais.
- `runSaveOperation` também aguardava resposta/releitura sem limite. Operação persistida não distinguia envio, resultado desconhecido, conflito e confirmação com atualização pendente. A faixa repetia `saveOperation` como escrita; a consulta read-only anterior era restrita a requestIds legados de Recebimentos.
- Ficticiamente reproduzidos: resposta perdida depois de confirmar, rede indisponível, recuperação após recarga e conflito explícito. Não foi reproduzido o incidente hospedado dos prints; nenhum erro/lentidão do banco real foi presumido.

## Correções
- Salvar global captura revisão humana de alterações reais antes do envio, incluindo inclusões/exclusões, cancelamento/estorno, notas/pedido/data e valores monetários. Voltar não envia. Recebimentos continuam isolados; sem confirmação dupla ou cálculo diário.
- Global e isolado compartilham proteção/commit/reconciliação. Pacote, requestId, revisão identificada e pendências capturadas ficam no IndexedDB existente. `Ver alterações` lê captura; não escreve. Retry de formulário também prefere o pacote armazenado, nunca um payload posterior.
- Estados: revisando, enviando, aguardando confirmação, confirmado com atualização pendente, conflito, recusa recuperável e resultado desconhecido. Timeout de envio 20s; até três consultas read-only com pausas 0/1/3s e limite 5s por consulta. Nenhuma escrita repetida automaticamente, inclusive resposta `retry` por disputa.
- Confirmação protegida antes da atualização. Receipt canônico só em versão/contexto exatos; fallback de releitura limitado. Confirmação perdida consulta requestId original; ausência não autoriza reenvio/descarte. Recusa/conflito explícitos permitem nova revisão. Edição durante envio preservada por rebase; pendências independentes não entram no pacote.
- Erro na consulta de idempotência do servidor bloqueia nova escrita. Diagnóstico mínimo: medidas numéricas existentes e código do erro do RPC, sem payload/nomes/valores financeiros em logs.
- Não alterados SQL/schema, auditoria, snapshot_before, regras financeiras, filtros, pesquisa ou layout geral; sem importação/publicação/dados reais.

## Evidências executadas
- 49 testes em 6 arquivos: saveRecovery (5), operationSave (10), receiptOperation (9), supplierOperation (7), commitReceipt (4), effectivationBatch (14). Cobrem limite de espera/confirmação tardia, leituras limitadas/offline, zero versus vazio, captura imutável, conflito, dependências e rebase das edições posteriores.
- `scripts/e2e/save-confirmation-isolado.py`: Chromium 1280×1800, sessão restaurada em contexto novo; todas funções do servidor interceptadas, dados exclusivamente fictícios. Nenhuma chamada inesperada ou erro de página.
- Global: revisão→voltar sem envio; duplo clique confirma uma única vez; servidor fictício confirma e perde resposta, consulta read-only recupera; recebimento independente continua pendente.
- Offline: uma tentativa de escrita, resultado desconhecido após leituras limitadas; pacote exato visível e liberação desabilitada. Recarga apenas no navegador de teste; confirmação tardia no servidor fictício reconciliada por leitura com requestId original, sem nova escrita.
- Isolado: revisar/voltar, confirmar recebimento; edição de 123,45 para 200,00 durante envio de 3s fica pendente, servidor fictício mantém apenas 123,45 confirmado.
- Conflito: resposta explícita, pacote visível, liberar/selecionar versão/nova revisão/voltar sem envio. Total: 4 tentativas fictícias de escrita, 2 confirmações, 1 queda antes da escrita e 1 conflito; zero chamadas inesperadas, zero erros de página.
- Capturas inspecionadas da revisão global e pacote desconhecido: antes/depois identificados, sem IDs raw.

## Limitações reais
- Incidente hospedado e tempo do banco não comprovados; sem gravações reais autorizadas.
- Sem novo benchmark de volume ou comparação de performance; a garantia verificada é ausência de download obrigatório no caminho canônico e espera limitada nos caminhos excepcionais, não ganho de segundos no banco.
- Duas abas simultâneas, falhas reais de IndexedDB, todos os módulos globais individualmente e login completo não exercitados nesta rodada. Locks/escopos conferidos por código; comportamento comum exercitado em global e isolado.
- Pendência muito antiga produzida pelo caminho global antes de existir pacote persistido pode ter somente requestId e rascunho editável, sem prova do payload enviado. Auditoria confirmada pode reconciliar por ID; ausência não distingue "nunca enviado" de "ainda em andamento". Não é possível reconstruir pacote histórico exato nem provar resultado hospedado desse caso com os dados disponíveis; abertura de nova revisão bloqueada conservadoramente quando IDs legados não têm confirmação encontrada, sem apagar valores. Novos rascunhos recebem marcador do modelo revisado para não serem confundidos com esses legados. Nenhum snapshot é restaurado.

## Varredura adicional dos acessos — leitura nesta continuação
Regra: antes de enviar, mostrar o que será alterado; só informar salvo após confirmação; pacote desconhecido não vira novo envio nem descarte, preservando outras pendências.

| Acesso lido | Situação |
|---|---|
| Barra global / AppShell / commitDraft | Revisão antes de envio, pacote protegido, resultado explícito; exercitado em navegador fictício. |
| Recebimentos: grade, novo, contas, residual e exclusão | Alterações locais; revisão isolada compartilhada; navegador fictício cobriu Geral, envio/recuperação. |
| Fluxo vertical, Histórico/restauração | `update()` cria rascunho; segue revisão Recebimentos/global; não afirma gravação imediata. |
| Novo fornecedor / Gerenciar fornecedor e condições | Revisão própria e `useOperationSave`; compartilha limite e recuperação. Conferido por leitura, não repetido no navegador nesta continuação. |
| Novo Planejado/Efetivado / NovaNota / notas múltiplas | Revisão própria, confirmação via `useOperationSave`; limpeza do formulário só após sucesso. |
| Editar planejamento / efetivação seletiva / Gerenciar | Revisões próprias antes/depois; mesmo serviço protegido; sem efeito diário. |
| Parcela / dados da nota / prorrogação / efetivação antiga | Revisões pontuais, mesma confirmação protegida. |
| Pagamentos e estornos em Lançamentos / Gerenciar | Pagamento tem revisão; estorno solicita motivo/decisão antes de operação isolada. Usa mesma proteção e confirmação; nenhum pagamento existente modificado nesta rodada. |
| Bancos: contas, cartões, transferências, faturas, saldos | Caminhos `update()` continuam rascunho/global; agora recebem revisão global antes da gravação. Não alterada regra bancária. |
| Metas / categorias / plataformas / conta padrão | Confirmações locais criam rascunho; envio pelo global revisado. Mantidas telas/regras, sem efeito diário na revisão global. |
| Consultas / Dashboard / PVA | Consulta ou abre gerenciamento compartilhado; não há commit próprio alternativo. |
| Inline fornecedor/condição | Apenas formulário local; entra no lançamento revisado. |
| Simulações | Local, não promovida nem enviada ao banco; regra de confirmação financeira oficial não se aplica. |
| useOperationSave / supplierOperation / operationSave | RequestId estável, pendências seletivas, retry passa pelo pacote armazenado e consulta read-only; payload não regenerado. |
| draftStore / store recuperação | Chaves existentes por usuário/org, pacote protegido; não limpa armazenamento global. Legado sem captura/resultado conhecido permanece bloqueado. |
| getOfficial / listAudit / checkCommitRequest / commitOps | Autenticação e membership; antes/depois/dependências; consulta idempotente falha fechada; patch versionado. |
| commitOfficial antigo | Sem chamador encontrado; servidor valida papel/versão. Nenhum novo acesso criado. |
| SQL commit_official (migração 0000) | Lock, membership editor/owner, versão e requestId duplicado, audit_log com snapshot_before; definição lida, inalterada. |
| Processos automáticos/importação | Busca por cron/schedule/commitOps/commitOfficial não encontrou job automático financeiro; importadores sem envio automático. Não importada planilha. |

Esta varredura é leitura, não execução individual de cada formulário. Mantidos os limites acima: causa hospedada, duas abas simultâneas, armazenamento real e legado sem captura não comprovados. Nenhuma mutação de registros liquidados/enviados/encerrados ou de permissões/configurações.
