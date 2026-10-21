# F2-09 A — Contratos do chat de cenas

**Estado em 2026-10-21:** ABI implementada e validada localmente; CI do novo head pendente.
Complementa [29 — contexto autorizado e IA](29-contexto-autorizado-e-ia-de-cenas.md).
O operador confirmou: persona base por aventura, ajustes por cena e blocos
herdando a cena; ocultar respostas afetadas, manter perguntas próprias e bloquear
reuso até reautorizar a MESMA origem. Vetores independentes e revisão técnica
fechados; as evidências de implementação ficam no plano 29.
Capítulos e históricos legados não são migrados nem recebem proveniência retroativa.

## 1. Fronteira e normalização

Novo binding privado editorChat, onCall com streaming somente em send. Reutilizar
a política App Check, região e transporte de chapterChat. chatGeneration.mjs
continua sendo o contrato puro de geração. Chaves não entram no protocolo.
Não criar HTTP, dependência ou framework genérico neste recorte.

Requests e respostas são objetos fechados. Campo desconhecido, null indevido,
revisão inválida ou tipo errado falham. Não retornar documentos por spread.
Os tipos abaixo especificam wire; não são código implementado.

```ts
type Id = string; // novo protocolo: 1..128 ASCII [A-Za-z0-9_-]
type SourceId = string; // validador workId/sceneId atual, sem "/", "." ou ".."
type Hash = string; // exatamente 64 hex minúsculos
type Revision = number; // inteiro seguro >=0, incremento sem overflow
type DateMs = number; // inteiro seguro >=0, Unix ms válido
type Stamp = { seconds: number; nanoseconds: number }; // precisão nativa
type Target = { kind: 'book' | 'adventure'; id: SourceId };
type Resource = { kind: 'scene' | 'block'; id: SourceId };
type Scope = { target: Target; resource: Resource };
type Reference = {
  kind: 'book' | 'adventure' | 'universe';
  scopeId: SourceId;
  entityId: SourceId;
};
type PageInput = { limit?: number; cursor?: string }; // default25, 1..50, sem null
```

Book/block é inválido. Principal da aventura é scene; block é somente adicional
e prende sua cena atual. Campaign/chapter não pertencem ao novo binding.
UID vem exclusivamente da autenticação. IDs novos são escolhidos antes da rede,
criptograficamente, e nunca reutilizados após exclusão/cancelamento.

C(x) é JSON.stringify com chaves de objetos ordenadas recursivamente pelo sort
padrão JavaScript; arrays mantêm ordem. H(x)=SHA256(UTF8(C(x))). HT(text) calcula
SHA256 de UTF8(text) bruto, sem JSON. Rejeitar undefined, números não seguros,
não JSON e strings com surrogate isolado nos novos requests. Não aplicar NFC,
NFKC, trim, limpeza de HTML ou normalização de LF depois de congelar.
Somente título de conversa recebe trim1..120 explicitamente.

```ts
requestHash = H({ version: 1, action, request: normalizedFields });
projectToken = H({ version: 1, ownerId, target, createdAt: projectCreateTime });
containerSceneToken = H({
  version: 1,
  ownerId,
  target,
  projectToken,
  sceneId,
  createdAt: sceneCreateTime,
});
resourceToken = H({
  version: 1,
  ownerId,
  target,
  resource,
  projectToken,
  createdAt: resourceCreateTime,
  bodyCreatedAt: bodyCreateTime,
  containerScene: containerSceneOrNull,
});
loreScopeToken = H({
  version: 1,
  kind: 'lore-scope',
  ownerId,
  scope: { kind, id },
  createdAt: scopeCreateTime,
});
entityIdentityToken = H({
  version: 1,
  kind: 'lore-entity',
  reference,
  scopeToken,
  createdAt: entityCreateTime,
});
personaIdentityToken = H({
  version: 1,
  kind: 'persona',
  ownerId,
  personaId,
  createdAt: personaCreateTime,
});
bindingIdentityToken = H({
  version: 1,
  kind: 'persona-binding-source',
  ownerId,
  target,
  scopeKind,
  scopeId,
  createdAt: bindingSourceCreateTime,
});
presetDefinitionHash = H(validatePersona(preset));
leafKey = H(normalizedLeafIdentity);
closureHash = H({ version: 1, leaves: leavesSortedByLeafKey });
captureHash = H(normalizedCapture);
contextHash = H(frozenContextWithoutContextHash);
```

requestHash é calculado somente para MutationAction com Op. ResolveOperation usa
o fingerprint ORIGINAL dessa mutação para observe/cancel; não calcula um hash novo
do resolver. Um vetor de cancel prova exatamente essa distinção.
normalizedFields exclui action/requestHash e inclui operationId/defaults. Valores
gerados pela resposta não entram no request que os criou. Tokens de nascimento das origens (projeto, recurso, cena, lore e persona)
são derivados pelo servidor de createTime lido, nunca de campo cliente persistido.
Controles privados novos usam a identidade de nonce descrita abaixo; não confundir
seu relógio de apresentação com o nascimento de uma origem.
Stamp exige seconds seguro e nanos inteiro0..999999999, sem redução a ms.
containerSceneOrNull é {id:sceneId,token:containerSceneToken} obrigatório em block
e null em scene. Assim, recriar a cena mantendo block/body antigos muda o token do
recurso e invalida também toda closure herdada. Não usar revisão como nascimento.
sourceToken preserva exatamente o preimage de frescor de readHistorySource;
não substitui nem é substituído por token de encarnação.

## 2. Captura do editor e fonte persistida são hashes diferentes

```ts
type Base = { sourceToken: Hash; revision: Revision; bodyHash: Hash };
type Capture = {
  source: 'selection' | 'cursor' | 'viewport' | 'document';
  editorHash: Hash;
  from: number;
  to: number;
  text: string;
  surroundingText: string;
  truncated: boolean;
};
type ConfirmedSource = {
  target: Target;
  resource: Resource;
  projectToken: Hash;
  resourceToken: Hash;
  containerScene: { id: SourceId; token: Hash } | null;
  parent: { kind: 'chapter' | 'part'; id: SourceId; token: Hash } | null;
  sourceToken: Hash;
  revision: Revision;
  bodyHash: Hash;
  title: string;
  projectTitle: string;
  titleTruncated: boolean;
  projectTitleTruncated: boolean;
};
```

text<=18000 caracteres; surroundingText<=22000; 0<=from<=to<=900000, inteiros
seguros. EditorHash=HT(editor.getHTML()) no instante da captura. Offsets são
coordenadas PM e contribuição própria do autor, não trecho reextraído pelo
servidor. O servidor confirma Base na fonte real, carrega títulos reais e resolve
somente lore/persona autorizados. Texto ou nomes enviados não provam sua origem.

Bootstrap de Base reutiliza getWorkVersionSource pela API pública de histórico:
sourceToken e revision vêm desse leitor; seu contentHash=HT(content persistido)
mapeia explicitamente para Base.bodyHash de cena/bloco. Não inferir esse valor de
editor.getHTML(). O getter síncrono confirmado do host conserva os três campos.
bodyHash é hash do HTML persistido e protege CAS servidor. editorHash protege
offsets/prepare do bridge. Podem diferir sem edição: HTML importado com b pode
ser serializado como strong pelo Tiptap. Não exigir HT(prepared.before)===bodyHash,
não gravar/normalizar prosa no load para igualá-los e não disparar autosave ao abrir.

Host aguarda autosave confirmado; falha preserva rascunho e não chama IA.
Sob runExclusive, lê getter síncrono da base/metadados confirmados, captura/prepara
contra editorHash e reconfere a mesma base e guard PM após cada await antes do RPC.
Mudança de ator, base ou editor aborta antes da rede. Apply envia after íntegro,
resultado da transformação PM própria, com Base confirmada. Servidor não precisa
reconstruir DOM/PM. Document inteiro é opção explícita sujeita aos limites, com
truncamento informado; não enviar silenciosamente rascunho divergente como salvo.

## 3. Preparação paginada de contexto

