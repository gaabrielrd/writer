# Listagem leve do lore nos detalhes do livro

Data: 2026-11-03. Estado: implementação local com validações direcionadas.
Não houve commit, push ou implantação nesta entrega.

## Resultado

A listagem carrega apenas nome, categoria, apelidos, resumo, visibilidade e
contagem de relações. Os detalhes completos são buscados ao abrir uma ficha,
com o token original reautorizado. Busca, categorias, cartões/lista e seleção
continuam disponíveis, sem usar resumos como fontes completas de escrita.

Para 17 fichas, o teste de integração percorre o cliente TypeScript e o serviço
nativo real em duas RPCs de listagem, sem chamadas de abertura ou leitura de
partes até a captura explícita da primeira ficha. Isso comprova a redução de
chamadas, sem estimar ganho de latência em produção.

O [contrato da listagem](../book-lore-listing.md) descreve paginação, orçamento,
compatibilidade e limites das bases legadas. A publicação exige atualizar
`loreApi` antes do frontend. Essa publicação não foi realizada.

## Escopo técnico

- Projeção opcional na ação existente `listBookLoreRead`, preservando o formato
  e comportamento anteriores sem a opção.
- Leitor contextual informa contagem de relações sem abrir suas páginas.
- Cliente valida o DTO fechado e reconfere a coleção por metadata antes de
  publicar, com guardas de conta/contexto e sem cache persistente.
- Hook, tipos e composição do compêndio usam uma projeção distinta de C1.
- Fixtures e testes cobrem carregamento sob demanda e protocolos existentes.
- Alterações locais de outras tarefas foram preservadas.

## Validação executada

- `node --test functions/test/bookLoreSummaries.test.mjs functions/test/bookLoreRead.test.mjs functions/test/bookLoreContextRead.test.mjs`:
  **65 testes passaram**.
- `npx vitest run src/features/lore/tests/bookLoreSummaryRoundtrip.test.mjs src/features/lore/tests/bookLoreSummaries.test.ts src/features/lore/tests/BookLoreCollection.test.tsx src/features/lore/tests/bookLoreReadClient.test.ts --maxWorkers=2`:
  **100 testes passaram**.
- `npx playwright test --config playwright.visual.config.ts e2e/visual/book-lore-summary.visual.ts`,
  com porta isolada 4193: **3 jornadas passaram**, nos três temas desktop.
  Conferiram ausência de abertura completa antes do clique, lista, busca,
  teclado, detalhes completos e retorno de foco.
- `npm run typecheck`: passou após corrigir o tipo de uma fixture.
- ESLint nos 14 arquivos de código/testes alterados: passou após ajustes de
  tipagem e promises nas fixtures.
- `node scripts/check-architecture.mjs`: passou.
- `node scripts/check-docs.mjs`: passou.
- `git diff --check`: passou.

Os primeiros comandos encontraram bloqueios `EPERM` do sandbox para processos
filhos, arquivos temporários e formatação. As execuções correspondentes foram
repetidas fora dele, com aprovação automática, sem alterar dependências.

## Limites de aceite

Não foi executado `npm run validate`, reservado pela instrução do operador para
antes de commit/merge ou solicitação explícita. Não há aprovação da suíte
integral, Rules, CI ou produção nesta entrega. Não foram medidos os tempos da
conta real nem investigadas inicialização a frio e região das Functions.

Os cenários Chromium usam SDK/Auth/dados fictícios e o serviço nativo de leitura
real em memória. Eles não substituem a verificação autenticada após deploy.
As bases monolíticas antigas ainda são percorridas no servidor para validar
hash/schema; os corpos completos não são enviados à listagem.
