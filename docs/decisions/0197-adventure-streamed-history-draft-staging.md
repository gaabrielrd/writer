# ADR 0197 — Histórico e texto do rascunho por etapas

Data: 2026-10-27. Status: aceita para incremento interno.
Base: [ADR 0196](0196-adventure-private-lore-persona-staging.md) e
[plano 175](../tasks/writer-v2/execucao/175-historico-e-texto-do-rascunho-de-aventuras.md).

## Decisão

advanceAdventureRestoreHistory continua após profiles-ready, com fases history/
history-ready e contagens de versões/bytes/partes/draft/frames. O itemIndex avança
por unidades JSON; permanece no descritor raw enquanto seus frames são consumidos.
Metadata e views são fechadas, compatíveis com os recibos de etapas anteriores.
O cliente não fornece checkpoint, prefixo ou override de fase.

Na passagem por universe, conservar a origem validada como universe-candidate
privada, com pendingAuthorization true. Isso não lê/copia universo nem confirma
religação. A autorização atual da origem permanece gate obrigatório da ativação.

## Texto e provas

História portátil usa bytes fixos de 64 KiB, que podem dividir um caractere.
Rebloquear em partes nativas UTF-8 completas de até 64 KiB. Cada avanço consome
um frame autenticado e pode emitir até duas partes; sobra menor que uma parte
fica em text-state privado, limitado a 100.000 bytes serializados incluindo
header/checkpoint. Vazios usam uma parte explícita; BOM e Unicode são preservados.
Sem juntar a versão inteira num documento nem reduzir limites globais.

O estado contém versão/unidade/origem, header, checkpoint raw, contagem/bytes
escritos e buffer base64. É provado pelo journal, hash e versão nativa antes de
ser entregue ao leitor raw; a transação consumidora reconfere estado e provas
do frame/fonte. Targets, estado, checkpoint e recibo são atômicos. Escrita
idêntica continua preservando sua versão/journal, conforme ADR 0196.

workVersionBodies usa o endereço nativo derivado de versionId/index. Uma versão
histórica recebe workVersions apenas após SHA/UTF-8 integral, com recurso/ID
remapeados, motivo/data/label/hash/wordCount fonte e chunkCount recalculado.
historyRevision da definição privada acompanha versões montadas. Histórico de
recurso ausente não cria cena/bloco autoral.

A prova do prefixo confirma as escritas por etapa; não substitui a auditoria
posterior de todos os targets e hashes antes de ativar. Mutação administrativa
externa não faz parte de um snapshot atômico de toda a montagem.

## Rascunho e continuação

O draft confirma hashes dos cabeçalhos/corpo da origem capturada e o corpo nativo
salvo, sem escrever nele. Seu texto usa ID exclusivo de versão recuperada, com
descriptor recovered-draft privado: origem, baseRevision, savedAt, hash/bytes e
partes. Draft vazio também é preservado. Não usar metadado de draft de livro.

O descriptor fica pending-finalization. A próxima finalização deve calcular a
contagem exata com a semântica de HTML/Markdown e criar o manifesto da versão;
não somar contagens independentes por parte nem inventar wordCount zero.
history-ready não significa que essa versão ou o projeto já estejam disponíveis.

## Limpeza e limites

Endereços fechados incluem workVersions/workVersionBodies e os três registros
privados novos. Cleanup remove targets/journals comprovados e exige preparedRoot
vazio; prefixo/target/journal alterado, ausente, recriado ou estrangeiro impede
certificação, preservando conteúdo alheio. Reserva aposentada permanece.

Sem endpoint, nova permissão, biblioteca ou ativação. Finalização do draft,
autorização de universo, integração de personas, imagens, agregados/audit,
recuperação cifrada/UI e roundtrip seguem obrigatórios. P2/P3/D/F2-09 e gates
humanos/comerciais permanecem abertos.
