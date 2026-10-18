# F2-07 C2 — Variantes de lore da campanha

**Estado:** implementado e validado localmente em 2026-10-17; CI do novo head pendente.
**Base:** C1 concluído tecnicamente em bda5e70; regras e CI remotos verdes,
confirmados durante a implementação C2. B concluído em f97455d, com CI e regras verdes.
**Origem:** [campanhas](14-campanhas-e-variantes.md),
[D-02](02-modelo-de-dominio.md), [permissões](03-permissoes-e-privacidade.md),
[captura](15-captura-de-aventura.md) e [notas próprias](16-notas-proprias-da-campanha.md).

## Objetivo, decisões e suposições

Permitir que o mestre substitua uma ficha de lore inteira somente nesta campanha,
retire-a da mesa, restaure seu modo anterior ou descarte sua variante e volte à
base congelada autorizada. Duas mesas permanecem isoladas. Nenhuma alteração vai
ao universo, aventura, base, cânone ou notas próprias.

D-02 já fecha substituição por entidade inteira, sem mesclagem por campo,
atualização automática ou resolução por nome. A variante conserva procedência e
revogação da base, inclusive após editar nome/texto. Trocar universo organizacional
não muda essa procedência. C1 continua acessível sem origem; C2 exige origem.

**Decisão do operador, confirmada em 2026-10-15:** recuperar o rascunho/pedido
integral após reload ou resposta incerta usando ciphertext local e chave guardada
no servidor. O operador escolheu explicitamente preservar e recuperar o rascunho
protegido, reabrindo somente após conferir a autorização da origem. A implementação
já seguia essa opção como suposição declarada; a resposta confirmou o contrato.
Metadados/fence isolados não recuperariam um corpo que nunca chegou ao servidor.

O gate adicional das relações foi fechado tecnicamente durante esta redação:
conjunto ordenado de alvos congelado no descriptor e no AAD. Os detalhes abaixo
formam o contrato revisado antes do código. A evidência ao final registra o resultado implementado.

## Descoberta e reuso

- `campaignBaseContracts.mjs` fornece `readCampaignBase` e `baseItemAvailable`.
  O primeiro autoriza campanha original/base pronta/aventura própria; o segundo
  confere universo original próprio e existência atual da ficha de lore capturada.
- Base B mantém `sourceKey` e `baseId` estáveis; metadados e corpos ficam separados.
  Não comparar sourceToken da captura ao ler variante: edição normal da origem
  não atualiza nem revoga por si a base congelada.
- Leitor B monta campos de texto, valida manifestos/hash e projeta relações para
  alvos capturados atualmente disponíveis. A leitura integral cabe até 4 MiB;
  chunks continuam internos, até 64 KiB UTF-8 cada.
- Extrair de notas um helper puro do token SHA-256 de UID/campaignId/createTime
  Firestore preciso. `readCampaignBase` deve devolver também o snapshot da campanha
  para esse helper. Não reutilizar `notesContext`, que lê controle de notas.
- Lore global atual aceita categorias character/location/concept/other, nome 200,
  resumo 140, aliases 20 de 200, details e quatro campos estruturados de 150.000
  unidades UTF-16 cada, relações 50 com tipo 200 e descrição 4.000. O envelope
  global validado tem teto de 900.000 bytes UTF-8.
- `LoreEntityForm` atual usa catálogo `allEntities` e IDs de lore vivo. Não forjar
  livro/escopo nem carregar catálogo completo para usá-lo aqui; criar formulário
  próprio de campanha com seletor paginado por `targetKey` capturado.

## Estado, identidade e persistência

Overlay identificado por sourceKey da ficha capturada. Sempre validar kind lore,
parentesco com a base e encarnação da campanha; baseId vindo do cliente não escolhe
outra geração. Registro ausente representa estado virtual base/revision 0; isso
não cria um documento nem reinicia a revisão de um overlay existente.

Coleções privadas propostas:

