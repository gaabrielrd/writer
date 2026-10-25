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

### Chat de cenas e blocos

Cenas de livros, principal de aventura e blocos adicionais usam `EditorChatWorkspace`
pela interface pública de `ai-assistant`. O host reserva apenas captura/aceite,
fornece snapshot confirmado e adota conteúdo/metadados sem reinicializar o editor;
a geração permite continuar escrevendo. `RichEditor` separa chat, autocomplete e
ações legadas por capacidades. O matcher opt-in compartilha o contrato Unicode
puro e identifica fichas por origem, evitando colisões local/global.

`functions/src/editorChat.mjs` compõe contexto paginado, conversas, geração e
aplicação. O callable `editorChat` exige Auth e App Check. O servidor lê persona e
lore autorizados, fecha manifesto/proveniência e reautoriza origem nativa antes de
cada entrega derivada. Perguntas próprias ficam separadas das respostas. Revogação
oculta respostas afetadas sem apagar perguntas ou manuscrito; somente a mesma
origem reautorizada recupera o histórico. A criação de contexto não salva a pergunta.

Persona do livro e complemento de capítulo são preservados. Aventuras têm base
por aventura e complemento por cena; blocos herdam. O compilador puro
`personaProfile.mjs` é compartilhado, sem I/O. Setters têm CAS, recibo e fence e não
alteram prosa, crédito ou audiência. Não há setter por bloco.

O journal cliente guarda apenas controles sob Web Locks e CAS integral; rascunho
de pergunta fica em RAM com confirmação de saída. Reload consulta/cancela a mesma
intenção sem repetir provedor. BYOK usa a configuração congelada e chave somente
no transporte do provedor; resposta só aparece após conclusão e leitura autorizadas.
Primeiro aceite de plataforma cobra um crédito; reapply explícito do mesmo turno
pago e BYOK não cobram. Texto, contagem, ledger, saldo e recibo são atômicos; undo
continua sendo edição normal, sem estorno. Veja o
[contrato do chat](tasks/writer-v2/execucao/30-contratos-do-chat-de-cenas.md).

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

## Histórico privado do texto

`features/manuscript-history` fornece diálogo, modelos, serviços e recuperação
privada para capítulos legados e cenas de livro/aventura. Versões são manuais ou
cópia anterior à restauração, mantidas até exclusão explícita. O manifesto privado
fica em `workVersions`; corpos em blocos UTF-8 de até 64 KiB ficam em
`workVersionBodies`, no projeto. A lista pagina metadados 25/50 e o corpo selecionado
é reconstruído/verificado por ordem, bytes e SHA-256 antes de aparecer na UI.

`functions/src/workHistory.mjs` autoriza APIs e recibos próprios. Tokens da fonte
incluem timestamps precisos do Firestore e hash; cenas também conservam sua revisão
real. Captura inicial explícita de capítulo reutiliza a ativação de progresso em
um lote, mantendo a base originalmente observada. Restauração reutiliza os planos
transacionais dos escritores legados/cenas para preservar texto anterior, prosa,
contagens e recibo juntos. Replay não reaplica texto sobre outra gravação.

Os editores reservam a escrita antes do primeiro await. Pedido incerto é guardado
por UID/recurso sem prosa e conserva o bloqueio mesmo ao fechar o diálogo. Aceite
confirmado atualiza corpo, revisão e bases internas juntos; desfazer é uma nova
edição normal. Versão de origem removida continua consultável/copiável/excluível
no projeto, mas não recria o recurso. Backup privado v6 informa que não inclui
histórico; a exclusão existente de livro limpa versões/corpos em lotes. Exclusão
de projeto de aventura ainda não existe e deverá incorporar essa limpeza.

O marco interno P1 de portabilidade adiciona historyRevision na raiz: captura
manual, cópia anterior à restauração e retirada de versão incrementam o catálogo
atomicamente com o recibo. Cleanup e replay não incrementam de novo. Rules
reservam o campo ao servidor. getWorkHistoryBackupSource produz token ligado ao
UID/projeto e createTime/updateTime nativos; lista e corpo podem exigir o mesmo
token na transação autorizada. captureWorkHistoryBackup percorre todas as versões,
inclusive recursos removidos, verifica corpos/resumos e revalida o token no fim.
Não devolve resultado parcial nem põe o token no DTO do arquivo. Isso ainda não
integra histórico ao JSON v6 nem implementa pacote/restauração; o token de M1 não
substitui os clocks dos demais recursos. Veja o
[contrato M1](tasks/writer-v2/execucao/32-captura-consistente-do-historico.md).

A feature folha book-portability expõe framing/integridade puro compartilhado
com functions/src/bookBackupContainer.mjs e um adaptador Blob em services.
O contêiner v1 é sem compressão, com quadros limitados e cadeia SHA-256 até selo/EOF.
O leitor retorna registros provisórios; consumir um registro não autoriza gravar
ou ativar projeto. Schema semântico, captura restante/mídia e restauração P1 ainda
não estão integrados. Não acumular os frames no consumidor como prova de memória
limitada. JSON v1–v6 permanece intacto. Veja a [ADR 0045](decisions/0045-book-backup-framing.md)
e o [contrato M2](tasks/writer-v2/execucao/33-conteiner-limitado-de-backup.md).

Rules exigem avanço atômico de updatedAt da raiz na criação SDK de ato/capítulo
e remoção de capítulo ativo. O token usa timestamps nativos; o avanço lógico
garante alteração dessa raiz mesmo com contagens iguais. Limpeza já deleting
mantém o fluxo anterior, com captura bloqueada. Metadata direta de capítulo ainda
exige readset próprio; essa regra de pertencimento não prova snapshot integral
nem controla Admin. Veja a [ADR 0046](decisions/0046-book-backup-membership-clock.md).

Ver [contrato F2-05](tasks/writer-v2/execucao/11-historico-e-restauracao.md).

## Blocos narrativos de aventura e prévia privada

`features/adventure-blocks` expõe navegação, editor de texto próprio, recuperação,
ilustração e prévia por cena. A prosa existente permanece em scenes/body/current
como Texto principal; abrir não migra nem duplica seu conteúdo. Campos mainBlock
aditivos e fallbacks de leitura preservam a compatibilidade. Adicionais usam
sceneBlocks com corpo separado, cena estável, revisão, audiência e ordem próprias.
Novo/legado sem classificação é privado do criador. Livros não recebem esses campos.

`functions/src/adventureBlocks*.mjs` autoriza cada recurso e mantém texto, revisões,
total da cena, parte, ledger e recibo atomicamente. O ledger conserva uma fonte
de cena com principal e adicionais ativos. Verificação explícita percorre apenas
metadados em páginas, confirma o checkpoint observado e não inventa total zero.
O loader oferece consulta de situação sem corpo quando o agregado inválido impede
abrir a cena. Arquivo conserva texto/histórico; histórico de block restaura somente
texto e cópia anterior, sem restaurar audiência ou imagem.

Vínculo de uma ilustração por bloco usa a biblioteca pela interface pública. O uso
tipado inclui aventura/recurso e não colide com IDs de capa. O servidor atualiza
vínculo/contador junto da mutação, incluindo duplicação e limpeza retomável; arquivo
mantém uso. Editores compartilham reserva de escrita, controlador e pedido incerto,
sem adotar revisão cujo hash diverge da prosa confirmada.

`adventurePreview*.mjs` filtra audiência antes de ler corpos e reconstrói HTML com
parse5. Original completo reúne ativos; Mestre recebe gm/players e Jogadores apenas
players. O DTO exclui planejamento, fichas, títulos de agrupadores e metadados de
itens secretos. Páginas têm token da revisão precisa e orçamento de 4 MiB UTF-8;
excedente segue na próxima página sem truncamento. Imagens são derivados WebP por
sharp de até 1.024 × 1.024 e 1,5 MiB, com autorização antes/depois do I/O, sem caminho,
imageId ou URL permanente no DTO. O cliente descarta páginas/mídias de outra conta,
alvo, modo ou token e limpa a composição em perda de acesso.

Todas as prévias continuam restritas ao dono; classificar não publica nem concede
acesso. Exclusão integral/backup de aventura têm trabalho próprio; preservar essa
pendência. Ver [ADR 0030](decisions/0030-adventure-blocks-and-private-previews.md) e
[contrato F2-06](tasks/writer-v2/execucao/12-aventuras-e-blocos.md).

## Gestão privada de campanhas

`features/campaigns` expõe `CampaignManagementDialog`. Seu controlador reserva uma
operação por UID/campanha, preserva o pedido antes da rede e mantém a edição
bloqueada quando a resposta é incerta. Fechar/reabrir ou recarregar não cria outro
pedido. Conflito conserva os campos e só carrega a versão atual por descarte
explícito. A página aceita o DTO confirmado do próprio pedido sem GET intermediário.

`functions/src/campaigns.mjs` altera título, descrição, estado e universo
organizacional com dono, revisão comparada e recibo na mesma transação. O vínculo
usa o helper de universos em modo estrito, com uso tipado e contador consistente;
universo legado sem contador exige prova limitada de ausência de usos antes do
primeiro vínculo. Um universo removido pode ser desvinculado sem ser recriado.
Replay reautoriza e exige revisão e hash da confirmação ainda atuais. Checklist,
procedência, criação e lore global permanecem preservados.

Essa gestão aceita campanhas independentes e campanhas originais com base canônica
coerente. Alterar seus metadados não muda a base, a procedência ou o checklist.
Procedências ainda não suportadas falham antes da escrita.
Ver o [contrato F2-07](tasks/writer-v2/execucao/14-campanhas-e-variantes.md).

## Captura privada de aventura e base congelada

`features/campaign-bases` expõe criação/retomada e leitor pela interface pública.
A aventura inicia a captura; o Estúdio também descobre preparações pendentes,
inclusive quando a origem foi removida. O leitor da campanha apresenta material,
narrativa, lore e arquivo sem consultar prosa viva para completar a base.

`functions/src/campaignCapture.mjs` prepara uma geração privada em etapas
limitadas. `campaignCaptureItems.mjs` captura partes, cenas, blocos, texto legado,
planejamento, narrativa e a união deduplicada de lore explicitamente referenciado.
Não expande nomes ou relações. Cada passo compara a versão precisa da origem;
mudança aborta duravelmente. Somente a ativação cria a campanha, seu vínculo e a
base pronta atomicamente. Preparações incompletas não aparecem como campanhas.

Os controles ficam em `users/{uid}/campaignPreparations`; a geração permanente
em `users/{uid}/campaignBases`, com filhos `items`, `bodies`, `loreReferences`,
`images` e `links`. Checkpoint monotônico e recibos preservam identidade em retries.
O cliente guarda método/payload/checkpoint antes da rede, isolados por UID, e
descobre também pedidos locais de ativação/limpeza sem confirmação após reload.
Esses controles não guardam corpos. Troca de conta/alvo descarta respostas tardias.

`campaignBaseRead.mjs` reautoriza campanha, origem e fichas antes de projetar
resumos, corpos, relações ou mídia. Edição normal do original não altera a base.
Lore indisponível e relações para alvos não capturados/autorizados não são expostos.
O vínculo organizacional atual é independente do universo original capturado.
SDK direto permanece negado. Token comum protege a composição; cursores vinculam
escopo/projeção. Corpos usam chunks UTF-8 e SHA-256, conferidos integralmente no
servidor e no cliente antes da exibição, com limites de bytes e sem truncamento.

Ilustrações usam pin tipado próprio e geração Storage capturada. Escritores da
aplicação preservam seus bytes; sobrescrita externa causa indisponibilidade, sem
presumir versionamento do bucket. Mídia derivada é autenticada antes/depois do I/O,
sem URL permanente ou caminho. Cancelamento revoga e limpa filhos/pins em lotes
retomáveis mesmo sem a origem. Bases prontas não têm expiração automática.

Variantes, atualização explícita e exclusão integral de campanha conservam etapas
próprias. Veja [ADR 0031](decisions/0031-campaign-frozen-bases.md) e
[contrato de captura](tasks/writer-v2/execucao/15-captura-de-aventura.md).

## Notas autorais próprias da campanha

`features/campaign-notes` concentra notas de título/texto simples e recuperação de
pedidos próprios. A página da campanha compõe seu painel pela interface pública,
separado do leitor derivado. As quatro APIs de `functions/src/campaignNotes.mjs`
autorizam a campanha própria, sem depender da aventura, base ou universo originais.

Notas em `campaigns/{id}/notes` têm revisão e schema; `noteState/current` controla
a revisão da lista. Cada mutação compara revisão e grava nota/controle/recibo
atomicamente. Recibos privados não copiam prosa. Excluir remove título/corpo e
conserva tombstone mínimo, sem permitir reutilizar o ID. Lista pagina somente
resumos e invalida cursor após alteração, sem carregar corpos.

O token da campanha usa createTime Firestore preciso, UID e ID; metadados/checklist
não o alteram. Gates conferem também o token interno dos filhos e recibos antes
de projetar conteúdo, impedindo adotar notas órfãs de um root apagado/recriado.
O hash do recibo cobre somente a nota confirmada; replay de outra nota não fica
obsoleto apenas porque a revisão da lista avançou.

O journal pode preservar payload autoral próprio, isolado por UID/campanha.
Reserva/escrita/limpeza passam por Web Locks no adaptador e observam storage entre
abas; lock não fica retido durante HTTP. Essa permissão não se estende a variantes
derivadas. Campos não são preenchidos automaticamente com base/lore. SDK direto
continua negado. Veja [ADR 0032](decisions/0032-campaign-own-notes.md) e
[contrato C1](tasks/writer-v2/execucao/16-notas-proprias-da-campanha.md).

## Variantes particulares de lore da campanha

C2, concluído tecnicamente em fe10b15, concentra leitura/escrita em campaignLore e recuperação
em campaignVariantRecovery de Functions; a feature campaign-lore oferece painel
público próprio. O leitor da Base congelada conserva seu contrato imutável.
Overlay por sourceKey usa base/override/removed, revisão contínua e corpo em chunks
com bodyRevision independente. Escrita de corpo/estado/controle/recibo é atômica.
campaignIdentityToken reutiliza o mesmo createTime preciso de C1 sem ler suas notas.

Listas percorrem lore capturado paginado e aplicam overlay/gates no servidor.
Relações expõem nomes efetivos autorizados; Input não carrega nomes dos alvos.
Recuperação usa ciphertext binário em IndexedDB, Web Locks e AES-GCM, com chave
somente em memória após autorização online de ficha e alvos congelados. Fase
confirmed precede fechar a chave; cancelamento explícito grava fence sem corpo.
SDK direto permanece negado. C2 ainda não troca a base nem exclui a campanha.
Ver [ADR 0033](decisions/0033-campaign-lore-variants.md) e
[contrato C2](tasks/writer-v2/execucao/17-variantes-de-lore-da-campanha.md).

