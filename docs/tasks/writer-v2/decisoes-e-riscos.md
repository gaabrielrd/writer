# Decisões, hipóteses e riscos

## Confirmado pelo usuário

Autores e mestres com o mesmo peso; publicação e distribuição externa junto de vendas na primeira versão;
20 h/semana e desenvolvimento solo; vendedores convidados e catálogo acompanhado;
gestão narrativa de sessões, compartilhamento e consequências.

Atualização recebida em 2026-10-13: Brasil/BRL, Stripe preparado para pagamentos
segundo o operador, compra avulsa com download e uso em campanhas próprias.
Criador vende; Writer cobra comissão configurável por contrato e centraliza atendimento.
Compra mantém a edição adquirida; atualizações são opcionais; retirada suspende novas vendas.
Roteiros serão preparados; o operador indicará participantes reais.
Percentuais, taxas absorvidas, responsabilidade financeira por reversões, calendário de
repasse e retenção ainda não foram definidos.

“Sem revenda” aplica-se ao conteúdo autoral exclusivo; componentes com licença aberta
preservam as permissões dessa licença. Essa separação deve aparecer no manifesto de origem.

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

## Fechamento recebido e pendências remanescentes

| Decisão | Fechamento em 2026-10-13                                                                                                 | Ainda necessário                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| D-05    | País Brasil; moeda BRL; criador é vendedor                                                                               | Meios habilitados e identificação contratual da operadora                                  |
| D-06    | Comissão configurável por contrato; atendimento centralizado no Writer                                                   | Percentual/base, encargos, reserva, repasse e déficit de reembolso/disputa                 |
| D-07    | Avulsa; download; uso em mesa própria; edição adquirida conservada; atualização opcional; retirada suspende novas vendas | Efeito de reembolso/disputa e retirada por violação de direitos/privacidade                |
| D-08    | Stripe escolhido; operador informa pagamentos preparados                                                                 | Connect doméstico BR→BR, configuração/versão de API, tipo de cobrança e capabilities reais |
| D-10    | Uso autoral e manifesto de direitos como direção técnica                                                                 | Seleção/versionamento de SRD, atribuição e revisão das licenças por componente             |
| D-11    | Preparar roteiros; participantes indicados pelo operador                                                                 | Pessoas/consentimento, execução e resultados reais do piloto                               |

Não fixar comissão percentual provisória nem inferir quem absorve perdas por centralizar
atendimento. Acesso a edição adquirida permanece separado de alteração do original.

## Pesquisa preparatória conferida em 2026-10-13

Pesquisa oficial somente leitura, por subagente; conta Stripe não acessada e nenhum
teste de sandbox ou pagamento executado.
O [guia de Connect](https://docs.stripe.com/connect/how-connect-works) lista Brasil em
preview; disponibilidade depende da região da plataforma e dos recursos.
Payments preparado não comprova Connect nem repasse habilitado.
As [restrições de contas brasileiras](https://support.stripe.com/questions/transaction-declined-stripe-brazil-accounts)
exigem verificar o fluxo doméstico em BRL, sem presumir capacidade internacional.

Os [tipos de cobrança](https://docs.stripe.com/connect/charges) atribuem saldos,
reembolsos e disputas de formas distintas. A escolha “criador vende” não fixa sozinha
o adapter de cobrança. Verificar a capacidade da conta antes de escolher direct ou
destination charge, versão de API e onboarding.
No [sandbox Connect](https://docs.stripe.com/connect/testing), certas capacidades
podem não ser impostas; sucesso em teste não comprova habilitação live.

Na implementação, preço/edição/moeda/comissão vêm do servidor; não liberar biblioteca
pelo retorno do navegador. Aplicar [fulfillment verificável](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted),
[webhooks assinados](https://docs.stripe.com/connect/webhooks) e
[idempotência](https://docs.stripe.com/api/idempotent_requests).
Separar pagamento, transferência ao saldo do criador e payout bancário.
Estas são propostas técnicas para W2-F1-04, não testes executados.

O [SRD 5.2.1 oficial](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
usa CC BY 4.0; o preâmbulo traz atribuição. A
[licença](https://creativecommons.org/licenses/by/4.0/) permite redistribuição comercial,
exige crédito e indicação de alterações e não permite impor restrições adicionais a
esse material. Separar texto autoral exclusivo, SRD e assets licenciados; indicar
versão/origem e alterações, inclusive tradução. Importar conteúdo não autoriza revendê-lo.

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
