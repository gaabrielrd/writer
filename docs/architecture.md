# Arquitetura

Este documento descreve como o código do `Writer Assistant` é organizado e as regras que mantêm o projeto simples e sustentável.

## Princípios

- Organização por funcionalidades (features), não por camadas técnicas.
- Cada parte tem uma responsabilidade clara.
- Simplicidade primeiro: só adicione abstração quando houver necessidade real.
- Regra de negócio fica nas features; a base (`app` e `shared`) permanece neutra.

## Documentos de produto e arquitetura

Ao iniciar um aplicativo a partir do template, use a skill `plan-app` para conduzir a descoberta antes de implementar. Ela cria `docs/prd.md` com o problema, os usuários, o escopo, o não escopo, os requisitos e os critérios de aceite aprovados.

Este arquivo continua sendo a fonte das decisões técnicas. A `plan-app` deve preservar as regras do template e acrescentar uma seção `Decisões do produto` com o limite do sistema, o mapa de features, o fluxo de dados, a persistência, as integrações e os trade-offs definidos para o aplicativo. O PRD explica **o que e por que** construir; a arquitetura explica **como o sistema será organizado**.

## Árvore de pastas

```
src/
├── app/          # composição geral: providers, rotas, layout — sem regra de negócio
│   ├── components/  # telas de erro e não encontrado usadas pelas rotas
│   ├── routes/      # definição das rotas e o router
│   └── tests/       # smoke test da composição
├── features/     # cada capacidade do produto em sua própria pasta
│   └── notes/    # demonstração canônica; removida por --remove-example
├── shared/       # reutilizável e neutro: config, hooks, lib, types
├── test/         # setup.ts e render.tsx (utilidades de teste)
└── main.tsx      # ponto de entrada da aplicação
```

Uma feature típica:

```
features/minha-feature/
├── components/   # componentes de tela desta feature
├── model/        # tipos e lógica de negócio
├── services/     # acesso a APIs e persistência
├── tests/        # testes desta feature
└── index.ts      # interface pública da feature
```

## Responsabilidades

