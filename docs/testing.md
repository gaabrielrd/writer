# Testes

## Filosofia

Testamos o **comportamento observável** da aplicação: o que o usuário vê e faz. Não testamos detalhes internos de implementação. Um bom teste continua passando mesmo que você reorganize o código por dentro, desde que o comportamento continue o mesmo.

Durante ajustes, execute somente os testes necessários para o comportamento
afetado. Repita ou amplie a suíte quando uma nova mudança, falha ou risco de
integração justificar; preserve `npm run validate` no fechamento do incremento.
Por decisão do operador em 2026-10-15, acompanhe a CI em paralelo sem parar o
próximo incremento validado localmente. Registre a CI pendente e seus resultados
reais, seguindo o [processo de desenvolvimento](development-process.md).

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
