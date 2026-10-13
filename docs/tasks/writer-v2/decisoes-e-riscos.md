# Decisões, hipóteses e riscos

## Confirmado pelo usuário

Autores e mestres com o mesmo peso; publicação e distribuição externa junto de vendas na primeira versão;
20 h/semana e desenvolvimento solo; vendedores convidados e catálogo acompanhado;
gestão narrativa de sessões, compartilhamento e consequências.
Não há decisão de preços, comissão, fornecedor de pagamento, moeda, país de venda ou retenção.

## Registro de decisões que precisam de fechamento

| ID   | Decisão                                                  | Proposta para avaliação                                                       | Responsável e tarefa          | Quando precisa estar resolvida |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------- | ------------------------------ |
| D-01 | Limites de cenas, versões, projetos e tamanhos           | Medir corpus existente e usar paginação; não impor quota arbitrária           | Criador do produto, W2-F1-02  | Antes de W2-F2-01              |
| D-02 | Cânone, variantes e desvinculação                        | Alterações particulares e promoção explícita pelo dono                        | Criador, W2-F1-02             | Antes de W2-F2-07              |
| D-03 | Convites, prazo e papel de cada colaborador              | Convite autenticado e revogável; revisão assíncrona                           | Criador, W2-F1-03             | Antes de W2-F3-01              |
| D-04 | Revelações de leitor e jogadores                         | Liberação explícita; nunca enviar campos ocultos                              | Criador, W2-F1-03             | Antes de W2-F3-05              |
| D-05 | País, moeda, meios e partes da venda                     | Escolher um arranjo compatível com vendedores convidados                      | Operador, W2-F1-04            | Antes de integração comercial  |
| D-06 | Comissão, taxas, reembolso, disputa e repasse            | Documentar custos e responsabilidade antes de preço                           | Operador, W2-F1-04            | Antes de W2-F4-06              |
| D-07 | Licença de livro/aventura, atualizações e retirada       | Vincular compra à edição; decidir atualizações e cópias particulares          | Operador, W2-F1-04            | Antes de W2-F4-01              |
| D-08 | Provedor comercial e arquitetura de checkout             | Comparar suporte real à região, vendedores, conciliação e sandbox             | Operador, W2-F1-04            | Antes de W2-F4-07              |
| D-09 | Retenção, exclusão e registros financeiros               | Classificar dados e validar obrigações no contexto escolhido                  | Operador, W2-F1-03 e W2-F1-04 | Antes de banco comercial       |
| D-10 | Edição de D&D e conteúdo reutilizável                    | Modelos narrativos e conteúdo autoral; SRD explicitamente versionado se usado | Criador, W2-F1-04             | Antes de material distribuível |
| D-11 | Objetivos de uso e critérios do piloto                   | Proposta: três autores e três mestres; metas após linha de base               | Criador, W2-F1-05             | Antes de medir aceite humano   |
| D-12 | Navegação, idiomas, dispositivos e orçamento operacional | Web PT-BR; três temas; teclado; 320 px; valores de custo documentados         | Criador, W2-F1-05 e W2-F1-06  | Antes de W2-F2-01              |

Estas são pendências de execução, não bloqueios para documentar o plano.
A tarefa de decisão registra opções, efeito no produto, escolha, responsável e data.
A autorização para escrever tarefas não aprova automaticamente uma hipótese.

## Riscos e mitigação

| Risco                                         | Ação prevista                                                        | Evidência                     |
| --------------------------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| Venda reduzida a botão de pagamento           | Planejar pedido, webhook, direito, entrega, reembolso e repasse      | W2-F4-07 a W2-F4-11           |
| Conteúdo pago gravado em coleção anônima      | Projeções e regras distintas de publicBooks                          | W2-F4-01 e W2-F5-03           |
| Segredos filtrados só na UI                   | Projeção por audiência no servidor e teste direto de dados/URL       | W2-F3-04 e W2-F3-05           |
| Campanha muda o universo de outros projetos   | Variação local e promoção com comparação e aceite                    | W2-F2-07 e W2-F3-07           |
| Edição antiga restaura lore revogado          | Versão monotônica de privacidade e invalidação de artefatos futuros  | W2-F4-01 e W2-F4-09           |
| Trabalho solo ultrapassa capacidade           | Reestimar por tarefa e ampliar prazo explicitamente                  | W2-F1-06 e W2-F5-02           |
| Importação vira autorização de revenda        | Conferência de origem/licença e moderação do catálogo                | W2-F1-04 e W2-F4-04           |
| Eventos comerciais repetidos ou fora de ordem | Idempotência, verificação e conciliação no servidor                  | W2-F4-08                      |
| Download já obtido continua com terceiros     | Explicar limite; revogar acessos futuros sem prometer apagar cópias  | W2-F1-04 e W2-F4-09           |
| Exclusão do original perde compras            | Regra explícita de retirada, preservação mínima e atendimento        | W2-F1-04, W2-F4-01 e W2-F4-10 |
| Métricas expõem manuscritos ou jogadores      | Eventos sem texto, segredo, chave ou identidade pública involuntária | W2-F5-02                      |

## Fontes externas conferidas em 2026-10-12

O [SRD oficial](https://www.dndbeyond.com/srd) apresenta SRD 5.2.1 e distingue os caminhos
de publicação e conteúdo disponível. A seleção de conteúdo/licença continua em D-10.
O [EPUB 3.3 do W3C](https://www.w3.org/TR/epub-33/) é referência de formato,
e o [KDP](https://kdp.amazon.com/en_US/help/topic/G200634390/) aceita EPUB e recomenda validação
no Kindle Previewer. Isso fundamenta exportação, não uma integração automática.
A [documentação do Stripe Connect](https://docs.stripe.com/connect) é uma fonte para investigar
pagamentos entre múltiplas partes, sem escolha de fornecedor neste plano.
Revalidar documentação, requisitos regionais e preços no momento da decisão comercial.
