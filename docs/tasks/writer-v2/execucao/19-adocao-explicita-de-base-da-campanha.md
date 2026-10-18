# F2-07 C3B — Adotar explicitamente uma candidata da campanha

**Estado:** planejamento em revisão; implementação não iniciada. A escolha de
produto abaixo e os contratos técnicos indicados ainda precisam ser fechados.
**Base:** C3A concluído tecnicamente em `fe10b15`, com CI e regras verdes.
**Origem:** [D-02](02-modelo-de-dominio.md), [campanhas](14-campanhas-e-variantes.md),
[C2](17-variantes-de-lore-da-campanha.md), [C3A](18-comparacao-de-bases-da-campanha.md)
e [ADR 0034](../../../decisions/0034-campaign-base-comparisons.md).

## Objetivo

Depois de comparar uma candidata congelada, permitir ao mestre decidir sobre as
variantes inteiras e adotar essa geração explicitamente. Manter a base anterior
legível durante a preparação; confirmar a nova base e o lore da mesa coerentes
no mesmo commit. Notas próprias C1, outra campanha e original permanecem intactos.

Uma edição normal posterior do original não recaptura nem substitui a candidata
ready. Adotar exatamente a candidata comparada, com autorização/privacidade atuais.
Revogação, troca da base/campanha ou edição C2 concorrente são condições distintas.

## Escolha de produto pendente

Pergunta enviada ao operador em 2026-10-17: uma ficha adaptada pela mesa deixa de
ser referenciada na candidata, embora a origem continue autorizada. Oferecer:

1. Manter a ficha como legado da campanha, vinculada à origem e aos mesmos gates;
   opção recomendada, ainda sem resposta.
2. Exigir descarte explícito da variante antes da adoção, conservando a base atual
   enquanto isso.

Não assumir resposta por tempo decorrido. Essa escolha também delimita restauração,
descarte e relações do legado. Não expandir automaticamente os alvos por relações,
não resolver por nome e não converter conteúdo derivado em nota independente.

## Requisitos e decisões já estabelecidos

- Atualização é opcional e explícita; não é um flip isolado de activeBaseId.
- Variantes substituem entidades inteiras, sem merge por campo ou cânone automático.
- Retiradas preservam previousMode; revisões não reiniciam ao descartar/reintroduzir.
- bodyRevision identifica os bytes confirmados, separada da revisão do overlay.
- Pedidos cifrados continuam no escopo original. Antes da adoção, confirmar ou
  encerrar explicitamente os pedidos C2 da base atual, inclusive de outro dispositivo.
  Não transferir chave, ciphertext, AAD ou header para outra base.
- Journal vazio neste navegador não comprova ausência de pedidos remotos. Fence
  de admissão deve anteceder a auditoria paginada e impedir prepare/save tardios.
- Sem autorização, não ler/copiar corpos ou exibir nomes, relações ou hashes ocultos.
  Notas autorais próprias continuam independentes da origem.
- Preparação/cancelamento são limitados e retomáveis; confirmação incerta conserva
  o mesmo método/input/ID. Nenhum avanço automático a partir de marcador conhecido.
- CI segue em paralelo após fechamento local; testes afetados durante ajustes e
  validate completo no fechamento, sem enfraquecer hooks ou limites.

## Descoberta confirmada

Revisores consultaram o graph, que não retornou os símbolos; usaram os arquivos
conhecidos e contratos atuais como fallback.

C2 vincula estado, overlay e leitor à base ativa. Os IDs de chunks incluem
campaignToken, baseId, sourceKey e bodyRevision; paths ativos são fixos. Regravar
baseId nos overlays sem preparar corpos/ponteiros compatíveis quebraria o leitor.
Migrar no lugar antes do commit também quebraria a base anterior ainda ativa.

O journal IndexedDB é único por UID/campanha e recover rejeita header de outra base.
Trocar o ponteiro esconderia o caminho de recuperação de um pedido antigo. Um
ciphertext recuperável selado exige chave já criada no servidor; controles locais
nunca recebidos podem existir sem chave/ciphertext e precisam de encerramento
explícito, sem bloquear indefinidamente o novo lore após a adoção.

