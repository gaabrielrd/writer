# Testes

## Filosofia

Testamos o **comportamento observável** da aplicação: o que o usuário vê e faz. Não testamos detalhes internos de implementação. Um bom teste continua passando mesmo que você reorganize o código por dentro, desde que o comportamento continue o mesmo.

Durante ajustes, execute somente os testes necessários para o comportamento
afetado. Repita ou amplie a suíte quando uma nova mudança, falha ou risco de
integração justificar; preserve `npm run validate` no fechamento de grandes blocos.
Por decisão do operador em 2026-10-21, durante o desenvolvimento mantenha commits
locais e ignore a CI remota: não acompanhe, dispare ou repita workflows. Registre
os resultados locais reais, seguindo o
[processo de desenvolvimento](development-process.md).

## Tipos de teste

- **Unidade**: funções e lógica isoladas (ex.: cálculo, formatação).
- **Componente**: renderização e interação de componentes, com Vitest + React Testing Library.
- **Contrato local**: setup transacional, regras arquiteturais, links da documentação e artefato de build.
- **E2E**: fluxo crítico no Chromium contra o bundle de produção, com
  Playwright.
- **Identidade visual**: contrato de estilo (valores computados dos tokens) e
  regressão visual da página `/styleguide`.

## Localização

Os testes ficam dentro da feature, na pasta `tests/`:

```
features/minha-feature/
├── components/
├── model/
├── services/
└── tests/        # os testes desta feature
```

## Comandos

```bash
npm run test          # roda os testes uma vez, com limites de cobertura
npm run test:unit     # roda apenas Vitest, sem cobertura (mais rápido)
npm run test:coverage # roda Vitest aplicando os limites de cobertura
npm run test:book-generation # backend de geração e normalização real de capas
npm run test:setup    # testa setup e regras arquiteturais em projetos temporários
npm run test:e2e      # testa o fluxo crítico em um navegador Chromium real
npm run test:e2e:update # regera as imagens de referência do styleguide
npm run test:watch    # roda em modo contínuo enquanto você edita
```

Antes da primeira execução local do E2E, instale o navegador compatível com a
versão do Playwright:

```bash
npx playwright install chromium
```

O E2E escolhe uma porta efêmera, gera o bundle e serve a aplicação localmente.

## Tempo de execução e CI

Vitest usa até quatro workers, limitados pelos CPUs disponíveis. O isolamento
por arquivo, o `jsdom`, a instrumentação V8 e os limites de cobertura continuam
ativos. Para limitar recursos durante outra tarefa, use a opção do Vitest:

```bash
npm run test:coverage -- --maxWorkers=2
```

A CI mantém o `validate` completo nos dois ambientes Node 22 e 24. O navegador
de produção e a suíte visual executam em jobs separados. A suíte visual inteira
é distribuída por dezesseis shards em paralelo, com dois workers por runner, incluindo
desktop/celular e claro/escuro/sépia. Os testes de seleção parcial pertencem à
mesma suíte e passam a executar uma vez por projeto.

Para reproduzir um dos shards, substitua o número antes da barra:

```bash
npx playwright test -c playwright.visual.config.ts --shard=1/16
```

Cada shard publica um blob e suas capturas/traces com nome próprio.
Os uploads substituem apenas o artefato do próprio job em uma repetição,
preservando os resultados dos outros shards e evitando colisões de nomes.
O job final consolida os blobs em um relatório HTML único, no artefato **writer-visual-preview**,
com os resultados JSON de cada shard. A execução local completa conserva seu
relatório HTML/JSON habitual. O check **E2E (Chromium)** permanece com o mesmo
nome e exige sucesso do navegador de produção e de todos os shards; falha,
cancelamento ou job pulado impedem sua aprovação.

`scripts/ci-contracts.test.mjs` executa o gate real com esses estados e verifica
a preservação dos limites, dos dois ambientes Node e das evidências. Compare
benchmarks da mesma suíte e cobertura sem processos de testes concorrentes;
execuções com cobertura no mesmo checkout compartilham o diretório `coverage`.
Veja a [ADR de paralelismo e sharding](decisions/0024-test-pipeline-sharding.md).

## Autocomplete e navegação rápida

`ai-assistant/tests/AutocompleteNavigation.test.tsx` integra editor e hook reais
com serviços de IA/crédito simulados. Verifica que navegar após 50 ms ou no mesmo
batch da digitação cancela a espera, conserva prosa/formatação/cursor e não debita
crédito. Uma nova digitação gera exatamente uma sugestão. JSDOM não implementa
esses gestos nativos: o teste entrega entrada, alteração DOM e uma notificação
de seleção agrupada, sem comandos internos do editor. Geometria e relógio locais
são restaurados após desmontar o componente.

Escape no mesmo batch também cancela a intenção anterior, sem impedir uma nova
digitação; composição e navegação consumida pelo menu de menções mantêm suas gates.

O teste do hook também invalida uma oferta ao receber revisão nula e verifica
que um pedido manual posterior continua disponível. O roteiro visual original
`autocomplete-trigger.visual.ts` mantém contagens e relógio de 600 ms; suas
repetições e o controle causal com gesto nativo são registrados na
[entrega de arcos](entregas/2026-10-13-writer-v2-arcos.md). Um controle aprovado
isolado não demonstra a correção de intermitência nem substitui o CI do SHA novo.

## Identidade visual

`e2e/styleguide.spec.ts` protege o styleguide em duas camadas:

1. **Contrato de estilo**: compara os tokens semânticos (`--background`, `--foreground`,
   `--primary`, `--destructive`) e as cores aplicadas ao corpo, aos botões e ao
   alerta de erro nos temas claro, escuro e sépia. Verifica também persistência
   após recarregar, alternância e acompanhamento do tema do sistema. É
   determinístico em qualquer sistema operacional e a falha diz exatamente qual
   valor mudou. Roda sempre, inclusive no CI.
2. **Regressão visual**: compara a página `/styleguide` inteira, pixel a pixel,
   com a imagem em `e2e/__screenshots__/<plataforma>/`. Pega mudanças de
   layout e espaçamento que o contrato não vê.

A fonte do sistema muda o resultado, então cada plataforma tem sua própria
imagem. Quando não existe imagem para a plataforma atual (por exemplo, no Linux
do CI antes de alguém gerar a primeira), o teste é **pulado** com a instrução,
em vez de falhar.

Depois de uma mudança visual **intencional**, regere e revise a imagem no diff
do pull request:

```bash
npm run test:e2e:update
```

Se a imagem mudou sem que ninguém tenha mexido no visual, é regressão: veja o
comparativo em `test-results/` antes de aceitar.
Ele não depende de rede externa nem de dados preexistentes. O CI instala também
as dependências de sistema do Chromium e publica trace e screenshot apenas em
caso de falha.

## Cobertura

Instale também as dependências do backend com `npm ci --prefix functions`. `npm run test:setup` executa os testes de geração. Os testes de regras cobrem criação manual atômica e isolamento dos registros de geração.

`npm run test` aplica limites mínimos definidos em `vitest.config.ts`: 85% de instruções e linhas, 75% de ramos e 90% de funções. Uma queda abaixo disso falha o `validate` e o CI.

Os limites existem para impedir regressão, não para virar meta. Não escreva teste de caso impossível só para subir o número — se um trecho é difícil de cobrir, normalmente ele está pedindo para ser simplificado. O relatório HTML fica em `coverage/` após rodar `npm run test:coverage`.

## Exemplo curto

```tsx
import { render, screen } from '../../../test/render';
import { Saudacao } from '../components/Saudacao';

test('mostra o nome informado', () => {
  render(<Saudacao nome="Ana" />);
  expect(screen.getByText('Olá, Ana')).toBeInTheDocument();
});
```

### Injeção de Dependências em Testes

Para componentes que dependem de estado global, providers de roteamento, ou clientes de API, o ambiente de testes deve fornecer instâncias ou mocks desses contextos (Dependency Injection via Context).

- Em vez de importar o `render` do `@testing-library/react` em cada arquivo, centralizamos essa configuração em um utilitário próprio, como um `renderWithProviders`.
- No nosso template, a importação customizada de `../../../test/render` (mostrada acima) se encarrega de envelopar o componente com todos os Providers necessários, garantindo que a árvore de componentes em teste tenha o mesmo contexto que a aplicação real.

O foco é no que aparece na tela, não em como o componente foi escrito por dentro.

### O que já vem testado

A composição da aplicação tem smoke test em `src/app/tests/`: a rota raiz monta com layout e página inicial, um endereço desconhecido cai na tela de "não encontrada" sem derrubar o layout, e uma rota que lança erro é substituída pelo `errorElement`. Se você mexer em rotas ou no layout, esses testes são a primeira rede.

O setup também é comportamento público do template. Seus testes executam dry-run, personalização, repetição idempotente e rollback em pastas temporárias. A persistência testa migração, backup de dados inválidos, conflitos de revisão e sincronização entre abas. O smoke test serve `dist/` em uma porta efêmera e acessa o HTML e seus assets como um navegador faria.

O smoke E2E complementa essas redes executando o React no Chromium: verifica a
página inicial, os campos e a troca de modo do login, o histórico de navegação e
o retorno da rota de fallback. Não autentica usuários nem cria contas reais. Ele fica
em um gate separado de `npm run validate` para que a validação local não baixe
binários de navegador implicitamente.

## O que NÃO testar

- Estado interno ou nomes de variáveis do componente.
- Detalhes de implementação de bibliotecas de terceiros.
- Estilos puramente visuais sem impacto no comportamento.
- Casos impossíveis só para "aumentar cobertura".

## Investigar falhas

Dropdowns são testados abrindo o controle e escolhendo a opção pelo label visível;
não use `selectOptions`/`selectOption` de selects nativos. `src/test/dropdown.ts`
e `e2e/dropdown.ts` ajudam nesses fluxos. Os contratos de busca, seleção, ações,
teclado e feedback ficam em `src/shared/ui/tests/Dropdown.test.tsx`; os temas,
dimensões e integração com modal ficam em `e2e/visual/dropdown.visual.ts`.

1. Leia a mensagem de erro: ela costuma indicar o que era esperado e o que aconteceu.
2. Rode em modo contínuo (`npm run test:watch`) e ajuste até passar.
3. Se um teste falha após uma mudança de comportamento intencional, atualize o teste para o novo comportamento esperado.
4. Se a falha for inesperada, corrija o código, não o teste.

