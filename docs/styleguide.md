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
As barras de rolagem de toda a aplicação usam `--muted-foreground` no controle
e `--background` no trilho, incluindo editor, campos, painéis e diálogos em portal.
A regra global preserva largura e interação nativas e acompanha a troca de tema
sem recarregar a página. Navegadores sem `scrollbar-color` recebem fallback
WebKit; no modo de cores forçadas, prevalecem as cores de acessibilidade do sistema.
Existe um único `ThemeProvider`, em `App`; não o duplique no bootstrap, pois
provedores independentes disputam o atributo do tema ao mudar a preferência do sistema.

## Regras de Interface

1. **Tokens Semânticos**: Cores e superfícies vêm das variáveis CSS (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--muted`, `--accent`, etc.) definidas em `src/styles/globals.css`.
2. **Ícones**: Biblioteca oficial `lucide-react` com a classe `icon` (`icon-sm` para dimensões menores).
3. **Componentes Padrão**: Campos utilizam `Input`, `Textarea` ou `Dropdown mode="select"` de `@/shared/ui`; menus de ação utilizam o modo `action` do mesmo componente.
4. **Resiliência Visual**: Toda tela com busca assíncrona cobre estados de carregamento (`LoadingState`), lista vazia (`EmptyState`), erro com retry (`ErrorState`) e sucesso.
5. **Acessibilidade (a11y)**: Primitivos do Radix UI apoiam os padrões WAI-ARIA (fechamento por tecla `Esc`, armadilhas de foco, navegação por teclado e rótulos de leitor de tela).

## Kit de Componentes (`src/shared/ui`)

- `Button`: Variantes (`primary`, `secondary`, `outline`, `destructive`, `ghost`, `link`) e tamanhos (`sm`, `md`, `lg`, `icon`).
- `Input`: Entrada de texto com suporte a labels flutuantes, ícones, helpers e erros.
- `Textarea`: Área de texto redimensionável com feedback de validação.
- `Dropdown`: Seleção acessível (`mode="select"`) e ações (`mode="action"`), com ícones, busca opcional e tokens de tema. Veja [API e exemplos](dropdown.md).
- `Select`: Alias compatível do modo de seleção de `Dropdown`, com `onValueChange`.
- `Badge`: Pílulas de identificação e status (`default`, `secondary`, `accent`, `success`, `destructive`, `outline`).
- `Card`: Agrupamento de conteúdo (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
- `DropdownItem`, `DropdownLabel`: Composição dos menus de navegação e conta, preservando links e gatilhos personalizados.
- `Tooltip`: Dicas por hover, foco e toque.
- `Dialog`: Modais acessíveis construídos sobre o Radix UI Dialog, com altura máxima de `80vh`. Header e footer ficam visíveis; apenas `DialogBody` rola. Passe ações finais por `footer`/`actions`; botões de envio fora do formulário usam `form={id}`. Na API de composição, coloque o conteúdo entre `DialogHeader`, `DialogBody` e `DialogFooter`.
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
rotas privadas. Marca, separadores, menu e título ficam centralizados verticalmente,
com intervalos horizontais uniformes de `--space-4` no desktop e `--space-2`
até 900 px. Os dois separadores compartilham o mesmo estilo; o menu mantém
altura de interação e não acrescenta padding horizontal ao intervalo.
O saldo mostra somente ícone e número, com detalhes no tooltip.
Nome/avatar abre email e saída em dropdown. Imagens da biblioteca têm miniaturas
2:3, carregamento tardio e controles de gerenciamento com rótulos acessíveis.

Os exemplos de Dropdown e Tooltip ficam no modal de demonstração do catálogo.

## Detalhes do livro

A criação assistida usa página própria com progresso em cinco etapas, conversa
e resumo lado a lado em telas largas, empilhados no celular. Revisão e fichas
usam cards; edição reutiliza o formulário de lore por etapas, com visibilidade
privada fixa. A capa conserva 2:3. A mudança de etapa move o foco ao título;
durante operações, campos ficam bloqueados e o status é anunciado. Preços,
expiração e recuperação de respostas incertas aparecem junto das ações.

A sinopse começa limitada a duas linhas. O controle discreto “Mais” expande o
texto completo; “Menos” recolhe novamente e informa o estado por `aria-expanded`.
As ações de exportar, importar documento, editar e excluir ficam no menu `...`
rotulado “Opções do livro”. Fechar um diálogo aberto por esse menu devolve o foco
ao botão de opções.

A barra de capítulos reúne quantidade, total de palavras e “Novo capítulo”.
A criação acontece em um modal com título, Cancelar e Criar capítulo; falhas
preservam o texto para uma nova tentativa. Cada capítulo ocupa uma linha com
ordem, título, palavras, escrita e menu de renomear, mover e excluir.
As opções desse menu são “Renomear”, “Mover para cima”, “Mover para baixo” e
“Excluir”, sem repetir o título do capítulo; o botão que abre o menu mantém
o título no rótulo acessível para identificar a linha.
Títulos longos usam reticências e mantêm o texto completo no atributo `title`. Em telas
pequenas, as ações usam ícones com rótulos acessíveis e as contagens permanecem
visíveis, sem transbordamento horizontal.

O Compêndio reúne “Lista / Grid” e “Nova Entidade” ao lado das abas do livro
quando há largura. As ações ficam fora do `tablist`; páginas independentes
mantêm os controles locais. Busca e categorias compartilham uma linha em telas
grandes, sem rótulo visual de busca, mantendo nome acessível.

O Grid preserva os cards. A Lista permite selecionar entidades individualmente
ou todos os resultados exibidos, com checkbox intermediário. Busca, categoria,
modo, escopo, livro e saída da aba limpam a seleção. Uma barra fixa no rodapé
mostra quantidade, visibilidade, exclusão e limpar seleção; o conteúdo reserva
espaço para ela. Visibilidade e exclusão em lote exigem modal com confirmação
explícita, identificação da seleção e aviso de impacto na publicação/escopo.
Falhas preservam somente as entidades pendentes para retentativa. Em celular,
linhas, controles e barra se reorganizam sem ampliar a largura da página.

## Fichas de lore por etapas

Criação e edição de lore local/global usam quatro etapas: Identificação,
Características, História e notas, Relações e visibilidade. O progresso fica
visível, o foco acompanha o título da etapa e Voltar preserva campos. O conteúdo
da etapa pode rolar em janelas pequenas, mantendo ações no rodapé do diálogo.
Relações são editadas uma por vez; o escopo global é indicado antes dos campos.
O novo fluxo usa os componentes e tokens existentes e os mesmos três temas.

## Editor de capítulos e revisão do lore

O retorno abre o livro atual. Configurar inteligência artificial fica no menu
do usuário do header e reutiliza o mesmo diálogo em todas as páginas. A barra
contextual do capítulo usa espaçamento discreto; editor e compêndio usam superfícies
opacas, controles compactos e estados ativos discretos. O manuscrito conserva
Georgia, 18 px e entrelinha 1,85 em escrita e leitura.

A área de escrita não exibe outline, inclusive em foco por teclado. Os demais
controles preservam foco visível. Selecionar um trecho no modo Edição mostra uma
barra de ações de IA acima da seleção; quando falta espaço, ela aparece abaixo.
A barra acompanha rolagem/redimensionamento e desaparece ao limpar a seleção,
clicar fora, pressionar Escape ou entrar em Preview. Alt+Enter leva o foco às
ações; as setas laterais navegam e Escape devolve o foco ao manuscrito.
Em celular, as ações usam ícones com tooltip e nome acessível.

Continuar Cena, Aprimorar Estilo e Coerência com Lore abrem o mesmo assistente
e geram uma sugestão para o trecho capturado. Instrução personalizada abre o
campo com foco, sem gerar antes de Executar. O modal não tem footer nem atalho
para BYOK: opções, campo e Executar ocupam uma coluna. Resultado, Copiar e
Substituir Seleção/Inserir no Texto ficam no corpo rolável. A escrita só muda
após aceite explícito; fechar devolve o foco ao editor.

No menu de menções `@`, o item ativo usa `--primary` e `--primary-foreground`,
borda interna e indicador de confirmação, distinguindo seleção de hover nos
três temas. Nome e resumo herdam a cor de texto do item selecionado.

O topo do painel lateral reúne Compêndio, Nova, atualizar pelo texto e fechar.
A atualização usa ícone com tooltip; a busca mantém nome acessível sem rótulo
visual. Categorias compactas informam o estado por `aria-pressed`; o seletor
local/global permanece disponível quando o livro pertence a um universo.
Uma única divisória separa os controles das fichas.

Atualizar compêndio abre análise/revisão/aplicação em um modal. Cada proposta
mostra status, evidência, destino e campos atuais/propostos editáveis. A seleção
é acessível por entidade e campo; criações são privadas e o destino global tem
aviso de alcance. Preço visível: 1 crédito por lote aplicado; BYOK sem créditos
da plataforma. Veja [atualização do compêndio](lore-analysis.md).

O contador de créditos fica sempre no header principal, inclusive no editor.
Os modos **Edição** e **Preview** formam um controle dividido (split button),
com a mesma altura, tipografia e superfície dos botões secundários vizinhos,
extremidades arredondadas, divisória única e estado ativo acessível. A seta de
voltar ao livro não possui borda. Não há divisória entre o header do capítulo e o editor.
