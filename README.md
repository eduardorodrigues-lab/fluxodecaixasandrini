# Fluxodecaixasandrini

Crie um NOVO sistema interno "Fluxo de Caixa Sandrini", em português Brasil, para Eduardo Rodrigues, Grupo Sandrini. Não modificar projetos existentes e não publicar. Construir versão funcional inicial com motor de cálculo real compartilhado, edição vertical para equipe e visão horizontal para CEO. Visual financeiro profissional, fundo claro, verde escuro e tons neutros, tabela densa legível, sidebar, BRL, datas dd/mm/yyyy. Não apresentar versão como homologada ou migrada. Use dados DEMONSTRATIVOS claramente identificados, sem inventar importação dos arquivos reais.

Contexto: Excel xlsm tem macros Distribuir Tudo e Distribuir Seleção que limpam matrizes e gravam valores por vencimento, calendários de 2040-2191 dias. Web xlsx tem fórmulas dinâmicas. Migrar lógica para registros de parcelas e agregação por data; não criar matrizes lançamento x todos os dias. As duas visões devem usar exatamente o MESMO motor e cenário e filtros. Atualizar após edição sem botão Distribuir. Não executar macros. Implementar persistência de trabalho, deixar explícito se local ao navegador; arquitetura preparada para backend autenticado. Se backend disponível usar autenticação, RLS e isolamento por organização/usuário; nunca expor registros financeiros anonimamente. Sem publicação.

Páginas:
1 Fluxo: alternância Vertical / Visão CEO horizontal, seletor cenário e período, grupos expansíveis, detalhe ao clicar valor; filtro por fornecedor/grupo. Horizontal dias nas colunas, linhas Natureza/Grupo/Descrição fixas, scroll horizontal e cabeçalhos fixos. Linhas: Entradas Total (inclui saldo inicial como no Excel), Saldo Inicial, Recebimento Previsto/Real, Recebimento Estimado, Saídas Total, Custo de Produto, Compras Planejadas, Compras Comprometidas, Despesas Diversas, categorias expansíveis, Saldo Final. Não somar saldos acumulados como movimentação. KPIs saldo final período, menor saldo com data, entradas sem saldo inicial, saídas.
2 Lançamentos: abas planejadas, comprometidas, despesas; CRUD funcional, fornecedor, código compra, documento, valor, data base, vencimento original, prorrogação, observações, categoria, vínculo e estado. Não confundir compras realizadas/comprometidas com pagamento liquidado.
3 Recebimentos: valor por plataforma OU geral, data, soma e estimativa, diferença. Importante regra original soma D:O inclui ambos; alertar possível dupla contagem se geral e plataformas preenchidos, sem corrigir silenciosamente.
4 Referências: fornecedores e até 10 prazos em dias, categorias/grupos, metas mensais, redutores, defasagem, saldo inicial e ajustes; referências versionadas para que edições possam simular sem reescrever histórico.
5 Simulações: criar cenário por cópia da base, editar prazos/valores/metas/defasagem, comparação com base e impacto diário; restaurar cenário. Nenhuma edição de cenário altera base automaticamente.
6 Regras e Conciliação: catálogo com origem Excel antigo / Web / proposta, pendências, fórmulas e testes. Importação Excel xlsx/xlsm com mapeamento, preview e validação antes confirmar, não execução VBA, não duplicar na reimportação (identidade estável, hash e chave), exportar CSV se xlsx inviável. Não fingir importação/salvamento concluído.

