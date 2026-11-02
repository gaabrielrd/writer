# ADR 0099 — Composição privada das gerações de lore

- Estado: aceita para fontes payload v1/v2; inline, adoção e rollout pendentes.
- Data: 2026-10-23.
- Contexto: [plano 84](../tasks/writer-v2/execucao/84-composicao-das-geracoes-de-lore.md),
  sequência das [reservas](0098-private-lore-edit-reservations.md).

## Decisão

A primeira unidade de advanceBookLoreEditCompilation congela os slots da
preparação. Replays antigos continuam confirmáveis; novas reservas são recusadas.
Estado opcional no pai mantém campos, cursores, referências e hashes, sem prosa.
Cada unidade nova reabre a inspeção pronta e a mesma origem autorizada.

A geração v2 preserva a base original e achata os ponteiros de campos herdados.
Slots novos substituem campos e null remove opcionais. Não há cadeia de gerações.
Ausência de createdAt é preservada; updatedAt usa o timestamp servidor da
preparação, ainda sem alterar o livro. A adoção deverá coordenar suas datas e clock.

Relações sem alteração mantêm sua geração e selo originais. Com alteração, cada
página usa slot reservado ou página herdada com contagem compatível. Novas páginas
e caudas diferentes exigem upload. Descritores próprios e journals nascem junto
do recibo do pai; versões de ponteiro v1/v2 são preservadas, sem inventar cutoff.

Cada seleção precisa de vínculo nativo do corpo à geração preparing. Corpo
ainda sem controle é inicializado antes do vínculo; fonte/slot é reaberto no
servidor e ponteiro físico não é aceito no pedido do compositor. Referências
reiniciam a varredura do inventário e corpos já reclamados não são adotados.

Auditoria percorre uma parte por unidade, verifica nascimento, Merkle e SHA
integral. Campos/páginas passam pelo validador de domínio; base exige a inspeção
da mesma origem e SHA atual. Estado de SHA/parser fica em compilationState,
negado ao SDK, com hash e atualização nativa ligados ao recibo original.
É removido no EOF ou cleanup do cancelamento.

Certificado privado ready liga storage v2, metadata de origem e contagem auditada
ao recibo original. Sua abertura exige o objeto nativo do pai na mesma transação
e autorização atual. Não concede conteúdo, não ativa uma cabeça e não comprova
disponibilidade física futura sem os guards de inventário/lease.

Cancelamento fecha a geração, limpa uploads reservados e só então percorre os
descritores próprios. Antes de remover um descritor, verifica livro original,
cabeça atual e prova nativa do segmento/journal/recibo. Cabeça que usa a geração
de relações protege os descritores. Herdados não são removidos; journals e
certificado permanecem históricos. Estado privado de auditoria é descartado.

## Sequência obrigatória

Materialização servidor de fichas inline ainda precisa entrar no mesmo protocolo,
incluindo filhos parcialmente preparados e cancelamento antes da reserva.
O compositor recusa inline antes de mutar; isto é uma fronteira temporária.

Adoção CAS de cabeça/leases/clock/privacidade/recibo, exclusão de livro/lore,
consumidores, backup e cliente continuam obrigatórios. Endpoint/UI/worker e
ativação de restaurações permanecem desabilitados. P1/F2-09/V2 continuam abertos.
