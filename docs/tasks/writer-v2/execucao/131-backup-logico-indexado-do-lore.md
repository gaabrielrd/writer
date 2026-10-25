# P1 / M38c12 — Backup lógico indexado do lore

## Objetivo e descoberta

Prosseguir a etapa 5 do [plano 80](80-consumidores-do-lore-completo.md), sem
declarar concluído o conjunto de P1. A etapa 4 foi conferida no código atual:
EditorChatContextRead usa leitor lógico; LoreAnalysisContext usa
ReadBookLoreLogical com orçamento de contexto; Scenes/NarrativePlanning usam BookLoreReferenceRead; publicação
usa captura C1 e o certificado dos marcos A/B do plano 130.

ChapterChat clássico recebe contexto cliente de listLoreEntities hidratado;
não resolve fichas backend. O [plano 29](29-contexto-autorizado-e-ia-de-cenas.md)
e a [ABI 30](30-contratos-do-chat-de-cenas.md) preservam explicitamente capítulos/
históricos antigos, sem migração/proveniência retroativa. Não ampliar esse
contrato durante o backup. Campanhas capturam universo/aventura por leitores
próprios; não conceder autorização implícita para fichas de livros.

Na descoberta inicial, BookBackupResourceRead ainda serializava snapshot.data de lore. Em stubs, omite
a fonte lógica ou falha no domínio. BookSnapshotCapture reúne todo JSON em RAM;
BookBackupContent/BookRestoreValidationStep limitam a 8 MiB/128 spans e também
recompõem o item. Essa fronteira não atende lore grande nem JSON remapeado que
cresceu. O framing do contêiner já aceita múltiplas partes; não aumentar o limite
nem reunir uma string gigante como substituição da leitura por faixas.

## Requisitos e suposições

Preservar campos presentes/ausentes, strings/UTF-8/BOM/escapes literais, ordem e
duplicados de aliases/relações, datas reais e consentimento, sem resolver global.
Projeção portátil continua fechada, sem payloadStorage, jobs, chaves ou tokens.
Nome/categoria são obrigatórios; demais campos seguem o schema portátil atual.
Cópia continua privada e autoriza a mesma origem nativa por unidade e ao selar.

O índice sintático não concede acesso, não certifica SHA/nascimento, nem permite
ativação. Valores do índice temporário precisam ser vinculados ao mesmo arquivo,
item, framing e checkpoint nativo antes de produção/restauração. Relações devem
ser indexadas e remapeadas por unidades, sem catálogo integral em RAM.

Não criar formato incompatível se o framing existente puder transportar o JSON
lógico completo por spans. A versão/representação final só será habilitada após
todos os leitores, validadores, materializadores e cleanup estarem integrados.

## Sequência de implementação

1. A: núcleo puro compartilhado de índice do objeto data do lore portátil,
   processando até 64 KiB por passo. Reutilizar a gramática/domínio incremental
   dos campos, com uma entrada separada para relações extensas; conservar o
   limite e o contrato das páginas nativas de 64 relações. Índice em estado
   constante, somente campos/ranges/datas/privacidade/contagens e ID corrente.
   Eventos de referências saem em unidades, sem guardar prosa/lista integral.
   Desacoplar o erro público GenerationError do I/O, preservando a mesma classe
   reexportada por generation e todos os contratos dos validadores existentes.
2. B: composição/inspeção autorizada do lore lógico inline/v1/v2/criação e índice
   de saída portátil por spans. Fixar coleção/livro/ficha/geração/segmentos e
   hash integral. Leitura de cada página deve ter budget nativo explícito e
   custo total linear, sem reconstruir o item a cada chamada. Inventariar e
   implementar cancelamento/fence/cleanup antes de qualquer novo produtor.
3. C: integrar captura cliente, validação local e validação servidor em unidades.
   Eliminar o acúmulo de prosa/spans ilimitados no checkpoint e conferir EOF,
   framing, SHA/domínio/referências antes de aceitar o item. Compatibilidade
   atual é requisito; nenhum fallback para serializar o stub.
