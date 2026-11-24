# Proposta — itens 2 (salvar uma vez) e 3 (desempenho) · 24/11/2026

**Situação: proposta. Nenhuma migração ou alteração de banco foi aplicada. Aguarda aprovação específica de Eduardo.**

## 1. Como é hoje (medido / lido no código)
- Base oficial: um documento JSONB por organização em `official_data` (~15,3 MB na v189+).
- `commitOps` (src/lib/official.functions.ts) já recebe só as operações (ops) do navegador, mas no servidor: lê o documento inteiro (`readOfficialDoc`), aplica as ops (`prepareCommit`), e chama `commit_official` com o **documento inteiro** (`_data`).
- `commit_official` (drizzle/migrations/0000) trava a linha, confere versão, regrava **15,3 MB em `official_data`** e grava **mais 15,3 MB em `audit_log.snapshot_before`**.
- Medições registradas (investigação de 24/11, logs do servidor): leitura 11–14 s; gravação 10–14 s; total 22–28 s. Limite de espera do navegador: 20 s (`saveRecovery.ts`). Por isso o envio "fb872b9f" virou resultado desconhecido.
- Fixture local ~12 MB (18/11): preparar envio 14,5 ms; reconciliar/cache 1,2 s. Banco hospedado não foi medido por etapa sob carga.

## 2. Mudanças propostas no banco (aguardam aprovação)
Migração aditiva, sem DROP, sem mudar dados existentes:
1. **`official_records`** (org_id, entity, record_id, data jsonb, version_changed, primary key (org_id, entity, record_id)) — um registro financeiro por linha (planejado, efetivado, despesa, pagamento, recebimento, fornecedor, conta…). RLS: leitura só para membros da organização (`is_org_member`); nenhuma escrita direta de clientes; GRANT select para authenticated, all para service_role.
2. **`commit_ops(_org, _user, _email, _expected, _request, _summary, _ops jsonb, _deps jsonb)`** (security definer, só service_role): re-confere papel owner/editor, trava a linha de versão da organização, confere `_expected`, aplica somente os registros alterados (insert/update/marca de exclusão), grava a auditoria com **antes/depois apenas dos registros alterados** (`changes`) e incrementa versão. `request_id` único continua garantindo idempotência.
3. **Período de transição (dupla escrita)**: `official_data.data` continua sendo atualizado a partir das linhas por um passo de servidor, só enquanto houver telas lendo o documento único. Nesse período **ainda se regrava o JSONB inteiro** — o ganho vem só depois do passo 4.
4. Corte: leitura passa a montar a base a partir de `official_records` (ou de um cache por versão); `official_data.data` fica congelado como cópia de segurança (comentado como DEPRECATED, não apagado).
5. `snapshot_before` completo deixa de ser gravado a cada envio; passa a ser gravado um **ponto de recuperação completo** por dia/por N versões (tabela `official_checkpoints`), mais os antes/depois por registro em cada auditoria. Recuperação de qualquer versão = checkpoint + reaplicação das auditorias seguintes. Snapshots já gravados ficam intactos.

Limites: a primeira carga após o login ainda precisa trazer a base inteira (~15 MB comprimido no transporte) até que as telas leiam por período/entidade, o que é uma etapa posterior não incluída aqui.

## 3. Mudanças de código (sem banco, podem começar após aprovação do plano)
- **Resultado desconhecido** (`src/lib/store.tsx`, `saveRecovery.ts`, `recoveryActions.ts`): consulta automática pelo `requestId` com recuo (5 s, 15 s, 45 s, 2 min) até a auditoria confirmar ou o servidor responder "não gravado"; operação confirmada nunca volta como "não salva" (ACK por `request_id` é a fonte de verdade). Tempo de espera do navegador ajustado ao tempo medido do servidor após a mudança, não antes.
- **Fila independente**: um pacote em estado desconhecido bloqueia apenas operações que tocam os mesmos registros (dependências já capturadas em `ReviewedOperation.dependencies`); operações sem interseção seguem com seu próprio `requestId`. Conflito no mesmo registro continua bloqueado; nada sobrescreve sem rebase explícito (`rejectedRetry.ts`).
- **Confirmação única nos módulos ainda em `update()`**: Metas, Categorias, Ajustes de saldo, Plataformas/contas padrão, Observações de pagamento, edição de linha do Fluxo — cada um gera uma operação revisada (`saveOperation`) como Bancos/Lançamentos já fazem.
- Autorização: `myOrg` + papel por operação continua no servidor antes do service_role; `commit_ops` repete a checagem no SQL.

## 4. O que falta medir (antes de qualquer promessa)
- Tempo por etapa no banco hospedado: leitura, preparo, `commit_ops`, auditoria, releitura — antes e depois, com o mesmo pacote sintético em organização de teste.
- Tamanho real de `changes` por operação típica (1 parcela, 12 parcelas, lote de 50).
- Comportamento com dois editores simultâneos em máquinas separadas.

## 5. Critérios de aceite
- Uma alteração de 1 parcela grava apenas os registros alterados (+ auditoria) — verificado por contagem de bytes escritos.
- Mediana de confirmação no banco hospedado abaixo do limite de espera do navegador com margem, medida em 10 execuções; sem número prometido antes da medição.
- Zero envios confirmados exibidos como "não salvo" em testes de resposta perdida/tardia.
- Dois editores alterando registros diferentes salvam sem bloqueio; mesmo registro gera conflito revisável.
- Reconstrução de uma versão a partir de checkpoint + auditorias igual (hash) ao documento original.
- Fluxo de 2.191 dias idêntico antes/depois da migração.

## 6. Recuperação / rollback
- Migração aditiva; a leitura pode voltar ao `official_data` enquanto a dupla escrita estiver ativa.
- Backup completo com hash antes do corte; corte em janela de pausa combinada.
