# Styleguide & Design System

A base visual do Writer Assistant é estruturada em torno do padrão **shadcn/ui** (utilizando **Tailwind CSS**, **Radix UI Primitives** e **Lucide React**), com componentes abertos, tipados e modulares localizados em `src/shared/ui` e motor de temas dinâmico em `src/shared/theme`. A referência interativa viva está disponível na rota `/styleguide`.

## Instalação e imports

O CSS global é importado uma única vez em `src/main.tsx`:

```tsx
import './styles/globals.css';
```

Os componentes de interface são importados pelo módulo compartilhado `@/shared/ui`:

```tsx
import { Button, Card, Input, PageHeader, Dialog, Badge } from '@/shared/ui';
```

## Motor de Temas (`src/shared/theme`)

A aplicação possui suporte nativo e reativo a múltiplos temas, controlados pelo `ThemeProvider` e pelo hook `useTheme`:

1. **Tema Claro (`light`)**: Superfícies de papel claro com acentos em bronze e contraste de leitura.
2. **Tema Escuro (`dark`)**: Carvão quente, superfícies fumê e acentos em âmbar para foco noturno.
3. **Tema Sépia (`sepia`)**: Tom quente e relaxante inspirado em pergaminho e papel de livro, ideal para sessões prolongadas de leitura e escrita.
4. **Sistema (`system`)**: Acompanha a preferência do sistema operacional (`prefers-color-scheme`).

O controle de alternância de tema no cabeçalho é feito via `<ThemeToggle />` ou `<ThemeSelect />`.
Existe um único `ThemeProvider`, em `App`; não o duplique no bootstrap, pois
provedores independentes disputam o atributo do tema ao mudar a preferência do sistema.

## Regras de Interface

