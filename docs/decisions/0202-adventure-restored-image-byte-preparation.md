# ADR 0202 — preparar bytes de imagens por recurso da aventura

Data: 2026-10-28. Estado: implementado internamente; Storage e ativação pendentes.

## Contexto

O arquivo de aventuras guarda um binding por cena/bloco, inclusive ausência,
e um PNG por uso não nulo. O remapeador preserva essa identidade por recurso.
Após instalar personas, faltava consumir essa seção sem carregar o projeto
inteiro, expor mídia incompleta ou perder a prova nativa necessária à limpeza.

## Decisão

advanceAdventureRestoreImages permanece interno. Depois de persona-library-ready,
percorre unidades autenticadas com imageIndex privado independente do itemIndex
histórico. Fases image-bytes/image-bytes-ready conservam todos os campos/recibos
anteriores; lote de personas continua preparing e é revalidado em cada avanço.

Bindings explícitos são copiados para preparedRoot/image-binding-ID. Conferir
imagem com o head da fonte e o head nativo preparado, sua origem/journal e UID.
Assets seguintes devem concordar com o binding imediatamente anterior, mantendo
alt/caption, metadados portáteis e IDs remapeados distintos por recurso.

Cada avanço de asset consome somente um frame raw de até 65.536 bytes. O prefixo
raw fica em preparedRoot/image-state, protegido por journal e operações nativas.
Guardar descritor em image-ID e cada frame em image-bytes-ID-ORDINAL, todos planos
na coleção privada já coberta por inventário e cleanup. Bytes usam arrays
numéricos, evitando a diferença de serialização entre Buffer, Uint8Array e retorno
do SDK. O SDK real confirmou a representação e a identidade dos hashes/journals.

Revalidar fonte, checkpoint, estado e targets na transação que cria
targets/journals/recibo e atualiza o job. Strict create recusa até um frame
idêntico preexistente. Replay é resolvido antes de preparar o conteúdo; conflito,
rollback e repetição automática não duplicam o prefixo. Último frame confere
SHA/comprimento completos pelo leitor raw autenticado. O footer concilia
quantidades/bytes e exige esgotamento das unidades.

A leitura privada de estado comporta até 65.536 bytes de JSON, incluindo textos
com os limites Unicode/escape existentes e checkpoint raw limitado pelo leitor.
O primeiro limite de 16.384 bytes rejeitava legenda válida e foi corrigido sem
alterar o formato ou reduzir os limites de texto.

## Consequências e sequência

Não cria imageLibrary, usos, URL ou Storage; raiz continua sem ownerId e
countReady false. Assinatura e SHA são prova de bytes, não de PNG decodificável.
A próxima etapa deve decodificar integralmente uma imagem limitada a 16 MiB,
reservar intenção antes de I/O e fechar uploads atrasados com fence permanente
antes de apagar as provas de limpeza. Não aceitar mídia com base nesta fase.

O cleanup revoga personas primeiro e segue o protocolo existente de journals.
Cancela também no meio de um PNG; recusa dados sem journal ou com nova identidade
nativa e preserva o documento não comprovado. Não há nova coleção/limite de
writes agregado. O teste nativo cobre usos de cena/bloco da mesma imagem original
e seis frames, não benchmark operacional de 16 MiB por ativo.

Storage, agregados/auditoria/ativação, recuperação cifrada/UI/roundtrip e etapas
seguintes permanecem obrigatórios; image-bytes-ready não conclui P2.
