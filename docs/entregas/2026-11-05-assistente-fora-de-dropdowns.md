# Assistente fora de dropdowns com busca

## Causa e correção

Dropdowns com busca usam `role="dialog"` para incluir o campo de pesquisa e a
lista acessível. `useActiveDialog` tratava essa superfície como um modal e
transferia o portal do assistente para dentro dela. Isso também afetava a
superfície da conversa de concepção, que usa o mesmo hook.

O dropdown compartilhado agora identifica sua superfície por
`data-slot="dropdown-content"`. O hook exclui essas superfícies da seleção do
modal ativo. O assistente permanece na página ou no modal real que já o contém,
sem alterar papel acessível, busca, seleção ou ciclo de foco do dropdown.

## Evidências

- Dois testes reproduziram a falha antes da correção, com dropdowns reais na
  página e dentro de Dialog: ambos mostraram o assistente dentro do popup.
- Após a correção, 47 testes passaram em seis arquivos: suíte da feature
  page-assistant e contratos do Dropdown compartilhado. Incluem conversa de
  concepção, host do portal, foco da busca, filtragem e Escape.
- Chromium com componentes e rotas reais e serviços fictícios locais: os 12
  cenários dirigidos passaram nos temas Claro, Escuro e Sépia, incluindo posição
  do assistente na página e no modal, busca, seleção, callbacks e Escape.
  A primeira execução teve nove sucessos; três verificações do modal usavam um
  seletor que o Radix temporariamente oculta da árvore de acessibilidade durante
  a busca. O seletor de inspeção do host foi corrigido e os três passaram na
  repetição, preservando a verificação da posição e do foco.
- Capturas da página e do modal inspecionadas visualmente.
- ESLint dirigido, Prettier, arquitetura, documentação, styleguide/anatomia de
  página, `npx tsc -b` e `git diff --check`: passaram.

## Limites

Sem mudanças de servidor, dependências novas, commit ou deploy. As alterações
paralelas do checkout foram preservadas. `npm run validate` não executado.

## Conferência manual

Na criação de livro, abrir Universo e persona e depois Universo compartilhado.
Pesquisar e fechar por Escape: o assistente deve manter sua posição fora da
busca. Repetir no formulário Editar campanha: o assistente permanece no escopo
do modal, a busca conserva foco e Escape fecha somente o dropdown.