supportedCampaignProvenance exige provenance.baseId igual à base ativa. Campanha
tem provenance `{kind:'original',adventureId,baseId}` e activeBaseId; não tem
captureId/source. O commit atualiza activeBaseId e provenance.baseId juntos,
preservando kind/adventureId e o universo organizacional atual. captureId pertence
à preparação/recibos B históricos, que não serão regravados como outra captura.

Replay da ativação B exige hoje a base inicial ainda ativa e falha fechado depois
de adoção. Dados antigos não guardam a âncora createTime dessa ativação; não inferir
encarnação por UID/ID/adventureId iguais. Decisão técnica: preservar essa autoridade
estrita e oferecer resolução somente de metadados do recibo histórico próprio,
sem DTO atual ou prova da encarnação presente.

`resolveCampaignCaptureActivation({captureId,operationId,expectedCheckpoint})`
retorna schemaVersion/ownerId/request integrais, outcome activated/aborted e
confirmedCheckpoint. Consulta apenas campaignCaptureOperations do UID; confere
fingerprint digest de `{method:'activate',...inputOriginal}`, captureId e checkpoint
inteiro igual ao esperado + 1. aborted true indica aborto e marcador ausente indica
ativação; valores inconsistentes são rejeitados. O recibo legado já é atômico com
a criação original, logo não se inventa uma âncora retroativa.

Ausência retorna operation-unconfirmed sem escrita/fence; não prova que a ativação
em trânsito não executará. O cliente preserva o journal. Confirmação válida permite
limpar somente o controle integral correspondente por CAS e depois consultar a
rota normal, sem reconhecer root atual/recriado como a encarnação original.

O catch atual de useCampaignCaptureOperation limpa pedidos preservados em algumas
falhas definitivas. Para a ativação antiga, essa limpeza deve esperar a resolução
histórica explícita; operationId sozinho também não substitui o CAS do envelope
integral. Resposta antiga ou troca de sessão nunca apaga um pedido mais novo.

C3A permite descartar candidata sem a origem, necessário para limpeza. Uma
candidata adotada precisa de estado/indicação próprios e proteção no servidor:
cancelamento ou replay nunca pode liberar seus filhos/pins, mesmo após outra
adoção futura. Disputa entre descarte e reserva/ativação deve ter um único vencedor.

## Jornada proposta

1. Abrir “Revisar atualização da campanha” na candidata pronta; identificar as duas
   bases e suas datas, sem consultar prosa viva para completar a candidata.
2. Conferir pedidos C2 locais/remotos. Recuperar/confirmar ou encerrar cada pedido
   explicitamente antes de preparar. Se a auditoria sob fence encontrar pendência,
   abortar e liberar a admissão, permitindo resolver o pedido e tentar novamente.
3. Revisar decisões paginadas por sourceKey/revisão: manter variante inteira ou usar
   ficha candidata; preservar retirada ou voltar explicitamente à base nova.
   O tratamento da ficha ausente depende da escolha de produto pendente.
4. Para adaptar texto, voltar ao editor C2 da base atual. O save invalida o plano
   anterior; nova comparação/conferência deve ser explícita, sem rebase de escolhas.
5. Preparar geração de lore isolada em etapas, mantendo os leitores atuais. Expor
   progresso real, falhas e cancelamento sem descartar implicitamente a candidata.
6. Confirmar a adoção atomicamente e remontar leitores pela nova identidade. Recibo
   exato permite confirmar resposta perdida; controles globais continuam descobríveis.

## Contratos técnicos comuns

### Gerações, revisões e corpos

Preparar uma geração privada isolada de lore; C2 resolve o armazenamento pelo
ponteiro ativo, com fallback explícito para o layout legado. Incluir metadados de
todos os overlays/tombstones, não apenas os que aparecem na candidata, para
preservar revisão contínua em reentrada futura.

