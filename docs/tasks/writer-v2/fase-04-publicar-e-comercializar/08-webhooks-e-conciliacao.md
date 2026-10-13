# W2-F4-08 — Confirmar eventos e conciliar pagamentos

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-07](../fase-04-publicar-e-comercializar/07-pedidos-e-checkout.md)
**Áreas propostas:** proposta commerce; functions e operação. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Usar confirmação confiável do provedor para registrar pagamento e direito de acesso sem depender do navegador do comprador.

## Entradas e resultado

Entradas: webhook verificado ou consulta autorizada ao provedor. Resultado: evento deduplicado, pedido atualizado, direito/recibo persistidos e conciliação disponível.

## Escopo e comportamento

- Verificar autenticidade, referência, valor, moeda e conta beneficiária conforme contrato do provedor.
- Deduplicar eventos e usar transições compatíveis com repetição/ordem invertida e reembolso anterior ao evento pago.
- Persistir registro financeiro e concessão idempotente antes de confirmar processamento; notificação/artefato pode ser retomado.
- Reconciliar eventos perdidos e pedidos pendentes; cliente não cria direitos, lançamentos ou status pago.

## Passos de execução

- [ ] Definir estados e tabela de transição separando pagamento/entrega.
- [ ] Implementar webhook e processamento transacional/retomável.
- [ ] Adicionar conciliação e fila de falhas operável.
- [ ] Testar replay, assinatura inválida, divergência de valor e eventos fora de ordem.

## Critérios de aceite

- [ ] Evento duplicado não duplica direito ou lançamento.
- [ ] Pagamento divergente não é aceito como compra válida.
- [ ] Reembolso/disputa não é revertido por evento pago antigo.
- [ ] Pagamento aprovado sem retorno ao site aparece na biblioteca após processamento.

## Validação

- Backend/sandbox: autenticidade, replay, inversão e consulta de conciliação.
- Regras: bloqueio de concessão/status pelo browser; falha após persistência.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Webhook falha de modo recuperável, sem descartar evento antes de persistir.
- Não assumir exatamente uma entrega por parte do provedor.

## Não escopo

Autoridade do redirecionamento, logs com payload sensível e escrituração financeira apenas no navegador.
