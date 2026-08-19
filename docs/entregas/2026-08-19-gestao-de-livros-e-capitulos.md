# Entrega — Gestão de Livros e Capítulos

- **Data**: 2026-08-19
- **Branch**: `master`
- **Plano de origem**: [docs/tasks/02-gestao-de-livros-e-capitulos.md](../tasks/02-gestao-de-livros-e-capitulos.md)

## Objetivo

Implementar a feature `books` permitindo que autores criem, editem e gerenciem seus livros na página inicial, estruturem capítulos com contagem de palavras e controlem o status da obra (Rascunho vs. Publicado) com sincronização em tempo real no Cloud Firestore.

## Funcionalidades entregues

- **Modelagem de Livros e Capítulos**: Definição dos tipos `Book`, `Chapter`, tipos de entrada para criação/edição e cálculo robusto de contagem de palavras ignorando marcações HTML.
- **Serviço de Persistência (`bookService`)**: Operações completas de CRUD no Firestore para livros (`books/{bookId}`) e subcoleções de capítulos (`books/{bookId}/chapters/{chapterId}`), reordenação sequencial e recálculo automático da soma total de palavras do livro.
- **Hooks Reativos (`useBooks` e `useChapters`)**: Gerenciamento de estado de carregamento, erros, listagem, criação, atualização, exclusão e reordenação com feedback otimista.
- **Componentes Visuais do Kit `@vitru/styleguide`**:
  - `BookCard`: Card com capa, gênero, sinopse, contagem de palavras, badge de status (Rascunho/Publicado), atalho para capítulos e ações de editar/excluir.
  - `BookFormDialog`: Modal de criação e edição com validação de título, gênero, sinopse e URL de capa.
  - `ChapterList`: Modal interativo com resumo de capítulos, contagem total de palavras, formulário de adição, renomeação inline, exclusão e reordenação para cima/baixo.
  - `BookList`: Grade de livros com tratamento completo dos 4 estados (`LoadingState`, `ErrorState`, `EmptyState` com CTA "Criar Primeiro Livro", e lista preenchida com toolbar).
- **Página Inicial (`HomePage`)**: Integração condicional exibindo a landing page para visitantes anônimos e a grade `BookList` para autores autenticados.

## Critérios de aceite

- [x] Autor autenticado na página inicial visualiza seus livros cadastrados em cards ricos.
- [x] Quando o autor não possui livros, é apresentado o `EmptyState` com botão claro "Criar Primeiro Livro".
- [x] Autor pode criar um novo livro informando título, gênero e sinopse; o livro é salvo no Firestore com status "draft".
- [x] Autor pode criar, renomear e excluir capítulos dentro de um livro.
- [x] A contagem total de palavras do livro reflete a soma dos capítulos cadastrados.
- [x] O autor pode alternar o status do livro entre "Rascunho" e "Publicado".
- [x] Testes cobrem o ciclo de vida de livros e capítulos no Firestore.

## Arquivos alterados