- `campaigns/{campaignId}/loreVariants/{sourceKey}`: schemaVersion 1, ownerId,
  campaignId, campaignToken, baseId, sourceKey, revision, mode, previousMode quando
  removed, createdAt/updatedAt servidor, metadados efetivos de nome/categoria,
  manifesto/hash do corpo inteiro quando override. Sem isPublic/grant.
- `campaigns/{campaignId}/loreVariantBodies/{chunkId}`: sourceKey, baseId,
  campaignToken, revision, index e content; ID determinístico por source/revisão/
  índice. Cada chunk até 64 KiB, nenhum corpo em lista/controle/recibo.
- `campaigns/{campaignId}/loreVariantState/current`: identidade/token/base/schema
  e revision global monotônica da coleção. Ausente é zero somente após prova
  bounded limit1 de ausência de overlays, incluindo mode base e removed.
- `users/{uid}/campaignVariantOperations/{operationId}`: descriptor imutável,
  estado prepared/committed/canceled, fingerprint da requisição sealed quando
  recebido, revisão/hash confirmados; chave aleatória de 32 bytes somente para
  save e somente enquanto não encerrada. Sem cópia de nome/corpo/aliases/relações.
  Chave, ciphertext e conteúdo nunca entram em logs/erros.

Manifesto interno tem bodyRevision própria, igual à revisão do save que criou
os chunks; remove/restore preservam esse manifesto e bodyRevision, mesmo quando
a revisão do overlay aumenta. IDs dos chunks vinculam campaignToken, baseId,
sourceKey, bodyRevision e índice. GET valida os chunks contra o manifesto, sem
exigir que a revisão do corpo seja a revisão atual do overlay. Discard e save
posterior removem exatamente esses chunks, sem copiar/reindexar em remove/restore.

Todos os filhos e recibos conservam campaignToken. Root apagado/recriado no mesmo
ID não adota filhos, chaves, operações ou journal anteriores. Schemas futuros,
controles ausentes com filhos e revisões inválidas falham sem reparar/zerar.
Nenhum SDK direto lê/grava overlays, chunks, controle ou operações/chaves, nem dono.

| Ação    | Estado exigido   | Resultado                                                              |
| ------- | ---------------- | ---------------------------------------------------------------------- |
| save    | base ou override | override inteiro novo, revision +1                                     |
| remove  | base ou override | removed, previousMode conserva modo anterior e corpo interno           |
| restore | removed          | volta a previousMode, preservando corpo override se havia, revision +1 |
| discard | override         | base, apaga corpo override, conserva documento/revisão contínua +1     |

No modo removed, GET não entrega aliases/corpo/relações da ficha. A lista de
retiradas mostra name/category efetivos somente após os gates atuais da origem e
da ficha, além de identidade opaca, modo e revisão, com ação Restaurar. Retirada
local não é revogação; o mestre precisa identificar qual ficha vai restaurar.
Restaurar passa pelos gates atuais e então devolve o estado autorizado. Para
descartar uma variante retirada, restaurar primeiro e descartar explicitamente;
não combinar dois efeitos implícitos. Ação incompatível com modo falha sem +1.

Salvar texto idêntico em novo pedido válido incrementa uma vez; replay zero vezes.
Não reutilizar ID ou revisão zero após discard. Retirar não apaga bytes override;
descartar apaga os chunks ativos na mesma transação, sem histórico automático.
Revisão global muda em cada mutação real, inclusive remove/restore/discard; chaves,
fences e replays não mudam a coleção de lore.

## DTOs e APIs propostas

Tipos fechados; servidor deriva UID, autoria, datas, versões gravadas e modo.
`Scope = {campaignId,campaignToken,baseId}`. List aceita campaignToken omitido
somente na primeira abertura; baseId é a base ativa conhecida da campanha.

Envelope flat de conteúdo:
`{schemaVersion:1,ownerId,campaignId,campaignToken,baseId,collectionRevision,projectionToken}`.
projectionToken vincula base/projeção de autorização atual e revisão global; não
usa timestamps de conteúdo vivo como revisão do overlay. Não devolver sourceToken
interno, caminho, chave, IDs do universo nem entidade viva.

