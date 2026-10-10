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
- `Dialog`: Modais acessíveis construídos sobre o Radix UI Dialog.
- `Alert`: Avisos contextuais (`info`, `success`, `warning`, `destructive`).
- `LoadingState`, `EmptyState`, `ErrorState`: Estados padrão de ciclo de vida.
- `PageHeader`: Cabeçalho padrão de páginas com suporte a breadcrumbs e ações.
- `Table`: Tabelas responsivas estilizadas.
- `StyleguidePage`: Página viva do catálogo acessível em `/styleguide`.

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
- **Movimento:** entrada breve na apresentação, resposta de hover nos livros e
  abertura do painel contextual. Não há animação contínua atrás do editor.

Os tokens ficam em `src/styles/globals.css`; os três temas e a preferência do
sistema continuam compartilhando um único provider. A suíte visual usa serviços
fictícios em configuração exclusiva de teste, nunca um modo de demonstração no
bundle de produção.
