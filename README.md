# Writer Assistant

Estúdio de escrita em React/Vite/Firebase, com lore contextual, assistência de IA e publicação interativa.

## Objetivo

Centralizar o planejamento de universo narrativo (personagens, locais, conceitos e relações) e a escrita em um editor de texto rico com detecção automática de termos. O projeto oferece assistência de IA contextualizada com controle de créditos, exportação em múltiplos formatos (PDF, DOCX, Markdown) e publicação online para leitores em uma interface interativa.

A evolução aprovada é o **Writer V2**, com autores e mestres igualmente prioritários.
O Estúdio (`/studio`) reúne livros existentes e a criação privada de aventuras e
campanhas independentes, com universo opcional, filtros e paginação. A navegação
oferece Universos, Estúdio, Publicações, Catálogo e Biblioteca; os três últimos
ainda exibem disponibilidade futura. A biblioteca de imagens mantém `/library`.
Livros e aventuras recebem planejamento e texto próprio por cena no incremento
F2-02, com arquivo/restauração, composição de capítulos/partes e backup privado v5.
O [contrato e estado dos gates](docs/tasks/writer-v2/execucao/08-planejamento-de-cenas.md)
registra a validação deste incremento; comércio e sessões conservam tarefas próprias.
F2-03 acrescenta arcos, marcos e cronologia de ordem manual com datas textuais livres,
vínculos explícitos a cenas/entidades e backup privado v6. A interface fica nas abas
dos livros e aventuras. Este incremento passou nos gates locais e no CI em
`3358c75`; acompanhe a evidência no
[contrato de arcos e cronologia](docs/tasks/writer-v2/execucao/09-arcos-e-cronologia.md).
F2-04 acrescenta estado editorial privado, meta total do manuscrito, checklist de
preparação, fuso por usuário e retomada autorizada. A contagem acompanha o texto
atual e possui verificação retomável para projetos anteriores. Os gates locais e
90 jornadas Chromium passaram; a correção `16e71f6` também passou na CI. Veja o
[contrato de progresso e retomada](docs/tasks/writer-v2/execucao/10-estados-metas-e-retomada.md).
F2-05 acrescenta versões manuais do texto e cópia anterior a cada restauração,
com comparação, exclusão explícita e recuperação de pedidos sem resposta. O
histórico é privado e ainda não acompanha o backup v6. Os resultados de validação
ficam no [contrato de histórico](docs/tasks/writer-v2/execucao/11-historico-e-restauracao.md).
F2-06 está concluído tecnicamente em 624c912, incluindo a correção de foco/refazer
confirmada na CI. Aventuras reúnem blocos com texto, tipo, audiência e
ilustração próprios na mesma cena. O principal antigo permanece íntegro; novo e
legado sem classificação são privados. As prévias Original completo, Mestre e
Jogadores continuam restritas ao criador, com filtro e mídia no servidor, sem
compartilhamento automático. Veja [blocos e prévias](docs/tasks/writer-v2/execucao/12-aventuras-e-blocos.md).
F2-07 está concluído tecnicamente em `0006a66`: a gestão de campanhas permite editar dados, escolher
estado e trocar o universo organizacional, preservando o checklist e a procedência.
O incremento de captura acrescenta preparação retomável de aventura própria,
base congelada completa e somente lore explicitamente referenciado, com leitura
privada de material, narrativa, arquivo e ilustrações. A captura está concluída
tecnicamente em f97455d, com CI verde; veja a [evidência](docs/entregas/2026-10-15-writer-v2-captura-de-aventura.md).
Notas próprias acrescentam título/texto simples particulares, com recuperação de
pedidos sem resposta e isolamento entre mesas/abas. Continuam acessíveis quando a
origem da base fica indisponível; não copiam lore automaticamente. C1 está concluído
tecnicamente em bda5e70, com CI verde; veja a [entrega](docs/entregas/2026-10-15-writer-v2-notas-da-campanha.md).
Variantes C2 permitem adaptar fichas inteiras somente na mesa, retirar/restaurar e
descartar alterações locais, com recuperação cifrada após conferir a autorização
atual. C2 está concluído tecnicamente em fe10b15, com CI e regras verdes.
Veja a [entrega de variantes](docs/entregas/2026-10-17-writer-v2-variantes-de-lore.md).
O incremento C3A prepara e compara uma candidata completa, com retomada e
descarte, preservando base ativa, variantes e notas. Está concluído tecnicamente
em fe10b15, com CI e regras verdes;
veja o [contrato de comparação](docs/tasks/writer-v2/execucao/18-comparacao-de-bases-da-campanha.md).
Veja também a
[entrega C3A](docs/entregas/2026-10-17-writer-v2-comparacao-de-bases.md).
Adoção explícita C3B está concluída tecnicamente em `947cfc3`, com CI e regras verdes. Permite conservar fichas legadas
autorizadas e confirmar base e variantes juntas, preservando notas próprias e a
recuperação dos pedidos anteriores. Veja o
[contrato de adoção](docs/tasks/writer-v2/execucao/19-adocao-explicita-de-base-da-campanha.md).
Os resultados estão na [entrega C3B](docs/entregas/2026-10-18-writer-v2-adocao-de-bases.md).
Exclusão integral C4 está concluída tecnicamente em `0006a66`, com CI/regras verdes:
revoga o acesso antes da limpeza retomável e preserva original, biblioteca e
outras mesas. Controles antigos só são encerrados por confirmação própria.
Veja a [entrega C4](docs/entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md) e o
[contrato de campanhas](docs/tasks/writer-v2/execucao/14-campanhas-e-variantes.md).
F2-08 S1 está concluído tecnicamente em `c95253a`, com CI e regras verdes: sessões privadas
com título, preparação própria, data civil opcional, estado e ordem manual.
Recuperação confirma pedidos antigos sem adotar texto posterior; atualizar a base
preserva rascunhos não enviados. Referências, pistas e missões ficam em S2/S3.
Veja o [contrato S1](docs/tasks/writer-v2/execucao/21-sessoes-privadas-da-campanha.md)
e a [entrega](docs/entregas/2026-10-18-writer-v2-sessoes-privadas.md).
F2-08 S2A está concluído tecnicamente em `d9b7988`, com CI e regras verdes:
sessões vinculam fichas efetivas e legadas autorizadas, consultam material e removem
vínculos indisponíveis sem alterar a preparação. Recuperação e cancelamento explícito
permanecem acessíveis após exclusão da sessão; C4 v3 inclui esses recursos mantendo
jobs v1/v2. Cenas/blocos e pistas/missões têm os incrementos S2B/S3 descritos abaixo. Veja a
[entrega S2A](docs/entregas/2026-10-18-writer-v2-referencias-de-lore-da-sessao.md).
F2-08 S2B está concluído tecnicamente em `56cbb06`, com CI e regras verdes: cenas vinculadas
permitem consultar planejamento, principal, adicionais, arquivo e ilustrações sem
copiar conteúdo para a preparação. Cena ausente após adoção fica indisponível.
Veja a [entrega S2B](docs/entregas/2026-10-18-writer-v2-cenas-completas-da-sessao.md).
S3 acrescenta pistas e missões próprias da campanha, com estados privados,
pendências, ordem e vínculos reutilizáveis entre sessões. Excluir sessão conserva
itens e textos. S3 está concluído tecnicamente em `e924890`, com CI geral e regras verdes; veja o [contrato S3](docs/tasks/writer-v2/execucao/24-pistas-missoes-e-pendencias.md).
F2-09 L acrescenta lore privado de aventuras, menções e referências nas campanhas,
concluído tecnicamente em `087bced`. A importação revisada I permite escolher Livro
ou Nova aventura no Estúdio, revisar seções e criar uma aventura privada somente
após ativação integral. A cópia protegida da revisão confirmada permite retomar
no mesmo dispositivo, sem guardar o PDF. I concluiu tecnicamente em `ffc01d9`, com CI/regras verdes; IA e
portabilidade permanecem nas próximas verticais. Veja o
[plano de importação](docs/tasks/writer-v2/execucao/27-importacao-revisada-de-aventura.md).
F2-09 A está implementado e validado localmente: chat privado de cenas de livro, principal de
aventura e blocos adicionais, contexto autorizado e inspecionável, persona da
aventura com ajustes por cena e aplicação atômica. Perguntas próprias permanecem
quando uma resposta depende de lore indisponível. A CI do novo head está pendente; veja a
[entrega A](docs/entregas/2026-10-21-writer-v2-chat-autorizado-de-cenas.md) e o [plano A](docs/tasks/writer-v2/execucao/29-contexto-autorizado-e-ia-de-cenas.md).
Distribuição e vendas por criadores convidados serão implementadas nos próximos
incrementos. Veja [escopo e execução](docs/tasks/writer-v2/README.md)
e [timeline reestimada](docs/tasks/writer-v2/timeline.md).

