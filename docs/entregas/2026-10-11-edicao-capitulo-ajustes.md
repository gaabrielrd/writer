# Ajustes da edição de capítulos

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Plano de origem**: plano aprovado na conversa

## Objetivo

Reduzir a distração e o espaço ocupado pelos controles durante a escrita, tornar
as ações de IA acessíveis pela seleção e destacar a entidade ativa nas menções.

## Funcionalidades entregues

- **Manuscrito sem outline** — a área de escrita não mostra contorno ao receber
  foco. Os demais controles mantêm foco visível.
- **Assistente em coluna** — as três ações, a instrução personalizada e Executar
  ficam empilhados. O modal não possui footer nem atalho BYOK. A configuração
  pelo menu do usuário permanece disponível.
- **IA na seleção** — selecionar texto mostra uma barra acima do trecho, com
  alternativa abaixo quando falta espaço. As ações reutilizam o mesmo modal;
  a personalizada foca o campo sem gerar automaticamente. A resposta exige
  aceite, respeita o intervalo capturado e não sobrescreve um documento alterado.
  Alt+Enter abre o foco nas ações, as setas laterais navegam e Escape devolve
  o foco ao editor. A barra acompanha rolagem e redimensionamento.
- **Menções visíveis** — o item ativo usa fundo/texto contrastantes, borda interna
  e indicador de confirmação, distinguindo seleção de hover nos três temas.
- **Compêndio compacto** — título e ações ocupam a primeira linha; busca sem
  rótulo visual e categorias ficam abaixo. O escopo local/global foi preservado.
  O topo até a lista passou de **313 para 154 px**, redução de **50,8%**, no mesmo
  estado sem universo vinculado, em 1440 × 1000, nos três temas.

## Critérios de aceite

- [x] A área de texto não tem outline ao receber foco.
- [x] O assistente não tem footer nem opção BYOK, com opções/campo/botão em coluna.
- [x] A seleção oferece as ações de IA e não dispara geração sozinha.
- [x] O usuário revisa a resposta antes de aplicar; seleção e foco são preservados.
- [x] O item ativo em `@` tem contraste de texto de pelo menos 4,5:1 e indicador visual.
- [x] O topo do compêndio reduz a altura em pelo menos 30% no desktop comparado.
- [x] Busca, categorias, criar, atualizar, fechar e escopo local/global continuam funcionando.
- [x] Os três temas, desktop/celular e a largura de 320 px foram verificados.
- [x] Validação local, revisão do diff e atualização da documentação realizadas.

## Arquivos alterados

