# ADR 0174 — pares de lore próprio no backup da aventura

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Usar leitor específico de lore atual, em vez de acrescentar flags de ficha ao
leitor de cenas/narrativa. O contrato nativo vincula metadata e corpo à conta,
ID e nascimento da aventura, com revisões iguais e limite da coleção.

Duas famílias fechadas lore/lore-body percorrem coleções físicas com metadata
N+1 e limite 50. Reutilizar fonte 147 e readAdventureLoreContext withWorld false
na mesma transação: não consultar universo ou autorização de campanha. Lista
não lê nome/aliases/resumo/prosa; para cada item, confira o par metadata/corpo.

Ficha ativa exige corpo existente da mesma identidade/revisão. Tombstone exige
corpo ausente e é estado de remoção, sem texto inventado. Corpo órfão ou sob
tombstone falha. Registro de raiz antiga não é adotado após recriação, mesmo
com sourceToken novo. Tokens ligam fonte/conta/ID/kind e identidades nativas
de ambos os documentos, inclusive ausência do corpo removido.

Read usa projeções e validadores nativos storedMetadata/storedBody para montar
DTO próprio. Head leva nome/aliases/categoria/resumo/datas/privacidade/remoção;
tombstone leva somente remoção/datas; corpo leva prosa/estruturados/relações.
Relações próprias mantêm destino neutro e descrição, sem lookup de alvo global
indisponível. Omitir identidade operacional, revisões/contadores/recibos/chaves.
Marcador externo desconhecido, inclusive null, falha sem fallback.

## Limites

Intenção capturada antes de awaits; cada faixa UTF-8 de até 64 KiB relê par
autorizado e confere hash integral. Memória limitada ao corpo nativo/DTO atual.
Não é selo global e não inclui histórico nem pacote completo. Restauração
futura deve tratar tombstone como removido, nunca ficha ativa.

Sem novo writer, armazenamento, Rule, runtime, endpoint, UI ou dependência.
Validate integral no fechamento de P2.
[Plano 151](../tasks/writer-v2/execucao/151-lore-proprio-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-lore-proprio-no-backup-de-aventuras.md).
