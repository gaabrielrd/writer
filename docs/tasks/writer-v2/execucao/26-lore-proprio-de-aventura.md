# F2-09 L — Lore próprio de aventura

**Estado em 2026-10-21:** contrato revisado e implementação liberada pelo
responsável pela integração após enviar a correção S3 em `e924890`. A ABI de
relações indisponíveis, metadata, limites e inventários foi fechada entre backend,
cliente e QA. L foi implementado e validado localmente; CI do novo incremento pendente. Ver [entrega L](../../../entregas/2026-10-21-writer-v2-lore-proprio-de-aventura.md).
A liberação permitiu iniciar L; o fechamento local e remoto mantém portões próprios.

**Origem:** [F2-09](../fase-02-criar-e-preparar/09-lore-importacao-e-portabilidade.md)
e [divisão em incrementos](25-lore-importacao-e-portabilidade.md).
**Base da descoberta:** S3 `a9b588a`, validado localmente; sua correção visual de CI
foi validada localmente e enviada em `e924890`. Esse head passou na CI geral 39597170795 e nas regras 39597170719; esse resultado é de S3, não de L.

## Objetivo e limite da vertical

Criar, consultar, editar e excluir fichas particulares da aventura pelo servidor;
usá-las em menções e referências explícitas de cenas/narrativa e em bases de
campanha, variantes e adoção. A ficha local vence o termo/alias global segundo a
regra já aprovada. Referência local indisponível não busca outra ficha pelo nome.

A nova ficha permanece privada do criador. Sua inclusão em base de campanha do
próprio criador não publica conteúdo, não promove cânone nem concede direito de
revenda. C1, S1 e S3 continuam independentes do material derivado.

Não fazem parte de L: IA, importação, backup/restore, novos dados de jogadores,
imagens em fichas, workflow integral de exclusão de aventura, publicação ou venda.
A decisão recebida de incluir estado atual e todo o histórico no backup pertence
às verticais de portabilidade; não cria dependência para L.

## Evidência da inspeção

O grafo localizou parte do legado de universos, mas não cobriu os contratos atuais
suficientemente. A inspeção dos arquivos reais confirmou os seguintes pontos:

- `lore/model/loreEntity.ts` aceita apenas escopos livro/universo.
- `loreScope.ts` já resolve termos locais antes de globais e antes de visibilidade.
- `loreService.ts` usa leituras Firestore do legado; adicionar adventure ao enum
  sem ramificar o transporte enviaria chamadas para a coleção errada.
- `scenes.mjs`, `narrativeContracts.mjs` e `narrativePlanning.mjs` validam somente
  referências book/universe e precisam resolver o escopo local explicitamente.
- `campaignCaptureItems.mjs` captura lore referenciado somente do universo;
  `baseItemAvailable` também presume origem global para toda ficha capturada.
- `projectedStructured`, `projectedReference` e `loadCapturedEntity` usam prefixos
  e conversões específicos de universo.
- `candidateItem`, C2 e os anchors precisam validar a nova origem antes de devolver
  nomes ou ler corpos. A simples inclusão de uma coleção não fecha o circuito.
- Não existe exclusão integral de aventura: `deleteSceneBook` é limitado a livros.
  Remover a raiz por Admin em QA simula o gate, não prova esse workflow ausente.

## Identidade de origem e compatibilidade

A origem antiga de universo permanece exatamente:

```ts
UniverseOrigin = { kind: 'lore', scopeId: universeId, id: entityId };
```

A origem nova local é discriminada:

```ts
AdventureLoreOrigin = { kind: 'adventure-lore', adventureId, id: entityId };
```

Em ambos os casos, o item capturado conserva `kind: 'lore'` e
`sourceKey = digest(origin)`. Não acrescentar campos ao objeto antigo de universo.
Não mudar `baseSourceKey`, `baseBodyKey` ou o preimage antigo de `loreOriginKey`.
Chaves de base, corpos, relações, variantes, recibos e referências S2 antigas
permanecem vinculadas à mesma origem. Não há migração das bases antigas.