`Header = {...Scope,sourceKey,operationId,expectedRevision}`.
`SaveHeader = {...Header,relatedSourceKeys}` com array único ordenado de até 50
sourceKeys. O servidor exige ordem canônica, não altera o descriptor no retry.
`LoreEntityInput = {name,aliases,category,summary,details,structuredDetails:{appearance,
personality,history,notes},relations:[{targetKey,relationType,description}]}`.
Todos esses campos são obrigatórios no save da entidade inteira, inclusive arrays
vazios e strings estruturadas vazias. Não aceitar isPublic nem IDs de lore vivo.
Não persistir nomes de alvos no input; nomes efetivos são resolvidos pelo servidor.
`LoreEntityView` contém os mesmos campos projetados, mas cada relação tem também
targetName obrigatório. Converter View em Input explicitamente; nunca serializar
o GET diretamente como pedido, nem persistir nomes de alvos no ciphertext.

`LoreState = {sourceKey,revision,mode,createdAt,updatedAt,entityHash,entity}`.
Estado virtual base usa revision 0, createdAt/updatedAt null; registro real tem
revision >=1 e datas UTC servidor. entityHash é SHA-256 do conteúdo canônico
armazenado, não do DTO após projetar relações. Em removed, entity/entityHash null.
Leitura de relação acrescenta targetName somente após autorizar o alvo efetivo.
entity usa LoreEntityView. entityHash é opaco ao cliente: o servidor confere o
hash/manifesto do canônico interno antes do DTO. Relações filtradas e targetName
fazem o hash da projeção diferir; o cliente valida o DTO inteiro e não recomputa
entityHash sobre a View.

| API                          | Entrada                                                                                         | Saída                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| listCampaignLore             | campaignId, baseId, campaignToken?, view? active/removed, cursor?, limit?                       | envelope, items, nextCursor                                                                                              |
| getCampaignLore              | Scope, sourceKey                                                                                | envelope, item LoreState ou null quando indisponível                                                                     |
| prepareCampaignLoreVariant   | SaveHeader                                                                                      | envelope + SaveHeader, action save, key base64 32 bytes, algorithm AES-GCM                                               |
| saveCampaignLoreVariant      | SaveHeader, sealed:{version:1,algorithm:AES-GCM,nonce,ciphertext}                               | envelope, item LoreState confirmado                                                                                      |
| removeCampaignLore           | Header                                                                                          | envelope, item LoreState removed sem corpo                                                                               |
| restoreCampaignLore          | Header                                                                                          | envelope, item LoreState autorizado atual                                                                                |
| discardCampaignLoreVariant   | Header                                                                                          | envelope, item LoreState base autorizado                                                                                 |
| resolveCampaignLoreOperation | Header, action save/remove/restore/discard, relatedSourceKeys só em save, intent confirm/cancel | ownerId, schemaVersion1, Header, action, relatedSourceKeys só em save, state committed/canceled, revision número ou null |

List items active: `{sourceKey,revision,mode:base/override,name,category}`.
List items removed: `{sourceKey,revision,mode:removed,name,category}` sem previousMode/corpo.
Nome/categoria também dependem dos gates atuais; ficha indisponível fica ausente.
Não incluir aliases/texto/relações em resumo. Picker usa list active; resolver
selecionados por GET explícito, sem catálogo vivo ou array total em memória.
O painel público é CampaignLorePanel({campaignId,baseId}); recebe activeBaseId
conhecido pela composição CampaignPage, sem importar internos do leitor B.
GET indisponível não revela título/categoria/aliases/relações/versão da origem;
erro de campanha/base global indisponível falha o gate, não retorna lista falsa vazia.

Conflito usa failed-precondition/details.reason revision-conflict, sem texto.
Escopo/base incompatível usa base-changed; encarnação campaign-changed; cursor
cursor-invalidated; fence cancelado operation-canceled. Outros inputs inválidos
usam invalid-argument. Não devolver corpo/revisão privada no erro após revogação.

## Entidade inteira, relações e limites

