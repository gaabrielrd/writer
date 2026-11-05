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

## Compêndio — 2026-11-05

### Entregue

- Busca e categorias do Compêndio do livro e do universo passaram para `Toolbar`
  e `FilterChips`. As categorias deixaram de ser `tablist`, porque filtram a lista
  e não trocam de seção; continuam com ícone e contagem.
- "Atualizar compêndio" e "Atualizar lore da aventura" viraram botões de ícone com
  dica e o mesmo nome acessível. "Retomadas" ficou discreto e "Nova Entidade"
  passou a ser a única ação principal da barra.
- Cards de entidade: "Ver Ficha" deixou de ser primário em cada card; editar e
  excluir viraram ícones discretos, com a cor de exclusão só em hover e foco. A
  confirmação continua sendo o único lugar com botão vermelho.
- Alternador Lista/Grid no mesmo estilo dos chips; regras de CSS da barra antiga
  removidas.

### Testes e validações

- Três testes passaram a localizar categorias como botões (`aria-pressed`) em vez
  de abas; um teste de abas da aventura passou a esperar o título, pois falhava
  sob carga por depender de atualização assíncrona da URL.
- `npx vitest run src/features/lore src/features/adventures src/features/books
src/features/editor`: 1972 aprovados.
- `npx tsc -b`, `eslint`, `prettier`; prévia 1440 × 900 do Compêndio do livro.

### Limitações

- A variação de lista com inspetor para o Compêndio ainda não foi implementada;
  esta etapa alinhou barra, filtros e ações dos cards.