- **app/**: monta a aplicação. Providers, rotas e layout. Não contém regra de negócio.
- **features/**: cada capacidade do produto (ex.: "cadastro de clientes"). Reúne tudo que aquela funcionalidade precisa.
- **shared/**: peças reutilizáveis e neutras (botões, hooks genéricos, utilitários, estilos, tipos). Não conhece nenhuma feature específica.
- **test/**: configuração e utilitários compartilhados de teste.

## Regras de dependência

1. Cada funcionalidade tem sua própria pasta em `features/`.
2. Uma feature não importa arquivos internos de outra feature.
3. Uma feature expõe sua interface pública pelo `index.ts`.
4. Chamadas HTTP ficam em serviços/clientes, não nos componentes.
5. Acesso a `localStorage` fica em adaptadores/repositórios.
6. Componentes de apresentação não conhecem detalhes de persistência.
7. `shared` é neutro: não depende de nenhuma feature.
8. Não crie abstrações sem necessidade concreta.
9. Sem gerenciador global de estado por padrão.
10. Sem biblioteca de requisições se `fetch` já resolve.
11. Nenhuma credencial no código.
12. Estados de tela explícitos: carregando, vazio, sucesso e erro.
13. Toda mudança de comportamento considera os testes.
14. Toda decisão relevante atualiza a documentação ou gera um ADR.
15. Imports externos usam apenas o `index.ts` da feature; `npm run check:architecture` verifica essa fronteira.
16. `fetch` e armazenamento do navegador só aparecem em `services/`,
    `adapters/` ou `repositories/`, dentro de uma feature ou de `shared`.
17. `import.meta.env` só aparece em `shared/config/env.ts`.

## Acesso a APIs

Todo acesso a APIs passa por `services/`, `adapters/` ou `repositories/` dentro
da feature. Uma infraestrutura neutra e realmente compartilhada pode usar as
mesmas pastas dentro de `shared`. Os componentes chamam essa fronteira; nunca
fazem `fetch` diretamente. Isso concentra o tratamento de erros e facilita
substituir a fonte por dados fake nos testes. Veja [integrations.md](integrations.md).

## Armazenamento

Persistência local (ex.: `localStorage`) fica isolada em `services/`,
`adapters/` ou `repositories/`. Dados lidos na fronteira são validados antes de
entrar no modelo. O exemplo de notas grava um envelope versionado com revisão
monotônica, migra automaticamente o array legado, preserva dados inválidos em
uma chave de backup e rejeita gravações feitas sobre uma revisão antiga. Eventos
de `storage` sincronizam abas abertas. Falhas de leitura, conflito e escrita têm
códigos estáveis e são apresentadas pela interface; uma operação nunca confirma
sucesso antes da persistência terminar.

A orquestração da lista demonstrativa fica em um hook interno da feature. O
componente `NoteList` cuida da composição visual e semântica, enquanto o hook
coordena validação, revisões e sincronização sem expor detalhes pela interface
pública da feature.

Novas versões do formato persistido devem ter migração explícita e teste do formato anterior. Nunca apague silenciosamente dados que não puderem ser interpretados.

## Rotas e falhas

As rotas ficam em `app/routes`, que exporta `routes` (a árvore, montável com `createMemoryRouter` nos testes) e `router` (o router de produção). Importe sempre de `react-router`.

A rota raiz registra um `errorElement`, então um erro de renderização no layout ou em qualquer rota filha vira uma tela de falha, nunca tela branca. Uma rota curinga (`path: '*'`) atende endereços desconhecidos dentro do layout — mantenha-a como último filho ao acrescentar rotas.

Um `ErrorBoundary` adicional não envolve o `<Outlet />`, para não sombrear o `errorElement`. Use-o para isolar um widget arriscado dentro de uma página.

## Configuração de ambiente

Toda leitura de `import.meta.env` passa por `shared/config/env.ts`. As variáveis são declaradas em `ImportMetaEnv` (`src/vite-env.d.ts`) e validadas no boot: ausência ou formato inválido falha imediatamente, nomeando a variável. Nada que chegue ao browser é secreto.

## Estilo e identidade visual

A interface usa componentes locais em `src/shared/ui`, Radix UI e Tailwind/CSS
Modules com tokens semânticos em `src/styles/globals.css`. Há um único
`ThemeProvider` e três temas (claro, escuro e sépia), mantendo o estúdio de escrita
caramelo/café aprovado. A rota `/styleguide` é a referência viva. Ícones vêm de
`lucide-react`; veja [styleguide.md](styleguide.md).

Seleções e menus de ações compartilham `Dropdown` e os mesmos tokens, itens e
portal. Os modos discriminados preservam callbacks de valor e ações sem valor;
busca é opcional. Veja [ADR 0020](decisions/0020-shared-dropdown.md) e
[API do dropdown](dropdown.md).

## Estado

`WorkspaceLayoutProvider`, público em shared/ui, guarda apenas o estado neutro
de expansão do layout. O shell observa esse estado sem remontar o Outlet.
O editor controla entrada/Escape, conserva o trecho visível após o reflow e
restaura o layout ao deixar a rota. O workspace redimensionável mantém uma
árvore estável para manuscrito e painéis; a largura passa pelo adaptador local
versionado e isolado por usuário, com fallback seguro de armazenamento.

A passagem é ancorada pelo caret visível ou pelo primeiro bloco visível. Quando
o cursor está fora da viewport e o bloco excede sua altura, uma Range virtual
obtida pela posição textual da viewport conserva a leitura sem mover a seleção.
O acompanhamento de reflow dura até 500 ms e termina na primeira interação.

As configurações de IA são compostas por `AISettingsProvider` no layout e abertas
por callback no menu de usuário. `useAIConfig` observa alterações no adaptador
BYOK para invalidar sugestões anteriores. A análise/revisão do compêndio fica no
editor, a API pública/tipos em lore e a geração BYOK no serviço de IA. Registro,
autorização, aplicação e débito atômico ficam em `functions/src/loreAnalysis.mjs`.
Veja [atualização do compêndio](lore-analysis.md).

O estado é local aos componentes ou às features. Não usamos gerenciador global de estado por padrão. Se, no futuro, a complexidade justificar, a decisão deve ser registrada em um ADR.

No editor, `useSelectionAnchor` observa seleção, foco, rolagem e redimensionamento
e fornece coordenadas ao `AIChatLauncher`, pela interface pública de
`ai-assistant`. Barra flutuante e botão fixo abrem a mesma conversa lateral,
no espaço compartilhado com o compêndio. `useChatEditorBridge` captura
seleção/cursor/viewport e prepara uma transação de texto segura. A feature
`ai-assistant` mantém UI, comandos, histórico e serviços; `functions/src/chapterChat.mjs`
controla autoria, limites, geração da plataforma e aceite transacional.
Autosave e aceite compartilham a fila por capítulo. Texto, saldo e recibo são
persistidos juntos; uma resposta incerta é recuperada pelo mesmo recibo.
Selecionar/focar/rolar não gera respostas. Conversa é gratuita e privada por
capítulo; cobrança ocorre no primeiro aceite da sugestão da plataforma.
Veja [chat do capítulo](chapter-chat.md) e [ADR 0022](decisions/0022-chapter-chat-and-atomic-acceptance.md).

O minimapa é interno à feature `editor`: o modelo deriva blocos e ocorrências do
documento ProseMirror, reutilizando o motor público de lore; um hook mede a
geometria e acompanha rolagem/redimensionamento. A navegação altera somente a
rolagem, sem transação de seleção ou conteúdo. O desenho agrupa marcas densas,
preservando todos os destinos pelo teclado. Veja [minimapa](chapter-minimap.md).

## Testes

Os testes ficam colocalizados dentro da feature, na pasta `tests/`. Testam o
comportamento observável da funcionalidade. Os scripts de arquitetura usam a AST
do TypeScript para cobrir imports estáticos, reexports, imports dinâmicos e o uso
de `fetch`, `localStorage` e `import.meta.env` fora das fronteiras permitidas.
Detalhes em [testing.md](testing.md).

## Evolução incremental

O template começa simples de propósito. Adicione estrutura, bibliotecas ou camadas apenas quando um problema real aparecer, e registre a mudança em um ADR (`docs/decisions/`).

## Decisões do produto

Esta seção detalha as decisões técnicas aprovadas em [docs/prd.md](prd.md) para o **Writer Assistant**.

### Limite do sistema e plataformas

- **Tipo:** Aplicação Web SPA executada diretamente no navegador, servida estaticamente via Firebase Hosting.
- **Dispositivos:** Navegadores modernos (Chromium, Firefox, Safari) com layout otimizado para escrita em desktop/laptop e leitura responsiva para qualquer tamanho de tela.
- **Backend:** Firebase (Firebase Auth para autenticação e Cloud Firestore para persistência em nuvem e sincronização offline).
- **Geração na criação:** Cloud Functions em `functions/` para IA autenticada, limites e débito idempotente; Storage para capas. Veja [ADR 0016](decisions/0016-book-creation-and-generation.md).

### Mapa de capacidades para features

1. `src/features/auth`
   - **Responsabilidade:** Login, logout, observação da sessão com Firebase Auth e sincronização do documento de perfil e cota de créditos do usuário no Firestore.
   - **Público:** `useAuth`, `AuthButton`, `UserBadge`, `CreditsCounter`.
2. `src/features/books`
   - **Responsabilidade:** CRUD de livros e capítulos, ordenação, contagem de palavras e renderizador da página pública de leitura (`/read/:bookId`).
   - **Público:** `BookList`, `BookSettingsDialog`, `ReaderView`, serviços de busca e gravação de livros.
3. `src/features/lore`
   - **Responsabilidade:** Compêndio de worldbuilding (Personagens, Locais, Conceitos, Outros), modelagem de atributos, relações, filtragem por visibilidade e detecção de correspondência de termos no texto.
   - **Público:** `LoreList`, `LoreEntityCard`, `LoreDrawer`, `LoreTooltip`, motor de correspondência textual de entidades.
4. `src/features/editor`
   - **Responsabilidade:** Editor de texto rico (WYSIWYG), integração com menção rápida via `@`, visualização contextual com tooltips e integração com exportadores (Markdown, DOCX, PDF).
   - **Público:** `RichEditor`, `MentionMenu`, `ExportActions`.
5. `src/features/ai-assistant`
   - **Responsabilidade:** Comunicação com provedores de IA (Gemini / OpenAI), controle de debounce para autocomplete após uma pausa de 600 ms na digitação, menu de ações contextuais de escrita e orquestração de consumo de créditos. Geração automática exige uma alteração de texto originada pela digitação; abrir/focar o editor, selecionar texto, mover o cursor, formatar ou carregar conteúdo não inicia uma geração. Seleção e mudanças de contexto cancelam sugestões pendentes; inserções de IA não rearmam o autocomplete. Setas, Home/End e PageUp/PageDown cancelam a intenção automática já no teclado, inclusive na borda do texto, preservando composição, menções e navegação nativa. Escape também registra o cancelamento da intenção. A revisão de digitação nula invalida a espera/oferta anterior mesmo antes dos efeitos passivos; nova digitação usa outra revisão monotônica. Pedidos manuais continuam independentes dessa intenção automática.
   - **Público:** `useAIAutocomplete`, `AIContextMenu`, `BYOKSettings`.

### Fluxo de dados e persistência

- **Autenticação:** O cliente autentica via Firebase Auth SDK; o UID do usuário é utilizado como chave de partição nos dados no Firestore (`users/{uid}` e consultas com filtro `authorId == uid`).
- **Livros e Lore:** Cada livro é um documento na coleção `books/{bookId}` com subcoleções `chapters` e `lore`. Leituras e gravações passam estritamente por serviços dedicados em cada feature (`services/`).
- **Cache Offline:** `initializeFirestore` usa cache persistente multiaba do SDK
  (fallback em memória quando IndexedDB não está disponível). O editor preserva
  rascunhos locais por usuário/livro/capítulo, serializa gravações e oferece escolha
  explícita ao encontrar uma cópia local diferente; nunca escolhe pelo relógio.
- **Publicação:** originais em `books` e suas subcoleções são privados. Somente
  projeções permitidas em `publicBooks`, com revisões imutáveis, são lidas sem
  login. Publicar exige ação explícita e nome público escolhido; editar o rascunho
  não publica automaticamente. Revogar lore público retira a publicação inteira
  atomicamente. Veja [publication-security.md](publication-security.md).
- **Chave BYOK:** Armazenada estritamente em `localStorage` do navegador do cliente através de repositório isolado em `src/features/ai-assistant/services/byokStorage.ts`.

### Importação de manuscritos

A feature `books` analisa DOCX, PDF, Markdown, texto simples e HTML no cliente,
através de `documentParserService`. A extração PDF usa o worker local do PDF.js
e `pdfDocumentService` para páginas/fontes/regiões; `pdfLayoutExtraction`
reconstrói duas colunas, seções, caixas e tabelas como blocos de prosa com
origem por página. Títulos são recompostos por proximidade/coluna/tipografia; os
níveis internos usam os tamanhos predominantes de cada seção, mantendo a
correspondência do sumário depois da recomposição. `pdfTextExtraction` conserva a representação legada de texto.
Os tipos e ajustes de divisão/união ficam em `books/model/documentImport`;
metadados de revisão não são gravados como conteúdo do livro. Os formatos
estruturados reutilizam o sanitizador de prosa compartilhado. A revisão ocorre
antes de chamar os serviços de criação de livro/capítulos. Consulte
[importação de manuscritos](document-import.md) para formatos e limites.

### Exportações de manuscritos

- **Markdown:** Compilação direta do texto e metadados no cliente para arquivo `.md`.
- **DOCX:** OOXML real empacotado client-side com JSZip, com estilos, listas e quebras de capítulo.
- **PDF:** Documento isolado com folha de impressão limpa (`@media print`), aberto
  no diálogo nativo para imprimir ou salvar como PDF.
- **Backup JSON:** exportação privada do livro completo, incluindo capítulos,
  fichas, notas e relações; não inclui chaves BYOK ou perfil de autenticação.
- **Conteúdo:** Markdown legado e HTML importado passam pelo mesmo sanitizador;
  o editor transacional persiste HTML somente após edição. Veja
  [ADR 0015](decisions/0015-transactional-rich-editor.md).

### Restrições e trade-offs

- **Backend limitado:** O editor mantém a integração no cliente. Sinopse/capa na criação usam servidor com segredo, Auth, App Check e registros privados. A implantação é explícita; veja [criação de livros](book-creation.md).
- **Consumo de créditos no aceite:** A IA não cobra do saldo do usuário por sugestões descartadas ou falhas de conexão; o débito ocorre somente no evento de confirmação de uso (`Tab` ou clique no botão de aceite).
  No wizard, sinopse custa 1 crédito e capa 5, controlados pelo servidor. Descartes podem consumir recursos do provedor, tratados com limites de geração.

### Biblioteca de imagens

A criação assistida tem uma página na feature `books`; contratos e cliente
da callable ficam em `ai-assistant`, com dependências públicas de `lore`.
`functions/src/assistedBook.mjs` mantém sessões privadas de sete dias e propostas
de uma hora. A confirmação transacional grava livro, fichas privadas, referências
da capa, recibo e débito de 2 créditos mais a capa. Geração de conteúdo novo
usa contrato separado da análise com evidências de capítulos. Veja
[criação assistida](assisted-book-creation.md).

`src/features/image-library` expõe página privada e seletor reutilizável. O aceite
insere a capa na biblioteca na transação do débito. Criação e troca de capa
passam por callables que mantêm `coverImageId`, URL e referências por livro.
A exclusão explícita exige zero usos; exclusão de livro libera referências via
trigger sem remover o arquivo. Metadados são privados e mutações de referências
no browser são proibidas. Migração em lotes preserva capas aceitas antigas
existentes sem cobrança. Veja [biblioteca](image-library.md) e [ADR 0017](decisions/0017-image-library-and-cover-references.md).

## Universos e lore compartilhado

`src/features/universes` cuida do cadastro, seleção e páginas privadas dos
universos do autor. `lore` mantém fichas e formulários por escopo; `books` guarda
o vínculo opcional; `editor` combina entidades para reconhecimento, menções e IA.
Vínculos e mutações globais passam por functions; regras protegem os originais
e validam a versão pública de privacidade. Veja [universos](shared-lore.md) e
[ADR 0018](decisions/0018-shared-universes-and-lore.md).

## Atos

A feature books inclui atos, vínculos de capítulos e ordem de leitura por grupos.
Criação e ações em lote usam transações; publicação e exportações preservam a
mesma sequência. Veja [atos](book-acts.md) e [ADR 0021](decisions/0021-book-acts.md).

## Personas de escrita

`ai-assistant` mantém catálogo, biblioteca privada, validação, resolução de
instruções e formulários. A interface pública fornece tipos, resolver, biblioteca
e seletor de vínculos. `AISettingsProvider` navega para `/settings/ai`;
`AISettingsPage` mantém abas na URL, e a biblioteca abre detalhes/edição por linha.
`books` persiste os vínculos e observa metadados; `editor`
compõe a base/complementar e envia o contexto ao autocomplete e às ações.
`shared/ui/Slider` permanece neutro em relação ao domínio. Personas usam revisões
transacionais; alterações invalidam respostas antigas. Os originais e prompts
permanecem privados e são preservados somente no backup JSON v3. Veja
[personas de escrita](ai-personas.md).

## Capacidades de raciocínio do chat

O modelo de `ai-assistant` reexporta o contrato puro
`functions/src/chatGeneration.mjs` e seus tipos `.d.mts`. Esse módulo não
importa infraestrutura, credenciais, rede ou armazenamento. Compartilhar a matriz
evita diferenças entre o controle no navegador e a validação no servidor.
A callable informa o modelo da plataforma e persiste preferências em conversas
privadas; o padrão local versionado fica atrás de um serviço da feature.
Veja [ADR 0023](decisions/0023-chat-reasoning-capabilities.md).

A configuração pública é capturada no serviço antes da espera de criação/envio
e acompanha o pedido recuperável. A callable normaliza a solicitação, controla
o modelo da plataforma e registra a configuração efetiva; reutiliza snapshots
de parâmetros/histórico em retries. `chapterChatProvider.mjs` contém o transporte
Gemini do servidor, e `chapterChatService.ts` mantém BYOK no navegador. Credenciais
entram somente nos headers do provedor, fora do histórico e da callable.

## Contratos da evolução Writer V2

A implementação iniciou pelo Estúdio F2-01 e segue com cenas F2-02, descritos
abaixo. As demais capacidades do V2 conservam seus contratos futuros e aceites próprios.

O [ADR 0025](decisions/0025-writer-v2-contracts.md) fixa separação entre livro
legado, aventura autoral, campanha particular, edição e acesso. Preservar IDs/URLs
e contratos públicos existentes. `app` compõe os espaços, `shared` continua neutro;
novas fronteiras de feature dependem da necessidade demonstrada no incremento.

Novas mutações usam autoria derivada, revisão esperada, operação/recibo idempotentes
e datas do servidor. Lore vivo de originais, base congelada/variante inteira de
campanha e proposta explícita de cânone conservam procedência e revogação. Notas
próprias ficam isoladas do material derivado. Projeções por audiência têm campos
fechados; arquivos secretos/pagos exigem autenticação e direito vigente. Corpo de
edição imutável não torna seu acesso irrevogável; `publicBooks` continua gratuito.

O [desenho de módulos](tasks/writer-v2/arquitetura-proposta.md) é proposto, não
implementado. Contratos detalhados/condições por incremento estão na
[consolidação](tasks/writer-v2/execucao/06-contratos-e-replanejamento.md).
Comércio fica separado de créditos IA e exige capacidades Stripe reais, eventos
verificados e conciliação no servidor. Nenhuma configuração Connect, migração,
regra nova ou operação financeira é aplicada por esta documentação.

## Estúdio e projetos privados

`app` compõe os cinco espaços e a proteção das rotas autenticadas. `/` conserva
a landing anônima e redireciona a conta autenticada para `/studio`. A navegação
global independe de livros; o título do livro permanece no contexto privado.
Publicações, Catálogo e Biblioteca informam disponibilidade futura; `/library`
continua sendo a biblioteca de imagens.

`features/studio` compõe APIs públicas de `books`, `adventures`, `campaigns` e
`universes`. Livro conserva identidade, capítulos, editor e fluxos existentes;
aventura autoral e campanha independente têm coleções e páginas próprias. O Estúdio
cria metadados privados; cenas/partes são acrescentadas pelo incremento F2-02,
sem criar sessões implicitamente. Cada tipo possui consulta, estado, filtro e cursor
independentes. Troca de conta remonta a sessão e descarta respostas anteriores.

`functions/src/studio.mjs` fornece `createAdventure`, `createCampaign`,
`getAdventure`, `getCampaign`, `prepareStudioBooks` e `listStudioProjects`.
Auth determina o dono. Projeto, recibo da operação e vínculo/contador de universo
são transacionais; retry idêntico não duplica criação. Recursos novos, preparação
e recibos não aceitam escrita direta do cliente. Listas paginam por dono, estado,
`updatedAt DESC` e ID descendente, com padrão 25/máximo 50 e leitura de limite + 1.

Livros e aventuras têm filtro editorial independente de publicação/arquivo.
`editorialState` válido prevalece; no legado, aventura `status=ready` corresponde
a Pronto e os demais casos a Rascunho. O servidor filtra janelas de metadados,
sem corpos, e mantém o cursor na última fonte examinada. O cursor vincula conta,
tipo, status e filtro editorial; cursores anteriores sem o campo editorial só
valem para a leitura sem esse filtro. Uma janela sem correspondências pode ter
continuação: o hook segue a leitura com carregamento e cancelamento por conta ou
filtro, até encontrar itens ou esgotar a consulta. Isso pode exigir várias chamadas
limitadas, sem declarar vazio antecipadamente ou criar quota de projetos.

A preparação legada mantém progresso no servidor e altera apenas datas inválidas
ou ausentes a partir de `snapshot.createTime/updateTime`, e estado ausente. Preserva
conteúdo e datas válidas. As regras conservam datas válidas já existentes; mutações
Admin respeitam a mesma condição. Valores devem caber no intervalo de `Date`.
As referências de universo distinguem livros, aventuras e campanhas; exclusão
confere os três contadores e referências antes de bloquear novos vínculos.
Ver [contrato executável](tasks/writer-v2/execucao/07-estudio-projetos.md).

## Cenas e composição de manuscrito

`features/scenes` fornece modelos, serviços callables, planejamento em lista/quadro
e editor rico privado para livros e aventuras. `books` resolve capítulos compostos
por sua interface pública; listas de capítulos podem pedir somente metadados.
A rota histórica do editor do capítulo composto mostra prosa e planejamento,
enquanto cada cena tem rota própria. Capítulos legados mantêm seu editor.

`functions/src/scenes.mjs` e `sceneJobs.mjs` centralizam mutações, autorização,
revisões, recibos em `users/{uid}/sceneOperations` e trabalhos retomáveis. Corpos,
planos e referências são filhos de cada cena. `sceneSources` conserva a fonte da
conversão mesmo se o capítulo for removido; `sceneControls/unassigned` organiza
conteúdo sem agrupador. O marcador `hasSceneResources` impede finish legado de
deixar filhos órfãos. Controles e fontes não aceitam writes do navegador.

`chapterCompositionService.ts` lê páginas de prosa ativa, confere hash/revisão,
sanitiza blocos e revalida ao terminar. Não usa a fonte congelada como fallback.
Publicação prepara somente campos públicos e captura `sourceSceneRevision`;
backup v5 inclui os recursos privados sem confundir plano com prosa exportável.
Ordenação e exclusão usam checkpoints limitados; remover agrupador desvincula
cenas. Ver [ADR 0026](decisions/0026-scenes-and-manuscript-assembly.md) e
[contrato F2-02](tasks/writer-v2/execucao/08-planejamento-de-cenas.md), cujos gates
registram a validação vigente deste incremento.

## Arcos e cronologia básica

`features/narrative-planning` fornece `NarrativePlanner`, modelos e serviços pela
interface pública, dentro das abas de livros/aventuras. Arcos, marcos e eventos
possuem texto de planejamento privado e sequências independentes. Ordem manual e
data textual livre não alteram a ordem nem a prosa do manuscrito.

As mutações e consultas vivem em `functions/src/narrativePlanning.mjs`, com contratos
e jobs limitados em módulos próprios. `narrativeLinks` mantém referências por
identidade; `sceneLoreLinks` é um índice derivado das referências explícitas das
cenas, atualizado atomicamente e preparado por lotes para dados anteriores.
Listas são resumos paginados e detalhes são carregados sob demanda. A autorização
confere o pai e a origem atual, inclusive durante troca de universo e exclusão.

Marcadores `hasNarrativeResources/narrativeRevision` são protegidos; `deleteSceneBook`
incorpora filhos narrativos antes de remover o pai. `narrativeBackupService.ts` captura
arcos/marcos/eventos/referências no JSON v6, sem UID/jobs/índice, e confere revisões
e identidade antes/depois. Publicação/PDF/DOCX/Markdown conservam a projeção da prosa.
Ver [ADR 0027](decisions/0027-narrative-arcs-and-timeline.md) e
[contrato F2-03](tasks/writer-v2/execucao/09-arcos-e-cronologia.md). Gates locais,
CI e regras verdes em `3358c75`; implantação conserva autorização própria.

## Progresso privado, contagem e retomada

`features/work-progress` oferece `ProjectProgressPanel`, `ContinueWorkPanel` e
`useWorkActivity` pela interface pública. Livros e aventuras têm estado editorial
privado e meta total; aventuras e campanhas têm checklist privado. `editorialState`
não altera `Book.status` nem publica conteúdo. O fuso IANA pertence ao usuário,
inicializa pelo dispositivo com revisão comparada e não reinicia metas totais.

`functions/src/workProgress.mjs` autoriza cada leitura/mutação e coordena contratos,
ledger e escritores legados em módulos próprios. `workProgress/current` guarda
estado, meta, revisões e checkpoint; `workWordSources` guarda contribuições por
identidade, sem corpo/título; `workWordGroups` guarda os agregados incluídos.
`hasProgressResources` ativa os escritores protegidos. Corpo, contagem e criação/
remoção de capítulos passam pelo servidor após ativação; metadados permitidos
mantêm a fronteira existente. Exclusão de livro limpa os filhos pelo job existente.

O ledger acompanha criação, importação, edição, IA, conversão, movimento, arquivo/
restauração e exclusão no mesmo commit do conteúdo. Fonte legada preservada e cena
fora da composição não entram no total. Preparação usa checkpoint e páginas de
metadados limitadas, lendo um corpo por transação; escritores concorrentes não
reiniciam nem duplicam a soma. Total incompleto é `null`, nunca zero confirmado.
`visibleWordCount.mjs` usa `parse5` somente no servidor e conserva a interpretação
do texto visível do editor, sem alterar o manuscrito armazenado.

Salvamentos legados comparam o hash da base carregada. Se uma resposta se perde,
o cliente confirma o mesmo pedido/recibo antes de enviar a edição seguinte; usa
somente a própria escrita confirmada como nova base. Replay no servidor compara
o texto atual com o resultado daquele recibo, impedindo sobrescrita de uma edição
posterior de outro dispositivo. A fila por capítulo conserva a ordem de flush.

`users/{uid}/workActivityState/current` compara a revisão global das visitas;
`workActivity` guarda somente tipo/IDs/data, sem texto, título histórico ou URL.
Visitas não alteram a revisão da prosa nem a data do projeto. A lista resolve nomes
atuais autorizados e Continuar reautoriza a origem; origem removida retorna ao
projeto com aviso, projeto indisponível retorna `null`. Uma fila por usuário ordena
visitas locais, mantendo o conflito entre dispositivos explícito.

Ver [ADR 0028](decisions/0028-private-work-progress-and-resume.md) e
[contrato F2-04](tasks/writer-v2/execucao/10-estados-metas-e-retomada.md), que registra
os gates reais do incremento. Comércio, sessões e restauração integral permanecem
nas respectivas tarefas.
