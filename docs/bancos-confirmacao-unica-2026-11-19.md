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