prepareContext cria controle privado e body com captura própria/base/tokens.
advanceContext processa no máximo50 metadata por passo, primeiro coleção local
inteira, depois global da associação atual autorizada. Cursor/fase são servidor.
Não aceitar catálogo cliente nem resolver prioridade só sobre IDs selecionados.

```ts
type ContextPhase = 'local' | 'global' | 'ready' | 'consumed' | 'stale' | 'canceled' | 'deleted';
type ContextSummary = {
  schemaVersion: 1;
  ownerId: string;
  contextId: Id;
  contextToken: Hash;
  target: Target;
  resource: Resource;
  projectToken: Hash;
  resourceToken: Hash;
  revision: Revision;
  phase: ContextPhase;
  scannedLocal: number;
  scannedGlobal: number;
  matchedEntityCount: number | null;
  includedEntityCount: number | null;
  omittedEntityCount: number | null;
  turnId: Id | null;
  createdAt: DateMs;
  updatedAt: DateMs;
};
```

Identidade dos controles privados: birthNonce é 256 bits aleatórios seguros,
64 hex minúsculos, gerados no servidor antes da transação e congelados somente no
primeiro create. Nunca vem de request, journal ou body cliente. Retry lê o mesmo
nonce/receipt, sem recriar ID ou tombstone. O nonce fica na metadata interna,
fora dos DTOs públicos. Esses controles não são origens do lore/manuscrito.

O createTime nativo do próprio create ainda não existe durante a primeira
transação. O nonce permite atomizar controle, body e receipt sem uma fase oculta
create→seal. Mantêm-se os controles/fences duráveis e o nascimento preciso de
TODAS as origens. Timestamp em ms serve apenas à apresentação/ordem do controle.

Controles novos começam em revision1 e incrementam uma vez por transição
confirmada; replay não incrementa. Prepare não varre metadata. Cada advance
consulta uma coleção por vez com limit50; transição local→global fica registrada.
Sem global elegível, o fim local pode finalizar; caso contrário o fim global
finaliza no mesmo passo, lendo somente vencedoras. Não interpretar janela vazia
como fim enquanto o cursor interno indicar continuação válida.

contextToken=H({version:1,kind:'context',ownerId,contextId,birthNonce,
projectToken,resourceToken}), identidade estável; revision é CAS do progresso.
Contagens matched/included/omitted são null antes de ready, não zero fabricado.
Consumed preserva as contagens/turnId; controle nunca guarda prosa ou nomes de lore.

Cada passo relê gates/tokens: dono e nascimento do alvo, fonte/base, versão local,
associação global, nascimento/loreVersion/privacyVersion global e autorização UID.
Mudança desde prepare torna contexto stale. Não recompor páginas em outro token.
Novo prepare explícito pode escolher o vencedor atual; exclusão local não cria
shadow eterno. Dentro do snapshot antigo, local indisponível não cai para global.

Livro local ausente usa baseline0 sem afirmar coleção vazia. Presente inválido
falha; presente não pode desaparecer/resetar. Writers do29 incrementam exatamente
uma vez por mutação local ativa na mesma transação; createTime impede ABA.
Aventura usa seu loreVersion/identidade atuais. Não abrir SDK do clock privado.

Acumulador mantém só termos que realmente casam na captura e seus vencedores;
nenhum corpo. Limites técnicos:128 termos distintos vencedores,4096 intervalos
candidatos e256KiB de C(acumulador). Excesso retorna context-too-complex antes de
quota/provedor; pedir captura menor, nunca truncar silenciosamente. Não há limite
agregado de fichas da biblioteca. Mais de25,50 ou muitas páginas devem funcionar
sob o mesmo token quando o conjunto de termos relevantes cabe nesses budgets.
Uma atualização de body/controle/recibo por página; não duplicar catálogo inteiro.

Nos novos adapters, a chave de ficha do matcher é
JSON.stringify([reference.kind,reference.scopeId,reference.entityId]), qualificada
e não ambígua mesmo com ':' em IDs legados. Local/global com mesmo documentId
continuam distintos. Reference literal acompanha metadata para autorização;
chave do matcher não concede acesso. Valide partes como SourceId, sem aplicar o
limite de um documentId à chave composta. O orçamento do acumulador permanece.
IDs sintéticos sem referência servem somente aos helpers puros/fixtures.

MatcherVersion1 compartilhado entre menções novas/backend: trim+lower pt-BR por
termo; local antes de global; ID ordenado por unidades UTF-16 via a<b, não locale
do dispositivo; fronteiras Unicode letra/número/_; weighted interval scheduling
existente com peso comprimento² e preferência determinística em empate.
Ordem original dos termos é nome e aliases na ordem persistida; termos empatados
preservam essa ordem depois da ordem de ficha. Em intervalos, ordenar por fim,
início, termo UTF-16 e ID; desempate DP inclui o intervalo atual como no algoritmo
existente. Vetores devem provar paridade dos novos caminhos entre runtimes.
Esse desempate pode diferir do localeCompare legado em aliases duplicados:
documentar a diferença no ramo novo, sem alegar igualdade universal nem mudar
capítulos/publicação antigos.

Executar matching em text+"\n"+surroundingText. Resultado final em ordem de início,
depois fim/ID; deduplicar por referência da ficha preservando primeira ocorrência.
Selecionar primeiras12 fichas distintas; matched conta todas, included=min(12,
matched), omitted=matched-included. Inspeção mostra contagem/aviso antes de send.
Isso limita input do modelo, sem alterar vencedor por termo nem omitir páginas.
Somente ao completar varredura ler corpos das até12 vencedoras e revalidar todos
os tokens antes de ready. Ficha inconsistente falha fechado, não fallback.

```ts
type LoreSnapshot = {
  reference: Reference;
  identityToken: Hash;
  capturedRevision: Revision | null;
  capturedStamp: Stamp;
  name: string;
  aliases: string[];
  category: string;
  summary: string;
  detailsExcerpt: string;
  aliasesOmitted: number;
  detailsTruncated: boolean;
};
type PersonaSnapshot = {
  bindingHash: Hash;
  profileHash: Hash;
  capturedAt: DateMs;
  base: { kind: 'preset' | 'custom'; id: string; identityToken: Hash; revision: Revision } | null;
  complement: {
    kind: 'preset' | 'custom';
    id: string;
    identityToken: Hash;
    revision: Revision;
  } | null;
  instruction: string;
};
type FrozenContext = {
  schemaVersion: 1;
  matcherVersion: 1;
  capturedAt: DateMs;
  source: ConfirmedSource;
  capture: Capture;
  lore: LoreSnapshot[];
  persona: PersonaSnapshot;
  includedEntityCount: number;
  omittedEntityCount: number;
  closure: Closure;
  contextHash: Hash;
};
```

Modelo preserva fronteiras existentes: nome200, categoria30, summary140,
aliases20×200, detailsExcerpt2000 e instruction36000 caracteres. Matching usa
metadata autorizada integral sob limites reais da fonte, antes dessa projeção.
Não remover alias vencedor por recorte do input. Omitted e truncated são literais.
Título próprio projetado até300; inspeção sinaliza recorte sem alterar persistido.
Context body/envelope precisa caber em900000 bytes; excesso é erro, nunca corte.

Inspect retorna snapshot datado: freshness current|stale|unknown; edição comum
conhecida pode marcar stale, não revoga. Unknown não afirma fatos atuais.
Recibo, lista, cursor, journal e delta nunca carregam esse snapshot.

## 4. Closure plana e história transitiva

```ts
type ClosureLeaf =
  | { kind: 'target'; target: Target; resource: Resource; projectToken: Hash; resourceToken: Hash }
  | { kind: 'lore'; reference: Reference; scopeToken: Hash; entityIdentityToken: Hash }
  | { kind: 'persona'; ownerId: string; personaId: string; identityToken: Hash }
  | { kind: 'preset'; presetId: string; definitionHash: Hash }
  | {
      kind: 'binding';
      target: Target;
      scopeKind: 'book' | 'chapter' | 'adventure' | 'scene';
      scopeId: SourceId;
      identityToken: Hash;
    };
type Closure = { schemaVersion: 1; leaves: ClosureLeaf[]; closureHash: Hash };
```

