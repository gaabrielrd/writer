# Inventário da portabilidade privada de campanhas

Snapshot local: 2026-10-29, incremento 229. P3/D/F2-09 continuam abertos.
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

Os incrementos 227–229 implementam upload, checkpoint de integridade e índice/
revisão própria duráveis, com coleta pré-ativação, conforme abaixo. Índices da
semântica derivada e de origens, remapeamento/materialização retomável, mídia
exclusiva temporária e ativação ainda não têm produtor. Não são cobertos por inferência pelas listas C4
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
Índices derivados/origens ainda exigem seus contratos de reserva/coleta antes
do produtor; não reinterpretar linhas own como outra etapa.
[Plano 229](execucao/229-revisao-propria-com-indice-persistido.md),
[ADR 0259](../../decisions/0259-campaign-persistent-own-semantic-review.md) e
[evidência](../../entregas/2026-10-29-writer-v2-revisao-propria-persistida-de-campanhas.md).
