# P1 / M38c10 — Lore lógico nas referências de cenas e planejamento

## Objetivo e constatações

Integrar os consumidores scenes e narrativePlanning da etapa 4 do
[plano 80](80-consumidores-do-lore-completo.md). Cabeças segmentadas não guardam
nome/categoria. Scenes aceita qualquer cabeça local existente, inclusive
indisponível. NarrativePlanning resolve labels diretamente e usa loreVersion
de aventura também em livros. Datas em milissegundos não detectam toda recriação.

## Requisitos e suposições

Preservar vínculos tipados por ID, índices, recibos, contadores, autorização de
universos/aventuras e remoção explícita de origem já indisponível. Não tornar
referências snapshots de texto ou gravar nomes na relação. Mesma conta continua
sendo dona do livro, mas deve reautorizar livro/cabeça/tombstone/prova de criação
na transação de cada operação. Tokens não substituem essa autorização.

Disponibilidade depende da origem nativa, não do tamanho do nome/detalhes.
Inserir vínculo ou consultar índice inverso não deve baixar chunks de prosa.
Abrir origem C1 pode conferir header de base, sem certificar bytes não consumidos.
Inline continua limitado ao documento Firestore existente.

Labels precisam de nome/categoria lógicos completos, sem truncamento silencioso,
e sem baixar campos/relações v2 não pedidos. Base v1 é certificada em fluxo.
Budget explícito por resposta (32 MiB/512 partes/900000 bytes lógicos), sem teto
de autoria ou número total de fichas. Erro de integridade/complexidade interrompe
a resposta inteira; ausência/revogação conhecida gera indisponibilidade sem nome.
Não converter erro de infraestrutura em uma ficha indisponível.

## Sequência e arquivos

1. Novo bookLoreReferenceRead reutiliza readLoreBook, openBookLoreRecord e
   createBookLoreContextReader: fábrica privada por transação, origem sem chunks,
   label seletivo autorizado, tokens nativos e orçamento explícito. Sem RPC/Rule.
2. Scenes usa origem na criação de referência e label na listagem, com budget
   compartilhado pela página e envelope de resposta conferido.
3. NarrativePlanning usa origem nos vínculos/índices inversos e label em listas;
   opções paginadas por ID mapeiam labels de forma assíncrona. Cursors book
   incluem relógio local correto/listToken e token exato de origem nativa nas
   consultas inversas, preservando os demais observados e contexto.
4. Testes Node/SDK: inline/v1/v2/criação real, >8MiB/128 partes, campos grandes
   não pedidos, nomes literais/sem fallback, fichas removidas/tombstone/alheias/
   recriadas, falhas e rollback. Disponibilidade/inserção sem chunks; remoção
   após revogação; paginação e mudança submilissegundo/clock sem misturar origens.
5. Regressões dirigidas scenes/narrativePlanning/aventuras/referências; lint,
   sintaxe, docs/arquitetura/formato/diff. ADR/AGENTS/evidência e commit local.

## Não escopo, riscos e conclusão

Sem UI/DTO de entrada/dependência/Rule/publicação/captura de campanha nova.
Cursor permanece opaco; cursores antigos podem exigir reinício após a inclusão
da prova nativa, sem migrar um cursor para outra origem. Base v1 tem custo de I/O
integral apenas para labels. Não usar limite de contexto para negar um vínculo
que só depende de autorização. Relógios/datas do stub não são corpo lógico.

Este incremento não encerra etapa 4 inteira, P1/F2-09/V2. Publicação/capturas,
demais contextos, inventário dos namespaces/escritores/exclusão, backup/restauração,
drain/rollout/validate de P1, fases 3–5 e gates humanos/comerciais permanecem.
Validate integral somente no fechamento de P1; commits locais, sem CI/push/PR/
merge/deploy e sem subagentes.

## Conclusão local — 2026-10-25

Origem/labels integrados a scenes/narrativePlanning, com budget por página,
cursores C1/clock correto e disponibilidade sem chunks. 60/60 Node distintos
(22 novos/38 regressões), oito SDK em três execuções dirigidas, lint/sintaxe/
formato/docs/arquitetura/diff positivos. [ADR 0149](../../../decisions/0149-native-book-lore-references.md)
e [evidência](../../../entregas/2026-10-25-writer-v2-lore-nativo-nas-referencias.md).
Plano concluído localmente; P1/etapa 4/F2-09/V2 e os demais consumidores/gates
permanecem abertos. Próximo foco: publicação/capturas e inventário dos leitores.
