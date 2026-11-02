# Layout do editor de capítulo

## Objetivo e resultado

A largura máxima passa a limitar somente a coluna da prosa (720 px). Cabeçalho,
ferramentas e workspace usam toda a largura disponível. O minimapa permanece
à esquerda, próximo à navegação.

A partir de 1100 px, o lore mencionado ocupa um painel direito de 280 px, com
contagens, acesso às fichas, rolagem própria e estado vazio. Compêndio e Assistente
substituem essa lista enquanto abertos; fechar restaura a lista. Abaixo desse
breakpoint, o lore permanece em faixa horizontal rolável acima do texto.
O editor não é remontado na troca dos painéis. A opção é aplicada somente ao
editor de capítulo, preservando os outros consumidores de RichEditor.

## Arquivos

- `src/app/components/AuthenticatedWorkspace.module.css`: libera a largura da rota.
- `src/features/editor/components/EditorPage.tsx`: habilita o layout de capítulo.
- `src/features/editor/components/RichEditor.tsx`: compõe a lista contextual.
- `src/features/editor/components/RichEditor.module.css`: prosa, minimapa e painel responsivos.
- `e2e/visual/chapter-layout.visual.ts`: comportamento e geometria no Chromium.
- `docs/styleguide.md`: contrato visual atualizado.

## Validação local

- Vitest direcionado: RichEditor, EditorPage e EditorPageChat, 41 testes passaram.
- Chromium: seis cenários, desktop/mobile nos temas claro, escuro e sépia, passaram.
  Conferem limite da prosa, largura externa em 2400 px, centralização, posição do
  lore, alternância dos painéis, preservação do nó/texto do editor e estado vazio.
- Capturas desktop e mobile inspecionadas visualmente, com dados fictícios.
- `npm run check:styleguide`: passou.
- Regressão Chromium de passagem lida: desktop/mobile passaram; a rodada final
  incluiu esses dois cenários e repetiu o fluxo de layout, totalizando quatro testes.
- `npm run typecheck`, ESLint dos arquivos TypeScript alterados,
  `npm run check:architecture`, `npm run check:docs`, Prettier do diff e
  `git diff --check`: passaram.

## Limites

Não houve commit, push ou deploy. A validação integral não foi executada, seguindo
a instrução de reservar `npm run validate` para commit/merge ou pedido explícito.
O checkout contém alterações anteriores alheias a esta entrega, preservadas.
Os testes visuais usam serviços locais de fixture, sem acesso ao backend real.