## Candidatas e comparação de bases da campanha

`features/campaign-comparisons` compõe o painel da campanha e a descoberta global
no Estúdio. O servidor divide preparação/limpeza em `campaignComparison.mjs` e
leituras em `campaignComparisonRead.mjs`; contratos ficam em módulo puro próprio.
`campaignCaptureEngine.mjs` reúne o motor mínimo compartilhado com a captura B,
sem permitir que endpoints B leiam uma candidata arbitrária.

`users/{uid}/campaignComparisons`, `campaignComparisonOperations` e
`campaignComparisonStartFences` guardam controles, recibos e intenção inicial.
A candidata usa `campaignBases` e os cinco filhos existentes. Não cria outro root
de campanha e não muda base ativa, notas ou variantes. Preparação compara origem,
encarnação e base a cada passo; descarte limpa filhos/pins sem depender da origem.

A comparação pagina dados da origem, itens, referências e imagens, projetando
antes de classificar. Ordem usa adjacência; metadados de imagem comparam somente
imageKey/alt/caption. Listas não carregam corpos ou bytes de imagens. Detalhes e
mídia mantêm os gates de B, com limites de leitura/escrita e no-store de mídia.
Identidade, datas, revisão de variantes e token comum impedem compor contextos
diferentes. SDK direto continua negado; índices declarados não estão implantados
por consequência dos testes locais.

O journal local contém apenas controles mínimos, com Web Locks e CAS integral.
Um marcador conhecido preserva descoberta sem representar pedido pendente ou
autorizar avanço automático. Fence inicial e encerramento de passo vencido exigem
ações explícitas; controles inválidos permanecem preservados. O painel global
permite concluir limpeza mesmo quando o root da campanha desaparece.

C3A está concluído tecnicamente em fe10b15, com CI e regras verdes. Adoção C3B está
concluída tecnicamente em `947cfc3`, com CI e regras verdes; exclusão integral C4 está concluída tecnicamente em `0006a66`, com CI/regras verdes;
ver [ADR 0034](decisions/0034-campaign-base-comparisons.md) e
[contrato C3A](tasks/writer-v2/execucao/18-comparacao-de-bases-da-campanha.md).

## Adoção de base e continuidade das variantes

`features/campaign-adoptions` oferece revisão, decisões e preparação pela interface
pública; a campanha e o Estúdio compõem essa capacidade. `campaignAdoption.mjs`
coordena contratos, leitura e etapas limitadas. A revisão não bloqueia C2;
preparação instala uma barreira por encarnação antes de auditar pedidos remotos.
Cada escolha compara revisão e checkpoint. Alteração concorrente invalida o plano.

`campaigns/{id}/loreGenerations` guarda staging privado. O commit troca base,
procedência, geração ativa, revisões, comparação adotada e recibo atomicamente.
`campaignLoreStorage.mjs` resolve essa geração; somente a ausência do ponteiro
permite ler o layout legado. Participação candidate/legacy/inactive é separada de
base/override/removed. Anchor aponta diretamente à ficha congelada; bodyBinding
aponta aos bytes físicos, sem cópia ou cadeia de gerações. Retenção de legado
continua sujeita ao gate atual da origem, inclusive após adoções sucessivas.

O relógio privado `users/{uid}/campaignAuthorization/current` certifica autorização
de universos legados sem enumerá-los no commit. Escritores canônicos de universo,
lore global e análise o atualizam atomicamente; token e epoch seguro protegem
contra reset/overflow. Implantar esses escritores e drenar versões antigas antes
de habilitar adoção. Toda manutenção Admin deve seguir o mesmo protocolo. Exclusão
de uma campanha não pode remover o relógio compartilhado pelo UID.

Pedidos C2 remotos têm consulta de metadados e resolução com token preciso/recibo
próprio, sem exportar descriptor, chave ou prosa. Rascunhos cifrados conservam base
e AAD originais. O resolver histórico B confirma apenas o evento de ativação, sem
reconhecer a campanha atual. Journals usam Web Locks e CAS integral, sem lock
durante HTTP. Bases, pins e bindings emprestados não são coletados no cancelamento.
Ver [ADR 0035](decisions/0035-campaign-base-adoption.md) e
[contrato C3B](tasks/writer-v2/execucao/19-adocao-explicita-de-base-da-campanha.md).

## Exclusão permanente de campanhas

`campaign-deletions` é uma feature folha, limitada a auth/shared. `campaigns`
coordena seus diálogos e os closers públicos dos controles A/B/C1/C2/C3A/C3B;
o Estúdio importa essa composição. O verificador de arquitetura protege essas
fronteiras inclusive em imports de tipos, reexports e imports dinâmicos.

`campaignDeletion.mjs` coordena reserva global permanente, job privado, recibos e
fases de limpeza limitadas. O início marca deleting e desvincula o universo na
mesma transação. Toda leitura/mutação de campanha confere a reserva; controles
antigos são roteados por máscara antes de ler contexto. Mídia reautoriza após I/O.
Sanitização remove prosa/chaves/descriptors; pins são retirados um por transação,
preservando biblioteca e outras mesas. Todas as bases e gerações físicas entram
na limpeza. A raiz só desaparece após certificação e conferência da encarnação.

O cliente separa prova remota de revogação e CAS local. Confirmação válida oculta
conteúdo imediatamente, mesmo se um journal mais novo impedir o fechamento local.
Encerramento explícito de rascunhos exige prova permanente própria e snapshot
integral, sem decriptação. Pulso opaco em `shared/services` é apenas invalidação
de apresentação; não autoriza limpeza. O relógio de autorização do UID permanece.

C4 está concluído tecnicamente em `0006a66`, com CI/regras verdes; ver
[entrega C4](entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md),
[ADR 0036](decisions/0036-campaign-deletion.md) e
[contrato executável](tasks/writer-v2/execucao/20-exclusao-integral-da-campanha.md).
Antes de habilitar, implantar guardas/escritores/regras e drenar versões antigas.
Qualquer novo recurso de campanha deve atualizar a limpeza antes de sua ativação.

## Sessões privadas da campanha

`campaign-sessions` permanece folha de auth/shared, composta por `campaigns`.
O painel autoral fica em um slot estável por UID/campanha, após a primeira consulta
própria autorizada. Refresh da base remonta leitores derivados sem perder seu
rascunho; prova de exclusão própria continua ocultando ambos. Pendências da gestão
e das sessões são agregadas no host, sem um callback liberar a outra operação.

Cinco APIs de `functions/src/campaignSessions.mjs` autorizam a encarnação precisa
e a reserva C4 antes de corpo/recibo, sem consultar aventura para texto próprio.
`sessions` contém documentos individuais e tombstones; `sessionState/current`
controla coleção e próxima ordem. Mover troca duas ordens/revisões na transação,
preservando preparação e comparação do editor. Listagem só carrega metadados e
cursores vinculados à revisão observada. Data é civil, opcional e sem fuso; esta
forma ainda é suposição inicial de produto registrada no contrato.

Recibo histórico confirma o evento original mesmo após outra edição, mas só
entrega corpo quando revisão/hash ainda coincidem; session null não autoriza
adoção de texto posterior. Journal autoral integral usa Web Locks/CAS, persistência
antes do RPC e repetição explícita. Erros temporários não encerram o pedido.
O closer público só remove o snapshot explicitamente confirmado por prova C4.

S1 introduziu cleanupVersion 2 interna em C4: acrescenta sessions/sessionState e
sanitização seletiva de campaignSessionOperations. Ausência de versão preserva o
inventário v1; terminal mínimo não carrega o campo. Índices cobrem ordem nos dois
sentidos e summary não é indexado. Drenar também o início C4 antigo, junto aos
writers/guardas/regras, antes de habilitar a UI. Nenhum rollout foi executado.

S1 está concluído tecnicamente em `c95253a`, com CI e regras verdes. Referências, pistas,
missões e compartilhamento continuam fora desse recorte. Ver [ADR 0037](decisions/0037-private-campaign-sessions.md),
[contrato S1](tasks/writer-v2/execucao/21-sessoes-privadas-da-campanha.md) e
[entrega](entregas/2026-10-18-writer-v2-sessoes-privadas.md).

## Referências de lore da sessão

S2A está concluído tecnicamente em `d9b7988`; CI e regras verdes. A feature
`campaign-session-references` usa auth/shared e APIs públicas puras de campaign-lore;
somente campaigns compõe seu painel e controles. S1 expõe um slot com identidade
salva, sem título ou preparação. Adoção e projeção observada por C2 invalidam apenas
o leitor de referências, conservando o rascunho S1. O host agrega três pendências.

`functions/src/campaignSessionReferences.mjs` oferece cinco callables. A listagem
tem views fechadas references/candidates; ambas conferem sessão ativa e revisão
antes de resolver C2. O picker recebe loader injetado session-scoped; o renderer
público é puro. Leitura de corpo não usa GET C2 fora desse gate. A projeção inclui
variantes e legado autorizado; origem indisponível não inventa nomes antigos.

`sessionReferences` guarda vínculos flat mínimos e tombstones; `sessionReferenceState`
compara a coleção por sessão sem alterar o texto S1. Recibos/fences seletivos ficam
em `users/{uid}/campaignSessionReferenceOperations` e `campaignSessionReferenceFences`.
Confirmar histórico não exige sessão ativa nem origem; cancelamento explícito
persiste intenção antes do RPC e cria fence contra o pedido atrasado. Journal
metadata-only usa Web Locks/CAS integral e fica recuperável fora do diálogo S1.

C4 passou a v3 em S2A e agora inicia v4 em S3: recovery 8/children 16. Inventários
v1 3/7, v2 4/9 e v3 6/11 permanecem retomáveis nas mesmas posições. SDK direto é fechado; índices cobrem
lista e duplicata limitadas. Não habilitar UI antes da implantação conjunta e
drenagem dos starts antigos. Nenhum rollout foi executado. Cenas/blocos e S3
continuam separados; [contrato S2A](tasks/writer-v2/execucao/22-referencias-de-lore-da-sessao.md)
e [ADR 0038](decisions/0038-session-lore-references.md).

## Cenas capturadas por sessão

S2B está concluído tecnicamente em `56cbb06`, com CI e regras verdes; [contrato de cenas](tasks/writer-v2/execucao/23-cenas-completas-na-preparacao-da-sessao.md).
`campaign-session-references` mantém um host e um journal para Fichas/Cenas. O alvo
scene compartilha controle, recibos e fences; kind omitido continua lore, com filtro
no servidor. Nenhum namespace ou inventário C4 é acrescentado.

`campaignSessionScenes.mjs` oferece listagem de blocos, leitura de plano/bloco e
mídia sob o gate completo de campanha/sessão/vínculo/coleção/sourceContext. O plano
valida os descritores completos antes de selecionar objetivo/conflito/ponto de
vista; não lê content. Principal e adicionais são blocos separados na ordem
capturada, com Arquivo explícito e sem duplicar o corpo principal. Imagens têm
reautorização após download/derivação, pin/generation exatos e private,no-store.

O cliente verifica hashes de todas as janelas antes de mostrar prosa; mantém um
bloco/imagem por vez e descarta respostas antigas. Somente tipos públicos e
`verifyCampaignBaseFields` de campaign-bases podem ser reutilizados aqui; os
readers/loaders B não atravessam o gate da sessão. Cena ausente após adoção fica
indisponível sem legado ou fallback. [ADR 0039](decisions/0039-session-scene-material.md).

## Pistas e missões próprias da campanha

campaign-preparation é folha de auth/shared, composta somente em campaigns. Seu
painel/editor/journal é estável por UID/campanha, fora de materialEpoch e de
CampaignContent. O slot S1 apenas abre um contexto salvo por callback público;
não importa S3 nem copia sua preparação. Dirty e pedidos são agregados no host.

Itens pertencem à campanha; vínculos reutilizam-nos em sessões com ordem mista.
Catálogo ordena por tipo; estados e reabertura são manuais. Pendência deriva de
pending para pistas e available/active para missões. Excluir sessão conserva
itens/corpos; excluir item apaga corpo e deixa vínculo neutro/removível. Nenhuma
condição/destinatário/consequência concede acesso, publica ou altera universo.

functions/src/campaignPreparation.mjs oferece dez RPCs, seis ações e recibos
metadata-only. Itens/corpos e controles ficam separados; SDK direto é fechado.
Listas selecionam metadados, get exige revisão exata antes do body. CAS do
formulário congela a revisão da coleção; listas não rebaseiam texto. Cursores de
vínculo prendem ambas as coleções. Prosa própria tem até 150.000 caracteres por
campo e 512 KiB agregados UTF-8, sem trim/truncamento e sem indexação do mapa body.

Journal integral com Web Locks/CAS conserva o pedido antes do HTTP; cancelamento
persiste intent e cria fence sem ecoar prosa/pedido/hash. Reconhecimento histórico
não adota corpo novo. Respostas antigas são invalidadas ao editar/confirmar.
Campanha/token/reserva C4 precedem corpos e recibos; sessão ativa é requisito de
operação nova de vínculo, sem impedir reconhecer histórico. Apoio derivado S2
permanece separado e sujeito à sua autorização.

C4v4 acrescenta os sete namespaces e conserva prefixos v1/v2/v3, paginação de 25
e sanitização dos controles. Escritores/guardas/regras/índices sobem juntos,
drenando processos antigos antes de habilitar S3. Veja [ADR 0040](decisions/0040-campaign-preparation-items.md)
e [contrato S3](tasks/writer-v2/execucao/24-pistas-missoes-e-pendencias.md).
Fechamento local e matriz nativa verdes; correção visual e924890 com CI geral e regras verdes. Nenhum rollout executado.

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

## Lore privado de aventuras

`features/lore` expõe coleção e leitor próprios de aventura, mantendo os ramos de
livro/universo. As cinco APIs de `functions/src/adventureLore.mjs` autorizam a
raiz e sua encarnação precisa. Metadata em `adventures/{id}/lore` é separada dos
corpos em `loreBodies`; recibos e fences por UID não carregam prosa. Os quatro
namespaces ficam fechados ao SDK direto.

CAS da ficha/coleção, tombstones permanentes e recibo histórico evitam sobrescrita
ou recriação por retry. A prosa conserva whitespace; nova ficha é sempre privada.
Toda escrita incrementa loreVersion e o relógio de autorização atomicamente.

O contexto de menções reúne todas as páginas locais antes das globais, com tokens
coerentes. O catálogo visível permanece paginado. Somente abrir ficha solicita
corpo, após conferir contexto e revisão. Hints não autorizam cache: invalidam o
leitor e exigem prova de servidor; rascunho local fica estável por UID/aventura.

