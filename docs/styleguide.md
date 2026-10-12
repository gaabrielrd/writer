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
- `Input`: Entrada de texto com rótulo persistente, ícones, hints/erros associados por ARIA e IDs únicos.
- `Textarea`: Área de texto redimensionável com feedback de validação associado por ARIA.
- `FormSection`: Seção opcional acessível por botão, Enter/Espaço e `aria-expanded`/`aria-controls`. Mantém os campos montados ao recolher; aceita abertura controlada, descrição e bloqueio durante operações.
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
- **Criação de livro:** título/gênero diretamente acessíveis, sinopse/capa em seções opcionais, salvamento disponível pelos dados essenciais. Sugestões exigem aceite explícito com preço visível. Biblioteca e prévia de capa em 2:3 têm prioridade; URL é secundária. Criação manual disponível em falha da IA.

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

## Hierarquia e continuidade

Os controles de campo compartilham `--control-height` (44 px), raio
`--radius-sm`, rótulos de 14 px em caixa normal e feedback discreto. Formulários
usam intervalos de `--space-4`; seções opcionais têm borda fina e superfície
`--card`, sem competir com a ação principal. Botões preservam área de toque,
menus usam estados discretos e confirmação destrutiva recebe destaque apenas
no contexto de confirmação. Avisos informativos usam superfícies neutras;
sucesso e atenção usam tokens semânticos nos três temas.

| Contexto                                                            | Composição                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| Trabalho prolongado, conversa, biblioteca, revisão de muitas fichas | Página com contexto e navegação persistentes            |
| Consulta durante escrita                                            | Painel lateral de lore; mantém manuscrito e capítulo    |
| Criação/edição breve ou confirmação                                 | Modal com header/footer fixos e corpo rolável           |
| Campos opcionais de um mesmo registro                               | `FormSection`, sem sequência obrigatória                |
| Dependências reais de arquivo ou IA                                 | Fases contínuas com contexto, preços e aceite explícito |

Carregamento anuncia a operação; vazio explica como começar; erro preserva
rascunho e oferece retry; sucesso só aparece após a gravação. Erros de
formulário recebem foco e não desaparecem ao abrir uma seção. A importação
mantém o arquivo escolhido e a seleção dos capítulos durante a revisão;
metadados opcionais ficam em “Sobre a obra”.

O PDF permite expandir a prévia para texto e página original em duas colunas no
desktop, empilhadas até 760 px. A prévia textual é somente leitura e acessível
por teclado. Avisos identificam páginas sem texto, imagens e estrutura ambígua;
as ações de dividir/unir seguem o kit compartilhado e preservam a revisão.

Criação assistida conserva
entrevista/briefing/revisão/capa, com progresso discreto e badges de categoria
sem ocupar a largura inteira do card. O manuscrito e os padrões recentes de
capítulos, atos, minimapa e personas permanecem intactos.

## Detalhes do livro

A criação assistida usa página própria com progresso em cinco etapas, conversa
e resumo lado a lado em telas largas, empilhados no celular. Revisão e fichas
usam cards; edição reutiliza o formulário de lore por seções, com visibilidade
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
preservam o texto para uma nova tentativa. A listagem reutiliza a tabela do
Compêndio: superfície contínua com borda arredondada, cabeçalho de colunas
Capítulo, Palavras e Ações e divisórias entre linhas. O checkbox de selecionar
todos os resultados exibidos fica no cabeçalho, com estado intermediário.
Cada capítulo ocupa uma linha com ordem, título na cor primária que abre o editor,
contagem alinhada e ações discretas por ícone. Atos formam grupos de linhas com
cabeçalhos internos; atos vazios conservam sua mensagem. A seleção destaca a linha.
As opções desse menu são “Renomear”, “Mover para cima”, “Mover para baixo” e
“Excluir”, sem repetir o título do capítulo; o botão que abre o menu mantém
o título no rótulo acessível para identificar a linha.
Títulos longos usam reticências e mantêm o texto completo no atributo `title`. Em telas
pequenas, títulos, contagens e ações permanecem na mesma linha e as contagens ficam
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

## Fichas de lore por seções

