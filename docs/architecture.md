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
