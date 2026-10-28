# ADR 0204 — materializar imagens da aventura com intenção e fence

Data: 2026-10-28. Estado: implementado internamente e validado localmente.

## Contexto

A preparação de 180 conserva frames e bindings por recurso. A retirada de 181
fecha uploads atrasados após uma imagem ativa ser excluída. Ainda era necessário
materializar os PNGs das aventuras sem publicar mídia incompleta ou apagar as
provas antes de fechar uploads que já estavam em trânsito.

## Decisão

Compartilhar a implementação do Storage em restoredImageStorage.mjs e manter
createBookRestoreCoverStorage como alias público histórico. A comparação com
o adaptador anterior confirmou código idêntico, exceto nome da factory.
Contexto sem bookId, path book-covers/UID/imageID.png, metadata/erros/provas e
protocolos anteriores permanecem compatíveis. Não introduzir outra dependência. O fechamento também removeu a dependência
operacional bookRestoreUploadContracts do leitor restoredImageRemoval: o ciclo
com sceneContracts impedia coletar testes de lore. Esse leitor mantém validação
primitiva de IDs/nascimento, com os mesmos limites, sem carregar a orquestração.

advanceAdventureRestoreImageStorage interno alterna reserva de um binding e
materialização de um ativo. Fases image-storage/image-storage-ready mantêm
campos antigos; storageIndex/storageAssetId/storageFenceAfter ficam privados.
Binding nulo não faz I/O. Conferir unidades da fonte, binding/descritor privados
e head nativo com seus journals antes de reservar intenção em
preparedRoot/image-storage-ID. Intenção/journal/checkpoint/recibo confirmam juntos,
sempre antes do primeiro stage.

Ler os frames privados um por vez, validando arrays, identidade e SHA. Usar um
buffer de imagem até 16 MiB, sem concatenar todas as imagens ou reter arrays
numéricos nas closures de prova. Conferir SHA integral e PNG completo por Sharp
metadata e stats, com as mesmas opções existentes das capas; não recomprimir.
PNG truncado pode ter metadata válida e ainda falhar na decodificação completa.

Revalidar fonte, intenção e observações nativas antes do I/O e antes de confirmar
o resultado. Replay precede leitura de bytes e Storage. Resposta perdida ou rollback
retoma a mesma geração privada. Lote de personas continua preparing, raiz sem
ownerId/countReady e biblioteca de imagens ausente.

No cancelamento, revogar personas primeiro. Antes do cleanup anterior, percorrer
intencões por kind e nome, limit 1 e cursor privado, sem filtro composto de estado
ou índice novo. Criar um fence permanente por intenção, inclusive upload reservado
sem ACK. Somente depois de confirmar quantidade igual a storageIntents deixar
apagar fonte/frames/descritores. O fence e a atualização de journal/job/recibo são
retomáveis; falha externa conserva provas. Marcadores Storage nunca são removidos.

Journals de intenções atualizados no cleanup preservam o criador e vinculam o
último recibo advanceAdventureRestoreCleanup. Targets recriados/corrompidos e
objetos Storage estrangeiros não são adotados ou apagados como originais.
O cancelamento pode completar enquanto um pedido anterior ainda segura os bytes:
o marcador create-only já impede sua recriação.

## Consequências e limites

PNG de 16 MiB/256 frames foi exercitado pela cadeia de validação, preparação,
materialização e cancelamento. Cada upload trata um ativo; não há transação final
que grave todos os ativos. Provas de frames são metadados, não cópias de seus arrays.

SDKs reais de Firestore e GCS foram usados juntos contra serviços demo HTTP locais:
reservas/provas nativas, rollback de ACK, geração estável, fence com resposta
perdida e limpeza integral. Não é teste em bucket de produção.

Não há callable, UI, novo acesso, URL ou aceitação de mídia nesta etapa.
Biblioteca/usos serão criados com a ativação auditada; a aceitação/URL posterior
deverá respeitar mídia retirada/trocada e não religar bindings históricos.
Continuam agregados/auditoria/ativação, recuperação cifrada/UI/roundtrip,
P3/D/F2-09, fases seguintes e gates humanos/comerciais.
