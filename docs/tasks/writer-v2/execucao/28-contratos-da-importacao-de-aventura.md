# F2-09 I — Contratos da importação de aventura

**Estado em 2026-10-21:** ABI fechada e revisada; implementação liberada pelo integrador. Este adendo fecha o protocolo do [plano 27](27-importacao-revisada-de-aventura.md),
sem alterar o escopo de produto. No fechamento inicial deste adendo, os vetores
eram somente cálculos de contrato. A implementação posterior foi validada localmente;
ver [entrega I](../../../entregas/2026-10-21-writer-v2-importacao-revisada-de-aventura.md).
CI do novo incremento pendente; vetores isolados não substituem prova integrada.

## Convenções e normalização

Todos os objetos de entrada/saída têm as chaves descritas aqui, sem chaves extras.
Campos são obrigatórios, salvo `?`; `null` só é aceito onde aparece explicitamente.
Omissão não equivale a `null`. Valores JSON finitos; nenhum `undefined`, NaN,
Infinity, número fracionário em contadores ou surrogate Unicode isolado. Normalizar -0 para 0 antes do hash.

- `Id`: contrato vigente de `validateId`, 16–80 caracteres ASCII alfanuméricos ou
  hífen. `ownerId` vem exclusivamente do Firebase Auth, nunca do request.
- `Hash`: exatamente 64 caracteres hexadecimais minúsculos, SHA-256.
- Contadores/checkpoints/índices: inteiros seguros não negativos; somas,
  multiplicações e incrementos verificam overflow antes de gravar.
- Datas públicas: números Unix em milissegundos, inteiros entre 0 e
  8.640.000.000.000.000. `updatedAt >= createdAt`; relógio do servidor.
  Não usar esses milissegundos para substituir `createTime` preciso na identidade.
- `Project = {title: string, synopsis: string, universeId: string | null}`.
  Título não vazio, até 300 unidades UTF-16; sinopse até 4.000, inclusive vazia.
  Validar limites antes de `trim`, aplicar `trim` somente nesses metadados e no
  título da seção, antes de congelar. Universo segue `universeDocumentId` vigente.
- `Section = {title: string, content: string}`. Título não vazio, até 300 unidades
  UTF-16 antes do `trim`; `content` preservado byte a byte após a revisão segura,
  sem trim, NFC, normalização de newline ou nova serialização de HTML.
- `Source = {mediaType: SourceMediaType, sha256: Hash, byteLength: number}`.
  `byteLength` positivo e seguro; `sha256` mede os bytes originais do arquivo local.
  Não há nome de arquivo, caminho ou binário nesse DTO. O servidor prende a
  declaração da fonte ao hash; não afirma verificar um arquivo que não recebeu.

```ts
type SourceMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/markdown'
  | 'text/plain'
  | 'text/html';

type Identity = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  jobToken: string;
  adventureId: string;
};
```

HTML seguro é produzido/conferido no cliente antes do hash. O armazenamento nunca
executa HTML; consumidores continuam usando seus renderizadores seguros. Conteúdo
ativo não ganha permissão por estar hasheado. Sanitização de apresentação não
reescreve o manuscrito persistido. O gravador/parser legado de livros conserva seu
contrato; não aplicar esta normalização retroativamente.

## Identidades, hashes e ordem

`canonical(v)` ordena recursivamente chaves de objetos por ordem ASCII, preserva
arrays e usa JSON compacto, Unicode literal e UTF-8. As chaves deste protocolo
são ASCII; números são inteiros seguros. `D(v) = SHA256(UTF8(canonical(v)))`.
`B(s) = SHA256(UTF8(s))` para prosa; não aplicar `canonical` à string nesse caso.
Não escapar Unicode como ASCII. O encoder rejeita surrogate isolado.

```ts
adventureId = D({ version: 1, uid, importId, kind: 'adventure-import' });
partId = D({ version: 1, uid, importId, index, kind: 'part' });
sceneId = D({ version: 1, uid, importId, index, kind: 'scene' });
jobToken = D({
  version: 1,
  uid,
  importId,
  createTime: { seconds, nanoseconds },
});
seed = D({ version: 1, kind: 'adventure-import-sections' });
nextChain = D({ version: 1, previous, index, title, bodyHash, bodyBytes });
reviewHash = D({
  version: 1,
  project,
  source,
  sectionCount,
  totalBodyBytes,
  sectionsHash: finalChain,
});
fingerprint = D({ action, request: normalizedRequest });
```