`campaignLoreOrigin.mjs` discrimina procedência global/local sem mudar hashes
antigos. Itens locais capturados continuam kind lore e guardam
originAdventureToken interno, fora de origin/sourceKey/DTO. B/C2/C3/S2 exigem
metadata atual mais a mesma encarnação da raiz antes de transportar derivado.
Referências de cenas e narrativa aceitam apenas lore local da própria aventura.

L concluído tecnicamente em `087bced`, com CI geral e regras verdes. Veja [ADR 0041](decisions/0041-adventure-private-lore.md)
e [contrato L](tasks/writer-v2/execucao/26-lore-proprio-de-aventura.md).
Importação, IA e portabilidade permanecem nas próximas verticais.

## Importação revisada de aventuras

`features/document-import` é a folha pública de parser, modelos, revisão e prévia
PDF, reutilizada por books e adventure-import. Os reexports de books conservam as
interfaces legadas; a contagem neutra fica em shared/lib/countWords.ts sem novo
algoritmo. A interface pública de adventure-import é composta no Estúdio.

Cada seção confirmada gera uma parte e uma cena com principal virtual privado.
`functions/src/adventureImport.mjs` compartilha inicializadores reais de cena e
ledger, sem modificar o algoritmo de contagem. A raiz permanece ausente enquanto
upload/preparação constroem filhos privados; ativação cria raiz, vínculo e recibo
atomicamente. Studio respeita a reserva global permanente. SDK direto não lê nem
escreve controles, chaves ou reservas. C4 continua v4, sem novos recursos de campanha.

O journal metadata-only precede o pedido. A revisão confirmada recebe AES-256-GCM
em IndexedDB, aguardando oncomplete antes do primeiro append. Nenhum PDF ou chave
é persistido no cliente. A chave vem por HTTP autorizado com Auth/App Check e
private,no-store; o rewrite Hosting precede a SPA e o proxy Vite encaminha somente
a rota exata ao projeto Firebase configurado. Web Locks cobrem apenas CAS local.

Tokens de encarnação derivam de createTime preciso do controle/reserva. Retomada,
retry e limpeza conferem vínculo local e remoto antes de alterar controles.
Cancelamento fecha admissão antes da limpeza limitada; ativado não é apagado pelo
job. Estados terminais removem chave e sinopse temporária do controle, preservando
a sinopse integral na raiz ativada. Reanexar o mesmo PDF restaura somente a prévia
local, após conferir bytes/hash/tipo, sem alterar a revisão congelada.

Veja [ADR 0042](decisions/0042-reviewed-adventure-import.md) e
[ABI I](tasks/writer-v2/execucao/28-contratos-da-importacao-de-aventura.md).

## Captura da estrutura salva — P1 M3b

Três leituras em functions/src/bookBackupRead.mjs fornecem origem, páginas de
IDs/tokens sem prosa e corpo JSON projetado em partes de 64 KiB. A origem fixa
UID/livro e identidade nativa de raiz/controle; cada item fixa sua própria
identidade. book-portability captura um item por vez em sink aguardado e confere
novamente seleção/versões por cadeia incremental, antes do selo pelo orquestrador.
A prova só cobre estrutura salva; não é schema/backup/restauração completos.
Imports de Firebase ficam adiados no adaptador callable, sem inicialização ao
usar transporte injetado. Veja [ADR 0047](decisions/0047-book-structure-read-proof.md).

## Histórico por fluxo — P1 M4

manuscript-history expõe streamWorkHistoryBackup e verifyWorkHistoryBackupStream,
com ordem ID opcional na lista existente, SHA-256 incremental de @noble/hashes e
memória limitada a página/partes. O coletor M1 permanece compatível. A ponte em
book-portability usa somente tipos da interface pública e emite resumos/textos e
índice final, sem controles privados. Todos os registros continuam provisórios
até revalidar as demais capacidades e fechar M2. Preservar BOM/UTF-8 literal.
Veja [ADR 0048](decisions/0048-history-backup-stream.md) para limites e dependência.

## Cenas e narrativa na captura — P1 M5

bookBackupResourceRead oferece duas leituras limitadas de cenas/fontes/narrativa,
com origem M3b comum e tokens nativos de item/pai. book-portability percorre IDs
e filhos por página, projeta referências neutras e reenumera a prova antes do selo.
bookSnapshotCapture compartilha hash/partes/UTF-8 com M3b. Ordem preserva ranks e
slot ativo; índices/jobs não são portados. Veja [ADR 0049](decisions/0049-book-resources-read-proof.md).
Ainda não é schema integral, sink persistente ou restauração de P1.

## Lore e personas na captura — P1 M6

Lore próprio usa o protocolo M5 sem resolver origem global. Personas são
capturadas por vínculo de livro/capítulo/fonte, sem listar biblioteca. O token
inclui encarnação/versão nativa do perfil da conta, que não avança a raiz do livro.
bookPersonaCapture emite um perfil por vínculo e confere ausências/tokens no fim;
presets usam hash puro. Não copiar chaves ou perfil de conta. Veja
[ADR 0050](decisions/0050-book-lore-and-personas.md). Schema/sink/restauração seguem em P1.

## Origem de universo na captura — P1 M7

getBookBackupUniverse resolve somente o vínculo da raiz autorizada. Máscara
authorId/deleting e timestamps nativos produzem descriptor none/reference/
unavailable sem copiar metadata/lore global. Token indisponível exclui identidade
alheia; origem autorizada fixa versão/encarnação. bookUniverseCapture escreve um
registro e revalida a prova antes do selo. Veja [ADR 0051](decisions/0051-book-universe-origin.md).
A religação na ativação do restaurador ainda é requisito de P1.

## Rascunho explícito na captura — P1 M8

bookDraftBackupRecords congela contribuição de capítulo legado antes de next/await,
sem consultar sua existência nem salvar. Manifesto distingue none de vazio;
encodeInto/hash incremental em duas passagens limitam bytes por parte. Perfil
declarado usa getBookBackupDraftPersona, autorizado por livro/origem e conta,
independente do vínculo salvo M6. Conferência final reautoriza raiz/perfil.
Veja [ADR 0052](decisions/0052-explicit-book-draft-backup.md). UI/sink/restauração seguem pendentes.

## Bytes autorizados da capa — P1 M9

bookBackupCoverRead confere livro/biblioteca/uso e metadata Storage antes/depois
de I/O, com generation/metageneration no token privado. bookBackupAssetStorage
faz hash por stream e ranges limitados; bookCoverBackupRecords verifica bytes
incrementalmente e reautoriza antes do selo. Manifesto portátil não leva path,
URL/token ou versão Storage. Capa apenas por URL fica legacy-unavailable.
Veja [ADR 0053](decisions/0053-book-cover-bytes.md). Schema/sink/restauração seguem em P1.

## Pacote de livro e arquivo temporário — P1 M10

streamBookBackup compõe sete capacidades com origem fixada e histórico injetado
pelo editor via interface pública. Ponte interna de uma posição aguarda consumo.
Todas as provas são reconferidas antes de footer e selo M2. Envelope v1 separa
novo .writerbook do JSON legado; leitor retorna envelope-only só após EOF.
saveBookBackup congela draft antes do destino, aguarda cada write e confirma
arquivo temporário somente no sucesso. Veja [ADR 0054](decisions/0054-streamed-book-package.md).
Schema semântico, legado, UI e restauração continuam obrigatórios em P1.

## Validação de conteúdo — P1 M11

bookBackupSchema/bookBackupContent fecham DTOs e conferem partes, identidades,
hashes, contagens e vínculos com portas puras de índice/hash. content-only exige
envelope completo, sem conferir autorização de restauração. book-portability usa
índice OPFS por operação, nomes HMAC e valores AES-GCM com chave só em RAM;
sem prosa ou lista ilimitada de IDs. Cleanup é obrigatório para retorno positivo.
Veja [ADR 0055](decisions/0055-book-backup-content-validation.md).
Leitor legado, revisão e servidor de restauração continuam em P1.

## Revisão de JSON legado — P1 M12

bookLegacyJSON valida JSON/UTF-8/duplicatas/EOF e registra spans por range.
bookLegacyCatalog fecha capacidades v1–v6; bookLegacyReview normaliza/valida dados
próprios com procedência e ausências explícitas. Não materializa corpo global,
busca URL ou inventa framing/histórico/datas. Validador novo continua estrito.
runBookValidation compartilha hash e cleanup protegido entre as duas inspeções.
Veja [ADR 0056](decisions/0056-legacy-book-backup-review.md).
UI e servidor de preparação/remapeamento/ativação continuam em P1.

## Reserva e transferência da restauração — P1 M13

bookRestoreUpload mantém raiz ausente, reserva global permanente e marcador
tipado em deletedBooks no mesmo nascimento nativo do job. Escritores comuns
continuam recusando o ID; ativação futura só poderá remover a barreira exata
na transação final. Partes de 64 KiB têm hash/ordem/CAS e recibos atômicos.
Chave somente HTTP Auth/App Check sem cache; SDK direto negado em todos os
namespaces. Cleanup v1 remove somente partes e chave, preservando metadados.
uploaded não valida conteúdo nem ativa livro.
Veja [ADR 0057](decisions/0057-book-restore-upload.md). Preparação, inventário
ampliado, materialização e ativação continuam obrigatórios em P1.

## Integridade retomável da entrada — P1 M14

bookRestoreIntegrity confere SHA-256/chain em lotes de até 16 partes (1 MiB).
Estado SHA privado serializado por hash-wasm permite retomada em nova instância;
provas por parte fixam hash/tamanho e identidade nativa. bytes-verified é anterior
à validação semântica. A porta interna de ranges reautoriza e recusa mudança/ABA,
sem endpoint de download. Leitura composta tem teto M2 de 272 KiB.
Cleanup v2 acrescenta provas e estado SHA, com fases limitadas e compatibilidade
v1. Veja [ADR 0058](decisions/0058-book-restore-integrity.md); restauração/ativação
integral e host ainda pendentes.

## Núcleo semântico continuável — P1 M15

bookContentMachine concentra as regras semânticas usadas por pacote novo e
normalização legada. Estado fechado de até 16 KiB conserva somente metadata;
relações e conferência final de referências/ranks avançam em lotes de até 64.
Instância inválida ou com I/O pendente não fornece checkpoint/result.
O adaptador bookBackupContent continua conferindo bytes/raw/canonicidade e
framing antes de compor content-only; resultado interno é semantic-only.
Checkpoint/índice são controle confiável do host, sem autorização própria.
Veja [ADR 0059](decisions/0059-book-content-checkpoints.md).
Persistência/parser servidor, preparação e ativação continuam em P1.

## Validação servidor do contêiner — P1 M16

Container/Package agora compartilham passos e cursores com seus generators.
advanceBookRestoreValidation liga fonte M14 e núcleo M15 a índice/checkpoint
privados, preparando uma unidade e reconferindo leituras nativas na transação
final. Índice/item/checkpoint/recibo nascem juntos; índice imutável e checkpoint
recusam ABA por vínculo nativo com seus recibos.
Cleanup v3 acrescenta validationIndex/Items/State, com inventário e EOF limitados.
content-verified não cria livro nem reautoriza universo. JSON legado servidor,
remapeamento/mídia, ativação e host ainda pendentes.
Veja [ADR 0060](decisions/0060-book-restore-server-validation.md).

## Scanner JSON com continuação — P1 M17

bookLegacyJSON compartilha uma única gramática entre readBookLegacyJSONStep e
scanBookLegacyJSON. Passo de até 64 KiB/64 valores mantém pilha, chaves limitadas
e estado lexical/UTF-8; cursor fechado de até 512 KiB não acumula prosa/arrays.
Callbacks recebem spans e hash usa só bytes consumidos, mesmo relendo sobras.
O tamanho no cursor não autentica origem. Antes da ligação ao job, catálogo/
normalização precisam de passos e snapshot M16 deve ser ampliado/versionado;
limite atual de 64 KiB não pode reduzir compatibilidade.
Veja [ADR 0061](decisions/0061-legacy-book-json-cursor.md). Legado servidor,
materialização/ativação e host/UI continuam pendentes.

## Catálogo e normalização legados com checkpoints — P1 M18

bookLegacyCatalog extrai estados/presenças/contagens, aceitação de span e descriptor
serializável. bookLegacyNormalize valida perfil/grupo ou emite registro por passo;
cenas/narrativa separam referências e fixam hash do item em andamento.
Cursor metadata-only de até 16 KiB vincula descriptor/contagens/posição.
bookLegacyReview usa esses mesmos passos e continua alimentando o núcleo M15.
readBookLegacyNormalizedItem relê por cursor anterior/identidade/hash e confere
índices existentes, sem writes. Esses controles não autenticam a origem.
Veja [ADR 0062](decisions/0062-legacy-book-normalization-checkpoints.md).
Ligação ao servidor e snapshot ampliado/versionado permanecem necessários;
nenhuma coleção/callable/Rule mudou neste marco.

## Validação servidor do JSON legado — P1 M19

advanceBookRestoreValidation também percorre JSON v1–v6 pela fonte privada M14,
scanner/catalog/normalizador compartilhados e núcleo M15. Metadados do legado
preservam procedência/ausências, sem selo fabricado, cópia global ou grant.
Checkpoint validationVersion 2 guarda stateJSON canônico opaco de até 640 KiB
reais, com contexto/hash/checkpoint/nascimento conferidos. Archive v1 conserva
codec de 64 KiB. Fases/resumo/recibos têm guardas por versão.
Pointers mantêm cursor anterior/record/hash, não DTO; relações relêem sem writes.
Inventário cleanup v3 já cobre os mesmos namespaces e limpa estado corrompido.
Veja [ADR 0063](decisions/0063-legacy-book-server-validation.md).
Materialização/remapeamento/mídia, reautorização/ativação e host/UI permanecem
necessários; antes dos novos writers, ampliar o inventário de limpeza.

## Leitura dos itens confirmados para restaurar livros (P1 M20)

[ADR 0064](decisions/0064-verified-book-restore-content-read.md) acrescenta
bookRestoreContentRead, composto somente na fábrica privada. Validação exporta
a autenticação de snapshot para reuso; store oferece leitura imutável de itens.
Abertura reconstrói relatório/resumo e fixa controle, snapshot e primeiro recibo.
Cada JSON ou parte raw traz verify(tx), obrigatório antes das escritas consumidoras:
reconfere origem e provas observadas, sem trocar pelo estado atual.

