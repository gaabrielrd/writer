# Entrega — Página Dedicada do Livro com Abas e Correção de Overflows

- **Data**: 2026-08-19
- **Branch**: `master`

## Objetivo

Implementar uma página própria/dedicada para o livro (`/books/:bookId`) acessível ao clicar no card da obra, com abas para Capítulos (com modo inline), Compêndio (reutilizando o catálogo de Lore) e Publicação, eliminando o acúmulo de botões e corrigindo os overflows em telas menores.

## Funcionalidades entregues

- **Card de Livro Simplificado e Navegável (`BookCard`)**:
  - Transformado em card clicável com link direto para `/books/:bookId`.
  - Removido o agrupamento excessivo de botões de ação que causava quebra visual e overflow.
  - Efeito suave de elevação ao passar o cursor (`hover`).
- **Página Dedicada do Livro (`BookPage`)**:
  - Rota `/books/:bookId` com busca do livro, estados de carregamento e tratamento de erro ("Livro não encontrado").
  - Cabeçalho com capa da obra, título, gênero, sinopse, contagem de palavras e status (Rascunho/Publicado).
  - Ações do autor no cabeçalho: Editar metadados (via `BookFormDialog`) e Excluir obra.
  - Link de retorno "← Minhas Obras".
  - **Três abas de navegação**:
    1. **Capítulos**: Gerenciamento completo de capítulos inline (criar, renomear, mover para cima/baixo, excluir e botão "Escrever").
    2. **Compêndio**: Aba integrada com o `LoreTab`, permitindo busca, filtragem por categorias, visualização de fichas, criação e edição de entidades sem sair da página do livro.
    3. **Publicação**: Painel informativo de status com botão para alternar entre "Rascunho" e "Publicar Obra".
- **Capítulos Inline e Correção de Overflows (`ChapterList`)**:
  - Suporte à prop `mode="dialog" | "inline"`.
  - Correção de overflow com `flex-wrap` nos itens e ações de capítulo.
  - Responsividade aprimorada para mobile com classe `.actionLabel`.
- **Componente Reutilizável de Lore (`LoreTab`)**:
  - Extração do catálogo de Lore para componente que recebe `book`, viabilizando tanto a aba dentro de `BookPage` quanto a rota independente `/books/:bookId/lore`.

## Arquivos alterados

| Arquivo                                                | Mudança                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/features/books/components/BookPage.tsx`           | [NOVO] Página dedicada do livro com abas e controle de publicação/edição. |
| `src/features/books/components/BookPage.module.css`    | [NOVO] Estilos responsivos da página do livro e barra de abas.            |
| `src/features/books/tests/BookPage.test.tsx`           | [NOVO] Testes de renderização, navegação de abas, edição e publicação.    |
| `src/features/lore/components/LoreTab.tsx`             | [NOVO] Componente reutilizável com busca, filtros e fichas de compêndio.  |
| `src/features/books/components/BookCard.tsx`           | Card transformado em link limpo e navegável.                              |
| `src/features/books/components/BookCard.module.css`    | Remoção das ações antigas e adição de estilo de link com hover.           |
| `src/features/books/components/BookList.tsx`           | Simplificação da listagem para foco exclusivo em exibição e criação.      |
| `src/features/books/components/ChapterList.tsx`        | Suporte ao modo inline e ocultação responsiva de rótulos.                 |
| `src/features/books/components/ChapterList.module.css` | `flex-wrap` e quebras responsivas nos botões de ação.                     |
| `src/features/books/index.ts`                          | Exportação de `BookPage`.                                                 |
| `src/features/lore/components/LorePage.tsx`            | Delegação para o novo `LoreTab`.                                          |
| `src/features/lore/components/LorePage.module.css`     | Estilos complementares para o `LoreTab`.                                  |
| `src/features/lore/index.ts`                           | Exportação de `LoreTab`.                                                  |
| `src/app/routes/index.tsx`                             | Inclusão da rota `books/:bookId`.                                         |
| `src/features/books/tests/BookCard.test.tsx`           | Atualização para testar o comportamento como link.                        |
| `src/features/books/tests/BookList.test.tsx`           | Atualização para refletir a interface simplificada.                       |
| `src/features/lore/tests/LorePage.test.tsx`            | Ajuste assíncrono para renderização com `LoreTab`.                        |

## Testes e Validações

- Suíte de testes: **202 testes passando** em 47 arquivos.
- Cobertura: **90.74% de statements** e **92.65% de linhas**.
- `npm run validate` executado com sucesso (skills, arquitetura, docs, styleguide, Prettier, ESLint, testes e build de produção).
