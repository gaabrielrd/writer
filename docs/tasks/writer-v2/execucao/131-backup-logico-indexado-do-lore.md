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

BookBackupResourceRead ainda serializa snapshot.data de lore. Em stubs, omite
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
