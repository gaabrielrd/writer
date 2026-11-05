# Proteções e validação final, fase 6 — 2026-11-05

Encerra o plano de melhoria de UX da [ADR 0275](../decisions/0275-page-anatomy.md).

## Entregue

- `scripts/check-page-anatomy.mjs`, encadeado em `npm run check:styleguide`, falha
  quando um arquivo de `src/` (sem testes) passa a usar `role="tablist"` fora do
  `Tabs` do kit ou mais `<Button variant="destructive|danger">` do que tinha.
- `scripts/page-anatomy-baseline.json` registra a linha de base: 28 arquivos, uma
  implementação própria de abas (`ChapterPersonaDialog`) e 34 botões destrutivos,
  em sua maioria em diálogos de confirmação. `--write-baseline` aperta a catraca.
- `scripts/check-page-anatomy.test.mjs`: 3 casos (contagem, exceções e catraca).
- `docs/styleguide.md`: seção "Como usar este guia" põe regras, kit e anatomia de
  página à frente e marca as seções por tela como notas subordinadas aos padrões;
  "Verificação" explica a catraca; a lista de telas migradas foi atualizada.

## Validação final do plano

Executada uma vez, ao fim do plano, por decisão do operador. Mesma ordem do
`npm run validate`:

- `npm run check:skills`: falhou por `frontend-skill` presente em `.claude/skills` e
  `.agents/skills` (pastas ignoradas pelo Git) e ausente da fonte; não faz parte das
  entregas e não foi removida.
- `check:architecture`, `check:docs`, `check:styleguide` (incluindo a anatomia de
  página), `format:check` e `lint` (38/38): aprovados.
- `npm run test`: Vitest com cobertura, 394 arquivos e 5244 testes aprovados, com
  aprovação dos limites de cobertura; testes de setup, 118 aprovados e 1 ignorado;
  Functions, 4945 aprovados.
- `npm run build`: typecheck, bundle e smoke test do bundle aprovados (com os
  avisos já existentes de tamanho de chunk e importação dinâmica ineficaz).

## Pendências do plano

- Testes visuais (`playwright.visual.config.ts`) alterados ao longo das fases não
  foram executados: o Chromium do Playwright não está instalado nesta máquina.
  A captura `e2e/__screenshots__/{linux,win32}/styleguide.png` precisa ser
  regenerada pela nova seção do catálogo.
- Notas por tela do styleguide ainda não foram movidas para a documentação de cada
  feature.
- `ChapterPersonaDialog` ainda usa abas próprias; Compêndios do universo e da
  aventura ainda sem inspetor; seções da campanha ainda empilhadas; barra
  contextual sem o nome do projeto em aventura e campanha.