Preservar os limites atuais de lore listados na descoberta. Nome/resumo/tipo de
relação obrigatórios e trim; aliases trim sem vazio. Prosa details/structuredDetails
preservada exatamente, inclusive quebras/espaços/Unicode, sem truncamento. Rejeitar
lone surrogate em qualquer string: UTF-8 deve fazer roundtrip exato. Categoria é
enum fechado; relações não apontam para si. relatedSourceKeys é o conjunto único
ordenado de seus alvos, sem proibir dois tipos de relação ao mesmo alvo.

Relação só aponta a outro item lore capturado da mesma base, atualmente autorizado
e não removed na mesa. Validar alvos pelo servidor na mesma transação; nunca
aceitar UID/nome/categoria do alvo fornecidos pelo cliente. Nome efetivo vem do
overlay autorizado atual do alvo, ou do snapshot capturado se mode base; nunca do
lore vivo. Relação cujo alvo depois fica indisponível/removido sai da projeção,
inclusive seu tipo/descrição/nome; não apagar silenciosamente a relação persistida.
Salvar a entidade inteira substitui explicitamente seu conjunto de relações.

Envelope canônico de save até 900.000 bytes UTF-8; preparação total de writes,
incluindo metadados/chunks/recibo/controle, até 2 MiB. Essa restrição é técnica,
sem quota comercial de entidades. Base legada maior pode ser lida até o teto B,
mas edição acima do teto oferece redução explícita; não truncar nem migrar ao GET.
Ciphertext binário até plaintext permitido +16 bytes da tag GCM; nonce 12 bytes.
Transporte callable usa base64 canônico validado; IDB guarda ArrayBuffer binário.
GET inteiro com manifesto/hash validados antes do DTO, resposta até 4 MiB. Não
paginar o editor. Limites UTF-16 e bytes também validados no cliente sem truncar.

## Escritor, CAS, recibos e atomicidade

Todas as mutações autorizam campanha/base/ficha atuais, conferem token/base
e expectedRevision observado, leem controle/overlay/recibo antes de qualquer write.
Revision virtual 0 só sem documento; documento mode base após discard conserva
revision e não é tratado como ausente. Verificar contadores seguros sem clamp.
Prepare/save exigem o conjunto integral congelado de alvos autorizados e não
removed. Remove/restore/discard não precisam decifrar um rascunho ou liberar todos
os alvos antigos: suas saídas projetam somente relações atualmente autorizadas.
Assim descartar uma variante pode voltar à base sem reexibir relações revogadas.

Save recebe sealed request, não plaintext no RPC. Autorizar ficha e operação
ANTES de ler chave/decifrar; AES-GCM autentica AAD e bytes. Validar JSON fechado,
UTF-8, limites, entidade inteira e relações antes dos writes. Não logar ciphertext
nem erro criptográfico contendo dados. Em uma transação: novo corpo/chunks,
manifesto/modo/revisão/datas, controle global e recibo committed. Sobrescrita remove
chunks antigos no mesmo commit e preserva criação. Prepared total até 2 MiB.

Fingerprint cobre exatamente SaveHeader + nonce + ciphertext + algoritmo/versão;
retry precisa manter os bytes sealed imutáveis, não recriptografar o mesmo pedido.
Mesmo operationId/outros bytes/ação falha. Remove/restore/discard usam fingerprint
somente de Header+ação, sem chave/ciphertext. Operações prévias canceled não mudam
nenhum overlay; nenhuma combinação recria corpo após discard/removal/revisão nova.

Replay reautoriza e confirma somente se revisão/modo/hash próprios ainda iguais
ao recibo. Comparar estado persistido, não targetName projetado; editar outra ficha
não invalida confirmação própria, mas collectionRevision retornada é a atual.
Edição posterior da mesma ficha conflita sem rebase. Gate de relação/projeção vale
também no replay; corpo revogado nunca é retornado pela confirmação antiga.
Chave não é apagada no commit antes de recuperação poder confirmar seu resultado.
Prepare de operação existente prepared/committed devolve a MESMA chave após
conferir descriptor e todos os gates, sem exigir expectedRevision igual à revisão
atual do overlay. O +1 próprio e outra edição não impedem recuperar o rascunho;
o escritor/replay ainda aplicam CAS e podem conflitar. Operação encerrada nunca
gera outra chave, nem volta a prepared. Primeiro prepare também não grava lore.

