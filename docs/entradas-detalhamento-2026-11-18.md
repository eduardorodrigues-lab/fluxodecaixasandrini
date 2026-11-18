# Entradas clicáveis — 18/11/2026

## Implementação visual
- Fluxo CEO horizontal: quatro linhas de entradas, valores diários e Total período abrem diálogo acessível com foco contido e fechamento explícito. Vertical: mesmas três colunas de entrada disponíveis e totais reutilizam o mesmo detalhe.
- `flowEntryDetail.ts` adapta `computeFlow/buildRows`: valores do motor, não novo cálculo financeiro. Total período usa só primeira abertura mais recebimentos efetivamente utilizados. Estimativa substituída fica apenas na memória.
- Saldo: referência usada, abertura manual/consolidada ou bancária, ajuste do dia, ajuste anterior e rolagem líquida; bancos são outra seção com data de referência, ausências e diferença, nunca rateio ou substituição.
- Recebimentos: plataforma/Geral, origem, conta gravada, titular cadastrado (não inferência de empresa), realizado somente pela flag de crédito confirmado, zero explícito visível e conta ausente separada. Padrão atual da plataforma nunca reatribui conta ao histórico.
- Estimativa: base, redutores, divisor, defasagem, mês e referência do motor; meta diária não armazena vínculo bancário, portanto não há conta prevista inventada.
- Transferências: duas pernas em seção fora das entradas, efeito líquido zero, estorno e motivo; alerta de possível inclusão em Geral sem dedução ou despesa compensatória.
- Não tocados motor, gravação/revisão, filtros, layout geral, pesquisa, schema, auditoria ou rascunhos.

## Evidências executadas
- 44 testes em `flowEntryDetail.test.ts` (11), `engine.test.ts` (18), `banco.test.ts` (15). Composição = célula e total; conta informada/ausente, saldo manual vs bancos, abertura bancária, zero/vazio/legado, filtro/data/ajuste zero, transferência/estorno, cenário isolado e ausência de mutação.
- Navegador novo com chamadas financeiras bloqueadas e todas leituras de funções interceptadas com fixture: 16 cliques horizontais (4 linhas × 3 dias + total), vertical, período, conta ausente, diferença bancária, zero/estimativa, transferências/estorno e simulação via navegação interna. 1366×900, 1920×1080 e 390×844; screenshots dos painéis inspecionadas. Nenhum commit, fixture intacta, zero erros de execução ou chamadas não previstas.
- Compilação automática OK. Sem publicação, importação ou gravação financeira real; navegador ativo do usuário não acessado.

## Revisão de dados separada
Relatório privado entregue em Files: `Revisao-pendencias-lancamentos-18-11-2026.md`. Evidências reais, IDs e referências de arquivo ficam fora do repositório. Revisão por SELECT e leitura de arquivo; não aplicada. Não presumir execução do roteiro antigo.

## Limites
- Não houve conciliação integral de XLSM, extratos ou operações financeiras reais, nem confirmação de pagamento por documento externo.
- Flags incompletas continuam informadas como crédito não confirmado; empresa só aparece quando titular da conta está cadastrado. Contas com abertura ausente/posterior à data ficam indisponíveis.
- Duas contas de uma transferência cadastradas não provam o perímetro M&S/Mococa nem correspondência com aportes antigos. Geral não foi corrigido.
- Somente as colunas equivalentes existentes da vertical foram mantidas (sem acrescentar coluna de Entradas Total ou modificar layout).