REGRAS extraídas literalmente por análise estática (sem Excel recalculado):
A Web META: dias=DAY(EOMONTH(mês,0)); redução1=meta*r1; redução2=(meta-redução1)*r2; líquido=meta-redução1-redução2; dia=líquido/dias reais. Outubro exemplo 273000,25%,18% =>167895 e 5415.967741935.
Excel antigo PREVISÃO usa redutor global B2=25%, soma previsão mensal*(1-redutor). Fórmulas conferidas no fluxo fazem HLOOKUP(mês defasado)/30. NÃO são critérios idênticos: criar perfis explícitos "Excel legado" (padrão inicial) e "Web" e exibir o ativo nas duas visões. Não aplicar segundo redutor web ao legado silenciosamente. Regra de divisor e redutores configurável/versionada, perfil não implica homologação.
B Defasagem 10 dias: data referência=data fluxo-defasagem, mês da referência seleciona meta; dias corridos, sem antecipar fim de semana/feriado por suposição.
C Se recebimento informado agregado do dia !=0 usar informado, senão estimativa. Zero não significa automaticamente confirmado sem entrada. Mostrar alerta regra legado e permitir evolução futura SOMENTE como opção explicitamente distinta. Não somar informado+estimativa quando informado não zero. Web P= soma plataformas+geral se soma zero retorna vazio; R=P-Q.
D Web planejadas: prazos por lookup fornecedor; qtd=COUNT(prazos numéricos); parcela=valor/qtd; vencimentos=data base+prazo quando prazo não vazio. Zero numérico conta no COUNT, diferenciar vazio de zero.
Legado planejadas: P=valor orçado/COUNTIF(prazos,">0"); Q=SUMIF(efetuadas.codigo,codigoPlanejado,efetuadas.M)/COUNTIF(prazos,">0"); R=P-Q. Macro distribui R em cada prazo F:O não zero. NÃO substituir coluna M das efetuadas por total F por inferência: M precisa ser campo importado "base de abatimento legado", com aviso quando ausente. Vínculo pelo código compra. Não afirmar prevenção de duplicidade automática sem vínculo completo. Mostrar saldo planejado negativo, não truncar silenciosamente. Checar colisões de prazos: macro usa atribuição, duas parcelas mesma data podem se sobrepor; registrar pendência, não adotar comportamento invisível.
E Macros legado: planejadas usam R e data C+prazos F:O; comprometidas usam valor F e vencimento G (demais parcelas comentadas); despesas usam valor F e data C+G quando G não vazio. G=0 é permitido em despesas (data base). Campos adicionais de parcelas não são distribuídos automaticamente pelas macros ativas de comprometidas/despesas. Versão seleção usa marca não vazia D para planejadas/despesas e E para efetuadas.
F Web realizados: data efetiva P=IF(J<>0,J,I). Campo K "prorrogação válida ou simulação" é APENAS informativo, não altera cálculo. Compras no fluxo SUMIFS(H,P,data,A,"Compra de Mercadoria Realizada"), despesas SUMIFS(H,I,data,A,"Despesa Realizada") — despesas usam data ORIGINAL, divergência explícita. Não tratar prorrogação de despesas como ativa no perfil Web sem escolha.
G Fluxo web: saídas=compra realizada+planejada+despesa; saldo final=saldo inicial-saídas+(informado se !=0 senão estimado). Inicial dia seguinte=saldo final anterior, salvo ajuste manual L não vazio (zero válido) que substitui saldo inicial. Impactos anteriores param na próxima substituição de saldo. Guardar diferença de ajuste e histórico.
H Pendências reais fonte web: planejadas fluxo E usa faixa até linha1962 embora cadastro vai3364; títulos N3385 possui #REF! mascarado IFERROR e trecho seguinte referência deslocada; registrar diagnóstico da fonte, não reproduzir como regra desejada nem "corrigir" dados sem conciliação. Perfil legado é compatibilidade sem copiar bugs.
I Usar valores monetários com precisão decimal/cents e política de arredondamento explícita; exemplo parcelas 100/3 deve reconciliar total e indicar diferença em relação ao arredondamento macro Currency (4 casas); não distribuir centavos silenciosamente como se original.

Implementar testes automatizados do motor: dois redutores web, divisor30 vs dias reais e fevereiro bissexto, virada mês com defasagem10, informado substitui estimativa e zero aciona estimativa, soma geral+plataformas com aviso, planned abatimento vínculo e M ausente não produz valor saudável, datas corridas parcelamento, prorrogação compra vs despesa web, cenário isolado, saldo substituído manualmente=0, igualdade totais visão vertical/horizontal, arredondamento, vazio vs zero prazo.
Documentar regras em docs/regras-fluxo.md e schema de dados; retornar funcionalidades implementadas, testes executados e limitações reais. Priorize um fluxo utilizável com cálculo correto, não só telas ou botões decorativos. Sem prometer homologação, dados reais importados, acesso multiusuário ou segurança backend se não implementados.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fluxodecaixasandrini.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a2013843-cf8f-434a-96dc-aefbcd024b30).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