4. D: integrar leitor verificado/remapeador/materialização de lore e relações,
   incluindo crescimento após remap >8 MiB e fontes/campos/páginas grandes.
   Produção nativa deve ser limitada por unidade, manter raiz ausente, inventário,
   rollback e retomada com provas originais. Conferir captura → validação →
   remap → preparação → leitura/recaptura antes da ativação geral.
5. Conferir todos os namespaces/escritores/exclusão/coleta e compatibilidades de
   P1, migrar/certificar fontes legadas necessárias, integrar host/roundtrip,
   executar validate integral no fechamento de P1. Restante de P1/fases 3–5 e
   gates humanos/comerciais permanecem requisitos, sem push/CI/deploy.

## Arquivos e aceites do marco A

Novos generationError e BookPortableLoreIndex/testes; Generation e
BookLoreFieldValidation conservam ABI. A gramática nova de relações extensas
não é aceita pelas entradas anteriores de página/campo. Sem endpoint, namespace,
Rule, dependência, captura ou materialização novos neste marco.

Node/Chromium/bundle browser: objeto lógico acima de 8 MiB/128 partes, texto grande
em campos/descrição, muitas relações/aliases, UTF-8/escapes em fronteiras, ausência/
vazio/duplicados, datas/IDs/enum, JSON truncado/não canônico, checkpoint inválido
e entrada imutável. Comparar domínio ao schema portátil existente. Estado e
retorno limitados pela unidade; índice não guarda prosa nem todas as relações.

Testar regressões dos consumidores do validador de campo e identidade de
GenerationError. Lint/sintaxe/formato/docs/arquitetura/build conforme risco;
documentar evidência real e commit local. Sem validate global até fechar P1.

## Riscos e não escopo

A base v1 requer inspeção completa, mas não releitura quadrática. Um índice de
ranges sem prova nativa não autoriza leitura. Não usar orçamento de contexto/
publicação como teto de autoria ou portabilidade. A/B isolados não entregam
backup grande ou restauração integral; não retirar essas pendências do registro.

Não migrar chat clássico, resolver lore externo, alterar UI comercial, habilitar
rollout ou inferir validação humana. Somente commits locais, sem subagentes.

## Mapa de fronteiras conferidas em 2026-10-25

| Fronteira                                               | Estado observado e continuação                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| EditorChatContextRead                                   | C1/ContextRead lógico em livro; proveniência histórica por nascimento.                                            |
| LoreAnalysisContext                                     | ReadBookLoreLogical com budget próprio de contexto, sem usar stub como dado.                                      |
| Scenes/NarrativePlanning                                | BookLoreReferenceRead para livro; ramos diretos restantes são aventura/universo.                                  |
| PublicationService/BookLorePublication                  | Captura C1 original e inspeção certificada; finalização transacional.                                             |
| LoreService/get/list/subscribe                          | Hidrata payloads antes do DTO visual. Hosts nativos usam captura C1 bruta.                                        |
| ChapterChat clássico                                    | Contexto cliente hidratado; capítulos/históricos legados preservados conforme 29/30.                              |
| CampaignCapture/CampaignLoreOrigin                      | Somente universo/aventura; não migrar para C1 de livros.                                                          |
| BookBackupResourceRead/BookResourceCapture              | Documento físico/JSON recomposto: B/C obrigatórios.                                                               |
| BookBackupContent/BookRestoreValidationStep/ContentRead | Limite/coleção de spans/recomposição: C/D obrigatórios.                                                           |
| ExportManuscript JSON legado                            | Usa DTO hidratado de apresentação; preservar compatibilidade sem usá-lo como fonte bruta do backup integral novo. |
| AssistedBook/BookRestoreArtifacts/LoreAnalysis apply    | Produtores, não prova de leitura portátil; inventário conjunto de writers/P1 continua obrigatório.                |

Busca no grafo consultada primeiro; símbolos recentes/edges ausentes exigiram
conferência direta das fontes. Este mapa não é prova de inventário global vazio,
implantação, validação humana ou rollout.

## Estado do marco A — 2026-10-25