Novo formato lê spans canônicos limitados; legado reproduz cursor/catálogo M18,
conferindo hash/tamanho/localização. Raw mantém hash incremental e provas por
quadro, sem lista ilimitada de bytes ou provas. Não há writer, coleção, Rule ou
rota nova; cleanup v3 e codecs anteriores continuam. Remapeamento, inventário,
writers/ledger/personas/mídia, autorização/ativação e host/UI/roundtrip permanecem
em P1. Rascunho diferente deverá virar versão separada, preservando manuscrito salvo.

## Identidade restaurada de livro (P1 M21)

[ADR 0065](decisions/0065-restored-book-identity.md) define bookRestoreRemap e
readMappedItem interno. Contexto/pedido/tipo/pai determinam IDs sem mapa global;
chaves derivadas seguem os contratos nativos. Remapear referências explícitas,
não prosa/traits/datas fonte. Perfis consistentes são copiados para identidade
custom nova; legado ausente não usa perfil atual. Universo/outros projetos
conservam procedência sem grant.

Projeção de lore separa relations da base. loreRelations null significa ausência;
count zero significa array presente vazio. read(offset,limit) limita até 64,
mantém prova própria do índice e usa verify(tx) junto de M20 antes de escrever.
Qualificador externo tem precedência local somente com identidade confirmada.
Raw mantém bytes/provas com rawIdentity novo. Ainda não há writer/inventário
ampliado, documento nativo, ativação ou fluxo UI de restauração.

## Preparação nativa da estrutura restaurada (P1 M22)

[ADR 0066](decisions/0066-book-restore-native-structure.md) compõe
bookRestoreStructure e bookRestoreArtifacts na fábrica interna. Cada unidade
consome M20/M21 e grava documento/journal/progresso/recibo juntos; cursor é clonado
por tentativa para retries do SDK. Snapshot de validação mantém o checkpoint
original, fixado em validationCheckpoint somente para v4. preparation contém
apenas fase, cursor, contadores e timestamp; content-verified não significa cópia pronta.

V4 abrange atos, capítulos, workProgress, workWordGroups e workWordSources mais
materializationArtifacts privado. Ledger existente é preparado com countReady
falso e writes em buffer; raiz nunca é escrita. IDs/dono/datas/revisões/contagem
são novos, prosa/ordem/vínculos preservados. A fase resources mantém no cursor
o primeiro item que ainda não foi escrito.

Journal confere nascimento/última atualização com documento e recibos. Cleanup
remove pares por máscara, certifica namespaces antes de bytes/índices e outra vez
na conclusão; versões anteriores mantêm inventários. Alteração/ABA/foreign ou
raiz presente impedem remoção. Ainda faltam demais recursos, representação para
campos acima do teto nativo, perfis/mídia, autorização/ativação e host/UI/roundtrip.

## Texto grande de capítulo na preparação (P1 M23)

[ADR 0067](decisions/0067-restored-chapter-text-bodies.md) acrescenta bookChapterText:
acima de 512 KiB UTF-8, geração imutável em bookTextBodies com partes binárias
de 64 KiB, até 8 MiB lógicos. Capítulo guarda content null/contentStorage explícito.
Ledger usa texto completo; transação grava documentos/journals/cursor/recibo.
Corpo nasce com um pin. Futuras versões precisam integrar referências e coleta.

Cleanup v5 remove pares de partes antes do cabeçalho, confere journals/recibos e
certifica ausência antes das fases existentes. V4 pequeno permanece compatível;
validationCheckpoint continua fixo em v4/v5. Leitor interno autentica contexto,
hashes, nascimento das partes e UTF-8/BOM; chamador deve autorizar projeto.
Sem raiz, API pública, Rules novas ou fallback vazio. Ainda faltam consumidores
de livro ativo, outros campos grandes, demais recursos e ativação/host/UI.

## Leitura lógica de capítulos (P1 M24)

[ADR 0068](decisions/0068-logical-chapter-text-read.md) separa abertura/parte em
bookChapterText e compõe readLegacyChapterText por workProgress. API reautoriza
raiz/capítulo/geração a cada parte e fixa nascimento nativo no token. Cliente
chapterTextReadService monta bytes em lotes de oito, valida manifesto/tamanho/
hash/UTF-8/BOM, conta e confirmação final; bookService limita capítulos simultâneos.

Leitores de histórico, ledger/bootstrap, análise de lore e backup usam string
lógica. SDK de corpo segue negado. Escritores/histórico por referência/pins/
coleta/exclusão/conversão e ativação ainda precisam ser integrados. A callable
usa wrapper Auth/App Check e cache privado, sem deploy neste incremento.

## Escrita e versões de capítulo grande (P1 M25)

[ADR 0069](decisions/0069-chapter-body-references-and-history.md) acrescenta
bookChapterStorage: um acumulador por tentativa transacional, compartilhado por
escritor e captura anterior. Deltas por geração evitam perder pins. Escritor mantém
CAS lógico, reaproveita corpo idêntico e marca último pin como unreferenced.

Histórico v2 referencia corpo externo e guarda comprimentos dos segmentos UTF-8,
mantendo resumo/API e v1. Restauração prefere geração existente e confirma versão
anterior, texto, ledger, referências e recibo juntos. Exclusão de versão libera
pin na revogação uma vez; capítulo removido não retira as versões.
Coleta física, exclusão integral, conversão/chat e ativação ainda exigem integração.

## Coleta e exclusão física dos corpos (P1 M26)

[ADR 0070](decisions/0070-book-chapter-body-cleanup.md) acrescenta bookChapterCleanup:
helper limitado e mascarado, serviço e handler onDocumentUpdated. Cada lote
remove até 50 partes de corpo unreferenced/pins zero e atualiza gcRevision
atomicamente para a próxima execução; cabeçalho somente após página vazia.
Evento fixa nascimento e reautoriza raiz/corpo, preservando gerações referenciadas.

deleteSceneBook usa inventário v2, fase text-bodies e certificação final. Jobs
antigos preservam cursor e passam a drenar corpos antes da raiz. Worker normal
adia raiz ausente/em exclusão; o protocolo integral drena todos os corpos próprios
após revogar o livro. Nenhum índice/Rule/callable novo; trigger ainda não implantado.
Leitores/coletor/exclusão devem preceder produtores, drenando invocações antigas.

## Consumidores do texto lógico (P1 M27)

[ADR 0071](decisions/0071-logical-chapter-consumers.md) integra chat legado ao
escritor compartilhado e mantém corpo/pins/ledger/crédito/recibo atômicos.
Conversão copia fonte completa inline, conserva o campo legado congelado e libera
o pin do capítulo, preservando versões. Remoção por agrupadores mistos libera
esse pin na revogação e retoma por metadados mesmo após coleta.

Capítulo composto pode guardar campo congelado externo: bookService resolve
somente cenas; backup hidrata esse campo sem alterar o formato. Quotas antigas
de 800.000 bytes/cena/chat e envelopes permanecem; excesso é recusado integralmente.
Ainda faltam demais recursos/campos grandes e ativação/host/UI/roundtrip P1.

## Lore próprio na restauração (P1 M28)

[ADR 0072](decisions/0072-restored-book-local-lore.md) prepara fichas nativas por
leitor verificado e relações em páginas de até 64. Progresso v2 separa a varredura
loreItemIndex do cursor principal: outros recursos continuam pendentes mesmo
quando vêm intercalados. book-resources confere a contagem antes da próxima fase.

Journal/recibo/ficha/cursor são atômicos e cleanup v6 certifica o namespace lore,
mantendo compatibilidade com corpos v5 e inventários anteriores. Raiz ausente,
nenhuma promoção global ou publicação. Campos grandes ainda precisam de
representação e consumidores antes da ativação; falha nativa preserva a fonte.

## Cenas e narrativa na preparação (P1 M29)

[ADR 0073](decisions/0073-restored-scenes-and-narrative.md) acrescenta projeções
nativas fechadas e escritor interno de todos os recursos após lore. Progresso v3
confere manifesto e termina em resource-counts, sem ativar ou servir a cópia.
Filhos podem ser preparados antes dos pais: journal tipado registra cada caminho.

Cleanup v7 drena filhos antes de corpos v5 e famílias simples; cena/arco só é
removido após seus filhos estarem vazios. Certificação final inclui famílias novas.
Vínculo canônico repetido revalida prova/conteúdo e conserva journal/native intactos,
pois no-op não avança updateTime do Firestore. Contagens derivadas, índices prontos,
campos grandes e demais estágios continuam condições obrigatórias da ativação.

## Reconciliação dos recursos preparados (P1 M30)

[ADR 0074](decisions/0074-restored-resource-reconciliation.md) confere a seção pelo
leitor verificado e autentica cada artefato/journal antes dos derivados.
Ledger preserva legado e exclui Arquivo/sem capítulo/pai ausente do manuscrito.
Agrupador conta cenas arquivadas; palavras somente ativas. Vínculos nativos
únicos determinam referenceCount sem resolver origens externas.

Preparação v4 separa cursor da seção e dos vínculos. Inventário v8 inclui controle
tipado entity-index-control e conserva qualquer par idêntico sem no-op.
O estado personas mantém raiz ausente/countReady false. A ativação futura exige
prontidão e contagem atômicas junto da raiz, após autorização e certificação final.

## Personas na preparação privada (P1 M31)

[ADR 0075](decisions/0075-restored-persona-definitions.md) mantém definições e
vínculos em preparedPersonas/personaBindings sob o job privado. Perfis portáteis
preservam texto/atributos/arquivo/revisão/datas, com identidade remapeada; corpo
compartilhado não é regravado. Nenhuma biblioteca atual é consultada/copiada.

Inventário v9 inclui ambas as coleções antes da escrita, com prova nativa e
cleanup final. Progresso v5 fixa resourceEndIndex e confere manifesto/relatório,
terminando em universe. Raiz/countReady continuam pendentes. Biblioteca e
consumidores ainda precisam de integração e disponibilidade atômica antes da cópia ativa.

## Universo original na restauração (P1 M32)

[ADR 0076](decisions/0076-restored-universe-link.md) mantém none/unavailable/reference
sem promover ID indisponível nem copiar universo/lore. Reference exige nascimento
nativo exato e acesso próprio atual, com máscara authorId/deleting na observação.
Progresso v6 mantém cleanup v9 e termina em history; nenhuma raiz/uso/contador é
alterado durante a preparação.

O helper de ativação confere job atual e item M21 verificado, reautoriza a origem
na mesma transação e compõe prepareUniverseProjectLink estrito com commit separado.
Chamador futuro deverá confirmar vínculo e raiz juntos. Contador/uso inconsistente
falha inteiro; perda de acesso retorna universeId null. Harness sintético de SDK
não demonstra ativação P1. Histórico/rascunho/capa, personas, campos grandes,
certificação e host/UI/roundtrip/validate seguem pendentes.

## Histórico na preparação (P1 M33)

[ADR 0077](decisions/0077-restored-history-stream.md) acrescenta readRawPart interno
com cursor encadeado e provas por unidade. advanceBookRestoreHistory prepara uma
parte de origem por vez e confere SHA/tamanho integrais antes do manifesto.
workVersions/workVersionBodies seguem o contrato dos leitores existentes,
preservando datas/razão/rótulo e recursos históricos removidos sem recriá-los.

Inventário v10 inclui as duas famílias planas antes dos recursos, com namespaces
vazios, journal/recibo/cursor atômicos e cleanup mascarado limitado. Progresso v7
fecha totais do relatório antes de draft. Corpos podem existir antes do manifesto;
raiz ausente/countReady false impedem exposição. Certificação de todos os
artefatos antes da ativação, rascunho/capa, personas, campos grandes e host/UI
continuam obrigatórios. A raiz sintética dos testes não é ativação P1.

## Persona exclusiva do rascunho (P1 M34a)

[ADR 0078](decisions/0078-draft-only-persona-reconciliation.md) corrige a igualdade
prematura de M31: totals.profiles inclui o perfil exclusivo do rascunho.
No manifesto, o leitor confere book-draft penúltimo e sua prova, exigindo igualdade
com definição preparada ou registrando personas.draftProfileId remapeado.
profileCount dos vínculos salvos + contribuição exclusiva = total validado.

O campo opcional preserva progresso v5–v7/recibos antigos e permanece estável
nos novos replays. Não é grant nem cria definição. A continuação M34 deverá
preparar texto/perfil e a certificação final conferir todas as definições antes
da raiz. Inventários/arquivo/relatório semântico permanecem os mesmos.

## Rascunho na preparação privada (P1 M34b)

[ADR 0079](decisions/0079-restored-draft-preparation.md) prepara uma parte raw por
unidade com SHA/tamanho/provas. Compara com capítulo legado inline/lógico
comprovado; nunca usa campo congelado composto como manuscrito atual.
Texto igual não duplica corpos; diferente/removido usa domínio próprio de versão.

Perfil exclusivo é preparado sob o job; compartilhado mantém prova sem no-op.
preparedDrafts/current conserva metadados/vínculo/hash, sem prosa completa.
Inventário v11 inclui esse namespace antes da escrita e certifica limpeza com
nascimento nativo. Progresso v8 termina em draft-finalize, sem raiz/countReady
ou manifesto workVersions. M34c deverá conferir contagem, portabilidade de
metadados/perfil e todos os corpos antes de finalizar a versão e seguir para capa.

## Finalização da versão recuperada (P1 M34c)

[ADR 0080](decisions/0080-restored-draft-version-finalization.md) autentica corpos,
conta um rascunho com a semântica existente e reconfere observações por máscara
antes do manifesto/recibo. Corpo contado alterado/recriado impede o commit.
RAM proporcional a uma contribuição; não é contador incremental de HTML/Markdown.

work-version/VersionSummary aceitam draft opcional fechado, com metadados/perfil
originais. Projeção canônica, remapeamento, congelamento e frames JSON limitados
preservam a contribuição no próximo backup. Perfil histórico não é vínculo ativo.
Listagem mantém limite de linhas e orçamento de 512 KiB, admitindo um primeiro
item maior; cursor segue último entregue e clientes aceitam página curta não vazia.

Inventário v11 permanece. Progresso v8 finalizado chega a cover sem consumir capa,
com raiz ausente/countReady false. Capa, personas globais, campos grandes,
certificação/ativação e host/UI/roundtrip/validate seguem obrigatórios em P1.

## Bytes da capa na preparação privada (P1 M35a)

[ADR 0081](decisions/0081-restored-cover-byte-preparation.md) prepara uma parte
raw M21 por operação e reconfere suas provas no commit. SHA integral/tamanho
precedem preparedCovers/current; preparedCoverChunks guarda frames privados.
ID é remapeado, metadados são literais e ausência/legado não promovem URLs.
O contrato puro recusa nomes Unicode malformados para evitar perda em UTF-8.

