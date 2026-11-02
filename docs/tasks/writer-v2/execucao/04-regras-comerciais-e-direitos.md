# W2-F1-04 — Contrato comercial e direitos

**Data:** 2026-10-13. **Base:** `9177432`. **Natureza:** contrato documental.
**Plano:** [W2-F1-04](../fase-01-direcao-e-fundamentos/04-regras-comerciais-e-direitos.md).
Sem cobrança, integração remota, mudança de conta ou habilitação live neste incremento.

## Escolhas recebidas

Brasil/BRL; plataforma Stripe registrada no Brasil, segundo o operador. Criador
convidado vende; Writer cobra comissão configurável por contrato e centraliza atendimento.
Criador absorve taxas de processamento, reversões e custos de disputa; eventual reserva
depende do contrato e de capacidade real de retenção. Writer devolve sua comissão
proporcionalmente ao reembolso e integralmente na disputa perdida.

Compra avulsa vincula edição e licença, oferece download e uso da aventura em mesas
próprias, sem revenda do conteúdo autoral exclusivo. Atualização opcional não substitui
silenciosamente a edição adquirida. Retirada comum interrompe novas vendas e conserva
compras. Reembolso parcial mantém acesso; disputa aberta suspende temporariamente;
reembolso integral concluído ou disputa perdida revoga. Notas próprias são preservadas.

São respostas explícitas do operador. Percentuais, contratos assinados, prazo fiscal,
tarifas efetivas e capacidade live não são inferidos dessas respostas.

## Arranjo de cobrança proposto

Direção técnica: **direct charges** no contexto de cada conta conectada, com criador
como vendedor e comissão Writer via application fee. Oferta inicial tem um criador,
uma edição e uma moeda por pedido; carrinho com vários vendedores fica fora da V1.
Não há saldo de consumidor, saque interno ou conversão de crédito de IA em dinheiro.

| Responsabilidade                          | Configuração candidata Accounts v1      | Configuração candidata Accounts v2                  |
| ----------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| Stripe cobra taxas do criador             | `controller.fees.payer=account`         | `defaults.responsibilities.fees_collector=stripe`   |
| Perda final incobrável de saldo conectado | `controller.losses.payments=stripe`     | `defaults.responsibilities.losses_collector=stripe` |
| Dashboard completo do criador             | `controller.stripe_dashboard.type=full` | `dashboard=full`                                    |

`fees_collector=stripe` significa que a Stripe cobra do criador; não que paga a taxa.
Reversões debitam o saldo conectado; a responsabilidade final por déficit incobrável
é outra configuração, sem opção denominada `creator`. O Writer continua responsável
pelo próprio saldo. Conferir configurações antes de criar contas e fixar versão da API;
não presumir que contas existentes ou APIs v1/v2 sejam intercambiáveis.
Fontes: [taxas](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior),
[configuração v2](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration).

