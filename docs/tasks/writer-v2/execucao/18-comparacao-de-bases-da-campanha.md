# F2-07 C3A — Capturar candidata e comparar bases da campanha

**Estado:** implementado e validado localmente em 2026-10-17; CI do novo head
pendente. [Entrega C3A](../../../entregas/2026-10-17-writer-v2-comparacao-de-bases.md).
**Base:** C2 validado localmente e enviado em `16d90b9`; CI em paralelo.
**Origem:** [campanhas](14-campanhas-e-variantes.md),
[domínio D-02](02-modelo-de-dominio.md), [captura B](15-captura-de-aventura.md) e
[variantes C2](17-variantes-de-lore-da-campanha.md).

## Objetivo e sequência

Permitir ao mestre preparar uma nova captura completa da aventura própria e
compará-la com a base atual, antes de decidir atualizar a campanha. Mostrar
adições, alterações e retiradas por identidade; indicar variantes/retiradas locais
que exigirão decisão na adoção. Nenhuma diferença é aplicada automaticamente.

C3A entrega candidata e comparação somente leitura. C3B continua obrigatório:
aceite explícito, continuidade das variantes, tratamento de pedidos da base
anterior e troca atômica dos ponteiros. Exclusão integral da campanha permanece
em incremento próprio, incluindo bases/candidatas, notas, variantes, chaves e pins.
Esta divisão não reduz F2-07 a um comparador sem adoção.

Não há nova escolha de produto necessária para comparar: D-02 já exige comparação
antes de atualizar. Suposição: candidatas são retidas até descarte explícito;
nenhuma regra de TTL é criada. Depois de pronta, a candidata é congelada e não
acompanha novas edições da origem. Outra conferência exige outra captura.

## Descoberta confirmada

- B reserva campanha inexistente, deriva campaignId/baseId do captureId e cria o
  root/vínculo somente na ativação. Seus endpoints não servem para anexar uma
  candidata a campanha existente. Reutilizar o motor, sem simular outra campanha.
- `readCampaignBase` resolve apenas activeBaseId; leitores B não recebem permissão
  para escolher arbitrariamente qualquer geração pronta.
- C2 vincula controle, overlay, chunks e recuperação à base. Trocar apenas
  activeBaseId quebra essa continuidade; C3A não faz essa troca.
- `sourceKey` é digest da origem tipada. sceneReference usa
  digest({kind:'sceneReference',sceneId,id}); narrativeLink usa
  digest({kind:'narrativeLink',id}). Retarget é retirada+adição, sem inferência.
- `imageKey=digest({imageId})` é estável; o pin inclui baseId e é particular da
  geração. Alt/legenda pertencem ao item que usa a imagem.
- Itens B não possuem um hash semântico único. ID técnico de chunk, pin,
  bodySourceKey ou data da captura não comprova mudança autoral.
- Referências são filhos sem quantidade global limitada; não calcular o hash de
  uma cena percorrendo todos os seus links na mesma leitura.
- Graph `writer-v2` foi consultado/reindexado; não retornou estes símbolos.
  A descoberta usou os arquivos conhecidos e foi reconferida independentemente.

## Persistência, identidade e estados

- `users/{uid}/campaignComparisons/{comparisonId}`: schemaVersion 1, dono,
  campaignId, campaignToken preciso, currentBaseId, candidateBaseId, adventureId
  derivado da procedência, sourceToken, checkpoint, fase, contagens e datas.
- `users/{uid}/campaignComparisonOperations/{operationId}`: fingerprint do pedido,
  comparisonId e checkpoint confirmado; sem corpo ou chave.
- `users/{uid}/campaignComparisonStartFences/{comparisonId}`: hash do input inicial
  e identidades próprias para encerrar explicitamente start desconhecido; sem
  origem/root/candidata. Start consulta esse fence na mesma transação de criação.
- Candidata fica em `users/{uid}/campaignBases/{candidateBaseId}`, com os cinco
  grupos B: items, bodies, links, loreReferences e images.
- comparisonId é o operationId da criação. candidateBaseId é digest de namespace
  próprio, UID, campaignToken e comparisonId; já nasce ligado ao campaignId existente.
  Replay confere todos esses campos. Não confiar em IDs/caminhos fornecidos pelo cliente.
- Controle: preparing → ready; preparing pode abortar. preparing/ready/aborted
  podem ir para deleting → deleted por descarte explícito e limpeza retomável.
- Geração acompanha preparing/ready/aborted/deleting. Ready só após captura íntegra
  e conferência final. Não há root parcial nem chamada de ativação em C3A.

Nenhuma escrita em activeBaseId, procedência, metadados próprios, vínculo,
checklist, notas, variantes, créditos ou operações/chaves C2. Candidata recebe
seus próprios pins de mídia e não reutiliza os pins da base ativa.

