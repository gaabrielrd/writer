# ADR 0167 — metadata de persona nos DTOs do editor

Status: aceita para incremento local; P1 pendente.
Data: 2026-10-25.

## Problema e decisão

Get/list de livro/capítulo montam DTO explicitamente e omitiam personaAvailability.
Rascunho aberto por getChapter perdia a marca antes do produtor portátil, apesar
do suporte nos planos 140/141/143.

Book e Chapter recebem propriedade opcional com o tipo puro compartilhado em
functions/bookPersonaAvailability. Inputs de criação/edição permanecem sem essa
propriedade. Nenhuma feature de domínio passa a depender da portabilidade.

Leitores projetam marca fechada e ligada ao personaId atual usando o validador
existente. No livro, somente profile-not-recorded é válido. No capítulo, preservar
complemento/valores e marca de ausência/overrides antigos. Não consultar biblioteca,
escrever, alterar texto/datas ou mutar snapshot. Dados sem marca mantêm DTO anterior.

Marca antiga de outro vínculo é omitida; metadata malformada/extra/scope inválido
falha. Nenhuma inferência ou autorização é criada. BookDraftInput usa agora a
propriedade do tipo público Chapter, sem interseção duplicada.

SubscribeWritingBindings mantém emissão mínima dos vínculos, sem prosa. Troca
de vínculo não propaga marca antiga no produtor, como antes.

## Evidência e limites

[Plano 144](../tasks/writer-v2/execucao/144-metadata-de-persona-nos-leitores-do-editor.md)
e [evidência](../entregas/2026-10-25-writer-v2-metadata-de-persona-no-editor.md):
DTO real de getChapter chega ao produtor de rascunho vazio e preserva ausência,
sem consultar persona. I/O Firebase foi simulado; não há endpoint/query/Rules
novo ou prova adicional de produção. Inventários gerais, migração/certificação
v1, coleta, rollout e validate de P1 continuam, assim como fases/gates.
