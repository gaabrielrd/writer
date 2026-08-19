# Entrega — Compêndio de Lore (Worldbuilding)

- **Data**: 2026-08-19
- **Branch**: `master`
- **Plano de origem**: [docs/tasks/03-compendio-de-lore.md](../tasks/03-compendio-de-lore.md)

## Objetivo

Implementar a feature `lore` com o compêndio completo de entidades vinculado a um livro, formulário de cadastro estruturado (nome, apelidos/aliases, resumo curto com limite de 140 caracteres, ficha detalhada, relações entre entidades e controle de visibilidade pública), motor de correspondência textual de entidades (`loreMatcher`) com algoritmo de escalonamento de intervalos ponderados, e página de compêndio (`/books/:bookId/lore`) com filtros e busca instantânea.

## Funcionalidades entregues

- **Modelagem de Entidades e Relações de Lore**: Definição dos tipos `LoreCategory` (`character`, `location`, `concept`, `other`), `LoreRelation` (ligação direcionada com descrição e tipo de relação) e `LoreEntity`.
- **Motor de Correspondência Textual (`loreMatcher`)**:
  - Detecção exata e por aliases com limites seguros de caracteres (suporte completo a acentuação e pontuação).
  - Algoritmo de _Weighted Interval Scheduling_ (programação dinâmica com peso quadrático no comprimento) para priorizar expressões mais longas e selecionar o melhor conjunto de termos sem sobreposições.
- **Serviço de Persistência (`loreService`)**: Operações CRUD completas no Cloud Firestore em `books/{bookId}/lore/{entityId}`.
- **Hook Reativo (`useLore`)**: Listagem, carregamento, erros, busca em tempo real (nome, resumo e apelidos) e filtro por abas de categoria.
- **Componentes do Kit `@vitru/styleguide`**:
  - `LoreTooltip`: Tooltip acessível acionado por hover/foco para visualização do resumo curto e badge de categoria sobre menções no texto.
  - `LoreEntityCard`: Card com ícone de categoria, badges oficiais, resumo, contagem de relações, indicador de visibilidade pública/privada e ações.
  - `LoreEntityForm`: Modal de cadastro e edição com seletor de categoria, input de aliases, contador de 140 caracteres no resumo, ficha detalhada em markdown/texto, gerenciamento de relações dinâmicas e toggle de visibilidade.
  - `LoreDrawer`: Painel de visualização completa da ficha com resolução de nomes das entidades relacionadas e atalho para edição.
  - `LorePage`: Tela completa do compêndio (`/books/:bookId/lore`) com cabeçalho, barra de busca, abas com contadores por categoria, grade de cards e tratamento de estados (`LoadingState`, `ErrorState`, `EmptyState` inicial e `EmptyState` de busca vazia).
- **Integração no `BookCard` e Rotas**: Atalho "Compêndio" adicionado no card do livro e registro da rota `/books/:bookId/lore` em `src/app/routes/index.tsx`.

## Critérios de aceite

- [x] Autor pode acessar a página do compêndio `/books/:bookId/lore` e visualizar todas as entidades cadastradas organizadas por categoria.
- [x] Formulário permite cadastrar entidade com nome, apelidos/aliases, resumo de até 140 caracteres, detalhes, relações com outras entidades e toggle de visibilidade pública.
- [x] O `loreMatcher` identifica com precisão termos e apelidos no texto, retornando os trechos casados e a entidade correspondente.
- [x] Entidades podem ser editadas e excluídas com atualização imediata no Firestore.
- [x] Busca por texto filtra entidades instantaneamente por nome, apelidos ou resumo.
- [x] Testes automatizados cobrem o `loreMatcher` com múltiplos cenários (plurais, variações, apelidos, pontuação) e os componentes do compêndio.

## Arquivos alterados

