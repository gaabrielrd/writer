# Largura da prosa, densidade e destaque do menu contextual

## Resultado

O limite fixo de 720 px foi removido. A prosa agora usa a preferência local
Pequeno/Médio/Grande (960/1280/1600 px), limitada à área disponível. O limite
preferido é separado da expansão do shell: tela cheia libera as ferramentas e
preserva a largura da prosa. Outros consumidores de RichEditor compartilham
esse contrato; persistência e opções existentes não foram alteradas.

O menu sobre a seleção usa fundo primário e texto contrastante, borda e sombra
mais fortes, com hover/foco próprios. Âncora, ações, seleção, teclado e aceite
explícito permanecem no mesmo fluxo.

O cabeçalho e a barra de formatação têm menos padding e gaps. Botões de
formatação/navegação usam 32 px em ponteiro preciso e preservam 44 px para toque.
A área de texto reduz padding para 12 × 16 px no desktop e 12 × 8 px no mobile.

## Arquivos

- `src/app/components/AuthenticatedWorkspace.module.css`.
- `src/features/editor/components/RichEditor.module.css` e `EditorPage.module.css`.
- `src/features/ai-assistant/components/AISelectionToolbar.module.css`.
- `src/features/work-progress/components/WorkPreferencesPage.tsx`.
- `e2e/visual/chapter-layout.visual.ts` e `editor-adjustments.visual.ts`.
- `docs/styleguide.md`.

## Validação

- 32 testes direcionados de RichEditor e preferências passaram.
- TypeScript passou.
- Oito cenários Chromium de largura e menu passaram: desktop Claro/Escuro/Sépia
  e mobile Escuro. Conferem as três preferências reais, persistência entre rotas,
  tela cheia, adaptação estreita, contraste mínimo de 4,5:1, teclado e aceite.
- Captura do novo menu no desktop inspecionada visualmente.
- Quatro cenários finais passaram em desktop/mobile, conferindo cabeçalho e
  ferramentas compactos, alternância dos painéis e preservação da passagem lida
  ao entrar/sair de tela cheia. Captura final do editor também inspecionada.
- ESLint direcionado, styleguide, documentação e `git diff --check` passaram.
- A primeira tentativa do novo teste de largura editava texto antes de reabrir
  a rota e acionou a recuperação correta do rascunho local. O teste foi ajustado
  para medir os parágrafos existentes, sem mutações nem dependência do autosave.

## Limites

Sem `npm run validate`, commit, push ou deploy nesta rodada. Os testes de navegador
usam fixtures locais, sem alterar dados de produção.