`storeCapturedItem` deriva `item.kind` de `origin.kind`; no ramo local, o metadata
passado ao helper precisa definir explicitamente `kind: 'lore'`. A nova origem não
entra em `baseKinds` como outro tipo de item.

Referência autoral local:

```ts
{ kind: 'adventure', scopeId: adventureId, entityId }
```

ID público local: `adventure:<adventureId>:<entityId>`. IDs públicos de universo e
IDs locais de livros ficam intactos. IDs locais novos seguem `validateId`; a
validação da origem global não deve ganhar restrição que rejeite IDs legados
antes aceitos pelos seus leitores.

Um helper puro específico das duas origens centraliza validação discriminada,
referência → origem, ID de relação → origem e verificação de sourceKey. Não criar
um registro genérico de provedores ou um framework de projetos.

Antes de projetar uma ficha capturada, conferir forma da origem e hash; origem
local precisa pertencer a `base.adventureId`, global a `base.universeId`. Corrupção
é erro fechado. Raiz/entidade legitimamente ausente, deleting ou tombstonada torna
o recurso indisponível sem devolver nome ou corpo.

## Persistência, identidade e revisão

```text
adventures/{adventureId}/lore/{entityId}
adventures/{adventureId}/loreBodies/{entityId}
users/{uid}/adventureLoreOperations/{operationId}
users/{uid}/adventureLoreFences/{operationId}
```

Metadata local contém identidade, entityId, revisão, nome, aliases, categoria,
resumo, relationCount, datas, `isPublic: false` e deleted. RelationCount é derivado
da quantidade real de descritores no save e gravado atomicamente com o corpo;
não é aceito como contador fornecido pelo cliente. Corpo contém identidade, entityId,
revisão, details, structuredDetails e relações. Separar metadata de corpo permite
listas/menções sem carregar todas as descrições extensas.

`adventureToken` deriva de UID, ID e createTime real da raiz, sem aceitar um token
fornecido pelo arquivo ou pelo próprio documento como autoridade. Recriar uma
raiz produz outra identidade. `adventure.loreVersion` é a revisão da coleção local;
não adicionar controle redundante. Ausência desse campo só representa zero se
consulta limitada, incluindo tombstones, comprovar coleção local vazia.

Cada mutação incrementa revisão da ficha e loreVersion e atualiza updatedAt com
data válida monotônica. Contadores/revisões inválidos ou overflow falham antes de
escrever. Não usar leitura para migrar ou corrigir registros silenciosamente.

Tombstone conserva somente identidade, entityId, revisão e datas. Não conserva
nome, aliases, resumo, relationCount ou corpo. EntityId já usado nunca é reutilizado, inclusive
quando o registro atual é tombstone.

## ABI fechada proposta

Todos os DTOs são fechados. Datas são números de milissegundos do Unix epoch,
seguros, finitos e dentro da faixa válida. Identidade comum:

```ts
Identity = { schemaVersion: 1, ownerId, adventureId, adventureToken };
Reference = { kind: 'adventure' | 'universe', scopeId, entityId };
```

Cinco RPCs:

```ts
listAdventureLore({
  adventureId,
  adventureToken?,
  scope: 'adventure' | 'universe',
  category?,
  cursor?,
  limit?
})

getAdventureLore({
  adventureId,
  adventureToken,
  reference,
  expectedContextToken,
  expectedEntityToken
})

saveAdventureLore({
  adventureId,
  adventureToken,
  entityId,
  operationId,
  expectedRevision,
  expectedCollectionRevision,
  entity
})

deleteAdventureLore({
  adventureId,
  adventureToken,
  entityId,
  operationId,
  expectedRevision,
  expectedCollectionRevision
})

resolveAdventureLoreOperation({
  adventureId,
  adventureToken,
  entityId,
  operationId,
  action: 'save' | 'delete',
  expectedRevision,
  expectedCollectionRevision,
  requestHash,
  intent: 'cancel'
})
```

