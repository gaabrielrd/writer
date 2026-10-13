# W2-F4-11 — Operar repasses e acompanhar o catálogo

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-10](../fase-04-publicar-e-comercializar/10-reembolsos-e-disputas.md), [W2-F4-04](../fase-04-publicar-e-comercializar/04-criadores-convidados.md)
**Áreas propostas:** propostas commerce, creator e catalog; functions e operação. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Permitir ao operador acompanhar vendas e atendimento e ao criador entender valores e repasses de suas obras.

## Entradas e resultado

Entradas: pedidos/eventos, taxas e política de liquidação. Resultado: razão auditável, painéis restritos e conciliação de repasses.

## Escopo e comportamento

- Separar bruto, custos, comissão, disponível, reservado/pendente e repassado conforme D-06.
- Registrar lançamentos compensatórios e referência externa de repasse, sem inventar custódia ou mecanismo bancário.
- Mostrar ao criador somente seus valores e dados necessários; operador controla catálogo/denúncias/retirada conforme papel.
- Tratar falha de repasse, reembolso após liquidação, suspensão de vendedor e correção com trilha.

## Passos de execução

- [ ] Definir razão financeira e visão por papel.
- [ ] Integrar repasse pelo arranjo aprovado e reconciliação.
- [ ] Montar painéis de criador/operador e fila de atendimento.
- [ ] Conferir cálculos e fechamento com pedido de livro e aventura.

## Critérios de aceite

- [ ] Totais batem com eventos e dados do provedor.
- [ ] Reembolso altera valores futuros de modo compensatório e rastreável.
- [ ] Criador não consulta pedidos financeiros de outro vendedor.
- [ ] Repasse falho permanece pendente e não é apresentado como concluído.

## Validação

- Contrato de razão com aprovação, refund, disputa e payout.
- Regras/componentes: isolamento de vendedores e privilégios de operador.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Arranjo comercial deve suportar vendedor convidado; não simular split não oferecido pelo provedor.
- Operação precisa caber nas 20 h semanais totais.

## Não escopo

Relatórios contábeis certificados, taxas arbitrárias, carteira de dinheiro interna e repasse sem confirmação.
