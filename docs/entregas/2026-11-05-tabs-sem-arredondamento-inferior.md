# Tabs com cantos inferiores retos

O componente compartilhado `Tabs` define os dois raios inferiores como zero,
mantendo o sublinhado reto nas páginas que o utilizam. O foco por teclado e os
cantos superiores permanecem com seus estilos existentes.

Arquivos: `src/shared/ui/Tabs.module.css` e `docs/styleguide.md`.

Verificações executadas:

- Prettier nos arquivos alterados: passou.
- `npm run check:styleguide`: passou, incluindo anatomia de página.
- `git diff --check`: passou.
- Diff revisado; alterações preexistentes preservadas.

A conferência visual ficou pendente: o servidor Vite não iniciou devido a erro
ao carregar a dependência nativa `@tailwindcss/oxide-win32-x64-msvc` e `spawn EPERM`.
`npm run validate` não foi executado; sem commit ou publicação.

Para conferir manualmente, abrir Inteligência artificial e alternar Personas e
Provedor; verificar o sublinhado reto e o foco por teclado.

## Correção da cascata no layout autenticado

A captura posterior do operador mostrou que a primeira alteração era insuficiente.
A regra `.shell :global(button)` do layout autenticado tinha maior especificidade
e reaplicava 6 px nos cantos das tabs. Em
`src/app/components/AuthenticatedWorkspace.module.css`, a regra passa a excluir
botões com `role='tab'`, preservando o estilo do componente compartilhado.

Verificação dirigida em Chromium com DOM isolado e os CSS reais de Tabs e do
layout (não equivale à jornada autenticada):

- Controle anterior reproduziu raio inferior de 6 px.
- Após a correção, seis combinações de aba ativa/inativa e tema Claro/Escuro/Sépia
  mantiveram os dois raios inferiores em 0 px, inclusive com hover e foco.
- O contorno de foco continuou sólido e o botão comum manteve raio de 6 px.
- Captura do resultado inspecionada visualmente.
- Prettier, `npm run check:styleguide` e `git diff --check`: passaram novamente.

Commit local autorizado pelo operador, dispensando `npm run validate`.
Sem push ou publicação.
