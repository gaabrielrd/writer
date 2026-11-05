# Guia reposicionável pelo texto e pelos espaços livres

O cartão do guia pode ser arrastado pelo título, texto, progresso e espaços
livres, sem ícone adicional de alça. Links e botões continuam com suas ações;
a barra de rolagem nativa conserva a interação. O cursor indica quando a área
permite arrastar e quando o cartão está em movimento.

O texto de progresso é o acesso por teclado: Tab leva até ele, as setas movem
o cartão e Shift amplia o passo. Escape cancela o arrasto sem pausar o guia;
fora do arrasto, mantém o comportamento anterior de pausa. Cancelamento do
ponteiro e perda de captura restauram a posição anterior, respeitando a janela.

A posição fica somente em memória enquanto o guia está ativo. Trocar de dica
ou navegar conserva a posição; redimensionar a janela ou o cartão reajusta os
limites. Arrastar não grava o perfil, não avança etapas e não executa ações.
Pausa/retomada continuam sob o protocolo existente de onboarding.

## Implementação

- `Onboarding.tsx` compõe o comportamento de arrasto e as instruções acessíveis.
- `useGuideDrag.ts` trata captura, limites, teclado e cancelamento, sem I/O.
- `Onboarding.module.css` usa os tokens existentes, cursores e foco visível.
- `Onboarding.test.tsx` cobre teclado, controles, troca de etapa, limites e
  ausência de gravação ao mover.
- `guide-drag.visual.ts` cobre arrasto pelo título, parágrafo, progresso e
  padding, ícone de Próxima dica sem arrasto, link, mudança de página, teclado,
  cancelamento, ponteiro cancelado e janela reduzida.

## Verificações locais

- `npx vitest run src/features/onboarding/tests`: 3 arquivos e 27 testes
  aprovados, incluindo os dois cenários novos.
- A versão final sem ícone passou nos três temas no Chromium: `3 passed (1.2m)`.
  Inclui cancelar um arrasto após redimensionar a janela, sem deixar o cartão
  fora dos novos limites.
  Capturas de Claro, Escuro e Sépia conferidas em 1100 × 620, após navegação e
  arrasto iniciado em 1440 × 1000. Dados fictícios e rede externa bloqueada.
- ESLint e Prettier dos arquivos afetados: aprovados.
- `npm run typecheck`: aprovado na repetição. A primeira execução apontou um
  erro de tipos em `authenticated-workspace.visual.ts`, de outro trabalho;
  o arquivo foi atualizado separadamente, sem alterações desta tarefa nele.
- `npm run check:architecture`: `Verificação arquitetural OK.`
- `npm run check:docs`: `Validação da documentação OK.`
- `npm run check:styleguide`: `Verificação do styleguide OK.` e
  `Anatomia de página OK.`
- `git diff --check`: aprovado.

Os primeiros ajustes corrigiram a fixture do perfil guiado (o padrão é
essencial), o acesso por teclado sem tornar o diálogo um Tab stop e a espera
da atualização React nas asserções de cancelamento. Regras de acessibilidade
e asserções de posição foram preservadas.

Commit local solicitado explicitamente sem executar `npm run validate`.
Sem push ou implantação.
As alterações locais dos demais trabalhos foram preservadas.
