# Assistente da página compacto, fase 2 — 2026-11-05

## Objetivo

Tirar o assistente da página da frente do conteúdo sem mudar seu modelo:
continua flutuante e reposicionável, mas chega fechado e, aberto, ocupa menos
espaço. Decisão registrada na [ADR 0275](../decisions/0275-page-anatomy.md).

## Funcionalidades entregues

- O assistente chega minimizado como uma pílula "Assistente" com alça de arrastar.
- Volta a minimizar ao trocar de projeto ou de área (o mesmo escopo que separa as
  conversas). Dentro do mesmo projeto, como livro → editor, conserva o estado.
- Só a posição é salva por conta. O estado aberto/fechado deixou de ser salvo;
  entradas antigas com `mode` continuam valendo pela posição.
- Abrir pela pílula leva ao modo compacto. Em diálogos estreitos, abre direto a
  conversa, porque ali o modo compacto já era minimizado automaticamente.
- Modo compacto: painel de 420 px, contexto em selo, botões de 32 px (44 px em
  toque), sombra mais leve e campo sem rótulo visual com nome acessível.
- Campo de pedido cresce com o texto até 160 px, envia por Enter, quebra linha por
  Shift+Enter, respeita composição de texto e envia por botão de ícone.
- Botão de expandir alterna entre os ícones de expandir e recolher.

## Arquivos alterados

- `src/features/page-assistant/services/dockPreferences.ts`
- `src/features/page-assistant/components/AssistantDock.tsx`
- `src/features/page-assistant/components/PageAssistant.tsx`
- `src/features/page-assistant/components/PageAssistant.module.css`
- `src/features/page-assistant/tests/{AssistantDock,PageAssistant,dockPreferences}.test.ts(x)`
- `e2e/visual/{campaign-management,studio,universes,writer,onboarding,project-creation}.visual.ts`
- `docs/styleguide.md`

## Testes

- `npx vitest run src/features/page-assistant`: 30 testes aprovados, incluindo
  pílula inicial, contexto em selo, reabertura ao trocar de projeto, manutenção no
  mesmo projeto, posição antiga aproveitada sem o modo e envio por Enter.
- Testes visuais ajustados ao novo início fechado: removidos os cliques em
  "Minimizar" depois de criação manual e nas páginas de detalhe; mantidos depois
  da criação com IA; onboarding e criação abrem a pílula antes de usar o campo.

## Validações executadas

- `npx tsc -b`: sem erros.
- Prévia visual (`vite.visual.config.ts`, 1440 × 900, temas escuro e claro): pílula
  em `/books/visual-atlas`, modos compacto e expandido, e retorno ao minimizado ao
  navegar de Projetos para Universos; sem exceções de página.

## Fora do escopo

Páginas de objeto, coleções e textos das próximas fases; mudança no modelo de
conversa ou nas ações do assistente.

## Limitações e pendências

- `npm run validate` completo fica para o fim do plano, por decisão do operador.
- Os testes visuais alterados não foram executados: o Chromium do Playwright não
  está instalado nesta máquina.
