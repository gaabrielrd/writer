# Styleguide & Design System

A base visual do Writer Assistant é estruturada em torno do padrão **shadcn/ui** (utilizando **Tailwind CSS**, **Radix UI Primitives** e **Lucide React**), com componentes abertos, tipados e modulares localizados em `src/shared/ui` e motor de temas dinâmico em `src/shared/theme`. A referência interativa viva está disponível na rota `/styleguide`.

## Como usar este guia

Leia nesta ordem antes de mexer em interface:

1. [Regras de interface](#regras-de-interface) e o
   [kit de componentes](#kit-de-componentes-srcsharedui): tokens, ícones e peças.
2. [Anatomia de página](#anatomia-de-página): as cinco zonas e as regras de ações
   que toda página da área logada segue. Uma tela nova monta essas zonas com o kit
   em vez de criar cabeçalho, abas, filtros ou barra próprios.
3. [Verificação](#verificação): o que o `check:styleguide` barra.

As seções a partir de [Direção visual](#direção-visual-estúdio-de-escrita) são
notas por tela, escritas antes da anatomia de página. Elas descrevem
comportamentos existentes e valem enquanto não contradizem os padrões acima; em
caso de conflito, prevalecem a anatomia de página e a
[ADR 0275](decisions/0275-page-anatomy.md).

## Plataforma inicial

A [direção de suporte](platform-support.md), vigente desde 2026-11-03, prioriza
exclusivamente desktop/laptop no aceite inicial. Temas, teclado, foco e contraste
continuam obrigatórios. As descrições de celular e 320 px neste guia documentam
comportamentos existentes preservados, sem exigir suporte mobile nesta fase.

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
As barras de rolagem de toda a aplicação são finas, com controle em
`--muted-foreground` a 80% e trilho transparente, incluindo editor, campos,
painéis e diálogos em portal. A regra acompanha a troca de tema sem recarregar
a página. Navegadores sem `scrollbar-color` recebem fallback WebKit de 8 px,
controle arredondado e sem setas; hover reforça a cor e arrastar usa `--primary`.
No modo de cores forçadas, prevalecem largura e cores de acessibilidade do sistema.
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
- `ResizeHandle`: Divisor vertical com drag por mouse/toque, limites percentuais,
  setas/Shift/Home/End e duplo clique para restaurar. O separador focável informa
  valor e painel controlado por ARIA; a demonstração está em `/styleguide`.
  Escape cancela um drag com foco no manuscrito, antes dos atalhos globais, sem
  salvar largura parcial. Limites temporários não substituem a preferência.
- `Textarea`: Área de texto redimensionável com feedback de validação associado por ARIA.
- `FormSection`: Seção opcional acessível por botão, Enter/Espaço e `aria-expanded`/`aria-controls`. Mantém os campos montados ao recolher; aceita abertura controlada, descrição e bloqueio durante operações.
- `Dropdown`: Seleção acessível (`mode="select"`) e ações (`mode="action"`), com ícones, busca opcional e tokens de tema. Veja [API e exemplos](dropdown.md).
- `Select`: Alias compatível do modo de seleção de `Dropdown`, com `onValueChange`.
- `Badge`: Pílulas de identificação e status (`default`, `secondary`, `accent`, `success`, `destructive`, `outline`).
- `Card`: Agrupamento de conteúdo (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
- `DropdownItem`, `DropdownLabel`: Composição dos menus de navegação e conta, preservando links e gatilhos personalizados.
- `Tooltip`: Dicas por hover, foco e toque.
- `SidePanelHeader`: Cabeçalho comum de painéis, com título nível 2, grupo nomeado
  de ações, tokens semânticos e controles de 36 px (44 px em ponteiro de toque).
  Demonstração no painel redimensionável do styleguide.
- `Dialog`: Modais acessíveis construídos sobre o Radix UI Dialog, com altura máxima de `80vh`. Header e footer ficam visíveis; apenas `DialogBody` rola. Passe ações finais por `footer`/`actions`; botões de envio fora do formulário usam `form={id}`. Na API de composição, coloque o conteúdo entre `DialogHeader`, `DialogBody` e `DialogFooter`.
- `Alert`: Avisos contextuais (`info`, `success`, `warning`, `destructive`).
- `LoadingState`, `EmptyState`, `ErrorState`: Estados padrão de ciclo de vida.
- `PageHeader`: Cabeçalho padrão de páginas com suporte a breadcrumbs e ações.
- `ObjectHeader`: Cabeçalho de página de objeto (livro, aventura, campanha, universo):
  tipo, título `h1`, capa, metadados, descrição, uma ação principal, até duas
  secundárias e o menu "…". `headingLevel={2}` só quando incorporado em outra página.
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`: abas sublinhadas sobre Radix, com
  cantos inferiores retos para manter o sublinhado contínuo,
  setas, Home/End, contagem opcional e ações da seção fora do `tablist`. Aceitam valor
  controlado para abas guardadas na URL.
- `Toolbar`: barra nomeada de uma seção, com busca e filtros à esquerda, resumo e
  ações à direita. Campos, chips e botões `sm` dividem 36 px (44 px em toque).
- `FilterChips`: filtro de escolha única com `aria-pressed` e contagem opcional; para
  muitas opções, use `Dropdown mode="select"`.
- `InspectorLayout`, `Inspector`, `InspectorEmpty`: coleção com inspetor fixo de 320 px
  à direita, cabeçalho por `SidePanelHeader`, ações no rodapé e região nomeada
  "Detalhes de {item}". Mostre o inspetor só com espaço (`useMediaQuery('(min-width:
1100px)')`); abaixo disso, o item abre como antes. Usado no Compêndio (Lista) e em
  Personas.
- `Table`: Tabelas responsivas estilizadas.
- `StyleguidePage`: Página viva do catálogo acessível em `/styleguide`.

## Anatomia de página

Vigente desde 2026-11-05 ([ADR 0275](decisions/0275-page-anatomy.md)). Páginas da
área logada seguem cinco zonas, nesta ordem:

1. **Barra contextual** do shell, com o caminho até o objeto.
2. **Cabeçalho**: `ObjectHeader` em páginas de objeto; `PageHeader` em coleções e
   configurações. Toda página tem um título `h1`.
3. **Seções**: um único `Tabs` por página.
4. **Barra de ferramentas**: `Toolbar` com busca, `FilterChips` ou `Dropdown`, resumo
   e a ação da seção.
5. **Conteúdo**: tabela, lista ou grade com carregando, vazio, erro e seleção em lote.

Regras:

- No máximo um botão `primary` no cabeçalho e um na barra de ferramentas.
- Excluir, arquivar, backup e exportar ficam no menu "…" (`Dropdown mode="action"`,
  opção `variant: 'destructive'` para exclusão). O botão `destructive` aparece só no
  diálogo de confirmação.
- Ações de linha ou card aparecem no menu do item; o item inteiro abre o detalhe.
- Listas se atualizam sozinhas; recarga manual só como "Tentar novamente" no erro.
- Explicações de regra viram dica, badge ou texto do estado vazio, não parágrafos
  entre controles.
- Coleções longas de revisão (Compêndio e Personas) poderão usar lista com inspetor;
  páginas de objeto podem mostrar "Continuar de onde parou" e próximos passos no topo.

O assistente da página continua flutuante e reposicionável, com a posição salva
por conta. Ele chega minimizado como uma pílula "Assistente" e conserva o modo
escolhido ao navegar entre páginas, projetos e áreas, mantendo o rascunho e
atualizando o contexto sem mover o foco. Aberto, o modo compacto mostra o contexto em um selo e um campo
sem rótulo visual, que cresce com o texto, envia por Enter (Shift+Enter quebra a
linha) e tem o envio por ícone. Expandir mostra a conversa; só a criação com IA
chega aberta, com a conversa de concepção.

Seguem a anatomia: livro, aventura, campanha e universo (`ObjectHeader`, `Tabs`,
menu "…"); Projetos, Compêndio, Imagens, lista de Universos, Em andamento e o
planejador de Cenas (`Toolbar`, `FilterChips`, `Dropdown` compacto); Compêndio do
livro e Personas com inspetor em telas largas; Inteligência artificial (`PageHeader`
e `Tabs`). A demonstração fica em `/styleguide`.

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

`check:styleguide` roda dois scripts. `scripts/check-styleguide.mjs` confere tokens,
ícones e o kit base e só avisa. `scripts/check-page-anatomy.mjs` falha quando um
arquivo de `src/` passa a usar `role="tablist"` fora do `Tabs` do kit ou um
`<Button variant="destructive|danger">` além do que tinha. A contagem permitida
por arquivo fica em `scripts/page-anatomy-baseline.json`, uma catraca que só deve
diminuir: ao migrar um arquivo, rode `node scripts/check-page-anatomy.mjs
--write-baseline` e revise o diff. Botões vermelhos continuam permitidos dentro de
diálogos de confirmação já existentes.

## Direção visual: estúdio de escrita

Na área logada, a referência de organização é a interface do ChatGPT fornecida
pelo operador: navegação lateral, marca discreta e área de trabalho contínua.
O Writer conserva suas cores semânticas, os três temas e a tipografia editorial
do manuscrito. A área pública compartilha essa linguagem, com cabeçalho compacto
e superfícies opacas. O leitor conserva a composição e a tipografia de leitura.

- **Área logada:** lateral de 240 px recolhível, barra contextual de 48 px e
  conteúdo sem largura máxima. Margens de 12–16 px; rolagem principal dentro da
  área de trabalho e lateral com rolagem própria se necessário.
- **Navegação:** links diretos em Criar (Estúdio, Universos e Imagens), Explorar
  (Publicações, Catálogo e Biblioteca) e Configurar (IA), com destino atual por
  aria-current. A marca e o contexto da página ficam à esquerda e centralizados verticalmente
  em suas barras.
  O cabeçalho principal só mostra o botão de abrir quando a lateral está fechada.
  Conta, créditos e tema ficam agrupados em um card no rodapé, sem divisor externo.
  O tema usa três botões segmentados (Claro, Escuro e Sépia) com aria-pressed;
  saldo e seletor compartilham fundo transparente, borda discreta, raio e altura. Até 760 px, a navegação abre em
  gaveta modal com Escape, foco contido e retorno ao gatilho.
- **Densidade:** controles em 14 px, títulos de página em 20 px, raios menores e
  superfícies opacas, sem sombras decorativas. Tokens compactos são locais ao
  shell autenticado; o manuscrito mantém sua fonte e entrelinha.
- **Toque:** navegação e gatilhos têm pelo menos 44 px em ponteiros de toque.
  Recolher a lateral amplia o conteúdo sem remontar o editor.

A Home combina um destaque editorial curto, desenho de livro/pena e acesso à
criação com IA. Retomadas usam cartões compactos com identidade gráfica por tipo,
título, data e ação de largura intrínseca; não consultam capas nem copiam conteúdo
extra para o histórico. Atalhos são linhas com ícone e seta, sem blocos explicativos.
Projetos conserva a lista e suas capas reais em 44 × 66 px. Importação mantém
cartões compactos e as operações conservam seus controles de recuperação.
Nos cabeçalhos, descrições e botões de ponteiro preciso são discretos; em toque,
preservam-se as áreas de interação. Badges usam somente a largura do conteúdo.

- **Shell público:** moldura com borda semântica, recuo externo de 8 px,
  cabeçalho compacto de pelo menos 48 px e superfícies opacas, sem vidro ou
  sombras decorativas. É o padrão da home, login/cadastro, leitor, catálogo e
  demais páginas exibidas sem sessão; não altera seus gates de acesso.
- **Homepage pública:** apresentação em duas colunas, título editorial moderado,
  recursos em um `Card tone="flat"` e ação principal visível em notebooks.
  Até 800 px, a composição passa para uma coluna. Temas e tipografia continuam
  pelos providers compartilhados.
- **Login e cadastro:** formulário centralizado em `Card tone="flat"`, largura
  total de até 440 px, espaçamentos compactos, benefícios separados por linhas
  discretas e botões com raio pequeno. Campos e mensagens conservam os componentes
  compartilhados; troca de modo preserva os valores e limpa o erro anterior.
  O leitor mantém corpo de 18 px e entrelinha de 1,85, sem herdar densidade de edição.
- **Catálogo e rotas indisponíveis:** estados vazios ficam centralizados, sem
  painel decorativo adicional; o fallback de rota usa uma superfície neutra
  limitada a 560 px e mantém a ação de retorno. O leitor usa raios pequenos no
  sumário e no artigo, com navegação compacta e prosa preservada.

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
  Acima de 900 px, o modal manual tem até 960 px e prévia lateral com a mesma
  capa em 2:3, título editorial em destaque, badge de gênero e sinopse. O catálogo
  Projetos usa cards compactos com a fonte da interface; a prévia conserva Georgia
  em 24 px, peso 500 e entrelinha de 30 px.
  A prévia acompanha apenas os dados preenchidos/aceitos e fica oculta em telas menores.

Os tokens ficam em `src/styles/globals.css`; os três temas e a preferência do
sistema continuam compartilhando um único provider. A suíte visual usa serviços
fictícios em configuração exclusiva de teste, nunca um modo de demonstração no
bundle de produção.

Na área logada, a barra contextual mostra o espaço e o breadcrumb do livro.
O saldo conserva ícone/número e detalhes no tooltip, com o mesmo tratamento
visual do seletor segmentado de tema; nome/avatar abre email,
configuração de IA e saída em dropdown no rodapé da lateral. No celular, essas
ações ficam dentro da gaveta. Imagens conservam miniaturas 2:3, carregamento
tardio e rótulos acessíveis.

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

A criação de projeto mantém formulário e conversa centralizados em até 760 px,
inclusive dentro do layout autenticado. Gênero ou estilo oferece sugestões por
`Dropdown mode="select"`, a opção de definir depois e um campo livre de até 120
caracteres ao escolher "Criar meu estilo". Valores próprios de propostas ou
rascunhos aparecem nesse campo sem conversão para uma sugestão.
O aviso de criação em andamento usa ícone de histórico, padding de 16 px e
espaçamento entre a mensagem e a ação "Retomar criação".
A capa opcional do livro oferece biblioteca, geração e ausência de capa tanto
no fluxo manual quanto no assistido. O botão de confirmação mostra o custo da
capa gerada selecionada; o texto manual permanece sem débito.
A criação assistida usa uma conversa central de até 760 px. Mensagens do agente
ficam centralizadas verticalmente na área livre durante a ideia e a entrevista;
o histórico longo tem rolagem independente e o campo de resposta fica no rodapé
do workspace, respeitando a área segura inferior. Briefing, revisão e capa
mantêm seu fluxo normal de página. As mensagens do agente
apresentam a ideia e orientam briefing, revisão e capa; falas do usuário usam
superfície secundária. O campo de mensagem não possui rótulo visual nem hint;
mantém nome acessível, envio por Enter, quebra por Shift+Enter e respeito à
composição de texto. O foco retorna ao campo após cada resposta. As decisões
ficam em “Ideias que reunimos”, recolhido por padrão; “Revisar ideia” encerra
a entrevista explicitamente. O progresso numerado em cinco etapas é complementar;
no celular, somente a etapa atual mostra seu nome visualmente.

Revisão e fichas usam cards; edição reutiliza o formulário de lore por seções,
com visibilidade privada fixa. A capa conserva 2:3. Etapas de revisão levam o foco
ao título acessível. Operações bloqueiam os campos e anunciam status. Preços e
privacidade ficam em uma seção recolhível, com total/saldo e confirmação explícita
visíveis na criação. Avisos de expiração e recuperação incerta permanecem junto
das ações.

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

Na edição de capítulo, o cabeçalho e as ferramentas ocupam toda a largura útil
do workspace. A coluna da prosa usa o limite escolhido em Preferências:
640/760/880 px (Pequeno/Médio/Grande), centralizada em sua área de escrita e limitada pelo espaço
disponível, inclusive em tela cheia. O minimapa fica na extremidade
esquerda, perto da navegação. A partir de 1100 px de viewport, os itens de lore
mencionados aparecem em um painel de 280 px à direita, com rolagem própria.
Abrir Compêndio ou Assistente substitui essa lista pelo painel ativo; ao fechar,
a lista retorna. Abaixo desse breakpoint, os itens continuam em uma faixa
horizontal rolável acima do texto. Os demais editores conservam seu layout.

A área de escrita não exibe outline, inclusive em foco por teclado. Os demais
controles preservam foco visível. Selecionar um trecho mostra uma
barra de ações de IA acima da seleção; quando falta espaço, ela aparece abaixo.
Esse menu usa fundo primário, texto em contraste, contorno e sombra destacados;
hover e foco continuam explícitos nos três temas.
A barra acompanha rolagem/redimensionamento e desaparece ao limpar a seleção,
clicar fora ou pressionar Escape. Alt+Enter leva o foco às
ações; as setas laterais navegam e Escape devolve o foco ao manuscrito.
Em celular, as ações usam ícones com tooltip e nome acessível.

Continuar Cena, Aprimorar Estilo, Coerência com Lore e Instrução personalizada
abrem o mesmo chat lateral com o trecho capturado e campo focado. As ações
preparam o pedido; Enviar confirma a geração. Assistente e Compêndio compartilham
posição e dimensões, com um painel ativo. Histórico rola independentemente e o
campo de envio permanece na base. Respostas separam explicação de prosa aplicável;
a escrita muda apenas no aceite explícito. Fechar ou aplicar devolve o foco ao
editor. Comandos `/` usam lista pesquisável por teclado; contexto mostra origem,
prévia e opção de fixar. Veja [chat do capítulo](chapter-chat.md).

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
seguindo a base clara/escura selecionada. Um retângulo com borda
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
O capítulo permite herdar cada atributo ou definir seu valor. **Opções do capítulo → Persona**
concentra base, complementar, biblioteca e orientações efetivas em um único modal;
a área de escrita não contém uma faixa extra de gerenciamento. No celular,
ações dos detalhes se organizam em duas colunas para preservar espaço de leitura.

O modal contextual identifica base e complemento em cards com avatar e função.
Barras mostram valores efetivos e badges de origem; ajustes locais ficam junto
do atributo. Orientações completas usam `FormSection`, recolhidas inicialmente.
No desktop acima de 900 px, o modal usa até 960 px. A biblioteca do modal
apresenta cards com três indicadores de personalidade, duas colunas no desktop
e uma até 600 px, preservando os modelos em uso identificados e o rodapé fixo.

## Ferramentas do editor

A barra do manuscrito organiza controles em grupos nomeados de formatação,
histórico de edição e painéis. Use `Button` compartilhado, ícones Lucide,
estado `aria-pressed`, tokens de tema e foco visível; mantenha seleção durante
ações de formatação por ponteiro. Grupos quebram linhas quando necessário.
Navegação entre capítulos fica em grupo próprio no cabeçalho, ao lado de status,
contagem e tela cheia. Persona e exportação ficam em `Dropdown mode="action"`
sob **Opções do capítulo**, com abertura de diálogo após fechar o menu e restaurar
foco ao gatilho persistente. Todos os recursos continuam acessíveis por teclado.

Assistente e Compêndio reutilizam `SidePanelHeader`; filtros/histórico ficam abaixo
do cabeçalho e o corpo rola independentemente. O chat reserva espaço de leitura
ao limitar a altura do composer, que tem sua própria rolagem. Em viewports baixos,
o estado vazio reduz decoração para manter o título visível. Ações e estados
conservam nomes acessíveis ao usar apenas ícones.

O composer usa um campo com enviar/parar no canto inferior e reserva padding
para o texto. Origem, prévia do contexto e modelo ficam abaixo. Detalhes se
expandem em região nomeada, com rolagem própria e sem encolher até desaparecer;
Escape recolhe a região antes de fechar o chat. O acesso ao modelo abre a aba
Provedor da configuração de IA e conserva a origem para retorno ao editor.

Modelo e raciocínio compartilham uma linha compacta; o nome do modelo pode
truncar com tooltip, conservando o ícone e o seletor. Raciocínio usa
`Dropdown mode="select"`, com nome acessível, escolha retomada por conversa e
opções incompatíveis desabilitadas pela matriz do modelo. Auto permanece
disponível. Uma preferência incompatível conserva seu nome e informa o fallback.

Explique a incompatibilidade por descrição acessível e tooltip do seletor.
Um gesto no divisor que retorna à largura inicial não altera a preferência;
limites temporários de viewport não substituem a proporção salva.

Respostas do assistente têm detalhes nativos de **Modelo e raciocínio**, com
parâmetros solicitados/usados legíveis e quebra de linha. Conversas antigas
identificam Auto e modelo não registrado. Não mostre chaves nem pensamentos
internos. Retry conserva acesso após mudar preferências; regenerar indica
que usa a configuração atual.

## Organização do Estúdio

Estúdio expõe Home, Projetos, Importar e restaurar e Em andamento como
subitens da lateral. O item atual tem indicação visual e aria-current;
o cabeçalho contextual identifica Estúdio e a seção. Home concentra
retomadas recentes, Novo projeto e atalhos, com o mesmo tratamento para
livros, aventuras e campanhas. Configurações pessoais ficam em Preferências.

Projetos usa linhas compactas: miniatura, título, tipo, metadados e ações.
Filtros por tipo ficam acima das listas; filtros editoriais e operacionais
permanecem junto da lista correspondente. Títulos longos quebram sem
sobrepor ações. No celular, metadados passam para a linha seguinte.
A paginação continua independente para cada tipo de projeto.

Importações e backups ficam em grupos distintos com ações explícitas.
Em andamento agrupa painéis nativos em importações/restaurações, campanhas
e exclusões. Estados vazios desses painéis usam apresentação compacta,
sem eliminar suas mensagens ou ações. Grades passam para uma coluna em
telas menores. Superfícies, foco e tipografia continuam usando os tokens
semânticos dos três temas e os componentes compartilhados.

### Largura dos painéis

Preferências oferece Pequeno (960 px), Médio (1280 px, padrão) e Grande
(1600 px) para as páginas. A coluna de escrita usa a largura calibrada da
[tipografia literária](typography.md): 38 rem em Médio, ou 36 rem quando a prosa
usa EB Garamond/Crimson Pro. Pequeno e Grande aplicam 85% e 115% desse limite.
O limite se aplica ao conteúdo centralizado da área logada e
sempre respeita o espaço disponível. A lateral e a barra contextual
conservam sua largura. O modo expandido do editor libera as ferramentas para toda
a área, preservando o limite escolhido para a prosa. Cabeçalho e formatação têm
espaçamentos compactos e controles de 32 px em ponteiro preciso, mantendo 44 px
para toque. A área da prosa usa padding de 12 × 16 px no desktop e 12 × 8 px no mobile.
Os subitens do Estúdio usam ícones Lucide, sem linha vertical decorativa.

Os filtros editoriais e de publicação/condição em Meus projetos usam grupos
de botões segmentados com rótulo visível, nome acessível e aria-pressed na
opção ativa. Reutilizam o tratamento do filtro de tipo e quebram linhas
conforme o espaço disponível, preservando as seleções na URL.

Os filtros segmentados de projetos usam controles de 28 px em ponteiros
precisos e 44 px para toque. Eles acompanham o título da seção quando há
espaço e quebram linhas sem transbordar. Configurações de IA usam abas
segmentadas compactas, PageHeader sem padding duplicado e EmptyState
compartilhado para ausência de personas criadas; retorno é contextual.

## Aba Provedor de IA

Em /settings/ai?tab=provider, o primeiro Dropdown escolhe Firebase AI Logic
ou BYOK. Firebase apresenta modelo e raciocínio Médio/Alto; BYOK apresenta
provedor, chave em campo de senha e modelo personalizado. O formulário usa
Input, Dropdown, Alert e Button compartilhados, com salvar explícito,
mensagem de erro e restauração. Não apresentar temperatura ou tooltip sobre ela.

Biblioteca de Imagens, Publicações, Catálogo e Biblioteca usam o título
contextual da barra principal, sem repetir PageHeader explicativo no corpo.
Estados vazios dessas páginas ocupam o centro horizontal e vertical da área
disponível. Na biblioteca de imagens, falhas iniciais têm o mesmo alinhamento;
erros com imagens já carregadas permanecem junto do conteúdo.

Preferências e Inteligência artificial também usam somente o título da
barra contextual. Seus títulos de grupos, formulários e abas permanecem no
corpo; o retorno contextual da IA é preservado quando aberto de um projeto.

## Criação de temas

A navegação usa Claro, Escuro, Sépia e Personalizados: no rodapé da lateral
na área logada e no cabeçalho público. A lista ancorada tem
seleção e ações em controles separados; menus de editar/remover usam Dropdown.
FloatingPanel é não modal, recolhível, movível por ponteiro/teclado e fica
abaixo dos modais. Suas cores acompanham a prévia aplicada à plataforma.
FormSection organiza o Modo avançado com as 24 cores. Prévia afeta a aplicação
inteira sem persistir ajustes. Veja [temas personalizados](custom-themes.md).

As variantes dark acompanham a classe de tema, não a preferência do sistema.
Badge de sucesso e marcas do minimapa compartilham o mesmo token, incluindo
as paletas personalizadas. Dimensões e espaçamentos permanecem comuns. As fontes
são escolhidas separadamente em Preferências → Tipografia literária, com cinco
presets e Personalizado. Clássico editorial é o padrão. Títulos usam
`--font-display`, interface usa `--font-sans` e prosa usa `--font-reading`.
Prévia é reversível e só persiste após Salvar fontes. Veja [tipografia](typography.md).

No editor de temas, nome e base usam nome acessível sem label visual; Nome é o
placeholder. Todas as cores oferecem Input type=color ao lado do hexadecimal.
Slider de intensidade e picker de matiz compõem uma linha abaixo da base.
A escala preserva a luminosidade e respeita Claro/Escuro na criação.

O Slider aceita `hideLabels` para controles com indicadores visuais próprios.
Essa opção oculta título, valor e escala visuais, preservando nome acessível,
valor e descrição dos extremos no input. O padrão dos demais sliders não muda.

Tema e saldo de créditos ficam à direita na barra contextual da área logada.
No desktop, a lateral alterna entre 240 px e uma faixa de 64 px com ícones,
tooltips à direita e nomes acessíveis. O símbolo do Writer permanece e se
alinha verticalmente ao centro da barra principal nos dois estados. Os atalhos
do perfil usam BookOpen, ScrollText e Dices para Livros, Aventuras e Campanhas.
O menu da conta mantém avatar, nome acessível e os bloqueios existentes.
A troca de largura usa `--transition-fast`, sem animação em movimento reduzido.
A área principal tem recuo de 8 px no topo, à direita e embaixo, borda semântica
e raio pequeno; o modo expandido do editor conserva a área integral.

Em telas estreitas, esses controles passam para uma segunda linha alinhada
à direita. A lateral mantém apenas o perfil no rodapé. Seu menu oferece
Preferências, Inteligência artificial e Sair, com ícones e os bloqueios
existentes durante operações pendentes do editor.

A troca de tema usa uma transição única de 240 ms com curva
cubic-bezier(0.4, 0, 0.2, 1). View Transitions compõe a interface inteira,
evitando que as transições de hover dos componentes atrasem botões ou texto.
Sem essa API, cores usam duração, curva e delay comuns durante a troca.
A primeira aplicação e movimento reduzido não animam a mudança. Novas
seleções interrompem a transição anterior; tempos normais de interação
são restaurados ao terminar.

## Novo projeto e assistente contextual

A entrada revela método, tipo, ponto de partida e conversa/revisão em sequência.
Universo/persona, premissa e capa usam FormSection; não obrigue todas as seções
abertas. Ações do assistente mostram rótulo e texto proposto antes de executar.
O painel acompanha o diálogo ativo sem retirar seu foco contido ou a confirmação
de salvamento. Temas usam os mesmos tokens semânticos e os controles compartilhados.

## Primeiro acesso e assistência contínua

A edição e a criação nativas de lore do livro usam um modal de até 1024 px,
com sidebar vertical por campo e área de edição centralizada à direita, limitada
a 560 px. Abas têm ícones Lucide, seleção visível, indicação acessível de alteração
pendente e navegação por setas, Home e End. Trocar de campo preserva o rascunho
sem preparar ou aplicar automaticamente; os comandos de revisão e confirmação
continuam no rodapé do modal. O assistente mantém sua posição flutuante externa.

O questionário usa Dialog, escolhas Button com aria-pressed e Dropdown select.
Permite múltiplos interesses e explicita que todas as ferramentas continuam
acessíveis. O guia é não modal, com progresso, pausa, links e destaque por token
semântico; não deve capturar foco de escrita ao surgir.
Texto e espaços livres usam cursor de arrasto e permitem reposicionar o cartão
sem ícone de alça adicional. Controles e rolagem conservam suas interações.
O progresso recebe foco para mover pelas setas (Shift amplia o passo), com
instrução acessível e foco visível. Escape cancela o arrasto antes de pausar;
o cartão permanece dentro da área útil da janela.

A barra do assistente nasce minimizada no centro inferior, com alça por toque/
ponteiro/setas e ações nomeadas de expandir, minimizar e restaurar. O painel
respeita visualViewport, área segura e foco dos modais. Sobreposição ao campo/
caret recolhe temporariamente a barra sem mudar sua preferência salva. Conversa
expandida rola separadamente do composer. Não criar uma segunda superfície
flutuante para a concepção de projetos. Perfil e assistente seguem os três temas.

O assistente da página mostra o contexto somente no cabeçalho. O campo usa um
placeholder contextual e nome acessível, sem rótulo visível repetido. Enviar é
um botão de ícone no canto inferior direito do campo, com espaço reservado para
não cobrir o texto e área ampliada em toque. A barra compacta tem até 420 px,
cabeçalho reduzido e sombra discreta. Lista/Grid do compêndio usa controles
compactos com ícones, seleção por aria-pressed e foco visível.

Páginas de catálogo reservam a altura medida da barra para manter ações
acessíveis. Ao abrir um diálogo, o assistente conserva a posição flutuante no
viewport, fora da caixa do modal, sem acrescentar altura ou padding ao formulário.
Permanece no escopo de foco do diálogo para permitir escrita e cliques nas duas
superfícies. A alça continua móvel e Escape no assistente recolhe a conversa sem
fechar o modal. A gaveta de navegação suspende a barra para manter seu ciclo de foco.
Trocas de rota conservam a apresentação escolhida do assistente. A criação manual
e a assistida carregam a concepção no projeto confirmado com a conversa expandida;
o operador pode minimizá-la explicitamente sem perder essa continuidade.
O minimapa móvel rola o contêiner do workspace e limita o fim da navegação para
preservar sua própria visibilidade, sem mover a seleção do manuscrito.
A barra de seleção do compêndio respeita a altura do assistente também no
portal. O editor flutuante de tema mantém seus controles acima da conversa e
abaixo dos diálogos modais.

O leitor público também reserva a altura medida do assistente no fim da página.
O editor usa sua altura útil integral, sem reserva fixa de 240 px no workspace.
A barra de IA da seleção fica dentro da área da prosa: se não houver espaço
acima da seleção, aparece abaixo, preservando os botões de formatação.
Os controles de aceite e descarte do autocomplete ficam acima do dock e abaixo
dos diálogos, mantendo o clique disponível também em telas estreitas.
O painel nativo do chat de capítulo usa a mesma camada de interação para que
o dock não cubra seletores de raciocínio, histórico ou composer.
O divisor do workspace fica na camada 47, acima dos painéis, preservando sua
área de toque ampliada de 44 px e permanecendo abaixo de temas e diálogos.