Folhas são derivadas no servidor. Identidade lore prende createTime da raiz e
ficha; revision/epoch/hash de prosa não fazem parte da identidade de acesso.
Revisões capturadas ficam separadas para frescor. Global exige vínculo atual do
projeto de destino e autorização da mesma origem; não basta ainda possuir a ficha
de outro universo. Binding prende encarnação da fonte de persona herdada.

União deduplicada do contexto atual + persona/alvo + closure integral de TODA
mensagem realmente enviada no history. Se B recebeu A, B herda as origens de A
mesmo sem consultá-las diretamente. Não aceitar DAG/closure/histórico fornecidos
pelo cliente. Pergunta humana é própria, mas cópia de contexto/resposta derivada
enviada ao modelo leva suas dependências.

Até128 folhas e64KiB de C(Closure), incluindo alvo/persona/bindings. Excesso:
context-rebase-required antes de quota/I/O. Não truncar origens nem resumir
automaticamente conteúdo derivado em prompt dito próprio. Exigir nova conversa
explícita sem histórico; não carregar síntese antiga invisivelmente.

History para modelo: até20 registros e32000 caracteres; somente pares completos
pergunta/resposta concluída, escolhidos do mais recente e enviados em ordem antiga.
Não cortar par/closure. Inspeção informa orçamento efetivo; contagens omitidas
podem ser null quando o prefixo antigo não foi varrido, com hasOlderHistory=true.
Metadados internos questionChars e modelAnswerChars (incluindo separador e sugestão
quando enviados) permitem selecionar até10 pares sem ler corpos descartados.
Consultar done em ordem recente com lookahead para saber se existe prefixo;
não contar caracteres totais lendo bodies revogados. Contadores incompatíveis
com o corpo autorizado falham inconsistent, sem reduzir closure para caber.
Um ancestral fora da janela continua herdado pela closure da resposta selecionada.
Histórico revogado não é pulado silenciosamente para gerar: ver condição da seção11.

## 5. Conversas e turnos

```ts
type ConversationSummary = {
  schemaVersion: 1;
  conversationId: Id;
  conversationToken: Hash;
  target: Target;
  resource: Resource;
  projectToken: Hash;
  resourceToken: Hash;
  revision: Revision;
  state: 'open' | 'deleting' | 'deleted';
  title: string;
  activeTurnId: Id | null;
  createdAt: DateMs;
  updatedAt: DateMs;
};
type TurnState = 'running' | 'awaiting-byok' | 'done' | 'stopped' | 'failed' | 'blocked';
type TurnSummary = {
  schemaVersion: 1;
  turnId: Id;
  conversationId: Id;
  revision: Revision;
  attemptToken: Hash;
  state: TurnState;
  provider: 'platform' | 'byok';
  generation: FrozenGeneration;
  contextHash: Hash;
  closureHash: Hash;
  sourceToken: Hash;
  suggestionAvailable: boolean;
  paid: boolean;
  failureReason: FailureReason | null;
  createdAt: DateMs;
  updatedAt: DateMs;
};
type InputHistorySummary = {
  turnIds: Id[];
  recordCount: number;
  characterCount: number;
  omittedRecordCount: number | null;
  omittedCharacterCount: number | null;
  hasOlderHistory: boolean;
};
type TurnRead = {
  turn: TurnSummary;
  question: string;
  presentation: 'available' | 'blocked';
  answer: {
    text: string;
    suggestion: string | null;
    context: FrozenContext;
    provenance: Closure;
    history: InputHistorySummary;
    freshness: 'current' | 'stale' | 'unknown';
  } | null;
};
```

FrozenGeneration/RequestedGeneration são os shapes exatos de chatGeneration.mjs;
não duplicar catálogo de modelos. Congelar requested/effective uma vez. Chave,
preferência posterior ou retry não troca modelo/provedor/raciocínio da tentativa.

conversationToken=H({version:1,kind:'conversation',ownerId,conversationId,birthNonce,
projectToken,resourceToken}). Título inicial 'Nova conversa'; rename explícito,
sem derivar de lore. Um alvo/encarnação e um turno ativo por conversa.
Claim/finalização/rename/delete que alteram updatedAt/ordem também incrementam
editorChatCatalogs/current na mesma transação. Ausente é0 somente se a nova
coleção de controles estiver vazia; controles existentes sem catálogo falham.
turnId=operationId de send. Pergunta/resposta são um turno lógico; UI pode renderizar
duas bolhas. Não requer IDs com sufixo. Regenerar cria turno novo explícito, não
edita destrutivamente história antiga nem migra conversas legadas.

send atomiza claim, quota, pergunta própria separada/turn body e consumo ready:
copia
somente snapshot final para turno e apaga body/acumulador temporário do contexto.
Controle vira consumed com turnId. Falha por CAS/quota/acesso não consome contexto.
Contexto novo para outra mensagem; retry mesmo ID não gera novamente.
Antes de claim/quota, serializar o conjunto real input/context/history/pergunta/
metadados e reservar160000 bytes para resposta/sugestão/overhead de conclusão;
input serializado+reserva deve ser<=900000 bytes. Esse orçamento cobre escapes
JSON dos limites de saída, não só contextBody isolado. Excesso falha antes de IA,
sem omissão silenciosa de prosa ou dependências.
Persistir somente saída dividida text+suggestion, cuja soma é<=24000 caracteres;
rawAnswer não fica armazenado em duplicata no body, metadados ou logs. A reserva
de160000 bytes depende desse invariante (até6 bytes de escape JSON por caractere,
mais overhead), inclusive para BYOK. Saída que não cabe falha, sem truncamento.

attemptToken é nonce criptográfico do claim, congelado. Retry running/awaiting/
terminal consulta a tentativa, não reinicia provedor. Timeout não prova término
remoto. Stop cerca a tentativa; chunks/finalização/completeBYOK conferem token,
estado e gates. Resposta tardia não vence stop/delete/revogação/nova encarnação.
Firestore não transaciona HTTP: claim limita concorrência, mas não prova uma única
chamada/cobrança externa após crash ou resposta perdida. Done persistido pode ser
reconhecido; running expirado/stopped/failed não permite replay silencioso do
provedor, mesmo com input congelado. Geração nova exige intenção e ID novos.

Load/apply reautorizam closure por identidade/acesso; edição ordinária não revoga
sugestão pronta. Send exige contexto atual/coerente. Antes de input/chunk/finalizar/
BYOK/replay derivado, conferir gates. Epoch mudado exige revalidar folhas, não
ocultar por presunção. Não prometer evento SDK instantâneo do clock privado;
hints/foco/raiz/universo provocam reconsulta. Gate lineariza autorização antes da
entrega, sem alegar apagar bytes já vistos/copied/enviados a provedor externo.
Blocked é terminal para execução ativa que perdeu acesso. Resposta done histórica
não muda para blocked no storage: bloqueio é presentation/answer=null, permitindo
reautorizar a mesma origem depois sem ressuscitar execução interrompida.

Após claim, edição ordinária do manuscrito/ficha não interrompe a geração por si
só: snapshot enviado fica congelado e pode ficar stale. Gates por chunk/conclusão
conferem identidade/acesso, sem exigir revisão ordinária imutável durante geração.
Apply faz CAS ou retarget humano explícito. TurnRead.answer.provenance é a closure
completa transmitida, não só a direta do contexto preparado; history informa o
orçamento realmente enviado/omitido, sem devolver corpos históricos adicionais.