## APIs privadas implementadas

Entradas são fechadas; UID vem da autenticação. Callables conservam App Check.

| Operação                       | Entrada e resultado                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| getCampaignComparisonSource    | campaignId, currentBaseId; retorna campaignToken, base observada e sourceToken atual autorizado, sem corpos.             |
| startCampaignComparison        | campaignId, campaignToken, currentBaseId, expectedSourceToken, operationId; reserva controle/candidata estáveis.         |
| resolveCampaignComparisonStart | Input original de start e intent: cancel; confirma o pedido conhecido ou grava fence antes de limpar seu controle local. |
| getCampaignComparison          | comparisonId; progresso próprio retomável, com identidades e disponibilidade.                                            |
| listCampaignComparisons        | campaignId opcional, cursor, limit; controles próprios paginados para retomar/limpar, inclusive após perder a origem.    |
| advanceCampaignComparison      | comparisonId, operationId, expectedCheckpoint; uma etapa B limitada; finaliza ready sem ativar.                          |
| cancelCampaignComparison       | mesmo envelope de avanço; bloqueia e limpa somente a candidata por páginas.                                              |
| listCampaignComparisonChanges  | comparisonId, group, kind opcional, change opcional, cursor, limit; janela da união autorizada.                          |
| readCampaignComparisonItem     | comparisonId, sourceKey, side current/candidate, cursor, limit; item/texto daquele lado, com projeção e chunks B.        |
| readCampaignComparisonImage    | comparisonId, imageKey, side current/candidate; bytes autenticados, sem paths/tokens permanentes.                        |

Grupos: source, items, references e images. Source compara title/synopsis/language
congelados da raiz, em par único com chave digest({kind:'source',adventureId}).
Kind restringe apenas items aos sete tipos B.
Change: added/changed/removed/unchanged; filtro é aplicado após projeção, sem total
global inventado. Referências têm detalhes projetados na própria linha limitada;
se precisarem paginação de detalhe, adicioná-la ao contrato antes de implementar,
sem ampliar o DTO silenciosamente.

Progresso sempre ecoa schemaVersion, ownerId, comparisonId, campaignId,
campaignToken, currentBaseId e candidateBaseId, além de state/phase/checkpoint,
processed/counts, sourceAvailable, cleanupComplete e reason. Sem autorização da
origem, omitir título e contagens derivados; manter apenas controle próprio.
Recibo não devolve DTO histórico como se ainda fosse atual: replay reautoriza e
retorna progresso atual do mesmo pedido.

Mutações retornam recibo imutável separado do progresso atual: operationId, action
start/advance/cancel, expectedCheckpoint (null no start) e confirmedCheckpoint.
Start confirma checkpoint 0; passos confirmam o checkpoint efetivamente gravado.
O progresso pode estar além dessa confirmação por outra aba; cliente exige
identidade/recibo exatos e progress.checkpoint >= confirmedCheckpoint. Não exige
expected+1 de uma resposta de replay. Conferir o fingerprint original no servidor.

Resolver start exige escolha explícita e o input original integral. Se recibo/job
existe, devolve a confirmação/progresso próprios, sem cancelar job implicitamente.
Se ambos faltam, grava fence do input e retorna confirmação sem candidata. Não
autoriza origem nem cria root para isso. Corrida com start é serializada pelas
leituras de job/recibo/fence na transação; criação tardia fica impedida. Mesmo ID
com outro payload falha. Start que encontra fence devolve confirmação de cancelado,
sem tentar criar. Lista vazia não comprova ausência nem autoriza apagar o journal.

## DTOs operacionais fechados

Todos os números de revisão/checkpoint/contagem são inteiros seguros não negativos.
Datas são milissegundos válidos. ID de recurso segue validação existente; tokens e
IDs de geração têm 64 caracteres hexadecimais. Nenhum DTO aceita campos extras.