Decisão técnica após auditoria: usar binding interno achatado para o corpo
confirmado, separado da base lógica do overlay, sem cópia obrigatória de chunks.
O binding identifica layout legado ou geração, base física e bodyRevision; dono,
campanha, token e sourceKey vêm do contexto. Não aceitar paths do cliente ou
encadear bindings. Preservar manifesto/bodyRevision dos bytes mantidos.

Novos saves gravam corpo na geração ativa. Save/discard removem o corpo anterior
pelos refs do binding validado; isso inclui corpo fisicamente legado. Gerações
inativas não oferecem histórico de versões de variantes. Cancelamento de staging
nunca apaga chunks emprestados; limpeza recursiva de armazenamento referenciado é
proibida. Gates atuais precedem leitura de corpo/cabeçalhos/hash: transportar
metadados privados não concede acesso à prosa indisponível.

Fence e revisão global protegem contra escritor que apague/troque o corpo durante
staging. Por ser layout novo, validar negativamente binding cruzado de dono,
campanha, encarnação, ficha, base física e bodyRevision, incluindo geração ausente
ou inconsistente. Fallback para legado só ocorre por ausência explícita do ponteiro;
não interpretar geração inválida como autorização para procurar outro corpo.

Adotar incrementa uma vez a revisão global C2 e a revisão de cada overlay
materializado, inclusive base/tombstones, sem reiniciar. bodyRevision fica igual
quando os bytes não mudam. `removed→base` preserva retirada e, ao restaurar, usa
a ficha candidata; `removed→override` preserva retirada e a variante confirmada.
Escolher ficha candidata remove o override do novo estado por decisão explícita.
Metadados name/category de modo base ou previousMode base precisam corresponder
à candidata, evitando divergência entre lista e GET. Definir o ramo de ficha ausente
após a escolha de produto; recurso revogado permanece internamente inerte.

Uma relação autorizada incompatível não pode
sumir silenciosamente da decisão “manter variante”; resolver explicitamente ou
impedir essa escolha até edição da ficha. Relação revogada não revela nome ou
vínculo oculto em avisos. Não ampliar captura transitivamente.

### Admissão, pendências e concorrência

Fence pertence a uma adoção/encarnação específicas. Cancelar J1 nunca libera J2.
Todos os prepare/save/remove/restore/discard C2 precisam revalidar a barreira na transação;
resolver/encerrar recibos próprios continua possível. Se houver pedido aberto,
liberar a barreira antes de exigir recuperação que precise aplicar a mutação.

Definir enumeração paginada de pedidos remotos, ausente das APIs atuais, sem chave
ou prosa. Considerar abertos prepared/committed com closed diferente de true;
consulta por closed igual a false perderia documentos antigos com campo ausente.
Não interpretar página vazia ou falta de resposta como cancelamento.

O resolver C2 atual confere UID/descriptor e consulta o recibo privado sem ler
root/base/origem; confirm/cancel antigo continua possível após troca/revogação e
cancel ausente cria fence. Expor essa saída metadata-only para journal antigo,
inclusive confirmed ou pedido nunca recebido sem chave/ciphertext. Não tentar
recuperar plaintext da base antiga nem limpar o registro sem escolha explícita.

Para outro dispositivo, o resolver integral não basta: save exige
relatedSourceKeys, que não pode ser exposto pela listagem remota. Acrescentar:

- listCampaignLoreOperations recebe campaignId/campaignToken/baseId, cursor e
  limit. Retorna identidade/owner/schema, operationId, state prepared/committed,
  revisão confirmada ou nula e statusToken opaco. Lista somente abertos; não retorna
  descriptor, relações, chave, fingerprint de conteúdo ou prosa.
- resolveCampaignLoreRemoteOperation recebe o mesmo escopo, operationId,
  statusToken, resolutionId estável e intent confirm/cancel. O servidor carrega e
  valida o descriptor privado; não o reconstrói no cliente. confirm exige committed
  aberto; cancel exige prepared aberto. Não depende de root/base/origem atuais.