Prova rápida por chunk pode comparar os mesmos documentos/tokens que cobrem todos
os writers, depois da validação inicial de toda a closure. Cobertura mínima:
raiz alvo e recurso/cena/parent atuais com createTime e flags de acesso/deleting;
book.localLoreVersion ou adventure.loreVersion; associação universeId na raiz;
raiz do universo com createTime/authorId/deleting/loreVersion/privacyVersion;
users/UID/campaignAuthorization/current token+epoch; e os documentos de persona
custom/binding capturados com nascimento/revisão/arquivamento quando pertinente.
Binding cobre explicitamente personaId do livro e personaComplement do capítulo,
ou os campos aventura/cena que o operador aprovar. Vínculo novo invalida coerência
para novo send; load/apply preservam a persona capturada se sua origem é autorizada.
Mudança em qualquer cobertura exige prova nova de acesso das folhas antes de
emitir; edição comum não vira revogação por presunção. Sem cache por tempo, hint
como permissão ou leitura SDK nova do clock. Não reler corpos das128 folhas por
token quando a prova transacional coberta permanece igual.

## 6. Ações e DTOs fechados

Scope expande target/resource. Op expande operationId:Id e requestHash:Hash.
Todos os campos abaixo são obrigatórios salvo ?. IDs/campos de outra ação são
proibidos. MutationAction é a união exata das linhas com Op.

| action                     | Campos além de action                                                                                                                                                                                | Retorno                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| prepareContext             | Scope,Op,contextId:Id,base:Base,capture:Capture                                                                                                                                                      | Mutation<ContextSummary>          |
| advanceContext             | Scope,Op,contextId:Id,contextToken:Hash,expectedRevision:Revision                                                                                                                                    | Mutation<ContextSummary>          |
| getContext                 | Scope,contextId:Id,contextToken:Hash                                                                                                                                                                 | ContextSummary                    |
| inspectContext             | Scope,contextId:Id,contextToken:Hash,expectedRevision:Revision                                                                                                                                       | ContextInspection                 |
| listConversations          | Scope,projectToken?:Hash,resourceToken?:Hash,PageInput                                                                                                                                               | ConversationPage                  |
| createConversation         | Scope,Op,conversationId:Id,projectToken:Hash,resourceToken:Hash                                                                                                                                      | Mutation<ConversationSummary>     |
| renameConversation         | Scope,Op,conversationId:Id,conversationToken:Hash,expectedRevision:Revision,title:string                                                                                                             | Mutation<ConversationSummary>     |
| getAdventurePersonaBinding | adventureId:SourceId,sceneId:SourceId\|null,adventureToken?:Hash                                                                                                                                     | AdventurePersonaBinding           |
| setAdventurePersonaBinding | Op,adventureId:SourceId,adventureToken:Hash,sceneId:SourceId\|null,expectedBindingToken:Hash,value:PersonaBindingValue                                                                               | Mutation<AdventurePersonaBinding> |
| listMessages               | Scope,conversationId:Id,conversationToken:Hash,PageInput                                                                                                                                             | TurnPage                          |
| send                       | Scope,Op,conversationId:Id,conversationToken:Hash,expectedConversationRevision:Revision,contextId:Id,contextToken:Hash,expectedContextRevision:Revision,prompt:string,generation:RequestedGeneration | SendResult                        |
| getTurn                    | Scope,conversationId:Id,conversationToken:Hash,turnId:Id                                                                                                                                             | TurnRead                          |
| getByokInput               | Scope,conversationId:Id,conversationToken:Hash,turnId:Id,attemptToken:Hash                                                                                                                           | ByokRead                          |
| stopTurn                   | Scope,Op,conversationId:Id,conversationToken:Hash,turnId:Id,attemptToken:Hash                                                                                                                        | Mutation<TurnSummary>             |
| completeBYOK               | Scope,Op,conversationId:Id,conversationToken:Hash,turnId:Id,attemptToken:Hash,rawAnswer:string                                                                                                       | Mutation<TurnSummary>             |
| failBYOK                   | Scope,Op,conversationId:Id,conversationToken:Hash,turnId:Id,attemptToken:Hash,reason:'provider-failed'\|'credential-unavailable'\|'user-stopped'                                                     | Mutation<TurnSummary>             |
| applySuggestion            | Scope,Op,conversationId:Id,conversationToken:Hash,turnId:Id,suggestionHash:Hash,base:Base,after:string,placement:'original'\|'retargeted'                                                            | Mutation<ApplyResult>             |
| resolveOperation           | operationId:Id,operationAction:MutationAction,requestHash:Hash,intent:'observe'\|'cancel'                                                                                                            | OperationResolution               |
| deleteContext              | Scope,Op,contextId:Id,contextToken:Hash                                                                                                                                                              | Mutation<CleanupSummary>          |
| deleteConversation         | Scope,Op,conversationId:Id,conversationToken:Hash                                                                                                                                                    | Mutation<CleanupSummary>          |
| advanceCleanup             | Op,cleanupId:Id,cleanupToken:Hash,expectedRevision:Revision                                                                                                                                          | Mutation<CleanupSummary>          |
| getCleanup                 | cleanupId:Id,cleanupToken:Hash                                                                                                                                                                       | CleanupSummary                    |

prepareContext exige contextId===operationId. ListConversations é bootstrap:
sem tokens lê fonte atual e retorna tokens; se um é fornecido, ambos obrigatórios
e exatos. Nenhum editor rebaseia por listagem.

```ts
type Page<T> = { items: T[]; nextCursor: string | null };
type ConversationPage = Page<ConversationSummary> & {
  schemaVersion: 1;
  ownerId: string;
  target: Target;
  resource: Resource;
  projectToken: Hash;
  resourceToken: Hash;
  collectionRevision: Revision;
  platformModel: string;
};
type TurnPage = Page<TurnSummary> & {
  schemaVersion: 1;
  ownerId: string;
  conversationId: Id;
  conversationToken: Hash;
  conversationRevision: Revision;
};
type ContextInspection = {
  context: ContextSummary;
  source: ConfirmedSource;
  frozen: FrozenContext | null;
  freshness: 'current' | 'stale' | 'unknown';
};
```

Frozen só aparece em ready autorizado; consumed inspeciona via getTurn.
getContext/getCleanup leem progresso atual somente por metadata, sem expected
revision nem corpo: permitem adotar o próximo CAS após receipt histórico/outra
aba. Inspect permanece leitura exata, nunca rebase de formulário. TurnPage é
estritamente metadata-only; getTurn é o leitor explícito da pergunta/resposta/
contexto autorizado. PlatformModel do bootstrap alimenta capabilities pelo
contrato puro atual; configuração efetiva continua congelada só no claim.
Scanning não retorna acumulador/prosa parcial. Leitura exata com revisão divergente
retorna revision-conflict, sem body novo. Source congelada nunca é trocada por
uma fonte atual na mesma resposta de inspeção.

Cursores base64url de JSON fechado prendem UID/escopo/encarnação/revisão/ordem e
último par data+ID. Não são autorização. Conversas: updatedAt DESC,ID DESC;
turnos: createdAt DESC,ID DESC. UI inverte para apresentação cronológica, cursor
busca mensagens anteriores, sem varrer tudo para abrir a conversa recente.
Raiz deleting/deleted fora da lista normal.
Revisão de catálogo/conversa mudou: cursor-stale, sem aplicar página velha.
Não usar cursor como caminho livre nem cursor só por timestamp.

## 7. Operações, recibos históricos e fence

```ts
type Receipt = {
  schemaVersion: 1;
  operationId: Id;
  action: MutationAction;
  requestHash: Hash;
  outcome: 'confirmed' | 'canceled';
  confirmedAt: DateMs;
  result: ReceiptResult;
};
type Mutation<T> = { receipt: Receipt; current: T | null };
type OperationResolution =
  | { state: 'unknown'; receipt: null }
  | { state: 'pending'; receipt: null }
  | { state: 'settled'; receipt: Receipt };
```

ReceiptResult é união fechada, somente metadata:

- {kind:'context',contextId:Id,contextToken:Hash,revision:Revision,phase:ContextPhase}.
- {kind:'conversation',conversationId:Id,conversationToken:Hash,revision:Revision,
  state:'open'|'deleting'|'deleted'}.
- {kind:'turn',conversationId:Id,conversationToken:Hash,turnId:Id,
  attemptToken:Hash,revision:Revision,state:TurnState}.