```ts
type ComparisonIdentity = {
  schemaVersion: 1;
  ownerId: string;
  comparisonId: string;
  campaignId: string;
  campaignToken: string;
  currentBaseId: string;
  candidateBaseId: string;
};
type ComparisonState = 'preparing' | 'ready' | 'aborted' | 'deleting' | 'deleted';
type ComparisonPhase =
  | 'parts'
  | 'scenes'
  | 'blocks'
  | 'sceneReferences'
  | 'arcs'
  | 'milestones'
  | 'events'
  | 'narrativeLinks'
  | 'lore'
  | 'images'
  | 'finalizing'
  | 'complete'
  | 'cleanup';
type ComparisonReason =
  | 'source-changed'
  | 'source-unavailable'
  | 'campaign-changed'
  | 'campaign-unavailable'
  | 'base-changed'
  | null;
type ComparisonProgress = ComparisonIdentity & {
  state: ComparisonState;
  phase: ComparisonPhase;
  checkpoint: number;
  processed: number | null;
  counts: {
    part: number;
    scene: number;
    block: number;
    arc: number;
    milestone: number;
    event: number;
    lore: number;
    loreReference: number;
    image: number;
  } | null;
  sourceAvailable: boolean;
  cleanupComplete: boolean;
  reason: ComparisonReason;
  createdAt: number;
  updatedAt: number;
};
type StartInput = {
  operationId: string;
  campaignId: string;
  campaignToken: string;
  currentBaseId: string;
  expectedSourceToken: string;
};
type ComparisonMutationResult = {
  receipt: {
    operationId: string;
    action: 'start' | 'advance' | 'cancel';
    expectedCheckpoint: number | null;
    confirmedCheckpoint: number;
  };
  progress: ComparisonProgress;
};
type StartCanceled = {
  kind: 'canceled';
  schemaVersion: 1;
  ownerId: string;
  request: StartInput;
};
type ReadEnvelope = ComparisonIdentity & {
  currentCapturedAt: number;
  candidateCapturedAt: number;
  collectionRevision: number;
  comparisonToken: string;
};
```

Source é null quando origem/campanha própria estiver indisponível. Quando
autorizado, retorna schemaVersion, ownerId, campaignId, campaignToken,
currentBaseId, currentCapturedAt, adventureId e sourceToken. Base informada
divergente da ativa produz conflito, sem selecionar outra silenciosamente.

Progresso conta recursos processados; mudança de fase/finalização não precisa
incrementar processed. loreReference mapeia o contador deduplicado reference de B,
não todos os documentos links. Sem autorização atual, processed/counts são null;
GET não modifica o estado persistido para representar indisponibilidade. reason
pode refletir o gate atual ou o aborto registrado. deleted tem cleanupComplete
true, fase cleanup; ready tem fase complete. Não devolver percentuais/totais de links.

Start retorna ComparisonMutationResult ou StartCanceled quando já há fence.
Resolver retorna `{kind:'confirmed',...ComparisonMutationResult}` se conhecido,
ou StartCanceled com eco integral do pedido inicial. Nunca responder cancelado
apenas porque o job não apareceu numa consulta. Advance/cancel retornam somente
ComparisonMutationResult. Checkpoint do recibo é imutável; progresso é atual.
Get retorna ComparisonProgress. List retorna `{items:ComparisonProgress[],nextCursor}`,
padrão 25/máximo 50, createdAt descendente e `__name__` ascendente, cursor vinculado
ao UID e filtro campaignId. O cliente não usa datas para inferir revisão.

Lista de diferenças retorna ReadEnvelope com items/nextCursor. Linha é união
discriminada por group, com key/change/currentSummary/candidateSummary:

| Group      | Resumo autorizado de cada lado                                                   |
| ---------- | -------------------------------------------------------------------------------- |
| source     | `{title,synopsis,language}` congelados; exatamente um par.                       |
| items      | `{sourceKey,kind,parentKey,title,archived,orderContext}` e campos específicos B. |
| references | `{key,kind:'scene' ou 'narrative',sourceKey,targetKey,available}`.               |
| images     | `{imageKey,preview:'unchecked'}`.                                                |

orderContext é null em lore e `{previousKey:string|null,nextKey:string|null}` nos
demais tipos. Cena acrescenta stage; bloco type/audience/role; evento dateLabel;
lore category, preservando validações canônicas B. Não devolver rank bruto como
semântica da ordem. Linha items tem orderContextChanged boolean; nas fichas é false.
Somente linha lore acrescenta local `{mode:'base'|'override'|'removed',revision}`
ou null e requiresReview boolean, verdadeiro se há diferença da origem e
override/removed particular. Outros grupos não devolvem corpo/estado C2.

Detalhe retorna ReadEnvelope e side/key (sourceKey pedido), item B projetado ou
null, chunks `[{field,index,content}]` e nextCursor. Cada cursor inclui também
side/key/campo/posição da página. Não aceitar resposta do outro lado mesmo que as
duas identidades da campanha sejam corretas. Mídia retorna ReadEnvelope e side/key
(imageKey pedido)/dataUrl. Derivado WebP até 1,5 MiB, original lido até 16 MiB,
conforme B; teto JSON de 4 MiB preservado. Sem imagem persistida no navegador.

Sinopse é a única exceção explícita à ausência de corpos na lista: metadado da
raiz limitado a 4.000 caracteres pelo escritor atual. Não é manuscrito/filho.
Comparar sem truncamento; registros inconsistentes falham explicitamente.