## Quando usar

Indicado para:

- Autores de ficção que desejam manter a consistência de seus personagens, locais e conceitos ao longo dos capítulos.
- Escritores que buscam assistência de escrita criativa por IA com autocomplete preditivo e sugestões de estilo.
- Criação e organização de livros com múltiplos capítulos e contagem de palavras.
- Publicação de histórias online em página pública interativa com balões informativos de lore.
- Exportação rápida de manuscritos para Markdown, DOCX e PDF.

## Quando NÃO usar

- Edição colaborativa simultânea multiusuário (estilo Google Docs com cursores múltiplos ao vivo).
- Marketplace aberto a qualquer vendedor, VTT e combate automatizado na primeira versão do ecossistema.
- Geração automática e desassistida de livros inteiros por IA.
- Diagramação profissional de pré-impressão gráfica com controle milimétrico (InDesign).

## Pré-requisitos

- Node.js 22 (o arquivo `.nvmrc` indica a versão; com `nvm`, rode `nvm use`)
- npm 10.6.0 (a versão exata declarada em `packageManager`)
- git

## Instalação

```bash
npm install
npm ci --prefix functions
```

## Execução

```bash
npm run dev
```

O Vite mostra no terminal o endereço local (algo como `http://localhost:5173`).

## Validação

Durante ajustes, execute os checks afetados. Ao fechar grandes blocos, rode:

```bash
npm run validate
```

Esse comando executa, em sequência: verificação de skills, conformidade arquitetural, validação de documentação, regras do styleguide, checagem de formatação com Prettier, lint com ESLint, suíte de testes com cobertura e build de produção com smoke test do bundle gerado.

## Verificação automática

| Onde                | O que roda                              |
| ------------------- | --------------------------------------- |
| `pre-commit`        | `lint-staged` nos arquivos alterados    |
| `commit-msg`        | Convenção da mensagem de commit         |
| `pre-push`          | `typecheck` e `test:unit`               |
| CI (GitHub Actions) | `validate`, auditoria e E2E no Chromium |

O CI está configurado em `.github/workflows/ci.yml`. Durante o desenvolvimento,
mantenha commits locais e ignore a CI remota, conforme
[processo vigente](docs/development-process.md).

## Comandos

| Comando                      | O que faz                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                | Sobe o servidor de desenvolvimento com recarga automática        |
| `npm run build`              | Gera a versão de produção                                        |
| `npm run lint`               | Verifica problemas de código com ESLint                          |
| `npm run check:architecture` | Impede imports que atravessam as fronteiras das features         |
| `npm run check:docs`         | Valida links, comandos e referências da documentação             |
| `npm run check:toolchain`    | Confere a versão do npm declarada pelo projeto                   |
| `npm run format`             | Formata os arquivos com Prettier                                 |
| `npm run format:check`       | Confere se os arquivos estão formatados                          |
| `npm run typecheck`          | Verifica os tipos do TypeScript                                  |
| `npm run test`               | Roda a suíte de testes com limites de cobertura                  |
| `npm run test:unit`          | Roda apenas os testes Vitest, sem cobertura                      |
| `npm run test:coverage`      | Roda os testes Vitest aplicando os limites de cobertura          |
| `npm run test:setup`         | Testa o setup e as regras de arquitetura em projetos temporários |
| `npm run test:e2e`           | Executa o fluxo crítico no Chromium com Playwright               |
| `npm run test:e2e:update`    | Regera as imagens de referência do styleguide                    |
| `npm run test:rules`         | Executar regras e contratos no emulador Firestore                |
| `npm run test:media`         | Executar captura de mídia com Firestore e Storage locais         |
| `npm run test:watch`         | Roda os testes em modo contínuo                                  |
| `npm run setup`              | Personaliza identificadores e opções do projeto                  |
| `npm run update:template`    | Aplica migrações conhecidas do template                          |
| `npm run generate:feature`   | Gera a estrutura inicial de uma nova feature                     |
| `npm run smoke:build`        | Serve e verifica o conteúdo gerado em `dist/`                    |
| `npm run sync:skills`        | Sincroniza as definições de skills para os agentes               |
| `npm run check:skills`       | Verifica se as cópias das skills estão sincronizadas             |
| `npm run check:styleguide`   | Avisa sobre desvios dos tokens e componentes visuais             |
| `npm run validate`           | Roda todos os portões de qualidade em sequência                  |