Identificação e visibilidade permanecem disponíveis em criação e edição local/global. Nome e resumo válidos permitem salvar diretamente. Características, história/notas e relações usam `FormSection`, abertas conforme necessidade, sem perder dados ao recolher. No desktop, nome e categoria compartilham uma linha; no celular, ficam empilhados. O diálogo usa até 80vh, com rodapé fixo e corpo rolável. Campos privados, aliases, relações e limites permanecem iguais. Alcance global e impacto na publicação são informados antes de salvar; falhas preservam o rascunho e permitem retry.

## Editor de capítulos e revisão do lore

O retorno abre o livro atual. Configurar inteligência artificial fica no menu
do usuário do header e reutiliza o mesmo diálogo em todas as páginas. A barra
contextual do capítulo usa espaçamento discreto; editor e compêndio usam superfícies
opacas, controles compactos e estados ativos discretos. O manuscrito conserva
Georgia, 18 px e entrelinha 1,85 em escrita e leitura.

A área de escrita não exibe outline, inclusive em foco por teclado. Os demais
controles preservam foco visível. Selecionar um trecho mostra uma
barra de ações de IA acima da seleção; quando falta espaço, ela aparece abaixo.
A barra acompanha rolagem/redimensionamento e desaparece ao limpar a seleção,
clicar fora ou pressionar Escape. Alt+Enter leva o foco às
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
O capítulo permanece editável, sem seletor Edição/Preview na barra. Apenas a
aplicação de sugestões de IA bloqueia temporariamente a escrita. A seta de
voltar ao livro não possui borda. Não há divisória entre o header do capítulo e o editor.

## Atos e seleção de capítulos

Novo ato e Novo capítulo usam modais. A busca quase sem borda fica ao lado de
Novo capítulo e conserva contraste e foco visível. Cabeçalhos de ato separam
linhas compactas; checkboxes individuais e Selecionar exibidos identificam a
seleção, incluindo estado intermediário. As ações em lote aparecem próximas
à lista, quebram linha em celular e exigem confirmação com quantidade e títulos.
Veja [contrato de atos](book-acts.md).

O minimapa ocupa uma faixa interna à esquerda do manuscrito: 88 px no desktop,
40 px até 760 px, abaixo das ferramentas e do resumo de lore. Parágrafos usam
linhas discretas; títulos têm traço forte; entidades têm marcas por categoria.
Os indicadores usam o fundo das tags correspondentes (`accent`, `success`,
`primary`, `secondary`), com linha de 1 px e contorno de 2 px sem escala de traço.
Marcas reservam 1 px de intervalo; ocorrências próximas são agrupadas, com
categorias lado a lado para evitar sobreposição de cores.
`--badge-success-background` acompanha o verde da variante `success` do Badge,
incluindo sua preferência de esquema de cor do sistema. Um retângulo com borda
e fundo semântico indica o trecho visível. O controle
mantém foco visível, rótulos de destino e tooltip pelo componente compartilhado.
Em celular, a faixa acompanha a viewport durante a rolagem da página, sem
sobrepor o texto. Veja [minimapa do capítulo](chapter-minimap.md).

## Personas e sliders

`Slider` de `@/shared/ui` envolve um controle nativo de 0 a 100, com nome,
valor visível, significado dos extremos e foco por teclado. Ele usa tokens de
tema e está demonstrado em `/styleguide`. Personas reutilizam `Input`,
`Textarea`, `Dropdown`, `Card` e `Dialog`. A configuração e a biblioteca ocupam
uma página com abas em `/settings/ai`, seguindo os detalhes de livro. Personas
aparecem em lista de linhas clicáveis; detalhes e edição ocupam um único modal
ativo, com header/footer fixos e corpo rolável até 80vh. O mapa de personalidade
usa ícones Lucide, barras nativas de progresso, hierarquia de valores e extremos,
em duas colunas no desktop e uma no celular.
O capítulo permite herdar cada atributo ou definir seu valor. O botão **Persona**
concentra base, complementar, biblioteca e orientações efetivas em um único modal;
a área de escrita não contém uma faixa extra de gerenciamento. No celular,
ações dos detalhes se organizam em duas colunas para preservar espaço de leitura.