Inventário v12 certifica namespaces vazios antes da migração e limpa por
journal/recibo/nascimento nativos, preservando encarnações recriadas. Progresso v9
termina em cover-finalize, sem imagem inteira no cursor, raiz ou countReady.
Materialização Storage/validação do formato, integração de personas, campos
grandes/consumidores, certificação/ativação e host/UI/roundtrip/validate seguem P1.

## Materialização privada da capa (P1 M35b)

[ADR 0082](decisions/0082-restored-cover-private-storage.md) instala intenção
nativa antes de I/O, reconfere frames/provas e decodifica uma PNG de até 16 MiB
sem recomprimir. Escrita create-only privada, sem token/URL; confirmação guarda
prova de geração/metageração com journal/progresso/recibo, sem biblioteca ou raiz.

Inventário v13 inicia cancelamento em cover-storage. Fence vazio permanente
impede recriação tardia; a versão anterior é conferida/excluída por geração exata,
preservada como string nas requisições SDK. Não remover fence por lifecycle ou
manutenção. Progresso v10 termina em personas-integrate. Antes da ativação,
reconferir Storage e integrar biblioteca/uso. Personas, campos grandes,
certificação/ativação e host/UI/roundtrip/validate seguem P1.

## Disponibilidade das personas restauradas (P1 M36a)

[ADR 0083](decisions/0083-restored-persona-availability.md) define restoreOrigin
operacional e lotes por restauração. Servidor confere origem própria ativa,
recibos imutáveis e nascimento/última alteração nativos antes de IA/backup.
Histórico oculta respostas revogadas antes do corpo e preserva perguntas próprias.
Snapshots portáteis continuam sem metadata operacional.

Biblioteca assina lotes somente quando necessários, invalida callbacks antigos e
não notifica listas visíveis idênticas. Edição conserva a origem dentro do CAS.
Rules bloqueiam falsificação/edição/vínculo pendentes; leitura própria de registros
continua permitida. Excluir o livro não deve recolher lotes/recibos ativos.
Nenhum produtor ou inventário novo é habilitado aqui: M36b deverá instalar as
cópias e a futura ativação liberar o lote atomicamente com a raiz.

## Instalação das personas restauradas (P1 M36b)

[ADR 0084](decisions/0084-restored-persona-installation.md) instala cada definição
privada autenticada como cópia global literal, com restoreOrigin, journal,
contador/cursor/lote/recibo atômicos. Nenhuma colisão é adotada ou sobrescrita.
Inventário v14/progresso v11 antecedem o primeiro perfil; total validado precisa
ser exato antes de resources-finalize. Raiz ausente/countReady false permanecem.

Lote é controle permanente fora de artifactCount. Prova nativa compartilhada
reconhece preparing/active/cancelled, mas consumidores só aceitam active.
Cancelamento revoga o lote antes de Storage/artefatos; limpeza metadata-only
confere journals/nascimento/última alteração e certifica o namespace vazio,
preservando marcador cancelled, outros jobs/UIDs e registros recriados.

Ativação ainda não existe: futura limpeza pós-ativação deverá aposentar journals
sem apagar biblioteca/lote/recibos ativos. Implantar gates/Rules/cliente antes dos
produtores. Capa/biblioteca, campos grandes/consumidores, certificação/ativação
e host/UI/roundtrip/validate integral seguem em P1/F2-09.

## Texto lógico das fontes de conversão (P1 M37a)

[ADR 0085](decisions/0085-frozen-scene-source-text.md) reutiliza bookTextBodies e
resource chapter para original.content congelado. Acima de 512 KiB, fonte guarda
manifesto e null; corpo/pin/partes/fonte/journals/cursor/recibo nascem juntos.
Inventários v5/v7 e delete-book v2 já cobrem a família, sem namespace novo.
Reconciliação e backup usam texto lógico, preservando ausência e hash e omitindo
contentStorage. A fonte é independente da existência atual do capítulo.

Lista mantém inline legado e projeta descriptor/token nas fontes externas.
Callable readSceneSourceText reautoriza UID/raiz/revisão e a identidade nativa de
fonte/corpo por parte; cliente confere bytes/hash/UTF-8/BOM e confirmação final,
sem persistência ou mudança do contrato público SceneSource com texto completo.
SDK direto permanece fechado, inclusive com raiz própria existente.

Implantar leitor/callable/cliente antes do produtor. Fonte grande ainda é
recomposta a cada página do backup: otimizar o custo quadrático antes de
habilitar P1 integralmente. Demais campos grandes, capa/biblioteca,
certificação/ativação e host/UI/roundtrip/validate continuam obrigatórios.

## Backup indexado das fontes congeladas (P1 M37b)

[ADR 0086](decisions/0086-indexed-scene-source-backup.md) guarda sceneSourceEncoding
no manifesto já criado com a fonte: hash/tamanho do JSON completo, hashes de
prefixo/sufixo e offsets/carries UTF-8 de até 128 segmentos. Não duplica prosa
nem cria namespace/inventário. Índice presente e inválido falha fechado; ausência
mantém a leitura legada.

Cada página recompõe apenas o intervalo pedido, com até quatro partes nativas e
memoização local à transação. Hash/escopo/nascimento/imutabilidade das partes
permanecem; cliente confere o JSON integral antes dos registros provisórios e
revalida provas antes do selo. O itemToken da fonte externa inclui nascimento
e última alteração do corpo; lista mascarada e varredura final também o observam.

Sem API/DTO/Rule/cliente de produção novo. Fontes M37a sem índice exigem migração/
certificação antes da habilitação completa; outros campos grandes e orçamento
após remapeamento continuam pendentes, assim como ativação/host/roundtrip/validate.

## Migração dos índices de fontes preparadas (P1 M37c)

[ADR 0087](decisions/0087-prepared-source-index-migration.md) acrescenta operação
interna após resources-finalize. Preparação v12 acompanha scanned/backfilled/
after/complete, um source por transação e total exato antes do EOF concluído.
Fonte/corpo/partes exigem prova nativa; snapshots de artefatos são somente
internos, e o validador puro de partes evita repetir a leitura de bytes.

Somente o índice ausente é acrescentado ao manifesto, com journal/recibo/cursor
atômicos. Texto, partes, pins, nascimento e artifactCount permanecem. Índice
existente divergente falha; correto não regrava manifesto/journal. Inventário
v14 e cancelamento continuam, com parser dos recibos novos e progresso v11/v12.

Implantar parsers/cleanup e drenar handlers antigos antes da migração. A
operação não ativa a raiz; complete não substitui certificação integral de
namespaces/fontes/índices. Outros campos grandes e host/roundtrip seguem em P1.

## P1 M38a — contrato interno para recursos grandes

[ADR 0088](decisions/0088-large-resource-payload-contract.md) define JSON imutável
em partes de 64 KiB, cabeçalho constante e prova binária por página, separado dos
corpos de capítulos. A identidade nativa do cabeçalho é fixada no ponteiro; cada
parte deve ser imutável e anterior/igual ao fechamento. Uma página usa dois docs;
a leitura completa acrescenta SHA integral e JSON/UTF-8 estritos. Autorização do
livro/recurso e prova de fonte/journals continuam a cargo do chamador.

Na entrega M38a, os módulos ainda não tinham chamador de produto. M38b habilita
somente a preparação privada com inventário/cancelamento próprios; consumidores
e exclusão do livro ativo continuam obrigatórios antes da ativação. O [plano M38](tasks/writer-v2/execucao/77-campos-grandes-de-recursos-e-metadados.md)
prossegue com lore, demais campos, saída portátil ampliada e certificação.

## P1 M38b — materialização privada de lore grande

A [ADR 0089](decisions/0089-private-paged-lore-payloads.md) emenda o endereço das
partes de M38a para bookResourceChunks, plano, antes de qualquer produtor real.
Cabeçalhos ficam em bookResourceBodies e páginas em bookLoreSegments.
payloadInventoryVersion 1 amplia o inventário independentemente das fases 6–14.
Cada segmento passa por partes, cabeçalho e ponteiro nativo; só depois de todos
o lore recebe stub de geração/base/contagens/sealBirth. Não oferecer esse stub
como LoreEntity. A reconciliação lê base e uma página de relações por operação.
Cancelamento autentica e remove as três famílias por consultas limitadas, incluindo
partes sem cabeçalho. Raiz e countReady continuam ausentes/false.

A [migração de prefixos antigos](tasks/writer-v2/execucao/79-migracao-dos-prefixos-de-lore.md)
foi implementada em M38b2 com contador autenticado pelo recibo original e replace
que preserva o nascimento do lore. Consumidores, edição, backup e exclusão do livro ativo ainda
precisam conhecer os payloads antes de qualquer ativação. Nenhum deploy ocorreu.

## P1 M38b2 — migração dos prefixos inline

[ADR 0090](decisions/0090-legacy-lore-prefix-migration.md) acrescenta legacy opcional
fechado ao progresso de payloads. Capturar prefixo próprio e contador global pelo
último recibo imutável; conferir metadata a cada unidade e hash completo antes do
replace. Repercorrer desde zero aumenta só o excedente ao prefixo já contado.
Preservar nascimento do lore e primeiro journal/recibo, sem reduzir contadores ou
artifactCount. sealBirth continua sendo o limite temporal dos segmentos novos.

O [plano 79](tasks/writer-v2/execucao/79-migracao-dos-prefixos-de-lore.md) passou em
Node/SDK e permite seguir M38c. Nenhuma migração de produção ou ativação ocorreu.

## P1 M38c1 — leitura privada do lore lógico

[ADR 0091](decisions/0091-private-complete-lore-reads.md) define lista metadata-only
por ID, abertura e leitura de uma parte. Tokens fixam clock da coleção e
identidade nativa da ficha; cada chamada reautoriza o livro. Base e relações
usam quatro/seis leituras nativas por parte, um chunk, sem teto de 128 partes.
Ponteiros/birth/Merkle ficam internos; o consumidor completo ainda deve montar,
conferir SHA/UTF-8/schema e reconfirmar origem. API compatível com inline e
sealBirth de fichas migradas. Não há grant SDK novo ou ativação.

O [plano 80](tasks/writer-v2/execucao/80-consumidores-do-lore-completo.md) mantém
as integrações de escritores/Rules/contextos/backup/coleta abertas; o cliente
foi conectado em M38c2, conforme a ADR 0092.
Edição/backup/exclusão de livro ativo e demais gates de P1 continuam pendentes. Parsers novos e drenagem de handlers antigos precedem rollout.

## P1 M38c2 — cliente do lore completo

[ADR 0092](decisions/0092-complete-lore-client.md) liga get/list/assinatura e criação
existente ao hidratador privado. Base/relações passam por SHA/UTF-8/JSON/schema
compartilhado; header e IDs/tokens finais são reconferidos. Até quatro partes por
lote, drenadas também em erro. Conta exata/epoch/unsubscribe descartam respostas
antigas; raiz e coleção aguardam confirmação servidor, inclusive metadata-only.

Livros inline usam SDK servidor sem depender das novas Functions; universos e
aventuras conservam seus contratos. Stub nunca entra em mapLocal e writers SDK
atuais recusam update/delete de payloads. Esse bloqueio cliente não substitui
Rules, escritores/GC nem autoriza ativação. Fluxos de leitura exigem conexão;
cache autoral existente não é fallback de autorização.

## P1 M38c3a — pré-requisitos da escrita de lore

[ADR 0093](decisions/0093-streamed-lore-field-validation.md) define validação pura
por até 64 KiB, com sintaxe/UTF-8/JSON canônico e domínio sem montar campos
inteiros. Estado contém apenas sintaxe e IDs/chaves/categoria limitados;
texto livre/listas não são guardados. O EOF não comprova SHA, origem ou grant.

Rules negam mutações SDK sempre que payloadStorage está presente, inclusive
null/inválido, replace e deleting; CRUD inline conserva os gates anteriores.
O [plano 81](tasks/writer-v2/execucao/81-escrita-do-lore-completo.md) exige upload,
inventário/cancelamento/cleanup, geração/CAS/recibos, readers e GC antes de
habilitar a edição completa. Nenhum produtor novo ou geração v2 foi ativado.

## P1 M38c3b — upload privado dos campos

[ADR 0094](decisions/0094-private-lore-field-uploads.md) implementa um serviço
interno para origem existente, sem callable ou troca ativa. Job/lease e inventário
precedem bytes; append fixa CAS, Merkle, SHA/parser e recibos. SHA serializado fica
em estado privado separado e é excluído no EOF/cancelamento. Corpo fecha após
verificação de metadata por lotes, com partSealBirth anterior à varredura.

O reader exige essa barreira além do header para os campos novos; ponteiros v1
seguem compatíveis. Confirmação histórica não concede disponibilidade/grant.
Cancelamento usa intenção própria, fence permanente e cleanup limitado por
provas nativas, preservando recriados e a origem. Namespaces SDK negados.
Adoção/readers v2, privacidade/clock, criação/exclusão/GC e inventário do livro
continuam obrigatórios antes da habilitação.

## P1 M38c3c — leitores de gerações achatadas de lore

[ADR 0095](decisions/0095-flat-lore-generation-readers.md) prepara storage v2
com base v1 opcional, sete campos substituídos/retirados explicitamente e datas
autoritativas. Relações conservam generationId/sealBirth próprios; segmentos
novos exigem partSealBirth. Nenhuma cadeia de overlays ou origem física no wire.

API privada existente reautoriza cada unidade e fornece manifestos por campo.
Cliente confere SHA/UTF-8/JSON/domínio, preserva presença/datas e reconfirma a
cabeça; não retorna ficha parcial. Cada unidade lê um chunk, com quatro/cinco
leituras nativas para campo sem/com base e seis para relação com base.

Nenhum produtor v2 está habilitado. Harnesses de leitura não representam adoção.
Metadata da origem, CAS/leases/privacidade/clock, criação/exclusão/GC, inventário
do livro e integração dos demais consumidores precedem o rollout.

## P1 M38c3d — metadata lógica da origem do lore

[ADR 0096](decisions/0096-private-lore-source-inspection.md) resolve presença,
isPublic e datas no servidor, por inspeção privada. O indexador valida base v1
em unidades com o parser de campo existente, sem guardar prosa. Ranges pertencem
à base original, não aos valores substituídos pela geração v2.

users/uid/bookLoreSourceInspections guarda job/recibos/certificado privados.
SHA serializado fica em state/current, separado e excluído no EOF/cancelamento.
Cada unidade reautoriza a mesma origem; CAS e provas nativas autenticam progresso
e reenvios. V2 lê override de privacidade separadamente; inline mantém ausência
de campos/datas. O cliente não declara valores da fonte.

Certificado é prova de metadata histórica sob o mesmo contexto, não grant ou
disponibilidade atual de todos os corpos. Adoção deve revalidar origem e provas
e coordenar leases/inventário/clock/privacidade. Não há endpoint, produtor v2,
adoção ou migração habilitados por este incremento.