## Recuperação cifrada e fence de encerramento

Usar Node crypto e Web Crypto existentes, sem dependência ou segredo de deploy.
Gerar chave aleatória AES-256-GCM por operação no servidor, em documento SDK negado.
Chave retornada somente após autorização atual; importar CryptoKey não extraível,
somente em memória. Nunca guardar chave/raw bytes no journal, IDB, storage de sessão,
logs ou descriptor. Resposta de chave deve ter Cache-Control private, no-store
inclusive erro do handler. Usar onCall existente com enforceAppCheck preservado:
helper específico ou extensão mínima do padrão campaignCaptureHttp.mjs/
setCampaignMediaHeaders aplica rawRequest.res antes de try/auth/serviço. Provar
success/error desse handler por teste HTTP real como B. Não alegar cobertura de
erros do framework anteriores ao callback nem de produção. Não criar onRequest
ou outro endpoint para essa finalidade.

AAD é JSON UTF-8 de array canônico fechado:
`[1,uid,campaignId,campaignToken,baseId,sourceKey,operationId,expectedRevision,'save',relatedSourceKeys]`.
Nonce aleatório novo de 96 bits por seal. Após persistir sealed para envio, bytes,
IV e AAD ficam imutáveis nesse operationId. Chave por operação não serve a outro
UID/campanha/base/ficha/revisão. Metadados prepared da operação são imutáveis,
incluindo relatedSourceKeys.

Adaptador privado IndexedDB com Web Locks por UID/campanha:

1. Sob lock, verificar identidade e ausência de outro pedido; gravar descriptor
   somente de metadados em fase preparing e aguardar transaction.oncomplete.
2. Fora do lock, preparar chave online, com gates atuais. Campos continuam na
   memória; antes do seal não anunciar rascunho integral persistido/recuperável.
3. Cifrar payload inteiro; sob lock, conferir descriptor/operação/identidade,
   guardar nonce+ciphertext binários e fase sealed; aguardar transaction.oncomplete,
   não apenas put.onsuccess. Só então permitir RPC save.
4. Em falha de IDB/crypto/permissão, não enviar. Preservar campos da sessão e
   explicar limite. Descriptor sem ciphertext após reload só permite resolver/
   cancelar; não inventar corpo nem chamar isso de recuperação integral.
5. Após reload com sealed, reautorizar online para obter chave, decifrar/validar
   descriptor/AAD/payload e repetir exatamente o mesmo sealed request. Nunca usar
   chave antiga em memória para uma nova abertura sem reautorizar.
6. Confirmado pedido e identidade/revisão atuais, limpar somente sua operação sob
   o mesmo lock, após o protocolo de confirmação abaixo. Resposta incerta conserva
   journal e bloqueia outro pedido; conflito
   não obtém revisão nova para reaplicar texto. Apresentar descarte explícito.

Remove/restore/discard reservam journal metadata-ready, sem chave/cifra, e só
enviam após IDB transaction.oncomplete. Repetem exatamente Header+ação em recovery.
Capturar o payload inteiro antes do primeiro await; bloquear campos durante o
preparo/pedido para não alterar relatedSourceKeys, bytes ou revisão em andamento.

Após resposta de mutação validada, substituir atomicamente o journal por fase
confirmed sob o mesmo lock, guardando só identidade/ação/revisão confirmada e
removendo ciphertext. Só depois de oncomplete chamar resolve com intent confirm.
Esse intent exige recibo committed (ou canceled já conhecido) e fecha a chave;
ausente/prepared falha operation-unconfirmed sem gravar fence. Ao confirmar o
encerramento, limpar o journal por operationId. Se a resposta desse fechamento
for perdida, confirmed reaparece após reload e repete somente resolve confirm,
sem pedir chave novamente. Se persistir confirmed falhar, não fechar a chave:
manter o sealed/metadata-ready recuperável. A confirmação não adota DTO tardio
ou coleção inferior à já observada; recarrega o estado autorizado sem rebase.

