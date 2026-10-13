# W2-F4-10 — Tratar reembolsos, disputas e retirada

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-09](../fase-04-publicar-e-comercializar/09-biblioteca-e-entrega.md), [W2-F4-08](../fase-04-publicar-e-comercializar/08-webhooks-e-conciliacao.md)
**Áreas propostas:** proposta commerce, library e campaigns; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Dar ao comprador e operador um fluxo de atendimento e reversão coerente com a política comercial aprovada.

## Entradas e resultado

Entradas: pedido, solicitação/decisão de reembolso ou disputa confirmada. Resultado: atendimento rastreável, reversão financeira e acesso tratado conforme política.

## Escopo e comportamento

- Apresentar canal/procedimento de solicitação, motivos/estados e decisão autorizada.
- Confirmar reversão no provedor, registrar lançamento compensatório e recalcular direito/repasses.
- Tratar eventos tardios/repetidos e valores parciais se o provedor os emitir, mesmo quando UI inicial só oferecer reembolso integral.
- Aplicar política de campanhas já instanciadas, arquivos baixados, retirada e exclusão sem apagar notas dos jogadores silenciosamente.

## Passos de execução

- [ ] Implementar casos de atendimento e operações autorizadas.
- [ ] Integrar estorno/disputa ao estado e razão financeira.
- [ ] Aplicar resultado aos direitos e informar comprador/criador.
- [ ] Testar compensação, repetição, repasse já ocorrido e origem retirada.

## Critérios de aceite

- [ ] Solicitação não é tratada como reembolso efetivado.
- [ ] Evento repetido não devolve dinheiro ou compensa saldo duas vezes.
- [ ] Direito e campanha criada seguem a política escolhida em D-07.
- [ ] Operador vê falha/pendência e pode conciliar sem editar registros históricos.

## Validação

- Sandbox/backend: estorno, disputa e pagamento tardio.
- E2E/regras: comprador solicita, operador decide, terceiro não altera caso.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Prazos e elegibilidade dependem de D-06 e contexto regional; não codificar suposições jurídicas.
- Não apagar dados particulares como efeito colateral financeiro.

## Não escopo

Reembolso automático sem política, apagar arquivo no dispositivo do comprador e balanceamento financeiro manual por edição de saldo.