## Estrutura resumida

```
src/
├── app/          # composição geral (providers, rotas, layout) — sem regra de negócio
├── features/     # capacidades do produto em pastas isoladas (auth, books, lore, editor, ai-assistant)
├── shared/       # utilitários reutilizáveis e neutros (config, hooks, lib, types)
├── test/         # setup.ts e render.tsx
└── main.tsx      # ponto de entrada da aplicação
docs/             # documentação técnica e de produto (prd.md, architecture.md, etc.)
```

Detalhes em [docs/architecture.md](docs/architecture.md) e requisitos em [docs/prd.md](docs/prd.md).

## Segurança e testes de regras

Além de `npm run validate` e dos testes Chromium, `npm run test:rules` executa
as regras reais no emulador local do Firestore, com Java 21. O processo usa
apenas o projeto fictício `demo-writer-rules`, nunca dados de produção.

`npm run test:media` verifica bytes/permissões da capa em Firestore e Storage
locais. Exige também Firebase CLI global; usa `emulators:exec`, portas livres e
projeto `demo-writer-backup-cover`. Se o CLI não estiver no PATH, configure
`WRITER_FIREBASE_CLI` com o caminho de `lib/bin/firebase.js`. Veja os
[checks e avisos conhecidos de mídia](docs/testing.md).

O novo caminho de backup P1 já tem captura de estrutura, histórico, cenas,
narrativa, lore, personas, universo, rascunho e bytes de capa, compostos em fluxo
com envelope, validação de conteúdo, leitura JSON v1–v6 e gravação temporária em
arquivo. O servidor já reserva um novo ID, recebe partes privadas e permite
cancelar/limpar a transferência. A integridade dos bytes é conferida em lotes
retomáveis no servidor. Os leitores novo e legado compartilham um núcleo
semântico com checkpoints. O servidor valida o contêiner novo em etapas, com
índice privado e limpeza limitada. O scanner JSON legado também já é retomável,
compartilhando a gramática estrita com o leitor existente. Catálogo e normalização
também avançam por checkpoints e permitem reler registros sem gravar índices.
O job servidor também valida os JSON v1–v6, com checkpoint privado versionado,
procedência e limpeza compatível. Preparação/materialização, ativação e interface
de restauração continuam em implementação; veja
[o plano P1](docs/tasks/writer-v2/execucao/31-portabilidade-de-livros.md).

## Como usar agentes

As regras que os agentes devem seguir ficam em dois arquivos na raiz:

- `AGENTS.md` — regras gerais válidas para qualquer agente
- `CLAUDE.md` — instruções específicas para o Claude Code

Veja [docs/agents.md](docs/agents.md) para a lista de skills disponíveis e orientações de uso.

## Como criar uma feature

1. Peça ao agente um plano: "Use a skill plan-feature para planejar a funcionalidade X".
2. Revise o plano apresentado.
3. Peça a implementação: "Use a skill implement-feature para executar o plano".
4. Gere a base se necessário com `npm run generate:feature -- --name="minha-feature"`.
5. Rode `npm run validate`.
6. Peça o registro da entrega: "Use a skill document-delivery para registrar a entrega". O histórico fica em [docs/entregas](docs/entregas/README.md).

Regras de arquitetura em [docs/architecture.md](docs/architecture.md); regras visuais em [docs/styleguide.md](docs/styleguide.md).

## Como registrar uma decisão

Decisões relevantes de arquitetura ou tecnologia viram um ADR (Architecture Decision Record) em `docs/decisions/`. Use o formato do primeiro registro, [docs/decisions/0001-initial-architecture.md](docs/decisions/0001-initial-architecture.md), como modelo.

## Universos compartilhados

A opção **Universos** no header permite gerenciar universos e reutilizar
fichas entre livros, mantendo o lore local separado. Criação e edição de lore
usam seções opcionais com salvamento direto. A liberação depende das functions e regras correspondentes; veja
[universos e lore compartilhado](docs/shared-lore.md).

## Limitações conhecidas