- {kind:'apply',conversationId:Id,conversationToken:Hash,turnId:Id,
  resourceToken:Hash,revision:Revision,contentHash:Hash,bodyBytes:number,
  wordCount:number,projectRevision:Revision,chargedCredits:0|1}.
- {kind:'cleanup',cleanupId:Id,cleanupToken:Hash,revision:Revision,
  state:'deleting'|'deleted',phase:CleanupPhase,deletedDocuments:number}.
- {kind:'fence'}.
- {kind:'persona-binding',adventureId:SourceId,adventureToken:Hash,
  sceneId:SourceId|null,sceneToken:Hash|null,personaRevision:Revision,bindingToken:Hash}.

Mapeamento obrigatório por action: prepareContext/advanceContext→context;
createConversation/renameConversation→conversation; send/stopTurn/completeBYOK/
failBYOK→turn; applySuggestion→apply; deleteContext/deleteConversation/
advanceCleanup→cleanup. Fence desconhecido usa kind fence com outcome canceled.
SetAdventurePersonaBinding→persona-binding. Recibo não leva instrução, perfil
resolvido ou value; current autorizado e a leitura do vínculo fornecem os IDs.

Contadores são inteiros seguros>=0. Não conter after,prompt,lore,nomes,resposta,
instrução,chave ou saldo atual. Recibo persistido extra/corrompido falha inconsistent,
nunca spread. current pode ser null por ausência de autorização atual ou corpo
limpo. Recibo sempre é o marco histórico, não recalculado com estado novo.
Retry confirmado reconhece esse receipt antes de ler material derivado; após
revogação pode retornar somente metadata/current=null, sem abrir corpo ou cobrar.

Operações por UID, IDs globalmente únicos nesse namespace. A transação compara
fingerprint antes de write/quota/débito/provedor; ID/outro hash/ação é
operation-conflict. Mesmo ID depois de terminal/limpeza não é operação nova.

Resolver precisa só UID+action/ID/hash, sem prosa nem acesso atual à origem.
Observe desconhecido não grava. Cancel desconhecido instala fence durável com
fingerprint declarado; pedido tardio normaliza/recalcula/compara e é canceled
sem executar. Hash errado não revela receipt de outra intenção.
Confirmado devolve o receipt original, sem rollback. Cancel de apply serializa:
ou commit confirmado inteiro ou fence canceled, nunca manuscrito alterado com
recibo canceled. O retry da transação observa o vencedor antes dos writes.

Send confirmado significa claim, não resposta pronta. Resolver não reinicia IA
nem transforma receipt em resultado done. Se running conhecido, getTurn fornece
metadata e stopTurn explícito cerca attemptToken. Cancel de send desconhecido
impede claim tardio. Para preparação já confirmada, deleteContext explícito limpa;
cancel do primeiro request não desfaz um avanço já confirmado. Pending exige
consultar o mesmo ID, nunca enviar outro automaticamente.

## 8. Streaming, BYOK e quota

```ts
type SendResult = {
  receipt: Receipt;
  turn: TurnSummary | null;
  delivery: 'server-stream' | 'byok' | null;
  byokInput: ByokInput | null;
};
type ByokInput = {
  turnId: Id;
  attemptToken: Hash;
  generation: FrozenGeneration;
  systemInstruction: string;
  prompt: string;
  context: FrozenContext;
  history: { role: 'user' | 'assistant'; text: string }[];
  closureHash: Hash;
};
type ByokRead = { turn: TurnSummary; input: ByokInput | null };
type StreamEvent =
  | { type: 'started'; turn: TurnSummary }
  | { type: 'delta'; turnId: Id; attemptToken: Hash; index: number; text: string }
  | { type: 'settled'; turn: TurnSummary };
```

SendResult sempre conserva receipt. Fence canceled exige turn/delivery/byokInput
null; receipt confirmed sem projeção atualmente autorizada também devolve os três
null. Não fabricar turno nem abrir body para completar replay metadata-only.
Com turno presente, delivery é coerente com a tentativa congelada e os gates.

No controlador cliente, getByokInput devolve input junto a um handle imutável
{conversationId,conversationToken,turnId,attemptToken}. Complete/fail exigem esse
handle explícito e conferem UID, escopo, lifecycle e geração original antes e
depois de awaits. Resultado externo atrasado nunca adota a tentativa corrente
como fallback. O driver não projeta chunks BYOK sem autorização; conclui no
servidor e lê o turno autorizado antes de apresentar o derivado.

ByokInput é leitura explícita efêmera sob autorização atual, nunca receipt/lista/
journal. Retry awaiting-byok pode devolver mesmo input após gate, sem novo claim.
Após reload, getByokInput usa IDs/tokens metadata-only conhecidos, reautoriza toda
a closure antes de ler turnBody e retorna input somente em awaiting-byok da mesma
tentativa. Em estado terminal retorna input=null e metadata atual; não precisa
reconstituir o payload antigo de send. Buscar input não autoriza repetir chamada
externa automaticamente depois de resultado desconhecido; intenção nova é explícita.
Complete recebe rawAnswer, não context/history/generation substitutos; valida
splitter e tentativa original. Chave atual do provedor original pode ser restaurada,
sem fallback silencioso para plataforma. Chaves ficam só nas fronteiras existentes
cliente/provedor e servidor/plataforma; nunca snapshot, recuperação ou logs.

Prompt<=4000 caracteres sem trim destrutivo; resposta bruta<=24000; sugestão única
separada<=16000. Reutilizar splitter/instrução de chat; saída prosa, não HTML
executável. Não streamar thought/raciocínio. Deltas indexados são efêmeros e não
comprovam commit. Não reconstruir resposta bloqueada de cache de deltas após reload.

Quota existente users/UID/chapterChatLimits/current:60 claims/hora por UID,
compartilhada com legado. Claim uma vez por send novo aceito. Retry, preparação,
paginação, inspeção, load, stop, apply e cleanup não contam de novo. Falha de
provedor após claim não devolve automaticamente quota; retry explícito com turno
novo conta novo claim. Conversa/geração/cópia/descarte nunca debita crédito.

Reautorizar antes de input/chunk/conclusão e após provedor. Clock/identidade
mudados não permitem prosa nova até revalidar closure; revogação bloqueia deriva.
Não prometer cancelamento remoto/remoção de bytes já entregues a provedor.

## 9. Aplicação real, créditos e preservação de rascunho

Turno done, sugestão existente, suggestionHash=HT(suggestion), mesmo alvo e
encarnações, closure atualmente autorizada. Edição ordinária de ficha não revoga:
load/apply checam identidade/acesso; send exige contexto corrente. Inspeção mostra
data/revisões antigas/stale conhecido, sem aceite especial por epoch inócuo.

Original exige Base capturada do contexto. Retargeted é escolha explícita dentro
do MESMO recurso, com Base atual confirmada; offsets antigos não migram sozinhos.
Não retarget para outra cena/bloco/projeto. O servidor não exige igualdade entre
editorHash/HTML normalizado do bridge e bodyHash persistido.

Transação lê fonte/mensagem/closure/saldo/paid/operação e agregados reais antes de
writes. Confere Base e encarnações; after<=800000 bytes UTF-8 e documento/envelope
<=900000 bytes. Validar sem reserializar usando parse5 já instalado, com reporte
de parse errors e atributos duplicados. Permitir somente namespace HTML e tags:
p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,code,strong,b,em,i,u,s,del,br,hr,a.
Comentários, doctype, namespace estrangeiro, tag/atributo fora da lista, on* e style
são unsafe-document. Não usar só o regex legado de tags ativas.

Atributos permitidos, fiéis aos extensores instalados do RichEditor:

- a: href absoluto com protocolo http:,https: ou mailto: após parse de URL; target,
  rel,class,title como texto inerte. Não aceitar href javascript/data disfarçado
  por entities/controles: avaliar valor decodificado pelo parser e URL.
- ol: start inteiro decimal seguro, inclusive0/negativo; type como texto inerte
  emitido pelo OrderedList. Não impor start>=1 ou modificar enumeração do autor.
