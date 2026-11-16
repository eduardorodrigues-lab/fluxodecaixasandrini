# Plano: correção visual de termos de origem (aguardando autorização)

Escopo: somente textos e renderização. Sem mudança de motor, schema/tipos, dados, vínculos, vigências, previsões, ajustes/saldos, permissões ou salvamento. Preserva a versão atual da base (sem fixar ou restaurar versão). Nada publicado.

## 1. Remoção de referências técnicas (todas as telas)
Em todas as páginas, subabas, painéis, formulários, gráficos, relatórios, impressões e exportações, inclusive Ajustes de saldo: retirar Excel/Web, nomes de arquivo, aba, linha, coluna, células e fórmulas (ex.: SOMA(D:O)). Nomes de condições e observações de negócio permanecem.

## 2. Substituições de texto
- Recebimentos: aviso de soma vira "Valores das plataformas e do campo Geral são somados no total do dia. Quando ambos estão preenchidos na mesma data, o sistema exibe alerta de possível duplicidade; nada é corrigido automaticamente."
- "Código importado": não renomear. Se for metadado técnico, mostrar só em "Origem da importação"; se tiver uso operacional comprovado, manter o rótulo e reportar.
- Lançamentos/NotaPanel: termos "legado"/"(M)" trocados por redação que preserva o significado original (ex.: "Base de abatimento do histórico", "Abatido pelo histórico", "Título do histórico distinto"). Não usar "correspondente/confirmado" onde o vínculo não está confirmado.
- Explicação do saldo: "fluxo = efetivados + Saldo restante previsto" (nunca "saldo previsto em aberto").
- Bancos: "saldo inicial de origem/legado" vira "saldo inicial consolidado", mesma regra.
- Metas/Histórico: distribuição diária exibe dinamicamente "30 dias" ou "dias reais do mês" conforme a configuração existente de cada mês; sem texto fixo.
- Botões de exportação: rótulos neutros ("Exportar planilha"/"Exportar relatório"), mesmo arquivo gerado.

## 3. Origem da importação
Seção recolhível nos detalhes/auditoria que apenas renderiza os metadados já existentes (origem, linha-fonte etc.). Nenhum dado ou histórico movido, apagado ou reescrito.

## 4. Pontos que podem exigir mudança funcional (só listar, não executar)
Ex.: cabeçalhos de exportação usados por outros processos, termos gravados no próprio histórico, filtros que dependem do texto. Serão reportados com impacto.

## 5. Validação futura
- Relatar separadamente o que foi executado.
- Comparar antes/depois: leitura da versão atual dos dados (coleções e contagens) e resultados (fluxo diário 2025–2030, totais por natureza, extrato). Diferença zero só se comprovada pela comparação.
- Conferência visual das telas afetadas; build.