statusToken vincula UID, escopo, operationId e updateTime preciso. Uma transição
prepared→committed ou fechamento concorrente rejeita o token antigo com
operation-changed. resolutionId identifica recibo separado em
users/{uid}/campaignVariantResolutionOperations/{resolutionId}, criado atomicamente
com o fechamento ou com a rejeição definitiva dessa tentativa. Replay exato retorna
esse recibo antes de comparar updateTime;
assim resposta perdida continua confirmável após o fechamento. Outro payload com
o mesmo ID é rejeitado. Resposta ecoa request integral e dono/schema: outcome
resolved traz estado terminal confirmed/canceled e revisão; outcome rejected traz
reason operation-changed e não afirma qual outra operação venceu. Nunca retorna
descriptor. Ausência não equivale a sucesso.

Recibo rejected permite encerrar explicitamente só o controle remoto por CAS
integral, preservando o journal cifrado. Isso dá saída mesmo se a operação fechada
por outra aba sumir da lista de abertos. Nova decisão exige nova consulta e outro
resolutionId; não rebasear token/pedido preservado. Erro sem esse recibo confirmado
não autoriza limpar o controle. Rejeição não altera a operação C2, chave ou revisão.

Lore preserva o pedido exato dessa resolução em controle metadata-only próprio,
com CAS e isolamento de sessão; não sobrescreve o journal cifrado existente. O
resolver C2 integral continua atendendo o navegador que já tem seu descriptor.
Sem ciphertext local, não prometer recuperação pelo servidor: encerrar ou retomar
no navegador que conserva o rascunho são escolhas explícitas.

Commit final compara encarnação, base corrente, candidata pronta, escolhas,
revisão C2 e autorização. Atualiza todos os ponteiros/controle/procedência/recibo
no mesmo commit; não regrava notas ou metadados próprios de uma cópia antiga.
Comparação recebe adopted permanente: nunca voltar a ser descartável, mesmo após
uma segunda adoção. Preparações/cancelamentos concorrentes consultam o claim e
o estado na mesma transação; só um pode vencer, sem confiar no botão do cliente.

### Retenção, cancelamento e acesso

Reter base anterior, pins e gerações físicas que sustentam bindings; não oferecer
rollback nem histórico de variantes inativas. Neste incremento, não fazer coleta
automática de gerações inativas ou de corpos descartados durante a adoção. O
descarte lógico não concede acesso aos bytes retidos. Save/discard C2 posterior
continua removendo seu corpo anterior pelo binding validado, sem promessa de
leitura das versões inativas. A retenção adicional necessária ao eventual legado
depende da escolha de produto.

Cancelamento limpa somente staging próprio, sem apagar candidata, base anterior,
pins de outra geração ou autoria da mesa. A exclusão integral continua em etapa
própria e deverá enumerar todas essas gerações/controles/chaves/pins.

Coleções privadas permanecem negadas ao SDK direto. No cliente, controles mínimos,
CAS integral, propriedade de leitura por geração e guardas após awaits seguem os
contratos corrigidos em C3A.

### ABI e estados da adoção

Identidade pública fechada: schemaVersion 1, ownerId, adoptionId, campaignId,
campaignToken, comparisonId, currentBaseId, candidateBaseId, loreGenerationId e
expectedCollectionRevision. A revisão C2 esperada fica fixa durante todo o plano;
o servidor reserva loreGenerationId. Não aceitar paths, chunks ou bindings físicos
do cliente.

Estados: reviewing, preparing, ready, adopted, aborted, deleting e deleted. Fases:
review, operations, overlays, authorization, complete e cleanup. deleting/deleted
servem ao staging cancelado; adopted é terminal e não perde seu recibo ou proteção.
Um único checkpoint monotônico controla decisões e etapas, sem planRevision
paralela. O progresso próprio inclui estado/fase/checkpoint, disponibilidade,
motivo seguro e datas; contagens ou resumos derivados só aparecem autorizados.