`importId` é o `operationId` do start, conhecido antes do primeiro envio.
O start cria controle/reserva/recibo na transação inicial. **Só depois do commit**
lê o snapshot do controle, obtém seu `createTime` real e deriva `jobToken` para a
resposta. Retry também lê esse snapshot. Não fabricar createTime com `now()`,
nem confiar em token persistido/enviado pelo cliente. Controle terminal permanece,
portanto o createTime original continua verificável. Reserva guarda a identidade
interna dessa criação; campo auxiliar não substitui o snapshot como autoridade.

Seções selecionadas são renumeradas de zero, na ordem confirmada. `bodyBytes` é
UTF-8 de `content`; `bodyHash = B(content)`. Cadeia inicial `seed`; cada append
avança uma posição. Último append recompõe `reviewHash` com os totais reais e
rejeita divergência atomicamente, sem persistir a última seção inválida. Não há
lista crescente de seções no controle. Nenhuma etapa relê toda a obra.

Partes usam `order = index + 1` numérico, conforme os leitores e o inicializador
vigentes, com soma segura; cada parte contém uma cena. A cena usa
`rebalancedSceneRank(0)`, a posição inicial canônica do inicializador compartilhado.
A descoberta nos inicializadores reais corrigiu a proposta anterior de rank na
parte, sem alterar IDs, hashes ou a ordem confirmada. Índice de
manifesto é decimal com 16 posições (`String(index).padStart(16, '0')`). IDs de
ledger preservam as funções existentes para `{kind:'scene',id:sceneId}` e
`{kind:'part',id:partId}`; não inventar outro preimage para esses recursos.

## Estado público e recibos

```ts
type State = 'uploading' | 'preparing' | 'ready' | 'activated' | 'deleting' | 'deleted';
type Phase = 'upload' | 'materialize' | 'ready' | 'complete' | 'cleanup' | 'deleted';
type Action =
  | 'startAdventureImport'
  | 'appendAdventureImportSection'
  | 'advanceAdventureImport'
  | 'activateAdventureImport'
  | 'cancelAdventureImport';

type Progress = Identity & {
  state: State;
  phase: Phase;
  checkpoint: number;
  title: string;
  universeId: string | null;
  source: Source;
  keyId: string;
  recoveryKeyReady: boolean;
  reviewHash: string;
  sectionCount: number;
  totalBodyBytes: number;
  uploadedSections: number;
  uploadedBodyBytes: number;
  uploadedChainHash: string;
  preparedSections: number;
  wordCount: number;
  cleanedSections: number;
  cleanupComplete: boolean;
  result: { adventureId: string; revision: 1 } | null;
  createdAt: number;
  updatedAt: number;
};
type Receipt = {
  operationId: string;
  action: Action;
  expectedCheckpoint: number | null;
  checkpoint: number;
  state: State;
  phase: Phase;
  index: number | null;
};
type Confirmed = { kind: 'confirmed'; receipt: Receipt; progress: Progress };
type CanceledStart = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  adventureId: string;
  kind: 'canceled';
};
```

Pares de estado/fase: uploading/upload, preparing/materialize, ready/ready,
activated/complete, deleting/cleanup e deleted/deleted. `uploadedSections <= sectionCount`, `preparedSections <=
uploadedSections`, `cleanedSections <= uploadedSections`. `wordCount` soma o texto
visível das seções aceitas pelo contador vigente; não mede markup. Em ready e
activated, upload e preparação são completos. `cleanupComplete` só é true em
deleted; `result` só é não nulo em activated. KeyId é metadata, nunca chave.
`recoveryKeyReady` indica chave criada e ainda disponível; terminal é false.

Start tem checkpoint 0 e expectedCheckpoint/index nulos. Toda outra mutação nova
incrementa checkpoint uma vez. Append registra seu índice. Advance de preparação
registra a seção preparada; advance de limpeza registra o primeiro índice tratado,
ou null para finalização de controles. Cancel/activate têm índice null.

