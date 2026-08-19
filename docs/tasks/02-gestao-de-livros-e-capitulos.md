# Tarefa 02 — Gestão de Livros e Capítulos

## Contexto

Autores precisam organizar suas obras em múltiplos livros e estruturar cada obra em capítulos ordenados, com acompanhamento de contagem de palavras e status de publicação.

## Objetivo

Implementar a feature `books` com listagem e criação de livros no painel principal, gerenciamento de capítulos, contagem de palavras e controle de status (Rascunho vs. Publicado) com sincronização no Cloud Firestore.

## Escopo

- Implementação da feature `src/features/books`:
  - `model/book.ts` e `model/chapter.ts`: Tipagem de Livro (`id`, `authorId`, `title`, `genre`, `synopsis`, `coverUrl`, `status: 'draft' | 'published'`, `wordCount`, `createdAt`, `updatedAt`) e Capítulo (`id`, `bookId`, `title`, `order`, `wordCount`, `createdAt`, `updatedAt`).
  - `services/bookService.ts`: CRUD de livros e capítulos no Firestore (`books/{bookId}` e `books/{bookId}/chapters/{chapterId}`).
  - `components/BookCard.tsx`: Card de exibição do livro com capa, status, contagem de palavras e ações.
  - `components/BookList.tsx`: Grade de livros do autor no painel principal (`HomePage`), com estados de carregamento, vazio e erro.
  - `components/BookFormDialog.tsx`: Modal para criação e edição de dados do livro (título, sinopse, gênero, capa).
  - `components/ChapterList.tsx`: Lista e sumário de capítulos do livro com opção de adicionar e reordenar.
  - `hooks/useBooks.ts` e `hooks/useChapters.ts`: Hooks reativos para listar e manipular livros e capítulos.
  - `tests/`: Testes de unidade e componentes cobrindo criação, edição, listagem e cálculo de contagem de palavras.
- Integração da rota principal (`/`) exibindo a lista de livros do autor logado e acesso ao fluxo de criação.

## Não escopo

- O editor de texto rico dos capítulos (Tarefa 04).
- O leitor público `/read/:bookId` para visitantes (Tarefa 06).
- O compêndio de lore (Tarefa 03).

## Critérios de aceite

- [ ] Autor autenticado na página inicial visualiza seus livros cadastrados em cards ricos.
- [ ] Quando o autor não possui livros, é apresentado o `EmptyState` com botão claro "Criar Primeiro Livro".
- [ ] Autor pode criar um novo livro informando título, gênero e sinopse; o livro é salvo no Firestore com status "draft".
- [ ] Autor pode criar, renomear e excluir capítulos dentro de um livro.
- [ ] A contagem total de palavras do livro reflete a soma dos capítulos cadastrados.
- [ ] O autor pode alternar o status do livro entre "Rascunho" e "Publicado".
- [ ] Testes cobrem o ciclo de vida de livros e capítulos no Firestore.

## Tarefas

- [ ] 1. Gerar a feature `src/features/books` (`npm run generate:feature -- --name="books"`).
- [ ] 2. Definir os modelos e validações em `src/features/books/model/`.
- [ ] 3. Implementar serviços de persistência e consultas Firestore em `src/features/books/services/bookService.ts`.
- [ ] 4. Criar componentes visuais (`BookCard`, `BookList`, `BookFormDialog`, `ChapterList`) com `@vitru/styleguide`.
- [ ] 5. Implementar hooks de gerenciamento `useBooks` e `useChapters`.
- [ ] 6. Atualizar a página inicial (`HomePage`) para renderizar `BookList` para usuários autenticados.
- [ ] 7. Escrever testes em `src/features/books/tests/`.
- [ ] 8. Executar `npm run validate` e garantir 100% de sucesso.

## Riscos

- Sincronização de ordenação de capítulos: utilizar campo numérico monotônico `order` para garantir ordenação determinística no Firestore.
