# Confirmação tardia e desempenho — 18/11/2026

## Evidência e correção
- As imagens mostram resultado desconhecido; não provam falha do banco. Logs disponíveis mostram apenas `sandrini.commit.failure` sem código, insuficiente para atribuir causa hospedada.
- Reproduzido em navegador isolado: resposta original em 21 segundos, limite local de 20 segundos e consulta sem confirmação. Antes: um commit fictício concluído, revisão aberta com resultado desconhecido. Depois: um commit, revisão fechada, nenhuma faixa de recuperação residual e nenhuma escrita repetida.
- O salvamento conserva a resposta original durante a consulta limitada. Se ela chegar, usa a confirmação/recibo canônico. Consultas posteriores param; não podem recolocar a operação concluída em espera.
- A revisão de Planejada/Efetivado mostra Enviando, Consultando confirmação, Confirmado/atualizando ou Consultar resultado; repetir a ação após envio consulta o requestId original, sem reenviar.
- Recuperação de operação já confirmada conserva o recibo disponível, em vez de descartá-lo por uma confirmação contendo apenas versão. O fallback de releitura permanece para versões incompatíveis.

## Desempenho medido, não estimado
- Normalização da transição + diff canônico, fixture de 11.787.100 bytes, cinco execuções no mesmo processo: mediana integral 118,0 ms; compartilhada 58,2 ms (aproximadamente 51% menor). Inclui todos os efeitos da normalização existente, sem mudar regras/auditoria/snapshot SQL.
- Navegador, fixture de 12.012.070 bytes, três execuções por condição: mediana percebida antes 2.086,2 ms; depois 2.048,0 ms. Variação pequena, sem evidência de ganho perceptível no ciclo completo. Zero releituras integrais no caminho com recibo exato em ambos.
- Confirmação no navegador foi interceptada; não mede banco hospedado nem comprova seu tempo real. Não houve alteração de schema ou de timeout do banco.

## Validação
- 41 testes em saveRecovery, savePreparation, commitReceipt, operationSave, recoveryActions e receiptOperation: confirmação tardia, conflito tardio, ausência/offline, normalização completa/legada, zero/cancelamento, versões/digest/contexto, isolamento e preservação de edições.
- Browser global/isolado: revisão/voltar sem envio, duplo clique, resposta perdida, recuperação read-only após recarga fictícia, conflito, edição durante envio e pendência independente; quatro chamadas fictícias previstas, zero chamadas inesperadas e zero erros de página.
- Browser adicional com resposta em 21 segundos verifica um commit, fechamento da revisão e ausência de recuperação residual. Compilação automática OK.

## Limites
O pacote do incidente real não foi consultado nem reenviado. Ausência na auditoria continua sendo resultado desconhecido, nunca autorização para nova escrita. Banco real, concorrência hospedada e duas abas simultâneas não medidos nesta rodada. Nenhum dado financeiro real alterado, nenhuma publicação e nenhum navegador ativo acessado/recarregado.