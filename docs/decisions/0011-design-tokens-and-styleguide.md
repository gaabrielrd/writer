# ADR 0011: Design tokens, styleguide inicial e biblioteca de ícones

## Status

Substituída pela [ADR 0014](0014-extract-shared-styleguide-package.md). A
decisão abaixo registra o estado anterior à extração do pacote.

## Contexto

O template entregava componentes com cores literais espalhadas pelos CSS
Modules (`#646cff`, `#f8d7da`, `rgba(...)`) e nenhuma orientação visual. Cada
projeto criado a partir dele reinventava paleta, espaçamento e tipografia, e
não havia nada que sobrevivesse ao `npm run setup` para manter coerência entre
os projetos. Faltava também uma decisão sobre biblioteca de ícones: sem padrão,
cada feature adicionava a sua.

A [ADR 0005](0005-css-modules.md) já previa que temas dinâmicos exigiriam CSS
Variables organizadas — este é o passo que faltava.

## Decisão

1. **Tokens em `src/shared/styles/tokens.css`** como única fonte de valores de
   cor, tipografia, espaçamento, raio, sombra e movimento. Nenhum outro CSS
   declara cor literal; componentes consomem `var(--token)`.
2. **Tema padrão `vitru`**, declarado em `:root[data-theme='vitru']` (e também
   em `:root`, para nunca renderizar sem paleta) e aplicado pelo atributo
   `data-theme` no `<html>`. Um tema novo é um bloco adicional, não um fork dos
   componentes.
3. **`lucide-react` como biblioteca de ícones padrão**, em `dependencies`, com
   tamanho e espessura vindos dos tokens pelas classes utilitárias `icon` e
   `icon-sm` definidas em `global.css`.
4. **Styleguide vivo em `/styleguide`** (`src/features/styleguide`), que
   renderiza os tokens reais em vez de duplicar seus valores. Permanece no
   projeto depois do setup e serve de referência para pessoas e agentes.
5. **`npm run check:styleguide`**, dentro do `npm run validate`, que **avisa**
   (sem falhar) quando as regras acima são quebradas. O modo `--strict`
   transforma os avisos em erro para quem quiser essa rigidez.
6. **`npm run generate:feature` já cria o CSS Module** da feature usando
   tokens, para que o caminho fácil seja o caminho correto.

## Alternativas consideradas

- **Tailwind CSS ou biblioteca de componentes (MUI, shadcn)**: resolveria a
  consistência, mas troca a decisão da ADR 0005, adiciona build e dependências
  e engessa a identidade visual. Rejeitado.
- **Somente documentação**: barato, porém invisível no dia a dia e ignorado com
  facilidade por pessoas e agentes. Rejeitado como solução isolada.
- **Verificação bloqueante desde já**: reprovar cor literal no `validate`
  daria a garantia mais forte, mas atrapalha refatorações visuais em
  andamento. Escolhemos avisar por padrão e oferecer `--strict`.

## Consequências

- **Positivas:**
  - Trocar a identidade visual é editar um arquivo, não varrer componentes.
  - Projetos gerados pelo template nascem coerentes entre si.
  - Ícones consistentes em tamanho, cor e semântica de acessibilidade.
  - Agentes têm uma referência executável (`/styleguide`) e uma verificação.
- **Negativas:**
  - Uma dependência de runtime a mais (`lucide-react`).
  - A página do styleguide entra no bundle de quem não a remover.
  - Os avisos do `check:styleguide` dependem de disciplina: sem `--strict`,
    não impedem o merge.