| Operação                      | Entrada específica e efeito                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| startCampaignAdoption         | operationId, campanha/token, comparação, duas bases e revisão C2 esperadas; cria revisão sem fence    |
| resolveCampaignAdoptionStart  | input inicial integral e intent cancel; confirma recibo ou instala fence de start ausente, como C3A   |
| getCampaignAdoption           | adoptionId; consulta controle próprio, inclusive sem root/origem                                      |
| listCampaignAdoptions         | campaignId opcional, cursor e limit; descoberta global própria                                        |
| listCampaignAdoptionDecisions | adoptionId, cursor e limit; somente resumos autorizados                                               |
| decideCampaignAdoption        | adoptionId, sourceKey, expectedRevision, choice, expectedCheckpoint e operationId                     |
| prepareCampaignAdoption       | adoptionId, expectedCheckpoint e operationId; reivindica candidata e instala fence antes da auditoria |
| advanceCampaignAdoption       | mesmo envelope de etapa; uma unidade limitada da fase atual                                           |
| activateCampaignAdoption      | mesmo envelope; confirmação final explícita                                                           |
| cancelCampaignAdoption        | mesmo envelope; encerra e limpa staging em etapas, sem descartar candidata                            |

As mutações retornam receipt separado de progress. O recibo confirma método/input
integral, operação e checkpoints esperado/confirmado; uma decisão confirma também
ficha, revisão e escolha. Replay consulta o recibo primeiro e pode trazer progresso
mais recente, sem autorizar o próximo pedido automaticamente. Ausência de start
só permite encerrar o journal após confirmação do fence correspondente.

Para ficha presente, choices são keep-local e use-candidate. A primeira preserva
entidade inteira, mode e previousMode; a segunda descarta explicitamente override
e retirada. Overlays base sem conteúdo local acompanham a candidata e preservam
continuidade de revisão. Não definir ainda choices/defaults para ficha ausente.

A página contém sourceKey/revision/mode, nomes/categorias autorizados dos dois
lados, presença, escolha e impedimentos seguros. Seu cursor vincula identidade,
snapshot C2, filtros e projeção vigente, usando a última chave examinada. Página
vazia pode ter continuação. O cursor não vincula checkpoint: decidir não muda a
ordem/membership. O envelope ecoa checkpoint; recibo da própria decisão atualiza
só sua linha, enquanto avanço externo desconhecido invalida o cache de escolhas.

Start e revisão não bloqueiam C2. Prepare instala guard e claim atomicamente;
audita operações antes de materializar overlays. Falta de decisão detectada na
varredura também aborta/libera a própria barreira, sem preparar estado parcial
adotável. Qualquer mudança da revisão C2 invalida o plano, sem rebase de escolhas.
Nova tentativa após aborted exige novo start explícito.

O guard mantém admissionEpoch monotônico, separado da revisão do conteúdo C2.
Fence identifica campaignToken/adoptionId/epoch; liberar e reservar novamente
incrementa epoch, sem apagar seu contador. Etapas, cursores internos e certificado
de staging vinculam esse triplo, bases, revisão C2 fixa e checkpoint de decisões
fechadas no prepare. Cada etapa grava resultado/cursor/checkpoint e digest
acumulado atomicamente. Cancelar/liberar exige o triplo exato; final verifica
certificado completo sem enumerar novamente todas as fichas.

### Leitura de relações e validação de autorização

O overlay atual contém name/category/mode/manifest; as relações estão no corpo
JSON. Portanto não inferir compatibilidade de keep-local só pelo overlay. Em uma
etapa, conferir a autorização da própria ficha antes de ler seu corpo confirmado,
validar manifesto/hash/bytes e conferir até 50 alvos antes de projetar relações ou
validar sua compatibilidade. Isso segue a projeção C2; não exige conhecer todos os
alvos antes da leitura interna do corpo da ficha autorizada. Nenhum vínculo,
descrição ou nome revogado aparece no DTO. Ficha indisponível transporta somente
metadados/binding inertes, sem ler corpo. Não criar índice de dependências inferido
de recibos antigos nem assumir relações vazias.

