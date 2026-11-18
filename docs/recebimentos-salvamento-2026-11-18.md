# Recebimentos — salvamento isolado, 18/11/2026

## Causa comprovada por leitura
- `recebimentos.tsx` acionava `update()` na grade, contas, descrição e inclusão/exclusão, criando pendências locais; Geral na visão vertical do Fluxo fazia o mesmo.
- A página não tinha revisão/commit próprio. `store.commitDraft()` enviava o conjunto global e invalidava todas consultas oficiais após confirmação, obrigando releitura integral; o caminho seguro/canônico já disponível em `saveOperation()` não era usado.
- Isso explica o segundo Salvar global e trabalho adicional. Não comprova travamento específico da aba de um usuário; essa aba não foi acessada.

## Corrigido
- Revisão única de Recebimentos: data/origem/campo, antes/depois; confirmação somente dos recebimentos capturados. Dados gerais e financeiras originais preservados.
- Mesmo rascunho e persistência existentes, sem limpar storage ou transplantar organizações. Recuperação por ID, leitura de auditoria para requestId antigo, guardas para operação desconhecida, retry idempotente e reabertura.
- Cache só após confirmação canônica e versão exata, reutilizando estratégia anterior; releitura em exceções. Pendências de outros módulos intactas, Salvar global não inclui Recebimentos. Locks do navegador cobrem confirmação isolada e global.
- Conflito conserva valores; liberação somente da operação rejeitada permite comparação explícita e nova revisão.

## Testes executados
- Vitest: **43 testes passaram em seis arquivos**, nove novos de recebimentos (único/múltiplas datas, zero/vazio, data obrigatória, voltar sem mutation, conflito, pendência independente, edição posterior ao envio, dependências, retry e resposta canônica), mais regressões de operação isolada, recibo canônico, patches, migração de plataformas e fornecedores. Compilação automática OK.
- Playwright, conta autenticada com todas funções do servidor interceptadas, documento **12.264.639 bytes, inteiramente fictício**: recuperação de pendência legada + fornecedor independente; duas datas e zero; revisar/voltar/confirmar/reabrir; perda da resposta após commit fictício + reload/retry mesmo ID; conflito/solução/nova revisão; requestId legado já confirmado reconciliado por leitura sem novo commit; novo registro zero; acesso pelo Fluxo à mesma revisão.
- Capturas da revisão em 1366, 1920 e 390; celular exige recolher menu existente. Nenhum erro de execução; zero chamadas não previstas encaminhadas, quatro gravações somente no servidor fictício.

## Medição executada, não estimativa nem banco real
Uma execução final de alteração de duas datas no documento fictício ~12 MB, resposta interceptada com **50 ms de atraso artificial**:
- preparação: 1,1 ms; confirmação fictícia: 93,3 ms; reconciliação local: 77,6 ms;
- clique de confirmação até fechamento da revisão: 339 ms;
- **zero downloads integrais adicionais** no caminho de resposta canônica compatível.
Não é benchmark do banco hospedado e não mede SQL, rede de produção ou ganho antes/depois. Retry/duplicata relê integralmente por segurança, conforme contrato anterior.

## Limites reais
- Sem gravação financeira hospedada: tempos do banco, auditoria real, permissões reais e concorrência hospedada não testados nesta rodada.
- Duas abas simultâneas, ausência de Web Locks, falha/cota de IndexedDB e todos os cenários de mudança de usuário durante envio não exercitados no navegador. Guardas verificadas por leitura; conflitos concorrentes com servidor fictício e funções puras.
- Recuperação só pode conferir requestIds ainda presentes na persistência anterior; não recupera identificadores já perdidos antes deste ajuste. O formato global antigo não guardava payload de envio separado. Outra versão já aberta do app mantém seu próprio código até sua atualização normal; nenhuma aba de usuário foi recarregada por este trabalho.
- O rascunho global existente usa IndexedDB e debounce de 300 ms; não promete recuperação se armazenamento for apagado nem preservação de digitação ainda não persistida após fechamento abrupto. Simulação conserva o comportamento local vigente.

Nada publicado, nenhum dado real lido para o teste ou gravado, nenhuma mudança de schema/membership/snapshot.