| Arquivo                                            | Mudança                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/features/books/model/book.ts`                 | Modelo e tipos de Livro (`Book`, `BookStatus`, `CreateBookInput`, `UpdateBookInput`). |
| `src/features/books/model/chapter.ts`              | Modelo de Capítulo (`Chapter`) e função `countWords`.                                 |
| `src/features/books/model/index.ts`                | Exportação dos modelos de livros e capítulos.                                         |
| `src/features/books/services/bookService.ts`       | CRUD no Firestore de livros e capítulos, reordenação e contagem de palavras.          |
| `src/features/books/services/index.ts`             | Exportação do serviço de livros.                                                      |
| `src/features/books/hooks/useBooks.ts`             | Hook para consumo e mutação de livros do autor.                                       |
| `src/features/books/hooks/useChapters.ts`          | Hook para consumo e mutação de capítulos da obra.                                     |
| `src/features/books/components/BookCard.tsx`       | Card de exibição do livro.                                                            |
| `src/features/books/components/BookFormDialog.tsx` | Modal de criação e edição de livro.                                                   |
| `src/features/books/components/ChapterList.tsx`    | Painel modal de gerenciamento e reordenação de capítulos.                             |
| `src/features/books/components/BookList.tsx`       | Grade principal de obras com toolbar e estados visuais.                               |
| `src/features/books/index.ts`                      | Interface pública da feature `books`.                                                 |
| `src/features/home/components/HomePage.tsx`        | Integração do `BookList` para usuários autenticados.                                  |
| `docs/tasks/02-gestao-de-livros-e-capitulos.md`    | Atualização do status dos critérios e tarefas.                                        |
| `tasks.md`                                         | Marca Tarefa 02 como concluída.                                                       |

## Testes

| Teste                                              | Tipo       | O que cobre                                                                         |
| -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `src/features/books/tests/chapter.test.ts`         | Unidade    | Contagem de palavras com textos simples, vazios e tags HTML.                        |
| `src/features/books/tests/bookService.test.ts`     | Serviço    | CRUD de livros, capítulos, reordenação, contagem de palavras e exclusão em cascata. |
| `src/features/books/tests/useBooks.test.ts`        | Hook       | Estados de carregamento, sucesso, erro, criação, edição e exclusão.                 |
| `src/features/books/tests/useChapters.test.ts`     | Hook       | Operações de capítulos, reordenação e recuperação de erros.                         |
| `src/features/books/tests/BookCard.test.tsx`       | Componente | Renderização de capa, metadados, status e disparos de ação.                         |
| `src/features/books/tests/BookFormDialog.test.tsx` | Componente | Modo de criação, modo de edição e submissão.                                        |
| `src/features/books/tests/ChapterList.test.tsx`    | Componente | Listagem, adição, renomeação inline, reordenação e exclusão.                        |
| `src/features/books/tests/BookList.test.tsx`       | Componente | Estados vazio, erro com retentativa, e grade com ações de livros.                   |
| `src/features/home/tests/HomePage.test.tsx`        | Componente | Alternância entre landing anônima e `BookList` autenticado.                         |

Saída da suíte:

```text
✓ src/features/books/tests/useBooks.test.ts (4 tests)
✓ src/features/books/tests/useChapters.test.ts (4 tests)
✓ src/features/books/tests/BookCard.test.tsx (3 tests)
✓ src/features/books/tests/BookFormDialog.test.tsx (2 tests)
✓ src/features/books/tests/ChapterList.test.tsx (6 tests)
✓ src/features/books/tests/BookList.test.tsx (3 tests)
✓ src/features/books/tests/bookService.test.ts (13 tests)
✓ src/features/books/tests/chapter.test.ts (3 tests)
✓ src/features/home/tests/HomePage.test.tsx (2 tests)

Test Files  18 passed (18)
     Tests  78 passed (78)
```

## Validações executadas

| Comando            | Resultado                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run validate` | Verde (Skills, Arquitetura, Documentação, Styleguide, Prettier, ESLint, Testes com 96.4% de cobertura, Build de produção e Smoke test HTTP). |

```text
Verificacao de skills OK: 12 skill(s) validada(s) e sincronizada(s).
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
Checking formatting... All matched files use Prettier code style!
ESLint: 0 warnings, 0 errors.
Coverage: Statements 96.4%, Branches 77.5%, Functions 95.94%, Lines 97.19%.
Build de produção: dist/ gerado e verificado com sucesso.
Smoke test do bundle OK.
```

## Fora do escopo

- Editor WYSIWYG de texto dos capítulos (Tarefa 04).
- Compêndio de lore e entidades (Tarefa 03).
- Leitor público `/read/:bookId` (Tarefa 06).

## Limitações e pendências conhecidas

- O conteúdo textual completo dos capítulos é manipulado em formato string/HTML bruto e será expandido com o editor TipTap/ProseMirror na Tarefa 04.

## Como verificar manualmente

1. Execute `npm run dev` e autentique-se na aplicação (via `/login` ou botão "Entrar").
2. Na página inicial (`/`), observe a mensagem de "Nenhum livro cadastrado" e clique em "Criar Primeiro Livro".
3. Preencha título ("As Crônicas de Eldoria"), gênero ("Fantasia Épica") e sinopse, e confirme.
4. O novo livro aparecerá na grade com status "Rascunho" e 0 palavras.
5. Clique em "Capítulos", adicione capítulos ("Capítulo 1: O Início", "Capítulo 2: A Jornada") e teste renomeá-los ou movê-los para cima/baixo.
6. Clique em "Publicar" para alternar o status do livro para "Publicado".