Não usar sourceToken ou comparisonToken inteiro como CAS final: incluem versões
de conteúdo que podem mudar após a captura. Validar gates em páginas sob epochs
dos universos envolvidos, guardando identidade/encarnação, disponibilidade,
loreVersion e privacyVersion. Conferir na implementação que toda mutação relevante
aos gates atualiza esses epochs ou é coberta por leitura direta no commit.
Adventure/root, claim, base, fence e revisão C2 são conferidos diretamente.

Se um epoch mudar, invalidar a passada de autorização e refazê-la explicitamente,
preservando candidata, decisões e staging; não recapturar nem abortar apenas por
edição comum do conteúdo. O commit compara os epochs da última passada completa.
Advance/activate que detecte essa mudança confirma seu pedido exato por recibo
reauthorization-required, incrementa checkpoint e retorna estado preparing/fase
authorization, sem adoção. O cliente encerra somente o StepPending confirmado e
oferece novo avanço explícito; lançar apenas erro deixaria o pedido bloqueando a
reconferência. Preservar fence e escolhas; o recibo não autoriza repetir activate
com outro checkpoint automaticamente.
Revogação efetiva aplica gates e impedimentos atuais; não é tratada como simples
mudança de texto. A extensão dessa lista de anchors ao legado fica pendente.

Auditoria estática do ramo comum em 2026-10-17, sem execução C3B:

| Mutação existente                                    | Cobertura observada                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| saveUniverseLore / deleteUniverseLore, universes.mjs | loreVersion muda atomicamente com criação/edição/exclusão; privacyVersion também muda na revogação pública pertinente |
| applyLoreAnalysis global, loreAnalysis.mjs           | lote e incremento de loreVersion no mesmo commit; não altera visibilidade/relações                                    |
| deleteUniverse, universes.mjs                        | deleting e privacyVersion antes da limpeza recursiva; commit C3B relê existência/dono/deleting                        |
| createUniverse / updateUniverse, universes.mjs       | authorId só na criação; update muda nome/descrição; marcador impede recriação normal do ID removido                   |
| SDK e outros fluxos                                  | regras negam escrita direta global; criação assistida/geração/importação não gravam cânone global                     |

Certificar loreVersion/privacyVersion somente como inteiros seguros não negativos,
sem coerção ou fallback de campo ausente; repetir a validação no commit final.
Incrementos existentes não validam overflow, portanto epoch inseguro deve impedir
certificação, sem aceitar um contador que possa deixar de variar. Os gates C2 da
mesa dependem de existência/dono/deleting; isPublic false não revoga acesso do
próprio criador. A versão de privacidade é detector conservador, não permissão nova.
Esta cobertura estática não substitui as provas transacionais e SDK do incremento.

### Armazenamento, limites e índices

Paths privados propostos, sempre sob o UID autenticado:

```text
users/{uid}/campaignAdoptions/{adoptionId}/decisions/{sourceKey}
users/{uid}/campaignAdoptionOperations/{operationId}
users/{uid}/campaignAdoptionStartFences/{operationId}
users/{uid}/campaignAdoptionGuards/{digest(campaignId,campaignToken)}
campaigns/{campaignId}/loreGenerations/{generationId}/loreVariants/{sourceKey}
campaigns/{campaignId}/loreGenerations/{generationId}/loreVariantBodies/{chunkId}
```

O documento da geração valida dono/campanha/encarnação/base e estado. O controle
global C2 continua único. Binding privado tem schemaVersion, layout legacy ou
generation, generationId nulo ou válido, baseId física, sourceKey e bodyRevision
inteira positiva. Os demais componentes de escopo vêm do contexto autorizado.