## P1 M38c3e — alcance e coleta dos corpos de lore

[ADR 0097](decisions/0097-lore-resource-reachability.md) prepara inventário
nativo em bookLoreGenerations e bookResourceInventory. Fonte observada gera
controles imutáveis, estado/eventos e referências pareadas por nascimento.
Initializing protege antes da primeira referência; collecting fecha registros
novos. Geração aposentada e corpo coletado não podem voltar ao estado ativo.

A coleta examina toda a cabeça atual por lotes, inclusive páginas deslocadas,
e fixa sua identidade nativa. Alteração/recriação reinicia essa verificação
antes dos deletes. Referência nova invalida a varredura de gerações. Chunks
saem por metadata, em lotes; header só após ausência de extras. Recriados e
qualquer lease presente são preservados.

O [plano 82](tasks/writer-v2/execucao/82-alcance-e-coleta-dos-corpos-de-lore.md)
mantém reserva/adoção de leases, preparing, materialização inline e exclusão
do livro pendentes. Livro ausente/deleting adia a coleta. Serviço é interno,
sem endpoint, worker automático, adoção de cabeça ou rollout habilitados.

## P1 M38c3f — reserva e cancelamento da edição de lore

[ADR 0098](decisions/0098-private-lore-edit-reservations.md) liga tentativa
privada bookLoreEdits, geração preparing, slots, uploads e leases por recibos/
nascimentos nativos. Reserva e inventário são atômicos; prosa não entra no pai.
Cancelamento fecha a geração e coordena coleta do corpo/upload/pai por unidades.

Capacidade opaca ligada à transação permite somente limpar bytes staged próprios
após ausência/deleting/revogação. Cabeça/referências e recriações continuam
protegidas; coleta genérica preserva leases sem essa prova. Fences permanecem.
O runner de sintaxe percorre todos os módulos .mjs de functions/src separadamente,
evitando o limite de linha do Windows.

Compilação completa, referências da geração, leases adopted, adoção CAS e
exclusão ainda pendentes. Sem endpoint/UI/ativação. P1/F2-09/V2 continuam abertos.

## P1 M38c3g — composição das gerações de lore

[ADR 0099](decisions/0099-private-lore-generation-compilation.md) congela slots
e compõe fontes payload v1/v2 sob a geração preparing. Base/campos são achatados;
páginas mudadas usam descritores próprios com journals/recibos nativos. Cada
corpo é vinculado ao inventário antes da seleção; auditoria verifica partes,
SHA integral e domínio de campos/páginas por unidades.

Checkpoint privado sai no EOF/cancelamento. Certificado ready é metadata
histórica, não ativação/grant. Cancelamento limpa slots e descritores próprios
com guard de cabeça atual; herdados e fences permanecem. Materialização inline,
adoção e exclusão/consumidores/cliente ainda pendentes. P1/F2-09/V2 abertos.

## P1 M38c3h — materialização servidor do lore inline

[ADR 0100](decisions/0100-server-lore-inline-materialization.md) materializa
valores herdados em uploads privados derivados do pai/alvo. O serviço de upload
pode executar internamente na transação nativa do pai, sem nested transaction.
Job/lease materialization e slot materialized ligam início e reserva originais.

Checkpoint do pai guarda só metadata; fonte é reautorizada a cada unidade.
Cancelamento limpa primeiro o filho ainda não reservado, sem recontagem, depois
slots/descritores. Preparação cobre inline e payload v1/v2; certificado ready
continua privado e sem ativação/grant. Adoção e integração de exclusão/
consumidores/backup/cliente permanecem obrigatórias. P1/F2-09/V2 abertos.

## P1 M38c3i — adoção atômica das gerações de lore

[ADR 0101](decisions/0101-atomic-lore-generation-adoption.md) ativa geração
preparada e troca cabeça/clock/datas/privacidade/recibo no mesmo CAS.
Consentimento público exige true explícito; espelho do stub é projetado no
servidor, enquanto a inspeção valida o valor lógico.

Leases reserved são adotadas logicamente pelo evento nativo da geração, sem N
writes por página. Só a prova original de pai/slot/lease/geração permite reconhecer
aposentadoria na coleta; cabeça/referências ainda protegem os corpos.
Registro de fonte preparada confere o evento/recibo e a cabeça nativos.

Marca servidor hasLoreResources impede exclusão legada. Serviço interno, sem
endpoint/UI/worker; criação/exclusão, consumidores/backup/cliente e rollout
continuam pendentes. P1/F2-09/V2 abertos.

## P1 M38c3j — exclusão coordenada dos recursos de lore do livro

[ADR 0102](decisions/0102-coordinated-book-lore-deletion.md) acrescenta
lore-resources ao inventário v3 de deleteSceneBook. Contexto privado nativo
bookLoreDeletions fixa livro/checkpoint/cutoff; eventos/âncoras e cursores
coordenam cancelamentos e limpeza na mesma transação do checkpoint externo.

A barreira deleting/publicação revogada antecede o contexto. Preparações são
resolvidas antes de remover cabeças e aposentar gerações. Descritores, partes
e headers são removidos por metadata; até 16 partes por unidade, header por
último. Corpos controlados validam inventário/lease nativos; legados sem controle
usam header imutável/cutoff, sem inventar geração. Dados recriados, escopo
divergente e chunks órfãos bloqueiam terminar; fences não entram no purge legado.

Migração v1/v2 preserva fase e aliases; finish reconfere ausência de conteúdo.
O cliente encaminha hasLoreResources ao servidor. Preparações ainda sem marca
exigem roteamento completo antes da exposição de uploads/escrita. Exclusão por
ficha, criação, consumidores/backup/cliente e rollout permanecem pendentes.
P1/F2-09/V2 abertos; sem endpoint/UI/worker ou deploy.

## P1 M38c3k — exclusão individual do lore completo

[ADR 0103](decisions/0103-individual-book-lore-removal.md) retira a ficha com
inspeção ready/CAS, clock/datas/privacidade e tombstone nativos no mesmo commit.
Contexto privado bookLoreRemovals fixa a origem; eventos/âncoras/recibos tornam
a limpeza retomável sem reutilizar IDs. Rules, leitor completo e análise Admin
conferem a reserva permanente.

Unidades compartilhadas aceitam somente abertura nativa do controlador na mesma
transação. Escopo individual preserva outras fichas/jobs, cancela preparações,
aposenta gerações e limpa descritores/partes/headers por metadata/cutoff.
Inventário conhecido é auditado; objetos divergentes ou recriados ficam intactos.
Consulta de corpos por resource.kind/resource.id/nome tem índice declarado.

Coletor genérico adia por lore-removal. Deleting do livro bloqueia coleta
individual; etapa removals do inventário v3 registra handoff nativo antes de
limpar os recursos. Conclusão histórica confere o controlador/checkpoint
originais depois da raiz sair, sem reabrir origem ou executar cursor antigo.

O leitor completo acrescenta uma consulta constante ao tombstone por abertura.
Criação por reserva, demais writers/consumidores/backup/cliente e rollout seguem
obrigatórios antes de endpoint/UI. P1/F2-09/V2 abertos, sem deploy.

## P1 M38c3l L1 — reserva da criação de lore

[ADR 0104](decisions/0104-permanent-book-lore-creation-reservation.md) fixa
intenção bookId/creationId e loreId derivado no servidor. Contexto privado
bookLoreCreations e bookLoreReservations/loreId compartilham nascimento;
hasLoreResources é marcado atomicamente, sem cabeça, clock/prosa/datas ou
publicação novos.

Cancelamento cria evento/prova imutáveis e preserva marcadores. Cancel prévio
cria somente fence privado do UID. Abertura nativa ligada à transação exige
reserva/livro originais autorizados e ausência de cabeça/tombstone; token
histórico sozinho não é grant. Recursos inesperados bloqueiam cancel vazio.

Etapa creations do inventário v3 cancela reservas vazias junto do checkpoint
do livro. Rules, leitor e análise protegem IDs reservados de cabeça prematura.
O reader acrescenta uma consulta constante ao marcador.

L1 não é criação completa: L2 precisa inventário/cancelamento de filhos e fonte
privada dos uploads antes do primeiro byte; L3 precisa composição/auditoria/
ativação e reconhecimento de sucesso histórico. Sem endpoint/UI/deploy.
Demais integrações de P1/F2-09/V2 continuam obrigatórias.

## P1 M38c3m / criação L2 — campos sem cabeça ativa

[ADR 0105](decisions/0105-native-creation-field-uploads.md) estende o protocolo
de campos com creationRef e inventoryVersion 2, mantendo v1. Fonte reabre reserva/
livro originais e bloqueia cabeça/tombstone/cancel; binding/prova são criados
junto do job/lease/estado SHA e conferidos em cada load histórico.

Com filhos, cancel registra intenção e journal nativos antes de limpar.
Novas unidades/leitura selada são bloqueadas; advance coordena um filho por vez
com CAS/recibo/checkpoint, até 16 partes e header por último. Auditorias limitadas
verificam jobs/leases e ausência de conteúdo inesperado. Fences permanecem.
Provas órfãs, controles/bytes recriados e recursos sem vínculo bloqueiam concluir.

Store da criação depende só do journal de metadata; fonte/binding não importam
o coordenador de cleanup. A etapa creations do inventário do livro usa o mesmo
cancel/advance e confirma filhos já encerrados por fields, sem nova remoção.

L2 não ativa ficha. L3 deve integrar tentativas/filhos reserved ao cancelamento,
compor/auditar sem base e ativar cabeça/geração/leases/clock/datas/recibo juntos.
Criação adotada é sucesso histórico não cancelável. Sem callable/UI/deploy;
demais writers/consumidores/backup/cliente e P1/F2-09/V2 continuam pendentes.

## P1 M38c3n / criação L3A — composição e cancelamento das tentativas

[ADR 0106](decisions/0106-creation-lore-composition-and-attempt-cleanup.md):
intenção creation substitui inspection, exige name/category e relações explícitos,
e fixa bookBirth/creationBirth sem timestamps de uma ficha inexistente.
Cada unidade abre reserva/livro originais, com cabeça e tombstone ausentes.

Start acopla job da tentativa e binding/prova imutáveis no criador.
Compositor reutiliza auditoria/parser/SHA por parte, sem base ou campos herdados.
Inventário de geração schemaVersion 2 representa creationSource explicitamente;
schemaVersion 1 das edições existentes continua idêntico. Corpos e
payloadStorage não mudam de versão por causa dessa distinção.

Cancel inicia em attempts quando necessário, coordena um passo do filho junto
do journal/recibo do pai, depois limpa uploads não reservados. Até 16 partes,
header por último; reserved exige prova nativa do slot e geração cancelada.
Audita edits/generations/bodies por cursor e preserva metadata/provas conhecidas.
Órfãos ou recriados bloqueiam conclusão. A exclusão do livro usa o mesmo fluxo.

Criação permanece interna: adoção creation é recusada explicitamente até
L3B implementar a ativação e seu sucesso histórico. Reader segue recusando
cabeça prematura reservada. Sem callable/UI, Rule, índice ou dependência novos.
Demais writers/consumidores/backup/cliente e ativação de P1 seguem abertos.

## P1 M38c3o / criação L3B — ativação e comprovação histórica

[ADR 0107](decisions/0107-native-book-lore-creation-activation.md): adoção
creation cria cabeça e comprovante/prova privados do criador na mesma transação
da geração ativa, leases lógicas, clock/datas/flag e recibo da edição.
Timestamp de criação nasce na confirmação; ausência de consentimento continua
privada e true exige campo explícito auditado. Não publica nem gera débito.

CreatorStore valida o sucesso com binding/prova da tentativa, intenção/contexto,
recibo/prova e evento original da geração; não abre livro/cabeça/corpos atuais.
Contratos puros e prova de recibos foram extraídos preservando reexports/hashes.
O núcleo da prova de tentativa não importa o store, evitando recursão.
Confirmação da edição adotada de criação exige também o comprovante do criador.

Reader de ID reservado exige nascimento nativo da cabeça igual ao da ativação,
createdAt original e livro original autorizado. Primeira geração valida esse
nascimento em reedições; gerações seguintes mantêm o contrato de edição.
Comprovantes continuam válidos após aposentar/coletar a primeira geração.

Criador adopted recusa cancel e novos produtores. Tentativas não usadas ainda
possuem cleanup próprio; a exclusão do livro reconhece o sucesso e preserva
controles, leases, recibos e marcadores. Retry histórico não recria raiz/ficha
nem concede leitura atual. Sem endpoint/UI, Rules, índice ou dependência novos.

Leitura de fichas sem reserva conserva os custos anteriores. Fichas criadas
pela reserva validam um conjunto fixo adicional de metadata/provas, independente
do tamanho dos campos/páginas; continuam baixando uma parte por unidade.
Demais writers/consumidores/backup/cliente e ativação de P1 seguem pendentes.

## P1 M38c3p — finalização de livros pelo servidor

[ADR 0108](decisions/0108-server-only-book-deletion-finalization.md):
deleteBook sempre revoga/marca deleting e delega a finishBookDeletion.
A assinatura é conservada, mas o finalizador pagina deleteSceneBook com
pedido fixo; não consulta flags, não lista/remove filhos nem grava deletedBooks
pelo SDK. O servidor já descobre preparações privadas sem hasLoreResources.

Rules negam todo root delete SDK e todo acesso/escrita SDK de deletedBooks.
Metadata e início continuam possíveis. Erro remoto não aciona fallback;
checkpoint canônico e tombstone ficam sob autoridade do protocolo servidor.

Rollout conjunto e drenagem de clientes antigos permanecem obrigatórios.
Não há endpoint/índice/dependência novo. Auditoria dos outros namespaces e
demais writers/consumidores/backup/cliente/ativação de P1 seguem pendentes.

## P1 M38c4a / A1 — análise por contexto lógico

[ADR 0109](decisions/0109-logical-lore-analysis-context.md): bookLoreLogicalRead
usa C1 para compor inline/base/campos flat/relações com JSON/SHA/Merkle/domínio/
origens nativas. Caller autoriza livro na transação. Presenças, valores literais,
datas e privacidade não são normalizados ou escritos na origem.

Análise pagina local/global por ID (16 documentos), agrega budget de 300000
bytes JSON, 512 partes externas/512 páginas e contexto final de 300000 bytes
UTF-8/500 entidades. Corpo externo acima do saldo é recusado antes dos chunks;
prefetch de inline/global/metadata tem sua própria página física. Não é limite
de autoria, portabilidade ou C1. Contabilização de contexto é linear.

