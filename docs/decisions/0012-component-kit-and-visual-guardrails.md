# ADR 0012: Kit de componentes e barreiras visuais automáticas

## Status

Substituída pela [ADR 0014](0014-extract-shared-styleguide-package.md). A
decisão abaixo registra o estado anterior à extração do pacote.

## Contexto

O template é usado por pessoas sem formação em programação, que conduzem
agentes para construir as telas. Duas consequências práticas:

1. elas não têm como julgar se o resultado visual saiu do padrão;
2. o agente, sem um caminho pronto, improvisa a marcação de cada tela — e cada
   projeto fica diferente do anterior.

A [ADR 0011](0011-design-tokens-and-styleguide.md) resolveu os valores (cor,
espaçamento, tipografia), mas `shared/components` tinha apenas `Button` e
`ErrorBoundary`. Um pedido como "faça a tela de cadastro" ainda produzia
formulário, tabela e estados de tela inventados do zero, cada vez de um jeito.
O `check:styleguide` só avisa, e aviso depende de alguém ler.

## Decisão

1. **Kit base fechado em `shared/components`**, exportado por
   `@/shared/components`: `PageHeader`, `Card`, `Button`, `Input`, `Textarea`,
   `Select`, `Table`, `Alert`, `Badge`, `Dialog`, `LoadingState`,
   `EmptyState`, `ErrorState` e `ErrorBoundary`. Todos consomem tokens e já
   trazem a semântica de acessibilidade esperada (rótulo ligado ao controle,
   `aria-invalid`, `aria-describedby`, legenda de tabela, `role` correto). O
   caminho fácil passa a ser o caminho certo.
2. **ESLint como barreira bloqueante** para as decisões estruturais:
   `no-restricted-imports` recusa outra biblioteca de ícones, framework de
   CSS/UI e `react-router-dom`. Roda no `lint` e no pre-commit, então o desvio
   não depende de alguém ler um aviso.
3. **Proteção visual em duas camadas** (`e2e/styleguide.spec.ts`): um contrato
   de estilo determinístico, que compara valores computados dos tokens e das
   cores dos componentes, e uma comparação pixel a pixel da página
   `/styleguide`, com imagem de referência por plataforma.
4. **Ativos de marca no template**: `public/favicon.svg` e `theme-color` no
   `index.html`, além da marca no cabeçalho da aplicação.
5. **`check:styleguide` também verifica o kit**: se um componente sumir do
   índice, o aviso aparece no `validate`.

## Alternativas consideradas

- **Biblioteca de componentes pronta (MUI, shadcn, Chakra)**: entregaria mais
  componentes, mas troca a decisão da ADR 0005, traz dependência grande e
  amarra a identidade visual à da biblioteca. Rejeitado.
- **Só documentar os padrões de tela**: já existe documentação e ela não
  impede a improvisação. Rejeitado como solução isolada.
- **Regressão visual multiplataforma numa única imagem**: impossível sem
  fixar a fonte, porque `system-ui` resolve para famílias diferentes em cada
  sistema. Por isso a imagem é por plataforma e o contrato de estilo cobre o
  que precisa valer em todas.
- **Falhar quando não existe imagem de referência para a plataforma**: deixaria
  o CI vermelho por um arquivo que ninguém gerou. O teste é pulado com a
  instrução de como gerar.

## Consequências

- **Positivas:**
  - Telas de projetos diferentes nascem com a mesma estrutura e semântica.
  - Acessibilidade básica vem de graça em campos, tabelas e estados.
  - Trocar a biblioteca de ícones ou o modelo de estilização passa a exigir
    decisão consciente (o lint recusa antes do commit).
  - Uma mudança visual não intencional aparece como imagem no pull request.
- **Negativas:**
  - Mais superfície para manter em `shared/components`.
  - A imagem de referência precisa ser regerada a cada mudança visual
    intencional, e revisada no diff.
  - Ampliar o kit sem critério recria o problema que ele resolve: componente
    novo só entra se for neutro de domínio e aparecer no `/styleguide`.
