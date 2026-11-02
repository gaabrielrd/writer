# ADR 0183 — bytes limitados das unidades de aventura

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 161](../tasks/writer-v2/execucao/161-leitura-limitada-das-unidades-de-aventuras.md).

## Decisão

readAdventureBackupUnit, na interface pública de adventure-portability, captura
fonte/escopo/item/método do port/guard/signal na chamada, antes do primeiro next.
Mapeia somente os read JSON existentes de estrutura/recursos/lore/persona/história.
DTOs e pedidos são fechados; whitelist de recursos usa propriedades próprias
do registro, recusando chaves herdadas. Ausência opcional é preservada;
persona null não inventa perfil nem chama o servidor.

Cada parte exige fonte/ID/token/escopo/ancestral, presença quando aplicável,
ordinal de transporte, bytes/count/hash estáveis e base64 canônico. SHA-256
incremental verifica todos os bytes sem corpo/projeto completo em RAM. Buffers
são de até 64 KiB; não há cap autoral de unidade ou truncamento silencioso.
Quantidade de partes respeita uint32 do envelope e contagens numéricas seguras.

Partes são provisórias; somente término natural devolve unit-bytes-only com
manifesto e identidade congelados. Última parte só é emitida após hash integral
coincidir. Prova de bytes JSON não valida DTO autoral nem histórico textual,
PNG, origem comercial, acesso futuro ou arquivo completo.

## Ciclo de vida

Guard deve lançar erro quando conta/contexto não for atual. Guard e sinais são
conferidos antes/depois de RPC e yield. Backpressure só pede próxima parte quando
o consumidor avança. O manifesto retido não guarda chunkBase64 ou prosa.

return sinaliza fechamento e resolve imediatamente, mesmo com RPC pendente;
conclusão interna e next pendente são observados. Resposta tardia não é emitida,
não pede outra parte e não devolve prova. Não depende de abortar o callable
remotamente. Erro explícito do consumidor propaga e encerra o hasher.

## Validação e consequência

24 casos de produtores/readers reais e adversariais passaram, seguidos de seleção
de whitelist e compatibilidade nativa. Tipos/lint/bundle isolado do navegador
positivos. Não mudam writers, Rules, endpoints, storage ou dependências.
Validate integral volta no fechamento do grande bloco de captura.

Montador ainda precisa compor todas as seções, certificar ordinais/bytes/hash do
texto histórico, mídias/Storage e segunda passagem, antes de footer autoral.
UI, restauração e P2/P3/D permanecem abertas.