Revisão fixa nascimento de livro/universo e nascimento/atualização/representação
das entidades. Retornos do provedor e body replays reabrem o contexto; mudança
impede próximo chunk/reparo e persistência de resposta. Ticket guarda hashes/
resultado próprio, sem cópia dos corpos do compêndio. Recibo aplicado é metadata.

applyLoreAnalysis não mistura campo inline em payload. A2 ainda deve preparar
e adotar o lote inteiro com crédito/recibo atômicos. Inline/global mantêm o
contrato vigente; escritor completo, demais consumidores/backup/cliente e
ativação de P1 seguem pendentes. Sem novo endpoint/Rule/índice/dependência.

## P1 M38c4b / A2a — adoção conjunta de lore

[ADR 0110](decisions/0110-atomic-book-lore-adoption-batches.md):
prepareBookLoreEditAdoption e prepareBookLoreEditAdoptionBatch separam
leitura/validação dos writes na transação do caller. Serviço singular usa
o mesmo plano, preservando hashes e recibos. Lote aceita 1..50 CAS canônicos,
com edições/alvos distintos e mesmo UID/livro/nascimento.

Timestamp comum monotônico, um avanço localLoreVersion e no máximo uma
revogação/versão de privacidade por lote. Cada membro conserva before/after
próprios. Cabeças/gerações/aposentadorias/leases lógicas/recibos/criadores
confirmam juntos, sem writes de partes/headers/leases individuais.
Falha de um membro aguarda as leituras irmãs antes de rejeitar a transação.

Comprovante/prova imutáveis em adoptionBatches/adoptionBatchProofs sob a
primeira edição fixam intenção ordenada e metadata. Nascem junto dos recibos/
eventos de todos os membros. Replay exige a prova conjunta original; não
infere atomicidade de sucessos individuais. GC/retirada/exclusão conservam
confirmação sem prosa nem ressurreição. Não há novo inventário de preparação:
metadata só nasce no sucesso sob o job permanente existente.

Caller pode ler saldo/recibo após preparar e gravá-los no mesmo commit.
A primitiva não cobra nem integra ainda applyLoreAnalysis: A2b/A2c precisam
preparação/cancelamento/inventário e aplicação local/global/nova com débito/
recibo reais. Demais integrações e certificação de P1 permanecem abertas.

## P1 M38c4c / A2b1 — reserva nativa da aplicação

[ADR 0111](decisions/0111-native-lore-analysis-application-reservation.md):
loreAnalysisContext/Fields extraem leitor e validadores existentes sem mudar
a revisão. Serviço interno de aplicação registra 1..50 alvos e todos os IDs
de criação/inspeção/edição/uploads antes dos produtores. Contexto fixa análise/
provedor/origens/hash/expiração; manifesto só contém metadata/hash dos patches.

Contexto/estado/evento/prova nascem juntos, com marca hasLoreResources mas
sem clock/cabeça/bytes/débito. Retry/get são metadata após revogação e não
concedem leitura ou escrita. Cancel-before-start é fence; cancelamento sem
filhos é atômico. Filho encontrado bloqueia para reconciliação, sem delete
inferido. Exclusão descobre por bookId e fecha a reserva pela fase applications
antes de edições, com cutoff/nascimento e checkpoint na mesma transação.
Checkpoints anteriores permanecem válidos; Rules negam SDK em toda a árvore.

A2b2 deve habilitar produtores somente com bindings e checkpoints do pai
na mesma transação e cleanup dos filhos coordenado. A2c deve compor aplicação
local/global/nova, crédito e recibo reais. Não há novo callable ou UI;
applyLoreAnalysis continua recusando payload. P1/F2-09/V2 seguem abertos.

## P1 M38c4d / A2b2 — preparação e cleanup vinculados

[ADR 0112](decisions/0112-bound-lore-analysis-application-preparation.md):
workflow v2 mantém cursor/contagem, ready, intenção cancelling e cleanup por
unidade, preservando v1. Reabre análise/provedor/origens/contexto por unidade
e confirma filho, proprietário/prova, evento e checkpoint na mesma transação.

IDs analysis-<hash> e analysis-source/edit/field-<hash> são reservados.
loreAnalysisChildOwners/OwnerProofs fixam a criação do filho no pai; produtores
singulares exigem capacidade nativa da unidade. Criação/inspeção vinculadas
só permitem filhos planejados. Edição pode ler campo selado previsto como
dependência, sem ganhar capacidade para produzir bytes nele.

Serviços existentes aceitam transação injetada. Preparação percorre fonte,
campo/parte/selo, reserva/geração e composição/auditoria; certificado/prova
do membro fixa referência CAS pronta. Globais permanecem metadata, sem escrita.
Nenhuma cabeça, clock ou crédito muda; adoção individual continua bloqueada.

Cancelamento fecha primeiro e limpa edição, campos e origem, auditando provas.
Revogação não impede cleanup nativo nem concede prosa. Estrangeiros/recriados
são preservados. Exclusão coordena cleanup da aplicação com seu checkpoint.
A2c deve compor aplicação integral local/global/nova e crédito/recibo reais;
demais integrações e certificação de P1 continuam pendentes.

## P1 M38c4e / A2c — aplicação preparada com débito e recibo

[ADR 0113](decisions/0113-atomic-prepared-lore-analysis-application.md):
applyLoreAnalysis confere a reserva no mesmo TX do ticket; ready passa pelo
finalizador, preparação/cancelamento não permitem fallback legado. Sem reserva
o comportamento inline/global anterior continua, recusando payload sem preparo.
Hash canônico da reserva não substitui o hash JSON dos recibos legados.

Grant de adoção exige todos os certificados/provas e proprietários originais.
O batch exato recebe abertura opaca por transação; singular e produtores
continuam bloqueados. A2a planeja os locais; patches globais/defaults privados,
um clock por domínio, data comum, invalidação global e crédito/recibo reais
confirmam juntos. Todas as leituras precedem writes. BYOK não debita.

Applied só carrega com recibo/prova imutáveis nascidos junto do evento final,
estado e grupo A2a. Replay exige o grupo original antes do replay dos membros,
sem reabrir prosa/saldo/ticket ou preparar nova adoção. Sobrevive a revogação,
retirada/GC e exclusão. Marca nova no ticket nunca substitui prova; cancelar
sucesso é recusado e exclusão preserva metadata antes da limpeza geral.

Orquestração de preparo/recuperação no cliente/endpoints, outros escritores/
consumidores, backup, rollout e certificação de P1/F2-09/V2 seguem pendentes.

## P1 M38c5a — captura CAS, diff literal e codec cliente

[ADR 0114](decisions/0114-literal-book-lore-client-edits.md): capture do leitor
C1 conserva dados brutos e readToken da montagem reconfirmada em snapshot
imutável. Get/list mantêm sua interface anterior; não há persistência nova.

planBookLoreEdit recebe operações explícitas por campo, sem modelo normalizado
do formulário antigo. Plano contém apenas identidade/CAS, remoções e uploads
alterados. Presenças, valores literais, datas e ordem/duplicatas são preservados.
Relações usam páginas de 64, com contagem/forma final explícitas.

Codec congela valores antes de await, escapa strings em fatias e agrega partes
de 64 KiB. Duas passagens lineares produzem SHA/Merkle/manifesto e provas,
com IDs canônicos do servidor. Noble já instalado substitui APIs Node;
retomada percorre o prefixo uma vez e preserva abort/guard por unidade.
Memória auxiliar contém uma parte e hashes, além do valor congelado.

Esta infraestrutura não concede autorização nem habilita o CRUD legado para
payloads. Host, orquestração, recuperação e demais consumidores/backup/
ativação/rollout permanecem obrigatórios para concluir P1/F2-09/V2.

## P1 M38c5b — coordenação cliente da edição preparada

[ADR 0115](decisions/0115-unit-coordination-of-book-lore-edits.md): prepareBookLoreEditOperation
congela captura/diff/manifestos antes de RPC e avança até uma unidade por vez.
Ready não adota; apply explícito autoriza adoção. Pedido integral permanece
antes de await; retry repete método/operationId/CAS/bytes, sem rebasing.

DTOs fechados validam progresso. Snapshot tem contadores/controle atual;
controlsPage limita consulta explícita a 50 controles. Cursores atravessam
uploads uma vez; iteradores não repetem prefixo por parte. Metadata privada
não contém prosa e não concede autorização.

Cancel síncrono fecha produção; canal separado limpa mesmo com RPC pendente.
Pai precede campos/inspeção; cercas são preservadas. Resposta tardia não
reabre; conflito com adoção exige confirmação metadata própria. Guard vale
antes/depois de RPC; abort permite cleanup explícito autorizado.

Operação em memória, port injetado e writeId exclusivo por intenção. IntentHash
não é reserva global nem recuperação após recarga. Terminal libera referências
de codecs, sem prometer apagar memória/RPC em andamento. Host/UI/endpoints,
recuperação e integrações de P1/F2-09/V2 seguem pendentes, sem bypass SDK legado.

## P1 M38c5c — transporte autenticado da edição manual

[ADR 0116](decisions/0116-authenticated-manual-lore-edit-transport.md): bookLoreEdit recebe envelope
fechado method/input, autoriza UID de request.auth e despacha somente 18
operações de inspeção/campo/edição manuais. IDs e referências exigem prefixos
do coordenador; criação e namespaces reservados da análise não são expostos,
inclusive get/cancel/cleanup. O input segue literal aos serviços existentes.

Entry roteia antes dos serviços alheios e usa wrapper regional/App Check,
sem segredo/provedor. Handler/erros de domínio recebem no-store/Vary; rejeições
prévias do SDK são genéricas, sem eco. Preflight fica no middleware Firebase.

bookLoreEditSession captura conta/UID/contexto, força UID no prepare e combina
guard do host. SDK regional usa timeout 130 s e confere contexto antes/depois
de I/O. Troca de conta invalida resposta sem resolver a pendência por fallback.
Sem mudança de armazenamento, Rules ou persistência; host/recuperação e
rollout coordenado ainda necessários. Export novo não autoriza deploy.

## P1 M38c5d — chave da recuperação manual de lore

[ADR 0117](decisions/0117-private-lore-edit-recovery-keys.md): reserva permanente por
UID/writeId/intenção/CAS em bookLoreWriteRecoveries. Raiz/prova/chave de 32
bytes nascem juntos; token e fingerprint fixam identidade. Metadata não
concede chave ou acesso atual. Ausente/recriada nunca é regenerada.

Key exige token original, nascimento/provas e reautorização do livro/ficha
ativos da mesma encarnação. Revisão posterior permite recuperar rascunho
sem alterar seu CAS; deleting/tombstone/exclusão/recriação/dono diferente negam.
Revogação apaga só a chave original e cria prova/fence permanentes.

Três callables metadata, key só HTTP POST text/plain UTF-8 de até 8 KiB
com Auth/App Check/no-store e rewrite /api/book-lore/recovery-key. Rules negam
SDK do namespace. Não modifica livro, clock, créditos ou produtores de bytes.
Chave retida inacessível após origem perdida exige revogação explícita;
coleta pela exclusão do livro não está implementada.

Journal cifrado/retomada/host e ciclo de vida integrado ainda necessários.
Nunca persistir chave no navegador; aguardar IDB oncomplete antes de envio.
Revogar chave não cancela jobs nem autoriza apagar journal incerto.

## P1 M38c5e — journal local cifrado da edição de lore

[ADR 0118](decisions/0118-partitioned-local-lore-edit-journal.md): serviços da
feature lore compõem sessão Auth/App Check, serializer existente, AES-GCM e
IndexedDB writer.book-lore-journal. Heads separados de frames permitem
descoberta por conta sem decrypt. Manifesto com SHA é cifrado; chave importada
não extraível nunca é persistida. Grant fresco antes e ao fim da leitura
revalida a mesma origem sem mudar o CAS congelado.

Partes até 64 KiB, AAD por identidade/seção/geração/índice e transações
confirmadas só no oncomplete. Web Locks/stamp CAS bloqueiam abas antigas.
Prefixos incompletos ficam preservados. Se só o selo final faltou, validar
todos os bytes/schema/intenção e autorização permite concluir o checkpoint
local antes de expor texto. Leitura reconstrói JSON em memória.

Unidade RPC fechada/congelada é protegida antes de envio. Produção e cleanup
são independentes, com slot diagnóstico separado; metadata de get/cancel/
cleanup permite agir sem chave. Confirmação local explícita não é recibo
nativo. Abrir/recuperar não envia, rebaseia, revoga chave ou descarta dados.

Barrel expõe bookLoreJournalSession/listBookLoreJournals e tipos. Nenhum host
existente adota automaticamente a API. Reconstrução completa de checkpoints,
controles de todos os jobs, fechamento antes de coleta e revogação integrada
na exclusão do livro continuam necessários. Rollout/P1/F2-09/V2 abertos.

## P1 M38c5f — checkpoints restauráveis da edição de lore

[ADR 0119](decisions/0119-restorable-manual-lore-edit-checkpoints.md):
BookLoreEditCheckpoint é privado e distinto do snapshot. Root guarda identidade/
intenção/CAS, fases/cancelamento, cursores de inicialização/reserva/produção/
cleanup, inspeção/edição e wires exatos pendentes. ControlsPage fornece até 50
uploads; digest encadeado de metadata liga páginas ao root e recusa mistura
de estados da mesma intenção. Não serializa corpos/relações no root.

restoreBookLoreEditOperation recompõe codecs/manifests do input original
reautorizado, valida progressos/cursores/wire e reconstrói callbacks locais.
Não envia RPC ao restaurar. Append deve coincidir com codec/prova/índice;
ready não adota. Preserva produção incerta durante cleanup, reconciliação
failedCancel/get e terminais. Intenção cancel permite cleanup com signal
abortado, mantendo guards. Sessão Auth oferece restore com UID capturado.

Checkpoint contém bytes privados e não deve ser persistido em claro.
Persistência atômica/cifrada de root/páginas, metadata para cleanup sem chave
e composição reserva/journal/host ainda não estão ligadas. Digest requer
passagem linear por controles; codecs são recompostos do input em memória.
Fechamento/coleta/ciclo de vida e rollout/P1/F2-09/V2 continuam abertos.

## P1 M38c5g — persistência cifrada dos checkpoints

[ADR 0120](decisions/0120-encrypted-persistence-of-lore-checkpoints.md):
captureBookLoreEditCheckpoint reúne root/páginas/acks em bundle privado.
Journal oferece writeCheckpoint/readCheckpoint/restoreCheckpointOperation e
advanceCheckpointCleanup. Seção checkpoint usa JSON de 64 KiB/AES-GCM/AAD e
manifesto privado; banco/stores/versão permanecem iguais.

