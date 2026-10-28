# Writer V2 — preparação privada de imagens das aventuras

Data: 2026-10-28. Base: 0fd3a54.
[Plano 180](../tasks/writer-v2/execucao/180-preparacao-privada-das-imagens-de-aventuras.md)
e [ADR 0202](../decisions/0202-adventure-restored-image-byte-preparation.md).

## Implementado

A restauração interna prepara os vínculos de todas as cenas e blocos, inclusive
imagem ausente, e conserva descritores e bytes exatos com identidades por recurso.
Não deduplica duas referências à mesma imagem original. Um avanço lê no máximo
um frame de 65.536 bytes; cursor/prefixo ficam privados, com prova da fonte e dos
documentos preparados, atualizados junto dos journals, checkpoint e recibo.

O footer concilia quantidades/bytes e exige fim do inventário autenticado.
Cancelamento no meio de um PNG usa o cleanup existente, após revogar personas.
Frames preexistentes ou recriados não são adotados nem apagados sem sua prova.
Não há nova dependência, endpoint, coleção ou alteração das Rules.

## Testes observados

Quinze Node novos distintos positivos em seleções e, após a correção Unicode,
também juntos na versão final formatada: 15/15 em 7.901,092 ms. Cobrem bytes exatos/
múltiplos frames, ausência/aventura vazia, replay/CAS/rollback/retry, cancelamento
concorrente/parcial, origem/binding/estado alterados, head/journal recriados,
metadados fechados, outra conta e frame idêntico preexistente.

47 Node de regressão de histórico, universo e biblioteca de personas positivos
em 7.892,792 ms. Um Vitest novo com arquivo realmente gerado por streamAdventureArchive
passou em 3,39 s totais/1,16 s de testes: três vínculos (um nulo), dois ativos
distintos provenientes da mesma imagem original, seis frames de bytes exatos,
preservação dos documentos da aventura e limpeza integral.

Um teste SDK Firestore real positivo em 134.393,509 ms, no demo local 1.22.0.
Comprova replay concorrente, rollback antes do job update, prefixo de 65.536 bytes,
arrays numéricos reais, nascimento conjunto de frame/journal/recibo, Rules
bloqueando leitura/escrita direta, ausência de biblioteca e cancelamento completo.
JVM dedicada encerrada no finally e ausência do processo reconferida.

A primeira seleção Node falhou porque faltava registrar a nova ação nos validadores
de recibos. Essa omissão foi corrigida; falhas auxiliares de referência no teste
foram corrigidas antes da seleção positiva. Um caso Unicode mostrou que o limite
interno de estado inicial era insuficiente; após ampliá-lo para comportar o
contrato existente, o mesmo caso passou. Nenhum teste/limite de cobertura relaxado.

## Checks e limites

Formatação, ESLint/sintaxe dos arquivos alterados, docs/arquitetura/styleguide e
diff verificados localmente. Revisão final sem bloqueadores: identidades e
namespaces limitados ao job/UID, provas revalidadas no commit, fonte imutável
e limpeza comprovada. Nenhum dado da UI ou biblioteca foi alterado. Commit somente local com hooks normais; sem CI/push/PR/merge/deploy/agentes.

A suíte integral não foi repetida neste incremento: será executada no fechamento
do bloco de mídia, conforme orientação do operador. O validate verde de 179 é
baseline anterior, não evidência integral deste novo código.

Ainda falta Storage com reserva/decodificação/fence, biblioteca/usos/URLs e
ativação auditada. PNGs de assinatura válida ainda dependem da decodificação
integral seguinte. Não houve benchmark operacional de imagem de 16 MiB. P2,
agregados/audit/ativação, recuperação cifrada/UI/roundtrip, P3/D/F2-09, fases
seguintes, gates humanos/comerciais e macro 8/35 permanecem abertos/inalterados.