- O Estúdio exige implantação conjunta das seis callables, regras e índices antes
  de uso em produção. A preparação de livros legados corrige somente datas/estado,
  em lotes retomáveis. Cenas acrescentam callables, controles e índices próprios;
  a implantação conjunta ainda exige autorização. Variantes, sessões e assistência
  de IA especializada de cena permanecem nas próximas tarefas. Veja
  [contrato do Estúdio](docs/tasks/writer-v2/execucao/07-estudio-projetos.md) e
  [cenas](docs/tasks/writer-v2/execucao/08-planejamento-de-cenas.md).

- O [chat do Assistente IA no capítulo](docs/chapter-chat.md) tem histórico privado,
  comandos e contexto por seleção/cursor/viewport. Conversa não debita; a primeira
  aplicação de uma sugestão da plataforma custa 1 crédito. Exige callable, regras
  e limpeza implantadas; BYOK conserva as chaves no navegador.

- A [criação assistida por conversa](docs/assisted-book-creation.md) entrega metadados,
  capa e lore local privado. O pacote textual custa 2 créditos e a capa 5, no
  aceite final. Exige implantação da callable, limpeza, regras e índice.

- A criação permite começar com título e gênero, com sinopse/capa opcionais por IA (1 e 5 créditos no aceite). A geração exige configurar e implantar backend/Storage; veja [criação de livros](docs/book-creation.md). Criação manual funciona sem IA.

- A autenticação e a persistência em nuvem dependem da configuração das credenciais do Firebase.
- O autocomplete de IA preditivo depende de conexão ativa e saldo de créditos (ou chave de API BYOK informada).
- A exportação em PDF utiliza um documento isolado e o diálogo de impressão do navegador (opção Salvar como PDF).
- A publicação é uma versão explícita, separada do rascunho. Alterações só aparecem após atualizar a publicação; tornar lore público privado retira a versão pública imediatamente. As regras precisam ser implantadas junto da versão antes de uso real. Veja [segurança da publicação](docs/publication-security.md).
- Livros antigos com status publicado precisam de republicação explícita com nome de autor público. Nenhuma migração/publicação automática é executada.
- A concessão mensal Premium exige um registro de direito criado por administrador em `creditEntitlements`, separado do perfil legado. Perfis antigos precisam de revisão pelo operador; a aplicação não cria nem reconcilia direitos.
- Créditos de IA e compras de obras são sistemas separados. A loja V2 está no escopo aprovado, mas checkout, direitos adquiridos e repasses ainda não estão implementados; Stripe Payments configurado não comprova Connect habilitado.
- O cache persistente depende de IndexedDB; rascunhos locais distintos exigem uma escolha de recuperação. Em dispositivos compartilhados, dados locais devem ser tratados como privados.

### Implantação preparada

Os workflows de Hosting e de atualização manual de regras/índices estão
preparados com gates desabilitados por padrão. A ativação exige destino verificado
e autorização separada de acesso. Consulte [implantação](docs/deployment.md).

P1 M20 acrescenta o [leitor interno de itens validados](docs/tasks/writer-v2/execucao/53-leitura-autenticada-dos-itens-validados.md):
novo/legado, JSON por item e histórico/rascunho/capa por fluxo, com prova para a
transação consumidora. Ainda não há restauração final. O contrato confirmado
mantém o texto salvo no manuscrito e recupera rascunho diferente como versão separada.

P1 M21 prepara [IDs e referências da cópia restaurada](docs/tasks/writer-v2/execucao/54-remapeamento-da-identidade-restaurada.md),
com perfis próprios e relações de lore em páginas verificadas. A leitura original
permanece disponível; esse marco ainda não grava ou ativa a cópia.

P1 M22 inicia a [preparação nativa de atos, capítulos e ledger](docs/tasks/writer-v2/execucao/55-preparacao-nativa-da-estrutura.md),
com journal/recibo atômicos e limpeza v4, mantendo raiz ausente. Demais recursos,
campos grandes e fluxo completo de restauração continuam pendentes.

P1 M23 prepara [texto grande de capítulo](docs/tasks/writer-v2/execucao/56-texto-grande-na-preparacao.md)
em corpo imutável e partes, com leitor interno e limpeza v5. Preserva 8 MiB
lógicos, sem tornar a cópia visível. Integração dos consumidores e demais campos
grandes continuam obrigatórias antes de habilitar a restauração.

