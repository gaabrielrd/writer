# Coleções, fase 4 — 2026-11-05

Aplicação da [anatomia de página](../decisions/0275-page-anatomy.md) às páginas
de coleção. Cada coleção entra em uma seção datada.

## Projetos — 2026-11-05

### Entregue

- Os dois grupos de botões segmentados de cada seção (estado editorial e
  publicação/condição/estado) viraram `Dropdown mode="select"` compactos, de
  220 px, com nomes acessíveis iguais aos anteriores e a opção "todos" escrita de
  forma autoexplicativa ("Todos os estados editoriais", "Publicados ou não",
  "Qualquer condição", "Todos os estados").
- "Atualizar livros/aventuras/campanhas" virou um botão de ícone com dica, mantendo
  o nome acessível; o título da seção, os filtros e a recarga ficam em uma linha.
- O seletor de tipo (Todos, Livros, Aventuras, Campanhas) passou a usar
  `FilterChips`, com o mesmo grupo nomeado e `aria-pressed`.

### Testes e validações

- `npx vitest run src/features/studio`: 55 aprovados, sem alteração de testes.
- `e2e/visual/studio.visual.ts`: filtros escolhidos por `chooseDropdown` no
  `combobox` com o mesmo nome; não executado (Chromium do Playwright ausente).
- `npx tsc -b`, `eslint`, `prettier`; prévia 1440 × 900 sem transbordo.
