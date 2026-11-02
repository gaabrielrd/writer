# Criação assistida como conversa

## Resultado

A primeira ideia entra pelo chat, guiada por uma mensagem do agente. A entrevista
usa uma coluna central, com falas do usuário e do assistente visualmente distintas,
sem labels ou hints visuais nos campos. Mensagens do agente orientam também as
transições para briefing, revisão e capa. O progresso em cinco etapas permanece
como apoio discreto; em mobile, somente a etapa atual mostra seu nome.

O envio funciona por botão ou Enter; Shift+Enter insere linha e IME não dispara
envio. O nome acessível e a instrução de teclado continuam disponíveis para
leitores de tela. O foco retorna ao campo depois da resposta; novas mensagens
usam log anunciado e acompanhamento de rolagem. As decisões são consultáveis
em “Ideias que reunimos”, com reinício confirmado e revisão explícita.

Créditos e privacidade ficam recolhidos durante a conversa; total, saldo e
confirmação de criação permanecem explícitos no final. Protocolo servidor,
retenção, recibos, recuperação de pedidos incertos, lore privado e débito atômico
foram preservados. Não foram alterados serviços, Functions ou dependências.

## Arquivos

- `src/features/books/components/AssistedBookPage.tsx` e seu CSS Module.
- `src/features/books/tests/AssistedBookPage.test.tsx`.
- `e2e/visual/assisted-book.visual.ts`.
- `docs/assisted-book-creation.md` e `docs/styleguide.md`.

## Validação

- Vitest direcionado: sete testes passaram, incluindo envio por teclado,
  multiline, IME, foco, ausência de criação automática e informação de créditos.
- A primeira execução também descobriu uma cópia independente em
  `.firebase/domain-release-worktree`, com seis falhas de React duplicado.
  A repetição com `--exclude '.firebase/**'` isolou o checkout atual e passou.
  A cópia não foi alterada.
- Chromium inicial: quatro cenários passaram, cobrindo criação completa,
  revisão privada, capa, confirmação, retomada e largura de 320 px.
- Chromium final: 12 cenários passaram, com criação completa e retomada em
  desktop/mobile nos temas claro, escuro e sépia, incluindo largura de 320 px.
- Capturas desktop e mobile inspecionadas visualmente, incluindo a coluna final
  de conversa centralizada.
- TypeScript, ESLint direcionado e styleguide passaram.
- Arquitetura e documentação passaram; Prettier aplicado ao diff.

## Limites

Validação visual com fixtures locais, sem geração real de IA ou backend de
produção. Sem commit, push ou deploy. `npm run validate` não executado, conforme
a regra de reservá-lo para commit/merge ou pedido explícito. Alterações anteriores
do checkout foram preservadas.