## Captura consistente e limpeza

Reutilizar fases B: parts, scenes, blocks, sceneReferences, arcs, milestones,
events, narrativeLinks, lore, images e finalizing. Inclui arquivo, cenas sem parte,
texto legado, planejamento, ordem, audiências, ilustrações e lore somente por
referências explícitas, conforme escolha do operador. Não copiar história,
checklist, metas, recuperação, notas, variantes ou recibos da mesa.

Cada avanço compara campaignToken/currentBaseId e o sourceToken reservado. Uma
mudança durante a captura ou antes da finalização persiste aborted com motivo e
recibo, sem lançar erro que reverta o aborto. Root removido/recriado, deleting,
transferência de dono ou troca de base também bloqueiam o avanço. Edição só de
título/descrição/vínculo organizacional da campanha não altera sua encarnação nem
obriga a recapturar. Corrida entre dois avanços é resolvida por checkpoint/CAS.

Depois de ready, edições vivas posteriores não mudam a candidata. Leituras exigem
autorização atual, sem exigir igualdade com o sourceToken do conteúdo vivo. A UI
mostra capturedAt e a natureza congelada dos dois lados. C3B fechará o gate final
para adoção; C3A não promete que uma candidata antiga continua pronta para adotar.

Cancelamento primeiro marca controle/geração deleting, revogando leituras; depois
limpa os cinco grupos em lotes de 25, liberando apenas usos da candidata. Confere
que ela não se tornou ativa antes de limpar, proteção necessária para C3B futuro.
Get/list/cancel do controle próprio continuam possíveis após perder origem/root,
sem devolver conteúdo derivado. Cada passo tem checkpoint/recibo; mesmo pedido
repete confirmação, outro pedido no mesmo checkpoint conflita. deleted implica
cleanupComplete. Erro de Storage conserva etapa retomável, sem apagar outro pin.

## Projeção e diferenças

Leitor novo autoriza o controle, a encarnação atual e a relação entre as duas
gerações antes de selecionar o lado. Não aceitar baseId arbitrário. APIs B seguem
restritas à base ativa; C2 segue restrito ao seu contrato. Fonte e alvos são
autorizados antes de ler/expor nomes, aliases, relações, mudanças ou mídia.

Envelope de leitura: schemaVersion/ownerId/comparisonId/campaignId/campaignToken,
currentBaseId/candidateBaseId, collectionRevision C2 e comparisonToken. O token
vincula projeções atuais dos dois lados e essa revisão; não substitui autorização.
Mudar a projeção ou uma variante invalida a janela inteira. A candidata permanece
para nova consulta; nenhuma variante/rascunho é reaplicada. Cliente descarta
resultados tardios após troca de UID/campanha/job/base/projeção ou revisão observada.

Cada linha contém key/group/change, currentSummary|null, candidateSummary|null e,
somente para lore, local:{mode,revision}|null. Ficha retirada ou variante junto de
diferença da origem recebe indicação de revisão necessária, sem escolha automática.
Não trazer o corpo C2 na lista; edição continua no painel C2, fora da comparação.

- **Itens:** comparar campos autorais de metadados, manifestos textuais por
  field/hash/bytes e relações de lore projetadas. Ignorar geração técnica,
  bodySourceKey, índices de chunks, datas de captura e contadores temporários.
  Preservar diferenças reais de arquivo, audiência, hierarquia, texto e
  vínculo/alt/legenda de imagem. Relações ocultas não participam do fingerprint.
- **Referências:** grupo próprio por linkKey, autorizando fonte e destino de cada
  lado. Não agregar todos os filhos ao hash da cena/arco. Referência indisponível
  conserva somente a projeção de vínculo quebrado permitida por B, sem identidade,
  nome ou descrição privados. Nunca resolver pelo lore vivo/nome.
- **Ilustrações:** grupo próprio por imageKey; conferir biblioteca/pin da geração.
  Comparar identidade congelada dos bytes internamente, ignorando useKey técnico.
  Não devolver imageId, path, geração Storage ou URL permanente. Alt/legenda por
  uso continuam no item. Falha de mídia/autorização não equivale a retirada autoral.

Ausência real e indisponibilidade são distintas. Se um lado existente não puder
ser autorizado, omitir o par, sem exibir seu título ou classificá-lo como retirada.
Hash bruto de campos/arestas ocultos não pode gerar uma diferença visível.
Não expor o fingerprint interno como prova de conteúdo revogado.

