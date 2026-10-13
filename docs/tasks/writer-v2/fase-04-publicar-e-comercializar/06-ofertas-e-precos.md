# W2-F4-06 — Definir ofertas, preços e versões comerciais

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-04](../fase-04-publicar-e-comercializar/04-criadores-convidados.md), [W2-F1-04](../fase-01-direcao-e-fundamentos/04-regras-comerciais-e-direitos.md)
**Áreas propostas:** proposta commerce; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Representar condições de compra de uma edição com valores e regras validados no servidor.

## Entradas e resultado

Entradas: edição aprovada, moeda, preço e regras D-05/D-06/D-07. Resultado: oferta versionada ativa ou retirada, com preço conferível.

## Escopo e comportamento

- Propor compra avulsa de uma obra por pedido para aprovação na fase 1; limites de carrinho não são presumidos.
- Calcular valores em unidade mínima da moeda, incluindo taxas/comissão segundo política.
- Fixar edição, vendedor, condições e versão da oferta; alteração de preço não altera pedido já cotado.
- Permitir retirada e impedir nova compra sem perder histórico de pedidos.

## Passos de execução

- [ ] Especificar contrato de preço/cotação e estados da oferta.
- [ ] Implementar validação, versionamento e autorização no servidor.
- [ ] Montar edição e prévia das condições comerciais.
- [ ] Cobrir extremos, moeda incompatível e alteração concorrente.

## Critérios de aceite

- [ ] Cliente não define livremente total ou beneficiário.
- [ ] Cotação informa moeda, valor final, edição e condições vigentes.
- [ ] Pedido em andamento segue regra aprovada quando preço/oferta muda.
- [ ] Oferta retirada não pode iniciar novo checkout.

## Validação

- Modelo/backend: unidades monetárias, limites, taxas e versões.
- Regras/componentes: vendedor errado, oferta inválida e preço alterado.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- D-05/D-06 ainda precisam de valores; fixtures não definem preços reais.
- Configuração comercial não reutiliza saldo/recibo de créditos IA.

## Não escopo

Cupons, assinaturas, preços dinâmicos e taxas inventadas pela implementação.
