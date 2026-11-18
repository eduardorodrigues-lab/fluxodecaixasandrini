# Salvamento focado — evidências de 18/11/2026

## Implementado
- Removido cálculo `flowImpact` (2025–2030) da preparação e da revisão de planejamento/efetivado/efetivação. Fluxo oficial e auditoria não alterados.
- Revisões mostram parcelas alteradas/novas/canceladas, escopo compartilhado e dados antes/depois com nomes, em vez de IDs de fornecedor/subgrupo.
- Preparação com compartilhamento estrutural; cópias limitadas de condição/histórico continuam independentes. Removida normalização duplicada do servidor na checagem de dependências.
- Resposta do commit inclui transição canônica normalizada, digest e versão/contexto. Aplica somente à versão de origem exata; no restante relê. Duplicate/retry confirmado relê, sem reutilizar a operação solicitada como suposta prova do estado persistido.
- O contrato SQL foi confirmado por leitura da definição hospedada: grava exatamente `_data` com controle de versão e snapshot anterior na mesma transação. Nenhuma mudança SQL/schema/dado oficial nesta rodada.
- Medidas numéricas de preparação/confirmacão/reconciliação disponíveis em `performance` (`sandrini.save.*`), sem registrar dados financeiros ou identidades.

## Comparação de navegador realmente executada
Servidor interceptado e fictício; Chromium, 1366×900, mesma amostra sintética de **12.012.070 bytes**, 9.000 planejamentos. Três repetições antes e três depois, alteração apenas da descrição de um planejamento.

| Medição | Antes (ms) | Depois (ms) | Mediana antes → depois |
|---|---|---|---|
| Clique revisar → confirmação disponível | 564,1 / 599,6 / 633,7 | 141,3 / 171,8 / 216,6 | 599,6 → 171,8 |
| Clique confirmar → formulário fechado | 6053,4 / 5244,6 / 5291,1 | 1791,3 / 2180,7 / 2026,1 | 5291,1 → 2026,1 |
| Releituras completas após confirmação | 1 / 1 / 1 | 0 / 0 / 0 | 1 → 0 |

Redução observada de aproximadamente **62% no tempo de salvar**, somente nesse cenário fictício. Não é benchmark do banco hospedado.

Etapas internas depois (medianas): preparar envio **14,5 ms**; confirmação fictícia **345,4 ms**; reconciliar/cache/proteção local **1201,9 ms**. Os tempos de clique também incluem espera do navegador e renderização. Antes não havia instrumentação interna por etapa; não se inventou esse breakdown retroativamente.

## Percursos adicionais realmente executados
- Amostra sintética de 11,8 MB: fornecedor dedicado → condição → confirmar → reload → novo efetivado → gerar parcelas → alterar manualmente vencimento/prorrogação → confirmar → reload.
- Inline planejado → reload preserva preenchimento → falha antes de commit → retry → salva fornecedor e lançamento juntos, datas preservadas.
- Doze parcelas de **R$ 263,20 = R$ 3.158,40**, datas manuais e prorrogação: revisão em 1366/1920, última parcela e rodapé legíveis; recarga confirma títulos, valores e datas no servidor fictício.
- Três execuções adicionais com 12 parcelas: normal (564,6 ms), perda de resposta após commit + retry (3423,3 ms), digest incompleto + releitura (2358,9 ms). São cenários de falha diferentes, portanto **não** foi calculada uma mediana comparativa entre eles. Resultado: 36 títulos, três commits, sem duplicação, sem falhas de execução.
- Papéis owner/editor/viewer/sem acesso verificados com respostas fictícias, nunca escrita real.

## Testes automatizados
96 testes distintos pertinentes passaram nas execuções focadas (alguns repetidos somente após mudanças): operação isolada, conflito mesmo registro, alterações distintas, pendências independentes, retry após commit, condições, parcelas, preparação com Immer, comprovante canônico, versão atrasada/incompatível, contexto trocado, patch corrompido, efetivação seletiva e preservação de identidade/histórico. Compilação automática passou.

## Limites reais
- Ainda há leitura e normalização integral no servidor, regravação do JSON e snapshot integral na auditoria: custos preservados por exigência. Banco/RPC hospedados **não medidos**; nenhuma gravação real autorizada.
- A atualização da lista ampla ainda consome tempo de apresentação (~1,2 s na amostra com 18.000 parcelas). Pesquisa/layout não foram redesenhados.
- Não houve três medições comparáveis antes/depois para cada cenário (novo planejado, novo efetivado, valor/data, fornecedor/condição e inline): comparação completa só para descrição. Os demais têm verificação funcional fictícia, não benchmark de melhoria.
- Duas abas com escrita simultânea/mesmo registro e resposta antiga não foram exercitadas no navegador desta rodada; regras de conflito/versão/pendências foram verificadas em testes puros. Persistência/histórico hospedados não testados por escrita real.
- A proteção local existente não foi limpa, mas não é possível inspecionar nem garantir retrospectivamente a memória de abas reais de Letícia/Eduardo. Não houve acesso aos seus rascunhos reais.
- Não publicado. Não removidos snapshots nem alterados dados, SQL ou permissões hospedadas.