# Bancos — confirmação única (19/11/2026)

## Causa comprovada por leitura e reprodução sintética
`src/routes/bancos.tsx` usava `act → update()` e `done → fechar`. A confirmação do formulário apenas criava um rascunho global; não chamava `saveOperation` e não existia ACK bancário nesse caminho. Portanto a faixa e o segundo Salvar eram consequência direta desse contrato, não evidência de conta já gravada nem consequência da substituição.

Também havia um defeito compartilhado: o store clonava o pacote capturado, mas devolvia o resultado ao formulário a partir da referência anterior. Em falha pós-ACK, isso podia perder o reconhecimento no formulário. Agora o retorno usa o pacote efetivamente acompanhado.

## Alterações
- `src/routes/bancos.tsx`: revisão antes/depois isolada para conta, edição/inativação, cartão, transferência/estorno, compras/cobertura/fatura e configuração/transição de saldo. Nenhum `update` global na página. Conta tem proteção local por usuário/organização/modo/geração e ID estável; Voltar preserva formulário montado. Cancelar/X sem edição fecha imediatamente; edição oferece manter/descartar/continuar. Apenas ACK remove a cópia local da conta.
- `src/lib/bankOperation.ts`: recupera pendência de conta somente por ID explicitamente revisado; não recupera outros módulos nem assume que já foi gravada. Pendências com envio legado não esclarecido ficam bloqueadas, sem descarte ou reenvio silencioso.
- `src/components/useOperationSave.ts`: aceita pacote já revisado, reutilizando captura, IDs/requestId, isolamento, idempotência e resposta autoritativa existentes.
- `src/lib/operationSave.ts`: transferências dependem das duas contas; transição de saldo captura contas e movimentos realizados (sem simulação diária). Mudanças concorrentes nessas dependências bloqueiam a confirmação.
- `src/lib/store.tsx`: ACK é devolvido ao formulário mesmo se atualização falhar; bloqueia novo pacote diante de envio legado não esclarecido.

## Validação executada
- Suíte automática: 414 testes passaram, 6 testes de candidato financeiro externo foram ignorados por ausência da variável de fixture. Teste adicional de contexto alheio executado na rodada final.
- Playwright 1280×1800, funções do servidor inteiramente interceptadas: criar → revisar → confirmar uma vez → editar → reabrir/reload; ausência da pendência da mesma operação; última tecla/manter/descartar; ACK perdido recuperado só por leitura; ACK com falha de atualização fecha e mostra atualização pendente; inativar/reativar; cartão; conta legada + conta e fornecedor independentes preservados; falha antes da gravação e retry explícito com mesmo requestId; transferência R$1 sem duplicação.
- 10 gravações exclusivamente em memória fictícia, nenhum erro de página. Capturas em `/tmp/browser/bancos-confirmacao/`; script reproduzível em `scripts/e2e/bancos-confirmacao-unica.py`.
- Autenticação, membership, owner/editor e rejeição de viewer continuam no `commitOps` existente e no RPC auditado, sem mudança de RLS ou cliente administrativo. Regressões de papéis/contexto executadas; isso não representa teste de escrita hospedada.

## Limites reais
Nenhuma conta real foi enviada, nenhum storage do usuário foi limpo, nenhum navegador do usuário recarregado, nenhum dado oficial/auditoria/acesso/importação alterado e nenhuma publicação. Concorrência hospedada entre usuários e indisponibilidade real do armazenamento não foram testadas. Compras/cobertura/faturas e transição de saldo usam o mesmo contrato mas não foram percorridas individualmente nesta rodada de navegador; regras bancárias cobertas pelos testes puros existentes. O draft real já preenchido depende de revisão explícita da equipe em Bancos, não foi salvo pela assistente.

## Conferência complementar por caminho
Regra: confirmar uma operação grava somente ela, sem segundo Salvar e sem apagar outras pendências. O pedido original limita alterações a Bancos e ao contrato compartilhado; os demais módulos abaixo foram inspecionados, não migrados sem autorização.

