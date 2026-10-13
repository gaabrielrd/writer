# W2-F4-09 — Oferecer biblioteca e entrega protegida

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-08](../fase-04-publicar-e-comercializar/08-webhooks-e-conciliacao.md), [W2-F4-02](../fase-04-publicar-e-comercializar/02-epub-e-pacote-externo.md), [W2-F4-03](../fase-04-publicar-e-comercializar/03-pacote-de-aventura.md)
**Áreas propostas:** books; propostas library, publications e commerce; functions e Storage. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Entregar leitura e arquivos autorizados e permitir retomar o consumo da edição adquirida.

## Entradas e resultado

Entradas: direito ativo, edição, política de atualização e conta. Resultado: biblioteca de livros/aventuras, leitura e download autorizados.

## Escopo e comportamento

- Listar direitos confirmados, distinguindo compra pendente, edição indisponível e acesso revogado.
- Reutilizar leitor por API pública com autorização adequada; retomar capítulo/progresso segundo D-04.
- Gerar acesso a arquivo no servidor com duração/cache compatíveis com política; URL estável pública não protege arquivo pago.
- Atender retirada/revogação de origem e exclusão de conta conforme D-07/D-09; informar alternativa/suporte aprovado.

## Passos de execução

- [ ] Implementar consulta de direitos e autorização de leitura/download.
- [ ] Montar biblioteca e retomada de leitura.
- [ ] Integrar artefatos, progresso e tratamento de indisponibilidade.
- [ ] Testar comprador A/B, anônimo, link expirado e revogação ativa.

## Critérios de aceite

- [ ] Compra pendente não fornece livro completo nem pacote de mestre.
- [ ] Um comprador não abre a biblioteca/arquivo de outro por ID.
- [ ] Artefato corresponde à edição/hash e licença mostrados no pedido.
- [ ] Revogação bloqueia novo acesso; não promete apagar download prévio.

## Validação

- Regras Firestore/Storage e URLs diretas entre contas.
- E2E: retomada, sessão expirada, download interrompido e edição retirada.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- SDK cache não deve servir obra quando autorização exige confirmação vigente.
- Exportação/download existe junto de limite explícito de revogação.

## Não escopo

DRM inviolável, biblioteca financeira pública e acesso automático a todas as obras do criador.