Token é opcional somente no bootstrap da lista; o resultado autenticado o fornece.
Os demais pedidos exigem o token. `scope: universe` significa exclusivamente o
universo atualmente vinculado e autorizado pela aventura, nunca um ID arbitrário.
Get de universo é consulta contextual; CRUD global continua na página existente.

Perder ou trocar o universo não bloqueia listar, ler ou editar lore próprio.
List/get locais exigem somente a aventura própria ativa e sua identidade; save
usa o CAS local e não exige disponibilidade do universo. A consulta pode fornecer
um contexto novo com todos os locais completos e nenhum global. Invalidar os
candidatos globais e seus rótulos associados; não apagar formulário, prosa ou
metadata local confirmada apenas por essa mudança. Respostas do contexto global
anterior não podem voltar a preencher candidatos, tooltip ou rótulos de relações.
Um get local usa a seleção/token atual obtida pela lista local, mesmo quando o
contexto informa universo indisponível; indisponibilidade global não é erro de
autorização do corpo próprio. Descritores globais antigos continuam neutros.

### Listas e get

```ts
CommonSummary = {
  id,
  reference,
  entityToken,
  name,
  aliases,
  category,
  summary,
  isPublic,
  createdAt,
  updatedAt,
};
LocalSummary = CommonSummary & { revision, relationCount };
GlobalSummary = CommonSummary & { relationCount?: number };

ListResult =
  Identity &
  {
    scope,
    collectionRevision,
    contextToken,
    items,
    nextCursor,
  };
GetResult =
  Identity &
  {
    collectionRevision,
    contextToken,
    item: Summary & { details, structuredDetails, relations },
  };
```

Summary é discriminado por reference.kind: local inclui revisão positiva;
global não recebe revisão fictícia. RelationCount local é inteiro não negativo e
reflete a quantidade real armazenada, inclusive descritores antigos indisponíveis.
Global pode omitir relationCount quando não houver metadata equivalente; Card/List
mostram contagem desconhecida, nunca zero inventado. Não ler o corpo global somente
para preencher esse contador na listagem. `id` é canônico. Ficha local sempre tem
isPublic false. Metadata não finge que details/structuredDetails/relations vazios
foram capturados. O corpo só existe após get explícito bem-sucedido.

ContextToken é opaco e comum às páginas dos dois escopos. Prende UID,
adventureToken, loreVersion local, associação atual de universo, identidade/
disponibilidade/versões relevantes desse universo e relógio de autorização.
Cursor prende também scope, category e última posição name/id. Uma mudança de
contexto invalida continuação e seleção; nenhum cache anterior prova autorização.

EntityToken local prende referência, revisão e contexto. Global usa referência,
contexto e snapshot.updateTime preciso, sem inventar revisão global. Get confere
contexto e entidade antes de ler campos extensos. Metadata/body locais precisam
ter a mesma identidade e revisão.

Paginação padrão 25, máximo 50, com mais uma linha para continuidade. Metadata
local ordena por name/id. Filtro local usa deleted false. A consulta global não
introduz uma condição deleted false que excluiria fichas legadas sem esse campo;
se houver linha indisponível, janela limitada pode ficar vazia com continuação
pelo último registro examinado. Nunca truncar a coleção e chamá-la completa.

### Save e limites

Entity de save local contém exatamente:

```ts
{
  name, aliases, category, summary, details,
  structuredDetails: { appearance, personality, history, notes },
  relations: [{ targetEntityId, relationType, description }],
  isPublic: false
}
```

