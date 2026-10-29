# Inventário da portabilidade privada de campanhas

Snapshot local: 2026-10-29, incremento 235. P3/D/F2-09 continuam abertos.
Este inventário distingue dados já persistidos dos recursos futuros.
Referências: [plano P3](execucao/201-portabilidade-privada-de-campanhas.md),
[plano 226](execucao/226-inventario-c4-das-campanhas-restauradas.md) e
[ADR 0256](../../decisions/0256-campaign-versioned-deletion-inventory.md).

## Material persistido e coleta atual

| Família                              | Endereço privado                                                                                        | Coleta e preservação                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Raiz da mesa                         | campaigns/CID                                                                                           | Guarda de dono/nascimento/reserva; retira raiz somente após certificado das fases                    |
| Bases completas, retidas ou parciais | users/UID/campaignBases/BASE                                                                            | Consulta seletiva por campaignId; pais registrados até coletar filhos                                |
| Corpo/estrutura da base              | BASE/images, bodies, links, loreReferences, items                                                       | Metadata limitada; sourceEvidence e marcadores portáteis são apagados com seus documentos            |
| Gerações de variantes                | campaigns/CID/loreGenerations/GEN                                                                       | Todas as gerações, incluindo antigas/inativas; loreVariants e loreVariantBodies antes do pai         |
| Variantes legadas                    | campaigns/CID/loreVariants e loreVariantBodies                                                          | Corpo e metadata, incluindo codec; não seguir apenas o binding atual                                 |
| C1 e preparação geral                | notes, noteState, workChecklist, workProgress                                                           | Texto próprio e controles da mesa; sem retirar clock global da conta                                 |
| S1                                   | sessions, sessionState                                                                                  | Incluídas desde cleanup v2                                                                           |
| S2                                   | sessionReferences, sessionReferenceState                                                                | Incluídas desde cleanup v3; referência não concede acesso à fonte                                    |
| S3                                   | preparationItems, preparationBodies, preparationState, sessionPreparationLinks, sessionPreparationState | Incluídas desde cleanup v4                                                                           |
| Recovery C2                          | campaignVariantOperations, campaignVariantResolutionOperations                                          | Sanitização seletiva por campanha, inclusive filtro nested antigo; conserva somente whitelist mínima |
| Recovery de início C3A               | campaignComparisonStartFences                                                                           | Sanitização pelo filtro request.campaignId                                                           |
| Recovery S1                          | campaignSessionOperations                                                                               | Desde cleanup v2                                                                                     |
| Recovery S2                          | campaignSessionReferenceOperations, campaignSessionReferenceFences                                      | Desde cleanup v3                                                                                     |
| Recovery S3                          | campaignPreparationOperations, campaignPreparationFences                                                | Desde cleanup v4                                                                                     |
| B/C3                                 | campaignPreparations, campaignComparisons, campaignAdoptions, campaignAdoptionGuards                    | Sanitização; decisions são retiradas antes de terminalizar adoção; recibos mínimos por adoptionId    |
| Retomada                             | users/UID/workActivity/CHAVE                                                                            | Remove somente a linha determinística da campanha e avança revisão se existente                      |
| C4                                   | reserva global, job/operations/startFences do UID                                                       | Terminais mínimos impedem replay/reuso; sem prosa, chaves, relações ou contexto                      |

Os caminhos BASE acima são relativos ao documento da base. Coleções de
recovery/B/C3 ficam sob users/UID. Coleções C1/S1/S2/S3 ficam sob campaigns/CID.
Imagem pronta exige pin derivado e contador coerente; pendente não pode ter
uso inesperado. Arquivo da biblioteca e pins da aventura/outra mesa permanecem.

## Versões de cleanup

| Versão                         | Recovery | Controls | Filhos da campanha | Base | Geração |
| ------------------------------ | -------: | -------: | -----------------: | ---: | ------: |
| 1, incluindo ausência de campo |        3 |        4 |                  7 |    5 |       2 |
| 2                              |        4 |        4 |                  9 |    5 |       2 |
| 3                              |        6 |        4 |                 11 |    5 |       2 |
| 4, emitida atualmente          |        8 |        4 |                 16 |    5 |       2 |

Quantidades são limites do inventário/checkpoint, sem estimar documentos.
A ordem exata e masks estão em functions/src/campaignDeletionInventory.mjs,
compartilhados por validação e execução. Não inserir famílias em versão antiga.
Recibos/certificados existentes e DTOs/fases públicas permanecem compatíveis.

