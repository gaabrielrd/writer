# Tarefa 03 — Compêndio de Lore (Worldbuilding)

## Contexto

Manter a consistência do universo da história exige um compêndio organizado de Personagens, Locais, Conceitos e Outros elementos, com fichas completas, relações e apelidos para posterior detecção no editor de texto.

## Objetivo

Implementar a feature `lore` com o compêndio completo de entidades vinculado a um livro, formulário de cadastro estruturado (com apelidos/aliases, resumo curto para tooltip, ficha detalhada, relações entre entidades e visibilidade pública), motor de correspondência textual de entidades e tela de visualização/gerenciamento do compêndio (`/books/:bookId/lore`).

## Escopo

- Implementação da feature `src/features/lore`:
  - `model/loreEntity.ts`: Tipagem de `LoreCategory` (`'character' | 'location' | 'concept' | 'other'`), `LoreRelation` (`targetEntityId`, `relationType`, `description`) e `LoreEntity` (`id`, `bookId`, `name`, `aliases: string[]`, `category`, `summary: string`, `details: LoreDetails`, `relations: LoreRelation[]`, `isPublic: boolean`).
  - `model/loreMatcher.ts`: Motor utilitário para identificar e casar termos e apelidos do lore em qualquer string ou bloco de texto com índices de início e fim.
  - `services/loreService.ts`: CRUD de entidades de lore no Firestore (`books/{bookId}/lore/{entityId}`).
  - `components/LorePage.tsx`: Tela de compêndio do livro com filtros por categoria, barra de busca e visualização em grade ou lista.
  - `components/LoreEntityCard.tsx`: Card de exibição da entidade com badge de categoria, resumo curto, lista de relações e indicador de visibilidade.
  - `components/LoreEntityForm.tsx`: Formulário completo com campos para nome, apelidos (com tags/separação por vírgula), resumo (limite de 140 caracteres), ficha detalhada e seleção de relações.
  - `components/LoreDrawer.tsx`: Barra lateral retrátil para visualização e edição rápida de uma entidade sem sair da tela.
  - `components/LoreTooltip.tsx`: Balão visual para exibição do resumo curto e categoria ao passar o cursor sobre um termo.
  - `hooks/useLore.ts`: Hook reativo para carregar, buscar e filtrar entidades do livro.
  - `tests/`: Testes de unidade do `loreMatcher` (correspondência exata, maiúsculas/minúsculas, apelidos múltiplos) e testes de componentes do compêndio.
- Registro da rota `/books/:bookId/lore` em `src/app/routes/index.tsx`.

## Não escopo

- O editor WYSIWYG de escrita (Tarefa 04 integrará o `loreMatcher`, `LoreTooltip` e `LoreDrawer`).
- Assistente de IA utilizando os dados de lore como prompt (Tarefa 05).

## Critérios de aceite

- [ ] Autor pode acessar a página do compêndio `/books/:bookId/lore` e visualizar todas as entidades cadastradas organizadas por categoria.
- [ ] Formulário permite cadastrar entidade com nome, apelidos/aliases, resumo de até 140 caracteres, detalhes, relações com outras entidades e toggle de visibilidade pública.
- [ ] O `loreMatcher` identifica com precisão termos e apelidos no texto, retornando os trechos casados e a entidade correspondente.
- [ ] Entidades podem ser editadas e excluídas com atualização imediata no Firestore.
- [ ] Busca por texto filtra entidades instantaneamente por nome, apelidos ou resumo.
- [ ] Testes automatizados cobrem o `loreMatcher` com múltiplos cenários (plurais, variações, apelidos, pontuação) e os componentes do compêndio.

## Tarefas

- [ ] 1. Gerar a feature `src/features/lore` (`npm run generate:feature -- --name="lore"`).
- [ ] 2. Implementar os modelos e tipos em `src/features/lore/model/loreEntity.ts`.
- [ ] 3. Implementar e testar rigorosamente o motor de correspondência em `src/features/lore/model/loreMatcher.ts`.
- [ ] 4. Implementar o serviço de persistência no Firestore em `src/features/lore/services/loreService.ts`.
- [ ] 5. Construir os componentes de formulário, cards, drawer e tooltips com o kit `@vitru/styleguide`.
- [ ] 6. Criar a página de compêndio `LorePage` com busca, filtros por categoria e ordenação.
- [ ] 7. Registrar a rota `/books/:bookId/lore` nas rotas da aplicação.
- [ ] 8. Escrever testes em `src/features/lore/tests/`.
- [ ] 9. Executar `npm run validate` e garantir 100% de sucesso.

## Riscos

- Performance de regex/matching em textos longos: o `loreMatcher` deve compilar uma árvore de busca ou regex otimizada com limites de palavras (`\b`) para não degradar a digitação.