- Nome: até 200 caracteres; resumo: até 140; ambos obrigatórios.
- Até 20 aliases, cada um com até 200 caracteres.
- Categorias: character/location/concept/other.
- Details e cada campo estruturado: até 150.000 caracteres UTF-8 válidos.
- Até 50 relações; tipo até 200 caracteres; descrição até 4.000.
- Envelope completo validado até 900.000 bytes UTF-8.
- Resposta até 4 MiB; sem truncamento.
- Normalizar nome/aliases/resumo/tipo como metadata antes de congelar o pedido;
  preservar integralmente a prosa de details/structuredDetails/description.
- Não aplicar esses limites novos como migração ou redução dos leitores legados.

Criar exige expectedRevision zero e entityId igual a operationId. Edição é save
completo, não patch baseado em lista. CAS inclui revisão da ficha e coleção.
Lista nova nunca rebaseia a revisão base do formulário. Get exato ou criação
explícita estabelecem sua base.

## Relações antigas indisponíveis — representação fechada

Persistência e entrada de save usam o descritor canônico legado de três campos:

```ts
StoredRelation = { targetEntityId, relationType, description };
RelationView = StoredRelation & { available: boolean };
```

O novo get contextual, tanto local quanto global, devolve RelationView, sem
targetName, aliases, detalhes ou qualquer prosa pertencente ao destino.
Availability é derivado somente de alvos do contexto atualmente autorizado pela
aventura: local da própria aventura ou global do universo atualmente vinculado.
Um descritor externo, de universo antigo ou de alvo indisponível fica neutro; o
leitor não consulta outro escopo para obter nome/corpo. Isso não altera o formato
ou comportamento do leitor global legado usado fora do novo endpoint. Description
é texto do descritor da relação, sem reidratar trechos da ficha do destino. Nome visual só pode vir da metadata
atual autorizada do contexto; sem esse dado, apresentação neutra.

O adaptador de save retira apenas available e preserva os três campos e a
multiplicidade. Availability é derivado; nunca é aceito como autoridade na escrita.

- Destino local novo precisa ser da mesma aventura; outro adventureId é inválido.
- Destino global novo precisa pertencer ao universo atual e estar disponível.
- Autorrelação é recusada.
- Descritor já armazenado cujo alvo ficou indisponível pode permanecer exatamente
  igual ou ser removido. Comparação considera os três campos e sua multiplicidade;
  não permite duplicar um descritor indisponível como forma de adicionar vínculo.
- Trocar targetEntityId, relationType ou description de uma relação indisponível
  a torna nova/alterada e exige destino atualmente autorizado.
- Um universo antigo, perdido ou desvinculado pode aparecer apenas no descritor
  já armazenado, apresentado neutro. Não voltar a consultar seu nome/corpo.
- A UI oferece manter/remover o descritor indisponível; não o edita silenciosamente
  nem exige apagá-lo para salvar texto próprio de outro campo.

Essa regra permite editar a ficha local após perda/troca do universo sem apagar
relações antigas, sem fazer fallback global e sem transportar nomes/prosa revogados.

## Idempotência, conflito e incerteza

Transação de escrita: validar → conferir raiz/propriedade/token → consultar recibo
ou fence → conferir CAS e alvos novos/alterados → preparar relógio → escrever tudo
atomicamente. Não chamar outro endpoint HTTP dentro desse fluxo.

Recibo fechado:

```ts
Receipt = {
  operationId,
  action,
  entityId,
  expectedRevision,
  revision,
  collectionRevision,
};
Confirmed = Identity & { kind: 'confirmed', receipt };
Canceled = Identity & { kind: 'canceled', action, operationId };
```

Revisões resultantes são as esperadas + 1. Recibo guarda hash canônico do pedido,
sem corpo ou cópia dos campos autorais. Retry reconhece o recibo original antes
de conferir o alvo: create já confirmado e depois excluído não recria ficha.
Confirmação histórica não devolve corpo atual nem autoriza rebase do formulário.

Cliente normaliza e congela pedido completo/hash antes de enviar. Resolver usa
somente o descritor/hash: reconhece recibo existente ou grava fence que impede
aplicação tardia. Não ecoa hash, prosa ou pedido completo na resposta. Reuso de
operationId com outro descritor/hash falha fechado.

