# Conferência do erro 500 nas leituras

Regra: histórico, dados e confirmações devem chegar completos; o tamanho da resposta não pode eliminar registros ou produzir uma confirmação falsa.

## Inventário conferido por leitura de código

| Local | Caminho | Resultado |
|---|---|---|
| Histórico/Auditoria, atualizar, recarregar, exportar e imprimir | `historico.tsx` → `useAuditHistory` → `listAudit` | Resposta completa comprimida; exportação/impressão usam os mesmos registros decodificados. Navegador real conferido. |
| Lançamentos: filtros por data de cadastro/alteração | `lancamentos.tsx` → `useAuditHistory` | Usa a mesma leitura corrigida; não há segunda consulta independente. |
| Gerenciar efetivado: histórico e datas | `ManageLaunchPanel.tsx` → `useAuditHistory` | Usa a mesma leitura corrigida. |
| Gerenciar planejada: histórico | `PlannedLaunchForm.tsx` → `useAuditHistory` | Usa a mesma leitura corrigida. |
| Meta de Faturamento: histórico mensal | `metas.tsx` → `useAuditHistory` | Usa a mesma leitura corrigida. |
| Fluxo, Dashboard, Lançamentos/Consultas/PVA, Despesas, Recebimentos, Bancos, Cadastros, Metas e Simulações | Todas consomem `useApp` → `getOfficial` | JSON integral também era vulnerável ao crescimento; comprimido no transporte e decodificado antes dos consumidores existentes. |
| Abrir app, atualização após salvar, nova tentativa após conflito | `store.tsx` → `getOfficial` | Todos passam pelo mesmo adaptador, preservando versão e dados. |
| Consultar resultado, recuperação automática, pacote após recarga, rascunho legado/recebimentos | `store.tsx` → `checkCommitRequest` | Alterações de uma substituição também podiam exceder o limite; comprimidas e restauradas integralmente, mantendo ausência `null` e versão confirmada. |
| Confirmar operação: conflito e recibo canônico | `commitOps` → `store.tsx` | Conteúdo grande comprimido somente na resposta; decodificado antes da revisão e validação do digest original. |
| Confirmação global/importação | `commitOfficial` | Retorna somente status, versão e resumo; não retorna base nem snapshot. Sem alteração. |
| Equipe, log de acesso, informações/aceite/cadastro por convite, login | `team.functions.ts`, `equipe.tsx`, `convite.tsx`, `auth.tsx` | Respostas de metadados sem documento financeiro nem alterações integrais; log de acesso limitado a 100. Nenhuma alteração de permissão ou convite. |
| Funções SQL | Migrações `0000` a `0004`: `commit_official`, `team_*`, consultas de membership | Commit retorna status/versão; snapshot permanece armazenado. Equipe retorna metadados. Nenhuma migração executada ou regra alterada. |
| Simulações, formulários e rascunhos locais | `store.tsx`, arquivos de recuperação | Não atravessam a resposta RPC até envio explícito. Formato local e preenchimento preservados. |
| Importadores/scripts e tarefas agendadas | Busca em `scripts` e `src` | Scripts financeiros usam adaptadores locais/consulta própria; nenhum outro consumidor direto das funções corrigidas encontrado. Nenhuma tarefa agendada financeira definida nesses arquivos. Configuração hospedada de tarefas não consultada. |

## Provas e limites

- Histórico real lido com a sessão de Eduardo: HTTP 200, resposta ~2,16 MB, 24.889 linhas renderizadas; atualizar/recarregar sem erro de execução.
- Leitura da base real passou pelo novo adaptador ao abrir o Histórico.
- Bancos, Lançamentos e Meta de Faturamento abertos com sessão de Eduardo: três leituras HTTP 200 (~1,63 MB cada), sem erros de execução.
- Regressão completa: 444 testes aprovados; seis testes opcionais de candidato não executados. Compilação automática OK.
- Casos sintéticos cobrem JSON acima de 32 MiB, preservação de IDs/zeros/Unicode/versões, confirmação ausente, conflitos completos, digest canônico e formatos locais anteriores.
- Nenhuma escrita financeira, reimportação, alteração de registro liquidado, mudança de acesso ou publicação.
- Confirmação real grande, falha/retry real e concorrência multiusuário não executados: exigiriam gravação financeira. Produção publicada não conferida; correção somente no código/preview.
- Proteção não promete volume ilimitado: memória e limites do ambiente continuam existindo. Histórico conserva o escopo atual das últimas 200 confirmações, sem truncar alterações dentro delas.