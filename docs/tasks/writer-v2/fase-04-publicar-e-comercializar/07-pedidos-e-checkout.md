# W2-F4-07 — Criar pedidos e iniciar checkout

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-05](../fase-04-publicar-e-comercializar/05-catalogo-series-e-amostras.md), [W2-F4-06](../fase-04-publicar-e-comercializar/06-ofertas-e-precos.md)
**Áreas propostas:** proposta commerce; functions e shared/config/env. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Iniciar uma compra rastreável com preço confirmado e permitir ao comprador acompanhar o resultado.

## Entradas e resultado

Entradas: conta compradora, oferta vigente e confirmação de compra. Resultado: pedido/cotação congelados e sessão do provedor associada.

## Escopo e comportamento

- Validar comprador, vendedor e oferta no servidor; definir tratamento de compra repetida antes do checkout.
- Criar pedido idempotente e vincular referência única do provedor sem segredos no browser.
- Manter estados de pedido, pagamento e entrega distinguíveis; sucesso de redirecionamento não concede acesso.
- Tratar cancelamento, expiração, conexão interrompida e pagamento tardio conforme política.

## Passos de execução

- [ ] Implementar cotação/pedido e adaptador do provedor escolhido.
- [ ] Criar checkout com idempotência e retorno verificável.
- [ ] Montar confirmação, retorno e acompanhamento de pedido.
- [ ] Testar tampering, refresh, dupla confirmação e retorno forjado.

## Critérios de aceite

- [ ] Pedido preserva edição, moeda, preço e termos da cotação.
- [ ] Duplo clique não cria cobrança duplicada.
- [ ] Página de sucesso forjada não ativa direito de acesso.
- [ ] Comprador vê pendente/falha/cancelado sem receber confirmação financeira fictícia.

## Validação

- Sandbox do provedor: aprovado, cancelado e timeout.
- Backend/E2E: preço adulterado, conta errada e retry com mesma chave.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- SDK/dependência comercial exige justificativa e segredo exclusivamente no servidor.
- Métodos e estados reais dependem de D-08.

## Não escopo

Cobrança real neste planejamento, coleta própria de dados de cartão e acesso pago concedido pelo cliente.