Recibo é o resultado **histórico** daquela operação, imutável; `progress` é a
leitura atual autorizada. Um retry pode devolver recibo uploading com progress
ready/deleted. Cliente aplica estado atual por checkpoint monotônico, não reconstrói
formulário nem repete prosa a partir do recibo. Nenhum desses DTOs contém sinopse,
conteúdo de seção, PDF, raw key ou request com prosa. Mesmo activated não dispensa
autorização atual para abrir o projeto resultante.

## As nove APIs

Todas as oito callables exigem Auth e App Check, nos bindings vigentes do projeto.
No domínio, autorização e leitura do controle ocorrem antes de fornecer qualquer
metadata. Chamadas são específicas; não existe executor genérico de importações.

| API                           | Entrada                                          | Saída                      |
| ----------------------------- | ------------------------------------------------ | -------------------------- |
| startAdventureImport          | StartInput                                       | Confirmed ou CanceledStart |
| resolveAdventureImportStart   | `{operationId,requestHash:Hash,intent:'cancel'}` | Confirmed ou CanceledStart |
| listAdventureImports          | ListInput                                        | ImportPage                 |
| getAdventureImport            | `{importId, jobToken?}`                          | Progress                   |
| appendAdventureImportSection  | MutationInput + `{index, section:Section}`       | Confirmed                  |
| advanceAdventureImport        | MutationInput                                    | Confirmed                  |
| activateAdventureImport       | MutationInput                                    | Confirmed                  |
| cancelAdventureImport         | MutationInput                                    | Confirmed                  |
| getAdventureImportRecoveryKey | RecoveryKeyInput, via HTTP abaixo                | RecoveryKey                |

```ts
type StartInput = {
  operationId: string;
  project: Project;
  source: Source;
  sectionCount: number;
  totalBodyBytes: number;
  reviewHash: string;
};
type MutationInput = {
  importId: string;
  jobToken: string;
  operationId: string;
  expectedCheckpoint: number;
};
type ListInput = {
  view?: 'pending' | 'all';
  limit?: number;
  cursor?: string | null;
};
type ImportPage = { items: Progress[]; nextCursor: string | null };
```

Start exige sectionCount e totalBodyBytes positivos. Cada seção pode ter conteúdo
vazio sem ser descartada, mas a revisão total deve conter texto visível; na última
seção rejeitar total de palavras zero. O mesmo operationId em outro job/ação ou
com outro fingerprint falha; não reaproveitar ID depois de resultado incerto.

Resolver recebe somente `{operationId,requestHash,intent:'cancel'}`. RequestHash é
o fingerprint canônico exato do start congelado, gravado no journal metadata-only
**antes da rede**. Não exige projeto/sinopse após reload anterior ao seal. Com
start existente compara o fingerprint armazenado e confirma recibo original e
progress atual: isso não cancela job conhecido. Sem start instala fence + reserva
terminal presos ao hash declarado e retorna CanceledStart. O adventureId continua
derivado somente de UID/importId/kind; requestHash prende o fence, não altera o ID.
Start atrasado normaliza/recalcula o fingerprint, compara e retorna canceled;
fingerprint diferente falha. CanceledStart não tem jobToken, pois nenhum controle
com createTime foi criado. Para cancelar job conhecido usar cancelAdventureImport.

Get admite ausência de token somente para bootstrap pelo proprietário autenticado
(importId conhecido antes do start). Token presente deve ser exato; null é inválido.
Não retornar null para job indisponível: erro sanitizado not-found. Lista é o outro
caminho de descoberta sem journal local. Demais mutações e chave exigem token.

Append exige uploading, chave já criada, índice igual a uploadedSections e CAS
exato. Recebe exatamente uma seção; servidor calcula bytes/hash/palavras/cadeia.
A última muda estado para preparing. Advance em preparing materializa exatamente
uma seção; o último muda para ready. Advance em deleting limpa a próxima janela.
Nos demais estados não avança. Activate só aceita ready com invariantes completas;
revalida universo opcional e cria raiz/vínculo atomicamente. Universo revogado gera
conflito explícito, sem trocar vínculo/silenciar metadata congelada: cancelar ou
fazer nova revisão é escolha explícita. Cancel aceita uploading/preparing/ready,
muda para deleting e apaga chave na mesma transação. Não apaga obra activated.

