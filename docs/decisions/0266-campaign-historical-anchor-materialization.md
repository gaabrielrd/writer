# ADR 0266 — Bases históricas das variantes restauradas

- Data: 2026-10-29.
- Estado: aceita para preparação privada.
- Referência: [plano 236](../tasks/writer-v2/execucao/236-materializacao-das-ancoras-historicas.md).

## Contexto

Variantes já usam novos corpos e IDs de âncora, mas fichas legadas podem
depender de uma base que deixou de ser ativa. Reutilizar a base atual ou
recapturar a aventura perderia a edição histórica e sua procedência.
O cancelamento precisa localizar bases iniciadas mesmo após retirar a chave.

## Decisão

Materializar uma base por anchorKey histórico, com restoredAnchorBaseId do
incremento 235. Cada base contém a ficha e corpos próprios. Snapshot, universo,
capturedAt e sourceEvidence vêm do w:anchor e DTO arquivados; não são copiados
da base ativa. Corpos são reconstruídos por frames com o codec de campos
existente, preservando bytes/hash/UTF-8 e convertendo chunkCount legado.
Manifestos usam bodySourceKey da própria ficha no novo destino.

Reutilizar base ativa somente quando o mapeamento previamente aprovado pela
variante coincidir e o item estiver presente. Confirmar o overlay escrito
através do journal nativo de variantes; não reviver variantes omitidas.
Consulta de journals é limitada a seis, recusando mais de cinco: o codec de
900.000 bytes produz até 14 chunks em cinco lotes. Nenhum corpo é lido nessa
conferência. Guard de base ativa e origem histórica precede I/O e se repete
na escrita. O digest persistido vincula arquivo/edição/testemunhas/mapeamento,
sem timestamps correntes de acesso. Cada chamada ainda verifica acesso atual,
e compara a prova corrente estrita antes e depois de I/O na escrita. Isso
permite retomar após revogar/devolver permissão à mesma origem, sem herdar
autorização quando a origem é recriada. Falha após iniciar interrompe
o avanço, mantendo possível o cancelamento sem permissão da origem.

Adicionar anchorSlots/ORDINAL ao job, com schema/dono/restauração/encarnação/
operação, anchorKey/sourceKey/linha e authorizationHash. Slot nasce junto do
recibo de registro e antes de qualquer filho, após vazio do destino. Não é
grant de leitura. anchorWrites registra alvos com binding fechado ao slot,
mesmo nascimento do recibo e hash de metadata. Root é derivado no servidor.

O journal compartilhado recebe binding na resolução do destino e expõe
conferência de vazio por binding. Formatos e comportamento de próprios/base/
variantes permanecem. O wrapper de âncoras valida slots e cuida da coleta de
múltiplos pais, sem chamar a coleta genérica de raiz fixa.

anchorMaterialization opcional cifra até 8 KiB no job, com cursores, contagens,
um item pendente e hash incremental, sem texto crescente. Até 25 linhas de
metadata por chamada; no máximo um DTO/frame e até dois corpos por frame
legado. Item nasce após campos; pai nasce após item, em preparing. Auditoria
registrada processa um journal por chamada, revalidando slot e origem.

Cancelar retira cifra/chave atomicamente. Coletar variante/geração, depois
anchorWrites/corpos/itens/pais, depois slots, base ativa, próprios e índices/
chunks. Antes de retirar pai, filhos restantes precisam estar no mesmo lote.
Só remover slots após vazio físico de cada destino, incluindo imagens/links/
ledger para recusar órfãos. Coleta usa metadata/birth, sem prosa ou grant.
Slots/journals alterados/recriados/estrangeiros são preservados sem avanço.

## Consequências e limites

A prova campaign-anchors-materialized-only não é certificado de ativação
nem acesso corrente por recurso. Novas bases e geração continuam preparing,
campanha pending. Controle/ponte ativa, mídia/binários/pins, vínculo ao universo
organizacional autorizado, C4 dos temporários, auditoria física e ativação/
aposentadoria dos journals e Estúdio/ciclos permanecem obrigatórios.
Layouts C4 1–4 intactos. Ausência dos campos novos preserva jobs anteriores.

Leitores ordinários podem ser exercitados com liberação exclusiva de fixture.
Nenhum caminho de produção equivalente é criado neste incremento.