BroadcastChannel transmite somente pulse opaco, sem corpo/chave/nomes/aliases;
ele e evento de foco pedem releitura do IDB. Não é lock nem fonte de verdade.
Não depender de storage events para IDB. Duas abas não podem substituir descriptor
nem limpar pedido novo por resposta antiga. Não manter Web Lock durante HTTP.
Sem Web Locks/IDB/Web Crypto seguros, leitura continua e mutação fica bloqueada.

Logout/troca UID/campanha/base/versão de gate e desmontagem descartam chaves/texto
derivado em memória e invalidam respostas tardias. Nenhuma chave é cacheada offline.
Revogação bloqueia novas entregas; bytes já recebidos não podem ser apagados do
computador. Não afirmar proteção contra XSS/DevTools ou cópia feita pelo usuário.

Resolver com intent cancel é ação explícita de ENCERRAR pedido, nunca preflight automático
da recuperação. Autoriza UID e identidade própria do descriptor/recibo sem precisar
de origem; ecoa identidade completa para validação, sem chave, corpo, título,
mode ou projeção. Se já committed,
retorna somente estado/revisão confirmada. Se ausente/prepared, grava fence canceled
na mesma transação e fecha a chave ANTES da resposta; save concorrente só vence
antes desse fence, ou é negado depois dele. Retry desse encerramento é idempotente.
Header incompatível com operação existente falha, sem encerrar operação alheia.
Root removido/recriado não impede cleanup da operação própria antiga: conferir o
token guardado no descriptor, sem adotar a encarnação nova.

Conservar ciphertext/chave prepared sem TTL até confirmação/encerramento explícito
ou exclusão integral futura. Não transformar revogação em exclusão de rascunho
nem chave revogada em nota própria. Resolver committed pode fechar a chave sem
retornar o texto; leitura atual posterior usa GET e gates normais. Futuro delete
limpará operações/chaves/chunks/IDB sob seu contrato, sem introduzir job genérico aqui.

## Lista, projeção e interface

List percorre base/items where kind==lore, `__name__` ASC, limit25 padrão/50 máximo
+1 e select de metadados necessários; consulta cada overlay correspondente e gate
de disponibilidade. Filtrar servidor por view active/removed, sem loop ilimitado
nem whole collection. Pode retornar janela vazia com nextCursor; cliente continua
por ação paginada e não declara vazio final antes de esgotar cursor. Sem total.

Cursor fechado/versionado vincula UID, campanhaToken, baseId, view, projectionToken,
collectionRevision e último sourceKey escaneado (SHA-256 opaco). Sem nome/ID original
de ficha indisponível. Não usar offset. Qualquer revisão global/projeção diferente
invalida páginas antes de devolver campos. Resposta até 4 MiB, sem pular item por
orçamento. Índice somente se query real exigir; não inferir produção pelo emulador.

Novo painel público Lore da mesa na campanha original, separado visualmente de
Base congelada. BaseReader continua mostrando B imutável; não injetar overrides
em seu contrato. Listagem ativa/retiradas cobre loading/vazio/erro/sucesso/página
seguinte e distingue Base/Variante da mesa/Retirada sem anunciar publicação.

Editor próprio usa Input/Textarea/Dropdown de shared/ui, quatro campos estruturados,
aliases e relações com picker paginado, sem allEntities, isPublic ou lore vivo.
Confirmações explícitas para retirar/restaurar/descartar; descarte avisa perda do
override inteiro. Recurso indisponível limpa projeção/chave e oferece encerrar
pedido sem texto; não monta draft privado a partir do ciphertext após negar gate.
Três temas, teclado/foco, 320 px e textos longos sem overflow. Beforeunload protege
pedido pendente; fechar não libera outra mutação nem reabre modal na resposta tardia.

## Tarefas sequenciais, arquivos e validação

1. Revisar este rascunho e receber ou manter
   explicitamente a suposição opcional de recuperação antes de liberar código.
2. C2 servidor: functions/src/campaignLore*.mjs e campaignVariantRecovery*.mjs,
   helper puro campaignIdentity.mjs extraído de notas, alteração mínima de
   campaignBaseContracts.mjs para snapshot/gate reutilizável; index/package checks,
   unit e SDK dedicados. Sem modificar escritores de lore global.