Ordem autoral é contexto de adjacência, não rank bruto. Para part/scene/block/arc/
milestone/event, consultar predecessor e sucessor por kind, parentKey e archived,
ordenando (orderKey, `__name__`) e limitando cada consulta a um documento. Inverter
ambos os campos para o predecessor. Quatro vizinhos por par entram no orçamento.
Lore não usa ordem autoral e ignora orderKey. Rebalance sem mudar sequência resulta
unchanged. Inserção/remoção/reordenação podem alterar contexto dos vizinhos; DTO/UI
indicam “contexto de ordem alterado”, sem inferir qual item foi movido. Comparar
IDs opacos dos vizinhos, sem ler seus corpos ou entregar seus nomes.

Referência quebrada permitida não equivale a linha não autorizada: fonte autorizada
pode entregar a projeção B com available false e targetKey null. Revogação da
própria fonte/linha omite o par inteiro. Mídia exige gate de registro/biblioteca/pin
para listar; preview é unchecked e não faz readGeneration na lista. Byte/generation
ausente, descoberto na leitura lazy, falha/oculta a prévia sem virar removed.

## Limites e paginação

- Captura: um recurso por transação, chunks de até 64 KiB e writes preparados
  até 2 MiB, como B; sem truncamento ou quota arbitrária de tamanho do acervo.
- Identidades: duas consultas ordenadas por `__name__`, máscaras pequenas, janela
  padrão 25/máximo 50; unir sourceKey/linkKey/imageKey e processar em ordem.
- Leitura de comparação: até 4 MiB serializados e 512 documentos por chamada,
  incluindo gates/consultas. Resposta também até 4 MiB; sem manuscrito/filhos,
  com a exceção explícita da sinopse limitada da raiz.
- Reservar o pior orçamento do próximo par antes de carregá-lo. Para lore, prever
  até 100 alvos distintos nos dois lados, máscaras mínimas e reserva de 3 MiB e
  até 384 documentos. Validar esses limites no SDK antes de fechar a implementação.
  O gate inicial/IDs deve caber na reserva restante, garantindo pelo menos um par
  válido por chamada. Outros grupos têm reservas menores demonstradas por testes.
- A disponibilidade atual lê fichas vivas inteiras para conferir existência/deleting.
  Extrair leitura com máscara mínima para C3A; preservar semântica B/C2 e provar
  regressões. Fazer o mesmo para dependências capturadas, sem ler texto vivo.
- Responder com quantos pares couberem, sem exigir 25/50 linhas completas. Cursor
  marca a última identidade efetivamente processada, inclusive filtros/omissões,
  nunca o primeiro par adiado por orçamento. Janela vazia com continuação é válida.
- Cursor fechado inclui UID, identidades/gerações, grupo/kind/change, última chave,
  comparisonToken e collectionRevision. Nenhuma mistura de projeções ou filtros.
- Leitura de texto conserva padrão quatro/máximo oito chunks de B e valida
  UTF-8/hash; mídia mantém limites B e gate antes/depois do I/O, com no-store.

## Cliente, retomada e arquivos previstos

Nova feature `campaign-comparisons`, composta pela API pública em CampaignPage.
Painel oferece preparar candidata, progresso real, retomar, comparar e descartar
com confirmação. Nenhum botão de adotar é apresentado como disponível em C3A.
Filtros por grupo/tipo/mudança; detalhes identificam os dois lados e datas.
Em telas estreitas, empilhar lados; teclado/foco e estados explícitos nos temas.

Expor `CampaignComparisonPanel({campaignId,currentBaseId})` na campanha e
`CampaignComparisonPreparations({campaignId?})` no Estúdio. O painel global é
necessário: CampaignPage deixa de montar seus filhos se o root desaparecer.
Tipos públicos B e renderRichText compartilhado podem ser reutilizados; eventual
exportação de verifyCampaignBaseFields deve ser mínima, sem alterar o leitor B.

Persistir somente controles mínimos em localStorage, protegidos por Web Locks
por UID/campanha. Sem lock durante HTTP. Reserva, transição e clear usam CAS do
envelope integral, inclusive phase, e guardas de sessão dentro do callback que
efetivamente escreve. Falha de armazenamento/parse/lock impede envio e não apaga
pedido. Sem recursos seguros, leitura/controles remotos continuam, mutação bloqueada.

StartPending contém schemaVersion/ownerId, scope `{kind:'start',campaignId}`,
phase request ou cancel-start, input StartInput original, expected
`{comparisonId:input.operationId,campaignId,campaignToken,currentBaseId}`.
StepPending usa scope `{kind:'job',campaignId,comparisonId}`, method advance ou
cancel, input exato `{comparisonId,operationId,expectedCheckpoint}` e expected com
todas as identidades, incluindo candidateBaseId. expected não entra no RPC.

