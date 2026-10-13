# W2-F4-01 — Preparar edições e projeções de publicação

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F3-08](../fase-03-compartilhar-e-usar/08-piloto-duplo-de-uso.md), [W2-F1-04](../fase-01-direcao-e-fundamentos/04-regras-comerciais-e-direitos.md)
**Áreas propostas:** books, lore; proposta publications; functions, Firestore e Storage. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Publicar uma versão explícita de livro/aventura e manter rascunho, conteúdo público e edição paga em fronteiras separadas.

## Entradas e resultado

Entradas: conteúdo salvo, audiência, autoria pública e edição escolhida. Resultado: edição imutável preparada e ativada após validação, com política de acesso.

## Escopo e comportamento

- Gerar retrato de capítulos/partes, ordem, assets e lore permitido; permitir prévia antes da confirmação.
- Coleções de publicBooks continuam anônimas somente para conteúdo gratuito/amostra autorizado; corpo pago usa fronteira autenticada distinta.
- Distinguir versão editorial de versão de privacidade; alteração de rascunho não atualiza edição.
- Revogação de lore, exclusão da origem e retirada de venda seguem D-07/D-09, com atendimento ao comprador e invalidação de futuros artefatos.

## Passos de execução

- [ ] Definir formato e migração coexistindo com publicações atuais.
- [ ] Implementar preparação, validação de origem e ativação no servidor.
- [ ] Montar prévia, publicação e retirada com alcance explícito.
- [ ] Testar edição antiga, falha parcial e revogação durante preparação.

## Critérios de aceite

- [ ] Texto pago não está em documento/arquivo acessível anonimamente.
- [ ] Preparação incompleta não vira edição ativa.
- [ ] Editar rascunho não muda a edição comprada silenciosamente.
- [ ] Revogação não pode ser revertida reativando snapshot antigo.

## Validação

- Backend/regras: fonte alterada, projeção paga, campos extras, versão antiga e rollback.
- E2E: prévia e publicação de livro/aventura com temas e contas separadas.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- A política de acesso a compra antiga precisa ser resolvida em D-07 antes; imutabilidade não supera consentimento revogado.
- Manter compatibilidade de publicações históricas sem forçar republicação em massa.

## Não escopo

Publicar automaticamente rascunho, reutilizar coleção pública para paywall e liberar revisão privada como edição comercial.
