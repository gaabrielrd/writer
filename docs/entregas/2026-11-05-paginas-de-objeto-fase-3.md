# Páginas de objeto, fase 3 — 2026-11-05

Aplicação da [anatomia de página](../decisions/0275-page-anatomy.md) às páginas
de livro, aventura, campanha e universo. Cada página entra em uma seção datada.

## Livro — 2026-11-05

### Entregue

- Cabeçalho por `ObjectHeader`: capa 2:3 de 72 px, "Livro · gênero", título `h1`,
  estado editorial, publicação, palavras, sinopse com "Mais/Menos" e o menu
  "Opções do livro", que já concentrava histórico, exportação, importação,
  persona, edição e exclusão.
- Topo "Retomar o trabalho" (`BookResume`): "Continuar de onde parou" leva ao
  capítulo editado por último; "Próximos passos" mostra até três itens derivados
  de dados existentes (`bookNextSteps`): primeiro capítulo, primeiro capítulo
  vazio pela ordem do livro, sinopse e capa. "Escrever o primeiro capítulo" abre
  "Novo capítulo" na aba Capítulos; sinopse e capa abrem a edição do livro.
- Abas por `Tabs`, sem ícones, com `?tab=` preservado, bloqueio durante operações
  do Compêndio e as ações do Compêndio fora do `tablist`.
- Capítulos por `Toolbar`: busca, resumo "N capítulos · N palavras", "Novo ato" e
  "Novo capítulo". "Excluir seleção" deixou de ser vermelho fora da confirmação.
- Remoção do CSS do cabeçalho em vidro, da barra de abas em cápsula e do filtro
  sem borda.

### Testes

- `bookProgress.test.ts`: 4 casos de retomada e próximos passos.
- `BookPage.test.tsx`: 2 casos novos (retomada, passos, abertura de "Novo
  capítulo" sem reabrir ao voltar à aba) e 2 asserções atualizadas para o tipo
  com gênero e o novo resumo de capítulos.
- `npx vitest run src/features/books`: 526 testes aprovados.

### Validações

- `npx tsc -b`, `eslint` nos arquivos alterados, `prettier` e
  `npm run check:architecture`: aprovados.
- Prévia visual 1440 × 900 de livro com capa (escuro, claro, sépia), sem capa e
  aba Compêndio: sem transbordo horizontal e sem exceções.

### Limitações

- A página carrega a lista leve de capítulos (sem texto) para a retomada, além da
  que a aba Capítulos já carrega; renomear um capítulo só atualiza a retomada no
  próximo carregamento da página.
- Os controles internos do Compêndio continuam no estilo antigo até a fase 4.
- `npm run validate` completo e testes visuais ficam para o fim do plano.