## Portabilidade preparada

Arquivo assinado possui próprios, base congelada, variantes/âncoras, imagens
e provas por recurso. Leitura/revisão não concede grant nem ativa cópia.
Consumidores ordinários e reexportação exigem autorização atual da mesma
origem/nascimento. Relações sem descritores permanecem não resolvidas.
Os leitores e codecs internos 219–225 foram implementados; os dados privados
de restauração usados nos testes são materializados por fixtures de servidor,
não por um fluxo de importação disponível ao usuário.

## Recursos que ainda não existem

Os incrementos 227–232 implementam upload, integridade, revisão própria/
derivada e revisão de origens duráveis, com coleta pré-ativação, conforme abaixo.
O incremento 233 acrescenta materialização própria e sua coleta, conforme abaixo.
O incremento 234 acrescenta a base arquivada e sua coleta. Variantes/âncoras,
mídia exclusiva temporária e ativação ainda não têm produtor. Não são cobertos por inferência pelas listas C4
atuais. Cada recurso precisa de dono/campanha/encarnação consultáveis, reserva
conferida em mutações e cancelamento/coleta versionados antes da primeira gravação.

A interface deverá revisar omissões, autorização e relações não resolvidas
antes de confirmar nova cópia. Ainda faltam Estúdio, ciclos completos e
validação integrada da restauração real. Macro 8/35 permanece.

## Evidência local do bloco

Validate integral 219–226 positivo: 9.710 testes (4.978 frontend, 94 scripts,
4.638 Functions), cobertura/limites preservados e sintaxe/lint/typecheck/build/
smoke positivos. A [entrega](../../entregas/2026-10-29-writer-v2-inventario-c4-das-campanhas-restauradas.md)
registra resultados, limites e o escopo que ainda não tem produtor persistente.

## Upload temporário pré-ativação — 227

| Família nova          | Endereço                                                   | Ciclo fechado                                                                     |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Job                   | users/UID/campaignRestores/RID                             | Identidade nativa, SHA/CAS, estado fechado; terminal sem payload/chave            |
| Chunks cifrados       | JOB/chunks/ÍNDICE                                          | Append até 64 KiB; coleta por metadata/recibo até 25, com sequência e vazio final |
| Recibos e testemunhas | users/UID/campaignRestoreOperations/OID e JOB/receipts/OID | Imutáveis, hashes/IDs/checkpoints, sem payload ou segredo; retidos no terminal    |
| Chave privada         | users/UID/campaignRestoreKeys/RID                          | Nascimento inicial; retirada atômica no cancelamento, antes da coleta             |
| Fence desconhecido    | users/UID/campaignRestoreStartFences/RID                   | Vence start tardio; metadata mínima permanente                                    |
| Reserva e marcador    | campaignRestoreReservations/CID e campaigns/CID            | Alvo derivado servidor; pending/retired sem ownerId, invisível e sem grant        |

Rules negam SDK. Originais/mesas não são criados por esse núcleo interno. A
barreira C4 é consultada nas mutações ativas, mas o marcador sem ownerId não
aceita início C4 como campanha ativa. A coleta temporária v1 é própria; integrar
nova versão C4 para estes recursos antes da ativação futura, preservando 1–4.
[ADR 0257](../../decisions/0257-campaign-private-resumable-upload.md) e
[evidência](../../entregas/2026-10-29-writer-v2-upload-privado-retomavel-de-campanhas.md).

## Checkpoint de integridade no job — incremento 228

fileReview opcional guarda estado cifrado e metadata limitada dentro do job,
sem coleção nova. Jobs antigos sem o campo permanecem válidos. Cancelamento
limpa o estado do campo e remove a chave atomicamente, sem decifrar o estado; a coleta v1 dos
chunks continua igual. Recibos/testemunhas não guardam ciphertext nem conteúdo.
Prova interna vale somente integridade e revalida chave emissora atual.
Neste incremento ainda faltavam índices semânticos duráveis; o próprio foi
acrescentado em 229, abaixo. C4 dos jobs antes de ativação continua obrigatório, sem inserir
famílias nos layouts antigos. Veja [plano 228](execucao/228-integridade-de-campanhas-com-checkpoint.md)
e [ADR 0258](../../decisions/0258-campaign-resumable-file-integrity.md).

## Índice e revisão própria — incremento 229