Após autenticar e conferir identidade, procurar recibo exato antes de exigir CAS
atual/estado compatível. Isso permite reconhecer operação já aplicada mesmo depois
de cancelamento. Não permitir escrita nova por recibo de outra ação/job/token.
Erro de transporte mantém operationId e payload; conflito exige comparar progress,
sem rebase automático. Resposta cancelada não ecoa payload/fingerprint/prosa.

## Listas, limites e erros

Lista ordena por `createdAt DESC, __name__ DESC`, campos imutáveis. Padrão limit 25,
máximo 50; view padrão pending (uploading/preparing/ready/deleting). Janela de leitura
é limitada a limit+1 controles; examinar somente os primeiros limit e usar o extra apenas para detectar continuidade. Filtrar view depois dessa janela examinada. Uma janela sem itens
pode ter nextCursor: continuar até null, sem declarar ausência na primeira vazia.
Cursor base64url fechado `{version:1,uid,view,createdAt,id}`, máximo 4096 caracteres,
sem prosa; preso ao filtro/UID, usa último documento examinado, não último exibido.
Inserções posteriores ao início exigem reiniciar a lista. A lista não promete um
snapshot global; get e mutações reautorizam cada job. Não usar offset.

| Recurso                                         | Limite obrigatório                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| content por seção                               | 800.000 bytes UTF-8                                                         |
| Request append JSON e documento body persistido | 900.000 bytes UTF-8 completos, cada um                                      |
| Lista metadata                                  | até 50 itens, resposta completa até 4 MiB                                   |
| Request da chave                                | até 8.192 bytes de rawBody                                                  |
| Paginação                                       | padrão 25, máximo 50, cursor até 4096 caracteres                            |
| Materialização                                  | uma seção por transação                                                     |
| Limpeza                                         | no máximo 50 escritas de documentos por chamada, inclusive controles/recibo |
| Fonte/obra agregada                             | sem novo teto comercial; inteiros seguros e capacidade explícita            |

Medir documento body com todos os campos finais, incluindo overhead conservador
Firestore, não só content. Rejeitar antes de gravar. Soma segura não significa
alocar array de tamanho sectionCount nem varrer todos os documentos. O cliente
valida o snapshot inteiro antes do start e a capacidade local antes de append;
falha de capacidade não autoriza truncamento nem plaintext persistido.

Erros de domínio têm `{reason}` fechado; não incluem payload, HTML, token, chave
ou dados de outro dono. Códigos/reasons:

| Código              | Reasons                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| invalid-argument    | invalid-input, invalid-id, invalid-cursor, payload-too-large, operation-mismatch                                          |
| unauthenticated     | auth-required, app-check-required                                                                                         |
| not-found           | import-unavailable                                                                                                        |
| failed-precondition | identity-mismatch, checkpoint-conflict, state-conflict, review-mismatch, key-mismatch, inconsistent, universe-unavailable |
| permission-denied   | access-denied                                                                                                             |
| resource-exhausted  | counter-overflow                                                                                                          |
| unavailable         | temporary-unavailable                                                                                                     |

O HTTP usa os códigos abaixo; não introduzir 409 para conflito que já é 412.
Leituras de conta alheia respondem import-unavailable, sem revelar existência.
Estrutura corrompida falha fechado, não é tratada como job novo ou chave ausente.

## HTTP dedicado de chave

O nono método é `onRequest`, **não** onCall. Rota same-origin:
`POST /api/adventure-import/recovery-key`, rewrite Hosting anterior a `**`, região
us-central1 e função `getAdventureImportRecoveryKey`. `cors:false`; sem middleware
CORS que responda antes do handler. Cliente usa serviço HTTP próprio, não httpsCallable.

- Primeiras instruções do handler definem `Cache-Control: private, no-store` e
  `Content-Type: application/json; charset=utf-8`, antes de método, Auth, App Check
  e parse. Métodos diferentes de POST retornam 405 com `Allow: POST`, sem chave.