KnownComparisonControl é neutro: schemaVersion/ownerId, scope
`{kind:'known',campaignId,comparisonId}`, expected com identidade completa e
checkpoint observado. Não contém método/input, não é pedido pendente e não
autoriza RPC. Confirmar start migra para known, sem inventar advance/cancel.
Sob o mesmo Web Lock e CAS do inicial, escrever known, conferir persistência e só
então limpar o start exato. Interrupção pode deixar ambos: inicial tem precedência.
Confirmar um passo também conserva descoberta conhecida antes de limpar o pedido.
Known não bloqueia nova ação e seu checkpoint não serve de base sem GET autorizado.
Preparar/retomar pode conduzir as etapas em sequência durante a ação em curso;
reload sozinho não autoriza criar novos pedidos a partir de um known.

Persistir cancel-start antes do resolver. Reload dessa fase repete resolver,
nunca start. Confirmação conhecida limpa o inicial somente após reservar controle
conhecido; não cancela a candidata automaticamente. Canceled confere owner/schema
e request integral antes de clear. Resposta antiga de start não desfaz cancel-start.
Nenhum ID/checkpoint novo enquanto incerto. Clear retorna o controle atual e o
hook relê depois do await; resposta antiga não zera pedido novo de outra aba.

Exceção explícita para passo definitivamente vencido: após conflito e GET
autoritativo da mesma identidade com checkpoint maior que expected, oferecer
“Encerrar tentativa e usar progresso atual”. A monotonicidade impede execução
tardia do passo antigo. Preservar até essa escolha; clear usa CAS integral e
conserva KnownControl atualizado, sem criar outro RPC automaticamente. GET maior
sozinho não prova se o pedido executou antes; não afirmar isso na UI. Falta de
conectividade/prova ou identidade diferente conserva a pendência.

Eventos storage/focus sinalizam releitura, sem carregar texto. Descoberta combina
todos os controles locais próprios e a lista remota; inicial local tem precedência
até recibo/fence. Limpeza final sem resposta fica descobrível mesmo se deleted não
vier da lista. Lista vazia não prova cancelamento. Nunca títulos, corpos, manifestos,
hashes de campos, mídia ou comparisonToken no journal. expectedSourceToken é só
controle opaco do input inicial. Dados inválidos não são apagados/rebaseados.

Antes de compor qualquer lista, texto ou imagem, validar envelope/side/key. Toda
leitura externa que observe token/revisão novos invalida o composto inteiro,
inclusive antes de rejeitar nextCursor. Preservar journals. Texto só é renderizado
após última janela autorizada, remontagem ordenada e verificação integral dos
campos/bytes/hash. Após await, revalidar sessão/identidade/controle atual.

Grupo source já possui resumos completos dos dois lados, sem readItem extra.
Metadados autorais da ilustração no item (`imageKey`, `alt`, `caption`) seguem a
autorização do item, como no leitor B. Comparar somente esses três campos; campos
internos não podem marcar uma alteração invisível. Perder pin/registro/arquivo
impede a prévia e pode omitir a linha do grupo images, sem transformar uma legenda
autoral ainda autorizada em dado secreto. O detalhe deve explicar a mudança com
seus metadados públicos; bytes e hashes privados não compõem essa explicação.
No detalhe de item, mostrar texto/alt/legenda após a verificação integral e buscar
bytes somente por ação explícita de prévia. O grupo images carrega a prévia ao
abrir seus detalhes. Qualquer erro nessa busca invalida o composto: os erros
atuais não distinguem com segurança toda perda de arquivo de uma revogação.
Detalhe item null para um lado anteriormente presente invalida a leitura; não
reclassifica uma retirada autoral. Sem token novo, devolver erro seguro em vez
de compor resposta incoerente. orderContextChanged é false se falta um lado;
a linha já indica added/removed. Orçamento de documentos vale por tentativa
transacional lógica; retries do SDK podem repetir leituras, sem promessa de custo.

Backend: campaignComparison*.mjs, motor interno compartilhado mínimo da captura,
gate/projetor necessário do leitor B, index/package, índices e testes unitários/SDK.
Não duplicar o motor inteiro nem ampliar endpoints B para bases arbitrárias.
Frontend: feature nova, integração CampaignPage, testes e eventual exportação
pública de validadores puros de conteúdo B; sem importar internos de outra feature.
QA: fixture apenas dos transportes novos, alias visual e jornadas pequenas.
Root centraliza documentos, regras/índices, SDK, validação final, revisão e Git.

Índices: controles por campaignId/createdAt descendente/`__name__` ascendente e
consulta global por createdAt descendente/`__name__` ascendente; vizinhos por
kind/parentKey/archived e (orderKey, `__name__`) nas duas direções. Conferir os
índices necessários na configuração, sem alegar que o emulador comprova implantação.
Coleções de controle/recibo/fence/candidata continuam negadas ao SDK direto.

## Execução e critérios de aceite