3. C2 cliente: src/features/campaign-lore com modelo/transporte/serviço/adaptador
   IDB/crypto/controlador/painel públicos; composição mínima CampaignPage. Não
   importar internos de lore, campaign-bases ou campaign-notes.
4. QA: fixture somente de transportes novos e quatro jornadas nativas pequenas
   com Web Crypto, IndexedDB e Web Locks reais; matriz de temas/foco/320 px.
5. Testes dirigidos por ajuste e revisão independente; validate completo no
   fechamento, documentação/ADR/AGENTS/entrega/Git e CI em paralelo pela raiz.

Root centraliza índices/regras/docs/Git. Backend não toca frontend/fixtures; cliente
não altera servidor; testes SDK são coordenados por um harness sem portas sobrepostas.
Configurar índices de conteúdo/ciphertext desabilitados, sem alegar deploy.

Negativos e critérios de aceite obrigatórios:

- Mesma origem em duas campanhas: override/removed/revisões independentes, original
  e base B intactos; trocar universo organizacional conserva variante/notas C1.
- Base→override→removed→restore mantém override; base→removed→restore volta a base;
  discard apaga corpo e conserva revisão, replay antigo não o restaura.
- CAS concorrente, pedido idêntico replay0, nonce/ciphertext novos com mesmo ID
  negados, alteração posterior conflita, recibo sem texto retorna lista atual.
- Origem/ficha/universo removidos/privacidade alterada: antes de corpo/chave,
  inclusive GET/replay/descarte/restauração/picker/relações; C1 preservado.
- Relação a ficha não capturada, outra mesa/base, removida, revogada ou própria
  negada; nomes efetivos de variantes usados, sem consulta viva ou nome inventado.
- Lista vazia com cursor, duas páginas, revisão global/projeção mudando, cursor
  forjado/UID/base/view trocados, zero corpos/lista limitada; SDK direto negado.
- UTF-8 grande/quebras/emoji/lone surrogate, tetos de texto/JSON/chunks/prepare/GET,
  manifesto/hash corrompidos e nenhum truncamento ou reparo silencioso.
- Reload de sealed antes de primeiro save recebido recupera exatamente os bytes;
  perda após commit confirma sem duplicar. Preparing sem ciphertext não promete texto.
- Chave nunca persistida no navegador, nonce/AAD adulterados negados, gate recusado
  não decifra/exibe; resposta HTTP chave success/error private,no-store.
- Resolver versus save concorrentes têm um resultado linearizável; canceled não
  revive; committed sem origem entrega só metadados opacos; limpeza repetível.
- Duas abas disputam descriptor/clear sem substituir pedido; IDB abort/quota e
  put success antes abort não disparam RPC. BroadcastChannel não concede acesso.
- Logout/UID/campanha/base/root recriado e respostas tardias não adotam corpo,
  chave, revisão ou journal da identidade anterior; formulário permanece no erro
  autorizado sem rebase, confirmação antiga não reabre diálogo fechado.

## Gate adicional fechado e riscos

**Relações no rascunho cifrado:** gate apenas da ficha principal não basta para
mostrar uma descrição de relação cujo alvo depois ficou indisponível. Solução
técnica escolhida pela raiz: relatedSourceKeys opacos, únicos e ordenados (máximo 50) são preparados e congelados no descriptor, chave/recibo/fence e AAD, autorizados
antes de CADA entrega da chave, inclusive chave existente. Corpo sealed precisa
ter exatamente esse conjunto de targetKeys; servidor confere após decrypt e
reautoriza alvos antes do write; cliente confere o conjunto antes de mostrar texto
recuperado. Mudou o conjunto antes do seal? Encerrar descriptor e preparar outra
operação, sem reusar chave/ID. Não há endpoint adicional de key-unseal ou emissão
one-shot. Se um alvo ficou indisponível/removido, o rascunho inteiro não é
recuperado; UI oferece resolver/cancelar sem corpo e conserva ciphertext até a
escolha explícita. Nunca omitir um alvo do descriptor para pedir chave. Description
também é corpo; omitir targetName do ciphertext sozinho não resolveria esse caso.