1. **Tokens Semânticos**: Cores e superfícies vêm das variáveis CSS (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--muted`, `--accent`, etc.) definidas em `src/styles/globals.css`.
2. **Ícones**: Biblioteca oficial `lucide-react` com a classe `icon` (`icon-sm` para dimensões menores).
3. **Componentes Padrão**: Campos utilizam `Input`, `Textarea` ou `Select` de `@/shared/ui`.
4. **Resiliência Visual**: Toda tela com busca assíncrona cobre estados de carregamento (`LoadingState`), lista vazia (`EmptyState`), erro com retry (`ErrorState`) e sucesso.
5. **Acessibilidade (a11y)**: Primitivos do Radix UI apoiam os padrões WAI-ARIA (fechamento por tecla `Esc`, armadilhas de foco, navegação por teclado e rótulos de leitor de tela).

## Kit de Componentes (`src/shared/ui`)

- `Button`: Variantes (`primary`, `secondary`, `outline`, `destructive`, `ghost`, `link`) e tamanhos (`sm`, `md`, `lg`, `icon`).
- `Input`: Entrada de texto com suporte a labels flutuantes, ícones, helpers e erros.
- `Textarea`: Área de texto redimensionável com feedback de validação.
- `Select`: Menu de seleção acessível.
- `Badge`: Pílulas de identificação e status (`default`, `secondary`, `accent`, `success`, `destructive`, `outline`).
- `Card`: Agrupamento de conteúdo (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
- `Dropdown`, `DropdownItem`, `DropdownLabel`: Menus acessíveis de navegação e conta.
- `Tooltip`: Dicas por hover, foco e toque.
- `Dialog`: Modais acessíveis construídos sobre o Radix UI Dialog.
- `Alert`: Avisos contextuais (`info`, `success`, `warning`, `destructive`).
- `LoadingState`, `EmptyState`, `ErrorState`: Estados padrão de ciclo de vida.
- `PageHeader`: Cabeçalho padrão de páginas com suporte a breadcrumbs e ações.
- `Table`: Tabelas responsivas estilizadas.
- `StyleguidePage`: Página viva do catálogo acessível em `/styleguide`.

## Favicon

O favicon em `public/writer-favicon.svg` usa a pena `Feather` do Lucide, o mesmo símbolo
do cabeçalho, sobre um quadrado bronze com cantos arredondados. As cores fixas do
asset reproduzem os tokens `--primary` (26 48% 36%) e `--background` (40 20% 97%)
do tema claro; o SVG independente não herda o CSS da aplicação. O fundo mantém o
contraste em abas claras e escuras, e os traços reforçados favorecem tamanhos pequenos.
A referência em `index.html` usa um nome próprio para renovar o cache ao
substituir a identidade anterior. O asset é servido localmente, sem fontes ou imagens externas.

## Verificação

```bash
npm run check:styleguide
npm run validate
```

## Direção visual: estúdio de escrita

A referência de composição é o [Tripo Studio](https://studio.tripo3d.ai/pt):
barra destacada em cápsula, vidro fumê, superfícies arredondadas e controles discretos.
O Writer mantém identidade própria, com tons de papel e carvão quente, bronze/âmbar
para ações e tipografia editorial na escrita. Nenhum logotipo, imagem ou conteúdo do
Tripo integra o aplicativo.

- **Hierarquia:** fundo ambiente → shell translúcido → superfície de trabalho → controles.
- **Vidro:** `.glass-surface` usa fallback opaco e aplica `backdrop-filter` somente
  quando suportado. O blur de 20 px fica no cabeçalho e nos painéis externos; a
  página de escrita é opaca, sem transparência atrás do texto.
- **Raios:** 10 px em controles pequenos, 16 px em agrupamentos, 24–36 px em painéis,
  cápsulas em navegação e ações. Bordas finas substituem sombras pesadas.
- **Leitura:** Georgia com fallback serif, corpo de 18 px e entrelinha de 1,85 no
  manuscrito. A interface usa a fonte do sistema; nenhuma fonte externa é baixada.
- **Acessibilidade:** foco visível, link para pular ao conteúdo e retorno de foco
  ao fechar diálogos controlados. `prefers-reduced-motion` remove animações;
  `prefers-reduced-transparency` e `prefers-contrast: more` tornam o vidro opaco.
- **Responsividade:** grades respeitam a largura disponível, barras de ferramentas
  quebram linhas e o compêndio aparece abaixo do manuscrito em telas estreitas.
  Na biblioteca, cada livro tem largura máxima de 300 px e capa vertical na
  proporção 2:3, inclusive sem imagem ou quando existe apenas uma obra. Capas
  usam recorte proporcional sem distorção; os metadados podem quebrar linhas.
- **Movimento:** entrada breve na apresentação, resposta de hover nos livros e
  abertura do painel contextual. Não há animação contínua atrás do editor.
- **Criação de livro:** modal em três etapas (Livro, Sinopse, Capa), com progresso, Voltar/Continuar e foco no título da etapa. Sugestões exigem aceite explícito com preço visível. Prévia de capa em 2:3; criação manual disponível em falha da IA.

Os tokens ficam em `src/styles/globals.css`; os três temas e a preferência do
sistema continuam compartilhando um único provider. A suíte visual usa serviços
fictícios em configuração exclusiva de teste, nunca um modo de demonstração no
bundle de produção.

O header usa navegação de bibliotecas à esquerda com breadcrumb do livro nas
rotas privadas. O saldo mostra somente ícone e número, com detalhes no tooltip.
Nome/avatar abre email e saída em dropdown. Imagens da biblioteca têm miniaturas
2:3, carregamento tardio e controles de gerenciamento com rótulos acessíveis.

Os exemplos de Dropdown e Tooltip ficam no modal de demonstração do catálogo.

## Fichas de lore por etapas

Criação e edição de lore local/global usam quatro etapas: Identificação,
Características, História e notas, Relações e visibilidade. O progresso fica
visível, o foco acompanha o título da etapa e Voltar preserva campos. O conteúdo
da etapa pode rolar em janelas pequenas, mantendo ações no rodapé do diálogo.
Relações são editadas uma por vez; o escopo global é indicado antes dos campos.
O novo fluxo usa os componentes e tokens existentes e os mesmos três temas.