Header opcional active/pending/garbage preserva geração anterior até
oncomplete final. Troca e acks explícitos são atômicos; prefixo divergente é
preservado. Staging completa pode ser verificada/promovida após falha final.
Coleta só de geração substituída, até 50 frames por transação/cursor/CAS,
sem chave. Não é cleanup dos jobs nativos ou exclusão de draft/pedido.

Leitura usa grants frescos; restore recompõe do input protegido, reautoriza,
confere stamp/contexto e aplica cancel monotônico. Não envia ou adota ao
abrir. Captura e digest percorrem metadata; leitura reconstrói JSON em memória.
Persistência automática antes/depois de RPC, mapa metadata completo sem chave,
reserva/host/ciclo de vida e rollout/P1/F2-09/V2 continuam pendentes.

## P1 M38c5h — controles e cancelamento sem chave

[ADR 0121](decisions/0121-keyless-cleanup-of-manual-lore-edits.md):
captureBookLoreControlMap captura identidade/intenção, páginas de IDs/hashes
e pai conhecido/incerto. Namespace controls no store existente separa records
metadata de ciphertext. Página/lookups/written/ready confirmam juntos em
oncomplete/CAS; sem upgrade do banco ou prosa/segredos no mapa.

Com mapa presente, produção exige ready/idle/cancel falso, IDs/hashes e
dependências de pai/slot conhecidas. Journal registra pai antes de start.
writeControlMap/registerControlEdit congelam entrada antes de await; legado
sem mapa não ganha promessa automática de recuperação.

advanceControlCleanup mantém pedido/progresso metadata próprios, um RPC por
passo, sem lock durante rede/getKey/decrypt/signal. Consulta pai, trata ausência
como necessidade de fence, reconcilia cancel/get e reconhece adoção própria.
Pendências legadas conhecidas são repetidas sem sobrescrita, com ACK atômico;
desconhecidas ficam preservadas. Cursor/lookup evitam varredura por avanço.

Sessão Auth confere UID do journal e guards antes/depois de I/O. Worker não
remove draft/checkpoint/chave/recibos, nem repete produtor para cancelar.
Composição automática de write-ahead/acks, reserva/host/ciclo de vida e demais
integrações/rollout de P1/F2-09/V2 continuam necessárias.

## P1 M38c5i — coordenador persistido da edição de lore

[ADR 0122](decisions/0122-persisted-coordination-of-manual-lore-edits.md):
adaptador salva mapa/draft/baseline antes de produção e checkpoint do wire
antes de cada RPC. Ponte metadata de resultado validado reconstrói o post-save
sem repetir RPC; swap/ACK/receipt/remoção são atômicos. Prefixos e active
idempotente são verificados antes de salvo/coleta. Dívida local bloqueia avanço.
Cancel usa worker sem chave; sessão Auth vincula journal reservado.
Bootstrap/host visual e ciclo de vida integrado seguem pendentes; P1 aberto.

## P1 M38c5j — reserva descobrível e encerramento da recuperação

[ADR 0123](decisions/0123-discoverable-lore-recovery-reservations.md):
store preparations no IDB v2 conserva ticket sem prosa antes de reserve,
com identidade/hash/ACK e lanes de cancel/liberação independentes.
Upgrade aditivo conserva ciphertext v1; downgrade é recusado.
Sessão Auth compõe reserva/journal/controller; cold resume não inventa draft
quando a primeira cópia ainda não confirmou. Cancel conserva chave/draft;
releaseRecovery registra intenção explícita e fecha jobs antes de revogar.
Nenhuma purga local ou ativação da UI por este incremento; P1 segue aberto.

## P1 M38c5k — host literal e descarte local

[ADR 0124](decisions/0124-literal-lore-editor-and-local-discard.md):
diálogo e lista compõem sessão/captura bruta, campos tocados, revisão/aplicação
explícita e recuperação por conta/escopo. Actor SDK fenceia a UI; metadata do
perfil não reinicia draft. Router e beforeunload guardam saída.
Purga após fechamento/revogação remove até 50 records do UID/writeId e fenceia
head no mesmo commit; tombstone impede recriação e conclusão é conferida no IDB.
Componentes exportados, sem entrada produtora ativada até writers/Rules/
drenagem. P1 e demais gates continuam abertos.

## P1 M38c5l — barreira dos escritores legados de lore

[ADR 0125](decisions/0125-legacy-lore-writer-barrier.md): hasLoreResources é
marcador permanente controlado pelo servidor. Rules/serviço cliente e aplicação
Admin legada recusam mutações locais antigas após true; valor presente inválido
falha fechado. false/ausência preservam CRUD inline. Recibos aplicados e rota
nativa preparada continuam possíveis, sem repetir alteração/débito.
Não implantar a barreira isolada nem ativar o editor antes dos caminhos nativos
e da drenagem coordenada. Proteção intermediária não encerra escrita/P1/V2.

## P1 M38c5m — criação manual e origem da recuperação

[ADR 0126](decisions/0126-manual-lore-creation-recovery-origin.md):
bookLoreEdit inclui quatro operações do criador sob IDs lore-creation.
Intenção de recuperação pode vincular reserva original em vez de cabeça:
autoriza livro/reserva antes da criação e exige cabeça nativa original após
adoção. Cancel conserva chave existente, sem autorizar produção nova.
Hash antigo e DTO metadata permanecem compatíveis; chave só por HTTP protegido.
Lista manual tem 22 métodos; journal de edição mantém explicitamente os 18
anteriores. Cliente de criação durável/host e rollout continuam pendentes.

## P1 M38c5n — coordenador cliente da criação nativa

[ADR 0127](decisions/0127-client-native-lore-creation-coordinator.md):
coordenador próprio reutiliza schema/codec/progressos, deriva IDs antes de RPC
e dirige reserva/uploads/composição/apply explícito. Cleanup da reserva é
independente do produtor; wire incerto permanece exato e adoção é correlacionada
ao evento próprio. Snapshot é limitado; checkpoint privado e controles até 50
permitem reconstrução verificada sem RPC. Sessão Auth captura UID/actor/host.
Persistência de criação/host e demais portões seguem pendentes; journal de
edição permanece separado e conflito não é prova de fechamento para purge.

## P1 M38c5o — preparação protegida da criação

[ADR 0128](decisions/0128-protected-lore-creation-preparation.md):
IndexedDB v3 adiciona creationTickets/creationFrames sem reescrever journals
de edição. Ticket metadata antecede a reserva; hash é fixado após hashing do
input, preservando cancel independente durante essa etapa. CAS/stamp e Web
Locks curtos fenceiam instâncias anteriores; confirmação depende de oncomplete.
Draft imutável de 64 KiB tem digest cifrado, prefixo conferido e autorização
fresca antes/depois de ler. Provider HTTP Auth/App Check é compartilhado.

Sessão oferece creationPreparation/resumeCreationPreparation/creationPreparations.
Cancel conserva cópia/chave; release fecha criador antes da chave e descarte
confere ausência com deletes/contador/tombstone atômicos até 50. Conflito de
adoção preserva dados e não concede fechamento. Bootstrap não produz;
checkpoint write-ahead integrado e host precedem advance/apply pela UI.
Lifecycle/consumidores/backup/rollout e validate de P1 continuam pendentes.

## P1 M38c5p — armazenamento do checkpoint da criação

[ADR 0129](decisions/0129-protected-lore-creation-checkpoints.md):
preparação oferece checkpointJournal pelo mesmo handle Auth/posse. Ticket v3
ganha campo opcional active/pending/garbage/outcome/receipt e frames próprios
na seção checkpoint; formatos/allowlist da edição continuam preservados.

Bundle privado contém checkpoint/wire e páginas até 50, conferidos pelo core
puro com input original. AES-GCM/digest/prefixo e grants frescos nas duas pontas
precedem swap atômico e confirmação. Ponte sem prosa liga resultado validado à
base/pedido; não é grant ou prova nativa de adoção. Coleta verifica sucessora
e geração, removendo até 50 com cursor/header atômicos. Purge fixa inventário.

Recover não envia RPC de edição; staging parcial mantém active/dívida.
Ainda compor executor advance/apply, cancel/adoção própria e host. Serviços/
harness não equivalem a fluxo visual ativado. Lifecycle/consumidores/backup/
rollout e validate de P1 continuam pendentes.

## P1 M38c5q — executor durável da criação

[ADR 0130](decisions/0130-durable-lore-creation-executor.md):
createLore/resumeLoreCreation na sessão Auth compõem preparação/checkpoint/core
no mesmo handle. Proxy confirma wire antes da RPC e ponte/checkpoint depois;
dívida after só confirma a gravação, bloqueando outro produtor. Inicialização
reconcilia metadata e cópia sem enviar bytes/apply automaticamente.

OwnApply opcional nasce do wire no checkpoint privado validado antes do envio.
Prova própria confere pai e edição por hash/token/revisão/operação/geração,
timestamp e clock originais. Queries não usam chave, inclusive quando cancel
perde para apply. CreationJobsClosed distingue cancel de adoção própria;
release/purge removem só recuperação, preservando cabeça e geração adotadas.
Descarte completo reaberto reconfere ausência antes de copyDiscarded.

API durável está pronta para composição visual, sem ativar compêndio. Host e
exclusão nativa do cliente, lifecycle, demais writers/consumidores/backup/
rollout e validate de P1 continuam pendentes.

## P1 M38c5r — host da criação protegida

[ADR 0131](decisions/0131-protected-lore-creation-ui.md):
BookLoreCreationEditor/CreationRecoveries são exportados por lore, compondo a
API durável Auth. Campos recebem somente data, sem contexto/token fictícios;
criação começa privada, congela no preparar e exige criar explícito.
CreationTicket confere UID/livro/writeId antes da retomada; draft só por leitura
autorizada. Lista pagina metadata sem chave e não confunde cancel solicitado
com cancel confirmado.

Host protege actor/epoch/navegação, cancela/descarta sem esperar produtor/chave,
restaura foco e notifica evento próprio uma vez. Reusa kit/CSS/temas existentes.
Não monta a entrada no compêndio: exclusão nativa do cliente e composição
coordenada seguem próximas. Lifecycle/consumidores/backup/rollout/validate
de P1 e demais fases/gates continuam abertos.

## P1 M38c5s — transporte autenticado da retirada

[ADR 0132](decisions/0132-authenticated-lore-removal-transport.md):
bookLoreRemoval usa wrapper regional Auth/App Check/no-store. Sete métodos
fechados encaminham inspeção/retirada somente por IDs lore-removal-source e
lore-removal. Parsers nativos conferem DTO/CAS/origem; tombstone/clock/privacidade
permanecem transacionais. Edição/journal preservam 22/18 métodos.

ReadClient.metadata lê header validado sem prosa. Sessão interna congela input,
captura actor/host e não faz retry/fallback. Inspeção conserva a ficha; start
retira irreversivelmente. Journal/executor recuperável e confirmação visual
precedem compêndio. Lifecycle/consumidores/backup/rollout/validate de P1 e
demais fases/gates continuam abertos.

## P1 M38c5t — retirada recuperável de lore

[ADR 0133](decisions/0133-recoverable-lore-removal.md):
RemovalService oferece createRemoval/resumeRemoval/recoveries. Journal próprio
writer.book-lore-removals v1 guarda metadata fechada, com CAS/Web Locks curtos
e oncomplete antes de RPC. Não altera os stores cifrados v3 de edição/criação.

Advance prepara sem retirar; apply explícito grava a intenção original.
Start incerto só consulta em advance, sem reenvio automático. Dívida local
só é gravada no retry; cancel independente fecha inspeção e consulta retirada
original, preservando sucesso aceito. ACK/RPC tardios não retomam produção.
Handoff consulta metadata e conclusão fria exige nova verificação servidor.

API interna pronta para host de confirmação/retomada, ainda fora do compêndio.
Lifecycle/consumidores/backup/rollout/validate de P1 e demais gates abertos.

## P1 M38c5u — interface da retirada recuperável

[ADR 0134](decisions/0134-recoverable-lore-removal-ui.md):
BookLoreRemovalDialog/RemovalRecoveries são exportados. Origem C1 fixa e
metadata revalidada antes da confirmação; verificar/salvar dívida não reaplica
start. Handle fresco resolve cancelamento sem esperar RPC antiga e o driver
antigo perde a UI. Callback único exige prova própria e ACK local confirmado.

Lista pagina metadata por conta/livro sem prosa. UI distingue registro local
de resultado remoto, preserva perfil e fenceia outro actor. Kit/temas/foco e
nomes literais longos são mantidos. Sem montagem no compêndio: adaptar também
ações em lote com captura/revisão próprias antes da composição final.
Lifecycle/consumidores/backup/rollout/validate de P1 e demais gates abertos.

## P1 M38c5v — retirada conjunta de lore

[ADR 0135](decisions/0135-atomic-lore-removal-batches.md):
prepareBookLoreRemovalStart/Batch compartilham leituras/validações e commit.
Uma unidade interna de até 50 preserva sourceTokens/inspeções e retira todas as
cabeças com um timestamp/clock/epoch; falha impede todos os efeitos.
Comprovante/prova privados abaixo do primeiro job compartilham nascimento
nativo com todos os contextos. Histórico fixa manifesto/frame/jobToken
observado, sem recompor grupo por recibos individuais.

Singular/cleanup/handoff/formatos dos filhos permanecem. Não há callable nem
UI de lote. Coordenador completo deve preservar seleção e origem ao dividir
unidades por orçamento real; 50 não é limite de autoria. Transporte,
recuperação, compêndio, lifecycle/consumidores/backup/rollout/validate de P1 e
demais fases/gates permanecem abertos.

## P1 M38c5w — origem independente por ficha

[ADR 0136](decisions/0136-independent-book-lore-source-tokens.md):
list/get oferecem tokenVersion 2 explicitamente; padrão v1 e seu wire/hash
permanecem. V2 fixa UID/livro/nascimento do livro/ID e createTime/updateTime
da ficha, permitindo manter a origem intacta após mutação de outra ficha.
Todas as unidades reautorizam livro/ficha/provas. Token esperado é comparado
literalmente, nunca renegociado nem promovido de v1.

listToken mantém clock global, cursor fixa versão e lista completa conserva
checagem inicial/final. ReadClient/ReadService expõem opção sem migrar
consumidores, journals, wire de pedidos ou formatos cifrados. Inspeção/uploads/
inventário/reserva de recuperação aceitam ambas as origens exatas. A versão
do token é independente da versão de armazenamento. Sequência de operações
individuais não comprova grupo atômico; preservar provas ADR 0110/0135.

Coordenador durável de seleção/UI/compêndio, lifecycle/consumidores/backup/
rollout/validate de P1 e demais fases/gates continuam abertos.
