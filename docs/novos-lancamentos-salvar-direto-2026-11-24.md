# Novas inclusões: Salvar direto — evidências e limites

## Implementado
- Planejado/Efetivado × Compra/Despesa: inclusão independente salva por ação explícita sem tela de revisão, checkbox de conferência ou segunda confirmação.
- Operações vinculadas e alterações em documentos já salvos permanecem revisadas; identidade de criação confirmada bloqueia recriação, mesmo após recuperar o formulário.
- Inclusão e fornecedor/condições locais usam o mesmo pacote isolado. Sem bypass de versão, dependências, autenticação ou confirmação. Outros cadastros mantêm revisão.
- Formulário preservado em falha, bloqueio de duplo clique, IDs estáveis e limpeza somente após confirmação verificada. ACK perdido reutiliza a recuperação existente, sem reenvio automático.
- Validação de centavos inteiros, zero explícito, campos vazios, datas e soma das parcelas. Datas inválidas presentes no campo bloqueiam o envio mesmo quando o valor anterior ainda existe no rascunho.

## Testes executados
- Vitest: 63 arquivos aprovados, 1 ignorado; 506 testes aprovados e 6 testes opcionais ignorados. Após a proteção final dos campos, suíte direcionada repetida.
- `scripts/e2e/novo-salvar-direto-isolado.py`: 18 verificações aprovadas: oito combinações de tipo/categoria/parcelas; clique duplo e releitura após reload; formulário inválido/foco; fornecedor e condição inline; condição específica; rascunho não gravado recuperado e identidade gravada bloqueada; falha; resposta perdida; falha de atualização após ACK; revisão do existente; visualizador bloqueado; inclusão no celular com valor e vencimento relidos.
- Persistência e funções de envio substituídas exclusivamente por fixtures sintéticas. 54 tentativas de rede de escrita bloqueadas. Nenhum erro de execução inesperado; oito avisos conhecidos de hidratação da fixture, que substitui o store no cliente, separados explicitamente dos erros.
- Compilação automática sem erros; capturas de formulário, revisão existente e celular conferidas. Estrutura existente da tela mantida, incluindo limitações de largura da tabela no celular.

## Limites reais
- Não houve envio financeiro hospedado, reenvio real, migração, publicação, convite ou alteração da base oficial. Atomicidade hospedada e concorrência real não foram ensaiadas neste trabalho; reutilizam o caminho existente.
- Permissões conferidas em fixture owner/editor/viewer; não constitui ensaio real de autorização no servidor.