Rascunho e pedido incerto ficam em memória. Não há journal persistente nem promessa
de recuperar esse rascunho após reload. Erro/conflito mantém formulário; aviso de
saída protege trabalho pendente. Encerrar pedido é ação explícita; resposta tardia
só confirma o pedido congelado, sem substituir edição posterior. Se o usuário
sair/recarregar, a identidade de uma criação já usada nunca deve ser reaproveitada
por uma nova criação automática.

## Relógios, revogação e mídia existente

Toda mutação local atualiza a raiz e incrementa
prepareCampaignAuthorization com bump true na mesma transação. Isso invalida
certificados C3 e contextos C2/S2. Manutenção Admin que altera autorização precisa
respeitar o mesmo contrato; seed de teste não é prova de integração Admin real.

ReadCaptureOrigin já considera o stamp preciso da aventura; a escrita da raiz
invalida captura em andamento sem alterar o preimage antigo de sourceToken.
A projeção B hoje observa somente o universo: acrescentar a versão local observada
à sua identidade de projeção. C2/C3 também usam o relógio de autorização. Não
considerar apenas o incremento de updatedAt no cliente como revogação comprovada.

Não criar imagens de lore em L. Pins e usos de ilustrações de blocos/base continuam
nos namespaces existentes. Contexto local corrigido precisa alcançar as checagens
antes/depois de download/derivação das imagens e impedir commit tardio na UI.
Nenhum caminho privado de Storage ou token permanente entra no DTO novo.

Cada item local capturado guarda também `originAdventureToken` interno, fora de
`origin`, sourceKey e DTO público. O gate exige que esse token congelado e o
adventureToken da metadata da ficha coincidam com a identidade derivada do
createTime real da raiz atual. Item local sem o campo falha fechado: não existe
legado local anterior a L. Recriar raiz ou ficha com os mesmos IDs não reautoriza
o corpo capturado da encarnação anterior. FieldMasks, âncoras e contextos de
B/C2/C3/S2 propagam esse campo sem carregar prosa para conferir disponibilidade;
origens globais e seus hashes permanecem intactos.

Raiz ausente/deleting bloqueia leitura, mutação e histórico antes de corpos.
Ficha local tombstonada fica indisponível em base, C2, C3 e S2, sem afetar próprios.
C4 permanece v4: não há namespace novo de campanha nem pin novo. L não afirma
limpar integralmente uma aventura; essa exclusão ainda não tem workflow.

## Integração B/C2/C3/S2 e referências autorais

| Área                                 | Alteração necessária                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| scenes.mjs                           | Aceitar adventure e resolver somente no próprio projeto; tombstone não disponível                            |
| narrativeContracts/narrativePlanning | Validar referência local, opções e consulta reversa; observar versão local nos cursores                      |
| campaignCaptureItems                 | Capturar apenas referências explícitas locais da própria aventura; corpo coerente; item continua lore        |
| campaignBaseContracts                | Discriminar origem em baseItemAvailable; local não depende da disponibilidade do universo                    |
| campaignBaseRead                     | Relações/reference → origem pelo helper; gate antes de nome/corpo; projeção observa versão local             |
| campaignLoreContracts                | loreRecord e loadCapturedEntity aceitam ambas origens; preservar chaves e relações C2 existentes             |
| campaignComparisonContracts          | Contextos das duas gerações observam versão local e autorização atual                                        |
| campaignAdoptionRead                 | candidateItem valida origem/hash antes de devolver metadata                                                  |
| campaignLoreStorage                  | Anchor mantém base antiga e aventura de procedência; não converte origem local em global                     |
| C3 stages e S2                       | Propagar helper/contexto corrigidos; revalidar legado, alvo e mídia; DTO público atual pode permanecer igual |