Índice puro e declaração compartilhada implementados: 335 Node distintos
positivos (47 novos/288 regressões), três jornadas Chromium, bundle browser de
12 módulos e declaração TS isolada conferidos. [ADR 0151](../../../decisions/0151-incremental-portable-lore-index.md)
e [evidência](../../../entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md).

A não está conectado à captura/validação/restauração; limites antigos não foram
alterados. Continuar B → C → D antes de encerrar o plano. P1/F2-09/V2 e demais
fases/gates permanecem abertos; validate integral somente no fechamento de P1.

## Contrato B antes da implementação

Reutilizar getBookLoreRead/readBookLorePart, sem novo endpoint/namespace/job.
Uma captura individual fixa token C1 v1 (nascimento/clock da coleção e identidade
nativa da ficha) antes de bytes. Cada parte reautoriza os mesmos livro/dono/
ficha/geração/segmentos. Revalidar o header original depois da saída e oferecer
revalidação metadata antes do selo geral futuro. Tokens ficam somente em RAM.

Compor o JSON portátil sequencialmente. Inline já tem projeção lógica fechada.
Em payload, inspecionar a base uma vez com o parser existente e um observador
RAM dos bytes de cada valor; emitir só campos efetivos, omitir bookId e datas
antigas v2, anexar overrides presentes/datas lógicas e juntar interiores das
páginas de relações na ordem. Validar quantidade/domínio de cada página nativa.
Objetos podem ter ordem de propriedades distinta do projetor antigo; ordem de
aliases/relações e strings/datas permanecem literais e sem defaults.

Conferir SHA integral de todo corpo consumido, inclusive base com campos
substituídos. O índice A valida a saída data incrementalmente e produz spans;
hash/contagem da saída completa e offset de data formam prova privada em RAM.
Não reler ranges sem hash/prova da parte nem guardar hashes/prosa de todas as
partes em memória. Estado é limitado a parsers, hash, unidade e buffer de saída.

Escrever partes de até 64 KiB aguardando o consumidor; sem leitura antecipada
enquanto write estiver pendente. Bytes são provisórios até EOF/hashes/domínio/
header e selo. Abortar/fechar não retorna prova de conclusão; como as APIs são
somente leitura, não há recurso remoto novo para limpar. O sink temporário já
existente deverá ser abortado pelo compositor C em falha; não publicar arquivo
parcial por causa de um write bem-sucedido.

Extrair apenas helpers puros de erro/closed usados pelo parser da base,
preservando reexports e erros antigos; não duplicar sua gramática. Compartilhar
validação do DTO de parte entre o leitor anterior e o novo produtor. Marco B
inclui composição e provas, não habilitação do arquivo final ainda limitado nos
validadores C/D. Testar inline/v1/v2/criação, >8 MiB/128 partes, ausências,
overrides, relações grandes, corrupção de cauda, identidade/clock/conta/abort,
pressão de consumo, final sem chunks e leitura linear.

## Estado do marco B — 2026-10-25

WritePortable/verifyPortable expostos pelo serviço público C1; fonte fixada pelo
clock, composição de base/overrides/datas/relações em uma leitura por corpo,
hashes/domínio/spans e header final. Buffer com pressão de consumo, sem prosa
integral ou novos recursos remotos. Helper de unidade compartilhado conserva
o leitor anterior. 147 Node, 114 Vitest distintos, cinco SDK e três Chromium
positivos; tipos/build/smoke/checks. [Evidência B](../../../entregas/2026-10-25-writer-v2-composicao-portatil-do-lore.md).

B implementado/validado localmente. Não conectado ao orquestrador final:
C deve integrar captura/validação incremental antes do selo, D deve consumir/
remapear/materializar por spans e comprovar roundtrip sem teto artificial.
Plano 131, P1/F2-09/V2 e fases/gates continuam abertos.

## Contrato C antes da integração — orçamento semântico e envelope

A validação servidor limita o buffer do ValidationStore a 96 escritas por
operação. Uma parte de transporte de 64 KiB pode conter mais de 64 relações
curtas; não criar uma escrita por referência sem orçamento nem guardar todas
as relações/spans no checkpoint.

