# Assistente preservado durante a navegação

O assistente mantém o modo escolhido (minimizado, compacto ou expandido) ao
navegar entre páginas, áreas e projetos. A troca de contexto não fecha mais o
painel. O rascunho continua visível nos modos abertos e a navegação conserva o
foco no link utilizado.

A linha que repetia o contexto no rodapé foi removida, junto de seu estilo
exclusivo. O contexto continua disponível no cabeçalho do assistente aberto.

A alteração limita-se ao `AssistantDock` e seus testes. O isolamento das
mensagens por origem, a reautorização de contexto e a invalidação das propostas
de ação continuam sob o protocolo existente do `PageAssistant`. O recolhimento
temporário para proteger campos de escrita e os controles manuais são mantidos.
As descrições em `docs/first-use.md` e `docs/styleguide.md` foram atualizadas,
preservando as alterações locais anteriores nesses documentos.

## Verificação local

- Os novos cenários reproduziram a regressão antes da correção: três falhas por
  receber `minimized` quando o modo escolhido era `compact` ou `expanded`.
- `npx vitest run src/features/page-assistant/tests`: 5 arquivos e 33 testes
  aprovados. Inclui os três modos, troca de área/projeto, retorno, rascunho
  visível, foco preservado e inspeção do contexto de destino sem envio de pedido.
- ESLint dos três arquivos TSX alterados e Prettier dos arquivos afetados:
  aprovados.
- `npm run typecheck`: aprovado.
- `npm run check:architecture`: `Verificação arquitetural OK.`
- `npm run check:docs`: `Validação da documentação OK.`
- `npm run check:styleguide`: `Verificação do styleguide OK.` e
  `Anatomia de página OK.`
- `git diff --check`: aprovado.

A primeira tentativa do Vitest encontrou `spawn EPERM` ao carregar o Vite no
sandbox Windows; a execução com subprocessos autorizados passou.

O commit local foi solicitado explicitamente sem executar `npm run validate`.
Não houve push ou implantação.
Esta é uma verificação local por testes de componente com roteador em memória;
não houve verificação em navegador ou conta de produção. A revisão do diff não
identificou achados no escopo da correção.

A remoção do rodapé foi solicitada durante o commit e incorporada ao mesmo
commit local. Os 33 testes acima foram executados antes desse ajuste visual;
não foram repetidos para a remoção da linha. Os hooks normais de commit foram
mantidos.