| Local inspecionado agora | Resultado por leitura de código |
|---|---|
| Bancos: criar/editar/inativar/reativar conta e recuperação legada | `act → bankOperation → useOperationSave`; segue confirmação isolada. Navegador fictício executado novamente. |
| Bancos: cartão, transferência e estorno | Mesmo caminho; cartão/transferência executados no navegador. Estorno lido, não executado nesta rodada. |
| Bancos: compra no cartão, cobertura de título, fechar/reabrir fatura, estorno no cartão | Todos chamam `act/done` isolado; código lido. Não percorridos individualmente no navegador. Nenhuma fatura paga foi alterada. |
| Bancos: origem do saldo, transição para contas e retorno à origem | Havia uma decisão anterior à revisão compartilhada (confirmação duplicada); removida. Origem executada em navegador: R$1→R$0, uma revisão/uma gravação fictícia de parâmetros. Transição/retorno apenas lidos, regras puras testadas. |
| Bancos: X da revisão e consultar resultado | X passa pelo bloqueio de pacote em andamento; consulta prossegue reconhecimento no formulário, nunca novo pacote. Retry e ACKs executados no navegador. |
| Lançamentos/Gerenciar: pagamento por contas/cartão e estorno | `saveMutation/save` isolado, não `update`; segue contrato por leitura dos chamadores e de `PagamentoPanel`/`BaixasList`. Não executado nesta rodada de navegador. |
| Fornecedores/condições | Cadastro e `FornecedorManager` chamam `saveMutation`; seguem contrato por leitura. |
| Recebimentos: revisão dos registros | `prepareReceiptOperation → saveOperation`; reconhece ACK mesmo com erro de atualização. Código lido. |
| Recebimentos: contas do recebimento/conta padrão e plataformas | Conta do recebimento é edição de rascunho, salva pela revisão de Recebimentos; conta padrão e outras confirmações de plataforma usam `act → update`, exigem salvar depois. Afetado fora do escopo de Bancos; não alterado. |
| Fluxo: ajustes manuais de saldo | `SaldoAdjustments` confirma e chama `update`, exige segundo Salvar. Afetado fora do escopo; não alterado. Entrada Geral inline é rascunho, não confirmação de gravação. |
| Metas | `Confirmar metas → update`, fecha revisão e exige Salvar global. Afetado fora do escopo; não alterado. |
| Consultas/Pagamentos do Dia: observação | Confirma observação e chama `update`, exige segundo Salvar. Afetado fora do escopo; não alterado. Não tocamos pagamentos já liquidados. |
| Cadastros: categorias/subgrupos | Edição inline usa `update`; rascunho global, sem confirmação própria de gravação. Não alterado. |
| Histórico: restaurar exclusão | Explicitamente informa recuperação apenas em rascunho; não promete gravação. Código lido, sem restauração executada. |
| Simulações | Operações locais/histórico próprio; `useOperationSave` usa `saveSimulationOperation`, não envia ao real. Código lido. |
| Dashboard/Relatório de despesas/Extrato | Consultas sem gravação própria; código lido. |
| Store: proteção, reconhecimento, releitura e segundo plano | Código lido: captura isolada; remoção apenas por `rebasePending`; consulta automática só leitura, uma por requestId; reenvio apenas explícito. Sem job periódico financeiro encontrado na busca do código. |
| Servidor `commitOps`/`commitOfficial`, `checkCommitRequest`, `getOfficial` | Código lido: membership/org explícita, owner/editor, dependências/conflitos, reconhecimento auditado; consulta não grava. Não chamados com escrita real. |
| SQL `commit_official` | Migração local lida: bloqueio de linha, versão, auditoria/snapshot e privilégio apenas servidor; definição hospedada atual não relida nesta rodada. Sem alteração SQL/permissões. |

Resultado complementar: 37 testes pertinentes passaram; navegador fictício executou 11 commits em memória, zero erros de página. Build mais recente: OK. Captura final mostra a faixa somente porque as pendências independentes de conta/fornecedor foram deliberadamente preservadas; a operação de saldo já está salva. Não foi feita validação hospedada de concorrência, indisponibilidade de storage ou escrita real. Equipe/login/convites e importação/substituição são contratos fora desta correção e não foram reexecutados nem alterados.