- Request `Content-Type: text/plain;charset=UTF-8`, corpo JSON UTF-8. Parse manual
  de rawBody após headers; limite 8.192 bytes, UTF-8 estrito. Assim JSON malformado
  desse transporte não é rejeitado pelo body-parser JSON antes do handler.
- Headers `Authorization: Bearer <Firebase ID token>` e
  `X-Firebase-AppCheck: <token>`. Admin verifica ambos no servidor; App Check é
  obrigatório no runtime publicado. Não aceitar UID, cookies ou chave na query.
- Não adicionar bypass de produção para emulador. Testes podem injetar verificadores
  no adaptador; isso não prova verificação Google real. QA identifica separadamente
  HTTP real de erro, SDK/regras reais e caminho positivo do domínio.
- Fetch: `method:'POST'`, `credentials:'omit'`, `cache:'no-store'`,
  `redirect:'error'`; não seguir redirect para SPA/login, não guardar resposta em
  service worker/cache. No desenvolvimento, vite.config.ts usa loadEnv com VITE_FIREBASE_PROJECT_ID público
  existente e validado, proxy somente da rota exata para
  https://us-central1-PROJECT.cloudfunctions.net/getAdventureImportRecoveryKey,
  repassando Authorization/App Check. Demais rotas permanecem intactas. Nunca cair
  no fallback HTML da SPA; nenhuma variável, segredo ou dependência nova.

```ts
type RecoveryKeyInput = {
  importId: string;
  jobToken: string;
  reviewHash: string;
  expectedKeyId?: string;
};
type RecoveryKey = Identity & {
  reviewHash: string;
  keyId: string;
  algorithm: 'AES-GCM';
  keyBase64: string;
};
// HTTP 200: {data: RecoveryKey}
// Erro: {error:{code:string,message:string,details:{reason:string}}}
```

ExpectedKeyId é opcional somente no primeiro seal, obrigatório ao recuperar um
snapshot existente. Hex de 64 caracteres como keyId; keyBase64 padrão estrito/padded de 32 bytes,
44 caracteres e decode/reencode idênticos. Chave 32 bytes CSPRNG gerada uma única
vez, sob transação job/token/estado e keyId reservado no start. Controle mantém
recoveryKeyReady; true com documento ausente/corrompido falha inconsistent, jamais
regenera silenciosamente. Criação da chave não incrementa checkpoint do manuscrito. No mesmo checkpoint,
resposta de lista/get anterior à criação não rebaixa recoveryKeyReady para false;
cliente invalida donos de leitura após buscar chave e aplica geração atual. Estado
terminal com checkpoint maior sempre prevalece.

A chave só sai em uploading/preparing/ready e sob hash/token/keyId exatos. Universo
indisponível não bloqueia a prosa própria. Cancel/activate apagam chave e desativam
marker atomicamente; terminais não a recriam. Nenhuma lista/get/recibo lê ou inclui
raw key. Chave só em RAM no cliente; respostas nunca entram em logs/telemetria.

HTTP 400 invalid-argument, 401 unauthenticated (Auth/App Check), 403 permission-denied,
404 not-found, 405 method-not-allowed, 412 failed-precondition, 429 resource-exhausted,
503 unavailable. Falhas internas inesperadas são 503 sanitizadas. Todos os erros
controlados, inclusive parse/token ausente/inválido, têm no-store. Rejeição da
infraestrutura antes do handler (por exemplo tamanho máximo da plataforma) não
emite chave; não prometer headers que a aplicação não controla. A prova deve passar
pelo wrapper onRequest e pelo transporte raw, não apenas chamar o serviço puro.

## Snapshot cifrado e retomada

Plaintext fechado `{schemaVersion:1,project:Project,source:Source,sections:Section[]}`,
somente as seções selecionadas e sua ordem confirmada. Não inclui PDF/arquivo.
Serializar em JSON UTF-8; após decifrar, validar shape/totais e recomputar reviewHash.

```ts
type ProtectedReviewSnapshot = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  jobToken: string;
  keyId: string;
  reviewHash: string;
  sectionCount: number;
  nonce: Uint8Array; // exatamente 12 bytes
  ciphertext: ArrayBuffer; // inclui tag GCM de 16 bytes
};
// AAD não é objeto canônico: é exatamente UTF8(JSON.stringify(array)):
const aad = [1, ownerId, importId, jobToken, keyId, reviewHash, sectionCount];
```