Executar C em sequência técnica: C1 acrescenta prefixo do índice A com até
64 referências por transição e índice do envelope completo do item lore;
C2 conecta esses passos ao ContentMachine/validador local/ValidationStep e
persiste somente ponteiros limitados; C3 conecta a captura C1 ao orquestrador
e confere o selo final. C1 isolado não habilita captura/restauração nem conclui C.

O prefixo devolve consumed exato, estado sintático e referências provisórias.
Ao atingir o orçamento, retoma no byte seguinte sem perder/repetir referência.
As entradas antigas conservam consumo integral e páginas nativas de até 64.
O envelope fechado conserva schemaVersion/kind/parentId/id/data em qualquer
ordem canônica já aceita, sem normalizar prosa ou copiar data em RAM. ID e
header são limitados; data usa A, com offset/ranges em bytes.

Arquivos C1: BookLoreFieldValidation e declaração; BookPortableLoreIndex e
declaração; novo BookPortableLoreItemIndex e declaração/testes; atualização de
ADR 0151, arquitetura/testes/registro/plano/evidência. Não alterar fontes nativas,
endpoints, Rules, formato do arquivo ou leitores finais nesta transição.

Aceites: compatibilidade de envelope/campos/ordem, >8 MiB/128 partes, estado sem
prosa/lista, fronteiras UTF-8/escapes e retorno com <=64 referências, recarga de
cada checkpoint, EOF/truncamento/injeção/duplicados/estado inválido rejeitados.
Conferir consumo e equivalência com schema anterior; Node dirigido, declarações,
bundle/Chromium e checks proporcionais. Nenhuma prova sintática concede SHA,
autorização, integridade de framing ou ativação. C2/C3/D/P1 seguem obrigatórios.

## Estado C1 — 2026-10-25

Envelope/prefixo semântico implementados e validados: 43 Node novos +217 de
regressão, 26 Vitest do bridge, três jornadas Chromium, bundle browser e tipos.
[Evidência C1](../../../entregas/2026-10-25-writer-v2-envelope-incremental-do-lore.md).
Entrada anterior continua integral e estados nativos continuam separados.

C ainda aberto: implementar C2 (ContentMachine/validadores/ponteiros), C3
(captura/revalidação/selo), depois D e inventários/roundtrip/validate de P1.
Não habilitar arquivo/restauração por esse parser isolado.

## Contrato C2 antes da implementação — validação integrada

ContentMachine passa a controlar begin/advance/finish do lore incremental,
bloqueando JSON/raw/finish durante um item aberto. Guarda somente envelope/
sintaxe/IDs/metadata e escreve no máximo 64 referências por transição. EOF
confere endereço lógico e datas/contagens antes de reservar o nó do lore.
Checkpoints antigos sem lore são normalizados para lore:null.

O validador local usa esse caminho somente para book-lore, sem concatenar
payloads. Os demais tipos e o normalizador legado mantêm seus contratos.
O pacote/framing/selo continua obrigatório além da validação semântica.

No servidor, state.lore guarda record/cursor inicial, part/tamanho anterior,
hash SHA serializado e no máximo um span/offset de frame em processamento.
Cada avanço processa <=64 KiB e <=64 referências. Um frame denso pode exigir
retomadas autenticadas do sufixo, com amplificação limitada pelo tamanho fixo
do frame; nunca reconstruir o item inteiro nem acumular um catálogo de spans.
Parser do pacote avança uma vez por frame; não seguir ao próximo enquanto o
frame atual não tiver sido consumido semanticamente.

Ao EOF, ValidationItems recebe ponteiro constante do item com cursor, número
de partes, hash integral e metadata de ranges. Usar os namespaces existentes
validationState/validationIndex/validationItems, com provas nativas/recibos/
cleanup atuais e raiz ausente. Não criar cache de prosa ou novo namespace.

BookRestoreContentRead deve reconhecer esse ponteiro para manter seu contrato
anterior de leitura integral de itens pequenos, ainda limitado pelo orçamento
já existente. Isso não implementa o leitor/remap grande D. Arquivos grandes
podem ser validados; ativação/restauração integral continua pendente até D.

