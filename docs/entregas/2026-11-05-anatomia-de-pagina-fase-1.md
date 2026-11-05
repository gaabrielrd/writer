# Anatomia de página, fase 1 — 2026-11-05

## Objetivo

Criar no kit `@/shared/ui` as peças que montam qualquer página de objeto do
mesmo jeito e validar a API em uma tela real antes de migrar as páginas de livro,
aventura, campanha e universo. Decisão registrada na
[ADR 0275](../decisions/0275-page-anatomy.md).

## Funcionalidades entregues

- `ObjectHeader`: tipo, título (`h1`, ou `h2` com `headingLevel`), capa,
  metadados, descrição, ação principal, até duas secundárias e menu "…".
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` sobre `@radix-ui/react-tabs`
  (já declarado): abas sublinhadas, contagem opcional, ações fora do `tablist` e
  valor controlado.
- `Toolbar`: busca e filtros à esquerda, resumo e ações à direita; redefine
  `--control-height` para 36 px (44 px em toque), alinhando campo, chips e botões.
- `FilterChips`: escolha única com `aria-pressed`, contagem opcional e sem
  notificação ao repetir o filtro ativo.
- Piloto em `/settings/ai`: título por `PageHeader`, link de voltar como breadcrumb
  e abas pelo novo `Tabs`, preservando `?tab=provider`.
- Seção "Anatomia de página" em `/styleguide` e em `docs/styleguide.md`.

## Critérios de aceite

- Peças exportadas por `@/shared/ui`, só com tokens de tema e ícones Lucide.
- `Tabs` operável por setas, Home/End e com foco visível.
- `/settings/ai` com título e sem mudança de comportamento.

## Arquivos alterados

- Novos: `src/shared/ui/{ObjectHeader,Tabs,Toolbar,FilterChips}.tsx` e seus
  `.module.css`; `src/shared/ui/tests/pageLayout.test.tsx`;
  `docs/decisions/0275-page-anatomy.md`.
- Alterados: `src/shared/ui/index.ts`, `src/shared/ui/StyleguidePage.tsx`,
  `src/features/ai-assistant/components/AISettingsPage.tsx`,
  `src/features/ai-assistant/components/Personas.module.css` (remoção das regras
  das abas antigas da página), `docs/styleguide.md`.

## Testes

- `pageLayout.test.tsx`: 7 casos (abas por clique e teclado, ações fora do
  `tablist`, chips, barra nomeada, cabeçalho e nível de título).
- `npx vitest run src/shared/ui`: 48 testes aprovados.
- `AISettingsPage.test.tsx` e `PersonaManager.test.tsx` sem alteração: 7 aprovados.

## Validações executadas

- `npx tsc -b`: sem erros.
- `npm run check:architecture`, `check:docs`, `check:styleguide`,
  `format:check` e `lint`: aprovados.
- Prévia visual (`vite.visual.config.ts`, 1440 × 900) de `/settings/ai` e da seção
  do `/styleguide` nos temas escuro, claro e sépia: sem transbordo horizontal e
  sem exceções de página.

## Fora do escopo

Migração das páginas de objeto, assistente da página, bloco de próximos passos,
lista com inspetor, visual do `Button` e regras automáticas no `check:styleguide`.

## Limitações e pendências

- Por decisão do operador, `npm run validate` completo roda só ao fim do plano de
  melhoria. A execução desta fase foi interrompida durante os testes com cobertura;
  cobertura, testes de setup e build não foram concluídos.
- `npm run check:skills` falha localmente por `frontend-skill` instalada em
  `.claude/skills` e `.agents/skills` (pastas ignoradas pelo Git), fora desta entrega.
- A captura de referência `e2e/__screenshots__/{linux,win32}/styleguide.png` deve
  divergir pela nova seção e precisa ser regenerada na plataforma correspondente.
- Os testes visuais de `/settings/ai` não foram executados nesta fase.

## Como verificar manualmente

Abrir `/settings/ai`, alternar Personas e Provedor por clique e por setas, e abrir
`/styleguide` na seção "Anatomia de página" nos três temas.