- code: class com prefixo language- e sufixo sem whitespace/controle; símbolos
  de linguagens como c++/c# são válidos. Sem classe estilística arbitrária.
- Demais tags: nenhum atributo. Texto/entidades são preservados, nunca executados.

Não sanitizar, trim, normalizar markup ou reserializar after depois do fingerprint:
rejeitar inválido antes do commit. As fontes são sanitizeRichText.PROSE_TAGS,
RichEditor StarterKit e os extensores instalados OrderedList/Link/CodeBlock.
Lore é Decoration e não faz parte do HTML salvo. Provar fixtures de HTML real
do editor, incluindo b→strong e ol start0/negativo, sem autosave no load.

prepareSceneTextWrite para cena/principal; prepareAdventureBlockTextWrite para
adicional. Uma transação salva texto, revisões/agregados, ledger real, crédito,
paid e receipt. Preserva audiência, imagem, referências, planejamento, grupo e
outros blocos. Não criar versão automática; política manual/restauração permanece.

Plataforma cobra1 só na primeira aplicação bem-sucedida da sugestão/turno, paid
atômico. BYOK0. Outra aplicação humana explícita da mesma mensagem/alvo cobra0
com novo operationId/CAS. Retry mesmo operationId não reaplica nem cobra.
CAS/saldo/falha não altera texto/ledger/paid/saldo.

```ts
type ApplyResult = {
  target: Target;
  resource: Resource;
  projectToken: Hash;
  resourceToken: Hash;
  revision: Revision;
  contentHash: Hash;
  bodyBytes: number;
  wordCount: number;
  projectRevision: Revision;
  chargedCredits: 0 | 1;
};
```

wordCount conta somente palavras visíveis do corpo do recurso editado. No
principal, não inclui os demais blocos da cena; os escritores reais atualizam
separadamente o agregado da cena e o ledger do manuscrito. projectRevision é a
sceneRevision da raiz após a escrita, inclusive para bloco adicional.

Sem after na resposta/receipt. Host confirma por leitor público exato e só aceita
se atores/row/form/base ainda correspondem. Resposta histórica nunca adota corpo
sobre edição posterior. Dirty draft durante await fica intacto com comparação/
adoção humana. Para hosts que precisam de agregados completos, prepareAdoption
relê a cena/bloco antes do aceite local, confere conteúdo/revisão/hash/totais e
prepara uma função síncrona. Depois desse await, revalidar PM/journal e origem
antes de executar commit do editor e adoção sem await entre eles. Não incrementar
a versão externa do conteúdo para esse aceite: o undo é a transação real do PM.
O saldo exibido pode ser relido após confirmação, sem débito adicional no cliente.
Undo/autosave usam o adaptador existente, sem cópia de editor nova.

## 10. Journal, persistência e limpeza

Journal local novo metadata-only por UID/escopo atrás de adapter. JournalScope é
local e distinto do Scope de RPC, que continua exigindo resource. Somente a row de
setAdventurePersonaBinding em adventure admite resource:null na raiz, ou resource
scene para o complemento. Esse setter exige projectToken conhecido, igual ao
adventureToken da RPC, e resourceToken:null: o getter de vínculo não emite token de
recurso textual. Request.sceneId null corresponde a resource:null; caso contrário,
resource.kind scene e resource.id iguais ao sceneId. Nunca inventar cena/bloco ou
token textual para configurar a persona antes da escrita. Demais ações conservam
resource obrigatório e tokens de projeto/recurso ambos ausentes ou ambos presentes.
Chave da raiz é JSON.stringify([UID,'adventure',adventureId,null,null]); a chave de
cena/bloco conserva seu namespace. Row fechada:
schemaVersion1,ownerId,target,resource,projectToken|null,resourceToken|null,action,
operationId,requestHash,contextId|null,contextToken|null,conversationId|null,
conversationToken|null,turnId|null,attemptToken|null,cleanupId|null,cleanupToken|null,
expectedRevision:Revision|null,state:'pending'|'uncertain'|'settled',
intent:'observe'|'cancel',
generation:RequestedGeneration|null,localGeneration:Revision.
Sem prompt,captura,lore,persona,instruction,answer,after,
ByokInput ou chave. Token ainda desconhecido é null, não ID de origem inventado.

Intenção local muda somente observe→cancel por CAS integral e deve ser persistida
antes de pedir fence. Reload com cancel não retoma a mutação original; consulta
o resolver usando o fingerprint original, sem hash novo do pedido de cancelamento.

A row settled pode conservar os ponteiros de controle para reload; contexto não
tem API de listagem. A próxima intenção troca settled por uma **nova** operação
pending/observe/localGeneration0 mediante CAS integral em um único Web Lock, sem
janela forget+reserve. Exige mesmo UID/JournalScope e operationId diferente;
monotonicidade de intent/identidades permanece por operação. Mesmo ID não reabre
com hash/ação novos. Falha de persistência impede RPC e não remove a row anterior.

Handoff carrega metadata conhecida pertinente, sem prosa nem perda dos controles
pendentes. Antes de outro prepareContext, o contexto anterior deve estar consumido
ou ter deleteContext/cleanup explícitos concluídos; um slot único não permite
abandonar body sem ID recuperável. Mudança de encarnação não mistura ponteiros
antigos com tokens novos; recuperar/limpar metadata antiga continua possível por
UID mesmo após sumir a origem, antes de iniciar uma intenção no alvo novo.

Troca de persona na mesma cena é um handoff de vínculo, sem grant textual. O
serviço verifica o contexto conhecido por getContext e só remove seu ponteiro
quando consumed/deleted; cleanup conhecido só sai quando deleted. Ready, local,
stale e cleanup não terminal impedem a troca de intenção. Conversa/turno e seus
tokens permanecem; a escolha de persona não apaga histórico. Exclusão concluída
de conversa só permite remover esses ponteiros mediante prova síncrona explícita
do cleanup deleted, com subject ID/token exatos. A prova não faz I/O, storage ou
await; o CAS integral após o hash ainda confere a row original. Cleanup de contexto
não prova exclusão de conversa.

Após setter settled de cena, o controller obtém P/RT reais do catálogo e exige
que P seja o mesmo projectToken conhecido. Confere a conversa conhecida por
listMessages metadata-only e controles terminais preservados, mantendo prova
somente em memória vinculada à row integral e ao par nativo. Todo await reconfere
ator/row; hint, getter falho, nova origem ou row alterada invalidam a prova. Não
fabrica RT, não lê resposta automaticamente e não rebaseia o formulário. Só então
a próxima intenção textual pode usar o par real. A exceção de sessão compara
ponteiros persistidos antes de substituições explícitas do pedido; criar nova
conversa limpa o turno da anterior.

Se a origem sumir após o setter, deleteConversation pode usar P/RT ambos null
somente para a conversa/token já conhecidos e com os demais controles preservados.
É recuperação metadata-only, sem autorizar prosa. O modal bloqueia fechamento
pela própria mutação pendente, mas permite fechar quando a row pertence a outra
ação, mantendo o guard externo e o controle recuperável no chat.

Persistir antes da rede; Web Locks apenas CAS local, nunca hash assíncrono/RPC/
provider. Conferir row integral após awaits e antes de substituir/apagar. Troca
de UID/alvo/instância/form invalida continuação sem apagar row de outra intenção.
Request completo pode ficar em RAM da tentativa viva. Reload usa observe/cancel;
conhecido retoma controle/turno autorizado, desconhecido fence+captura explícita.
Prepare protege somente captura própria confirmada no servidor, não o compositor
de pergunta: prepareContext NÃO recebe/preserva prompt. Pergunta só é durável
após claim de send confirmado. Antes disso, compositor fica em memória com guard
de saída para texto não enviado; RAM preserva texto em send incerto, mas reload
pode perdê-lo. Journal resolve/cancela sem plaintext; UI não afirma que prepare
preservou o rascunho da pergunta. Não transplantar localStorage/draft API legados.
Não exigir prosa que o journal não tem para cancelar prepare/send/apply inicial.