Arquivos: BookContentMachine, BookBackupContent, BookRestoreValidationStep,
novo helper BookRestoreLoreValidation para o estado/cursor/hash limitados,
BookRestoreContentRead para compatibilidade do ponteiro; testes dirigidos de
máquina/validação/serviço/reader/SDK/Chromium e documentação/ADR/AGENTS/evidência.

Aceites: equivalência de relatórios com o caminho anterior, grande >8 MiB/128
partes e relações densas, estado sem prosa/spans integrais, até 64 escritas de
referências por passo, JSON checkpoint em cada transição, EOF/endereço/domínio/
SHA/framing/sequência rejeitados quando inválidos. Validar fonte e índices
nativos no commit/replay/conflito/recriação/cancel/cleanup, sem conceder acesso
por índices. Compatibilidade pequena/legada e root ausente preservadas.
Sem UI, Rule, endpoint, captura/selo C3 ou materialização D novos.

## Estado C2 — 2026-10-25

Máquina/validador local/servidor integrados. Lore novo usa cursor, SHA serializado
e um frame pendente; ponteiro final constante, sem ficha/spans integrais.
Checkpoints em andamento e leitura integral pequena mantidos. 232 Node distintos,
13 Vitest, seis SDK distintos, três Chromium e build/smoke positivos.
[Evidência C2](../../../entregas/2026-10-25-writer-v2-validacao-incremental-do-lore.md).

C ainda aberto para C3: ligar captura C1 e provas finais ao selo. D deve consumir
o ponteiro por spans e remapear/materializar grandes, incluindo crescimento do
JSON após remap. Rollout coordenado/drenagem de instâncias antigas, inventários/
legacy/roundtrip/validate de P1, fases e gates continuam pendentes.

## Contrato C3 antes da implementação — captura lógica e selo

Reutilizar o produtor writePortable e os endpoints C1 existentes para todo lore
do catálogo de recursos, inclusive inline. A captura dos demais recursos continua
pelo contrato atual. Não usar DTO visual nem o read físico de um stub nativo.

BookResourceProof acrescenta somente loreDigest: hash encadeado de ID/token C1
v1 por ficha na ordem da varredura. Não guardar todas as provas/tokens/IDs na RAM.
A varredura final recomputa esse digest por metadata C1 forçada em v1 e compara,
além do digest de itens/pais/coleção e token nativo do livro já existentes.
Uma mudança de root/clock/cabeça/geração/dono ou revogação impede footer/selo.

O port C1 é compartilhado entre captura e conferência final no stream. Um
adaptador padrão carrega a feature lore pela API pública somente no primeiro
uso, fixa uma sessão com actor SDK exato e conserva seu guard nas verificações
seguintes, inclusive depois do último lore. Port injetado continua disponível
para composição/testes, sem inicializar Auth/App Check ao importar o módulo.
isCurrent/signal do host continuam cobrindo a captura e o destino completos.

Acrescentar portableMetadata ao cliente C1 para forçar token v1 independentemente
do modo de tokens do editor. É metadata/reautorização, não prova nova dos bytes
ou disponibilidade de todos os corpos. O produtor continua conferindo cada
corpo/parte, SHA/domínio/EOF e header original antes de retornar prova.

ReadBookBackupResource deve recusar payloadStorage no ramo físico de lore;
inline e demais recursos conservam ABI. Nenhum fallback após erro C1.
Proof é privada/em RAM; JSON e arquivo só recebem dados portáteis. Provas antigas
de três campos não são persistidas e não serão promovidas silenciosamente.

Arquivos C3: BookLorePortableClient, novo BookBackupLorePort, BookResourceCapture,
StreamBookBackup e exportações públicas; guarda de BookBackupResourceRead;
testes dirigidos de C1/recursos/orquestrador/sink e bridge real captura → arquivo
→ validação local/servidor. SDK/Chromium para cancelamento/ator/alteração tardia,
pressão de consumo, corrupção, grande/overrides/relações e ausência de selo.
Atualizar ADR 0151, arquitetura/testes/registro/plano/AGENTS/evidência.