| Arquivo                                           | Mudança                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `src/features/lore/model/loreEntity.ts`           | Tipos e categorias de entidades e relações de lore.                 |
| `src/features/lore/model/loreMatcher.ts`          | Algoritmo de correspondência textual e escalonamento de intervalos. |
| `src/features/lore/model/index.ts`                | Exportação dos modelos de lore.                                     |
| `src/features/lore/services/loreService.ts`       | CRUD de entidades de lore no Cloud Firestore.                       |
| `src/features/lore/services/index.ts`             | Exportação do serviço de lore.                                      |
| `src/features/lore/hooks/useLore.ts`              | Hook de gerenciamento, busca e filtragem de entidades.              |
| `src/features/lore/components/LoreTooltip.tsx`    | Balão de resumo curto para termos de lore.                          |
| `src/features/lore/components/LoreEntityCard.tsx` | Card visual da entidade no compêndio.                               |
| `src/features/lore/components/LoreEntityForm.tsx` | Modal com formulário estruturado de cadastro e relações.            |
| `src/features/lore/components/LoreDrawer.tsx`     | Dossiê/ficha completa com resolução de relações.                    |
| `src/features/lore/components/LorePage.tsx`       | Tela de compêndio do livro.                                         |
| `src/features/lore/index.ts`                      | Exportações públicas da feature `lore`.                             |
| `src/features/books/components/BookCard.tsx`      | Adicionado botão de navegação rápida para o compêndio do livro.     |
| `src/app/routes/index.tsx`                        | Registro da rota `/books/:bookId/lore`.                             |
| `docs/tasks/03-compendio-de-lore.md`              | Atualização de status e critérios da Tarefa 03.                     |
| `tasks.md`                                        | Atualização do progresso das tarefas.                               |

## Testes

| Teste                                             | Tipo       | O que cobre                                                                                      |
| ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `src/features/lore/tests/loreMatcher.test.ts`     | Unidade    | Correspondência exata, aliases, fronteira de palavras, acentuação e prioridade de termos longos. |
| `src/features/lore/tests/loreService.test.ts`     | Serviço    | CRUD no Firestore, ordenação e limite de caracteres no resumo.                                   |
| `src/features/lore/tests/useLore.test.ts`         | Hook       | Carregamento, erros, busca em tempo real e filtros de categoria.                                 |
| `src/features/lore/tests/LoreTooltip.test.tsx`    | Componente | Hover e foco com exibição do resumo curto e badges.                                              |
| `src/features/lore/tests/LoreEntityCard.test.tsx` | Componente | Exibição de metadados, visibilidade pública/privada e disparos de ação.                          |
| `src/features/lore/tests/LoreEntityForm.test.tsx` | Componente | Criação, edição, validações e adição/edição/remoção de relações.                                 |
| `src/features/lore/tests/LoreDrawer.test.tsx`     | Componente | Visualização completa da ficha e resolução de relações.                                          |
| `src/features/lore/tests/LorePage.test.tsx`       | Componente | Ciclo de vida da página, busca, abas de categoria, drawer e exclusão.                            |

Saída da suíte:

```text
✓ src/features/lore/tests/loreMatcher.test.ts (6 tests)
✓ src/features/lore/tests/loreService.test.ts (6 tests)
✓ src/features/lore/tests/useLore.test.ts (5 tests)
✓ src/features/lore/tests/LoreTooltip.test.tsx (1 test)
✓ src/features/lore/tests/LoreEntityCard.test.tsx (2 tests)
✓ src/features/lore/tests/LoreEntityForm.test.tsx (2 tests)
✓ src/features/lore/tests/LoreDrawer.test.tsx (2 tests)
✓ src/features/lore/tests/LorePage.test.tsx (5 tests)

Test Files  26 passed (26)
     Tests  107 passed (107)
```

## Validações executadas

| Comando            | Resultado                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run validate` | Verde (Skills, Arquitetura, Documentação, Styleguide, Prettier, ESLint, Testes com 96.57% de cobertura, Build de produção e Smoke test HTTP). |

```text
Verificacao de skills OK: 12 skill(s) validada(s) e sincronizada(s).
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
Checking formatting... All matched files use Prettier code style!
ESLint: 0 warnings, 0 errors.
Coverage: Statements 96.57%, Branches 76.93%, Functions 96.74%, Lines 97.7%.
Build de produção: dist/ gerado e verificado com sucesso.
Smoke test do bundle OK.
```

## Fora do escopo

- Integração inline com o editor de texto rico dos capítulos (Tarefa 04).
- Injeção das entidades como contexto para sugestões de IA (Tarefa 05).

## Como verificar manualmente

1. Execute `npm run dev` e autentique-se.
2. Crie ou selecione um livro na página inicial.
3. No card do livro, clique no botão "Compêndio".
4. Na página `/books/:bookId/lore`, clique em "Nova Entidade" e cadastre um Personagem (ex: "Arthur", apelido: "Pendragon", resumo: "Lendário rei de Camelot").
5. Cadastre um Local (ex: "Camelot", resumo: "Capital do reino") e adicione uma relação vinculando Arthur a Camelot como "Governante de".
6. Teste os filtros por categoria e a busca em tempo real na barra de pesquisa.
7. Clique em "Ver Ficha" para abrir o dossiê da entidade.
