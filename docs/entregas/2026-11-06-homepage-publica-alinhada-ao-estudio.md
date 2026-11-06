# Homepage pública alinhada ao Estúdio

## Objetivo e estado

Aproximar a página inicial deslogada da linguagem visual da área logada.
Implementação local com validação direcionada; sem commit, envio remoto ou deploy
nesta tarefa. O gate integral `npm run validate` não foi executado, conforme a
instrução de reservá-lo para commit/merge ou solicitação explícita.

## Alterações

- Cabeçalho compacto, marca discreta, moldura com borda fina e superfícies opacas.
- Apresentação em duas colunas, com título editorial menor e recursos agrupados
  no `Card` compartilhado, sem efeito de vidro ou animações de entrada.
- Ação principal visível em notebooks; composição em uma coluna até 800 px.
- Temas e tipografia continuam pelos providers existentes. Os ajustes do shell
  ficam restritos à rota inicial; login, leitor e área logada conservam seus layouts.
- Conteúdo, acesso ao login e redirecionamento autenticado foram preservados.

## Arquivos

- `src/app/App.tsx` e `src/app/App.module.css`.
- `src/features/home/components/HomePage.tsx` e `HomePage.module.css`.
- `e2e/visual/public-home.visual.ts`.
- [Styleguide](../styleguide.md) e [testes](../testing.md).

## Verificações executadas

- `npx vitest run src/features/home/tests/HomePage.test.tsx`: 2 testes passaram.
- `npx playwright test --config playwright.visual.config.ts e2e/visual/public-home.visual.ts`:
  9 testes passaram. Os três temas foram conferidos em 1440 × 1000,
  1024 × 768 e 800 × 900, com capturas, ação dentro do viewport, ausência de
  transbordamento, teclado até o login e redirecionamento autenticado.
- `npm run check:styleguide`: styleguide e anatomia de página OK.
- `npm run check:architecture`: verificação arquitetural OK.
- `npm run check:docs`: validação da documentação OK.
- ESLint dos arquivos TSX e da jornada visual alterados: passou.
- Prettier dos arquivos alterados e `git diff --check`: passaram.
- `npm run typecheck`: passou após repetir fora do sandbox, que inicialmente
  impediu a gravação dos caches TypeScript com EPERM.
- `npm run build:bundle` e `npm run smoke:build`: passaram. O build emitiu
  avisos sobre tamanho de chunks e imports dinâmicos também importados estaticamente.

A primeira execução visual encontrou um seletor incorreto do novo teste
(`Email` em vez do rótulo existente `E-mail`). Após a correção, os 9 casos passaram.
As jornadas usam componentes e rotas reais com serviços fictícios e rede externa
bloqueada. Não comprovam autenticação real nem disponibilidade em produção.

## Verificação manual

Abra `/` sem sessão e confira os temas Claro, Escuro e Sépia. O botão de começar
deve abrir `/login`. Com uma sessão ativa, a raiz deve encaminhar ao Estúdio.
O atalho para pular ao conteúdo e a ação principal devem funcionar por teclado.

## Incremento de 2026-11-06: demais rotas públicas

Após aprovação da home, o operador pediu a revisão de outras rotas antigas,
citando login. A moldura aprovada passou a ser o padrão do shell público, em vez
de uma exceção da rota inicial. Login e cadastro usam `Card tone="flat"`, raios
menores, botões e espaçamentos compactos, preservando campos e fluxos de acesso.
O estado de conta já autenticada também usa o mesmo tratamento.

O catálogo apresenta o estado vazio centralizado, sem outro painel decorativo.
O fallback 404/erro de rota usa superfície neutra limitada a 560 px. O leitor
recebeu ajustes no sumário, nos controles e nos raios das superfícies; fonte,
tamanho e entrelinha da prosa foram preservados.

Além da home, foram conferidos `/login`, `/catalog`, `/read/visual-public-atlas`
(fixture), rota inexistente, `/styleguide`, `/library`, `/settings/ai`,
`/universes` e `/books/new/assisted` sem sessão. O ajuste visual não amplia
autorização nem torna os espaços futuros disponíveis.

Arquivos adicionais: `src/features/auth/components/LoginPage.tsx` e seu CSS,
`src/features/books/components/ReaderView.module.css`,
`src/app/components/FutureSpacePage.module.css`,
`src/app/components/RouteErrorFallback.module.css` e a nova jornada
`e2e/visual/public-layout.visual.ts`. Shell, styleguide e documentação de testes
foram atualizados na mesma entrega.

Validações deste incremento:

- Login e homepage com Vitest: 9 testes passaram em 2 arquivos.
- Primeira rodada de homepage, layout público e leitor com Playwright:
  27 testes passaram nos três temas de desktop.
- Após os ajustes finais em catálogo, fallback e leitor, a repetição das duas
  jornadas afetadas passou com 18 testes nos três temas.
- Typecheck, ESLint dos arquivos TSX/teste alterados, styleguide, anatomia de
  página, arquitetura, Prettier e `git diff --check`: passaram.
