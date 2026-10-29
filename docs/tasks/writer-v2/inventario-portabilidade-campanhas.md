# Inventário da portabilidade privada de campanhas

Snapshot local: 2026-10-29, incremento 226. P3/D/F2-09 continuam abertos.
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

Jobs/reservas de restauração, upload de arquivo, índices duráveis da revisão,
remapeamento/materialização retomável, mídia exclusiva temporária e ativação
ainda não têm produtor persistente de campanha. Não são cobertos por inferência
pelas listas C4 atuais. Cada futuro recurso precisa de dono/campanha/encarnação
consultáveis, reserva conferida em toda mutação, cancelamento/coleta próprios,
inventário versionado e limpeza antes da primeira gravação.

A interface deverá revisar omissões, autorização e relações não resolvidas
antes de confirmar nova cópia. Ainda faltam Estúdio, ciclos completos e
validação integrada da restauração real. Macro 8/35 permanece.

## Evidência local do bloco

Validate integral 219–226 positivo: 9.710 testes (4.978 frontend, 94 scripts,
4.638 Functions), cobertura/limites preservados e sintaxe/lint/typecheck/build/
smoke positivos. A [entrega](../../entregas/2026-10-29-writer-v2-inventario-c4-das-campanhas-restauradas.md)
registra resultados, limites e o escopo que ainda não tem produtor persistente.
