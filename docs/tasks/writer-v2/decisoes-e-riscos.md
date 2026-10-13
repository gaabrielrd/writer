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
Criador absorve taxas e reversões; eventual reserva é definida em contrato.
Após reembolso integral ou disputa perdida, revogar novos downloads/acesso à edição
e preservar notas próprias da campanha. Connect ainda precisa ser verificado, segundo o operador.
Percentuais concretos, calendário de repasse e retenção ainda não foram definidos.
Operador também confirmou: plataforma Stripe registrada no Brasil; disputa aberta
suspende acesso, refund parcial mantém; comissão Writer é devolvida proporcionalmente
ao refund e integralmente na disputa perdida.

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

| Decisão | Fechamento em 2026-10-13                                                                                                                                                                | Ainda necessário                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D-05    | País Brasil; moeda BRL; criador é vendedor                                                                                                                                              | Meios habilitados e identificação contratual da operadora                                               |
| D-06    | Comissão configurável; atendimento Writer; criador absorve taxas/reversões; eventual reserva por contrato                                                                               | Percentual/base concretos, reserva/calendário por contrato e compatibilidade da responsabilidade Stripe |
| D-07    | Avulsa/download/mesa própria; mantém edição; atualização opcional; retirada suspende vendas; integral/perda revoga; disputa aberta suspende; parcial mantém; notas próprias preservadas | Contratos concretos e retirada excepcional por violação de direitos/privacidade                         |
| D-08    | Stripe escolhido; operador informa pagamentos preparados                                                                                                                                | Connect doméstico BR→BR, configuração/versão de API, tipo de cobrança e capabilities reais              |
| D-10    | Uso autoral e manifesto de direitos como direção técnica                                                                                                                                | Seleção/versionamento de SRD, atribuição e revisão das licenças por componente                          |
| D-11    | Preparar roteiros; participantes indicados pelo operador                                                                                                                                | Pessoas/consentimento, execução e resultados reais do piloto                                            |

Não fixar comissão percentual provisória. Responsabilidade do criador foi escolhida,
mas a configuração/contrato do provedor precisa corresponder; centralizar atendimento
não prova quem Stripe debita. Acesso adquirido permanece separado do original.

Consulta preparatória no navegador em 2026-10-13: aba Stripe em sandbox, com seleção
do fluxo Connect aberta. Nenhuma opção confirmada ou conta alterada. Tela de setup
não comprova onboarding concluído, capabilities de repasse ou habilitação live.
Consulta posterior do mesmo dia: etapas de modelo/conta teste aparecem concluídas,
duas contas Restricted e nenhuma Enabled. Conta inspecionada no Brasil, com pagamentos
e payouts pausados por requisitos pendentes; pagamento exibido é exemplo automático
Stripe. Não foi criada conta ou executada cobrança Writer pelo agente. Este resultado
atualiza a observação anterior, sem atribuir ao agente as alterações feitas fora da consulta.

## Contrato comercial — 2026-10-13

[W2-F1-04](execucao/04-regras-comerciais-e-direitos.md) propõe direct charges com
taxas cobradas do criador, perda final incobrável atribuída à Stripe e dashboard completo.
É direção de integração, ainda sem configuração/API/capabilities real comprovada.
Com esse modelo, reserva controlada pelo Writer não pode ser presumida; capacidade
contratual/técnica deve ser confirmada antes de oferecer retenção.
Oferta inicial de um criador/edição por pedido; valores/contrato vêm do servidor.
Comissão retorna proporcionalmente; disputa aberta suspende, ganho restaura apenas
direito vigente e perda/integral revoga. Notas próprias ficam separadas de derivados.
Manifesto original e exemplos de centavos são referências técnicas, não produto já
autorizado à venda nem tarifas da Stripe. D-09 ainda precisa dos agentes, fundamentos
e prazos aplicáveis à operação real; não inventar retenção fiscal.

D-07 tem fechamento da política de parcial/disputa aberta. Restituição excepcional
por direitos/privacidade e contratos concretos continuam pendentes. D-08 tem estudo
e sandbox observado, mas não ensaio de integração ou habilitação live.

## Decisões técnicas de domínio — 2026-10-13

[Contrato W2-F1-02](execucao/02-modelo-de-dominio.md) registra a solução de implementação:
D-02 usa lore vivo em originais autorizados, base congelada em campanhas, substituição
local de entidade inteira e promoção explícita pelo dono. D-01 fecha um orçamento
inicial de 800.000 bytes de prosa/900.000 bytes do documento serializado e paginação
25/50, preservando leitura/backup legado e sem quotas comerciais de projetos.
Dois PDFs reais foram medidos privadamente; binários ficam separados e limites por
mediaType/desempenho integrado serão ensaiados nas features responsáveis.
Esse fechamento técnico não aprova retenção comercial nem comprova comportamento implementado.

## Decisões técnicas de acesso — 2026-10-13

[Contrato W2-F1-03](execucao/03-permissoes-e-privacidade.md): D-03 usa convites manuais
para uid verificado, expiração de sete dias para convite pendente e participação aceita
até revogação. D-04 usa liberação explícita em projeção separada; jogador é leitor na V1.
Para leitura nova, autor escolhe capítulo de liberação por ficha; sem spoilers, resposta
usa o capítulo atual; opção explícita de spoilers só inclui fichas escolhidas para a edição.
Formato público legado preservado; progresso não substitui autorização de dados.
D-09 fecha classificação técnica
de dados/cache e separação de notas próprias; retenção financeira segue pendente.
Endpoints autenticados, sem token permanente, serão usados para material secreto/pago.
São escolhas técnicas de implementação; regras reais e casos negativos ainda não executados.

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

## Navegação aprovada — 2026-10-13

Fechamento D-12: operador aprovou os cinco espaços Universos, Estúdio, Publicações,
Catálogo e Biblioteca, com livros, aventuras e campanhas no Estúdio, após ver
[o protótipo concreto](execucao/05-prototipos-e-pilotos.md). Trinta percursos Chromium
passaram nos três temas, incluindo 320 px. Roteiros D-11 foram preparados;
participantes, tratamento das observações e aceite humano continuam pendentes.
Navegação aprovada não significa piloto humano concluído.

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