Nova família JOB/reviewRows/ORDINAL, schema 1/kind own: metadata cifrada e
identityHash, ordinal contíguo e prova nativa no recibo/testemunha. OwnReview
cifrado permanece no job; reviewIndex schema 1 guarda rows/cleanedRows.
Cancel limpa estados/chave; coleta até 25 linhas por nome/masks antes dos
chunks e confirma ausência. Índices/órfãos sem identityHash também são vistos.
Linha estrangeira, recriada ou divergente interrompe o passo sem avanço.
Recibos preservados contêm apenas hashes mínimos, não ciphertext/prosa.

Família é server-only nas Rules recursivas existentes. Nenhum layout C4 1–4 foi
alterado: integrar jobs/índice ao C4 apropriado antes de ativação continua gate.
O índice derivado é acrescentado em 230, abaixo; origens ainda exigem seus
contratos de reserva/coleta antes do produtor. Não reinterpretar linhas own.
[Plano 229](execucao/229-revisao-propria-com-indice-persistido.md),
[ADR 0259](../../decisions/0259-campaign-persistent-own-semantic-review.md) e
[evidência](../../entregas/2026-10-29-writer-v2-revisao-propria-persistida-de-campanhas.md).

## Índice derivado e posições — incremento 230

| Família                   | Endereço                            | Coleta/preservação                                             |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Metadata derivada cifrada | JOB/derivedRows/ORDINAL             | Seção/posição, hashes e recibo nativo; coleta por ordinal/mask |
| Posição autenticada       | JOB/derivedPositions/SEÇÃO-POSIÇÃO  | Aponta para linha/hash com mesmo birth; apaga no mesmo passo   |
| Estado/contadores         | derivedReview e derivedIndex no job | Cancel limpa cifra; rows/cleanedRows/sizes mínimos preservados |

Antes do produtor, cleanup passou a retirar até 25 pares por passo (até 50 docs),
com metadataHash/pointerHash/birth do recibo. Depois das linhas, exige ausência
de posições, inclusive órfãs sem linha, antes de own/chunks. Estranhos/par
inconsistente interrompem sem apagar alheios. Rules recursivas são server-only.
Certificado é campaign-derived-index-only; nenhuma autorização de origem.

C4 1–4 não inclui estes temporários; integrar ao C4 apropriado antes de campanha
ativa. Verificador por dependência, origens persistidas e materialização/UI ainda
pendem. [Plano 230](execucao/230-indice-derivado-persistente.md),
[ADR 0260](../../decisions/0260-campaign-persistent-derived-index.md) e
[evidência](../../entregas/2026-10-29-writer-v2-indice-derivado-persistente.md).

## Verificação semântica derivada — incremento 231

derivedCheck opcional no job cifra fase/cursores/contadores/SHA, até 256 KiB,
vinculado ao arquivo, índice/contexto e encarnação. Não há nova coleção. Cancel
limpa esse estado junto dos demais e revoga chave atomicamente, antes da coleta.
Recibos mínimos não guardam ciphertext/relações. Jobs sem campo continuam válidos.

A máquina limita passos dentro do item; prova revalida assinatura/índice, sem
conceder autorização atual da origem. Origens, materialização/mídia e C4 da
ativação continuam gates. [Plano 231](execucao/231-verificacao-derivada-por-dependencia.md),
[ADR 0261](../../decisions/0261-campaign-resumable-derived-semantics.md) e
[evidência](../../entregas/2026-10-29-writer-v2-verificacao-derivada-por-dependencia.md).

## Revisão persistida de origens — incremento 232

originReview opcional guarda captura/rechecagem cifradas no job, até 64 KiB,
com binding a arquivo/índice/project/encarnação e clock corrente. Não cria
coleção de decisões/testemunhas: derivedRows w:* fornece ordem e own fornece
project validado. Recibos/progresso guardam somente metadata mínima.

Cancelamento limpa originReview atomicamente com estados/chave; coleta de pares,
own e chunks permanece. Restart explícito retira só a revisão, preservando as
etapas concluídas e sem exigir clock antigo. Jobs sem campo continuam válidos.
Prova é resumo de revisão, não grant por recurso: materialização deve revalidar
cada origem na escrita. C4 1–4 não mudou; temporários exigem integração antes
da ativação. [Plano 232](execucao/232-revisao-de-origens-retomavel.md) e
[ADR 0262](../../decisions/0262-campaign-resumable-origin-review.md).

## Validação integral do bloco 227–232