## Revisão operacional antes do código — 2026-10-15

Revisões independentes de servidor, cliente e QA fecharam: recuperação da chave
após +1 próprio, bodyRevision independente do overlay, hash interno opaco ao
cliente, View/Input separados, eco integral de identidade em resolve, metadata-ready
para mutações sem corpo e confirmed para fechar chave sem perder recuperação.
O teste de sealed antes de qualquer recebimento servidor é distinto do hold após
commit; ambos serão observados. Inspeção de plaintext no navegador cobre apenas
namespaces do produto e exclui explicitamente backing stores writer.visual.*,
com resultados booleanos/contadores e sem anexar registros/chaves.

Permanecem riscos conhecidos: ciphertext integral ocupa armazenamento da origem
mesmo em IDB e quota pode falhar; XSS/sessão já autorizada pode acessar plaintext;
retenção de chaves tem custo; chamadas de chave precisam no-store provado; tokens
e coleções não substituem autorização; origem editada não deve ser revogação falsa.
Não prometer persistência antes transaction.oncomplete nem disponibilidade offline.

Fora: criação de lore independente na campanha, copiar variante para notas, IA,
histórico automático de variante, promoção de cânone, atualização/comparação de
base C3, sessões, compartilhamento, comércio, imagens e exclusão integral. C3 deve
tratar pedidos ligados à base anterior explicitamente; não transferir ciphertext,
chave ou revisão automaticamente para nova activeBaseId.

## Evidência intermediária — 2026-10-15

- Servidor dirigido: 33/33 (C2 12, HTTP real da chave 2, notas C1 8, leitor B 11).
- SDK real C2+C1: 8/8, zero falhas/skips, 13.701,8347 ms; quatro casos novos e
  quatro regressões de notas. Emulador verificado encerrado ao fim do harness.
- SDK confirma ciclo completo/bodyRevision, negações diretas, concorrência/fence,
  recuperação/encerramento da chave, gates de relações, root ausente/recriado,
  paginação/UTF-8/hash e preservação de notas próprias. Não usa Storage.
- Correções exclusivamente do cliente não repetem esses oito casos do servidor.
  Navegador e validate completo ainda pendentes; estes resultados não encerram C2.

## Fechamento local — 2026-10-17

- `npm run validate` exit 0: 167 arquivos/1.620 testes frontend (159,98 s),
  77 scripts (9.077,5239 ms), 311 Functions (8.947,9835 ms), lint, tipos,
  arquitetura, documentação, estilo, formato, sintaxe, build e smoke verdes.
- Cobertura: statements 90,79%, branches 84,71%, functions 90,35%, linhas 93,37%.
  A tentativa anterior passou 1.614 testes, mas falhou no limite de funções com
  89,16%. Seis testes observáveis de formulário, relações, recuperação e ações
  fecharam a lacuna; nenhum limite, exclusão ou timeout foi alterado.
- SDK real C2+C1: 8/8, 13.701,8347 ms; preservado porque as correções posteriores
  afetaram somente cliente/testes. Servidor dirigido 33/33.
- Chromium: 24 percursos únicos positivos nos seis projetos, sem retries/skips,
  mais dois controles reais de adaptador e uma regressão C1. Execuções negativas
  preservadas: foco do modal e DOMException de quota foram corrigidos, repetindo
  somente os casos afetados; uma expectativa da fixture foi alinhada à mensagem
  real. Uma execução inicial foi interrompida para aplicar a correção de projeção.
- Revisões independentes de servidor, cliente e QA, com reconferência dos achados;
  revisão final em 2026-10-17 sem P0/P1/P2 concreto remanescente.
- [Entrega e limites da evidência](../../../entregas/2026-10-17-writer-v2-variantes-de-lore.md).
  C2 não encerra F2-07: comparação/adoção explícita e limpeza integral permanecem
  obrigatórias. CI pendente é acompanhada em paralelo, sem merge/deploy.