Páginas de leitura têm padrão 25 e máximo 50. Auditoria, migração e cancelamento
processam até 25 registros por etapa, consultando até 26 para detectar continuação.
Cada tentativa transacional mede todos os documentos consultados, inclusive gates:
teto de 384 leituras, 64 escritas, 4 MiB selecionados lidos, 2 MiB de escritas
estimadas e 4 MiB de resposta. Esses são orçamentos internos conservadores, não
uma afirmação sobre quotas da plataforma ou prova de tamanho real com índices.
Não truncar texto/relações nem avançar cursor se o item indivisível exceder orçamento.
Usar máscaras fechadas para metadados; uma etapa de validação de corpo processa
no máximo um override de até 900.000 bytes, chunks de até 64 KiB e 50 relações.
Não carregar blobs, copiar mídia ou ler corpos em páginas de lista. O commit
final tem até 10 escritas e tamanho constante; nenhum scan completo cabe nele.

Listar adoções por createdAt DESC e `__name__` ASC, com índice global e variante
prefixada por campaignId. Decisões/overlays são percorridos por `__name__`. Auditoria
C2 filtra campaignId/campaignToken/baseId, ordena `__name__` e examina closed no
servidor; acrescentar índice desses três campos ASC seguido de `__name__` ASC.
Não consultar closed == false: registros antigos sem campo continuam abertos.
Selecionar só campos necessários, sem key/relatedSourceKeys nos controles remotos.
Excluir conteúdo/binding/decisões extensas de indexação quando aplicável.

### Cliente e composição pública

Journal metadata-only distingue StartPending, StepPending e KnownControl. Somente
os dois primeiros guardam método/input exatos; Known não dispara RPC. Reserva,
transição e clear usam CAS integral sob Web Locks por UID/campanha, sem manter
lock durante HTTP. Controles inválidos permanecem preservados e bloqueiam
substitutos. Após cada await, conferir sessão/alvo, propriedade da leitura,
recibo, piso de checkpoint e journal atual; outra aba vencedora interrompe a
sequência. GET não rebaixa Known nem fornece checkpoint para rebase automático.

Comparação emite onReviewAdoption com o ComparisonReadEnvelope autorizado observado,
incluindo identidade, collectionRevision e datas, e não importa adoção. Não obter
uma revisão C2 mais nova silenciosamente para preencher start: conferir esse
contexto esperado no servidor ou pedir revisão explícita. A página da campanha
compõe o diálogo; adoção consome somente APIs públicas de comparação e lore.
Lore continua dono de crypto/IDB e expõe seus controles normal e
metadata-only. Estúdio compõe CampaignAdoptionPreparations com filtro opcional
por campanha, também sem root/origem. campaign-bases mantém resolver/journal B.
Atualizar leitores e comparadores existentes para resolver a geração C2 ativa,
sem acesso cruzado a arquivos internos de features.

### Arquivos e fronteiras previstos

- Backend novo em functions/src/campaignAdoption*.mjs, com contratos/serviço
  separados do leitor de corpos C2. Integrar exports em functions/src/index.mjs.
- Adaptar campaignLore.mjs, campaignLoreContracts.mjs e campaignVariantRecovery.mjs
  para geração ativa, binding, fence e controles remotos; preservar cifragem/AAD.
- Adaptar campaignComparison*.mjs para claim/adopted e geração C2; campaignCapture.mjs
  para o resolver histórico B. As notas C1 continuam como regressão de preservação.
- Frontend novo em src/features/campaign-adoptions; integrar pelas exportações
  públicas de campaign-comparisons, campaign-lore e campaign-bases. Composição em
  CampaignPage e StudioPage, sem rota ou dependência nova exigida pelo plano.
- Atualizar firestore.rules e firestore.indexes.json; testar negação direta das
  novas coleções privadas e consultas reais no emulador.
- Unitários nas features e functions/test; SDK nas famílias existentes; novo
  cenário dirigido em e2e/visual com fixture de transporte explicitamente simulada.