- Bundle final e smoke test: passaram, com os mesmos tipos de avisos de chunks
  e imports dinâmicos registrados acima.

As capturas incluem login em 1440/1024/800 × 768, cadastro em 800 × 768,
catálogo, 404 e leitor. Os testes também conferem preservação dos campos na
troca de modo, erro de senha curta e navegação de teclado até o Estúdio com
conta fictícia. Serviços de teste e rede bloqueada continuam sem comprovar
autenticação real. Sem commit, push, deploy ou execução de `npm run validate`.

## Fechamento solicitado em 2026-11-06

O operador autorizou commit após `npm run validate` verde, push, acompanhamento
da CI e publicação dos recursos de backend necessários. Os estados acima
registram a implementação anterior a essa autorização.

A primeira execução do gate parou somente na formatação de
`.impeccable/config.json`; o JSON foi normalizado sem alterar valores. A segunda
execução aprovou 5.310 dos 5.311 testes, com uma falha de montagem do styleguide
descrita abaixo. Todos os limites de cobertura foram atingidos, incluindo
90,22% de funções. Após corrigir o setup, a terceira execução integral passou,
com log local em `.firebase/public-layout-validate-3.log`.

Foram reproduzidas falhas da CI anterior referentes à composição autenticada
já existente. Os testes de atos, compêndio, modais, Estúdio e vínculo de campanha
foram alinhados aos controles atuais, mantendo verificações de seleção,
desvínculo persistente, descrição, rolagem e confirmação. A jornada do compêndio
passa pelo inspetor e abre explicitamente a ficha completa em telas largas.
As 17 jornadas reconferidas no tema Escuro, a jornada principal do compêndio nos
três temas e a de vínculo de campanha nos três temas passaram. A suíte de
produção do styleguide passou em 6 casos, com referência Windows atualizada e
inspecionada. A referência Linux ainda precisa de captura na plataforma da CI.

A auditoria de produção confirmou 30 Functions ACTIVE em Node 24 e 66 índices
READY. Os pacotes foram lidos pelas gerações Storage fixadas, identificando a
necessidade de atualizar `generationApi`, `universeImportApi`,
`universeImportAnalysisApi` e `cleanupUniverseLoreImports` antes do Hosting.
As Rules de Firestore coincidem exatamente; as de Storage só diferem em CRLF/LF.
Não foi identificada necessidade de publicar Rules ou índices nesta rodada.

O shard `3/8` de `npm run test:rules` passou com 90 testes no emulador,
incluindo as provas nativas da importação de universos. A cobertura integral
identificou um teste do catálogo montado sem `TypographyProvider`; o setup foi
alinhado ao `App` real e os 13 testes de `uiComponents.test.tsx` passaram na
execução isolada, sem mudar o produto nem os limites de cobertura.

A conferência visual ampliada também encontrou seletores antigos de gênero
(campo livre substituído pelo seletor com opção de estilo próprio) e a entrada
de campanhas em preparação (agora sob a aba Campanhas em Em andamento). Os
testes foram atualizados para percorrer esses controles existentes. A rodada
ampliada foi interrompida para reduzir a concorrência com o gate integral após
registrar timeouts em fluxos autenticados. Os casos afetados estão sendo
repetidos com um worker; essa rodada parcial não aprova a matriz inteira.
Na rodada dirigida, 27 casos passaram; as duas jornadas restantes foram
reconferidas separadamente após os ajustes, com exclusão e universos aprovados
nos três temas. Na jornada de universos, o assistente flutuante é minimizado
pela ação pública antes de salvar o vínculo, respeitando o contrato de posição
preservada ao abrir modais, sem clique forçado ou supressão de verificações.

### Gate integral aprovado

`npm run validate` terminou com código 0 em 2026-11-06, antes do commit:

- Frontend: 400 arquivos e 5.311 testes aprovados.
- Cobertura: statements 89,43%; branches 85,74%; funções 90,25%; linhas 92,57%.
- Scripts: 121 testes aprovados, sem falhas.
- Functions: 4.976 testes aprovados, sem falhas, cancelamentos ou casos pulados.
- Sintaxe de Functions: 498 módulos conferidos.
- Skills, arquitetura, docs, styleguide/anatomia, formatação, lint, typecheck,
  bundle de produção e smoke test: aprovados.

O bundle conserva os avisos de tamanho de chunks e imports dinâmicos também
importados estaticamente. As auditorias de frontend e Functions passaram com
`--audit-level=high`; reportaram, respectivamente, dez e seis vulnerabilidades
moderadas preexistentes. Nenhuma dependência foi alterada nesta entrega.

Os ajustes de testes visuais realizados durante o gate também foram conferidos
por ESLint e Prettier. A revisão final não identificou bloqueadores adicionais
no diff. Push, CI, publicação de Functions e Hosting serão conferidos após este
registro; a captura Linux do styleguide permanece pendente na plataforma da CI.