Com perdas atribuídas à Stripe, não presumir que Writer possa pausar pagamentos/payouts,
debitar saldo conectado ou reter uma reserva controlada pela plataforma. Suspender
**ofertas no Writer** continua sendo controle interno. Reserva contábil não equivale
a dinheiro retido. Se reserva real for necessária e indisponível nesse arranjo,
reabrir decisão de risco/configuração antes de vender; não mudar silenciosamente para
destination charges. Não prometer cobrança automática de déficit no banco brasileiro.
Fontes: [risco](https://docs.stripe.com/connect/risk-management),
[saldos e regiões](https://docs.stripe.com/connect/account-balances).

## Provedor: comparação e evidência real

| Opção                        | Adequação estudada                                                      | Limite                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Stripe Payments isolado      | Checkout para uma empresa                                               | Não comprova vendedores/repasse Connect                                                 |
| Connect direct charges       | Débito no criador e application fee; direção compatível com as escolhas | Confirmar BR→BR, responsabilidades, capacidades e atendimento delegado                  |
| Connect destination/separate | Mais controle de distribuição pela plataforma                           | Débitos/riscos recaem na plataforma; exigiria nova decisão                              |
| Mercado Pago Split 1:1       | Referência alternativa para divisão entre vendedor e plataforma         | OAuth, produto e reversões próprios; não é adapter implementado nem fallback automático |

Consulta pública e somente leitura em 2026-10-13: Connect lista Brasil em preview;
Payments não prova elegibilidade. Ver [disponibilidade](https://docs.stripe.com/connect/how-connect-works),
[tipos de cobrança](https://docs.stripe.com/connect/charges) e
[Split 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/landing).
Plataforma fora do Brasil não pode cobrar application fees de contas brasileiras;
operador confirmou país Brasil, ainda sem verificação independente da conta da plataforma.
Ver [direct charges](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted).

Navegador Edge, sandbox existente: setup mostra etapas de modelo/conta teste concluídas;
lista mostra duas contas, ambas Restricted, nenhuma Enabled. Na conta inspecionada,
país Brazil, moeda BRL, Merchant/Customer, pagamentos e payouts pausados. Cadastro
pendente inclui site, tipo de negócio e representante; há cinco ações requeridas,
das quais essas três estavam visíveis. Pagamento exibido tem descrição de exemplo
criado automaticamente pela Stripe. Isso **não é teste de cobrança do Writer**.
Não foram criadas contas, confirmados termos, alteradas opções ou obtidas chaves.
Identificadores, saldo e dados privados da conta não são copiados para o repositório.

Pendências antes da integração/ativação comercial:

- [ ] Confirmar país da plataforma e configuração de taxas/perdas/dashboard pela API autorizada ou painel.
- [ ] Resolver requisitos de contas de teste; conferir capabilities efetivas e permissões de reembolso/atendimento.
- [ ] Ensaiar checkout, webhook assinado, reembolso, disputa e payout no sandbox Writer.
- [ ] Confirmar disponibilidade live BR→BR e meios de pagamento; teste não prova live.
- [ ] Definir tarifas/contrato/reserva/calendário e identificar a operadora real.

Sandbox pode relaxar capabilities; retorno de onboarding não confirma habilitação.
Fontes: [testes](https://docs.stripe.com/connect/testing),
[onboarding](https://docs.stripe.com/connect/hosted-onboarding).

## Contrato monetário e exemplos

Todos os valores em centavos inteiros BRL. Oferta, edição, vendedor, comissão e versão
do contrato vêm do servidor. Contrato especifica base de comissão, bps ou valor fixo,
regra de arredondamento, custos, devolução, calendário e reserva se suportada.
Sem contrato vigente/preço válido/capacidade do vendedor: não criar checkout.

Proposta de cálculo: base é preço final pago por edição após desconto, sem somar taxa
do processador. Para bps, arredondar meio centavo para cima com inteiros/BigInt;
application fee inclui somente comissão Writer no arranjo acima. Taxa efetiva vem da
transação de saldo/relatório do provedor, nunca de uma taxa estimada no navegador.
Não transformar configuração de contrato em alteração retroativa de pedido aprovado.

[Cenários de cálculo](04-cenarios-monetarios.json) usam preço de 3.000, comissão de
300, processamento de 120 e custo de disputa de 1.500 **como dados fictícios**.
Não são preços, percentuais ou tarifas aprovados da Stripe. A hipótese de taxa não
devolvida é um parâmetro do cenário; conciliação real registra o que o provedor fez.

| Cenário independente                 | Comprador: pago menos restituição | Comissão líquida Writer | Criador líquido | Custos hipotéticos |
| ------------------------------------ | --------------------------------: | ----------------------: | --------------: | -----------------: |
| Aprovado                             |                             3.000 |                     300 |           2.580 |                120 |
| Reembolso parcial de 1.200           |                             1.800 |                     180 |           1.500 |                120 |
| Reembolso integral                   |                                 0 |                       0 |            -120 |                120 |
| Disputa perdida, sem refund anterior |                                 0 |                       0 |          -1.620 |              1.620 |

Em todos: gasto líquido do comprador = comissão + líquido criador + custos.
Payout hipotético do aprovado de 2.000 deixa 580 no saldo e 2.000 pagos ao banco;
não produz nova receita. Valores negativos revelam déficit, não autorização de débito
bancário. Disponível, pendente e payout pago são estados separados.

Devolução acumulada de comissão = arredondamento de `C × R / P`, limitada a C;
R é refund acumulado confirmado, limitado a P. Cada evento retorna apenas a diferença
ainda não devolvida. Refund integral devolve exatamente C; perda de disputa devolve
o restante, sem devolver C duas vezes. C/P pertencem ao pedido original.
Refund de application fee precisa ser explícito e conciliado: principal e comissão
podem concluir/falhar em momentos distintos. Direito do comprador acompanha a reversão
do principal, não espera a comissão. Fonte: [refunds direct charges](https://docs.stripe.com/connect/direct-charges).

## Estados de pedido, disputa e acesso

Separar estado de pagamento, refund, disputa, comissão, entitlement e payout;
um único status não consegue representar simultaneamente todos eles.

| Gatilho confirmado no servidor                         | Acesso à edição e conteúdo derivado                         | Notas próprias                          |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------- |
| Redirecionamento do checkout/Session criada            | Nenhum novo direito                                         | Inalteradas                             |
| Pagamento aprovado conciliado                          | Ativo, salvo outro impedimento vigente                      | Acessíveis                              |
| Refund solicitado/pendente/falho                       | Sem revogação por esse fato                                 | Acessíveis                              |
| Refund parcial concluído                               | Mantém, salvo disputa/impedimento vigente                   | Acessíveis                              |
| Disputa aberta com perda financeira ainda não decidida | Suspenso; corta novos acessos/downloads                     | Acessíveis                              |
| Disputa ganha                                          | Restaura se direito continua válido e sem outro impedimento | Acessíveis                              |
| Refund integral concluído ou disputa perdida           | Revogado; novos acessos/downloads negados                   | Acessíveis                              |
| Retirada comum de catálogo                             | Mantém compra; novas vendas impedidas                       | Acessíveis                              |
| Revogação por violação de direitos/privacidade         | Bloqueia material afetado; atendimento e remediação         | Acessíveis, se próprias e não derivadas |

A última linha é salvaguarda técnica proposta, sem inventar restituição comercial
automática ou prometer conservar conteúdo cuja distribuição perdeu autorização.
Notas próprias não incluem uma cópia integral do produto; recursos derivados conservam
proveniência e não voltam por backup/variante. Campanhas continuam permitindo consultar
e editar notas independentes; abrir material comprado exige direito vigente.
Revelações derivadas para jogadores também perdem autorização durante suspensão/revogação.
Aplicar [privacidade e projeções](03-permissoes-e-privacidade.md), inclusive cache e arquivos.
Cópias baixadas e transferências já iniciadas não podem ser apagadas remotamente.

Webhook duplicado/fora de ordem não pode ressuscitar direito revogado. Conferir objeto
atual no contexto da conta correta, IDs, amount/currency, livemode e vínculo do pedido;
não confiar só em tipo/data do evento. Recebimento assinado e conciliação periódica
compartilham processamento idempotente. Registrar efeitos com recibos e tentativas;
falha de acesso não pode duplicar refund, e falha de refund não pode ser marcada concluída.
Fontes: [fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted),
[webhooks](https://docs.stripe.com/connect/webhooks), [idempotência](https://docs.stripe.com/api/idempotent_requests).

## Atendimento e dados comerciais

Oferta identifica vendedor/operadora, características, preço total, entrega e restrições.
Antes da compra, apresentar resumo corrigível; conservar oferta/licença/contrato aceitos
e confirmar compra e demanda de atendimento. Canal Writer mantém protocolo, datas,
responsável e resposta em até cinco dias; arrependimento usa a mesma ferramenta de
contratação e comunica o financeiro. CDC prevê sete dias para arrependimento fora
do estabelecimento; não usar download como renúncia automática nem prazo exclusivo
para defeitos. Contrato criador/Writer não elimina direitos do consumidor.
Fontes: [Decreto 7.962, arts. 2/4/5](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm),
[CDC, arts. 25/49](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm).

Matriz de dados comerciais deve registrar finalidade, fundamento, dados mínimos,
agentes/destinatários, prazo aplicável e descarte. KYC fica no provedor; Writer evita
copiar documentos pessoais. Exclusão de conta separa descarte de conservação legal
justificada. Não fixar prazo universal de retenção ou enquadramento fiscal por conta
própria. Confirmação/acesso LGPD têm resposta simplificada imediata ou completa em até
15 dias; isso não é prazo universal de toda solicitação.
Fonte: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).
Contratos/obrigações fiscais e agentes reais ainda precisam de validação adequada à operação.

## Direitos e produto de referência

[Manifesto e materiais originais](04-produto-de-referencia.md) conferem a origem de
cada componente da amostra técnica. Não inclui PDFs privados, SRD, marca/logo, mapa,
imagem ou texto de terceiro. É um roteiro original com assistência de IA, pendente
de revisão editorial e autorização comercial do operador; não uma oferta publicada.

V1 pode suportar aventura narrativa autoral sem selecionar regras D&D como requisito
de engine. Se um produto usar SRD, declarar versão/licença/atribuição/alterações por
componente, inclusive tradução; não usar “sem revenda” para restringir CC BY.
Selecionar o SRD do produto antes de exportá-lo, sem presumir licença de livros oficiais.
Fontes: [SRD oficial](https://www.dndbeyond.com/srd),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Importação privada não autoriza publicação ou venda; manuscrito não é prova de direitos.

## Casos exigidos na implementação

1. Preço adulterado no cliente/conta conectada errada/moeda diferente: negar fulfillment.
2. Webhook duplicado, concorrente, fora de ordem e perdido: uma concessão e razão conciliada.
3. Refund parcial acumulado, integral e falho: comissão exata, sem duplicar devolução.
4. Disputa aberta/ganha/perdida: suspender/restaurar/revogar sem apagar notas próprias.
5. Refund integral seguido de evento tardio aprovado: não restaurar acesso.
6. Retirada comum: comprador conserva edição; checkout pendente revalida disponibilidade.
7. Privacidade revogada: edição/variante/cache/download não reintroduzem conteúdo afetado.
8. Payout falho/devolvido: saldo e resultado reais conciliados; não duplicar receita.
9. Vendedor sem convite, requisitos pendentes ou contrato inválido: oferta não ativa.
10. Licença de terceiro ausente ou restrição incompatível: pacote não publica.

São critérios futuros, não testes comerciais executados. O cálculo local do JSON
valida somente aritmética dos cenários; gate geral não prova Connect nem aceitação humana.
