# Busca e ordenação em Lançamentos — 11/11/2026

## Entrega
- Planejada, Efetivado, Pagamentos (baixas), Consultas por parcela/documento e Pagamentos do Dia, incluindo estornos, subtotais e detalhes de baixas/prorrogações/efetivações.
- Cabeçalhos de dados alternam crescente/decrescente, com seta, `aria-sort` e botão acessível por teclado; Ações não ordena.
- Ordenação pt-BR natural com acentos/caixa equivalentes, parcelas numéricas, datas por timestamp, dinheiro por número, vazios sempre no fim e empates estáveis.
- Busca inclui nomes/apelidos, campos exibidos e documentos/pedidos/observações relevantes. Estado de busca/ordem/filtro de categoria independente entre abas; consultas preservam as subvisões ao alternar.
- Grupos são construídos depois dos filtros existentes; busca consulta os campos agregados exibidos e os campos das parcelas do documento. Os totais correspondem às linhas resultantes, sem somar duas vezes parcelas.
- Impressão e CSV compatível com Excel recebem o resultado completo filtrado/ordenado, sem recorte de página. CSV também disponível para pagamentos do dia.

## Evidências executadas
- `bunx vitest run`: 24 arquivos, 190 testes aprovados. Seis testes novos cobrem comparação natural, zero/vazios, datas, parcelas 2/10, estabilidade/identidade, agrupamento, aliases, valores formatados, CSV e exclusão dos estornos dos totais.
- Compilação automática: `build OK` após as alterações.
- Playwright desktop 1280×1800, organização fictícia injetada somente no navegador; leitura real não usada, escrita bloqueada.
- Planejada: parcelas 2 antes de 10; Enter alterna direção e `aria-sort`; alias sem acento; estado vazio e busca mantida após trocar aba.
- Efetivado: nomes naturais (alvaro 2 antes de Álvaro 10), fornecedor vazio ao fim em ambas direções, zero primeiro; detalhe da baixa permanece ligado à parcela filtrada.
- Baixas: busca por observação acentuada e ordenação por valor.
- Consultas: agrupamento por documento, CSV baixado com conjunto filtrado, janela de impressão com a mesma linha agregada; pagamentos e prorrogações do detalhamento com cabeçalhos ordenáveis.
- Pagamentos do Dia: busca por café, cabeçalho de valor, subtotal por conta e estornos separados.
- Capturas inspecionadas em `/tmp/browser/report-sort/`: Planejada, Efetivado, baixas, Consultas, Pagamentos do Dia e detalhes.

## Limitações reais
- Não foi escrito nenhum cadastro ou dado financeiro real; fornecedores não foram recriados. Nada publicado.
- A substituição de sessão no navegador provoca um aviso esperado de hidratação (HTML inicial sem sessão versus organização fictícia); não houve outro erro de página.
- Impressão validada pelo conteúdo da janela gerada, não por uma impressora física ou diálogo nativo de PDF.
- Não aferido o volume integral da organização nem desempenho em milhares de linhas; não existe paginação nessas tabelas atualmente. O resultado completo é usado nos relatórios/exportações.
- Celular não foi verificado nesta solicitação.