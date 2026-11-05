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

## Imagens e lista de Universos — 2026-11-05

### Entregue

- Biblioteca de Imagens ganhou título e descrição por `PageHeader`. Nos cards,
  "Visualizar" ficou em contorno e renomear/excluir viraram ícones discretos, com a
  cor de exclusão só em hover e foco; a coluna mínima passou de 150 para 180 px
  para manter as três ações em uma linha.
- Lista de Universos: "Abrir lore" deixou de ser um `Button` dentro de `Link` e
  virou link com aparência de botão; "Editar universo" e "Excluir universo" foram
  para o menu "Opções de {nome}".

### Testes e validações

- `UniversePage.test.tsx`: abertura por link e edição/exclusão pelo menu.
- Quatro testes visuais passam a localizar "Abrir lore" como link.
- `npx vitest run src/features/image-library src/features/universes
src/features/books`: aprovados; `tsc`, `eslint`, `prettier`; prévia 1440 × 900.

## Em andamento — 2026-11-05

### Entregue

- Restaurações de livros, restaurações de aventuras e importações de aventura em
  preparação usam o mesmo cabeçalho de painel: título e botão de ícone com dica
  ("Atualizar restaurações"/"Atualizar importações", mesmos nomes acessíveis).
- O painel de importações ganhou espaçamento interno; a descrição ficou discreta e
  o botão de largura total foi removido.

### Testes e validações

- `npx vitest run src/features/book-portability src/features/adventure-portability
src/features/adventure-import src/features/studio`: 1206 aprovados, sem alteração
  de testes; `tsc`, `eslint`, `prettier`; prévia 1440 × 900.

### Limitações e próximos passos da fase

- Os títulos "Campanhas" e "Exclusões" aparecem sem conteúdo quando não há
  operações pendentes.
- Ainda não implementados nesta fase: lista com inspetor para Compêndio e
  Personas, e a revisão do planejador de Cenas (botões largos e selects grandes).
- `npm run validate` completo e testes visuais ficam para o fim do plano.

## Lista com inspetor — 2026-11-05

### Entregue

- Kit: `InspectorLayout`, `Inspector` e `InspectorEmpty` em `@/shared/ui`, e o hook
  neutro `useMediaQuery` em `src/shared/hooks`, também exportado pelo kit.
- Compêndio do livro, visão Lista: a partir de 1100 px, o nome da entidade mostra
  o resumo no inspetor (categoria, visibilidade, apelidos, resumo), com "Abrir ficha
  completa", "Editar" e excluir discreto; a linha ativa fica destacada e marcada com
  `aria-current`. Abaixo de 1100 px, a ficha completa abre como antes.
- Personas na página de IA: a partir de 1100 px, a persona escolhida aparece no
  inspetor com tipo, descrição e os três traços mais marcantes; "Abrir detalhes"
  leva ao diálogo completo. O modo dentro do capítulo continua igual.
- `src/test/matchMedia.ts` simula a viewport larga nos testes.

### Testes e validações

- Novos casos: inspetor e hook no kit; modo largo do Compêndio e de Personas.
- Três testes de abas por teclado passaram a esperar a URL atualizar; falharam uma
  vez sob carga e passaram em duas rodadas completas seguintes.
- `npx vitest run src/shared/ui src/features/lore src/features/ai-assistant
src/features/books`: 2252 aprovados (duas rodadas); `tsc`, `eslint`, `prettier`,
  `check:architecture` e `check:styleguide`; prévia 1440 × 900.

### Limitações

- O Compêndio do universo e o da aventura ainda não usam o inspetor.
- O planejador de Cenas segue pendente nesta fase.

## Planejador de Cenas — 2026-11-05

### Entregue

- Cabeçalho único: "Cenas" com uma dica curta sobre a composição e a privacidade;
  à direita, Lista/Quadro, atualizar como ícone com dica, "Recuperar cenas sem
  parte" (aventura) discreto, "Novo capítulo"/"Nova parte" e "Nova cena" como única
  ação principal. O botão de largura total no topo foi removido.
- Filtros em `Toolbar` com três `Dropdown` compactos de 220 px, nomeados por
  `aria-label` (Capítulo/Parte, Estado da cena, Arquivo de cenas); as opções de
  arquivo passaram a "Cenas ativas" e "Cenas arquivadas".
- "Reorganizar posições" e "Remover" no tamanho compacto.
- O título do projeto deixou de ser repetido abaixo de "Cenas"; a propriedade
  `projectTitle` sem uso foi removida dos quatro chamadores.

### Testes e validações

- Nomes de opção atualizados em `ScenePlanner.test.tsx` e em dois testes visuais.
- `npx vitest run src/features/scenes src/features/books src/features/adventures`:
  697 aprovados; `tsc`, `eslint`, `prettier`; prévia 1440 × 900 no livro e na aventura.