C3 não conclui o leitor/remap/materialização D nem habilita rollout. D deve
restaurar o arquivo capturado de verdade, inclusive campos/relações/remap grandes.
Inventário geral/P1/fases/gates e validate de P1 continuam obrigatórios.

### Revisão C3 — janela durante selo/fechamento

Conferir também o retorno do encoder após escrever o selo e compartilhar o port
C1 com BookBackupSink até sua resposta positiva. Revalidar guarda após close:
uma troca durante a escrita do selo deve abortar antes do close; uma troca no
close não pode devolver sucesso. Close já confirmado pode ter gravado o arquivo;
não prometer rollback de um destino que já concluiu esse commit.

## Estado C3 — 2026-10-25

Captura C1 conectada ao arquivo completo e revalidação antes do selo; prova
privada pequena por digest, ator compartilhado até close e recusa de stub físico.
Arquivo grande real passa upload/integridade/validação servidor sem raiz ativada.
27 Node, 75 Vitest distintos, três SDK distintos e cinco Chromium positivos;
build/typecheck/smoke 2990 módulos e checks locais.
[Evidência C3](../../../entregas/2026-10-25-writer-v2-captura-logica-e-selo-do-backup.md).

A/B/C implementados/validados tecnicamente. D permanece obrigatório: consumir o
ponteiro grande por spans autenticados, remapear IDs/relações, materializar partes
e provar roundtrip, incluindo crescimento após remap. Plano 131/P1/F2-09/V2,
inventários/legacy/drain/rollout/validate e demais fases/gates continuam abertos.

## Contrato D antes da implementação — leitura, remap e materialização

Executar em sequência: D1 leitor interno verificado por partes/ranges; D2 remap
incremental de alvos/valores e medição da saída; D3 materialização nativa limitada,
inventário/rollback/retomada e roundtrip real. Nenhum deles isolado conclui D.

D1 reutiliza o framing canônico de partes JSON de 64 KiB. O tamanho do metadata
varia somente pelos dígitos de part; posição de uma parte pode ser calculada
pelo tamanho canônico e soma dos dígitos, sem varrer as anteriores nem persistir
todos os spans. A cadeia anterior é lida do mesmo arquivo autenticado e o frame
alvo passa pelo decoder existente, conferindo sequência/identidade/tamanho/hash.
Cursor calculado é metadata do host, não prova de arquivo nem autorização.

Extrair a validação de cursor compartilhada em BookBackupContainer e acrescentar
leitura direta de parte fixa, sem alterar formato/limites/erros do leitor atual.
Testar posições em fronteiras de dígitos, Unicode, último bloco, cursor/tamanho/
identidade/hash inválidos, abort e custo de I/O constante por parte.

No servidor, openIndexedLore aceita somente ponteiro lore C2 original,
imutável e vinculado ao recibo da validação. Retorna metadata/identidade da
origem e readRange/readField por até 64 KiB. Intervalos dentro do item/dado/campo
são conferidos; ausência não vira texto vazio nem fallback. Ponteiro nativo
inválido não usa leitor integral. Itens antigos sem esse ponteiro mantêm a API
compatível; integração D2/D3 decide esse caminho explicitamente.

Cada unidade abre observações próprias de source/provas e oferece verify(tx),
que revalida job/checkpoint/estado/recibo/ponteiro e chunks antes da escrita do
consumidor. Não acumular provas da ficha inteira. Metadata de ausência também
tem verify. Nenhuma callable, Rule, namespace ou grant novo.

Arquivos D1: BookBackupContainer e declaração; novo BookRestoreLoreRead;
BookRestoreContentRead e testes puros/serviço/SDK; docs/ADR/AGENTS/evidência.
Aceites: arquivo grande real captura → validação → leitura por ranges com texto
literal, offsets exatos e custo limitado; conta/estado/cancel/recriação de
ponteiro/prova/chunk/recibo e mudança antes do commit recusados; metadata não
certifica byte disponível. Manter o orçamento da API integral pequena sem usá-la
como implementação grande. D2/D3 e demais P1/fases/gates continuam obrigatórios.

## Estado D1 — 2026-10-25