1. Revisar contrato de servidor/cliente/QA e fechar identidades, DTOs e orçamento
   antes de código. Não confundir a descoberta acima com prova de implementação.
2. Extrair somente reuso indispensável, com regressões B/C1/C2 dirigidas.
3. Implementar preparação/cancelamento e comparação projetada, sem adoção.
4. Implementar painel, controles de retomada e detalhes dos lados.
5. Provar servidor e SDK reais; depois navegador dirigido, revisão e validate no
   fechamento. Corrigir somente afetados; CI em paralelo conforme autorização.
6. Atualizar arquitetura, ADR, README/regras quando necessário e entrega após
   validate verde; commit/push no PR em rascunho, sem merge/deploy.

Aceites obrigatórios: captura completa congelada com lore referenciado; referências
e imagens comparadas sem omissão silenciosa; duas campanhas isoladas; nenhuma
escrita em base ativa/variantes/notas; fonte alterada persiste aborto; origem/root
removidos/recriados e pedidos concorrentes não ressuscitam recurso; preparação e
limpeza retomam sem duplicar pins; retirada real é distinta de revogação; Unicode,
conteúdo legado grande e relações ocultas não quebram limites nem vazam mudanças;
paginação vazia progride sem perda/duplicação; uma variante concorrente invalida a
comparação sem alterar a candidata; SDK direto negado; nenhuma chave/texto derivado
na persistência local; foco/temas/320 px, falhas e UID tardio com prova nativa.

## Riscos e não escopo

Número de RPCs e custo de pins crescem com o acervo; progresso é processado real,
sem percentual inventado. Não consultar cinquenta fichas grandes inteiras como se
fossem apenas metadados. Refatoração do motor/leitor é risco de integração e pede
regressões. Comparação autorizada pode mudar quando o acesso muda; isso não autoriza
mostrar hashes/nomes antigos. Candidata indisponível não deve inutilizar notas C1.

Fora de C3A: adoção, migração de overlays, transferência/encerramento de pedidos C2,
promoção de cânone, notas copiadas do original, mesclagem por campo, compras,
participação, sessões, publicação e exclusão integral. C3B permanece pendente e
deve fechar a continuidade dos overlays/bodyRevision e rascunhos da base anterior
antes de qualquer ativação; não fazer um flip isolado de activeBaseId.

## Revisão pré-código e matriz proposta — 2026-10-17

Revisores independentes de backend, cliente e QA encontraram lacunas de DTO,
recibos de progresso atual, start desconhecido, ordem técnica, projeção de links
e descoberta após remoção do root. O contrato acima incorpora os fechamentos:
recibo exato separado do progresso, fence inicial explícito, CAS integral do
journal, painel global no Estúdio, grupo source, adjacência e preview unchecked.
Nome efetivo do alvo não compõe o fingerprint da ficha que aponta a ele; rename
aparece no próprio alvo. Nenhum código ou teste produtivo C3A foi executado aqui.

Matriz SDK proposta, cinco cenários: escritores reais/capturas com sete tipos,
metadados raiz, links/mídia e rebalance técnico; CAS/aborto/fence/root recriado;
projeções assimétricas/relações ocultas/SDK direto negado; pior par de até cem
alvos com fichas vivas grandes e orçamento/paginação reais; limpeza em 25 com
falha de assets/pins distintos e proteção da ativa/C1/C2. SDK Firestore com assets
injetados não comprova Storage real nem versionamento real do bucket.

Matriz nativa proposta, quatro jornadas nos seis projetos (24 positivos esperados,
ainda não executados): captura/comparação completa sem criar outro root; paginação
e invalidação por variante; recuperação/aborto/descarte/fence, inclusive último
passo sem resposta; revogação e respostas tardias de UID/lado/token/mídia, com notas
C1 acessíveis, teclado/foco/320 px nos temas. Fixtures provam composição cliente;
orçamento, atomicidade, autorização e pins exigem evidência SDK separada.

## Evidência intermediária de implementação — 2026-10-17

- Extração do motor/gates: 42 regressões dirigidas B/C1/C2 verdes. Servidor novo:
  nove casos próprios; última execução de vinte também inclui onze leitores B
  afetados pelas máscaras. Essas execuções podem se sobrepor; não somar como únicos.
- HTTP real: três casos verdes, 551,8628 ms, cobrindo no-store de mídia B/C3A em
  sucesso/erro no callback e ausência dessa política em metadados. Não comprova
  respostas anteriores ao callback do framework ou produção.
- SDK real dos cinco arquivos campaignCapture/campaignBaseRead/campaignNotes/
  campaignLore/campaignComparison: 22/22, zero falhas/skips, 83.436,166 ms, exit 0;
  harness concluiu a limpeza do emulador. Assets são injetados, sem prova de Storage.
