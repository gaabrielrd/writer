# ADR 0173 — narrativa própria da aventura no backup

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Estender leitor/codec 149 com arc, event, milestone, arc-order, event-order,
milestone-order e narrative-link. Narrativa conserva sua prosa inline e ranks
nativos; evento mantém data textual livre. Marco é filho real de arco:
owner/schema/kind e arcId devem corresponder ao caminho autorizado.

Ordens endereçam somente os singletons determinísticos do contrato nativo
sequenceKey. Controle de marcos fica na coleção raiz narrativeControls, mas
depende do arco informado. Controle ausente permanece present false; índices
entity-scenes e controles desconhecidos não entram como autoria. Conteúdo
exportado de ordem é somente rankSlot, sem contador ou revisão derivada.

Link lê source.kind/id/arcId como metadata e confere source próprio autorizado.
Se for marco, confere também arco e backlink. Token liga item/source/arco
nativos; alterações/recriação invalidam continuidade. Alvo da referência pode
estar indisponível: preservar somente endereço neutro, nunca lookup, label,
prosa externa ou grant. Codec exclui sourceKey/sourceArcId/loreKey.

Reusar paginação limitada, fonte transacional, intenção capturada, codec próprio
e faixas/hash da 149. Os novos flags cobrem apenas localização concreta de
controles e prova de source narrativo; nenhum framework de readers injetáveis.

## Limites

Não modifica writer, Rules, runtime, persistência, frontend ou formato de livro.
Não oferece selo global, lore completo, mídia/perfil autorizado, arquivo integral
ou restauração de aventura. Validate completo continua no fechamento do bloco P2.

[Plano 150](../tasks/writer-v2/execucao/150-narrativa-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-narrativa-no-backup-de-aventuras.md).