9.871 testes positivos: 4.978 frontend, 94 scripts e 4.799 Functions.
Cobertura/limites, sintaxe de 472 módulos, lint/typecheck/build/smoke positivos.
A [evidência](../../entregas/2026-10-29-writer-v2-revisao-retomavel-das-origens.md)
separa SDK dirigido, compatibilidade e avisos do build. Isso valida upload/
revisões internas; materialização, integração C4 antes de ativação e interface
ainda precisam de implementação e validação próprias.

## Materialização própria — incremento 233

ownWrites/ORDINAL sob JOB é journal mínimo schema 1 com conta/restauração/
encarnação/ordinal, operação e até quatro alvos collection/id/metadataHash.
Mesma criação nativa do recibo e dos alvos; formatos ordinários não recebem
campos extras. ownMaterialization no job cifra estado limitado a 32 KiB.
Não há coleção de mapeamento: IDs são determinísticos por domínio e encarnação.

Alvos: notes, sessions, workChecklist, preparationItems/preparationBodies,
sessionReferences/sessionPreparationLinks e seus controles globais/por sessão,
mais workProgress quando presente ou necessário ao checklist.
Raiz permanece marcador; título/progresso são preparados em cifra no job.

Antes do produtor, cancel/coleta passam a retirar estes alvos e journals por
metadata/birth, até 25 journals por passo, antes de índices/chunks. Vazio das
13 famílias é conferido; órfãos/estrangeiros/alterados/recriados são preservados
sem avanço. Cancel limpa cifra/chave mas mantém contadores mínimos de coleta.
Layouts C4 1–4 permanecem; integrar temporários antes da ativação.
A prova própria não certifica a auditoria física final da campanha ativa.
[Plano 233](execucao/233-materializacao-dos-dados-proprios.md),
[ADR 0263](../../decisions/0263-campaign-own-materialization.md) e
[evidência](../../entregas/2026-10-29-writer-v2-materializacao-propria-de-campanhas.md).

## Base arquivada — incremento 234

baseWrites/ORDINAL sob JOB usa o journal nativo compartilhado com own,
conservando o wire próprio. Acrescenta sourceKey limitado para auditoria
autorizada dos alvos registrados. Alvos ficam sob users/UID/campaignBases/BASE:
root/items/bodies/links/loreReferences; images entra no inventário para
recusar órfãos, sem produtor de binário/pin neste incremento.

Localizadores opcionais cifrados em derivedRows contêm ID/cursor inicial,
não prosa; portas antigas/hash permanecem. baseMaterialization cifra estado
até 8 KiB no job; texto por frames/chunks nativos, sem corpo crescente.
A base pai nasce após filhos e fica preparing; campanha continua pending.

Cancel retira cifra/chave e coleta baseWrites/alvos antes de próprios e índices.
Antes de excluir pai, consulta limitada por nomes confere que filhos restantes
estão no mesmo lote. Órfãos/recriados/alterados são preservados sem avanço;
coleta não lê prosa nem exige origem disponível. Layouts C4 1–4 permanecem.
[Plano 234](execucao/234-materializacao-da-base-congelada.md),
[ADR 0264](../../decisions/0264-campaign-frozen-base-materialization.md) e
[evidência](../../entregas/2026-10-29-writer-v2-materializacao-da-base-congelada.md).

## Variantes arquivadas — incremento 235

variantWrites/ORDINAL sob JOB usa o journal nativo compartilhado, vinculando
row do índice e authorizationHash aos alvos e recibo de mesmo nascimento.
Alvos: campaigns/CID/loreGenerations/GEN e loreVariants/loreVariantBodies.
A geração determinística nasce após filhos e fica preparing. Controle global
loreVariantState/ponte ativa serão publicados na futura ativação, não agora.

variantMaterialization cifra estado até 8 KiB no job, sem texto de variante
ou listas crescentes. IDs históricos derivam de conta/restauração/encarnação/
anchorKey; este incremento só prepara o vínculo, sem criar essas bases.

Cancel limpa cifra/chave e coleta variantWrites/alvos antes de base/own e
índices. Consulta limitada por nomes impede apagar geração com filho estranho;
coleta não lê prosa nem precisa de permissão da origem. Integração dos novos
temporários ao C4 apropriado continua obrigatória antes de ativação.
[Plano 235](execucao/235-materializacao-das-variantes-de-lore.md) e
[ADR 0265](../../decisions/0265-campaign-variant-materialization.md).
