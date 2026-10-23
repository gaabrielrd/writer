# ADR 0089 — Produção privada e paginada de lore grande

- Status: aceito para novos lores e cancelamento privado
- Data: 2026-10-23
- Plano: [M38b](../tasks/writer-v2/execucao/78-producao-privada-de-lore-grande.md)

## Problema e representação

O JSON válido de um lore pode ultrapassar o documento nativo em dados gerais ou
no conjunto de relações. Remapear milhares de referências e verificar todos os
IDs numa única transação também não é uma unidade limitada.

Preservar a representação inline quando seu limite superior conservador fica
abaixo de 512 KiB: tamanho JSON original + 72 bytes por relação + 1024 bytes de
margem para metadados. O número 72 cobre o tamanho completo de um ID remapeado;
não é um limite de relações. Uma seleção conservadora só muda a representação.

Para os candidatos grandes, dados gerais usam um payload JSON. Relações usam
payloads de até 64 entradas remapeadas por vez. Não acumular a lista inteira ou
um vetor de ponteiros no progresso/documento. Preservar ausente versus vazio,
aliases repetidos, texto/ordem e referências externas não remapeadas.

## Emenda física da ADR 0088

Antes de qualquer produtor de payloads de usuário, trocar chunks aninhados por
coleção plana bookResourceChunks com ID BODY:INDEX. Cabeçalhos permanecem em
bookResourceBodies; ponteiros de páginas ficam em bookLoreSegments. Helpers
centralizam os caminhos. Codec, manifest e prova binária não mudam.

A emenda permite consultas limitadas que detectam também partes sem cabeçalho.
Nenhuma migração de dados de produção é necessária: M38a só tinha harnesses
locais, sem chamador de produto. Os testes do codec passaram a usar os caminhos
planos. A ADR 0088 conserva o registro histórico do contrato inicial.

## Inventário e protocolo

payloadInventoryVersion 1 amplia o job independentemente das versões de fases
6–14. Lore é preparado antes de histórico/capa/personas; não declarar essas
fases existentes para alcançar um número de inventário maior. A capacidade
exige preparação a partir de v2 com lorePayload explícito, ativo ou null.
Antes de habilitar, conferir vazios os três namespaces e seus journals.

lorePayload fechado fixa entidade, geração/operação inicial, base, páginas,
recibo de fechamento e segmento em andamento. O segmento fixa operação,
manifest, nextPart e sealed. Em cada chamada:

1. Conferir fonte validada, estado e CAS; remapear no máximo uma página de relações.
2. Gravar até 16 partes, com journals/recibo/job no mesmo commit.
3. Conferir procedência nativa de todas as partes desse segmento e criar o cabeçalho.
4. Reconferir partes/cabeçalho e registrar ponteiro com birth nativo.
5. Ao terminar todos os segmentos, criar o stub do lore e incrementar loreCount.

O limite de partes de cada transação não limita o tamanho do payload nem o
número total de relações. Hash e operação fixados impedem misturar tentativas.
Um clone de cursor por callback conserva rollback/retry/CAS/replay.

O stub contém bookId, datas e payloadStorage. Não contém uma versão truncada
dos campos nem uma lista parcial de relações. payloadStorage fixa geração,
base, presença/count/pages e sealBirth obtido do último recibo imutável. Esse
recibo deve registrar exatamente o progresso que está sendo finalizado.
Leitores futuros devem conferir segmentos imutáveis anteriores ao fechamento,
além do nascimento exato dos corpos. Stub não é um LoreEntity pronto para UI.

## Reconciliação e limpeza

A reconciliação lê base e depois uma página de relações por chamada, mantendo
counts.lorePayloadOffset até esgotar o item. Confere conteúdo lógico contra a
mesma fonte remapeada, contagem/presença e as provas nativas. Só então avança o
item. Campo opcional conserva recibos antigos; regras de monotonia recusam
retorno do cursor dentro do mesmo item.

A autenticidade dos artefatos aceita leitura de metadata nativa sem transferir
bytes quando só é necessária a prova de nascimento/recibo. Não usar esse modo
como se ele devolvesse conteúdo lógico.

Cancelamento em body-artifacts drena segmentos, partes e corpos por consultas
planas limitadas, com journal e recibos de cada alvo. Inclui partes anteriores ao
cabeçalho. Journals órfãos, alvos ausentes ou recriados bloqueiam; preservar a
encarnação alheia. A certificação final exige namespaces/journals vazios e
cleanedArtifacts igual a artifactCount. Nenhum lote atual de personas é apagado.

## Compatibilidade, rollout e pendências

Jobs anteriores continuam legíveis e canceláveis. Um prefixo inline de relações
já iniciado e cujo lore agora requer payload recebe erro explícito de migração,
preservando prefixo, recibos e contadores. A migração desses jobs está pendente
no [plano seguinte](../tasks/writer-v2/execucao/79-migracao-dos-prefixos-de-lore.md);
não declarar compatibilidade integral de avanço antes disso.

Implantar parsers/capacidade/cleanup novos e drenar handlers antigos antes de
habilitar o produtor. Sem deploy nesta entrega. Novas gravações continuam
somente nos jobs privados: raiz ausente, countReady false e nenhuma ativação.

M38c deve integrar leitores/assinaturas/edição/exclusão/backup e exclusão do livro
ativo. Demais campos grandes, saída portátil ampliada, certificação integral,
capa/biblioteca, ativação, limpeza posterior e host/UI/roundtrip/validate seguem
P1/F2-09. Uma reconciliação positiva não substitui a certificação integral final.