Origem discriminada é interna. DTOs atuais de B/C2/C3/S2 não precisam expor
adventure-lore, alterar sourceKey ou ganhar campos obrigatórios. Structured de
ficha local usa isPublic false. Modos C2, legacy, revisões, targetKey e envelopes
atuais continuam intactos. Relações da base convertem o ID canônico para o
sourceKey correto; alvo não capturado/revogado não ganha nome por consulta viva.

Menção visual não cria automaticamente referência de captura. A seleção de fichas
para base permanece baseada nos vínculos explícitos já aprovados, sem inferir
novos vínculos pelo texto. Ficha local de outra aventura é recusada.

## Composição do cliente

Manter contratos/transportes de livros e universos. No ramo aventura de lore,
usar API nova com catálogo metadata paginado, get explícito e formulário estável
por UID/aventura/ficha. O formulário legado faz trim de details: o ramo aventura
preserva prosa integral sem mudar silenciosamente o legado.

AdventurePage compõe uma aba de lore local e link explícito ao universo. Somente
essa aba possui CRUD local; uma global não vira local por carregar contexto.
SceneEditorPage e AdventureBlockEditor recebem metadata completa do contexto.
Tooltip usa metadata; Drawer só abre corpo após get exato. SceneReferences e
NarrativeReferences adicionam o escopo adventure com entityId raw.

O conjunto completo de candidatos é carregado por páginas sob o mesmo token,
separado da página visível do catálogo. Erro local bloqueia fallback global.
Troca ou perda da associação global invalida os candidatos globais, seus
tooltips/rótulos e a continuação do contexto anterior, preservando o editor próprio. Troca de conta,
identidade da aventura ou revogação da ficha local fecha também os dados locais.
Não reidratar nomes antigos de relações indisponíveis a partir de cache.

## Inventário de arquivos propostos

### Backend e contratos

Novos:

- functions/src/adventureLoreContracts.mjs
- functions/src/adventureLore.mjs
- functions/src/campaignLoreOrigin.mjs, helper puro específico das duas origens
- testes de unidade correspondentes

Afetados:

- functions/src/scenes.mjs
- functions/src/narrativeContracts.mjs
- functions/src/narrativePlanning.mjs
- functions/src/campaignCaptureItems.mjs
- functions/src/campaignBaseContracts.mjs
- functions/src/campaignBaseRead.mjs
- functions/src/campaignLoreContracts.mjs
- functions/src/campaignComparisonContracts.mjs
- functions/src/campaignAdoptionRead.mjs
- functions/src/campaignLoreStorage.mjs
- functions/src/index.mjs e functions/package.json
- firestore.rules e firestore.indexes.json
- unidades dos comportamentos afetados

Revisão dirigida, sem edição presumida: campaignAdoptionStages,
campaignSessionReferenceContracts, campaignSessionScenes e leitores de mídia.
Modificar somente quando a propagação de contexto/helper exigir.

Regras negam SDK direto para fichas/corpos e recibos/fences, inclusive ao dono.
Índices locais para deleted/name/id e deleted/category/name/id; corpo extenso
sem indexação. Nenhuma regra pública ou alteração dos namespaces C4.

### Cliente e composição

- lore/model/loreEntity.ts: adventureId discriminado e Summary separado de Full
- loreScope.ts: ID canônico, decoder e prioridade sem alterar IDs antigos
- serviço/callables/hook próprios do ramo aventura
- LoreTab/LoreCollection e formulário privado com draft estável
- Card/List compatíveis com metadata; Drawer após get; Tooltip sem corpo
- contrato mínimo de menções em RichEditor/MentionMenu/richDocument e adaptadores
  associados, preservando o full legado
- AdventurePage, SceneEditorPage, AdventureBlockEditor, SceneReferences e
  NarrativeReferences
- testes dos comportamentos alterados

## Matriz de validação proposta

Quatro famílias SDK reais, sem repetir toda a orquestração S1/S3:

1. CRUD, CAS, limites, cursores e negação direta de get/list/write nos namespaces
   novos para dono via SDK, intruso e anônimo; tombstone não ressuscita por retry.
2. Resolução local/global/alias, referências de cenas/blocos/narrativa e captura B
   contendo somente fichas referenciadas; hashes e sourceKeys antigos de universo
   idênticos; corpo somente após gate.
3. Duas campanhas e bases novas/antigas, C2/C3/legadas/S2: isolamento, atualização,
   precedência e relações indisponíveis neutras; novo/alterado exige destino atual;
   prosa própria continua editável sem apagar descritores antigos.
4. Revogação, ficha excluída, raiz da aventura ausente/deleting por simulação Admin,
   conta trocada e resposta tardia: bloquear corpos/chaves sem apagar notas próprias
   nem aplicar resposta do UID anterior. Isso não valida exclusão integral da aventura.

Dois percursos nativos curtos, em seis perfis acordados:

1. Autor cria/edita lore local, encontra por alias, referencia em cena/bloco e captura
   para a mesa. Teclado, foco, temas e 320 px; draft local não é substituído por lista.
2. Mestre abre base/variante, vê precedência e relações disponíveis/neutras, muda
   autorização e confirma ausência de vazamento. Recuperação protegida aqui é a
   variante C2 existente; L não promete persistência do rascunho após reload.

Fixture prepara precondições por transporte; não executar todas as etapas de
captura/adoção em cada perfil. SDK real prova regras/transações; UI não substitui
essa prova. Unidades cobrem DTOs, origem/hash, limites, descritores preservados,
fence, conflito, ordem de gates, troca de conta e respostas antigas.

Testes afetados durante ajustes e validate no fechamento. Nenhum teste, navegador,
emulador ou resultado futuro é declarado executado neste contrato.

## Estimativa parcial e portão

Referência humana O/C/P do recorte L, com confiança baixa:

| Parcela                                 | Otimista | Central | Pessimista |
| --------------------------------------- | -------: | ------: | ---------: |
| Backend, contratos e unidades próprias  |     22 h |    38 h |       64 h |
| Cliente, composição e unidades próprias |     20 h |    34 h |       54 h |
| QA SDK/nativo, regressões e evidência   |     18 h |    30 h |       50 h |
| Total L sem sobreposição                |     60 h |   102 h |      168 h |

QA inclui quatro famílias SDK e duas jornadas em seis perfis, sem repetir as
unidades próprias das parcelas backend/cliente. A referência não contém IA nem
portabilidade; não representa horas realizadas, saldo medido ou previsão de
entrega. L reabre a parcela correspondente da baseline F2-09: não somar este total
novamente ao subtotal histórico como se fosse trabalho adicional independente.

A matriz local da correção S3 fechou 78 combinações únicas positivas, com uma
falha inicial de arranjo preservada e corrigida, além de tipos/lint verdes. Esse
resultado não é teste de L nem comprova CI remota. A correção foi enviada em
`e924890`; hooks verdes (tipos, 1.998 testes/194 arquivos, 135,19 s). Responsável
pela integração revisou este contrato e liberou L sem esperar o CI, conforme
autorização vigente. CI geral 39597170795 e regras 39597170719 encerraram com sucesso.

Antes de implementar:

- [x] Fechar, validar localmente e enviar a correção dos testes S3 no recorte autorizado; acompanhar CI remota em paralelo.
- [x] Fechar entre backend/cliente a representação de relações indisponíveis.
- [x] Revisar este contrato e sua composição antes de implementar.
- [x] Confirmar limites, DTOs e inventários de arquivos entre backend/cliente/QA.
- [x] Responsável pela integração liberar explicitamente a implementação de L.

Após implementação, revisão/validate/evidência/Git e CI permanecem portões próprios.
Não há autorização de merge, deploy, migração real ou exclusão Admin de dados do
operador por este documento.
