# Consistência visual do universo e assistente

## Resultado local

- Ações de importar, voltar e criar com ícones Lucide e densidade compacta.
- Lista/Grid com segmentos retangulares, seleção por `aria-pressed` e teclado.
- Assistente compartilhado com largura de 480 px, cabeçalho discreto e sem sombra decorativa.
- Contexto no rodapé, placeholder contextual e rótulo do campo somente acessível.
- Envio somente por ícone, posicionado de forma absoluta no canto inferior direito do campo, com espaço reservado para o texto.
- Preservados movimentação, minimização, rascunho entre rotas, autorização e confirmação das propostas.

## Validação

- Vitest: 42 testes aprovados em seis arquivos do assistente e da página de universos.
- Typecheck, ESLint dos arquivos alterados, arquitetura e styleguide aprovados.
- Chromium isolado com dados fictícios: controles do universo e jornada de onboarding/assistente nos temas claro, escuro e sépia; desktop e celular.
- Conferidas capturas desktop/celular e ausência de overflow horizontal; teste verifica posição do envio, rodapé, placeholder, botão vazio desabilitado e seleção pelo teclado.
- A configuração visual mudou concorrentemente durante a execução: dez cenários passaram; os dois mobile sépia precisaram de nova execução com `WRITER_VISUAL_MOBILE=1`.
- Reexecução mobile sépia: dois cenários aprovados. Total dos cenários previstos: 12 aprovados.
- Documentação e `git diff --check` aprovados.

## Limites

Alteração local, sem commit, push ou deploy. `npm run validate` não executado: não houve commit/merge e a solicitação foi de ajuste visual. A validação usa serviços fictícios e não comprova o fluxo autenticado em produção. Alterações concorrentes em documentação e configuração visual foram preservadas.

## Complemento: assistente fora da caixa dos modais

O assistente conserva coordenadas flutuantes do viewport com o formulário
aberto, sem aumentar o modal nem reservar padding dentro dele. Continua no
escopo DOM de foco do diálogo para preservar teclado, cliques e autorização
das capacidades existentes, mas é renderizado visualmente fora da sua caixa.
Movimentação por alça/setas permanece disponível. Escape é tratado antes do
handler do modal e recolhe somente o assistente. Rascunho é preservado ao fechar.

Testes direcionados do dock: 11 aprovados. Typecheck aprovado. Cenário Chromium
nos três temas desktop confere posição antes/depois, ausência de encaixe,
escrita e foco nas duas superfícies, movimento, Escape e rascunho ao fechar.