AES-256-GCM, IV novo CSPRNG 12 bytes por seal, tagLength 128. Chave/CryptoKey somente
RAM; sem raw key em IDB/localStorage/sessionStorage. Confirmar a transação IDB
oncomplete do ciphertext antes do primeiro append. Servidor verifica chave criada,
mas não pode atestar durabilidade do dispositivo: esse gate é do cliente real.

Start confirmado antes do seal deixa janela sem prosa recuperável após reload.
Mostrar preparação sem cópia protegida; permitir cancelar ou reconstruir/reconfirmar
**o mesmo hash**. Não prometer autosave anterior à confirmação. Na recuperação,
get confirma UID/token/hash/keyId atuais antes de buscar chave com expectedKeyId.
Revalidar ator/envelope após fetch e após decrypt; só então renderizar ou enviar.
Falha de tag/AAD/schema/hash não cai para outra revisão nem recria chave.

Journal separado armazena apenas identidade, action, operationId, expectedCheckpoint,
index e fingerprint; nunca request com prosa. Append pendente é reconstruído do
snapshot imutável. Web Locks só cobre CAS/reserva local, nunca rede. Limpeza local
compara UID/job/token/stamp, preservando outra aba/conta. Sem snapshot, ainda é
possível cancelar, concluir materialização já enviada ou confirmar activated; não
recuperar texto nunca enviado de outro aparelho. Fechar diálogo não cancela job.

## Persistência, ativação e limpeza

Namespaces novos seguem o plano 27, fechados ao SDK dono/intruso/anônimo. Reserva
global persistente é conferida também pelo Studio.createAdventure **antes** de
criar raiz. Reserva não desaparece em canceled/deleted/activated; IDs consumidos
não são reutilizados. Conflito com raiz existente falha antes de materializar.

Manifesto por índice contém apenas index/title/bodyBytes/bodyHash/wordCount/chainHash;
corpo final é escrito uma vez em `adventures/A/scenes/S/body/current`. Controle
prende descritor/fingerprint/totais/cadeia/counters/estado; recibos e fences metadata.
Campo interno de reserva identifica UID/importId/criação; nenhuma recuperação
confia no importId sozinho. Filhos sob raiz ausente não autorizam leitura ou uso.

Por seção, inventário determinístico de limpeza, inclusive documentos pai ausentes:

1. `users/UID/adventureImports/I/sections/INDEX`;
2. `adventures/A/parts/P`;
3. `adventures/A/scenes/S`;
4. `adventures/A/scenes/S/body/current`;
5. `adventures/A/scenes/S/planning/current`;
6. `adventures/A/workWordSources/SOURCE_KEY`;
7. `adventures/A/workWordGroups/GROUP_KEY`.

Advance de limpeza trata no máximo 6 índices por chamada (42 deletes + controles/
recibo abaixo do teto 50). Limpa somente índices enviados, com IDs recalculados;
preparedSections pode ser menor. Delete de documento já ausente é idempotente.
Passo final remove `adventures/A/workProgress/current`, verifica que a raiz continua
ausente e que a reserva é exata, e muda para deleted. Chave foi apagada no cancel.
Nunca remover recibos/fence/reserva necessários para impedir ressurreição. Nenhum
PDF, bloco adicional, imagem, lore ou histórico foi criado por este protocolo.

Append/materialização/cleanup têm transações limitadas, todos os reads antes dos
writes. Materialização usa inicializadores compartilhados reais de parte/cena,
revision 1, planning vazio, main virtual tipo scene/audiência creator; sem sceneBlock
que duplique prosa. Ledger recebe corpo explícito/grupo futuro e está countReady
antes de ready. Não alterar política manual de histórico nem preimages existentes.

Activate cria raiz revision 1/status draft/editorialState draft/language pt-BR,
título/sinopse/universo congelados e:

```ts
origin = {
  kind: 'imported',
  importId,
  sourceMediaType: source.mediaType,
  sourceHash: source.sha256,
  reviewHash,
};
```