P1 M24 integra [leitura lógica de capítulos](docs/tasks/writer-v2/execucao/57-leitura-logica-dos-capitulos.md)
ao cliente, histórico, contagem, análise e backup, com partes autorizadas e
conferência integral. Escrita/pins/coleta, demais recursos e ativação da cópia
continuam nas próximas tarefas; não há UI nova de restauração nem deploy.

P1 M25 integra [escrita e versões dos capítulos grandes](docs/tasks/writer-v2/execucao/58-escrita-e-versoes-dos-capitulos-grandes.md):
texto lógico com CAS e histórico por referência, incluindo versão anterior à
restauração e preservação após excluir capítulo. Coleta física, exclusão integral,
conversão/chat e demais recursos continuam obrigatórios antes de ativar a cópia.

P1 M26 acrescenta [coleta física e exclusão dos corpos](docs/tasks/writer-v2/execucao/59-coleta-e-exclusao-dos-corpos.md):
worker preparado para gerações sem referências e inventário v2 de exclusão do
livro, com retomada de jobs antigos. Não houve deploy. Conversão/chat e fluxo
completo de restauração continuam nas próximas tarefas.

P1 M27 integra [chat, conversão e remoção de capítulos](docs/tasks/writer-v2/execucao/60-chat-e-conversao-com-texto-logico.md)
ao texto lógico, preservando versões e débito atômico. Editor usa somente cenas
na composição; backup conserva campo congelado externo. Limites de cena/chat
continuam os aprovados. Demais recursos e ativação da restauração seguem pendentes.

P1 M28 prepara [lore próprio e relações](docs/tasks/writer-v2/execucao/61-materializacao-do-lore-proprio.md)
com retomada paginada e inventário v6. A varredura aceita lore intercalado e
preserva o cursor dos recursos ainda pendentes. Fichas maiores que o limite
nativo continuam exigindo representação adequada antes da ativação; nenhuma
fonte é truncada. P1/F2-09 permanecem abertos, sem nova UI ou deploy.

P1 M29 prepara [cenas e narrativa](docs/tasks/writer-v2/execucao/62-cenas-e-narrativa-na-preparacao.md):
corpos, planos, fontes, referências/índices, arcos, marcos e cronologia. Inventário
v7 remove filhos antes dos pais, inclusive após interrupção anterior ao cabeçalho.
A cópia continua sem raiz; reconciliação de contagens e fluxo final seguem pendentes.

P1 M30 acrescenta [reconciliação dos recursos](docs/tasks/writer-v2/execucao/63-reconciliacao-dos-recursos.md):
palavras pelo ledger, contagens de agrupadores e vínculos únicos, com índice
estrutural pronto e inventário v8. A cópia continua sem raiz e countReady false;
personas e demais condições de ativação permanecem pendentes.

P1 M31 prepara [personas e vínculos privados](docs/tasks/writer-v2/execucao/64-personas-na-preparacao-privada.md):
definições usadas, deduplicadas por ID/hash, sem tocar a biblioteca atual.
Inventário v9/progresso v5 preservam snapshots arquivados e ausências legadas.
A integração dos perfis e as demais condições de ativação continuam pendentes.

P1 M32 prepara a [origem do universo](docs/tasks/writer-v2/execucao/65-universo-na-restauracao.md)
sem copiar lore global. O plano para a ativação reautoriza a mesma encarnação e
compõe vínculo/contador estritos junto da futura raiz; observação não é grant.
Progresso v6 mantém inventário v9 e termina em history, sem ativar a cópia.

P1 M33 prepara o [histórico por partes](docs/tasks/writer-v2/execucao/66-historico-na-preparacao.md):
versões manuais e anteriores a restaurações, inclusive de recursos removidos,
com texto/datas/razão/rótulo preservados. Inventário v10/progresso v7 mantêm
corpos parciais privados e terminam em draft, sem ativar a cópia.

P1 M34a corrige a [persona exclusiva do rascunho](docs/tasks/writer-v2/execucao/67-persona-exclusiva-do-rascunho.md):
a preparação reconhece a contribuição verificada sem copiar perfil atual e
chega a draft com contagem exata. Texto e definição exclusivos ainda serão
preparados na continuação M34; nenhuma cópia foi ativada.

P1 M34b prepara [texto e estilo do rascunho](docs/tasks/writer-v2/execucao/68-rascunho-na-preparacao-privada.md)
sem sobrescrever o salvo. Igualdade evita corpos duplicados; vazio/removido é
preservado. Inventário v11/progresso v8 terminam em draft-finalize: contagem,
metadados portáteis e manifesto da versão ainda precisam de finalização.