Namespaces privados, read/list/write SDK negados:

- users/UID/editorChats/C: controle de conversa.
- users/UID/editorChatCatalogs/current: revisão monotônica do catálogo privado de conversas.
- users/UID/editorChats/C/turns/T: metadata/identidades/paid, sem prosa.
- users/UID/editorChats/C/turnQuestions/T: pergunta própria literal, IDs/tokens e
  contador de caracteres; sem contexto automático, instrução ou resposta.
- users/UID/editorChats/C/turnBodies/T: input/context/history/answer
  privados separados, até900000 bytes por documento.
- users/UID/editorChatContexts/X: controle/cursor/tokens/contadores.
- users/UID/editorChatContextBodies/X: captura/acumulador/snapshot temporários.
- users/UID/editorChatOperations/O: fingerprint/receipt/fence metadata-only.
- users/UID/editorChatCleanup/K: controle metadata-only.

Antes de qualquer body derivado: contexto ready e metadata do turno guardam
internamente closureManifest={version:1,leaves:folhasNormalizadasOrdenadas}
(sem nomes/prosa), closureHash e proofCoverage
(tokens/revisões dos documentos que cobrem autorização), desindexados. Validar
forma/limites e H(manifest) contra closureHash antes da prova de acesso. Não abrir
body para descobrir quais origens é necessário autorizar. DTO público de metadata
expõe só hashes/contadores, não esse controle interno.

GetTurn pode ler turnQuestions por UID/conversa/identidade do alvo vinculada no
controle para preservar pergunta própria na política recomendada. TurnBodies só
depois do gate da closure; não ler contexto/resposta revogados para extrair a
pergunta. Pergunta histórica usada no input de outro turno pode compor o body
preparado desse turno, que continua atrás da closure integral de seu input.
Stop e cleanup por metadata própria também não exigem reabrir body revogado.

Bodies são planos, sem corpo escondido em subcoleção de metadata apagada.
Documentos referenciados ausentes/corruptos falham inconsistent, não coleção vazia.
Consumed remove body temporário atomicamente; contexto stale/canceled usa
deleteContext. Controle e receipt terminal não reidratam prosa por retry.

DeleteConversation cerca turno ativo e muda deleting atomicamente, impedindo
load derivado/send/apply. Cleanup de controle próprio usa UID/token mesmo se o
projeto já sumiu; não precisa reautorizar prosa. Idem deleteContext. Não recriar
raiz removida nem apagar manuscrito próprio por limpeza de chat.

```ts
type CleanupPhase = 'context-body' | 'turn-bodies' | 'turn-questions' | 'turns' | 'complete';
type CleanupSummary = {
  schemaVersion: 1;
  cleanupId: Id;
  cleanupToken: Hash;
  revision: Revision;
  subject: { kind: 'context' | 'conversation'; id: Id; token: Hash };
  state: 'deleting' | 'deleted';
  phase: CleanupPhase;
  deletedDocuments: number;
  createdAt: DateMs;
  updatedAt: DateMs;
};
```

cleanupId=operationId do delete; cleanupToken=H({version:1,kind:'cleanup',ownerId,
cleanupId,birthNonce,subject}).
Cada advance remove<=47 docs e até3 writes de controle/recibo/tombstone, total<=50.
Context-body<=1. Conversa: turnBodies, turnQuestions e turns, nessa ordem,
inclusive órfãos planos; raiz fica tombstone deleted. Cada fase tem seu cursor.
CAS/cursor exatos + receipt não saltam página. getCleanup recupera revision atual
somente em metadata após outro avanço/tab, sem tentar CAS baseado em receipt velho.
Sem recursiveDelete sem orçamento ou TTL que expire intenção silenciosamente.

Tombstones não guardam títulos/prosa. Operações/controles terminais permanecem
até exclusão explícita da conta; não implementar workflow de conta/backup aqui.
Projeto removido bloqueia acesso imediatamente; limpeza de conversa é separada
e não falsa implementação de exclusão integral de projeto.

### Precisões internas do marco de conversa/histórico

scopeKey=H({version:1,ownerId,target,resource,projectToken,resourceToken}). O controle
de conversa guarda ownerId, conversationId, birthNonce, scopeKey, summary e
cleanupId|null, além de schemaVersion:1. Catalog/current guarda schemaVersion:1,
ownerId, revision e updatedAt; ausência só é baseline 0 após uma query limitada a
um controle provar que não há conversas, inclusive tombstones. Não reinicializar
um catálogo perdido enquanto restarem controles. Índice por scopeKey não substitui
autorização do alvo ou os tokens nativos.

Metadata de turno guarda schemaVersion, ownerId, conversationId/conversationToken,
turnId, summary, closureManifest, closureHash, proofCoverage, questionChars,
modelAnswerChars e questionHash. Pergunta separada guarda identidades, attemptToken,
question e questionHash; body guarda identidades/attemptToken, context,
systemInstruction, historyMessages, history e answer|null. Campos são fechados;
sem rawAnswer duplicado ou chave. O futuro claim precisa gravar pergunta, body,
metadata, consumo do contexto, conversa, catálogo, quota e recibo atomicamente.

A representação enviada ao modelo para uma resposta é literalmente text, seguido
de `\n\n[[SUGESTAO]]` + suggestion + `[[/SUGESTAO]]` quando suggestion não é null.
modelAnswerChars inclui esses separadores. A seleção usa metadata de turnos done
em ordem recente, até onze como lookahead; reautoriza **todas** as closures
selecionadas antes de abrir qualquer body, confere os contadores e só então monta
os pares em ordem antiga. Não ignora uma origem revogada para incluir outra.

getTurn pode devolver pergunta própria com presentation blocked após o alvo
sumir/recriar, validando UID, controle privado e token histórico da conversa.
Isso não reautoriza resposta/contexto/sugestão antigos. Bootstrap/listagem exigem
o alvo atual. Rename pode coexistir com geração: worker confere estado,
activeTurnId e attemptToken; não confunde a revisão nova do título com outra
incarnação do turno. Delete cerca ativo em metadata e bloqueia geração/aplicação.

Cursor de conversa prende UID, scopeKey, tokens, revisão do catálogo e o último
par updatedAt/ID. Cursor de turnos prende conversa/token/revisão e createdAt/ID.
Mudança de revisão produz cursor-stale; não reinicia páginas silenciosamente.
Cleanup de conversa usa cursor privado por fase e queries com select vazio para
obter apenas IDs. Mantém o orçamento de 47 remoções mais três writes e a raiz
terminal sem título/prosa. O formato de cleanup de contexto permanece independente.

Índices mínimos: conversas por escopo/state/updatedAt DESC/ID DESC; turnos
createdAt DESC/ID DESC (também state quando selecionando done para history).
Acrescentar só os exigidos pelas queries finais, preservar overrides; desindexar
prosa/context/history dos bodies/questions e closureManifest/proofCoverage em
controles de contexto e turnos, que nunca são campos de busca.
C4v4, inventários de campanha e leituras legadas não mudam.

## 11. Personas e histórico confirmados; erros

Livro herda base personaId + complemento atual do capítulo da cena; sem capítulo,
só base. Sem terceira camada. Resolver custom somente users/UID/aiPersonas e
presets puros versionados. Ausência/inconsistência não faz fallback silencioso.

Aventura, decisão confirmada: personaId na raiz + personaComplement na cena;
principal é a cena e adicional herda a mesma cena. Nenhum override por bloco
ou conversa. Setter tem CAS separado do texto; shape legado de complemento,
sem camadas ilimitadas. Configuração é explícita mesmo antes de um contexto ready.

```ts
type PersonaId = string; // seis presets conhecidos ou ID custom legado [-A-Za-z0-9]{1,100}
type PersonaComplement = {
  personaId: PersonaId;
  overrides: { traitId: string; value: number }[];
};
type PersonaBindingValue =
  { personaId: PersonaId | null } | { personaComplement: PersonaComplement | null };
type AdventurePersonaBinding = {
  schemaVersion: 1;
  ownerId: string;
  adventureId: SourceId;
  adventureToken: Hash;
  sceneId: SourceId | null;
  sceneToken: Hash | null;
  personaRevision: Revision;
  bindingToken: Hash;
  value: PersonaBindingValue;
  updatedAt: DateMs;
};
```