Raiz, vínculo de universo, estado activated, recibo e remoção da chave são atômicos.
Não há raiz incomplete/deleting visível. Leitores/capturas começam a funcionar só
após ativação. Cancel concorrente perde se activate já comitou; não invoca exclusão
integral de aventura nem C4. C4 permanece v4; origens B/C2/C3 existentes não mudam.

## Vetores canônicos e prova planejada

Cálculo documental independente em Python hashlib/json (UTF-8, sort_keys=True,
ensure_ascii=False, separators=(',',':')), em 2026-10-21; não foi rodada suíte.
Cliente e QA reproduziram os 13 hashes com JS independente e Node/WebCrypto,
sem importar helper de produção; todos coincidiram. São cálculos documentais,
sem prova de implementação. Ordem de keys diferente deve dar o mesmo hash;
ordem de seções, newline e Unicode diferente devem alterar o hash.

Fixture pública exclusivamente sintética, strings abaixo em notação JSON:

```json
{
  "uid": "owner-fixture",
  "importId": "ImportFixture0001",
  "project": { "title": "Aventura Á", "synopsis": "Revisão confirmada.", "universeId": null },
  "sourceBytes": "fixture-source\n",
  "sourceMediaType": "text/html",
  "sections": [
    { "title": "Chegada", "content": "<p>Olá 🐉</p>\n" },
    { "title": "Mapa", "content": "<p>\"Mapa\" &amp; trilha\\</p>" }
  ]
}
```

Entrada de metadata com espaços externos (por exemplo `"  Aventura Á  "`) normaliza
para a fixture antes do hash. Conteúdo não recebe esse trim. Fonte tem 15 bytes;
seções têm 17 e 27 bytes, total 44. As entradas canônicas são as fórmulas fechadas
acima, substituindo exatamente esses campos/valores.

| Saída                                    | SHA-256 esperado                                                 |
| ---------------------------------------- | ---------------------------------------------------------------- |
| sourceHash                               | 1f008eb780e579037a4dfb134513ce3b9aeff647dc382509aba1a5496a33baeb |
| seed                                     | d2a67ba77ac3caf09710e8cbf85c86b53b0473dffe89d097d84a0347976f6a3c |
| bodyHash0                                | 447c09cf2bd5f277f57d7024019d08be702fb7c0ebddb822275f092383dcfda7 |
| chain0                                   | 07f5c6c7bd7b9731d091ffda7ac8b9d6fda783b33f57437d9cb298a51bd93928 |
| bodyHash1                                | d56096092e997987043cf247ea1c4d99f8a44a386fae33dd920672985ed61b30 |
| chain1                                   | 7e336479d44b7d39f7806113b5ff8f743ff7f3dcd75e7c71e782a053b2b14c47 |
| reviewHash                               | 78e8daa3650d494acfed5bdda5e90da6c4835d0f2ca9b5e699e0c7270a098440 |
| start fingerprint                        | d1c11bea1afd5c852b98740d6a67a81f63738a53c16efcea7c402a6e7fbff8ed |
| adventureId                              | d0b805cd641b02db651d7d20ab1a2584ecc393bb49678176f41ef5840a425933 |
| partId0                                  | 3e2c5cf8ba6d9b00dca85eaf125a9e52cd4409deed75cef0a4c1160bff9cdd33 |
| sceneId0                                 | 0e1fa91e8dcdb989621d68c71d50233e351c283112290b39ec5f95003a4a1338 |
| token seconds 1700000000/nanos 123456789 | e568a4a32319f6f6ac380c6e7181b9dad716e16646ed41dfb49490982247a20c |
| token seconds 1700000000/nanos 123456790 | 334a585f75cd82d7a61a1eebec0ef5373568e677f6a42c76c20f627738f83c78 |

Vetor AES-GCM documental reproduzido por Node/WebCrypto e, independentemente, por
.NET System.Security.Cryptography.AesGcm, sem helper de produção ou suíte:

- Key: bytes 00..1f; IV: bytes 00..0b; keyId: `'11'.repeat(32)`.
- JobToken: vetor nanos 123456789 acima; reviewHash: vetor acima; sectionCount: 2.
- AAD: UTF8(JSON.stringify([1,'owner-fixture','ImportFixture0001',jobToken,keyId,reviewHash,2])).
- Plaintext: UTF8(JSON.stringify({schemaVersion:1,project,source,sections})), na ordem
  exibida: project title/synopsis/universeId; source mediaType/sha256/byteLength;
  seções title/content. Essa ordem fixa serve ao vetor AES; reviewHash usa o
  canonical recursivo definido anteriormente.