Leitor por partes/ranges/campos implementado com ponteiro C2 original e provas
nativas limitadas por unidade. Ausências, Unicode/escapes e metadata sem corpo
preservados; API integral pequena não foi ampliada. Codec tem seek direto em
fronteiras de dígitos sem spans persistidos ou varredura das partes anteriores.
69 Node, 13 Vitest, três SDK distintos e três Chromium positivos; veja a
[evidência D1](../../../entregas/2026-10-25-writer-v2-leitura-indexada-do-lore-restaurado.md).

D permanece aberto para D2 (remap/medição) e D3 (materialização/retomada/rollback/
roundtrip), inclusive saída maior após remap. P1/fases/gates e validate continuam.

## Contrato D2 antes da implementação — projeção e medição por campo

Acrescentar uma notificação opcional de posição em bytes ao observador do parser
de campos, preservando assinaturas/resultados anteriores. O transformador de
relações usa a gramática portátil existente e retém somente o ID corrente:
bytes de targetEntityId ficam provisórios até fechar a string, inclusive quando
o ID atravessa unidades. Copiar todos os demais bytes literalmente; remapear o
alvo pelo mesmo createBookRestoreRemapper e precedência de ID local qualificado.

Cada avanço consome até 64 KiB e 64 alvos. Retorna um fragmento de até 80 KiB,
pois um ID curto pode crescer e um ID começado na unidade anterior pode terminar
agora. Este fragmento não é uma parte nativa: D3 deve empacotar/atestar sob seu
inventário antes de expor manifesto. Não persistir prosa no checkpoint para
resolver esse encaixe. Sem acumular catálogo/provas ou revarrer o prefixo da ficha.

OpenMappedIndexedLore compõe D1, o transformador e a resolução nativa do índice
original. Campos não relacionais preservam bytes sem remontar objetos. Cada
readField devolve cursor de até 16 KiB com contexto/offset/contagens, sintaxe/ID
parcial e estado SHA privado; summary final mede bytes/hash de saída e relações.
Ausência continua explícita. Cursor é metadata do host e deve estar protegido
pelo journal/recibo nativo D3 ao persistir; não é autorização ou prova acumulada.

A identidade de projeção fixa origem original, destino e ID mapeado. Cada unidade
reconfere D1 e observações locais de resolução antes de retornar e por verify(tx)
antes de escrita. A reabertura por reader novo aceita o cursor da mesma origem/
destino, mas não revalida uma origem recriada. Sem endpoint/Rule/namespace/recurso
remoto novo. API integral e remapeador anteriores conservam comportamento.

Arquivos: BookLoreFieldValidation e declaração; novo transformador puro e helper
de projeção de lore; BookRestoreContentRead; testes puros/serviço/bridge/SDK/
Chromium dirigidos; ADR 0151/planos/registro/arquitetura/testes/AGENTS/evidência.
Aceites: Unicode/escapes/IDs partidos e ordem arbitrária das chaves de relações,
prosa/ausências/duplicados/externos literais, IDs locais qualificados, >8 MiB e
crescimento após remap atravessando 8 MiB, medição/hash exatos, checkpoint sem
corpo/catálogo, <=64 alvos e I/O/provas por unidade, conta/contexto/cancel/ABA/
alteração antes do commit. D3/roundtrip/P1/validate/fases/gates seguem abertos.

## Estado D2 — 2026-10-25

Remap por campo implementado com gramática compartilhada, alvos partidos,
identidade local qualificada, bytes literais e medidas SHA/tamanho exatas.
Cursor limitado com observações/provas por unidade; ausência explícita e nenhum
recurso remoto novo. Saída <=80 KiB é fragmento lógico, não chunk nativo.
255 Node distintos, 13 Vitest, dois SDK e três Chromium positivos; veja a
[evidência D2](../../../entregas/2026-10-25-writer-v2-remap-incremental-do-lore-restaurado.md).

D3 deve empacotar/materializar com procedência/inventário/retomada/rollback e
provar roundtrip, inclusive saída ampliada. Plano 131/P1/fases/gates e validate
permanecem abertos. Cursor D2 precisa de journal/recibo nativo ao persistir.
