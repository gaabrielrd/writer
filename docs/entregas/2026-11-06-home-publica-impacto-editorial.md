# Home pública com maior presença editorial

## Objetivo e resultado

Dar mais impacto à apresentação pública antes do login, preservando os textos,
os destinos e a identidade visual do Writer. Implementação local em
`codex/home-publica-impacto`. A implementação inicial ficou sem commit; o Hosting
foi publicado por solicitação explícita, conforme o registro abaixo. O fechamento
posterior com commit local e republicação está registrado ao final.

- Título editorial ampliado, com destaque em itálico e cor semântica em Ficção.
- Ação de começar junto da apresentação, com foco visível e área mínima de 48 px.
- Painel bronze com o lema em três linhas e contraste pelos tokens
  `primary`/`primary-foreground`, acompanhando os três temas.
- Recursos em faixa inferior, sem cartões adicionais. Composição em uma coluna
  até 800 px; preferência por movimento reduzido respeitada no hover da seta.
- Carregamento da sessão e redirecionamento ao Estúdio preservados.
- Ajuste solicitado: frase final alinhada à esquerda, em itálico e na cor
  semântica `primary` (bronze). Conferido no Chromium em 1280 × 720, com
  `text-align: left`, `font-style: italic` e cor computada `rgb(136, 86, 48)`
  no tema claro. Captura local: `visual-test-results/home-publica-frase.png`.

## Arquivos da entrega

- `src/features/home/components/HomePage.tsx`
- `src/features/home/components/HomePage.module.css`
- `e2e/visual/public-home.visual.ts`: inclui notebook de 1280 × 720.
- `docs/styleguide.md`: descrição atualizada da Home pública.
- Este registro.

## Verificações executadas

- Vitest da HomePage: **2 testes aprovados**.
- Playwright de `public-home.visual.ts`: **9 cenários aprovados**, nos temas
  claro, escuro e sépia. Cada cenário de apresentação verifica 1440 × 1000,
  1280 × 720, 1024 × 768 e 800 × 900, incluindo ausência de overflow horizontal
  e ação principal dentro da janela. Os demais cenários verificam teclado até
  o login e redirecionamento da sessão autenticada.
- Capturas inspecionadas em claro, escuro e sépia, incluindo desktop, notebook
  e composição em uma coluna. Trata-se de inspeção renderizada, sem baseline
  novo de regressão por pixels.
- `npm run typecheck`, `npm run build:bundle` e `npm run smoke:build`: aprovados.
- `npm run check:styleguide`, `npm run check:architecture` e
  `npm run check:docs`: aprovados.
- ESLint do componente, Prettier dos arquivos alterados e `git diff --check`:
  aprovados.

## Ambiente e limites da evidência

A primeira execução visual teve 8 aprovações e um timeout. Uma repetição sofreu
falhas de carregamento durante outras execuções no mesmo checkout. A execução
final usou um wrapper temporário da configuração visual existente, porta 4191,
cache separado e exclusão dos relatórios do watcher, sem mudar a configuração
permanente. O wrapper precisou ser corrigido para resolver o diretório de trabalho
e invocar a configuração Vite exportada como função. A execução final completa
passou em 1,3 minuto. Capturas e traces ficam no diretório local ignorado
`visual-test-results`; o resultado aprovado está em `home-publica-isolada`.

As rotas e componentes são reais; autenticação e dados do teste visual são
fixtures, sem backend de produção. A captura inicial da página pública também
foi conferida no servidor Vite normal. Não houve operação de uma conta real.

`npm run validate` não foi executado: este fechamento usa verificações
direcionadas e não inclui commit ou merge. Não constitui aprovação da suíte
global, CI ou lançamento. O build emitiu avisos de tamanho de chunks e imports
dinâmicos ineficazes em outros módulos, fora desta alteração.

## Como conferir

Abra `/` sem sessão. Confira o destaque editorial, a ação principal e os três
temas. Pelo teclado, use o link de pular ao conteúdo e avance até o botão de
começar; Enter deve abrir `/login`. Com sessão, `/` deve continuar encaminhando
ao Estúdio. Nenhuma alteração desta entrega modifica a Home autenticada.

## Publicação do Hosting em 2026-11-06

O operador autorizou o deploy do Hosting e pediu para pular as validações.
Foi gerado somente o bundle de produção com
`npm run build:bundle -- --outDir .firebase/home-publica-hosting/dist`, incluindo
o ajuste final da frase em bronze, itálico e alinhada à esquerda.

Uma configuração temporária manteve as regras de Hosting e os rewrites de
`firebase.json`, usando esse diretório isolado. A publicação executada foi:

```powershell
firebase deploy --only hosting --project writer-44cd5 --config .firebase/home-publica-hosting/firebase.json --non-interactive
```

O Firebase CLI confirmou upload de 68 arquivos, finalização da versão e
`release complete`/`Deploy complete!`, com saída 0. URL publicada:
<https://writer-44cd5.web.app>.

Não foram executados testes, lint, typecheck, smoke, `npm run validate` ou
checagens de navegador nesta etapa de publicação. Functions, Firestore Rules e
Storage Rules não foram implantados. Não houve commit, push ou execução de CI.

## Fechamento conjunto das duas Homes

Ainda em 2026-11-06, o operador autorizou o commit local das mudanças e uma nova
publicação do Hosting, incluindo a Home logada. O commit reúne as alterações das
duas telas, seus testes e documentação. As verificações e os hooks foram pulados
nesse fechamento, por pedido explícito. A nova publicação foi confirmada pelo
Firebase CLI, sem push ou implantação de Functions/Rules. Veja o
[registro da Home logada](2026-11-06-home-logada-retomada-e-criacao.md#fechamento-commit-local-e-hosting).