- No fechamento implementado, atualizar ADR/architecture/testing/AGENTS e entrega;
  este planejamento não constitui entrega C3B nem aprovação comercial/humana.

## Sequência de implementação proposta

1. Receber a escolha de produto; fechar ABI/modelo/limites e revisão independente.
2. Implementar staging e admissão C2 com regressões do layout legado.
3. Implementar decisões e ativação/recibos/cancelamento; proteger C3A adotada.
4. Compor revisão/recuperação pela interface pública, sem ciclo entre features.
5. Validar afetados, SDK real e navegador dirigido; revisar e executar validate.
6. Atualizar ADR/arquitetura/regras/entrega e Git; acompanhar CI sem merge/deploy.

Não iniciar o passo 2 com as alternativas contratuais deste documento abertas.

## Matriz de validação proposta

Unitários cobrem decisões inteiras, modos/revisões/manifestos, falha por etapa,
CAS/fences/recibos, limites e respostas atrasadas; não repetir todas as combinações
no navegador.

SDK real, cinco famílias: adoção com mais de 25 overlays e Unicode grande;
pedidos/barreira remotos; concorrência/encarnação/refence; ramo de legado escolhido
e autorização; falhas/cleanup/pins com C1/original/outra mesa intactos. Assets
injetados não comprovam Storage real ou versionamento do bucket.

Instrumentar unitários para contar leituras/escritas/bytes e provar máscaras no
caminho real getAll fieldMask, zero chunks lidos ao negar a própria ficha e zero
chunks copiados no staging. SDK inclui operação antiga sem closed, página vazia
com cursor, override máximo com 50 alvos e save/remove/restore/discard tardios.
Revogação após staging impede confirmação; edição comum repete somente gates.
Final não enumera coleções. Falha antes/depois do commit conserva repetição exata.

Navegador proposto: duas jornadas nos seis projetos e um controle desktop, 13
execuções. Adoção completa cobre decisões, retirada/restauração/edição posterior,
geração congelada, teclado/foco/320 px/temas. Bloqueio/recuperação cobre pedido C2
remoto, fechamento explícito, confirmação perdida/reload e conflito sem rebase.
Controle específico usa adaptadores/Web Locks/IDB reais com transporte simulado
para corrida C2/adoção; nenhuma cifra ou autorização é inferida da fixture.

Regressão dirigida B: resolver recibo antigo após adoção, remoção e recriação do
root confirma somente o evento histórico; não recria/reconhece recurso atual.
Input divergente e recibo ausente preservam o journal; activate original conserva
o gate estrito. Cobrir CAS de resposta antiga e sessão, sem repetir toda a matriz B.

## Revisão técnica de planejamento — 2026-10-17

Auditorias de backend, cliente e QA detalharam ABI comum, revisão sem barreira,
checkpoint único, fence/epoch antes da auditoria, binding achatado, validação de
relações por corpo autorizado, budgets e índices. A listagem remota de descriptor
completo foi rejeitada: foi substituída por controles mínimos e resolução privada
com recibo próprio. Não foi criado índice de dependências inferido de recibos.
Nenhum código ou teste C3B foi executado.

A decisão humana sobre ficha ausente permanece pendente. Depois dela, fechar o
ramo correspondente, completar seus anchors de autorização e revisar os arquivos
afetados antes de implementar. ABI/modelo desse ramo não podem ser inferidos dos
contratos comuns; a escolha não autoriza expansão de relações ou novas permissões.

## Riscos e não escopo

O maior risco é continuidade de corpos/pedidos enquanto muda a base; um ponteiro
isolado não satisfaz o produto. Barreira indefinida também não pode impedir o mestre
de resolver a própria pendência. Autorização pode mudar durante staging/leitura;
projeção/limites e retomada precisam de provas próprias.

Fora deste incremento: merge por campo, promoção de cânone, cópia automática para
notas, migração de ciphertext/chaves, recaptura viva, rollback automático de adoção,
sessões/participantes, publicação/comércio e exclusão integral da campanha.
