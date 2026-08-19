---
name: document-delivery
description: Registra em docs/entregas a evidência do que foi entregue — funcionalidades, testes e validações executados; use depois de implementar um plano com implement-feature e com npm run validate verde.
---

# Documentar entrega

## Finalidade

Produzir a evidência da entrega: um arquivo em `docs/entregas` que
descreve as funcionalidades implementadas, os testes que as cobrem e o
resultado das validações executadas.

## Quando usar

- Depois de executar um plano com `implement-feature`.
- Antes de preparar o pull request (`prepare-pull-request`).

## Quando não usar

- Para realinhar `docs/` ao código ou registrar ADR: use
  `update-documentation`.
- Para avaliar a qualidade do diff: use `review-changes`.
- Enquanto `npm run validate` não estiver verde: sem validação não há
  evidência a registrar.

## Processo

1. Confirme que a implementação terminou e que `npm run validate` passou.
   Se algo estiver falhando, pare e corrija antes de documentar.
2. Recupere o objetivo, o escopo e os critérios de aceite do plano de
   origem (`docs/tasks/…` ou o plano aprovado na conversa).
3. Levante os arquivos alterados com `git diff --stat` (ou
   `git diff --stat main...HEAD` quando a entrega é uma branch inteira).
4. Liste os testes adicionados ou atualizados e o que cada um cobre.
5. Copie a saída real dos comandos executados. Não invente, não estime
   e não descreva resultado que você não viu.
6. Descreva cada funcionalidade pelo que passou a ser possível para quem
   usa, não pela implementação.
7. Registre o que ficou fora do escopo, as limitações e as pendências
   conhecidas.
8. Escreva o arquivo em `docs/entregas/AAAA-MM-DD-<slug-da-entrega>.md`,
   a partir de `assets/delivery-template.md`.
9. Uma entrega por arquivo. Não sobrescreva entregas anteriores; se a
   mesma entrega ganhar um incremento, acrescente uma seção datada ao
   arquivo existente.
10. Não altere código nesta etapa; apenas o documento da entrega.
11. Execute `npm run check:docs` para garantir que os links e os comandos
    citados existem.

## Resultado esperado

- Arquivo criado em `docs/entregas`, seguindo o modelo.
- Funcionalidades entregues, com os critérios de aceite marcados.
- Arquivos alterados.
- Testes adicionados ou atualizados e o resultado da suíte.
- Validações executadas, com a saída real.
- Fora do escopo, limitações e pendências.