- Plaintext 356 bytes; AAD 242 bytes; ciphertext 356 bytes + tag 16 = sealed 372.
- SHA-256 plaintext: `47d3ee02b84726338935d0683fcbe1b562eff5ec97bf721aa84c49654701bf18`.
- SHA-256 AAD: `a75ee9c17e98c9a556290ecd6194aff268b7ce57d5c3a1eaaf2961eeb092e041`.
- Tag hex: `ccb036ad609329e7ce63e28e75b99a00`.

Sealed completo, ciphertext seguido da tag, base64 padrão:

```text
PCCleK2Ar3rbJOX42IYWT7nnqxaACTAWXQSRpycSIsZoZMKZjfsw2QLBEZn99UkYLdhCoXil2rRQ51lwa8HPzKJZsBOgEoUOPDfFAInmfIVZ7qhMVE9xHZOU6KkKg9zEr9pjiNEtpGeyPk3dPQdCGphdGYmOoEHzLKsuvefEVCzPN3iym7+/PmTDZINOsi3wA8LBDxcg9Xq8Z40VzerZi6agpyXayK1KwwW/y+y0s4qura8R6ZIS2QO59vNGodTAK36/yjS8tKgGN+bSg3e4t9IcmRNfIpbTE+juog0t4Z03S/aV1xV+CXA03WvBeBM/27GDLuYS/cxjBwJRsb4B6XG2k/T8+GQcFLAcc9JDTijglva9vsTtbNAPnc6afYZkcT2CJpi44mywSFMuZvCC6bqHOi4otuM1+15zYvJTMcvzt0NatTxapMKQGnx/8zsD/mrspOhm7GQhwiQ6sZ44wXtSpKTMsDatYJMp585j4o51uZoA
```

Esses bytes fixos são exclusivamente sintéticos. Nunca usar nonce fixo em produção.
Cobrir alteração de UID/importId/token/keyId/hash/count/nonce/tag e ator antigo na
implementação. A ausência local de Python cryptography levou à segunda conferência
via .NET; nenhuma instalação foi feita. Cálculos não são testes do produto.

Gates integrados mantêm as quatro famílias SDK e duas jornadas do plano 27. Acrescentar
HTTP real com headers em sucesso/erros Auth/AppCheck/método/parse e conteúdo sem
key fora desse endpoint; cursor com janela vazia; reserva contra Studio; cleanup
seis índices + finalização; crash entre commit de start e resposta/token; chave
criada mas resposta perdida; marker sem key; start fenced atrasado; recibo histórico
sem rebase; mais de 25 seções e raiz ausente por endereço conhecido. Não contar
fixtures ou verificadores injetados como prova de autorização real de produção.

## Inventário e revisão pendente

Além do inventário 27: binding onRequest/Admin Auth/AppCheck em Functions, rewrite
`firebase.json` e proxy exato dessa rota no vite.config.ts, com projectId público existente
(configuração/proxy pertencem ao integrador). Não criar env/client secret.
Cliente de chave deve distinguir JSON de fallback HTML e descartar resposta inválida.
Unidades de contrato/HTTP não substituem SDK real nem AES/IDB reais no navegador.

O esforço backend permanece a parcela 26/44/72 h do plano 27, baixa confiança,
incluindo contratos e unidades próprias, excluindo QA integrada. Não é saldo,
horas realizadas ou promessa de prazo. Este adendo não soma nova parcela à baseline.

- [x] Revisão literal root/cliente/QA dos DTOs, normalização, preimages e estados.
- [x] Reproduzir 13 vetores de hash independentemente e fechar vetor AES-GCM documental.
- [x] Fechar encaminhamento local same-origin por proxy exato, sem nova env/dependência.
- [ ] Implementar e validar a evidência HTTP de erro real após liberação.
- [x] Integrador liberar implementação do plano 27; sem merge/deploy ou mutação de dados reais.