- Provas SDK novas incluem sete famílias, raiz, links/imagens, rebalance, CAS/fence,
  root recriado, projeções/cursor, pior par de cem alvos com fichas vivas grandes,
  limites, limpeza/pins e preservação da base ativa/C1/C2.
- Uma revisão posterior identificou cursor de detalhe ignorado se item ausente:
  negativo falhou antes e passou após a correção (1/1, 229,2368 ms), incluindo UID
  alheio. A projeção de imagem também passou a limitar os três campos públicos:
  dois dirigidos verdes (252,1236 ms), com negativo antes para campo invisível.
- Após a máscara nested da imagem, apenas o cenário SDK afetado foi repetido:
  `SDK real writers capture seven families`, verde em 16.298,4743 ms; runner em
  17.502,5403 ms, exit 0. O filtro carregou ainda três arquivos sem casos
  correspondentes; não são três cenários adicionais. A prova inclui campo interno
  ignorado e legenda pública alterada com pin ausente; assets continuam injetados.
- Interface, navegador, revisão final e validate completo permanecem pendentes;
  este registro não encerra C3A.

Marco posterior do cliente: 75 testes dirigidos em cinco arquivos, tipos e lint
verdes. Cinco negativos corrigiram contexto novo em páginas de texto, controle
local com scope inválido e nova preparação após descarte. Detalhes não dependem
mais de buscar bytes de ilustração automaticamente.

Navegador inicial: 24 positivos únicos, quatro jornadas nos seis projetos,
26.940,604 ms + 93.824,963 ms, sem retries/skips/flaky. O lote anterior parou em
quatro seeds C1 com noteId diferente de operationId; corrigido só o seed, sem
alcançar o fluxo C3A naquela tentativa. Raiz inspecionou seis PNG 320×740 nos três
temas; não representa zoom físico ou leitor de tela.

Revisão independente encontrou P2 no journal: Known mais recente podia ser
substituído por StepPending antigo e confirmação pós-await adotava controle
obsoleto. Seis negativos falharam antes e passaram após; execução dirigida final
dos dois arquivos afetados: 41/41, 11,45 s, tipos/lint verdes. Reserva protege o
checkpoint sob lock e confirmação/GET reconsultam o slot, pausando sem rebase ou
novo RPC se outra aba venceu. Repetição nativa somente da jornada afetada e
revisão final ainda pendentes.

A CI de 75b9104 terminou cancelada em um dos oito shards após prazo de 15 minutos;
sete shards, produção, validate Node 22/24, auditoria e regras passaram. Dois
traces de cronologia mostram navegações redundantes consumindo seu prazo de 45 s.
O teste mantém reload/ordem/exportações/asserts, removendo só duas navegações.
Sua repetição dirigida nos seis projetos ainda está pendente. A suíte completa
passa a doze shards, com gates/limites/retries intactos: oito contratos CI verdes,
enumeração de 1.092 IDs, 91 por shard, união exata sem omissão/duplicação. `--list`
não executa navegador nem comprova tempo remoto. Ver ADR 0024.

## Fechamento local — 2026-10-17

Após a correção do primeiro P2, os doze afetados passaram em 90.097,568 ms:
seis da jornada de recuperação C3A e seis do caso de narrativa. Não somar as
repetições aos 24 cenários C3A únicos. Narrativa preservou todas as verificações
e passou entre 10,321 e 17,919 s.

A revisão identificou ainda loading preso quando uma ação invalidava GET sem
resposta. O negativo falhou antes e passou após; sete dirigidos, tipos/lint verdes.
Propriedade por geração permite GET novo e impede o finally antigo de liberá-lo.
Somente um controle nativo específico foi acrescentado à evidência externa:
1/1 desktop-light, 4.689 ms de teste / 8.133,146 ms total, zero retries/skips/flaky.
Transportes simulados e adaptador/Web Lock reais, sem replicar lógica do hook.
Revisão final de cliente e integração CI/narrativa sem bloqueadores restantes.

`npm run validate` final exit 0: 170 arquivos/1.680 frontend em 146,32 s,
77 scripts (9.683,6018 ms), 324 Functions (2.847,5666 ms), todos os demais gates,
tipos, build e smoke verdes. Cobertura 90,69/84,71/90,30/93,32% em
instruções/ramos/funções/linhas, sem reduzir limites. Build 2,75 s conserva avisos
existentes de chunk grande e importação mista DOCX. Documentação/ADR/regras e
entrega atualizadas; Git/CI são acompanhados no PR, sem merge ou deploy.

Esse fechamento local permite continuar sob a sequência autorizada. A conclusão
remota requer CI verde no head; C3B e exclusão integral continuam pendentes.
