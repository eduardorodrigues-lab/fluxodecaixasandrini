# Lançamentos: consulta única — evidências e limites

## Arquivos
- `src/routes/lancamentos.tsx`: substitui as duas tabelas por Lançamentos; mantém Pagamentos, Consultas, PVA, formulários e operação isolada. Navegação antiga normalizada em filtros equivalentes.
- `src/components/UnifiedLaunchList.tsx`: Etapa primeira, filtros comuns, tabela única, seleção limitada às fontes efetivadas, totais por etapa e paginação.
- `src/components/LaunchFilters.tsx`: admite controle de Etapa e resumo separado sem modificar outros consumidores.
- `src/lib/unifiedLaunch.ts`: adapta fontes existentes, mantém índices de valores/filtros, chaves etapa+entidade+ID+parcela, saldo residual existente, CSV completo e seleção validada. Zero explícito persistido é mostrado mesmo quando o motor exclui a movimentação zero. Nenhuma alteração do motor.
- `src/lib/unifiedLaunch.test.ts`, `src/test/unifiedLaunchFixture.ts`, `scripts/e2e/lancamentos-unificados-isolado.py`: regressões e navegador exclusivamente sintéticos.
- `src/lib/AGENTS.md`, `docs/regras-fluxo.md`, `roadmap.md`: arquitetura, regras e conclusão.

## Testes executados
- Suíte completa `bunx vitest run --maxWorkers=2`: 64 arquivos aprovados, 1 opcional ignorado; **515 testes aprovados e 6 opcionais ignorados**. Primeira execução paralela teve dois timeouts de 5s nos testes grandes de transporte; repetição com menor concorrência aprovou todos sem alterar esses testes.
- Nove testes da consulta única: fontes e IDs homônimos; compras/despesas/etapas; remanescente parcial; cancelados/pagos; zeros/vazios; filtros/aliases/boleto/datas/ordenação; seleção de página e bloqueio de etapa errada; CSV completo; navegação antiga; nota remanescente com original/prorrogação; nenhuma mutação e igualdade do Fluxo.
- Navegador: oito grupos aprovados. 14 linhas mistas; filtros compartilhados e zero nas duas etapas; mesmas IDs em três entidades abrem formulários/capacidades corretos; edição existente revisada, salva somente em fixture e relida pela busca; 84 linhas em duas páginas/seleção somente efetivadas; seleção fora do filtro identificada; CSV de 84 linhas; lote revisado com bloqueios preservados; antigos caminhos/foco; acessos próprios; visualizador sem gravação; celular com filtro, tabela rolável e abertura correta.
- Regressão de inclusão direta: 17 verificações aprovadas (o bloco antigo de gerenciamento foi substituído pelo teste novo). Quatro tipos × uma/três parcelas, clique duplo/reload sintético, invalidez, fornecedor/condição atômicos, condição específica, recuperação de rascunho/ID salvo, falha/ACK perdido/atualização falhada e visualizador/celular. Sem segunda confirmação de inclusão.
- Capturas desktop, tabela e formulário no celular, revisão existente e revisão do lote conferidas visualmente. Sem erros inesperados na consulta; script de inclusão manteve oito avisos conhecidos de hidratação da fixture cliente.
- Compilação automática OK; nenhuma alteração de banco.

## Limites reais
- Todos os envios foram substituídos por persistência sintética; requisições externas/oficiais de escrita bloqueadas. Nenhum dado financeiro real, fornecedor real, migração, convite, publicação, reenvio ou navegador de usuário foi alterado.
- Permissões foram conferidas em fixture editor/viewer e no caminho existente de inclusão com owner; não houve ensaio hospedado de escrita/autorização/concorrência.
- A tabela conserva todas as colunas, com rolagem horizontal no desktop/celular. Campo inaplicável aparece como traço. Seleção em massa de planejamento é intencionalmente bloqueada; sua gestão continua individual.
- Propostas anteriores de banco/fila de salvamento e unificação real de fornecedores continuam aguardando as aprovações específicas já registradas; não fazem parte desta mudança.