| Arquivo                                                              | Mudança                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/features/editor/components/RichEditor.tsx`                      | Integra seleção, atalho e retorno de foco ao mesmo assistente.       |
| `src/features/editor/components/RichEditor.module.css`               | Remove o outline da escrita.                                         |
| `src/features/editor/hooks/useSelectionAnchor.ts`                    | Observa seleção, foco, teclado, rolagem e viewport.                  |
| `src/features/editor/components/MentionMenu.tsx`                     | Indicador no item ativo.                                             |
| `src/features/editor/components/MentionMenu.module.css`              | Fundo, texto e borda contrastantes.                                  |
| `src/features/editor/components/EditorLoreSidebar.tsx`               | Cabeçalho compacto, busca acessível e categorias com estado.         |
| `src/features/editor/components/EditorLoreSidebar.module.css`        | Controles compactos e responsivos.                                   |
| `src/features/ai-assistant/components/AIActionMenu.tsx`              | Modal sem footer, abertura pela ação e gestão de foco.               |
| `src/features/ai-assistant/components/AIActionMenu.module.css`       | Ações, campo e Executar em coluna.                                   |
| `src/features/ai-assistant/components/AISelectionToolbar.tsx`        | Ações flutuantes com teclado, tooltips e ajuste ao viewport.         |
| `src/features/ai-assistant/components/AISelectionToolbar.module.css` | Superfície temática e controles móveis.                              |
| `src/shared/ui/Dialog.tsx`                                           | Expõe o callback de retorno de foco do Radix na API simplificada.    |
| `src/features/ai-assistant/tests/AIActionMenu.test.tsx`              | Ausência de footer/BYOK, ações da seleção e instrução personalizada. |
| `src/features/editor/tests/RichEditor.test.tsx`                      | Seleção, Escape, teclado e Preview.                                  |
| `src/features/editor/tests/EditorLoreSidebar.test.tsx`               | Novo título, escopos e ação de atualizar.                            |
| `src/features/editor/tests/EditorPage.test.tsx`                      | Expectativa do título compacto.                                      |
| `e2e/visual/editor-adjustments.visual.ts`                            | Cinco cenários novos nos três temas e desktop/celular.               |
| `e2e/visual/dialog-layout.visual.ts`                                 | Assistente sem footer e Executar no corpo rolável em 320 px.         |
| `e2e/visual/writer.visual.ts`                                        | Expectativa de escrita sem outline, preservando foco.                |
| `e2e/visual/fixtures/aiService.ts`                                   | Respostas fictícias para verificar revisão e aceite.                 |
| `docs/styleguide.md`                                                 | Comportamentos e apresentação dos controles.                         |
| `docs/architecture.md`                                               | Fronteira entre seleção do editor e ações de IA.                     |
| `docs/testing.md`                                                    | Cenários, medição anterior e comando de verificação.                 |

## Testes

Os testes de componentes verificam seleção capturada, as três ações, ausência
de footer/BYOK, instrução personalizada sem geração antecipada, aceite, falhas,
cancelamento, proteção contra respostas antigas, teclado e escopos.

A regressão visual incluiu os arquivos `editor-adjustments.visual.ts`,
`editor-lore-analysis.visual.ts`, `dialog-layout.visual.ts` e `writer.visual.ts`.
Ela verifica dimensões e alinhamento no navegador, contraste, arraste parcial
por mouse, rolagem interna/da página, redimensionamento, ações por toque/teclado,
Preview, revisão do lore e os fluxos existentes de escrita. As capturas foram
inspecionadas nos temas claro, escuro e sépia. São dados fictícios, com rede
externa bloqueada pela configuração visual.

Saída real da validação:

```text
Test Files  81 passed (81)
     Tests  580 passed (580)
All files          |    93.4 |    85.95 |   91.25 |   95.43 |
ℹ tests 68
ℹ pass 68
ℹ fail 0
ℹ tests 46
ℹ pass 46
ℹ fail 0
Smoke test do bundle OK.
```

Os 68 testes são dos scripts/setup; os 46 são de `functions`. Os limites de
cobertura foram mantidos. O fluxo de seleção também passou em cinco execuções
consecutivas no desktop escuro.

## Validações executadas

| Comando                     | Resultado                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions` | Instalado; auditoria sem vulnerabilidades.                                                    |
| `npm run validate`          | Verde: arquitetura, documentação, styleguide, formatação, lint, testes, tipos, build e smoke. |
| `npm run lint`              | Verde após atualizar as expectativas visuais antigas.                                         |
| `npm run typecheck`         | Verde após atualizar as expectativas visuais antigas.                                         |
| `npm run check:docs`        | Verde.                                                                                        |
| `git diff --check`          | Sem erros.                                                                                    |

Comando de regressão visual:

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/editor-adjustments.visual.ts e2e/visual/editor-lore-analysis.visual.ts e2e/visual/dialog-layout.visual.ts e2e/visual/writer.visual.ts
```

Saída real da regressão visual:

```text
144 passed (5.2m)
```

## Fora do escopo

Alterações nos provedores de IA, cobrança, persistência, regras do servidor,
configuração global BYOK, conteúdo dos capítulos e funcionalidades do compêndio
independente do editor. As alterações locais preexistentes foram preservadas.

## Limitações e pendências conhecidas

A verificação de IA usa serviços fictícios, sem chamadas aos provedores reais.
O build continua emitindo avisos de tamanho de chunk e import dinâmico ineficaz
no exportador DOCX; ambos não impedem build nem smoke. Commit, PR e CI remoto
não foram executados nesta tarefa.

## Como verificar manualmente

1. Abra um capítulo, foque o manuscrito e confirme a ausência de outline.
2. Selecione um trecho: use uma ação ou Alt+Enter, setas e Escape.
3. Abra a instrução personalizada e confirme o foco no campo; gere uma resposta,
   revise e aceite para alterar somente a seleção.
4. Abra Assistente IA pela barra fixa: confira a coluna única e ausência de footer/BYOK.
5. Digite `@` e navegue por setas: o item ativo deve ser inequívoco.
6. Abra Compêndio: confira busca, filtros e ações no topo compacto.
7. Repita em claro/escuro/sépia e em janela estreita, incluindo 320 px.
