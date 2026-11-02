# ADR 0187 — rascunho explícito da aventura

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 165](../tasks/writer-v2/execucao/165-rascunho-explicito-no-backup-de-aventuras.md).

## Decisão

Uma exportação pode receber um rascunho explicitamente escolhido no editor de
cena ou bloco. Somente texto/baseRevision/savedAt e referência ao recurso;
persona/metadata salvas continuam na composição central. Não enumerar browser
storage nem transportar journal, pedido pendente ou conteúdo de outro contexto.

onUnit opcional em streamAdventureCoreData entrega provas já verificadas.
Callback é fixado na chamada, conferido por guard e pode falhar sem produzir
prova central. Host recolhe somente head/body do recurso escolhido, sem mapa
ilimitado. Origem recebida é copiada/validada e ambos os JSONs são relidos por
tokens/hashes autorizados; não basta acreditar no token do cliente.

streamAdventureDraftData fixa texto/intenção antes de await, calcula SHA em
partes UTF-8 de até 64 KiB, com pausa cooperativa por MiB. Preserva texto vazio
como uma parte vazia; seção sem draft contém somente manifesto count zero.
Cabeçalho declara layout utf8-parts, hashes de head/body salvos e metadata local.
IDs seguem endereço de recurso central; nenhum token operacional entra no arquivo.

Revalida origem antes/depois de emitir conteúdo e por verifyAdventureDraftData
antes do futuro selo. Prova draft-data-only permanece parcial. Revisão local
antiga é preservada como informação, sem forçar equivalência à atual. Restauração
futura guarda o draft como versão separada, mantendo texto salvo no manuscrito.

## Validação e limites

13 Vitest novos passaram (140 ms; 2,01 s total). Seleção refinada de revisão
antiga real e regressão central sem observador: dois positivos (136 ms; 1,97 s).
Um Node puro positivo (88,5549 ms total). Tipos/lint e bundle navegador verdes:
24 módulos, 83,95 kB, 20,77 kB gzip, 55 ms.

Inclui cena/adicional, texto vazio, BOM/Unicode acima de MiB, SHA Node independente,
fonte/metadata/intenção mutável, hash forjado, corpo salvo alterado, callback
falho, conta e cancelamento com RPC retido; origem não sofre escrita.

Nenhum endpoint/Rule/UI novo. Draft selecionado não representa todos os journals
locais; interface futura deve explicar a seleção. Montagem final/validador,
transporte/restauração e roundtrip continuam pendentes; P2/P3/D abertas.