SceneId null exige value com somente personaId. SceneId não null exige somente
personaComplement e sceneToken nativo da cena atual. Não aceitar mistura de campos,
alvo livro, bloco ou valor resolvido do cliente. Get sem adventureToken é bootstrap
autorizado de identidade; fornecido, deve ser exato. Não muda vínculo por leitura.
Neste setter, adventureToken é o projectToken do alvo adventure emitido pelo novo
editorChat. Não substituir nem aceitar como sinônimo o token de mesmo nome do
serviço de lore L; os preimages existentes desse serviço permanecem intactos.

Getter/Setter conferem dono/raiz não deleting e encarnação atual da cena/grupo
pelos leitores existentes. Campo ausente equivale a null e personaRevision ausente
é baseline0; presente inválido falha. Token do vínculo é:

```ts
bindingToken = H({
  version: 1,
  ownerId,
  adventureId,
  adventureToken,
  sceneId,
  sceneToken,
  personaRevision,
  value,
});
```

Persona custom preserva o formato legado aceito por validatePersona/savePersona,
inclusive IDs como minha-persona, sem exigir prefixo custom-. Os seis presets
são resolvidos somente no catálogo puro; qualquer outro preset-* é inválido.
Demais IDs exigem perfil existente e válido sob users/UID/aiPersonas.
Não migrar a biblioteca nem reduzir a autorização para aceitar IDs legados.

Setter exige expectedBindingToken exato. Em transação, lê operação/fence e os
documentos de vínculo, valida preset conhecido ou perfil custom sob users/UID/
aiPersonas e o complemento atual, incrementa personaRevision uma vez e atualiza
somente personaId ou personaComplement, personaRevision e updatedAt monotônica
no documento de vínculo. Não escreve prosa, audiência, body, planejamento,
contagem, ledger, sceneRevision ou crédito. Outros writers preservam esses campos;
SDK não pode removê-los/resetá-los. Retry não incrementa e retorna receipt antigo.

Complemento mantém o contrato existente: até16 overrides, traitId único por item,
[-A-Za-z0-9]{1,100}, value inteiro0..100; arrays mantêm ordem para fingerprint.
Null na cena remove complemento e herda base; null na raiz significa ausência
explícita de base, não fallback para outro preset. IDs inválidos/indisponíveis
impedem preparar contexto, sem trocar silenciosamente de perfil. Não criar
setters paralelos por bloco ou conversa, nem alterar setters legados de livro.

Book/chapter e adventure/scene entram como folhas binding de nascimento e como
valores/revisões na prova de coerência. Nova escolha invalida contextos preparados
para send; respostas prontas mantêm a persona capturada sob autorização da origem,
sem substituição ou regeneração forçada por revisão ordinária.

Histórico, decisão confirmada: TurnRead mantém question própria,
presentation blocked e answer null quando afetado; sem derivados nos metadados.
Se closure revogada entraria no history, send retorna history-revoked e oferece
nova conversa explícita, não pula dependência. Mesma origem reautorizada pode
voltar; origem recriada não. Não bloquear conversa inteira por presunção, apagar
perguntas próprias ou remover prosa já aplicada. Cleanup/resolver continuam
metadata-only e disponíveis para encerrar intenção sem reabrir derivado.

O servidor herda proveniência de referências/contextos/histórico e gestos de cópia
rastreados; não infere origem semântica de prosa humana arbitrária em prompt/capture.
Isso não autoriza o produto a copiar derivado automaticamente como texto limpo.

Erros do handler usam details:{reason}, sem echo de request/prosa/nomes/chaves.
Auth/AppCheck rejeitados antes do handler pela infraestrutura callable podem ter
code/details diferentes; cliente trata erro de plataforma/transporte genericamente,
sem inventar confirmação/estado e sem desativar a proteção nativa para customizar.
FailureReason
é união fechada dos reasons pertinentes, nunca texto arbitrário do provedor.

| code                | reason                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| unauthenticated     | auth-required                                                                    |
| permission-denied   | app-check-required                                                               |
| invalid-argument    | invalid-request,body-too-large,unsafe-document                                   |
| not-found           | source-unavailable,conversation-unavailable,context-unavailable,turn-unavailable |
| failed-precondition | identity-changed,context-stale,context-not-ready,context-consumed,inconsistent   |
| failed-precondition | revision-conflict,cursor-stale,operation-conflict                                |
| failed-precondition | provenance-revoked,history-revoked,context-rebase-required,context-too-complex   |
| failed-precondition | insufficient-credits,suggestion-unavailable                                      |
| aborted             | conversation-busy,operation-pending                                              |
| resource-exhausted  | chat-quota                                                                       |
| unavailable         | provider-unavailable                                                             |
| deadline-exceeded   | provider-timeout                                                                 |
| cancelled           | operation-canceled,turn-stopped                                                  |

Não autorizado recebe erro neutro sem distinguir origem alheia existente/ausente.
Conflito não retorna body atual; preserve form e saldo. Retry usa mesmo ID ou
consulta, nunca escalada silenciosa para operação nova.

## 12. Fontes, esforço e portão de implementação

Reuso verificado: chatGeneration.mjs; chapterChatProvider.mjs; splitter/quota/paid
de chapterChat.mjs como referência sem mudar binding legado; readHistorySource
em workHistoryContracts.mjs; escritores scenes.mjs/adventureBlocks.mjs;
adventureLore.mjs/campaignAuthorization.mjs; loreScope.ts/loreMatcher.ts e
personaProfile.mjs como compilador puro compartilhado por persona.ts e pelo novo
resolver. Avatares e rótulos de interface permanecem na feature cliente.

Backend previsto: editorChatContracts.mjs,editorChatContext.mjs,editorChat.mjs,
editorChatCleanup.mjs e unidades próprias; helper puro matcher/persona quando
necessário; index.mjs/package.json; rules/índices; assistedBook.mjs,imageLibrary.mjs,
loreAnalysis.mjs para clock local. Não reescrever ledger/history/chapterChat.
Serviços/testes TS loreService.ts/bookService.ts pertencem à parcela cliente.

Vetores a congelar independentemente antes do código: Unicode/LF/espaços e
requestHash prepare/send/apply/cancel; nascimento com nanos distintos; closure
permutada/deduplicada/transitiva A→B→C; matcher local página2/global/aliases/longos/
fronteiras; limite exato/+1; histórico stale versus revoked; paid/retry.
Calculados e reproduzidos independentemente, sem helpers de produção ou provedor
pago; resultado e limitações no plano29. Paridade com os novos helpers e os gates
SDK/nativos ainda serão demonstrados durante a implementação. Quatro famílias SDK/duas jornadas nativas seguem29.

Backend + unidades próprias, O/C/P baixa confiança: contexto/clocks/matcher/persona
24/42/70 h; chat/proveniência/BYOK/quota24/42/72 h; apply/ledger/recibos/fence
18/30/50 h; total66/114/192 h. Inclui paginação/cleanup; exclui TS cliente/QA
integrada. Não são horas realizadas/saldo/data. Substituir parcela antiga A,
não somar novamente à baseline F2-09.

- [x] Duas preferências confirmadas; setter de persona literal registrado.
- [x] Revisão literal cliente/backend/QA/root e fechamento de P1/P2.
- [x] Vetores independentes de especificação calculados e reproduzidos.
- [x] Paridade dos helpers/matcher implementados com os vetores.
- [x] Writers/regras locais implementados e verificados, sem bootstrap de vazio falso; rollout exige coordenação e drenagem de clientes antigos.
- [x] Integrador liberou os marcos internos de implementação após fechar contrato e vetores.

Vetores independentes não comprovam implementação. Nenhum deploy, merge ou
provedor pago foi executado para este adendo; os testes de produto seguem os
marcos internos e serão registrados com seus resultados reais.
