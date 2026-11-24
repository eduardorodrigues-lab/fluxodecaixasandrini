# Notas parceladas importadas — 24/11/2026

## Causa e escopo
O agrupamento compartilhado `src/lib/documentGroups.ts` exigia pedido textual,
linhas adjacentes e vencimentos da origem em texto/objeto de data. A fonte atual
tem números seriais do Excel e linhas ordenadas por vencimento, não por nota.
Essas condições rejeitavam 2409A1/A2/A3 apesar de fornecedor, nota e emissão iguais.

Conferência por leitura do candidato final preservado da fonte ea1c4241:
FOUR ALL PRIME CONFECCOES LTDA, linhas 1424/1908/2511 da aba
COMPRAS DIRETAS_EFETUADAS, documentos 2409A1/A2/A3, emissão 46009,
vencimentos 46100/46129/46160 e pedido ausente. Nenhum dado oficial foi escrito.

## Interpretação derivada
- Compartilhada por Lançamentos, Consultas, Dashboard e Gerenciar; cada título
  mantém sua linha e ID, documento original, raw e referência de origem.
- Somente sufixo numérico `A` comprovado no contexto da aba importada, com mesma
  fonte, fornecedor exato/ID, pedido (que pode estar vazio), emissão e base documental.
  Documentos com zeros à esquerda permanecem distintos. Vínculos existentes prevalecem.
- Exige pelo menos duas parcelas, sequência sem lacunas desde 1, sem duplicatas,
  e vencimentos da origem crescentes. Não exige linhas adjacentes e não usa prorrogações.
- Séries incompletas, duplicadas, datas sem comprovação ou sufixos arbitrários
  permanecem individuais, com motivo em `DocumentIndex.ambiguous`.
- O denominador é a quantidade observada na série comprovada, não um total inferido
  de um sufixo isolado. A origem não contém total declarado: uma parcela final
  completamente ausente, sem outro indício, não pode ser detectada por este leitor.
  Não cria noteId nem autoriza reparcelamento de nota sem vínculo explícito.

## Garantias e validação
Somente apresentação/agrupamento. Sem mudanças no motor, importação, salvamento,
permissões, valores, datas, baixas, etapas ou categorias; sem migração/reimportação.
Testes sintéticos cobrem 2409, isolamento por fornecedor/fonte/série/emissão,
lacunas, duplicatas, sufixos sem prova, vínculos existentes, consultas/listagens/edição,
rastreabilidade e invariância financeira diária em 2.191 dias.
Conferência de dados reais usa o candidato local preservado, não uma releitura da
versão ativa nem gravação/homologação do ambiente publicado.

Resultados executados: 59 testes focados (17 novos); regressão completa com
436 aprovados e 6 ignorados; compilação automática `build OK`.
No candidato preservado (5.500 compras), 2.464 títulos adicionais formam
786 grupos comprovados pelos critérios; 1.953 identificações permanecem ambíguas.
O hash do documento em memória e todos os resultados dos 2.191 dias permanecem
idênticos antes/depois. Estes números não são uma conferência da versão ativa.

Navegador local com sessão/IDs fictícios e escrita bloqueada: lista de Efetivado
mostra nota 2409 em três linhas; Gerenciar → Parcelas mostra 1/3, 2/3, 3/3
e os originais 2409A1/A2/A3. Nenhuma chamada de gravação financeira.
A injeção da sessão somente no cliente causa aviso esperado de hidratação
(servidor mostra tela de acesso); não é prova de erro na sessão real.
Consultas foi validada pelas funções compartilhadas nos testes, não por navegação
dedicada nesta execução. Nenhum navegador de usuário foi recarregado.