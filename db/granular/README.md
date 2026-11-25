# Persistência granular — pacote para aprovação (NÃO aplicado)

Estado: esquema, funções, adaptador e testes prontos e executados **somente em banco isolado** (PGlite em processo).
Nada foi aplicado ao banco do projeto; a base ativa continua no documento único `official_data`.

## Arquivos
- `001_schema.sql` — tabelas `fin_*` (uma por entidade: fornecedores, categorias, previsões, efetivados, despesas, efetivações,
  pagamentos, recebimentos, contas, cartões, operações de cartão, transferências, ajustes, importações, metas, configurações
  mensais, parâmetros, plataformas), `fin_operations` (org+requestId+identidade do conteúdo), `fin_audit` (evento por registro),
  `fin_org_state` (modo `document`/`frozen`/`granular` = chave do corte), funções `fin_commit`, `fin_import_document`, `fin_export_document`.
- `test-stubs.sql` — mínimo do esquema já existente, só para o banco de teste.
- `src/lib/granular/adapter.ts` — gravação (`commitGranular`), leitura incremental (`readDelta`/`applyDelta`).
- `src/lib/granular/granular.test.ts` — testes de comportamento; `scripts/granular-bench.ts` — medição isolada.

## Regras preservadas
- Cada registro guarda o corpo integral (condições nomeadas, vigências, aliases, pagamentos por linha, centavos fracionários de importação,
  zero ≠ vazio); IDs atuais preservados; ordem original (`ord`) mantida para regras que dependem dela.
- Gravação: autorização (owner/editor da organização) + idempotência + conferência do "antes" e das dependências + alteração + auditoria
  numa única transação; conflito não grava nada; mesma identificação com outro conteúdo → `payload_mismatch`.
- Registros diferentes não se bloqueiam (sem trava por organização); o mesmo registro é serializado pela trava de linha.
- Leitura: RLS por membro da organização; escrita somente pela função (service_role após validação no servidor).

## Medição isolada (documento sintético de 12 MB, mesmo motor PGlite, sem rede)
| Modelo | Mediana | p95 | Tráfego por gravação |
|---|---|---|---|
| Documento único (lê, regrava e guarda snapshot) | ~710 ms | ~820 ms | ~12 MB lidos + ~24 MB gravados |
| Granular (`fin_commit`) | ~21 ms | ~43 ms | ~1 KB |
Não representa o banco hospedado (rede, disco e worker); serve para comparar os dois modelos no mesmo ambiente.

## Corte proposto (cada passo exige sua aprovação)
1. Aplicar `001_schema.sql` (sem dados; nada muda para os usuários).
2. Backup novo e verificado do `official_data` (hash) na versão N.
3. Pausa curta de gravação: `fin_import_document(org, doc, N, hash)` → modo `frozen`; conciliação automática
   (`fin_export_document` = documento N por registro, vínculo, dia, categoria, situação e saldos).
4. Liberar `mode='granular'` e trocar o servidor para `commitGranular` + leitura incremental; `commit_official` passa a recusar a organização.
5. Recuperação: `fin_export_document` reconstrói o documento **com tudo gravado após o corte** e pode voltar ao modelo anterior
   numa nova versão — nunca restaurando o JSON congelado.

## Pendências reais
- Integração do servidor/cliente com o modo granular (ligada à aprovação do passo 4); hoje o app só usa o documento único.
- Dependências compostas (transição de saldo inicial lê todas as contas/movimentos) continuam conferidas na aplicação; no modo granular exigem
  conferência por sequência das tabelas envolvidas.
- Tempo real de carga/pausa com os ~15 MB hospedados não medido.