O cenário visual de seleção parcial posiciona o cursor no primeiro bloco,
confirma o título, zera a rolagem e mede os glifos antes do arrasto real.
Somente esse cenário usa `controlledClock: true`: instala o relógio antes de
abrir a aplicação, pausa após o primeiro salvamento e avança o autosave enquanto
o botão do mouse está pressionado. Exige a transição de “Não salvo” para “Salvo”,
o contador atualizado, o título na mesma posição e a seleção exata `trecho`.
Depois retoma o relógio para testar rolagem, ações em 320 px e foco por teclado.
Os demais cenários mantêm o tempo avançando naturalmente. A opção usa a
[API Clock do Playwright](https://playwright.dev/docs/clock).

No celular, a distância para ocultar o trecho vem de sua posição real. Os seis
projetos desse cenário pertencem à suíte completa, distribuída nos dezesseis shards
do CI. O timeout individual permanece em 45 segundos; os limites dos jobs estão
no workflow. Não aceitar um teste passando só porque o salvamento terminou
antes da seleção: a transição durante o gesto faz parte da regressão protegida.

## Roadmap Writer e regras reais

Gestão independente de campanhas tem testes colocalizados em `campaigns`:
cancelamento, payload/revisão estáveis, resposta perdida, conflito com descarte
explícito, isolamento de UID/alvo e adoção do DTO próprio. O backend em
`functions/test/campaigns.test.mjs` e o SDK real
`tests/firestore/campaigns.rules.test.mjs` conferem CAS/replay, contador/usos de
universo, legado e escrita direta negada. Fixtures substituem só o novo transporte;
os controles de navegador não comprovam autorização real ou captura de aventura.
Ver [contrato F2-07](tasks/writer-v2/execucao/14-campanhas-e-variantes.md).

Captura e leitura de bases têm testes colocalizados em `campaign-bases`,
integrações de Aventura/Estúdio/Campanha e testes Functions próprios. Cobrem
pedidos estáveis, checkpoint/identidades reservadas, resposta perdida, retomada
após reload, mudança de UID/alvo, descoberta de controles locais, paginação e
montagem integral de Unicode/chunks/hash. O leitor preserva texto legado separado,
arquivo, referências explícitas e relações autorizadas sem expansão transitiva.

`tests/firestore/campaignCapture.rules.test.mjs` e
`campaignBaseRead.rules.test.mjs` exercitam escritores reais e transações no
emulador Firestore, SDK direto negado, CAS/replay, abortos, usos/pins e revogação.
Storage é injetado nesses testes: eles não comprovam bucket, credenciais ou
versionamento de produção. `e2e/visual/campaign-base.visual.ts` prova composição
do cliente, duas mesas isoladas, congelamento após edição, corpus grande,
recuperação, limpeza sem origem, teclado e 320 px nos três temas. O transporte
novo tem fixture própria; captura de tela não substitui autorização real.
Veja [contrato de captura](tasks/writer-v2/execucao/15-captura-de-aventura.md).

Notas próprias têm testes colocalizados em `campaign-notes`, integração pública
em CampaignPage e `functions/test/campaignNotes.test.mjs`. Protegem payload
autoral preservado, reserva/limpeza sob Web Locks, storage events, resposta antiga,
troca UID/alvo/token, conflito explícito, cursor invalidado e fechamento durante
save sem reabrir o diálogo. Cancelar antes de enviar não grava; recuperação de
delete não depende de lista ou GET da nota apagada.

`tests/firestore/campaignNotes.rules.test.mjs` verifica APIs e SDK reais no
emulador: negação direta, CAS/replay, tombstone, Unicode exato, corpo fora da lista,
controle ausente/inconsistente, limites e identidade precisa de root recriado.
Notas próprias permanecem autorizadas sem aventura/universo/base originais.
`e2e/visual/campaign-notes.visual.ts` acrescenta CRUD/teclado/320 px, perda da
origem, recuperação após reload e corrida entre duas abas usando Web Locks reais.
A fixture simula o servidor sob um lock separado; contagem de RPCs comprova que
ele não substitui a reserva do produto. Token fictício não prova createTime:
essa garantia pertence ao SDK. Ver [contrato C1](tasks/writer-v2/execucao/16-notas-proprias-da-campanha.md).

Variantes particulares têm contratos/servidor em campaignLore e recuperação em
campaignVariantRecovery, com testes dirigidos de entidade inteira, bodyRevision,
CAS/replay, chave/fence, UTF-8/limites e projeção de relações. HTTP real verifica
private,no-store no callback da chave em sucesso/erro; não cobre recusas anteriores
do framework nem configuração de produção. O SDK dedicado campaignLore.rules
exercita escritores e regras reais, incluindo identidade de root e preservação C1.

No cliente, testes de campaign-lore cobrem controle de sessão, journal/cripto e
DTOs. Navegador usa Web Crypto, IndexedDB e Web Locks reais; fixture simula apenas
servidor/transportes. Controles distinguem sealed antes do primeiro envio de resposta
perdida após commit, e verificam abort após put.onsuccess antes de oncomplete.
Quota é erro injetado; não comprova disco cheio. Evidência de ausência de plaintext
exclui explicitamente backing stores writer.visual.* e não imprime chaves/registros.
Gate/revogação reais pertencem ao SDK; fixture prova composição do cliente.
Ver [contrato C2](tasks/writer-v2/execucao/17-variantes-de-lore-da-campanha.md).

Comparação C3A tem testes colocalizados em `campaign-comparisons`, servidor em
`functions/test/campaignComparison.test.mjs` e SDK em
`tests/firestore/campaignComparison.rules.test.mjs`. Verificam captura candidata,
CAS/recibos/fence, contexto de ordem, projeção antes da classificação, limites,
cursores e limpeza sem alterar base ativa/C1/C2. O SDK usa Firestore/regras reais
e assets injetados; não comprova Storage ou implantação dos índices.

`e2e/visual/campaign-comparisons.visual.ts` cobre composição dos quatro grupos,
paginação, invalidação, recuperação após reload, descarte, revogação e respostas
tardias, com servidor simulado. O journal C3A contém somente metadados sob Web
Locks; a recuperação cifrada de texto continua pertencendo ao C2. Registrar
separadamente testes dirigidos, SDK, navegador e validate no
[contrato C3A](tasks/writer-v2/execucao/18-comparacao-de-bases-da-campanha.md).

Adoção C3B tem testes colocalizados em `campaign-adoptions` e regressões de B/C2,
com servidor em `functions/test/campaignAdoption.test.mjs`. Instrumentação confere
máscaras antes dos gates, orçamento de etapas/corpos e commit sem varredura.
`campaignAuthorization.test.mjs` e o SDK de análise verificam o relógio privado
atualizado pelos escritores reais. Esses testes não comprovam que versões antigas
dos escritores foram drenadas em produção, requisito para habilitar adoção.

`tests/firestore/campaignAdoption.rules.test.mjs` reúne cinco famílias com
Firestore/regras reais: mais de 25 overlays e Unicode, pedidos/barreira,
concorrência/encarnação, legado/autorização e falhas/limpeza/preservação. Assets
injetados não comprovam Storage nem implantação de índices. O navegador dirigido
`e2e/visual/campaign-adoptions.visual.ts` prova composição, recuperação explícita,
reentrada/retirada e temas/320 px com transporte simulado. Web Locks, IDB e cifra
do controle específico são reais; não inferir autorização ou atomicidade do
servidor a partir da fixture. Resultados executados pertencem à
[evidência C3B](entregas/2026-10-18-writer-v2-adocao-de-bases.md),
sem reutilizar CI verde de C3A como validação desta mudança.

Exclusão C4 tem testes colocalizados em `campaign-deletions`, composição/closers
em `campaigns` e regressões dos leitores. `functions/test/campaignDeletion.test.mjs`
verifica reserva permanente, CAS/recibos/fences, limites, sanitização e pins.
`tests/firestore/campaignDeletion.rules.test.mjs` tem cinco famílias com Firestore
e regras reais: campanha independente, gerações adotadas/legado, usos compartilhados,
corridas/encarnação e mídia tardia/SDK privado. Assets são injetados.

`e2e/visual/campaign-deletions.visual.ts` usa transporte simulado e adaptadores
reais de recuperação, Web Locks, cifra e IndexedDB. São duas jornadas nos seis
projetos: confirmação/teclado/320 px e respostas perdidas/recarga/encerramento
explícito de controles. O negativo unitário host+IDB usa eventos de IDB simulados;
não substituir a evidência nativa por esse harness. Ver
[contrato C4](tasks/writer-v2/execucao/20-exclusao-integral-da-campanha.md) e
[ADR 0036](decisions/0036-campaign-deletion.md). Validate e navegador têm resultados
próprios na [entrega C4](entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md),
sem atribuir a C4 a CI verde do C3B.

Sessões privadas S1 têm testes colocalizados em `campaign-sessions`, integração
com leaf real em `campaigns/tests/CampaignPage.test.tsx` e cinco famílias SDK em
`tests/firestore/campaign-sessions.rules.test.mjs`. Cobrem datas gregorianas sem
conversão, CAS, ordem/revisão do vizinho, replay histórico sem adotar corpo posterior,
controle perdido inclusive só tombstones, origem revogada e limpeza C4 v1/v2.
O teste de fronteira Firebase mocka apenas SDK/app e confere as cinco APIs.
Journal, foco, UID e A→B são exercitados pelo produto; prova C4 própria oculta
antes de qualquer encerramento local, preservando controle inválido/futuro.

`e2e/visual/campaign-sessions.visual.ts` reúne dois percursos nos seis perfis, com
callables substituídos somente no servidor visual. Web Locks/storage do navegador
são reais; transporte simulado não comprova autorização. Formulários/listas têm
capturas em 320 px; segunda jornada também usa tamanhos padrão desktop/celular.
Resultados, primeira falha de IDs no teste e revalidações afetadas ficam na
[entrega S1](entregas/2026-10-18-writer-v2-sessoes-privadas.md), sem confundir CI
histórica de C4 com aprovação do incremento novo.

Blocos de aventura têm testes colocalizados em `adventure-blocks` e integração
em `scenes`/`manuscript-history`: prosa por identidade, padrão privado, arquivo,
ordem, agregado, hash da base, restauração, reserva de ilustração e recibos incertos.
`functions/test/adventureBlocks.test.mjs` e `adventurePreview.test.mjs` verificam
escritores, projeção sem ler corpos secretos, whitelist, paginação por bytes,
usos tipados e derivação/revogação de mídia. Os SDKs correspondentes em
`tests/firestore` usam regras/Admin reais para isolamento, CAS, concorrência e
contadores. Capturas não substituem essas provas.

`e2e/visual/adventure-blocks.visual.ts` e `adventure-preview.visual.ts` usam os
editores, filas, recuperação, validação do DTO e renderer reais. Só os transportes
adventureBlockCallables/adventurePreviewCallables são substituídos por fixtures
locais; a conferência dos segredos no HTML é da projeção recebida, sem esconder
texto por CSS. Roteiros incluem três modos, imagens, paginação, perda de resposta,
revogação, teclado e 320 px. Resultados reais ficam no
[contrato F2-06](tasks/writer-v2/execucao/12-aventuras-e-blocos.md).

O histórico possui testes colocalizados em `manuscript-history`, editores e cenas.
Cobrem corpus exato, manifesto/blocos/hash, conta/recurso, seleção tardia, recibo
privado danificado, operação incerta, reserva, comparação, undo e saída após
restaurar. `functions/test/workHistory.test.mjs` e
`tests/firestore/workHistory.rules.test.mjs` protegem token preciso, ativação sem
rebase, snapshot/restauração atômicos, prosa legada grande, isolamento e limpeza.
`e2e/visual/manuscript-history.visual.ts` exercita seis jornadas em seis projetos:
autor, mestre, cópia anterior, próxima edição, resposta perdida, conflito remoto,
paginação/origem removida, exclusão, teclado e 320 px. Somente as seis callables
são substituídas por fixtures; reconstrução, verificação e UI reais continuam no
navegador. Autorização e atomicidade são comprovadas separadamente pelo SDK.

O Estúdio tem testes de frontend colocalizados em `studio`, `adventures`,
`campaigns` e no serviço público de livros. Protegem criação/retry com a mesma
operação, resposta incerta, troca de conta, datas, filtros, paginação e falhas
parciais. `functions/test/studio.test.mjs` verifica autoria, recibos, limites,
cursores e preparação legada; `tests/firestore/studio.rules.test.mjs` usa as regras
e o Admin SDK reais, com datas de snapshot, concorrência e proteção dos vínculos.
O filtro editorial também cobre estado atual diferente do status legado, fallback
de documentos antigos, projeção de metadados sem corpos e cursores vinculados ao
filtro. O hook é exercitado com janelas vazias intermediárias, falha ao carregar
mais e troca de conta/filtro durante uma resposta pendente. A jornada visual
conserva os filtros independentes de autores e mestres e busca uma correspondência
além da primeira janela, sem reduzir o cenário antigo a um filtro de arquivo.
Os testes de personas/livros existentes permanecem parte do gate integral.

Cenas acrescentam testes colocalizados de serviços, autosave CAS, rascunho tipado,
planejamento e composição em `scenes`/`books`/`editor`. Protegem fonte legada,
arquivo/restauração, páginas de prosa, sanitização, hashes, backup v5 e captura
de revisão na publicação. `functions/test/scenes.test.mjs` testa mutações e jobs;
`tests/firestore/scenes.rules.test.mjs` verifica SDK Admin/regras reais, concorrência,
isolamento, controles protegidos, orçamento e clientes antigos. A suíte visual
`e2e/visual/scenes.visual.ts` cobre autor e criador de aventura nos três temas e
320 px. Seus adaptadores simulam persistência e transporte; os resultados reais
e limitações ficam no [contrato em execução](tasks/writer-v2/execucao/08-planejamento-de-cenas.md).

Arcos e cronologia têm testes colocalizados em `narrative-planning`, com integração
em livros/editor/aventuras. Cobrem campos privados, datas textuais, sequências
independentes, vínculos paginados, CAS, comparação/retry e respostas tardias de
outra conta. Os testes de backup conferem identidade, contagem de referências,
revisões de narrativa/cenas, exclusão em andamento e projeção portátil sem UID/jobs.
Troca local de universo invalida o painel antigo e preserva o arco na URL; isso
não comprova atualização remota em tempo real sem refresh.

`functions/test/narrativePlanning.test.mjs` cobre APIs/jobs e índices explícitos;
`tests/firestore/narrativePlanning.rules.test.mjs` usa SDK Admin/regras reais,
incluindo corrida de revisões e preparação com remoção/adição concorrentes.
`e2e/visual/narrative-planning.visual.ts` define 16 jornadas em seis projetos:
autor/mestre, edição, ordenação, múltiplos vínculos, entidades explícitas versus
menção textual, exclusão/preparação/rebalance retomáveis, backup JSON v6,
Markdown e leitor publicado sem notas privadas, teclado e 320 px.
Adaptadores visuais continuam fictícios; autorização real é conferida no emulador.
Resultados e limitações ficam no [contrato F2-03](tasks/writer-v2/execucao/09-arcos-e-cronologia.md).

Progresso e retomada têm testes colocalizados em `work-progress` e integração em
livros/aventuras/campanhas/Estúdio/editores. Cobrem metas totais, estado editorial
independente da publicação, checklist paginado, comparação e recibos incertos,
preferência de fuso, fila de visitas, troca de conta e respostas tardias. Escritores
legados/autosave/importação conferem a base observada e a confirmação de respostas
perdidas antes de uma nova edição, sem sobrescrever outro dispositivo.

`functions/test/workProgress.test.mjs` cobre contratos, ledger e preparação.
`functions/test/visibleWordCount.test.mjs` usa o corpus comum de texto visível;
`src/features/books/tests/visibleWordCountParity.test.ts` confronta o servidor com
`renderRichText`/`countWords` no JSDOM, incluindo entidades e HTML malformado.
`tests/firestore/workProgress.rules.test.mjs` usa SDK real para autorização,
proteção de campos privados, checkpoint intercalado com escritores, composição,
arquivo/restauração, exclusão, CAS, replay após edição externa e privacidade de
retomada. `e2e/visual/work-progress.visual.ts` cobre 15 jornadas nos seis projetos:
autor/mestre, contagem, limite da barra, checklist, paginação, conflitos, resposta
perdida, fuso, retomada, origem removida, troca de conta, teclado e 320 px. O corpus
também é confrontado com o contador nativo do Chromium dentro desses casos.
As fixtures de interface não substituem as provas do servidor.
Resultados e limitações ficam no [contrato F2-04](tasks/writer-v2/execucao/10-estados-metas-e-retomada.md).

`e2e/visual/studio.visual.ts` roda oito cenários em seis projetos: três temas,
desktop/celular, navegação/teclado em 320 px, projetos independentes, persistência
simulada, resposta perdida, troca de conta, erro parcial, preparação e paginação.
As fixtures nunca comprovam autorização ou persistência real; esse contrato é
verificado separadamente no emulador. Produção exige implantação explícita de
functions/regras/índices e não é acionada pelos testes.

A [matriz de aceite](tasks/roadmap-acceptance.md) relaciona as tarefas 01–08 aos
comportamentos e testes. `npm run test:rules` inicia somente um emulador Firestore
local e roda as regras reais com identidades fictícias, inclusive anônimo, autor
e intruso. Requer Java 21; o runner baixa uma versão oficial fixa do emulador e
verifica SHA-256 antes de executar. Não depende do Firebase CLI nem acessa
produção. O projeto de teste é sempre `demo-writer-rules`.

Antes de executar `npm run test:rules`, instale as dependências da raiz com
`npm ci` e do backend com `npm ci --prefix functions`. Os testes de análise de
lore usam o Admin SDK de `functions` para verificar transações reais no emulador.
Cada job de CI que executa regras precisa fazer ambas as instalações; o contrato
em `scripts/run-firestore-rules.test.mjs` verifica essa ordem por job.

A suíte visual estende os cenários existentes com leitor/publicação e exportação
nos três temas e em desktop/mobile. Ela anexa DOCX, PDF gerado pelo Chromium a
partir do documento de impressão e imagens para revisão. A confirmação do
diálogo nativo de impressão continua pertencendo ao navegador/usuário.

`npm run validate` mantém os limites de cobertura; os testes unitários usam dois
workers para evitar saturação de memória/CPU em máquinas compartilhadas. Não há
redução de limites, desativação de testes ou regeneração automática das imagens
de referência para esconder regressões.

## Importação de aventuras PDF

`pdfLayoutExtraction.test.ts` cobre duas colunas, títulos entre faixas, sumário
sem marcador, partes/apêndices, caixas, atributos, tabelas simples e estruturas
ambíguas. Também cobre níveis de subtítulos, títulos quebrados, marcadores
separados, sumário após recomposição e falsos positivos de negrito/capitulares.
Os cenários de aventuras no Chromium verificam os níveis semânticos na prévia
sintética e no Phandelver real. Os testes de serviço verificam fontes/geometria, worker local,
cancelamento e liberação de páginas/documentos. Revisão/modelo cobrem páginas
de origem, dividir/unir, seleção, progresso, respostas tardias e falha parcial.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/import-campaigns.visual.ts e2e/visual/import-documents.visual.ts
```

A aventura sintética de duas colunas e as regressões de nove capítulos/Markdown
usam os três temas, desktop/celular, teclado e 320 px. O Phandelver real é um
teste local opcional, habilitado por `WRITER_IMPORT_PDF` com o caminho do arquivo;
esse PDF não é versionado. Serviços fictícios e bloqueio de rede externa mantêm
os testes isolados. Veja [importação](document-import.md).

## Modais de importação e edição

`e2e/visual/dialog-layout.visual.ts` mede o limite de `80vh` e confirma que
header/footer mantêm suas posições ao rolar o conteúdo em edição de livro,
importação extensa e configurações de IA. Cobre os três temas, desktop,
celular, viewport baixo e largura de 320 px, incluindo envio pelo footer.

## Biblioteca de imagens

Criação assistida: `AssistedBookPage.test.tsx` cobre entrevista, briefing,
revisão, lore privado, capa, saldo, retomada e recuperação de resposta incerta.
`assistedBookService.test.ts` verifica a callable e os erros definitivos/incertos.
`functions/test/assistedBook.test.mjs` cobre autorização, limites, expiração,
relações, regeneração e confirmação transacional com débitos idempotentes.
As regras de geração também bloqueiam acesso direto a sessões e recibos.

Os testes da feature cobrem seleção, gerenciamento, páginas, erros e isolamento
na troca de conta. Os testes de backend cobrem aceite permanente e idempotente,
reutilização sem débito, referências, exclusão protegida, migração e paginação.
As regras no emulador impedem forjar imagens ou referências pelo navegador.
`e2e/visual/image-library.visual.ts` valida menus por teclado, tooltip, breadcrumb,
gerenciamento e seleção no formulário nos três temas e em desktop/celular, incluindo
320 px. Serviços fictícios isolados impedem acesso ao Firebase de produção.

## Universos e lore compartilhado

Testes de componentes cobrem gestão de universos, vínculos, seções de lore,
edição separada no editor, atualização global e backup privado de versão 2.
O backend cobre autoria, retentativas, contadores, referências globais e exclusão
concorrente. `npm run test:rules` inclui isolamento de universos, proteção de
metadados, consentimento global e revogação por URLs diretas.

A suíte visual usa serviços fictícios isolados, sem rede externa, em desktop e
celular nos temas claro, escuro e sépia:

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/universes.visual.ts
```

`LoreCollection.test.tsx` cobre lista/grid, seleção individual e de resultados
filtrados, cancelamento/confirmação, foco, progresso, falhas parciais, escopos e
remoções recebidas por sincronização. Os testes de serviços existentes continuam
verificando revogação local e mutações globais no servidor.
`e2e/visual/compendium.visual.ts` mede alinhamento das ações com as abas e da
busca com categorias, verifica seleção/visibilidade/exclusão e captura lista,
barra e modais nos três temas, incluindo a largura de 320 px:

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/compendium.visual.ts
```

`e2e/visual/editor-adjustments.visual.ts` verifica o topo compacto do compêndio,
busca e filtros, o assistente lateral com campo/envio acessíveis, ações acima da seleção,
aceite explícito, foco por teclado e contraste do item ativo em `@`. Cobre os
três temas, desktop/celular e 320 px. A medição anterior ao ajuste foi 313 px
entre o topo do painel e a lista em 1440 × 1000; o novo limite é 70% dessa altura.
As respostas de IA são fictícias e a configuração visual bloqueia rede externa.

O chat tem contratos/modelos/serviços em `chapterChatModel.test.ts` e
`chapterChatService.test.ts`, interface e ciclo da conversa em
`ChapterChatPanel.test.tsx`, captura real/seleção/viewport/transação em
`chatEditorBridge.test.tsx` e backend em `functions/test/chapterChat.test.mjs`.
`tests/firestore/chapter-chat.rules.test.mjs` bloqueia leitura/forja por dono,
intruso e anônimo e executa aceite concorrente com transações reais no emulador.
`e2e/visual/chapter-chat.visual.ts` mede espaço compartilhado, testa comandos,
aceite/desfazer, retomada, viewport e cancelamento nos seis projetos de tema/dispositivo.

O compositor também verifica posição de enviar dentro do campo, Shift+Enter,
contexto expansível legível em 320 px, prioridade de Escape, catálogo de comandos
e ida/volta à aba Provedor com rascunho intacto. `AISettingsProvider.test.tsx`
cobre seleção explícita da aba e compatibilidade do gatilho de configuração geral.

O raciocínio tem contrato puro em `functions/test/chatGeneration.test.mjs`,
preferências autenticadas em `functions/test/chapterChat.test.mjs` e padrão
local versionado em `chatReasoningStorage.test.ts`. A interface testa Auto
legado, níveis desabilitados por modelo, falhas e ausência de geração/débito;
o navegador testa retomada, alternância de conversas e padrão de novas conversas.

A geração verifica o corpo HTTP real para todos os níveis OpenAI disponíveis
e Auto/Baixo/Médio/Alto Gemini, modelo/provedor congelados, limites, ausência
de credenciais em callable/recuperação e filtragem de pensamentos. Backend testa
fingerprint, configuração efetiva do servidor e retry após mudança de modelo,
histórico e cronologia. `functions/test/chapterChatProvider.test.mjs` cobre
o transporte da plataforma, truncamento, HTTP indisponível e cancelamento da
leitura pendente. O navegador retoma detalhes de modelo/raciocínio e regenera
com outra escolha sem alterar os parâmetros das respostas anteriores.

A auditoria integrada combina workspace, chat, minimapa, seleção, personas e
exportação em desktop/celular nos três temas, incluindo 320 px, 440 px de altura
e 2160 px de largura. O workspace verifica Escape durante drag com foco no
manuscrito, cancelamento com preferência temporariamente limitada e caret
visível em parágrafo longo ao entrar/sair da tela cheia. A restauração aguarda
o reflow inicial e os commits seguintes de ResizeObserver, sem mover seleção.
O acompanhamento termina em 500 ms ou na primeira interação do autor; testes
cobrem reflow tardio, interrupção e limpeza. Um gesto real de toque no Chromium
verifica o alvo de 44 px, foco, texto e largura após autosave/reload nos três temas.
Os testes dirigidos também conservam a largura da sessão se o armazenamento
falhar. Use uma porta visual exclusiva ao executar em paralelo com outro checkout.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/editor-adjustments.visual.ts
```

## Atos

Os testes de atos cobrem numerais, grupos, busca, seleção, modais, conflitos,
contagens, publicação e exportações. A suíte de regras inclui autoria, vínculos
entre livros, projeções mínimas, imutabilidade e revogação.
O cenário visual captura modais e grupos nos três temas, desktop/celular e
320 px, mede a busca ao lado de Novo capítulo e anexa DOCX e PDF reais.
A variável WRITER_VISUAL_PORT permite testar uma worktree em porta separada.

Veja [atos](book-acts.md).

## Minimapa do capítulo

`chapterMinimapModel.test.ts` cobre títulos, parágrafos, listas/citações, aliases,
formatação inline, exclusão de código, vazio e 15 mil palavras. Os testes de
`ChapterMinimap` verificam escolha/aceite por teclado, clique por posição,
ocorrência e gesto de toque. `useChapterMinimap.test.tsx` cobre geometria,
scroll/resize, atualização de documento/lore, preservação da seleção e limpeza.
`RichEditor.test.tsx` verifica substituição externa e atualização ao formatar.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/chapter-minimap.visual.ts
```

A suíte usa os componentes reais e serviços fictícios em seis projetos
(desktop/celular × claro/escuro/sépia). Mede o destaque no início, meio e fim,
preserva seleção e HTML durante cliques, verifica escrita contínua, compêndio
aberto, 320 px e ausência de transbordamento horizontal. Compara também as cores
das quatro categorias com as tags reais, nos esquemas do sistema claro/escuro,
e confirma traços de 1 px com contorno de 2 px sem escala do SVG e intervalo
mínimo de 1 px entre marcas em capítulos densos. Capturas incluem a
viewport de 320 px para revisar a faixa aderente sem reduzir o capítulo inteiro.

## Listagem de capítulos

`e2e/visual/chapters.visual.ts` compara a borda, raio, superfície do cabeçalho,
divisórias, padding e tipografia da tabela de capítulos com a lista do compêndio
no desktop. Nos três temas e em celular, cobre seleção por teclado, estado
intermediário, destaque de linha e abertura do editor pelo título. Em 320 px,
verifica títulos completos acessíveis, contagens, ações e ausência de rolagem
horizontal na página e dentro da tabela.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/chapters.visual.ts
```

## Personas de escrita

`personaProfile.test.ts` compara os valores visuais com as instruções reais,
incluindo atributos próprios das duas personas, herança e ajuste explícito zero.
Os testes de vínculo verificam origem, valor inicial herdado, recuperação de
herança sem base, falha e retry. O modal contextual mantém as orientações completas
recolhidas, com consulta do perfil gráfico antes do texto na biblioteca.
O cenário visual de composição cobre os cards ativos, indicadores do catálogo,
ajuste zero, persistência, abas por teclado, retorno do foco e 320 px nos três temas.

Os testes de `ai-assistant` cobrem os seis padrões, atributos personalizados,
precedência, referências indisponíveis, revisões concorrentes, formulários,
falhas e retry. Autocomplete e ações invalidam respostas antigas sem inserir
texto nem cobrar; os três adaptadores recebem as mesmas instruções. O backup
v3 preserva apenas personas utilizadas e seus vínculos, sem credenciais.
`tests/firestore/personas.rules.test.mjs` cobre isolamento, revisões, limites,
16 atributos e vínculos próprios.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/personas.visual.ts
```

A suíte cobre os três temas em desktop/celular, com edição em 320 px, sliders
por teclado, ações fixas, arquivamento/reativação e composição enviada às
chamadas de escrita. As respostas são fictícias; não avalia qualidade literária
do modelo nem faz chamadas de produção. Veja [personas](ai-personas.md).

`AISettingsPage.test.tsx` verifica a navegação para `/settings/ai`, as abas com
setas/Home/End, abertura de detalhes gráficos e retorno do foco à linha da lista.
Os testes visuais confirmam os avatares, barras de intensidade, layout em uma
coluna em 320 px e retorno ao editor. A aba do provedor persiste na URL e as
preferências são mantidas ao recarregar. Cada teste tem um contexto de navegador
novo; a preparação da prévia não limpa configurações durante um reload.

## Formulários do estúdio

`BookDraftPreview.test.tsx` verifica placeholders, atualização de metadados,
troca/remoção da capa e recuperação de imagem indisponível. O teste da criação
confirma que a prévia só recebe a sinopse gerada após o aceite explícito.
`e2e/visual/book-creation-preview.visual.ts` compara a tipografia com a biblioteca,
mede largura de 960 px, colunas e capa 2:3, cobre os limites de 900/901 px,
rolagem única com ações fixas, textos longos, teclado e 320 px nos três temas.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/book-creation-preview.visual.ts
```

`FormSection.test.tsx` cobre teclado, abertura controlada e preservação ao recolher.
Testes de livros/lore cobrem salvamento pelos dados essenciais, edição direta,
visibilidade, relações incompletas em seções fechadas, IDs estáveis de retry,
URL inválida, busy e aceite explícito de IA. Campos compartilhados verificam
IDs únicos e hints/erros associados por ARIA.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/studio-forms.visual.ts
```

O cenário usa somente fixtures, cobre desktop/celular nos três temas, teclado,
retorno do foco, aviso de publicação e 320 px. A suíte visual completa continua
protegendo capas 2:3, livro único, títulos longos, capítulos, minimapa, personas,
importação, universos e IA. Nenhum snapshot é regenerado automaticamente.

`editor-reading-position.visual.ts` verifica a passagem lida em um parágrafo
maior que a viewport com cursor fora da área visível, na entrada e saída de tela
cheia. Os testes do hook cobrem as APIs padrão e legada de posição textual sem
alterar a seleção. Retry mantém a cronologia também durante a resposta otimista;
tap e drag sem mudança conservam a preferência de largura.

Relatórios e resultados gerados pelo Playwright são ignorados pelo ESLint para
evitar leitura de arquivos temporários durante execuções paralelas. As regras
de lint do código-fonte e os limites de cobertura permanecem os mesmos.

## Referências de lore por sessão (S2A)

Testes colocalizados em campaign-session-references verificam ABI fechada,
recibos históricos, eco integral de cancelamento, reserva/CAS, respostas atrasadas,
UID, foco aninhado e recuperação fora da sessão. Campaigns verifica composição,
preservação de S1 e encerramento C4 sem apagar outro journal. Os componentes
públicos puros de C2 preservam os consumidores existentes.

`functions/test/campaignSessionReferences.test.mjs` cobre serviço e máscaras antes
do corpo; `campaignSessionReferencesCleanup.test.mjs` cobre inventário v3 e
checkpoints antigos sem reinterpretar v1/v2. O SDK em
`tests/firestore/campaign-session-references.rules.test.mjs` usa captura/adoção
reais para legado, autorização, concorrência, páginas e limpeza. Storage é injetado,
sem alegar validação de mídia real. O navegador usa transporte de fixture em
`e2e/visual/campaign-session-references.visual.ts`; duas jornadas em seis perfis.
Validate local verde: 1.910 frontend, 83 scripts e 383 Functions; cinco famílias SDK
únicas e 12 combinações nativas positivas. A [entrega S2A](entregas/2026-10-18-writer-v2-referencias-de-lore-da-sessao.md)
preserva falhas/revalidações e limitações. CI geral e regras 145/145 do head `d9b7988` verdes; testes
não equivalem a aprovação humana ou rollout.

## Cenas e blocos por sessão (S2B)

Os testes de campaign-session-references cobrem DTOs fechados de cena/plano/bloco,
verificação integral de janelas e hashes, imagem explícita, arquivo, journal único,
respostas tardias e recuperação independente da origem. A regra AST permite apenas
tipos públicos e verificador puro B, fechando readers/loaders fora do gate de sessão.

`functions/test/campaignSessionScenes.test.mjs` confere descritores completos antes
de selecionar campos, plano sem leitura do principal, parent/role/origin, corpo
compartilhado, paginação Unicode, arquivo, revisão/coleção/contexto e revogação da
mídia após download/derivação. O teste HTTP usa o wrapper Firebase real para
private,no-store no sucesso e erro de aplicação, sem cobrir respostas pré-callback.

`tests/firestore/campaign-session-scenes.rules.test.mjs` usa captura e adoção reais
com cinco famílias específicas e assets/deriver injetados. O navegador usa
`e2e/visual/campaign-session-scenes.visual.ts`, três jornadas em seis perfis após
a divisão do cenário de recuperação; o
transporte é simulado e não comprova autorização ou Storage reais. Validar somente
casos afetados durante ajustes e rodar validate no fechamento, registrando contagens
e falhas reais. Não repetir S2A integralmente por alterações mecânicas de locators.
Validate S2B verde: 1.935 frontend, 84 scripts e 395 Functions. SDK: cinco famílias
únicas comprovadas, com revalidação dirigida registrada; Chromium 12/12, zero
retry/skip/falha. [Entrega e limites](entregas/2026-10-18-writer-v2-cenas-completas-da-sessao.md);
Correção `56cbb06` com CI geral e regras verdes: antigo J2 separado em dois
fluxos, 69 asserções preservadas e duas adicionais; 12 afetados verdes sem retries.
A entrega registra os lotes dirigidos e a falha anterior da CI.

## Pistas, missões e vínculos próprios (S3)

Unidades em campaign-preparation cobrem DTOs das dez APIs, seis recibos/actions,
estados/pendência derivada, limites sem truncamento, journal integral/Web Locks,
reserva/cancel/fence, actor swap, respostas tardias, CAS do formulário congelado,
CRUD/ordem/vínculos e rascunho preservado. CampaignPage e closer têm testes de
composição estável e encerramento exato sem prosa, preservando outra campanha e
formatos futuros. A regra AST mantém a folha auth/shared composta em campaigns.

functions/test/campaignPreparation.test.mjs e campaignPreparationCleanup.test.mjs
cobrem catálogo/corpos separados, sessão/item/coleção/CAS, ordem mista, leitura
após gate, histórico/fence e compatibilidade C4v1/v2/v3/v4. SDK real em
tests/firestore/campaign-preparation.rules.test.mjs reúne quatro famílias:
autorização/SDK direto get-list-write fechado nos sete namespaces/páginas sem
corpo/cursores; ciclo/concorrência/duas sessões/exclusões; origem S2 revogada e
prosa própria; histórico/cancelamento e C4 paginado em todos os namespaces novos.

O navegador usa e2e/visual/campaign-preparation.visual.ts com UI, serviços,
recovery e Web Locks reais, somente transporte substituído. Três jornadas em
seis perfis: catálogo/estados/ordens/retomada/S1 dirty; reconhecimento/conflito/
item neutro; cancelamento persistido/fence/closer. Desktop conserva sua largura;
mobile J1 usa 320 px nos três temas. A divisão respeita 45 s sem retirar asserções
ou aumentar retry/timeout. Resultados reais, repetições dirigidas e limitações
ficam no [contrato S3](tasks/writer-v2/execucao/24-pistas-missoes-e-pendencias.md).
Fechamento global verde: 1.998 frontend, 85 scripts e 409 Functions. SDK: quatro
famílias únicas; navegador: 18 combinações positivas e dois dirigidos de Escape.
A [entrega S3](entregas/2026-10-21-writer-v2-pistas-e-missoes.md) separa falhas de
roteiro, repetições e limites; CI do novo head pendente.

## Protótipo e evidências do Writer V2

`e2e/visual/writer-v2.html` é uma entrada demonstrativa isolada; dados e estados
são fixtures em memória. `writer-v2-prototype.visual.ts` verifica navegação,
preservação de texto/notas, confirmação, teclado/foco, revelação e estados
simulados de compra/reversão nos três temas, desktop/celular e 320 px.

```bash
npx playwright test --config playwright.visual.config.ts e2e/visual/writer-v2-prototype.visual.ts
```

Trinta percursos Chromium passaram no incremento do protótipo. Essa evidência
aprova interações demonstrativas, sem comprovar autorização no servidor, regras
reais, arquivo gerado, webhook, Connect, CI ou participação humana.
Veja [registro e limites](entregas/2026-10-13-writer-v2-prototipo.md).

Cada capacidade produtiva V2 aplica seus casos observáveis e negativos, o
[contrato transversal](tasks/writer-v2/validacao-e-aceite.md) e a definição de
concluído. Não substituir emulador/contas distintas por mocks para segurança nem
compra sandbox real por alteração de estado da fixture. Pilotos usam o
[roteiro preparado](tasks/writer-v2/execucao/05-roteiro-de-pilotos.md), com pessoas
e tratamento das observações definidos antes da coleta. Cobertura mínima e
comandos de validate permanecem inalterados.

## Lore privado de aventuras

Os testes colocalizados de lore e editor protegem a ABI fechada, os vetores
canônicos independentes, o catálogo completo para menções, hints/UID/respostas
tardias, edição e pedidos incertos. As unidades de Functions cobrem CRUD,
CAS, limites, recibos/fences e a origem local nas bases/campanhas, preservando
os hashes globais anteriores.

`tests/firestore/adventure-lore.rules.test.mjs` usa emulador demo, Admin SDK e
regras reais em quatro famílias: fronteiras/CRUD; paginação e captura explícita;
duas mesas com variantes/adoção; revogação e recriação da raiz com filhos vivos.
A prova de encarnação usa createTime real, inclusive quando campos/IDs reaparecem.

`e2e/visual/adventure-lore.visual.ts` usa interface e guardas reais. Somente as
cinco callables e o adaptador de hints recebem transportes locais no servidor
visual; toda prova de autorização permanece no SDK. Fixtures de captura,
comparação, lore e referências discriminam origem local. AES-GCM, recuperação C2
e troca de conta continuam reais no navegador. Roteiros devem ser executados nos
seis perfis, com evidência de teclado/overflow e capturas inspecionadas.
L passou na validação local: 2.037 testes frontend, 85 scripts, 427 Functions, quatro famílias SDK e 12 combinações nativas positivas. A [entrega L](entregas/2026-10-21-writer-v2-lore-proprio-de-aventura.md) preserva falhas iniciais, repetições dirigidas e limites da evidência. CI geral e regras de `087bced` verdes; o cancelamento inicial e a repetição remota permanecem registrados.

## Importação revisada de aventuras (I)

Unidades de adventure-import cobrem ABI/hashes, limites completos do corpo e RPC,
cliente HTTP sem cache, AES-GCM, IndexedDB/CAS binário, UID/respostas tardias,
reconhecimento/cancelamento e interface sob StrictMode. Regressões de books usam
os reexports para o parser público document-import, sem alterar seu gravador.

`tests/firestore/adventure-import.rules.test.mjs` tem quatro famílias sobre
Firestore real: privacidade/HTTP; ciclo e ativação atômica; retry/CAS/encarnação;
cancelamento, corrida e limpeza limitada. O onRequest é real, mas os verificadores
Auth/App Check do teste HTTP são injetados; não prova configuração Google live.

`e2e/visual/adventure-import.visual.ts` mantém duas jornadas em seis perfis e casos
dirigidos de recuperação/identidade. Interface, rotas, WebCrypto, IndexedDB e Web
Locks são reais; o transporte é simulado. O estado do servidor fictício em
writer.visual.* é explicitamente separado da inspeção do armazenamento produtivo.
Isso não prova autorização real. Repetir somente casos afetados por correções,
preservando falhas anteriores e sem aumentar timeouts/retries.

Corpora privados ficam fora do Git. A comparação local antes/depois usa o parser
real, hashes das seções e envelopes completos, sem enviar PDF ou prosa ao servidor.
O manuscrito de 327 páginas continua reconhecido como uma seção: não declarar
capítulos recuperados automaticamente. O cenário legado de nove capítulos é
sintético apesar do título do teste; Phandelver é o PDF real separado.

## Captura completa do histórico — P1 M1

O leitor de manuscript-history verifica todas as páginas/resumos/corpos e só
retorna o histórico completo após confirmar o token final. Testes dirigidos:

```bash
npx vitest run src/features/manuscript-history/tests/workHistoryService.test.ts
node --test functions/test/workHistory.test.mjs functions/test/adventureBlocks.test.mjs
```

workHistory.rules.test.mjs usa Firestore/Admin reais locais para concorrência,
replay, token nativo/ABA/encarnação, versão de recurso removido, exclusão
interrompida e preservação do contador no cliente. Ele pertence a npm run test:rules;
não executar seu Admin contra serviços live. A revisão do catálogo deve avançar
no mesmo commit dos writers; não simular isso só incrementando o fixture.
As regressões nativas de manuscript-history cobrem a continuidade do diálogo
existente, com transporte fictício, e não substituem a prova SDK. A implementação
de pacote/roundtrip completo P1 permanece separada desse marco.

## Contêiner de backup — P1 M2

O codec puro possui vetores independentes Python/hashlib/struct e testes Node de
roundtrip binário/Unicode, corrupção, selo/EOF, sequência, metadata canônica,
comprimentos maliciosos antes da leitura, backpressure e cancelamento:

```bash
node --test functions/test/bookBackupContainer.test.mjs
npx vitest run src/features/book-portability/tests/backupBlobSource.test.ts
```

O segundo comando verifica o adaptador Blob por intervalos, erro sem retry e API
pública com Web Crypto real. Comparar bytes, sem depender de protótipo de
TypedArray entre realms. A prova nativa dirigida usa Chromium, Blob/Web Crypto
reais, vetor de 404 bytes e 12 payloads máximos; evidência na entrega M2.
A fixture binária não demonstra schema/autorização de livro. Os testes de P1
completo deverão provar captura, mídia, revisão e restauração/ativação no servidor.

## Pertencimento da estrutura legada — P1 M3a

Com emulador demo configurado em FIRESTORE_EMULATOR_HOST:

```bash
node --test tests/firestore/bookStructureBackup.rules.test.mjs
```

O arquivo também é descoberto por npm run test:rules. São dez casos de SDK/Rules
com timestamp Admin e serviço de token reais: criação/remoção sem raiz recusadas,
data igual/retrocesso/raiz errada, atomicidade e token com texto vazio,
isolamento, datas legadas, cleanup deleting e lote de 200. Metadata direta
permanece permitida e demonstra que a raiz não substitui readset por documento.

A [entrega M3a](entregas/2026-10-21-writer-v2-clock-da-estrutura-legada.md) separa
reprodução vermelha, dez novos verdes, regressão de duas operações antigas e
26 testes finais dos arquivos alterados. As outras cinco famílias somam 45
positivos inalterados; não converter evidência composta em execução única.

## Leitura limitada da estrutura salva — P1 M3b

```bash
node --test functions/test/bookBackupRead.test.mjs
npx vitest run src/features/book-portability/tests
```

A ABI/projeção e os testes do cliente verificam fonte/token, paginação sem corte,
ordem UTF-8, partes/hash, vazio/Unicode, sink aguardado, buffers isolados,
abort/falha sem retry, manifesto alterado e ausência de selo de captura inválida.
Os testes do adaptador conferem import sem inicialização e nomes/região das APIs.

Com FIRESTORE_EMULATOR_HOST demo, executar também
`node --test tests/firestore/bookBackupRead.rules.test.mjs` ou a descoberta normal
por `npm run test:rules`. São nove cenários de SDK/Admin reais, incluindo título
isolado sem raiz, pertencimento atômico, writers legados e controle de meta.
A [entrega M3b](entregas/2026-10-21-writer-v2-leitura-da-estrutura.md) registra
resultados e limites do probe Chromium com transporte loopback para Firestore:
cinco casos, 108 capítulos, sem rede externa. Não equivale a App Check produtivo,
memória do sink final, UI ou restauração completa. Validate no fechamento de P1;
sem acompanhar CI durante desenvolvimento, conforme orientação vigente.

## Histórico por fluxo — P1 M4

```bash
node --test functions/test/workHistory.test.mjs functions/test/workHistoryBackupOrder.test.mjs
npx vitest run src/features/manuscript-history/tests/workHistoryService.test.ts src/features/manuscript-history/tests/workHistoryBackupStream.test.ts src/features/book-portability/tests/bookHistoryBackupRecords.test.ts
```

SDK com FIRESTORE_EMULATOR_HOST local demo:
`node --test tests/firestore/workHistoryBackup.rules.test.mjs`. Prova ordem/cursor
compatíveis, 55 versões, recursos ausentes, gates e writers reais. A descoberta
por test:rules inclui esse arquivo sem novo caminho de acesso direto.

Vetores fixos SHA-256 e Node crypto verificam igualdade; o teste de 20 MiB exige
partes de até 64 KiB e não usa o digest de entrada inteira. Cliente cobre retorno
antecipado, pressão de consumo, manifesto/hash, sessão/origem, vazio e BOM; SDK cobre UID.
A [entrega M4](entregas/2026-10-21-writer-v2-historico-por-fluxo.md) distingue
88 cenários cliente com evidência composta e cinco casos Chromium/emulador da
exportação/restauração P1 ainda pendente. Auditoria de produção tem três achados
moderados idênticos à baseline; não rotulá-la como verde.

## Cenas e narrativa no backup — P1 M5

```bash
node --test functions/test/bookBackupRead.test.mjs functions/test/bookBackupResourceRead.test.mjs
npx vitest run src/features/book-portability/tests
```

Com FIRESTORE_EMULATOR_HOST local demo, executar
`node --test --test-concurrency=1 tests/firestore/bookBackupRead.rules.test.mjs tests/firestore/bookBackupResources.rules.test.mjs`.
A descoberta normal de test:rules inclui a nova família. SDK prova máscaras
vazias/timestamps, origem/pai, todos os tipos, paginação e mudanças nativas.
Cliente prova pressão de consumo, ordem, endereço por pai, hash, prova fechada,
singleton, cancelamento e recusa de selo com prova alterada.

A [entrega M5](entregas/2026-10-21-writer-v2-cenas-e-narrativa-no-backup.md)
registra 18 testes Functions, 53 casos cliente com evidência composta, 15 SDK e
oito cenários Chromium/emulador. Não equivale a sink persistente, UI, Auth/App
Check produtivos ou restauração. Validate completo no fechamento P1; sem CI.

## Lore e personas no backup — P1 M6

```bash
node --test functions/test/bookBackupPersonaRead.test.mjs functions/test/bookBackupResourceRead.test.mjs
npx vitest run src/features/book-portability/tests/bookPersonaCapture.test.ts src/features/book-portability/tests/bookResourceCapture.test.ts src/features/book-portability/tests/bookStructureCallables.test.ts
```

SDK com FIRESTORE_EMULATOR_HOST local demo:
`node --test tests/firestore/bookBackupPersonas.rules.test.mjs`.
Inclui writer SDK de perfil/lore, proibição de exclusão de persona pelo cliente
e recriação Admin, origem imóvel, máscaras e namespaces próprios. A descoberta
test:rules inclui o arquivo novo. O cenário de deleção espera falha de Rules.

A [entrega M6](entregas/2026-10-21-writer-v2-lore-e-personas-no-backup.md)
registra 20 testes Functions, 30 cliente, seis SDK novos com evidência composta,
seis SDK de regressão e 11 cenários Chromium/emulador. Distinguir esses cenários
de sink persistente, UI, Auth/App Check produtivos e restauração P1 não entregues.

## Origem de universo no backup — P1 M7

```bash
node --test functions/test/bookBackupUniverseRead.test.mjs
npx vitest run src/features/book-portability/tests/bookUniverseCapture.test.ts src/features/book-portability/tests/bookStructureCallables.test.ts
```

SDK com FIRESTORE_EMULATOR_HOST local demo:
`node --test tests/firestore/bookBackupUniverse.rules.test.mjs`.
Cobre writers reais de universo/vínculo, máscaras/timestamps, raiz imóvel,
revogação, substituição Admin, indisponibilidade opaca e isolamento.
A descoberta test:rules inclui o arquivo. Permission-denied esperado na
exclusão SDK comprova a Rules existente, não uma falha a contornar.

A [entrega M7](entregas/2026-10-21-writer-v2-origem-de-universo-no-backup.md)
registra oito Functions, 14 cliente, cinco SDK e 14 cenários Chromium/emulador.
Distinguir captura/framing da religação/restauração, UI e sink ainda pendentes.

## Rascunho explícito no backup — P1 M8

```bash
node --test functions/test/bookBackupDraftRead.test.mjs functions/test/bookBackupPersonaRead.test.mjs
npx vitest run src/features/book-portability/tests/bookDraftBackupRecords.test.ts src/features/book-portability/tests/bookStructureCallables.test.ts src/features/editor/tests/exportManuscript.test.ts
```

SDK com FIRESTORE_EMULATOR_HOST local demo:
`node --test tests/firestore/bookBackupDraft.rules.test.mjs`.
Sem capítulo salvo, confere estilo declarado, namespace próprio, mutações SDK,
recriação Admin e raiz. Descoberta test:rules inclui esse arquivo.
Cliente verifica 20 MiB/320 partes sem encode integral, congelamento síncrono,
vazio/ausente, fronteiras UTF-8/BOM, abort na passagem de hash e retorno antecipado.

A [entrega M8](entregas/2026-10-21-writer-v2-rascunho-explicito-no-backup.md)
registra 15 Functions, 44 cliente, quatro SDK e 17 cenários Chromium/emulador.
São provas de contrato/bytes, sem UI, sink persistente ou restauração P1.

## Bytes da capa no backup — P1 M9

```bash
node --test functions/test/bookBackupAssetStorage.test.mjs functions/test/bookBackupCoverRead.test.mjs
npx vitest run src/features/book-portability/tests/bookCoverBackupRecords.test.ts src/features/book-portability/tests/bookStructureCallables.test.ts
npm run test:media
```

test:media exige Java 21 e Firebase CLI global (ou WRITER_FIREBASE_CLI apontando
para lib/bin/firebase.js). Inicia somente Firestore/Storage em loopback/portas
livres, projeto demo-writer-backup-cover e UI desabilitada. emulators:exec
encerra os serviços depois dos testes; configuração temporária fica em .firebase
e só é removida após verificar seu caminho e término. Não usa credenciais/
dados de produção. O runner remove endpoints herdados antes de o CLI configurar
os emuladores; a suite recusa endpoint GCS divergente do Storage loopback.
Primeira execução pode precisar baixar runtimes do CLI.

tests/storage/bookBackupCover.rules.test.mjs depende dos dois emuladores.
Não entra na descoberta Firestore-only de test:rules e não usa skips por ausência
de Storage. Executar test:media antes de habilitar este protocolo na integração
remota; durante desenvolvimento não acompanhar CI.

A [entrega M9](entregas/2026-10-21-writer-v2-bytes-da-capa-no-backup.md) registra
12 Functions, 17 cliente, cinco SDK reais e 20 cenários nativos. Inclui 16 MiB/
256 partes e PNG decodificado com hash independente. Há avisos reais de listeners
em teeny-request e NPE de EOF ao encerrar runtime Java após testes positivos;
estão documentados, sem supressão nem alegação de ausência de vazamento.

## Pacote integral e arquivo temporário — P1 M10

```bash
node --test functions/test/bookBackupPackage.test.mjs functions/test/bookBackupContainer.test.mjs
npx vitest run src/features/book-portability/tests
```

A [entrega M10](entregas/2026-10-22-writer-v2-pacote-integral-por-fluxo.md)
registra 24 testes Node, 114 cliente e nove cenários num probe Chromium/OPFS com
Firestore/Storage reais. Inclui sete seções, reconferência, fluxo serial, abort/
RPC tardio, erros de sink e preservação do arquivo anterior sob invalidação.
Relatório envelope-only não valida DTO, relações, autoria ou direito de restaurar.
OPFS é prova de plataforma/disco, sem seletor externo/UX/restauração. Warnings
Storage/bundle e validate completo pendente estão separados na evidência.

## Conteúdo do pacote e índice protegido — P1 M11

```bash
node --test functions/test/bookBackupContent.test.mjs
npx vitest run src/features/book-portability/tests/inspectBookBackupContent.test.ts src/features/book-portability/tests/bookValidationIndex.test.ts
```

A [entrega M11](entregas/2026-10-22-writer-v2-validacao-do-conteudo-do-backup.md)
separa onze testes Node novos, lotes cliente (119, depois sete e seis direcionados)
e dois probes nativos sobrepostos. Verifica hashes/partes/identidades, todos os
DTOs, relações e ranks ativos; mantém avisos para ausência legítima.
OPFS/Web Crypto reais provam cifragem, adulteração, isolamento e cleanup;
quota é simulada no teste unitário. content-only não concede autoria/acesso/
ativação. Não substituir testes de autorização ou restauração por esse relatório.

## Leitura JSON v1–v6 — P1 M12

```bash
node --test functions/test/bookLegacyJSON.test.mjs functions/test/bookLegacyReview.test.mjs functions/test/bookBackupContent.test.mjs
npx vitest run src/features/editor/tests/bookLegacyInterop.test.ts src/features/editor/tests/exportManuscript.test.ts src/features/book-portability/tests/inspectLegacyBookBackup.test.ts src/features/book-portability/tests/inspectBookBackupContent.test.ts src/features/book-portability/tests/bookValidationIndex.test.ts
```

A [entrega M12](entregas/2026-10-22-writer-v2-leitura-dos-backups-legados.md)
registra 27 Node, 46 cliente e nove cenários Chromium/File/OPFS. Cada versão tem
Blob produzido pelo exportador real com APIs simuladas, sem provar backend/Auth.
Scanner cobre BOM/Unicode/gramática/duplicatas/limites e corpo global de 9 MiB
ignorado. Núcleo distingue legacy-content-only de backup novo completo, preserva
avisos de ausência e não faz fetch. Cleanup e cancelamento usam índice M11.

## Reserva e upload privado — P1 M13

Node dirigido: bookRestoreUpload.test.mjs e bookRestoreRecovery.test.mjs,
17/17. Vitest fingerprintBookBackup.test.ts: 3/3. Emulador Firestore com SDK real:
bookRestoreUpload.rules.test.mjs, 6/6, sem pulos. Cobrem nascimento nativo,
barreira dos criadores, Rules deny, chave perdida, CAS/retry, recibos históricos,
fence, cleanup limitado e preservação de outro projeto.

A [evidência M13](entregas/2026-10-22-writer-v2-reserva-e-transferencia-de-backups.md)
separa verificadores HTTP simulados de transações/Rules reais. Sem UI,
Auth/App Check produtivos, validação semântica servidor, ativação ou roundtrip.
Validate integral no fechamento P1; sem CI/envio remoto.

## Integridade dos bytes recebidos — P1 M14

bookRestoreIntegrity.test.mjs: 14 casos positivos finais, incluindo vetores SHA
independentes, retomada, replay, corrupção, limite 16+1, source guard e framing
real com payload cheio. Regressões M13/HTTP: 17 casos. SDK real novo:
bookRestoreIntegrity.rules.test.mjs, cinco cenários com Rules deny, retry/CAS,
retomada, ABA nativo, cancelamento/cleanup e preservação de outro projeto.
[Entrega M14](entregas/2026-10-22-writer-v2-integridade-dos-backups.md) registra
execuções separadas, regressões SDK e limites. Sem UI/produção/validação semântica;
cliente não mudou, portanto não houve repetição de Vitest cliente/build.
Validate integral no fechamento P1; sem CI.

## Núcleo semântico com checkpoints — P1 M15

bookContentMachine.test.mjs acrescenta 13 casos de retomada via JSON, lotes,
isolamento e falhas; regressões nova/legada existentes somam outros 22.
Vitest dirigido: 46 casos. Dois probes Chromium/OPFS reais verificaram 11
cenários de pacote novo e nove de JSON v1–v6, com emuladores locais no primeiro.
[Entrega M15](entregas/2026-10-22-writer-v2-nucleo-semantico-com-checkpoints.md)
separa fixtures, APIs simuladas, navegador/serviços reais e resultados de comandos.
Não há prova de parser/persistência retomável no servidor, restauração ou Auth
produtivos. Validate completo no fechamento P1; CI ignorada.

## Validação servidor de contêiner — P1 M16

104 casos Node distintos dirigidos, 46 cliente, quatro SDK novos e cinco SDK
de regressão positivos; mais 11 cenários Chromium/OPFS do reader. A
[entrega M16](entregas/2026-10-22-writer-v2-validacao-servidor-do-conteiner.md)
registra lotes, tempos e provas separadas. Testes conferem paridade, limites,
retomada, commit nativo conjunto, Rules deny, ABA, corridas, rejeição e cleanup.
Não há implantação/Auth produtivos, legado servidor, materialização ou roundtrip.
Validate integral permanece para fechamento P1; sem CI.

## Cursor lexical legado — P1 M17

```bash
node --test functions/test/bookLegacyJSONCursor.test.mjs functions/test/bookLegacyJSON.test.mjs functions/test/bookLegacyReview.test.mjs
npx vitest run src/features/editor/tests/bookLegacyInterop.test.ts src/features/book-portability/tests/inspectLegacyBookBackup.test.ts
```

[Entrega M17](entregas/2026-10-22-writer-v2-scanner-legado-com-cursor.md):
26 Node, oito cliente e 11 cenários Chromium/File/OPFS positivos. Cursor
serializado atravessa cortes em UTF-8/escapes/números; casos combinam limites
antigos sem truncar compatibilidade. Probe privado comparou 4.500 entradas
determinísticas ao scanner anterior. Não comprova integração servidor do legado,
restauração ou aprovação remota. Validate integral no fechamento P1.

## Catálogo e normalização legados retomáveis — P1 M18

```bash
node --test functions/test/bookLegacyNormalize.test.mjs functions/test/bookLegacyReview.test.mjs functions/test/bookLegacyJSON.test.mjs
npx vitest run src/features/editor/tests/bookLegacyInterop.test.ts src/features/book-portability/tests/inspectLegacyBookBackup.test.ts
```

[Entrega M18](entregas/2026-10-22-writer-v2-catalogo-legado-retomavel.md):
29 Node, oito cliente e 14 cenários Chromium/File/OPFS positivos. Testes retomam
catálogo/normalizador/núcleo, conferem 205 referências, limites, falhas e readback
sem writes/sem reparar índice ausente. Probe privado comparou 85 casos ao fluxo
anterior, incluindo relatórios/índice completos. Não prova integração servidor
do legado ou restauração. Validate integral permanece no fechamento P1; sem CI.

## Validação servidor de JSON v1–v6 — P1 M19

Node dirigido: bookRestoreLegacyValidation, bookRestoreValidation, bookRestoreUpload,
bookRestoreIntegrity, bookRestoreRecovery, bookLegacyNormalize, bookLegacyReview
e bookLegacyJSON: 85/85. SDK real: bookRestoreLegacyValidation.rules.test.mjs e
bookRestoreValidation.rules.test.mjs: seis positivos, sem skip, emulador loopback.
Vitest inspectLegacyBookBackup/bookLegacyInterop: oito positivos.
[Entrega M19](entregas/2026-10-22-writer-v2-validacao-servidor-do-legado.md) registra
tempos e escopo: seis versões, paridade, fanout, estados/recibos/CAS, JSON opaco
grande, born/ABA, Rules e cleanup. Checkpoint nativo de 235.284 bytes retomado;
criação idêntica perdeu nascimento sem impedir cancelamento.
Não comprova criação/ativação do livro, host/UI ou Auth/App Check produtivos.
Validate integral permanece para fechamento P1; CI ignorada.

## Itens de restauração validados (P1 M20)

Teste dirigido do leitor servidor:

```bash
node --test functions/test/bookRestoreContentRead.test.mjs
```

Cobre novo formato e seis legados, itens multipartes, histórico vazio, rascunho
BOM/Unicode e PNG, autorização, cancelamento, ABA de ponteiro/recibos/chunks/estado,
índices legados e falhas de I/O. Reconferir verify(tx) na transação consumidora é
parte do contrato. Testes não criam livros, personas ou mídia.

Os SDK existentes bookRestoreValidation.rules.test.mjs e
bookRestoreLegacyValidation.rules.test.mjs agora exercitam o leitor Admin real,
raw e verificação transacional, incluindo recriação de ponteiro/índice/recibo.
Set idêntico pode preservar timestamps nativos: usar delete/create para provar
troca de nascimento. Fixtures não comprovam esses timestamps nem Rules.

## Remapeamento de cópia de livro (P1 M21)

```bash
node --test functions/test/bookRestoreRemap.test.mjs
```

Quinze casos conferem todos os tipos de identidade, histórico removido, texto
exato, relações nativas/externas, perfis consistentes/ausentes, seis legados e
páginas de relações com provas. Vetor SHA-256 de Python fixa domínio e contexto.
Pacotes reconstruídos de teste usam perfis completos para validação estrita;
perfil legado ausente é conferido separadamente, sem fallback para a conta atual.

bookRestoreRemap.rules.test.mjs acrescenta dois cenários SDK reais: pacote
remapeado novo, lore local com aparência externa, consumo atômico e ABA de índice;
legado com IDs estáveis entre serviços, estilo ausente e cancelamento. O runner
test:rules descobre esse arquivo automaticamente. Collector de testes pode
acumular fixtures pequenas; o leitor de produção mantém partes/páginas limitadas.

## Estrutura nativa restaurada (P1 M22)

```bash
node --test functions/test/bookRestoreStructure.test.mjs
```

Dezessete testes novos cobrem documentos/ledger, snapshot fixo, retries/CAS,
cancelamento concorrente, limpeza limitada, foreign/ABA, seis legados, filho
reaparecido e repetição do callback com rollback. A última simulação é um teste
do port transacional; não comprova retry nativo do serviço.

bookRestoreStructure.rules.test.mjs usa SDK Admin/Rules reais em emulador: confere
commit de documento/journal/recibos, contagem/prosa, SDK negado, limpeza de oito
pares e replay após cancelamento. Outro caso prova rejeição de campo de 1.100.000
bytes pelo armazenamento sem avanço/recibo/capítulo parcial e com fonte integral
legível. Essa limitação ainda precisa ser resolvida antes de concluir P1.

## Corpos grandes de capítulo (P1 M23)

```bash
node --test functions/test/bookChapterText.test.mjs
```

Onze testes cobrem limiar físico, limite lógico, identidade, BOM/Unicode,
manifestações inválidas, ausência/ABA/hash/contexto, preparação e limpeza v5 com
replay e compatibilidade v4. Regressão ampliada da restauração: 114/114.
[Entrega M23](entregas/2026-10-22-writer-v2-texto-grande-na-preparacao.md) distingue
a jornada SDK real de 1.100.000 bytes da prova isolada de capacidade perto de 8 MiB.
O SDK também mantém a falha atômica para título grande, ainda não suportado.
Não comprova hidratação do editor, ativação ou restore completo; validate fica P1.

## Leitura lógica de capítulos (P1 M24)

```bash
node --test functions/test/bookChapterRead.test.mjs
npx vitest run src/features/books/tests/chapterTextReadService.test.ts src/features/books/tests/bookService.test.ts
```

Os 15 casos Node novos cobrem uma parte por transação, origem/conta/ABA,
revogação e consumidores completos. Os 14 testes do leitor cliente incluem
8 MiB, hash/UTF-8 inválidos, troca de conta e confirmação final; quatro casos de
bookService conferem hidratação, metadata-only e ausência sem fallback.

[Entrega M24](entregas/2026-10-22-writer-v2-leitura-logica-dos-capitulos.md):
120 Node distintos, 72 Vitest distintos e dois SDK positivos. SDK monta raiz ativa pela
fixture, não pelo restore, e prova autorização/consistência da fábrica, sem
comprovar wrapper Auth/App Check ou jornada UI produtiva. Suite integral segue P1.

## Escrita e histórico por referência (P1 M25)

```bash
node --test functions/test/bookChapterStorage.test.mjs functions/test/workHistory.test.mjs functions/test/workProgress.test.mjs
```

[Entrega M25](entregas/2026-10-22-writer-v2-escrita-e-versoes-de-capitulos-grandes.md):
97 Node, 60 Vitest e dois SDK distintos positivos. Os casos novos incluem duas
gerações perto de 8 MiB, pins compartilhados, versões após excluir capítulo,
retomada de exclusão, corrupção, CAS e rollback. SDK prova falha atômica por
parte ocupada, mantendo pin anterior e ausência de recibo; sem ativação P1.

A fixture de nascimento nativo é necessária no teste legado de Unicode agora que
restaurar grava corpos físicos. Não tratar a criação por fixture como jornada
completa de restauração. Coleta física e validate integral continuam pendentes.

## Coleta e exclusão dos corpos (P1 M26)

```bash
node --test functions/test/bookChapterCleanup.test.mjs
```

[Entrega M26](entregas/2026-10-22-writer-v2-coleta-e-exclusao-dos-corpos.md):
100 Node e três SDK positivos, cobrindo máscaras/lotes, continuidade, versões
referenciadas, eventos repetidos/concorrentes, ABA e rollback, inventário v2 e
finish legado. O SDK testa o handler com snapshots nativos e transações reais;
não comprova entrega Eventarc ou implantação. Metadados conferem pertencimento,
sem download de prosa na limpeza. Validate integral continua no fechamento P1.

## Chat, conversão e remoção com texto lógico (P1 M27)

```bash
node --test functions/test/bookChapterConsumers.test.mjs
```

[Entrega M27](entregas/2026-10-22-writer-v2-consumidores-do-texto-logico.md):
143 Node, 144 Vitest e três SDK distintos positivos. Cobre aplicação/recibo/crédito/
ledger/pins atômicos, BYOK sem débito, conversão inteira, excesso sem truncamento,
fonte após coleta, retomada de agrupadores mistos e campo congelado externo.
SDK prova rollback por parte ocupada e replay concorrente; sugestões são fixtures,
sem IA externa paga. Nenhuma prova de restauração final ou deploy; validate segue P1.

## Materialização do lore próprio (P1 M28)

```bash
node --test functions/test/bookRestoreLore.test.mjs
```

A suíte dirigida cobre paginação de 130 relações, lore intercalado, alvos locais
remapeados e externos literais, ausente/vazio, retomada/replay/concorrência,
cancelamento durante leitura, prova do índice alterada, retry automático,
compatibilidade JSON v1–v6 e cleanup com corpos v5. A evidência de SDK real,
incluindo excesso do limite nativo sem perda da fonte, fica na
[entrega M28](entregas/2026-10-22-writer-v2-materializacao-do-lore-proprio.md).
Ainda não comprova restauração ativada, suporte integral a campos grandes ou deploy.

## Recursos de cenas/narrativa preparados (P1 M29)

```bash
node --test functions/test/bookRestoreResources.test.mjs
```

Cobre todos os tipos, pais ausentes, filhos antes do cabeçalho, arquivo/ordem A/B,
índices canônicos, vínculos repetidos sem no-op, replay/CAS, prova nativa,
rollback/retry, JSON v1–v6 e limpeza v7 combinada com corpos v5. O harness que
insere uma raiz sintética confere somente o contrato dos leitores existentes,
sem demonstrar ativação pela restauração.
[Entrega M29](entregas/2026-10-22-writer-v2-cenas-e-narrativa-na-preparacao.md)
registra a evidência de Node/SDK e limites. Contagens e restauração final seguem pendentes.

## Reconciliação privada dos recursos (P1 M30)

```bash
node --test functions/test/bookRestoreCounts.test.mjs
```

[Entrega M30](entregas/2026-10-22-writer-v2-reconciliacao-dos-recursos.md)
registra contagens/ledger, Arquivo e cenas sem pai, chaves únicas, baseline e
índice, replay/CAS, prova nativa, rollback/retry, ausência de controle portátil,
compatibilidade JSON v1–v6 e corpos congelados grandes/pins.
Harness de raiz sintética confere somente leitores, sem ativação real.
SDK dedicado cobre disputa, no-op, limpeza v8 e fonte recriada.
P1 continua aberto e validate integral reservado ao fechamento do grande bloco.

## Personas preparadas e vínculos (P1 M31)

```bash
node --test functions/test/bookRestorePersonas.test.mjs
```

[Entrega M31](entregas/2026-10-22-writer-v2-personas-na-preparacao-privada.md)
cobre snapshots exatos/arquivados, 53 perfis distintos, deduplicação entre scopes,
ausências legadas sem empréstimo da biblioteca, replay/CAS/rollback/retry,
vínculos conferidos, namespaces privados e limpeza parcial/final v9.
SDK real cobre sigilo, no-op, recibos nativos e definição recriada.
Não demonstra perfil ativo na biblioteca/IA nem restauração concluída.

## Universo e plano de vínculo da restauração (P1 M32)

```bash
node --test functions/test/bookRestoreUniverse.test.mjs
```

[Entrega M32](entregas/2026-10-22-writer-v2-universo-na-restauracao.md):
233 Node e dois SDK distintos positivos. Cobre descriptors fechados, máscara,
nanossegundos, origens alheias/públicas/deleting/recriadas, revogação, legado sem
promoção, CAS/replay/rollback/retry, cancelamento e preservação global.
SDK prova reautorização/ABA e raiz/vínculo/contador num commit nativo ou nenhum
efeito no rollback. A raiz é sintética: não prova ativação pelo restaurador.
P1/F2-09 continuam abertos; validate integral no fechamento do grande bloco.

## Histórico preparado por partes (P1 M33)

```bash
node --test functions/test/bookRestoreHistory.test.mjs
```

[Entrega M33](entregas/2026-10-22-writer-v2-historico-na-preparacao.md):
284 Node e dois SDK distintos positivos; 18 cenários de histórico restaurado.
Cobre texto vazio/BOM/Unicode, datas/rótulo/razão, versões de recursos removidos,
17 partes maiores que um documento no total, hash/prova alterados, CAS/replay,
rollback/retry, JSON v1–v6, corpos sem manifesto, namespaces e cleanup v10/ABA.
SDK confirma sigilo, corpo ocupado sem avanço e leitura exata após raiz sintética;
não demonstra restauração ativada nem validação integral P1.

## Persona exclusiva na contribuição do rascunho (P1 M34a)

[Entrega M34a](entregas/2026-10-22-writer-v2-persona-exclusiva-do-rascunho.md):
93 Node distintos e um cenário SDK novo positivos. Cobre perfil exclusivo/compartilhado,
contagem exata, ausência de empréstimo da biblioteca, cancelamento na leitura do
rascunho, recibo antes/depois de identidade alterada, continuidade até draft e
cleanup compatível. Somente o novo caso SDK foi executado neste ajuste.
Texto/perfil exclusivos e restauração final continuam pendentes; validate integral
segue reservado ao fechamento P1.

## Rascunho preparado por partes (P1 M34b)

```bash
node --test functions/test/bookRestoreDraft.test.mjs
```

[Entrega M34b](entregas/2026-10-22-writer-v2-rascunho-na-preparacao-privada.md):
105 Node distintos e dois SDK reais positivos, incluindo 12 cenários de rascunho.
Cobre vazio/ausência, mesmo texto inline/lógico, campo composto, recurso removido,
partes/Unicode/BOM, metadados/perfis exatos, replay/CAS, falhas, cancelamento,
inventário v11 e descriptor recriado. SDK prova sigilo, rollback e cleanup.
Não demonstra versão recuperada utilizável ou restauração ativada; M34c/P1 abertos.

## Versão recuperada e metadata portátil (P1 M34c)

```bash
node --test functions/test/bookRestoreDraftFinalize.test.mjs
node --test functions/test/bookRestoreDraftLargeFinalize.test.mjs
```

[Entrega M34c](entregas/2026-10-22-writer-v2-finalizacao-da-versao-recuperada.md):
197 Node, 68 Vitest distintos e dois SDK reais positivos. Cobre contagem real,
rascunho de 20 MiB/320 partes, provas por máscara/ABA depois da leitura, rollback/
retry/replay, metadata fechada/remapeada/congelada, JSON multipart e orçamento de
páginas. Build cliente e smoke passaram; avisos de chunks/imports constam da entrega.
Raiz sintética prova somente leitor/listagem. P1/F2-09 e host/UI continuam abertos.

## Preparação privada dos bytes da capa (P1 M35a)

```bash
node --test functions/test/bookRestoreCover.test.mjs
node --test functions/test/bookRestoreCoverLarge.test.mjs
```

[Entrega M35a](entregas/2026-10-22-writer-v2-bytes-da-capa-na-preparacao.md):
150 Node distintos, 9 Vitest e dois cenários SDK reais positivos. Cobre limite
16 MiB/256 partes, hash/bytes/metadata, marcadores, CAS/replay/retry, namespace
ocupado, cancelamento, máscaras e proteção de registros recriados. SDK usa PNG
real 1200×1800, confere bytes/pixels metadata com sharp e privacidade nas regras.
O teste grande prova protocolo de bytes; não valida formato completo. Nenhum
objeto Storage é criado; M35b/ativação e fechamento P1 permanecem pendentes.

## Materialização privada da capa (P1 M35b)

```bash
node --test functions/test/bookRestoreCoverMaterialization.test.mjs functions/test/bookRestoreCoverStorage.test.mjs functions/test/bookRestoreCoverStorageSdk.test.mjs functions/test/bookRestoreCoverLargeMaterialization.test.mjs
node --test scripts/run-book-backup-media.test.mjs
npm run test:media -- tests/storage/bookRestoreCover.rules.test.mjs
npm run test:media -- --test-name-pattern=materializes tests/storage/bookRestoreCover.rules.test.mjs
```

[Entrega M35b](entregas/2026-10-22-writer-v2-materializacao-privada-da-capa.md):
301 backend distintos e dois guards do runner positivos, mais dois cenários
SDK Firestore/Storage e uma repetição dirigida de ABA nativo. PNG válida de
16 MiB/256 partes, resposta perdida, CAS, cancelamento, fence e replay cobertos.

Emulador Storage instalado ignora precondições/geração no DELETE: não usar como
prova das corridas GCS. SDK real contra servidor HTTP local verifica parâmetros
exatos, CRC/SHA, geração além de Number.MAX_SAFE_INTEGER, exclusão versionada e
HTTP 412. SDK contra emulador cobre bytes/Rules/fence observado antes do envio;
sem execução GCS de produção. A entrega registra falhas investigadas, correção
do helper/fixture e avisos reais. Testes/UI de ativação continuam pendentes.

## Disponibilidade das personas restauradas (P1 M36a)

```bash
node --test functions/test/personaAvailability.test.mjs
npm run test:unit -- src/features/ai-assistant/tests/personaRestoreAvailabilityService.test.ts src/features/ai-assistant/tests/personaService.test.ts
```

[Entrega M36a](entregas/2026-10-23-writer-v2-disponibilidade-das-personas-restauradas.md):
114 backend distintos, 15 Vitest e 14 cenários SDK reais positivos. Cobre estados/
origem, recibos e ABA, snapshots sem metadata, perguntas preservadas sem corpo,
assinaturas sob demanda, invalidação, CAS e ausência de notificações sem mudança
visível. SDK verifica Rules novas e compatibilidade legada; ativações são fixtures.
Typecheck, sintaxe, arquitetura, bundle/smoke e lint dirigidos positivos.
Instalação global/ativação pelo restaurador e jornadas completas continuam pendentes.

## Instalação das personas restauradas (P1 M36b)

```bash
node --test functions/test/bookRestorePersonaLibrary.test.mjs functions/test/bookRestorePersonaLibraryMany.test.mjs
```

[Entrega M36b](entregas/2026-10-23-writer-v2-instalacao-das-personas-restauradas.md):
341 backend distintos, 39 Vitest e sete cenários SDK reais positivos.
Cobre snapshots literais/arquivo/rascunho exclusivo, ausência de perfis, 501
perfis validados, unidades com até cinco gravações, colisões, replay/CAS/retry,
revogação antes da limpeza, metadados sem instruções, outros jobs/UIDs e
recriação nativa de perfil/lote. Unicode malformado/revisão insegura são recusados.

SDK em tests/firestore/bookRestorePersonaLibrary.rules.test.mjs verifica
transações/timestamps e Rules no Firestore 1.22.0 local; regressão M36a preserva
os gates ativos/legados. Lote permanece pendente no instalador. Typecheck,
arquitetura, sintaxe e build/smoke positivos; validate integral e roundtrip/UI
continuam pendentes para fechamento de P1.

## Texto lógico das fontes de conversão (P1 M37a)

```bash
node --test functions/test/bookSceneSourceText.test.mjs
npm run test:unit -- src/features/scenes/tests/sceneSourceText.test.ts
```

[Entrega M37a](entregas/2026-10-23-writer-v2-texto-logico-das-fontes-de-conversao.md):
110 backend distintos, 58 Vitest e três cenários SDK reais positivos. Cobre fonte
acima de 1 MiB, item perto de 8 MiB/128 partes, hash/Unicode/BOM, backup após
remoção do capítulo, colisão/retry/replay, revogação/recriação nativa e limpeza.
Cliente cobre resposta malformada, mudança de conta, UTF-8 inválido e confirmação
final; contratos inline permanecem. SDK usa Firestore 1.22.0 local e verifica
bloqueio direto com raiz própria e preservação de parte recriada.

Instrumentação Node registrou 361 leituras de partes em 19 páginas de backup;
SDK confirma fidelidade, não desempenho isolado. Otimização da exportação e
suporte aos outros campos grandes continuam pendentes antes de P1. Tipos,
arquitetura, sintaxe e bundle/smoke positivos; sem jornada de ativação ou deploy.

## Backup indexado das fontes congeladas (P1 M37b)

```bash
node --test functions/test/bookSceneSourceEncoding.test.mjs functions/test/bookBackupResourceRead.test.mjs
npm run test:unit -- src/features/book-portability/tests/bookResourceCapture.test.ts
```

[Entrega M37b](entregas/2026-10-23-writer-v2-backup-indexado-das-fontes.md):
104 backend distintos, 22 Vitest e três SDK positivos. Compara bytes com JSON
legado, atravessa fronteiras Unicode/BOM/escapes, verifica índices inválidos,
fonte sem índice, corrupção e tokens após alteração/ABA/recriação integral.
Cliente recusa hash integral errado e prova alterada antes do selo.

SDK mediu 19 páginas/37 get de partes pelo fluxo real de restauração e
128 páginas/255 get no teste de capacidade próximo de 8 MiB. Esses números não
representam faturamento ou benchmark isolado de latência. Sem mudança de API
ou bundle cliente; sintaxe/arquitetura/lint dirigidos positivos. Jobs antigos
sem índice e outros campos grandes continuam pendentes de P1.

O Node pode ignorar um caminho de teste inexistente quando há outros válidos.
Confira a existência de todos os caminhos de um lote dirigido antes de executá-lo;
a entrega M37b registra a correção factual da contagem de arquivos de M37a.

## Migração dos índices de fontes preparadas (P1 M37c)

```bash
node --test functions/test/bookRestoreSourceIndexes.test.mjs
```

[Entrega M37c](entregas/2026-10-23-writer-v2-migracao-dos-indices-das-fontes.md):
430 backend distintos em 33 arquivos e dois SDK reais positivos. Cobre fonte
nascida sem índice, no-op, inline/zero/múltiplas fontes, 8 MiB/128 partes,
replay/CAS/retry, rollback, contagens fechadas, origem alheia/ausente e registros
recriados. Partes exigem caminho/escopo/SHA/imutabilidade e journals nativos.

SDK confirma manifesto/journal/recibo no mesmo update nativo, partes preservadas,
backup indexado de 19 páginas/37 get de partes e cancelamento v12. Uma parte
recriada bloqueia migração/limpeza sem ser apagada. Raiz de leitura é harness,
sem ativação; o caso de 8 MiB foi executado no Node, não neste SDK.
A entrega registra a fixture corrigida após OOM; comparações grandes usam provas
compactas com tipos/bytes/SHA. Sem alterações cliente, CI ou deploy.

## P1 M38a — payloads grandes sem habilitação do produtor

[Entrega M38a](entregas/2026-10-23-writer-v2-contrato-de-payloads-grandes.md):
41 Node e dois SDK distintos positivos para codec/leitura interna. O SDK grava
objeto sintético acima de 8 MiB em 141 partes, verifica página aleatória com dois
gets e SHA integral, recriação e ABA nativos. Não é teste do restore/remapeamento
completo nem de Rules novas; somente Admin em emulador dedicado. Node acrescenta
vetor fixo, árvores ímpares, entrada não JSON, JSON/UTF-8 malformados, escopo e
nascimento exato. Gravação nativa sem mudança de valor pode preservar updateTime;
use alteração real seguida de retorno para testar ABA, sem fabricar timestamps.

M38b/M38c ainda precisam de jornadas de produção/cleanup/consumidores. Nenhum
endpoint ou acesso ao namespace foi habilitado. Validate integral permanece no
fechamento de P1; CI ignorada, commits locais.

## P1 M38b — produção e reconciliação de lore grande

[Entrega M38b](entregas/2026-10-23-writer-v2-producao-privada-de-lore-grande.md):
487 backend distintos em 35 arquivos e quatro SDK distintos positivos. Incluem
codec em caminho plano, upload/validação/produção/contagem/cancelamento de lore
acima de 1 MiB e 130 relações, Rules sem grant novo e preservação de parte recriada.
Node inclui 5000 relações em 79 páginas, até 16 partes/34 writes por commit,
rollback/retry/CAS e segmento ausente. Um objeto sintético de 141 partes é teste
do codec, não evidência de restore/remapeamento completo de arquivo de 8 MiB.

Não fabricar identidades nativas para simular legado. A migração de prefixos
inline foi validada em M38b2 com fixture do protocolo anterior e criação
nativa real de lore/journal/recibo/cursor. Validate integral no fechamento de P1;
sem CI/push/PR/deploy.

## P1 M38b2 — migração conservando o prefixo

[Entrega M38b2](entregas/2026-10-23-writer-v2-migracao-dos-prefixos-de-lore.md):
60 backend distintos (58 na regressão de três escritores, mais dois cenários
adicionais) e dois SDK reais positivos. Reproduzir v6 com transação real de
lore/journal/job/recibo, sem editar timestamps nativos. A fixture não é um binário
antigo em execução. Confirmar contador global pelo recibo original, replay
antigo em cada unidade, prefixo intacto até replace, rollback após writes já
preparados, concorrência/retry e cancelamento nas etapas. SDK preserva nascimento
e journal inicial, total global 130 para 202 e encarnação recriada recusada.

Nenhum cliente, Rule ou namespace novo; validate integral no fechamento de P1.
M38c e ativação continuam pendentes. CI ignorada, commits locais.

## P1 M38c1 — leitura privada do lore completo

[Entrega M38c1](entregas/2026-10-23-writer-v2-leitura-privada-do-lore-completo.md):
118 backend distintos (116 em regressão mais dois adicionais) e três cenários
SDK reais. O cenário Unicode foi corrigido na fixture e repetido isoladamente:
141 partes da base/130 relações em três páginas, SHA literal conferido.
Os outros dois cenários SDK confirmam recriações e autorização por unidade.
Não contar a repetição como um quarto cenário.

Há prova de lista metadata-only, tokens, ausência/vazio, escopos e ABA;
uma parte usa quatro/seis leituras nativas e apenas um chunk. Os harnesses de
leitura têm raiz sintética explícita e não comprovam ativação de um job.
Cliente/assinatura/mutações/contextos/backup e roundtrip continuam pendentes.
Sem validação visual nova; validate no fechamento de P1.

## P1 M38c2 — leitura cliente completa

[Entrega M38c2](entregas/2026-10-23-writer-v2-lore-completo-no-cliente.md):
149 casos distintos em nove arquivos, 85 novos e 64 de regressão. Leitor final
51, serviços/hosts 88, adaptador 8 e integração em memória 2. Totais não somam
repetições. Testes DOM/Node passaram juntos após setup condicional.

bookLoreReadRoundtrip.test.mjs usa ambiente Node para o produtor/API/cliente
reais, com DB em memória e raiz explicitamente sintética. Não prova SDK, Rules,
ativação ou jornada browser. A data esperada vem da preparação monotônica.
Os testes puros exercitam Unicode >8 MiB/128 partes e SHA/domínio; bindings
exercitam cache inicial, escrita pendente, conta/epoch, coalescência e revogação.
Lotes com erro são drenados para não acumular chamadas no refresh seguinte.

Tipos, lint, arquitetura, bundle e smoke passaram. As Rules e o backend não
mudaram; não repetir seus testes por essa etapa cliente. Validate integral e
roundtrip de P1 continuam pendentes.

## P1 M38c3a — campos incrementais e Rules de stubs

[Entrega](entregas/2026-10-23-writer-v2-validacao-dos-campos-de-lore.md):
93 Node distintos positivos e sete cenários SDK distintos (quatro existentes,
três novos). Os três novos foram repetidos com controles inline positivos sob
o mesmo clock/revogação; não somar repetições. Parser cobre >8 MiB/128 partes,
50.000 aliases, páginas extensas, todos os splits de Unicode/escapes/chaves,
EOF, checkpoint sem texto livre e comparação com o schema portátil.

SDK confirma a proteção por presença de payloadStorage, inclusive inválido/null,
replace/delete e deleting, mantendo CRUD inline/privacidade e corpos privados.
Fixtures de presença não são prova de certificação/ativação. Nenhuma Rule foi
implantada, nenhum cliente mudou e o produtor continua pendente.

## P1 M38c3b — upload privado e limpeza de campos

[Entrega](entregas/2026-10-23-writer-v2-upload-privado-dos-campos-de-lore.md):
124 Node distintos (45 novos, 79 existentes) e três cenários SDK distintos.
Regressão 119 seguida de conjunto final 45: não somar repetições. SDK confirmou
141 partes, reenvio concorrente real, origem intacta e cleanup após remover raiz;
casos dirigidos repetiram somente fixture corrigida e provas alteradas.

Job/estado/recibos/lease/chunks/corpos continuam privados. SHA serializado pode
conter buffer interno, por isso fica separado e nunca é retornado; EOF/cancel
remove esse estado. Recriação depois da verificação falha na leitura pela
barreira nativa, mesmo se anterior ao header; sealed não é grant atual.
Sem endpoint/cliente/adoção. Validate e roundtrip completos de P1 pendentes.

### P1 M38c3c — leitura de gerações achatadas de lore

[Entrega](entregas/2026-10-23-writer-v2-leitura-das-geracoes-de-lore.md):
72 Node distintos (34 novos, 38 antigos), 85 Vitest (32 novos, 53 existentes)
e três SDK reais positivos. Repetições não aumentam a quantidade de casos.

Backend/cliente exercitam base e campo acima de 8 MiB/128 partes, geração sem
base, remoções/ausências/datas/false, relações antigas/novas, falhas nativas,
domínio e transporte inválidos, reconferência final e chamadas em voo.
Instrumentação mede um chunk por unidade e quatro/cinco/seis leituras nativas.
SDK isola a barreira: parte e novo header com mesmo nascimento continuam
rejeitados pelo cutoff anterior. Leitura positiva precede a recriação.

Tipos/lint/arquitetura/sintaxe/bundle/smoke positivos. O harness de cabeça v2
não entrega adoção/CAS/leases/ativação. Não houve produção/deploy, UI nova ou
browser declarado; validate integral permanece no encerramento de P1.

### P1 M38c3d — inspeção da metadata de origem do lore

[Entrega](entregas/2026-10-23-writer-v2-inspecao-da-origem-do-lore.md):
205 Node distintos em quatro arquivos (67 novos, 138 existentes) e quatro
cenários SDK reais positivos. Repetições dirigidas não aumentam essa contagem.

Indexador exercita todas as fronteiras, domínio/UTF-8/JSON, datas/presença,
ranges e checkpoint sem prosa acima de 8 MiB/128 partes. Serviço cobre v1/v2/
inline, SHA integral, privacidade substituída/removida, estado, retry/rollback,
CAS, fonte revogada/recriada, cancelamento/fence e prova nativa do certificado.
SDK percorre 141 partes e retry concorrente real; namespace privado permanece
negado. Certificado histórico não é disponibilidade atual dos corpos.

Lint/arquitetura/sintaxe positivos. Sem código cliente/visual, não foram
repetidos tipos/Vitest/build/browser; validate integral segue no fim de P1.

### P1 M38c3e — alcance e coleta dos corpos de lore

[Entrega](entregas/2026-10-23-writer-v2-alcance-e-coleta-do-lore.md):
102 Node distintos em três arquivos (30 novos e 72 leitores existentes)
e quatro cenários SDK positivos. Repetições dirigidas não aumentam os casos.

Cobrem 141 partes, metadata-only/header por último, inicialização, registro
concorrente/duplicado, ref nova durante varredura, cabeça recriada com dados
idênticos, página deslocada e referência tardia na 19ª página. Controles/
referências/header/chunks recriados são preservados; leases e cabeça ativa
protegem o corpo. Namespace inteiro negado ao SDK. Abertura metadata-only
continua ligada à transação nativa, com readers v1/v2 compatíveis.

Lint/arquitetura/sintaxe positivos. Sem cliente/visual novo, não foram repetidos
tipos/Vitest/build/browser. Preparação/adoção de leases e exclusão do livro
continuam pendentes; validate integral segue no fechamento de P1.

### P1 M38c3f — reserva dos uploads de lore

[Entrega](entregas/2026-10-23-writer-v2-reserva-dos-uploads-de-lore.md):
113 Node distintos positivos (38 reserva, 45 upload, 30 inventário) e cinco
cenários SDK distintos positivos, em rodadas dirigidas. Dois SDK foram repetidos
após separar IDs das fixtures; não houve uma nova rodada de todos os cinco.

Inclui 141 partes/8 MiB, CAS/concorrência, campos/páginas/remoções, cancelamento
antes do início e após revogação, replay histórico, recriações, cabeça tardia,
rollback e cleanup independente do filho confirmado uma vez pelo pai.
SDK verifica nascimentos/transações reais, namespace negado e header por último.

Lint, arquitetura e sintaxe dos 191 módulos de Functions positivos. Check usa
runner por arquivo para evitar limite de linha do Windows. Sem cliente/visual,
não repetimos tipos/Vitest/build/browser. Validate integral permanece no fim de P1.
Adoção ativa, leases adopted e exclusão continuam pendentes.

### P1 M38c3g — composição de lore em payload

[Entrega](entregas/2026-10-23-writer-v2-composicao-das-geracoes-de-lore.md):
69 Node distintos positivos (31 novos, 38 de reserva) em rodadas dirigidas,
e três cenários SDK positivos. Inclui 141 partes/8 MiB, 129 páginas, fonte v1/v2
sem base, diff/remoção/cauda, domínio inválido, reautorização, CAS/replay/rollback
e cancelamento parcial. Provas nativas cobrem estados/segmentos/journals/
certificados recriados, clone/outra transação e cabeça tardia protetora.

SDK verifica concorrência real, metadata privada, origem nativa intacta,
revogação e rollback. Sintaxe de 195 módulos/arquitetura positivas; lint,
formatação, docs e diff finais conferidos. Sem cliente novo, não repetimos
tipos/Vitest/build/browser. Validate integral permanece no fim de P1.

Inline ainda exige materialização servidor; o teste de recusa sem mutação
não comprova suporte final. Adoção e integração de exclusão continuam pendentes.

### P1 M38c3h — materialização das fichas inline

[Entrega](entregas/2026-10-23-writer-v2-materializacao-das-fichas-inline.md):
134 Node distintos positivos em rodadas dirigidas (45 upload, 38 reserva,
31 compositor e 20 inline) e três SDK positivos. Uma entrada inválida de teste
foi corrigida e somente esse caso repetido; um caso novo foi validado isoladamente.

Cobrem campos literais/ausentes/removidos/substituídos, diff de relações,
JSON escapado acima de 16 partes, cancelamento de filho antes da reserva após
revogação/deleting/ausência, vínculo privado, apropriação recusada, recriações,
rollback e reconciliação independente. SDK comprova nascimento/transação reais,
origem intacta e rollback do append seguido de cleanup após excluir livro.

Lint, arquitetura e sintaxe de 196 módulos positivos. Sem cliente novo,
não repetimos tipos/Vitest/build/browser; validate integral no fim de P1.
Adoção, exclusão e integração de consumidores continuam pendentes.

### P1 M38c3i — adoção atômica das gerações

[Entrega](entregas/2026-10-23-writer-v2-adocao-atomica-das-geracoes-de-lore.md):
277 Node distintos positivos em rodadas dirigidas (239 regressão, 38 novos) e
três SDK positivos. Três comparações de timestamp do mock foram corrigidas e
somente esses casos repetidos; novos casos extensos foram validados isoladamente.

Inclui consentimento/ausência/remoção, CAS/rollback/replay, clocks inválidos,
native head/recibo/geração acoplados, segunda edição real, aposentadoria/coleta,
141 partes/129 páginas e 129 leases com writes limitados de metadata.

SDK verifica revogação pública com controles positivos, marca servidor/exclusão
legada, projeção pública por consentimento, leases físicas preservadas,
concorrência e retry após excluir raiz. Sintaxe de 200 módulos, arquitetura e
lint positivos. Sem cliente novo, não repetimos tipos/Vitest/build/browser;
validate integral no fim de P1. Exclusão/consumidores/backup/cliente pendentes.

### P1 M38c3j — exclusão coordenada dos recursos de lore do livro

[Entrega](entregas/2026-10-24-writer-v2-exclusao-dos-recursos-de-lore-do-livro.md):
248 Node distintos positivos em rodadas dirigidas (23 novos, 225 de regressão),
91 Vitest e cinco SDK positivos. SDK em loopback/demo com Firestore 1.22.0
verificado comprova rollback de bytes/inventário/checkpoints, cancelamento de
filho inline parcial, aliases/fences, 141 partes/header por último e recriações
nativas preservadas. Rules negam controlador e reativação de deleting.

As falhas iniciais de fixture/expectativa antiga e sua correção estão registradas
na entrega. Nenhuma falha fica escondida por contagem de repetições. Lint,
typecheck, arquitetura e sintaxe dos 204 módulos passaram. Sem UI nova,
não repetimos build/browser ou validate/coverage integrais; estes ficam em P1.
Exclusão por ficha e demais writers/consumidores/backup/cliente seguem pendentes.

### P1 M38c3k — exclusão individual do lore completo

[Entrega](entregas/2026-10-24-writer-v2-exclusao-individual-do-lore-completo.md):
303 Node distintos positivos em rodadas dirigidas (36 do novo arquivo, 23 da
exclusão do livro e 244 de leitores/inventário/edição/upload/inspeção/análise).
Cinco SDK distintos positivos comprovam retirada concorrente atômica, revogação
pública, criação positiva de outra ficha, negação de reuso do ID, rollback nativo,
handoff ao livro, 141 partes/header por último e tombstone recriado.

A leitura do registro permanente acrescenta uma consulta nativa por abertura.
Contratos exatos atualizados: v1 base 5/relações 7; v2 campo com base 6/relações 7,
campo sem base 5 leituras, sempre um chunk. Coletor genérico adia a remoção
individual, preservando a capacidade de cancelamento staged própria.

As falhas iniciais do relógio, custo, expectativa de ausência e variável da
Rule estão registradas e corrigidas na entrega, com repetição dirigida.
Lint, arquitetura e sintaxe dos 210 módulos passaram. Sem UI/TS novos,
não repetimos Vitest/tipos/build/browser; validate integral no fechamento de P1.

### P1 M38c3l L1 — reserva permanente da criação

[Entrega](entregas/2026-10-24-writer-v2-reserva-permanente-da-criacao-de-lore.md):
336 Node distintos positivos em duas rodadas sem falha (90 reserva/exclusões,
246 leitores/upload/inspeção/adoção/inventário/análise). Três SDK distintos
positivos em rodadas dirigidas, com reserva realmente concorrente, clock/
publicação preservados, controle positivo de outro ID, negação do reservado,
cancel prévio privado, marcador recriado e rollback do checkpoint do livro.

Uma fixture SDK reutilizava creationId entre livros; corrigido só o ID da
fixture e repetido o caso afetado. A rejeição do servidor foi preservada.
Dois imports não usados do teste foram removidos; lint corrigido passou.

Reader confere retirada e reserva, mantendo um chunk: v1 base 6/relações 8;
v2 campo com base 7/relações 8, campo sem base 6 leituras. Arquitetura e
sintaxe dos 213 módulos passaram. Sem UI/TS novos, não repetimos tipos/Vitest/
build/browser; validate integral no fechamento de P1. L2/L3 pendentes.

### P1 M38c3m / criação L2 — uploads e cancelamento dos filhos

[Entrega](entregas/2026-10-24-writer-v2-uploads-vinculados-a-criacao-de-lore.md):
294 Node distintos positivos em rodadas dirigidas (32 novos, 31 de reserva L1,
45 de campos e 186 de edição/exclusões). Quatro SDK positivos, com bindings
nativos acoplados, fonte sem cabeça, bloqueio por cancel, 141 partes em lotes/
header por último, rollback, retry concorrente e retomada pela exclusão do livro.
Binding/parte recriados são preservados; SDK nega controles/payloads.

O teste extenso não relê corpo grande inteiro numa transação nativa. Journal
do pai contém só metadata; SHA técnico do campo é privado e sai no EOF/cancel.
Coleta de payload consulta metadata e provas de escrita, sem bytes/proof de chunk.

Lint dirigido passou após remover dois imports de testes; arquitetura e sintaxe
dos 217 módulos passaram. Sem TS/UI, não repetimos tipos/Vitest/build/browser.
Validate integral no fechamento de P1. L3 e demais integrações seguem pendentes.

### P1 M38c3n / criação L3A — composição e tentativas

[Entrega](entregas/2026-10-24-writer-v2-composicao-do-lore-a-partir-da-reserva.md):
314 Node distintos positivos em rodadas dirigidas: 26 casos novos de composição/
origem/cleanup/isolamento/replay e 288 regressões em nove arquivos existentes.
A primeira injeção de rollback do teste interceptava set em vez de update;
corrigida a fixture, o caso isolado passou. Sem falha pendente.

Quatro SDK positivos (295504.3951 ms) no emulador verificado 1.22.0, demo/loopback:
nascimento acoplado de tentativa/binding/prova, conteúdo literal e relações,
negação SDK de controles/head prematuro, cleanup reservado em lotes de até 16
partes/header por último após revogação, rollback/retry concorrente/retomada
pela exclusão do livro e binding/geração recriados preservados.

Arquitetura, sintaxe dos 220 módulos e lint dirigido passaram.
Sem TS/UI novos, não repetimos Vitest/tipos/build/browser. Validate integral
no fechamento de P1; L3B, integrações e ativação permanecem pendentes.

### P1 M38c3o / criação L3B — ativação nativa e histórico

[Entrega](entregas/2026-10-24-writer-v2-ativacao-atomica-da-criacao-de-lore.md):
454 Node distintos positivos: 40 novos da criação e 414 regressões de 13
arquivos existentes. Rodada final dos 40 passou após guarda de revisão:
recibo isolado não confirma edição adopted se faltam provas do criador.

Seis SDK distintos positivos: cinco na primeira rodada (428369.1325 ms),
incluindo a regressão de composição com CAS inválido, e um dirigido após
a correção da guarda (48809.6144 ms). Emulador 1.22.0 verificado, demo/loopback.
Provam nascimento atômico, conteúdo literal/relações, retry/concorrência/cancel,
rollback, reedição/retirada/exclusão, recriados e perda dos comprovantes.
Metadata histórica não reautoriza texto ou recria ficha.

Arquitetura, sintaxe dos 225 módulos, guarda final individual e lint passaram.
Sem TS/UI novos, não repetimos tipos/Vitest/build/browser. Validate/cobertura
completos no fechamento de P1. Sem CI remota, push ou deploy.

### P1 M38c3p — livros sem flag e finalização servidor

[Entrega](entregas/2026-10-24-writer-v2-roteamento-integral-da-exclusao-de-livros.md):
92 Vitest de livros/publicação, 23 Node de exclusão de lore e 17 SDK positivos.
Rodada SDK dirigida: três novos casos de roteamento, um de adoção/flag e
13 de publicação, 53401.5139 ms. Emulador verificado 1.22.0 demo/loopback.

Flags ausentes/false não permitem bypass; metadata/início legítimos passam.
Backend limpa preparação privada e livro vazio, retoma por nova operação,
preserva outro livro e atualiza vínculo/contador de universo. Testes de
revogação/publicação permanecem. Lint/tipos corrigidos e arquitetura positivos.

Após ajuste de asserção tipada, somente seu caso Vitest foi repetido.
Sem UI visual/backend novos, não repetimos browser/build/sintaxe Functions.
Validate/cobertura completos no fim de P1; sem CI/push/deploy.

### P1 M38c4a / A1 — lore lógico da análise

[Entrega](entregas/2026-10-24-writer-v2-leitura-logica-da-analise-de-lore.md):
54 Node positivos (30 novos e 24 existentes), 372.5111 ms; seis SDK positivos,
43310.8667 ms, emulador verificado 1.22.0 demo/loopback. Gerador stub, sem IA paga.

Testes conferem inline/v1/v2/criação, BOM/presenças/relações/datas, SHA independente
do Merkle, domínio, budgets antes de chunks, 501 fichas com páginas de 16,
recriação nativa, escrita payload/mista recusada sem débito e inline atômico.
Após I/O, revogação descarta resposta antes do próximo chunk; corpo repetido
reautoriza e recibo metadata sobrevive. Erro de schema portátil foi traduzido
para conflito de origem após os casos negativos detectarem o código incorreto.

Arquitetura, lint dirigido e sintaxe dos 226 módulos passaram. Sem UI/TS novos,
não repetimos Vitest/tipos/build/browser. Validate/cobertura no fechamento de P1.
A2 e demais integrações permanecem pendentes, sem CI/push/deploy.

### P1 M38c4b / A2a — adoção conjunta de lore

[Entrega](entregas/2026-10-24-writer-v2-adocao-conjunta-das-geracoes-de-lore.md):
37 novos Node e 206 de regressão positivos; quatro SDK distintos positivos
em duas rodadas, emulador 1.22.0 verificado demo/loopback. Testes cobrem
1/50 membros, inline/v1/v2/criação, CAS/autorizações, clock/privacidade únicos,
prova nativa conjunta, reedição/GC/retirada/exclusão e rollback composto.

Primeira rodada confirmou lote misto concorrente e rollback nativo do recibo.
Timeout no caso stale revelou leituras irmãs após rejeição; o teste seguinte
não iniciou por falha no clearFirestore. Ajustamos espera das leituras,
acrescentamos prova determinística e repetimos somente os dois afetados:
2/2 positivos, 88784.6045 ms. O caso nativo de 50 payloads confirma um commit
com mais de 500 writes metadata, uma escrita da raiz e nenhum corpo/lease
individual gravado. Saldo/recibo usados são de um caller de teste.

Lint dirigido, arquitetura e sintaxe dos 227 módulos positivos. Sem TS/UI
novos, não repetimos tipos/Vitest/build/browser. Validate/cobertura no fim
de P1. A2b/A2c e demais integrações pendentes; sem CI/push/deploy.

### P1 M38c4c / A2b1 — reserva nativa da análise

[Entrega](entregas/2026-10-24-writer-v2-reserva-nativa-do-lote-da-analise.md):
218 Node positivos na integração (37 novos/181 regressões), seguidos de
39/39 da reserva após fixar provedor/relações/IDs qualificados; 220 casos
distintos positivos. Hash de texto foi corrigido para o JSON histórico.

Três SDK distintos positivos, demo/loopback com emulador verificado 1.22.0.
Rodada final passou nos dois primeiros (50 alvos/Rules/exclusão e fence/prova
recriada); OOM nativo de V8/JVM interrompeu o terceiro. Processos terminaram,
logs foram preservados fora do Git e somente esse caso foi repetido com
recursos limitados: 1/1 positivo, 4862.6753 ms. O rollback é falha nativa no
último write, preservando manifesto/flag/saldo antes do retry.

Lint/arquitetura e sintaxe dos 233 módulos positivos. Sem UI/TS novos,
não repetimos tipos/Vitest/build/browser. Validate/cobertura no fim de P1.
Produtores/cleanup A2b2 e aplicação/cobrança A2c pendentes, sem CI/push/deploy.

### P1 M38c4d / A2b2 — preparação vinculada da análise

[Entrega](entregas/2026-10-24-writer-v2-preparacao-vinculada-do-lote-da-analise.md):
454 casos Node distintos positivos: 182 produtores, 198 ciclos, 39 reservas
e 35 do workflow novo (33 na rodada completa e dois ramos adicionais dirigidos). A rodada nova levou 98120.3907 ms; 50 locais reais
foram preparados/limpos, com fontes/headers/crédito intactos. Novos testes
detectaram e corrigiram a leitura de campo selado como dependência da edição,
sem liberar sua escrita. Dois símbolos sem uso foram removidos após lint.

3/3 SDK, 322344.0348 ms, emulador 1.22.0 verificado demo/loopback com recursos
limitados desde o início. Cobrem 50 mistos até ready, nascimento de todos os
vínculos, Rules, cleanup após revogação, rollback nativo de parte/checkpoint,
retry, exclusão e provas recriadas. Não demonstram aplicação/cobrança reais.

Lint/arquitetura/sintaxe dos 240 módulos positivos. Sem UI/TS novos, não
repetimos tipos/Vitest/build/browser; validate/cobertura no fim de P1.
A2c e demais integrações pendentes, somente commits locais, sem CI/deploy.

### P1 M38c4e / A2c — aplicação integral preparada

functions/test/loreAnalysisApplicationApply.test.mjs cobre aplicação pelo
contrato real em inline/v1/v2/criação, mistura de destinos, globais apenas,
BYOK/saldo, hash canônico versus legado, recusas de bypass, provas ausentes/
recriadas, mudanças de origem, rollback e replay após exclusão.
Inclui 50 fichas locais novas reais, uma cobrança e um clock. O grant completo
não libera adoção singular/subconjunto ou produção, mesmo após abrir o batch.

tests/firestore/loreAnalysisApplicationApply.rules.test.mjs verifica commit
e rollback nativos, 50 mistos, chamadas concorrentes, cancelamento, Rules,
nascimento conjunto de crédito/cabeças/recibo, BYOK e confirmação após limpeza.
Exige emulador dedicado demo/loopback. O resultado real da execução deve ser
conferido na evidência, sem confundir a existência do teste com aprovação.

Validate integral no fim de P1. Sem novo fluxo de interface ou implantação;
cliente/endpoints de preparo e demais integrações permanecem pendentes.

A [evidência A2c](entregas/2026-10-24-writer-v2-aplicacao-atomica-da-analise-preparada.md)
registra 47 novos Node distintos, 201 regressões e cinco SDK positivos em
rodadas dirigidas. Node cobriu 50 locais; SDK cobriu 50 mistos e a corrida
adicional aplicar/reservar. Isso não substitui a certificação integrada de P1.

### P1 M38c5a — diff literal e transporte cliente do lore

bookLoreWritePlan.test.ts e bookLoreWritePayload.test.mjs verificam presença/
valor, no-op, snapshots e páginas de relações, JSON/UTF-8 limitado, aborto,
retomada e igualdade integral de hashes/provas com o codec real do servidor.
bookLoreWriteRoundtrip.test.mjs integra C1 e produtores/selo/reserva/composição/
adoção reais sobre double transacional, incluindo base intocada de 9 MiB.

A [evidência M38c5a](entregas/2026-10-24-writer-v2-diff-e-transporte-do-lore.md)
registra 175 casos Vitest distintos positivos em rodadas, cinco smokes Chromium
do codec, tipos/lint/arquitetura/build e seus avisos. Captura reconfirmada e
revogação não são substituídas por um token fabricado pelo cliente.
Backend/Rules não mudaram e SDK não foi repetido. UI/host/recuperação e
certificação integrada permanecem pendentes; validate integral no fim de P1.

### P1 M38c5b — coordenação da edição de lore

bookLoreEditOperation.test.mjs integra C1 e serviços reais sobre double
transacional: preparo sem adoção, apply, literal/CAS, privacidade, no-op,
retries de cada classe e cleanup em marcos diferentes. Inclui revogação/
abort/conta, RPC pendente, respostas tardias, corridas aplicar/cancelar,
DTOs inválidos, 9 MiB sequenciais e 100 uploads com status limitado/páginas.

A [evidência M38c5b](entregas/2026-10-24-writer-v2-coordenacao-da-edicao-de-lore.md)
registra 47 novos e 18 regressões Vitest distintos positivos, três smokes
Chromium com serviços reais/bridge sobre double, tipos/lint/build e checks
dirigidos. Fixture de cleanup corrigida para preservar provas permanentes.
Não certifica HTTP, SDK/Rules ou UI humana; backend/Rules não mudaram.
Host/recuperação/endpoints pendentes; validate/cobertura no fechamento de P1.

### P1 M38c5c — transporte autenticado da edição manual

bookLoreEditTransport.test.mjs verifica allowlist/envelope/UID/namespaces/
filhos, fences e get reais. bookLoreEditTransportHttp.test.mjs verifica a
callable exportada rejeitando App Check ausente/inválido, handler sem auth
e preflight CORS real. Harness HTTP com autor fixo verifica cache/domínio;
não é prova de login/attestation válidos.

bookLoreEditService.test.ts cobre SDK regional, UID forçado, no-op, guards,
resposta tardia, falha/retry e cleanup após abort. Os 47 casos do coordenador
agora passam pelo roteador novo. A [evidência](entregas/2026-10-24-writer-v2-transporte-autenticado-da-edicao-de-lore.md)
registra 59 Vitest e 17 Node distintos positivos em rodadas e três smokes
Chromium com SDK/HTTP reais sobre double, incluindo multipart e RPC pendente.

O harness de browser usa projeto fictício/loopback, Auth fixa e App Check
desabilitado somente no teste. Sucesso com tokens reais, UI, emulador
Firestore/Rules e certificação integrada não foram inferidos desses smokes.
Tipos/lint/build/arquitetura/sintaxe positivos; validate integral no fim de P1.

### P1 M38c5d — reserva e chave da recuperação de lore

bookLoreWriteRecovery.test.mjs cobre inline/v1/v2/criação, intenção/CAS/UID,
chave única, origem/revisão, provas/chaves recriadas, fence, revogação e
rollback sobre double transacional. HTTP testa credenciais/limites/UTF8/
erros/no-store com verificadores injetados e onRequest real em loopback.

bookLoreWriteRecovery.rules.test.mjs usa Firestore nativo demo/loopback:
reserva concorrente, nascimento conjunto, denies SDK para dono/terceiro/
anônimo, fonte/clock/crédito intactos, recriação e rollback do último write.
A [evidência](entregas/2026-10-24-writer-v2-chave-protegida-da-recuperacao-do-lore.md)
registra 37 Node distintos e três SDK positivos em rodadas dirigidas,
sintaxe/lint/arquitetura. Não são prova de login real ou journal/retomada/UI.

Sem cliente/TS/UI novos, não repetimos Vitest/tipos/build/Chromium.
Validate/cobertura no fim de P1; ciclo de vida integrado ainda pendente.

### P1 M38c5e — journal local cifrado da edição de lore

bookLoreJournal.test.mjs usa harness de eventos/atomicidade IndexedDB e
WebCrypto real: 17 casos. bookLoreJournalSession.test.mjs cobre o adaptador
HTTP/key/conta em 14; bookLoreJournalCrypto.test.mjs cobre partes/AAD/SHA/grant
em seis. Os 14 do codec existente conferem ausência de regressão no serializer.
51 casos distintos positivos em rodadas; journal+sessão final 31/31 em 1.02 s.

Chromium real verifica quatro cenários: >9 MiB/reinício de processo/literalidade,
append aceito com resposta perdida e replay após reload/cleanup sem chave,
CAS de duas abas/tamper/isolamento, e abort da transação final com recuperação
após reload sem o input original. IDB/Web Locks são reais; serviços servidor
rodam sobre double e Auth/provedor de chave são fixtures. Não inferir tokens
reais, Rules, UI ou reconstrução de todo o coordenador.

[Evidência](entregas/2026-10-24-writer-v2-journal-cifrado-das-edicoes-de-lore.md)
registra as rodadas e limites. Lint/tipos/build/smoke/arquitetura dirigidos;
sem repetir backend/SDK, sem mudança de servidor. Validate/cobertura no fim
de P1; somente commits locais.

### P1 M38c5f — checkpoints restauráveis do coordenador de lore

48 casos novos de bookLoreEditCheckpoint.test.mjs e cinco novos da sessão
cobrem restauração entre unidades e após resposta perdida, incluindo callbacks
de inicialização/reserva/reconciliação, cancelamento concorrente, falsificação
de root/páginas/wire, 53 uploads paginados, multipart/quatro slots, signal e
conta/contexto. Regressões da operação, sessão e journal completam 143 casos
distintos positivos em rodadas; não somar retakes como casos novos.

Chromium recarrega com rascunho/pedido em IDB cifrado e checkpoint/páginas na
memória externa do harness: replay exato de append e cursor inicializado,
ready/apply explícito, failedCancel/get e terminal adotado. Dois smokes
positivos no código final; não é persistência automática do coordenador.

[Evidência](entregas/2026-10-24-writer-v2-checkpoints-restauraveis-da-edicao-de-lore.md)
distingue serviços reais/double/Auth fictícia e registra falhas corrigidas,
incluindo execução parcial do wrapper npx sem resultado. Lint/tipos/build/
smoke/arquitetura dirigidos; SDK/backend não repetidos. Validate no fim de P1.

### P1 M38c5g — checkpoints persistidos no journal cifrado

bookLoreCheckpointJournal.test.mjs tem 19 casos novos; 31 regressões do
journal/sessão completam 50 distintos positivos em rodadas. Cobrem gerações,
oncomplete/abort/CAS, acks atômicos, ciphertext, preservação de parcial/
divergência/corrupção, grants, legado, cancel e reconstrução por storage.
Capacidade acima de 8 MiB/128 frames usa 55 mil controles sintéticos,
sem alegar preparo nativo equivalente; coleta elimina até 50 por passo.

Chromium real verifica dois fluxos somente de IDB cifrado: reload com wire/
cursores/terminal e adoção explícita única; abort da promoção, recuperação e
acks atômicos, revogação da origem e coleta local sem chave preservando draft.
Serviços reais sobre double/Auth fictícia; não certifica tokens, Rules ou UI.

[Evidência](entregas/2026-10-24-writer-v2-persistencia-cifrada-dos-checkpoints-de-lore.md)
registra rodadas/limites/falhas corrigidas. Lint/tipos/build/smoke/arquitetura
dirigidos; sem backend/SDK repetidos. Validate/cobertura no fechamento de P1.

### P1 M38c5h — mapa e cleanup de lore sem chave

bookLoreControlCleanup.test.mjs tem 42 casos novos e sessão tem cinco novos.
Com 17 antigos da sessão e 50 regressões do journal/proteção/checkpoint,
114 casos distintos passaram em rodadas. Testam nove momentos de cancel,
seis classes de resposta perdida, 53 uploads paginados, adoção vencedora,
conflitos/fences, produtores em voo, ACK abortado, legado, corrupção/conta/
signal, mapa parcial e dependências de pai/slot fora do mapa.

Dois cenários Chromium em página leve da mesma origem usam IDB/Web Locks
reais, serviços reais sobre double/Auth fictícia e reload entre passos:
fechamento de três uploads após revogação sem getKey/decrypt, com replay exato
e draft/produção preservados; e reconhecimento de adoção própria sem limpar
corpos ativos. Não é prova de interface ou tokens reais.

[Evidência](entregas/2026-10-24-writer-v2-controles-e-cancelamento-de-lore-sem-chave.md)
registra falha inicial de get null, ERR_INSUFFICIENT_RESOURCES na navegação da
aplicação completa e os checks efetivos. Lint/tipos/build/smoke/arquitetura
dirigidos; backend/SDK não repetidos. Validate/cobertura no fim de P1.

### P1 M38c5i — coordenação persistida de lore

[Plano 107](tasks/writer-v2/execucao/107-coordenador-persistido-da-edicao-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-coordenador-persistido-da-edicao-de-lore.md):
testes do controller com serviços reais sobre double e harness transacional
verificam write-ahead, perda de respostas, init/pre/post/ACK interrompidos,
pontes inválidas, corrupção antes de coleta, literal multipart e cancel.
Sessão verifica vínculo por conta/guard; regressões cobrem journal/checkpoint/
mapa e chave. Três cenários Chromium usam IDB/Web Locks reais em harness leve.
Não equivale a UI/SDK/App Check reais. Validate integral no fechamento de P1.

### P1 M38c5j — bootstrap e liberação explícita de lore

[Plano 108](tasks/writer-v2/execucao/108-reserva-descobrivel-e-encerramento-da-edicao-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-reserva-descobrivel-da-edicao-de-lore.md):
47 casos novos verificam ticket/RPC/ACK, cold resume com/sem draft, espera de
chave/reserve/produtor, cancel separado de liberação, adoção vencedora, conta/
signal/CAS/paginação/corrupção e SDK boundary. Registros locais sem texto/chave.
Três cenários Chromium provam migração v1 → v2, processo reiniciado e recuperação
de draft após cancel e reautorização. Harness de armazenamento/serviços, sem
prova da UI ou SDK/App Check reais. Validate integral no fechamento de P1.

### P1 M38c5k — interface literal e descarte de lore

[Plano 109](tasks/writer-v2/execucao/109-interface-e-descarte-da-edicao-manual-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-interface-e-descarte-do-lore.md):
UI/Testing Library cobre literais, ausência/vazio, grandes campos intocados,
retry, cancel em voo, confirmação, router/foco, conta/perfil e paginação.
Purga cobre batches, abort/reload, writer tardio, recriação, isolamento e
marker completo contra armazenamento. Três jornadas Chromium usam host real
com IDB/Web Locks/serviços de fixture, temas/mobile e processo reiniciado.
Não comprova entrada no compêndio, SDK/Auth/App Check reais ou testes manuais
de leitor de tela/zoom físico/segundo dispositivo. Validate no fim de P1.

### P1 M38c5m — recuperação antes da criação da ficha

[Plano 111](tasks/writer-v2/execucao/111-transporte-e-recuperacao-da-criacao-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-transporte-e-recuperacao-da-criacao-de-lore.md):
Node cobre chave antes da cabeça, cancel/adoção/recriação, escopos e hashes;
transporte executa uploads multipart/relações paginadas até adoção.
SDK demo verifica provas/nascimentos, denies e AES-GCM; retake do cancel
comprova que obter chave não libera upload. Cliente protege a allowlist
anterior do journal. HTTP usa verificadores locais, sem provar credenciais
reais. Sem UI nova, Chromium ou ativação; validate integral no fechamento de P1.

### P1 M38c5n — coordenação cliente da criação de lore

[Plano 112](tasks/writer-v2/execucao/112-coordenador-cliente-da-criacao-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-coordenador-cliente-da-criacao-de-lore.md):
209 Vitest dirigidos cobrem criação nativa/retomada, grande campo, controles,
literais, pedidos perdidos e cancel concorrente, junto das regressões de
edição/plano/checkpoint. Guardas Auth protegem wire privado após troca de actor.
Funções reais rodam sobre double, sem comprovar SDK/browser/persistência real;
nenhuma UI foi ativada. Validate integral permanece no fechamento de P1.

### P1 M38c5o — preparação protegida da criação de lore

[Plano 113](tasks/writer-v2/execucao/113-preparacao-e-copia-protegida-da-criacao-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-preparacao-protegida-da-criacao-de-lore.md):
221 Vitest dirigidos em dez arquivos, 38 novos. CreationPreparation/CreationSession
cobrem ticket antes de RPC, cópia cifrada, oncomplete/abort/prefixo, reautorização,
takeover, cancel independente, release/purge limitados e adoção conflitante.
Regressões: CreationOperation, ManualOperation/ManualSession, Journal/
JournalCrypto/JournalSession/CheckpointJournal e EditService.

Quatro jornadas Chromium de armazenamento passaram com migração v2→v3,
recuperação >9 MiB após reinício de processo, cancel e purge em lotes e reserva
incerta sem texto inventado. IndexedDB/WebCrypto/Web Locks reais; Functions
sobre fixtures de banco/identidade, sem provar SDK/Auth/App Check/UI reais.
O bootstrap não oferece advance/apply nem certifica checkpoint persistido.
Validate integral continua no fechamento de P1, sem CI ou envio remoto.

### P1 M38c5p — checkpoint protegido da criação

[Plano 114](tasks/writer-v2/execucao/114-checkpoint-protegido-da-criacao-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-checkpoint-protegido-da-criacao-de-lore.md):
250 Vitest distintos em rodadas, 29 novos. Integração 249/249 em 11 arquivos,
seguida do novo teste de corrida e retakes somente dos afetados: 60/60 em dois
arquivos e 29/29 de checkpoint. Sem somar retakes.

Casos novos incluem write-ahead, outcome sem chave, swaps abortados, prefixo,
controle paginado, coleta/purge atômicos, grants/actor/takeover, aplicação nativa
completa e confirmação explícita de apply perdido. Quatro jornadas Chromium
repetidas comprovam reinício de processo, ponte metadata sem replay e prefixo
interrompido durante AES-GCM. IDB/WebCrypto/Web Locks reais; Functions sobre
fixtures de banco/identidade. Sem SDK/Auth/App Check/UI reais ou executor ativado.
Validate integral continua no fechamento de P1; somente commits locais.

### P1 M38c5q — executor durável da criação

[Plano 115](tasks/writer-v2/execucao/115-executor-duravel-da-criacao-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-executor-duravel-da-criacao-de-lore.md):
274 Vitest distintos em rodadas, em 12 arquivos (24 novos: 22 executor e dois sessão).
Integração inicial: 273/273 em 32.08 s. Revisão posterior conferiu reabertura do
descarte e adicionou confirmação no mesmo handle: retake final de quatro casos
positivos em 10.55 s, com 18 outros não executados nesse arquivo.

Cobertura dirigida inclui dívida/ACK/ponte, ready/apply explícito, origem/token/
geração, prova nativa sem chave, cancel durante produtor/apply, Signal/actor/
host/takeover e intenção vinculada ao checkpoint original. Cinco jornadas
Chromium reais da API passaram com reinício e resposta retida, incluindo
descarte reaberto. Serviços Functions usam fixtures de banco/identidade;
sem comprovar SDK/Auth/App Check/UI reais. Validate integral no fechamento de P1.

### P1 M38c5r — interface da criação protegida

[Plano 116](tasks/writer-v2/execucao/116-interface-da-criacao-protegida-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-interface-da-criacao-protegida-de-lore.md):
77 Vitest distintos em rodadas (21 novos: 20 UI/lista e um sessão). Integração
76/76 em quatro arquivos e, após caso de conflito recorrente, retake de três
afetados positivo; outros 17 não executados nesse retake.
Criar separado de preparar, dados literais/grandes, contexto/actor, callback,
cancel/descartar com espera, foco, navegação/beforeunload e lista paginada.

Três jornadas Chromium com UI/kit/executor reais passaram: ready sem cabeça,
criar/descartar, append perdido após reinício e chave retida sem bloquear purge.
Temas estáveis e mobile 390 px inspecionados, com contraste do textarea >12:1.
Ports Auth/Functions/identidades são fixtures; não certificam SDK/Auth/App Check,
leitor de tela, zoom físico 200% ou segundo dispositivo. Host ainda não foi
montado no compêndio; validate integral permanece no fechamento de P1.

### P1 M38c5s — transporte da retirada

[Plano 117](tasks/writer-v2/execucao/117-transporte-autenticado-da-retirada-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-transporte-da-retirada-de-lore.md):
168 casos distintos positivos (27 novos): 62 Node, 104 Vitest e dois SDK no
emulador Firestore 1.22.0. Retake da sessão 13/13 após tipar mocks.
Auth/envelope/namespace fechados, inspeção sem retirada, replay/cleanup/origem
alterada, actor/host e metadata sem prosa/retry.

SDK confirma timestamps/retirada concorrente/Rules privadas e cancelamento
separado de edição. Admin/cliente Firestore reais em emulador não comprovam
rede Functions/Auth/App Check de produção. Sem mudança de UI.
Build/tipos/smoke/lint positivos; validate integral no fechamento de P1.

### P1 M38c5t — retirada recuperável de lore

[Plano 118](tasks/writer-v2/execucao/118-retirada-recuperavel-de-lore.md) e
[evidência](entregas/2026-10-24-writer-v2-retirada-recuperavel-de-lore.md):
43 Vitest distintos positivos em RemovalOperation/RemovalSession/RemovalService,
30 novos. Cobrem inline/v1/v2, preparar/apply, start perdido, dívida/oncomplete,
cancel independente e ACK tardio, duas abas, paginação, conta/origem e handoff.
Serviços nativos usam ambiente Node; não alterar servidor por diferença de realm.

Três jornadas Chromium distintas repetidas após ajuste final: processo
reiniciado com start perdido, cancel com resposta aceita retida e duas abas.
IndexedDB/Web Locks reais, cinco sentinelas antigas preservadas e clocks
unitários. Functions/banco/identidade são fixtures; não comprovam rede SDK/
Auth/App Check de produção. Build/tipos/smoke/lint positivos; host/compêndio
e validate integral de P1 continuam pendentes.

### P1 M38c5u — interface da retirada recuperável

[Plano 119](tasks/writer-v2/execucao/119-interface-da-retirada-recuperavel-de-lore.md)
e [evidência](entregas/2026-10-24-writer-v2-interface-da-retirada-recuperavel-de-lore.md):
67 Vitest distintos positivos em rodadas (24 novos). Integração 66/66,
retake UI 23/23 e novo guard de token 1/1, com 23 não executados nesse retake.
Preparar/revisar/confirmar, incerteza, dívida, actor/perfil, foco, descoberta,
cancel independente e respostas tardias.

Quatro jornadas Chromium: confirmação explícita/temas/mobile, reinício com
resposta perdida, apply/cancel com respostas retidas/perdidas e nome de 400
caracteres sem overflow a 390 px. UI/executor/IDB/Web Locks reais; SDK/Auth/
banco são fixtures e não comprovam produção. Dark/mobile inspecionados.
Tipos/build/smoke/lint positivos; compêndio/lotes/validate de P1 pendentes.

### P1 M38c5v — retirada conjunta de lore

[Plano 120](tasks/writer-v2/execucao/120-retirada-conjunta-de-lore.md) e
[evidência](entregas/2026-10-25-writer-v2-retirada-conjunta-de-lore.md):
103 casos distintos positivos em rodadas (24 novos): 68 Node, 30 Vitest e
cinco SDK. Node integrado 67/67; retake do lote 20/20 inclui token adicional.
Executor/sessão 30/30. Quatro novos casos SDK passaram na rodada inicial;
regressão singular herdada foi alinhada à barreira hasLoreResources, sem
alterar Rules, e passou no retake. Dois SDK afetados pelo token também passaram.

Cobrem transação conjunta, rollback, frame/privacidade, prova/nascimento,
replay/controles recriados, cleanup/handoff e unidade de 50 membros.
SDK/Admin reais em emulador não comprovam Auth/App Check/limites de produção.
Lint e sintaxe de 254 módulos positivos; app build/typecheck e validate
integral não executados neste incremento backend. Coordenador/UI e P1 abertos.

### P1 M38c5w — tokens independentes por ficha

[Plano 121](tasks/writer-v2/execucao/121-origem-independente-por-ficha-de-lore.md)
e [evidência](entregas/2026-10-25-writer-v2-origem-independente-de-lore.md):
601 casos distintos positivos em rodadas (38 novos): 490 Node,
108 Vitest distintos e três SDK. Node integrado 490/490; cliente 105/105
e retake Auth 11/11 (três casos adicionais). SDK 3/3 em emulador 1.22.0.

Cobrem wire/hash v1 original, token v2 opcional, fonte/conta/ABA/estado,
cursor/paginação, coleção global consistente e 53 origens sem recaptura.
Preparação/adoção, inventário/chave, conflito parcial e guardas da sessão
Auth são exercitados em Node/Vitest com banco em memória e SDK/Auth simulados
na sessão. Os três testes SDK usam Admin/cliente reais em loopback.
Primeira expectativa de privacidade da fixture v2 corrigida, sem mudar Rules.
Lint/tipos/build/smoke e sintaxe 254 módulos positivos. Emulador não comprova
Auth/App Check HTTP, produção, piloto ou UI. Validate integral no fim de P1;
consumidores/seleção/UI/compêndio e demais fases/gates permanecem pendentes.

### P1 M38c5x — seleção durável para retirada

[Plano 122](tasks/writer-v2/execucao/122-selecao-duravel-para-retirada-de-lore.md)
e [evidência](entregas/2026-10-25-writer-v2-selecao-duravel-de-retirada-de-lore.md):
70 Vitest positivos (31 novos, 39 regressões), 2.36s. Cobrem manifesto/
descoberta de 53, oncomplete/abort/CAS, metadados/órfãos, perda de respostas,
cancel independente, fences/aceites, conflitos antes/no apply, dívida/ACK,
prova fria, origem mista inline/v1/v2, journal filho perdido e Auth.

Quatro jornadas Chromium com IndexedDB/Web Locks reais: 53 membros/reinício,
aceite perdido sem replay, cancel por outra aba com produtor retido e perda do
journal filho com preservação do recibo. Cinco stores antigos e uma retirada
alheia preservados por sentinelas, sem reposição na retomada.
Backend/SDK/Auth são fixtures; não comprova UI ou credenciais de produção.

Lint/tipos/build/smoke positivos, 2958 módulos. Docs/formato/arquitetura no
fechamento. Backend/Rules/Node/SDK não repetidos; sem mudança servidor.
Validate integral no fim de P1. UI/visibilidade/compêndio e demais gates abertos.

### P1 M38c5y — revisão e interface da retirada de seleção

[Plano 123](tasks/writer-v2/execucao/123-interface-da-retirada-de-selecao.md)
e [evidência](entregas/2026-10-25-writer-v2-interface-da-retirada-de-selecao.md):
65 Vitest positivos, 34 novos/31 regressões, 4.31s. Incluem 21 UI,
11 revisão C1/v2 e dois novos Auth, além de coordenador/sessão anteriores.

Quatro jornadas Chromium reais de React/kit/serviços/IDB: 53 origens com
confirmação/callback, aceite perdido/reinício sem replay, cancel independente
com respostas retidas/perdidas e fonte alterada durante C1. Retake do primeiro
caso inclui sete Tabs, Escape, foco e retomada da mesma seleção pela lista.
SDK/Auth/banco remoto são fixtures; não comprovam produção ou piloto.

Três temas (contraste 14.21/14.64/12.98:1), viewport 390 px/documento 390,
diálogo x16–374 sem overflow; escuro/mobile inspecionados.
Lint/tipos/build/smoke/styleguide positivos, 2961 módulos.
Backend/Node/Rules/SDK não repetidos, sem mudança servidor. Validate integral
no fim de P1; visibilidade/compêndio e demais fases/gates continuam pendentes.

### P1 M38c5z — prova do aceite original manual

[Plano 124](tasks/writer-v2/execucao/124-consulta-do-aceite-original-da-edicao.md)
e [ADR 0139](decisions/0139-book-lore-edit-original-outcome.md):
28 Node novos verificam escopo, ID manual derivado, origem/hash/tokens,
inline/v1/v2, metadata sem writes, resposta perdida, ausência/órfãos,
provas removidas/recriadas, cancel e criação recusada. Resultado original
preservado após nova edição, aposentadoria/coleta e ausência de livro/cabeça.

Quatro HTTP novos conferem App Check ausente/inválido, handler Auth/DTO
fechado e no-store/Vary, mais retorno metadata em fixture HTTP local.
Não usam token/attestation de produção. 52 regressões Node de adoção e
transporte passam. 60 Vitest (31 novos, 29 regressões) conferem parser fechado,
prova nativa atravessando cliente, hashes/privacidade/tokens e sessão Auth,
incluindo actor substituído com mesmo UID e perfil do mesmo actor preservado.

Três SDK Firestore reais no emulador 1.22.0: leitura só de metadata e sem
writes; Rules privadas de job/recibo para owner e anônimo; aceite histórico
após nova edição/GC/ausência; recibo/âncora recriados com mesmo dado e novo
nascimento recusados. Não validam implantação, credenciais, App Check real,
cleanup integral de livro ou interfaces humanas.

[Resultados e checks](entregas/2026-10-25-writer-v2-consulta-do-aceite-original.md).
Validate completo permanece no fechamento de P1; sem CI/push/deploy.

### P1 M38c6a — gate metadata e flush local

[Plano 125](tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md),
[ADR 0140](decisions/0140-lore-manual-unit-gate-and-local-flush.md) e
[evidência](entregas/2026-10-25-writer-v2-controle-de-unidades-da-visibilidade.md).
155 casos Vitest distintos positivos (dez novos, 145 regressões).
Dez casos ManualGate verificam write-ahead/gate, erro sem envio, actor/host
tardios, cancel sem chave com produtor retido, flush concorrente recusado,
dívida antes/depois de RPC sem produção, cold apply sem replay, ticket local
sem reserva e callback original capturado. Serviços nativos com banco em memória
e harness IDB/WebCrypto/Locks; regressões de Manual/Persisted/Session/Editor/Auth.

Sem mudança backend/Rules/schema/UI, nenhum novo teste SDK ou Chromium.
Lint/tipos/build/smoke positivos; validate completo permanece no fechamento
de P1. Manifesto/ledger/executor/UI de seleção e composição ainda pendentes.

### P1 M38c6b — executor da seleção de visibilidade

[Plano 125](tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md),
[ADR 0141](decisions/0141-durable-book-lore-visibility-selection.md) e
[evidência](entregas/2026-10-25-writer-v2-executor-da-selecao-de-visibilidade.md).
98 casos Vitest dirigidos distintos: 31 novos e 67 regressões. Suite final de
seis arquivos: 97 positivos; mais um caso isolado novo com inline/payload v1/v2.

53 aplicações, mixed/no-op, origem mudada antes/depois de ready, resposta perdida,
retry original, perda de cópia filha, chave negada, cancel de 53 nunca iniciados,
produtor aceito retido/duas instâncias, dívida antes de RPC/ACK local perdido,
prova recriada, conta/host, paginação, CAS/rollback/orfãos e tokens monotônicos.
A corrida de GET de limpeza antigo escrevendo inspectionClosed do membro
seguinte foi reproduzida, corrigida e retestada; a conferência agora fixa membro
e geração e marcador fechado exige referência observada.

Cinco jornadas Chromium novas com protocolo real, IndexedDB/Web Locks/WebCrypto
reais, reinício de contexto, perda de journal, reenvio explícito e duas abas.
Quatro regressões Chromium da retirada após extração da rotina IDB. Todas nove
positivas, com os cinco stores cifrados preservados. SDK/Auth remoto e backend são
fixtures locais; não comprovam deploy, App Check ou credenciais de produção.
Sem nova UI, nenhum gate visual/SR/zoom físico certificado.

Lint/tipos/build/smoke/arquitetura/docs positivos. Backend e Rules sem alteração;
sem repetir Node/SDK. Validate completo continua no fechamento de P1.

### P1 M38c6c — revisão e UI da visibilidade

[ADR 0142](decisions/0142-book-lore-visibility-selection-ui.md) e
[evidência](entregas/2026-10-25-writer-v2-interface-da-selecao-de-visibilidade.md):
87 Vitest positivos (32 novos, 55 regressões) e quatro jornadas Chromium reais.
Revisão C1/v2, bool fixo/retomado, 53 nomes, dívida, retry de uma ficha, cancel
retido e contexto; regressões de retirada e edição manual.

IndexedDB/locks/AES e cliente HTTP de chave reais; backend/Auth/SDK/App Check em
fixtures locais. Três temas, 390px, contraste, foco/Tab/Escape/gatilho positivos;
capturas inspecionadas. Timeout inicial de 60s no caso 53; repetição de 180s
positiva sem mudar produto. Não comprova performance, credenciais ou implantação.
Tipos/lint/bundle 2971/smoke/styleguide positivos; validate no fim de P1.
Sem CI/remoto/deploy; compêndio e demais fases/gates continuam pendentes.

### P1 M38c6d — composição do compêndio em BookPage/LorePage

[ADR 0143](decisions/0143-native-book-compendium-composition.md) e
[evidência](entregas/2026-10-25-writer-v2-compendio-nativo-dos-livros.md):
115 casos distintos em oito arquivos positivos (113 no relatório principal
mais dois de LoreDrawer), incluindo 26 de composição/captura/projeção e 89
regressões. Actor/livro/epoch, fontes literais, 53 alvos, cinco retomadas e
valores atuais após efeitos históricos conferidos.

18/18 Chromium nos seis projetos, sem skipped/flaky: leitura reautorizada,
visibilidade/retirada com confirmação e criação/edição/recuperação reais,
layout/teclado/foco e 320px. IDB/locks/AES e handlers nativos com Firestore em
memória; SDK/Auth/App Check/HTTP de chave em fixtures, rede externa bloqueada.
Sessenta imagens preservadas, seis inspecionadas; build2976/smoke e checks locais
positivos. Não prova produção, piloto humano ou performance real.

EditorLoreSidebar, menções/revisão assistida e demais entradas ainda pendentes.
Validate no fim de P1; fases/gates humanos/comerciais mantidos. Sem CI/remoto/deploy.

### P1 M38c6e — lateral e menções nativas

[ADR 0144](decisions/0144-native-editor-book-lore-authoring.md) e
[evidência](entregas/2026-10-25-writer-v2-lore-nativo-na-lateral-do-editor.md):
124 casos distintos dirigidos em sete arquivos positivos; alvo/nome originais,
busy, C1/v2 inline, contexto, leitura → edição, callbacks locais recusados,
releitura após prova e regressões globais/serviços.

30 jornadas Chromium distintas positivas: matriz de quatro cenários × seis
projetos (24), minimapa/criação em 320px (duas) e regressões do compêndio/resumo
(quatro). A autoria foi repetida nos seis projetos com recarga real antes
da recuperação; não somar essas repetições ao total distinto. Quantidade de
adoções permanece a mesma após retomar.

React/serviços/journal/IDB/locks/AES reais, handlers nativos com Firestore em
memória e SDK/Auth/App Check/HTTP de chave em fixtures isoladas. Capturas
inspecionadas nos três temas e celular; não comprova produção ou piloto humano.
Tipos/lint/build2979/smoke/arquitetura/styleguide/docs/formatação positivos.
Validate no fechamento de P1; sem CI ou envio remoto.

### P1 M38c7 — ciclo das chaves na exclusão

[ADR 0145](decisions/0145-book-lore-recovery-key-deletion.md) e
[evidência](entregas/2026-10-25-writer-v2-chaves-de-lore-na-exclusao-do-livro.md):
85 Node distintos em quatro arquivos e 12 SDK em duas famílias, todos positivos.
Inventário, controles antigos, criação/edição, 20 recuperações, origem ausente,
recriação, cutoff, v1 avançado/completo, rollback e índices residuais cobertos.
Coleta confere fieldMask e nunca lê keyBase64.

SDK 7/7 recuperação e 5/5 exclusão em Firestore Emulator 1.22.0 demo/loopback,
JAR verificado. Denies incluem índice privado, com controle positivo e
rollback real no último checkpoint. Não comprova produção ou rollout.
Sintaxe258/lint/arquitetura/docs/formato/diff positivos; validate no fim de P1.
Sem repetir browser/Vitest/build para essa alteração de backend/Rules.
Sem CI/envio remoto/deploy; demais fases/gates preservados.

### P1 M38c8 — auditoria histórica de recuperação

[ADR 0146](decisions/0146-historical-lore-recovery-key-audit.md) e
[evidência](entregas/2026-10-25-writer-v2-auditoria-das-chaves-historicas.md):
45 Node distintos em dois arquivos e quatro SDK nativos positivos.
Elegibilidade, legado/criação, marcador/provas/UID, revisão velha, recriações,
paginação, ausência, rollback, falha parcial e CLI fechada antes do SDK cobertos.

Executável real gerou e aplicou relatório no emulador; Timestamp legado,
concorrência e rollback do último delete conferidos. Leitura limitada do
arquivo, UTF8/BOM e rejeição de formato/escopo testados. Firestore1.22.0,
JAR verificado/demo/loopback. Sem produção ou certificado de inventário global.

Sintaxe259 e CLI, lint/arquitetura/docs/formato/diff positivos. Sem alteração
de cliente/writers normais; browser/build/Vitest não repetidos. Validate no
fechamento de P1; sem CI/envio remoto/deploy.

## P1 M38c9 A — projeção seletiva do lore

156/156 Node em bookLoreFieldValidation, bookLoreBaseIndex,
bookLoreTextProjection e bookLoreContextRead: 123 regressões e 33 novos casos.
Observação não muda checkpoints; literais/aliases/ausências preservados.
Base >8MiB/128 partes em fluxo, corrupção após prefixo, v2 seletivo, origem,
privacidade e budgets antes do download/retenção conferidos.

4/4 SDK em tests/firestore/bookLoreContextRead.rules.test.mjs, emulador verificado
1.22.0/demo/loopback: base grande, campos não baixados, parte recriada, produtor
real/tombstone e orçamento sem escrita. Retenção lógica não mede pico de heap.
Lint/sintaxe/formato e checks locais; validate integral no fechamento de P1.
[Evidência](entregas/2026-10-25-writer-v2-projecao-seletiva-do-lore.md).
Chat ainda não integrado; nenhum endpoint/Rule/deploy ou validação humana nova.

## P1 M38c9 B — lore lógico no chat

99/99 Node em editorChatBookLore, Context, ContextRead, HistoryRead, Matcher,
Generation e Apply: 16 novos e 83 regressões. Quatro representações, criação
real, >8MiB/128 partes, snapshot exato, budgets/rollback e história por origem
conferidos. Sem provedor pago ou SDK de produção.

Sete cenários SDK distintos positivos no arquivo editor-chat-context: cinco
passaram inicialmente; dois setups corrigidos repetidos isoladamente passaram
2/2. Não é uma execução única de sete positivos. Fixture v2 tinha relations
entre fields; batch legado de 52 creates excedia consultas das Rules. Catálogo
histórico passou a ser semeado com Admin; vencedor/relógio/retirada continuam no
cliente. Nenhuma Rule foi enfraquecida. Lint/sintaxe/formato e checks locais;
validate integral só no fechamento de P1. Sem UI/build/CI/deploy novos.
[Evidência](entregas/2026-10-25-writer-v2-lore-nativo-no-contexto-do-chat.md).

## P1 M38c10 — referências nativas de lore

60/60 Node em bookLoreReferences, scenes, narrativePlanning e
adventureLoreCampaign: 22 novos e 38 regressões. Labels literais, quatro modos,
criação/prova, >8MiB/128 partes, disponibilidade sem chunks, campos v2 não pedidos,
revogação/remoção, orçamento agregado, corrupção/infraestrutura e cursores com
clock/nascimento/submilissegundo conferidos.

8/8 SDK em três execuções selecionadas: quatro novos bookLoreReferences e quatro
regressões de narrativePlanning/scenes. Origem grande/v2/criação e rollback de
último índice comprovados com timestamps/recibos nativos. Emulador 1.22.0
verificado/demo/loopback, sem skipped/falhas. Nenhuma Rule alterada.
Lint/sintaxe/formato/docs/arquitetura/diff; validate global só no fechamento de
P1. UI/build/typecheck/CI/deploy não executados neste marco.
[Evidência](entregas/2026-10-25-writer-v2-lore-nativo-nas-referencias.md).

## P1 M38c11 A — publicação nativa

36/36 Node e 135/135 Vitest dirigidos; onze jornadas integradas percorrem publisher,
C1 e serviços de produção com Firestore/Auth/SDK em memória/fixtures. Quatro
representações, coleção vazia, sombra local/global, metadata, Auth/UID e resposta
perdida conferidos. Cliente ainda captura conteúdo integral; verify só metadata.

19/19 SDK reais no emulador verificado 1.22.0/demo/loopback: seis novos e 13
regressões. Fonte >8MiB/128 partes, projeção/consentimento lógico, bypass negado,
invisibilidade, acesso anônimo, revogação/retirada, rollback e replay concorrente.
Sem skipped/falhas; denegações esperadas das Rules não são falha do runner.
Tipos/build/smoke (2980 módulos), lint/sintaxe e checks locais positivos.
[Evidência](entregas/2026-10-25-writer-v2-publicacao-nativa-marco-a.md).

Sem browser/CI/deploy ou validate global neste marco. Plano 130 B permanece
pendente: publicação acima de 32MiB/512 partes por chamada não está demonstrada;
inspeção incremental/ranges certificados devem resolver a dependência.

## P1 M38c11 B — publicação incremental

139 Node distintos positivos: 136 em bookLorePublication/SourceInspection/
Deletion/EditTransport e três guardas finais novos. 98/98 Vitest em
publicationService, bookLorePublication.integration e bookLoreEditOperation;
13 jornadas integradas, incluindo resposta de inspeção perdida e Auth tardio.
5/5 SDK novos no emulador Firestore 1.22.0 verificado/demo/loopback, sem skipped.

Fonte v1 >32 MiB/512 partes, override v2 >32 MiB, nome aparável grande, criação,
Unicode/escapes, candidato inventado/ausente/sem consentimento, certificado
metadata insuficiente, origem/certificado recriados, retry/CAS/corrupção,
checkpoint privado, cancelamento e exclusão do livro conferidos. Cada tentativa
transacional lê até uma parte; replay confirma recibo sem novos chunks.

Tipos/build/smoke (2981 módulos), lint e checks locais positivos. Primeiros lotes
com caminho .ts inexistente corrigidos para .mjs, incluído no lote final de 98.
Validate/cobertura global só no fechamento de P1; sem browser/CI/remoto/deploy.
[Evidência B](entregas/2026-10-25-writer-v2-publicacao-nativa-marco-b.md).

## P1 M38c12 A — domínio incremental do lore portátil

335 Node distintos positivos em sete arquivos: 333 no lote e dois novos casos
finais de ID máximo/cursor. São 47 novos e 288 regressões de geração, campos/
base/upload/inspeção/publicação. Fontes >8 MiB/128 partes, descrição grande,
10 mil relações, ranges literais, presença/vazio/duplicados, Unicode/escapes,
datas/IDs/enum, truncamento e checkpoints inválidos cobertos.

Três jornadas Chromium reais: 10005778 bytes/153 unidades/130 referências,
checkpoint máximo de 548 bytes no cenário; recarga em UTF-8 parcial; erro puro e
separação da página nativa. Módulo sem Buffer, somente loopback. Bundle browser
Vite de 12 módulos e declaração TS isolada positivos; lint JS e checks locais.
Sem Vitest/SDK/build geral/validate neste marco puro; não é prova de backup ou
restauração integrados. [Evidência](entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md).

## P1 M38c12 B — produtor portátil individual

147/147 Node dirigidos (base/upload/inspeção/publicação): dois novos do observador
e 145 regressões. 114 Vitest distintos positivos: 75 leitor/sessão, 26 produtor
e 13 bridge de publicação; arquivo novo reexecutado após ajuste de fixture Unicode
e validação individual de override. Regressão de injeção confirmada vermelha sem
a correção e verde com ela.

5/5 SDK no Firestore 1.22.0 verificado/demo/loopback com serviço C1 real e cliente
compilado em memória. Fonte >8 MiB/128 partes, v2/criação, leitura única, clock
alterado, parte recriada e SDK direto negado. Sem skipped na execução final;
antes, before do harness corrigido para lista de resultados do build Vite.
Após a revisão dos overrides, somente v2/criação/clock foram repetidos: 3/3,
zero skipped. As três jornadas Chromium também foram repetidas com o ajuste.

Três Chromium com C1 em memória: saída 10005932 bytes/153 partes/161 unidades
distintas, overrides/relações; metadata sem prosa em contexto fresco; pressão
de consumo e troca de ator. Build/typecheck/smoke (2988 módulos), bundle browser
e checks locais positivos. Sem CI/remoto/deploy/validate global. Não comprova
arquivo/restauração integrados: C/D ainda obrigatórios.
[Evidência B](entregas/2026-10-25-writer-v2-composicao-portatil-do-lore.md).

## P1 M38c12 C1 — envelope e budget semântico

43/43 Node novos do envelope/prefixo e 217/217 regressões de campo/base/índice/
upload: 260 distintos positivos. As 120 ordens do envelope, >16 MiB/128 partes,
orçamento 1/17/64, referências densas, UTF-8/IDs/escapes, estado imutável e rejeição
de truncamento/injeção/corrupção cobertos. Código do erro de ID alinhado após
duas falhas iniciais; arquivo novo reexecutado inteiro e positivo.

26/26 Vitest percorrem C1 real → produtor → índice do envelope nos casos positivos.
Três Chromium: fonte 10005932 bytes/153 partes/130 referências, sete pausas e
checkpoint máximo 1047 bytes; recarga em UTF-8 parcial; frame com 1000 relações,
64 referências por passo e rejeição de injeção. Sem Buffer e só loopback.

Bundle browser: 11 módulos/26742 bytes/zero imports externos. Declarações TS,
lint/sintaxe/formato/docs/arquitetura/diff positivos. Sem SDK novo/build geral/
validate neste passo puro. C2/C3/D obrigatórios, sem prova de arquivo/restauração
integrados. [Evidência C1](entregas/2026-10-25-writer-v2-envelope-incremental-do-lore.md).

## P1 M38c12 C2 — validação integrada do lore

232 Node distintos positivos: 15 novos do protocolo incremental e 217 regressões
nos validadores, leitura legada/pequena e consumidores da restauração.
Snapshot servidor máximo 3313 bytes, ponteiro 1566 bytes, 156 partes/10200950 bytes
e mil relações; até 64 referências/commit. EOF/endereço/ordem, replay/CAS,
origem alterada antes do commit, cancel/cleanup e checkpoint antigo cobertos.

13/13 Vitest de runtime/índice e seis SDK distintos positivos. Lote SDK inicial
teve 5/6, com erro de endereço no fixture do chunk; após usar chunkId oficial,
somente o caso afetado foi repetido: 1/1, zero skipped. Emulador verificado,
demo/loopback, provas/recibos/Rules reais; sem Auth/App Check em produção.

Três Chromium pelo serviço público com OPFS cifrado: arquivo 20368971 bytes,
1015 reads/maior 65655 bytes, relatório equivalente e limpeza confirmada; abort
durante lore grande; conteúdo malformado sob selo válido. Build/typecheck/smoke
2989 módulos e checks locais positivos. Não comprova captura/restauração grande:
C3/D/P1/gates continuam. Sem CI/validate global.
[Evidência C2](entregas/2026-10-25-writer-v2-validacao-incremental-do-lore.md).

## P1 M38c12 C3 — captura até o selo real

27/27 Node dirigidos e 75 Vitest distintos positivos: lote 72/72, duas regressões
de ator em selo/close reproduzidas vermelhas e depois 22/22 nos arquivos afetados;
bridge reexecutado 13/13 após incluir base/overrides/deleções. Captura C1 real,
recursos/sink/pressão, fonte congelada e prova imutável cobertos.

Três SDK distintos: dois positivos no lote inicial (arquivo >8 MiB → servidor,
clock), depois somente clock e nova regressão de ator/selo/close: 2/2, zero skipped.
Compilação em memória/Firestore demo verificado; sem Auth/App Check em produção.

Cinco Chromium com arquivo OPFS/índice cifrado reais: 10184266 bytes/164 registros/
163 unidades nativas distintas, base/overrides/deleções e validação pública;
ator/abort/pressão preservando arquivo anterior; selo tardio; close já confirmado
com erro sem sucesso e sem promessa de rollback. Build/typecheck/smoke 2990 módulos,
lint/sintaxe/checks locais positivos. D/roundtrip/P1/validate/gates continuam.
[Evidência C3](entregas/2026-10-25-writer-v2-captura-logica-e-selo-do-backup.md).

## P1 M38c12 D1 — ranges autenticados do lore

69 Node distintos positivos: codec/acesso direto 36, reader novo 18, reader
compatível 15. Fronteiras até parte 10000, arquivo real, Unicode/escapes, >8 MiB
por campo/descrição, ausências, I/O e provas por unidade, cancel/ABA cobertos.
13/13 Vitest no bridge: base/overrides → arquivo → validação → hash integral
do campo em mais de 128 unidades, sem criar raiz. Fixtures não provam retries SDK.
Três SDK distintos positivos: caso grande inicial, depois dois casos afetados
reexecutados 2/2 após corrigir o ID do fixture para chunkId e exigir existência.
ABA de sete documentos, conta, ausência, transação, cancel e Rules sobre alvos
existentes cobertos. Rodada inicial 2/3; retake 2/2, zero skipped.

Três Chromium reais: OPFS 8470397 bytes/130 partes, acesso direto/recarga e
corrupção/abort. Declaração TS, lint e sintaxe dirigidos positivos.
[Evidência D1](entregas/2026-10-25-writer-v2-leitura-indexada-do-lore-restaurado.md).
D2/D3/roundtrip/P1/validate/gates continuam; sem CI ou produção.

## P1 M38c12 D2 — remap e medição por campo

255 Node distintos positivos: 231 regressões, 12 transformador e 12 projeção.
Projeção inicialmente 11/12 por tamanho errado do fixture; corrigido somente
o fixture e repetido o caso afetado 1/1. Fonte <8 MiB cresce para >8 MiB após
remap com hash/tamanho exatos, checkpoints limitados e provas por unidade.
13/13 Vitest do arquivo real até o leitor projetado; três Chromium reais:
9,9 MB literais, recarga em alvo UTF-8 e 2000 alvos com orçamento 64 por avanço.
Dois SDK positivos, zero skipped, 399298.3364 ms: crescimento/medição e retomada
com reader novo após avanço nativo; observação local presente/ausente, índice
recriado, cancel/outro usuário e commit recusado. Não é persistência D3 ou retry
forçado. Tipos/lint/checks dirigidos positivos. Veja a
[evidência D2](entregas/2026-10-25-writer-v2-remap-incremental-do-lore-restaurado.md).
D3/materialização/roundtrip/P1/validate/fases/gates continuam; sem CI ou produção.

## P1 M38c12 D3 em andamento — núcleo de corpos nativos

84 Node distintos positivos: 26 do gravador, 17 estrutura e 41 codec. Lote inicial
novo 14/15 expôs a fronteira estrutural que ainda montava lore grande; corrigida
e retestada 1/1. Lote posterior 82/83 por comparação Buffer/Uint8Array do fixture;
correção e novo caso de saída vazia conferidos 2/2. Não é um lote único de 84.
Corpos >8 MiB, árvore ímpar, partial/journal, captura pré-await, SHA, cancel/cleanup
em todos os estágios e sete recriações cobertos. Coordenador nativo de teste
não substitui a integração completa D3. Três SDK positivos, zero skipped,
182884.5849 ms: partial/Merkle/partes reais, Rules em alvos existentes, fragmentos
vazios/updateTime/cleanup e controle recriado preservado. Checks locais na
[evidência](entregas/2026-10-25-writer-v2-gravador-incremental-de-corpos-de-lore.md).

## P1 M38c12 D3 em andamento — geração e datas portáteis

365 Node distintos positivos em lotes dirigidos, 63 Vitest e quatro jornadas
Chromium para páginas completas, datas lógicas ausentes/zero, C1 e produtor
portátil. Fixtures de geração usam advanceLore real e reabrem o serviço em cada
unidade. Leitor preparado é harness privado, sem raiz ou ativação geral.
SDK e contagem discriminada na [evidência](entregas/2026-10-25-writer-v2-geracao-indexada-de-lore-restaurado.md).
Counts/drenagem/roundtrip, habilitação coordenada e validate de P1 continuam.

## P1 M38c12 D3 em andamento — reconciliação indexada

34 Node distintos positivos (22 Counts anteriores, 12 novos), em lotes dirigidos:
campos/descrições >8 MiB e orçamento <=3 partes por transação, replay, rollback/
retry, cancelamento concorrente, bytes inválidos e seis dependências recriadas.
A instrumentação exclui o oráculo integral privado executado depois de Counts;
falha inicial e repetição seletiva registradas na
[evidência](entregas/2026-10-25-writer-v2-reconciliacao-indexada-do-lore.md), junto ao SDK.
Sem nova fronteira browser; validate global permanece no fechamento de P1.

## P1 M38c12 D3 em andamento — drenagem dos temporários

60 Node distintos positivos: Counts 22, payload anterior 16, reconciliação 12 e
drenagem dez. Conferem lotes de oito pares, saldo/cancelamento/retry/replay,
conteúdo final intacto e órfãos/recriados/estrangeiros preservados ao recusar.
A falha inicial da asserção de replay e a repetição seletiva estão na
[evidência](entregas/2026-10-25-writer-v2-drenagem-do-lore-restaurado.md), junto ao SDK.
Sem nova fronteira browser; validate global permanece no fechamento de P1.

## P1 M38c12 D3 em andamento — port preparado e recaptura

118 Node distintos positivos (95 C1 anteriores, 23 novos), sete Vitest de
recaptura/segunda restauração, dois SDK e quatro Chromium. Conferem origem e
provas por unidade, conta/fase/ABA, datas pequenas ausentes/zero, arquivo mínimo
selado grande, perda de autorização/journal e abort OPFS. Falhas de fixtures/
asserções, seleções dirigidas e limites estão na
[evidência](entregas/2026-10-25-writer-v2-leitura-preparada-e-recaptura-do-lore.md).
Não é roundtrip integral do livro original, host/UI ou Auth de produção.
Validate global permanece no fechamento de P1.

## P1 — inventário final da preparação

bookRestoreAudit.test.mjs: 18/18 positivos no lote final; 17/17 sourceIndexes
anteriores, total de 35 casos distintos. Metadata/páginas limitadas, nenhum write
em conteúdo, fase/CAS/conta, retomada/replay/retry, origens recriadas, órfãos,
filhos aninhados, perfis estrangeiros, capa e cancelamento/saldo exato.
Dois SDK reais verificam timestamps/Rules e journal recriado; detalhes e limites
na [evidência](entregas/2026-10-25-writer-v2-inventario-final-da-restauracao.md).
Sem nova fronteira de UI; validate global permanece no fechamento de P1.

## P1 — revisão da ativação

bookRestoreActivationReview.test.mjs tem 20 casos distintos positivos em lotes
dirigidos: nenhuma mutação, resumo limitado, fase/conta/CAS nativos, universo
revogado/recriado/unavailable, dependências recriadas, Storage/prova divergentes,
cancelamento/raiz concorrentes e preservação do manuscrito/histórico/rascunho.
Três regressões de replay/cancelamento de auditoria também passaram. Resultados
SDK, correções de fixtures e limites na
[evidência](entregas/2026-10-25-writer-v2-revisao-da-ativacao-de-livros.md).

## P1 — núcleo da ativação privada

bookRestoreActivation.test.mjs: 22 casos distintos positivos em seleções; revisão
mais upload: 33/33. Conferem transação, leitores normais, literalidade, CAS,
rollback/retry/replay, origens/usos recriados, capa pendente e histórico após
exclusão. Dois SDK reais provam timestamps do commit, vínculos/Rules/procedência
e registro/uso da capa. Sharp é resolvido pelo pacote functions já instalado.
Resultados e limites na
[evidência](entregas/2026-10-25-writer-v2-ativacao-atomica-de-livros.md).
Mídia/host/roundtrip/validate de P1 continuam pendentes.

## P1 — finalização da capa restaurada

47 Node distintos positivos em seleções: 24 serviço e 23 Storage; cinco usam SDK
GCS real/HTTP loopback, incluindo geração/metageração >2^53, PATCH perdido e 412.
Um SDK Firestore real prova commit da imagem/raiz/conclusão/recibo, retomada,
Rules privadas e preservação da ativação. Estados atuais e imagem recriada
cobertos pelo Node. Correções de fixtures/asserções e escopo dos mocks na
[evidência](entregas/2026-10-25-writer-v2-finalizacao-da-capa-restaurada.md).
Sem UI nova ou validate global repetido; fechamento de P1 continua obrigatório.

## P1 — limpeza após ativação

27 casos Node de limpeza e cinco de mídia positivos em seleções dirigidas,
incluindo origens recriadas, replay/CAS/retry/rollback, exclusão durante I/O,
totais exatos, livro editado/excluído, lore/fontes grandes e JSON v1–v6.
Um SDK Firestore real prova remoção normal da capa, preservação de dados e
timestamps, leitores normais, 13 namespaces vazios, Rules privadas e recusa
do controle recriado. Resultados e limites na
[evidência](entregas/2026-10-25-writer-v2-limpeza-pos-ativacao.md).
Sem nova UI ou validate global; fechamento de P1 e inventário completo pendentes.

## P1 — transporte de restauração

100 Node distintos positivos em seleções: 36 fronteira, 45 host e 19 regressões.
Wrapper HTTP Functions real recusa App Check ausente/inválido mesmo com Auth
válido no teste; verificadores sintéticos isolam os gates sem bypass em runtime.
Exports/configuração, conta, entrada fechada e ausência de ports internos
verificados. Serviço real confirma consulta/mídia/limpeza sem alterar a raiz.
Falha de asserção corrigida e limites dos verificadores na
[evidência](entregas/2026-10-25-writer-v2-transporte-da-restauracao.md).
Não comprova credenciais ou Callable de produção; validate integral de P1 pendente.

## P1 — sequenciador de preparação do cliente

75 Vitest distintos positivos em seleções: 52 driver/contratos, 21 adaptador e
duas integrações com serviço real. Conferem fases, intenção/CAS antes de envio,
resposta perdida/replay, concorrência/conta/identidade/recibo e parada antes da
ativação. Arquivo atual e JSON v6 chegam à revisão privada real com raiz ausente.
Falha de seleção corrigida para índices completos, ajuste da asserção do double,
durações e alcance na
[evidência](entregas/2026-10-25-writer-v2-preparacao-retomavel-no-cliente.md).
Journal em memória não comprova recuperação após recarga; UI/validate pendentes.

## P1 — journal protegido da preparação

35 Vitest distintos positivos em seleções: chave HTTP/contexto, crypto/AAD/
não extração, coordenação do journal e proxy exato. Dez cenários Chromium
nativos positivos provam IndexedDB/Web Locks, reinício completo, abas, aborto,
revogação/adulteração, CAS contra escritor externo e driver com resposta perdida
retomando o mesmo pedido. Serviço remoto/grants são simulados; não há prova de
credenciais ou Firebase de produção. Correções/checks e alcance na
[evidência](entregas/2026-10-25-writer-v2-journal-protegido-da-preparacao.md).
Validate integral de P1 e UI/roundtrip continuam pendentes.

## P1 — IDs e contratos iniciais de envio

65 Vitest distintos positivos em seleções: driver/transferência, regressões
afetadas e preparação real atual/JSON v6. Hash e IDs comparados com o código
real do servidor; valores inválidos não chegam ao journal. Um Chromium do
driver/journal também passou após reinício. Fixtures corrigidas e limites na
[evidência](entregas/2026-10-25-writer-v2-contratos-iniciais-do-envio.md).
Upload/checkpoint e UI ainda não implementados; validate de P1 continua aberto.

## P1 — inspeção e upload retomável

46 Vitest distintos positivos em seleções cobrem revisão local, metadata inicial,
start/fence/recibos reais, transferência limitada, IDs/checkpoints, prefixo,
concorrência, conta e cancelamento. Oito cenários Chromium positivos incluem
bootstrap nativo e fluxo OPFS/arquivo até revisão real, com dois reinícios e
respostas perdidas. Raiz permaneceu ausente.

Ver [evidência e limites](entregas/2026-10-25-writer-v2-inspecao-inicio-e-envio-de-backups.md),
incluindo volume local de RPC/chave e fronteiras simuladas. Sem prova de produção,
UI ou roundtrip integral; validate de P1 continua pendente.

A restauração no Estúdio possui testes dirigidos de diálogo/lista, pausa,
confirmação explícita, origem de arquivo, respostas tardias e acesso atual antes
de navegar. Harness Chromium externo prova armazenamento nativo e fluxo com
três reinícios/respostas perdidas até ativação e limpeza; identidade/SDK são
simulados. Consulte a [evidência](entregas/2026-10-25-writer-v2-restauracao-no-estudio.md)
para limites e resultados, sem inferir infraestrutura de produção.

O [roundtrip normal dos livros](entregas/2026-10-25-writer-v2-roundtrip-normal-dos-livros.md)
usa serviços e streams reais com ports de banco/índice/journal em memória para
comparar conteúdo atual/legado por remap, datas nativas declaradas e bytes
literais. Testes SDK separados provam máscaras/páginas/Rules; Chromium separado
prova JSON v6/recuperação nativa. Não inferir implantação ou inventário global.

A [compatibilidade do rascunho marcado](entregas/2026-10-25-writer-v2-ausencia-de-persona-no-rascunho.md)
tem 32 Node, 16 Vitest da captura e dois roundtrips selecionados positivos,
incluindo retomada, recusas, ausência neutra, estilo antigo, vazio/removido e
recaptura. Banco/ports em memória não comprovam produção nem validate global.

A [revisão renovada na ativação](entregas/2026-10-25-writer-v2-revisao-renovada-na-ativacao.md)
tem 65 Node e 29 Vitest distintos positivos em seleções, um SDK real com três
ordens concorrentes e oito verificações Chromium. Inclui falhas inicialmente
encontradas no selo/limpeza, retomada nativa e segundo clique obrigatório.

O [backup completo no editor](entregas/2026-10-25-writer-v2-backup-completo-no-editor.md)
tem 22 Vitest distintos positivos em seleções e 13 verificações Chromium
(exportação e restauração do arquivo produzido), incluindo cancelamento, falha
durante captura, preservação do arquivo anterior, conta/contexto e foco/temas.
Handle nativo OPFS injetado não substitui conferir o seletor externo do sistema.

A [projeção de persona no editor](entregas/2026-10-25-writer-v2-metadata-de-persona-no-editor.md)
passou 69 testes do serviço de livros (sete novos), incluindo DTO real → rascunho
portátil vazio, sem lookup. I/O Firestore simulado; sem nova prova de produção.

A [política fixada do lore](entregas/2026-10-25-writer-v2-modo-de-lore-fixado.md)
tem 70 Node distintos em seleções e dois SDK positivos. Testa configuração
oposta, retry, imutabilidade, prefixos legados/indexados, intervalo entre fichas
e candidato sem journal. Fixtures corrigem timestamps, sem relaxar servidor.