P1 M34c finaliza a [versão recuperada do rascunho](docs/tasks/writer-v2/execucao/69-finalizacao-da-versao-recuperada.md)
com contagem real e metadados/estilo portáteis. Provas das partes são reconferidas
antes do commit; o manuscrito salvo permanece. A preparação chega a cover,
ainda sem ativar o livro. Captura do histórico admite páginas por orçamento.

P1 M35a preserva [bytes e metadados da capa](docs/tasks/writer-v2/execucao/70-bytes-da-capa-na-preparacao.md)
na preparação privada, em partes com SHA integral e inventário v12. None e capa
legada indisponível permanecem explícitos. A fase cover-finalize ainda não cria
imagem na biblioteca/Storage; materialização segura e ativação seguem pendentes.

P1 M35b acrescenta a [materialização privada da capa](docs/tasks/writer-v2/execucao/71-materializacao-privada-da-capa.md):
PNG íntegra no Storage, intenção durável, retomada e fence vazio permanente no
cancelamento. Inventário v13/progresso v10 chegam a personas-integrate. Capa
continua privada, sem biblioteca/uso; disponibilização e ativação seguem pendentes.

P1 M36a prepara a [disponibilidade das personas restauradas](docs/tasks/writer-v2/execucao/72-disponibilidade-das-personas-restauradas.md):
biblioteca, edição, referências e consumidores de IA/backup reconhecem lotes
pendentes/ativos e provas nativas. O fluxo legado permanece compatível.
A instalação das novas cópias globais e a ativação do livro seguem em P1.

P1 M36b implementa a [instalação das personas restauradas](docs/tasks/writer-v2/execucao/73-instalacao-das-personas-restauradas.md):
novas cópias literais na biblioteca, uma por transação, sem substituir perfis
existentes. Inventário v14/progresso v11 mantêm lote pendente e revogação antes
da limpeza. Preparação chega a resources-finalize, sem raiz/countReady;
liberação da capa/personas e ativação integral continuam em P1.

P1 M37a preserva o [texto lógico das fontes de conversão](docs/tasks/writer-v2/execucao/74-texto-logico-das-fontes-de-conversao.md)
em corpos de capítulo imutáveis, inclusive acima de 1 MiB. Leitura privada e
novo backup recompõem a fonte sem exigir o capítulo atual ou exportar ponteiros
físicos. Outros campos grandes e a otimização das leituras de backup continuam
pendentes antes da ativação completa de P1.

P1 M37b acrescenta [backup indexado das fontes](docs/tasks/writer-v2/execucao/75-backup-indexado-das-fontes.md):
fontes externas novas usam um índice pequeno no corpo existente, mantendo os
mesmos bytes JSON e a autorização por página. O caso de 19 páginas caiu de 361
para 37 leituras de partes; near-8 MiB passou com 128 páginas/255 leituras no SDK.
Fontes antigas sem índice continuam compatíveis e precisam de migração antes
da habilitação integral. Demais campos grandes e ativação de P1 seguem pendentes.

P1 M37c implementa a [migração dos índices de fontes preparadas](docs/tasks/writer-v2/execucao/76-migracao-dos-indices-das-fontes.md):
jobs antigos podem receber o índice por fonte, conferindo partes/journals/recibos
nativos. Preparação v12 mantém texto, pins e inventário v14; índice correto não
é regravado. A operação ainda é interna e não executou migrações de produção.
Demais campos grandes e certificação/ativação continuam pendentes.

O contrato interno M38a prepara payloads de recursos grandes em partes, com
leitura verificável acima de 8 MiB/128 partes. O produtor privado e seu cleanup
foram integrados em M38b; a restauração/edição de lore grande pela UI ainda depende
dos consumidores previstos no [plano M38](docs/tasks/writer-v2/execucao/77-campos-grandes-de-recursos-e-metadados.md).

M38b materializa lore grande privadamente, com dados gerais em partes e relações
em páginas, reconciliação e cancelamento com prova nativa. M38b2 migra prefixos
inline antigos com seus contadores/recibos preservados. Ainda falta integrar
leitura/edição/backup;
nenhum livro foi ativado. Veja a [entrega M38b](docs/entregas/2026-10-23-writer-v2-producao-privada-de-lore-grande.md).
