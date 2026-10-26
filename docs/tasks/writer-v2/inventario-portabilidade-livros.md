# P1 — inventário da portabilidade de livros

Snapshot local: 2026-10-26, plano 146, após 95c151a. Este mapa atualiza as
pendências técnicas históricas dos planos 31–145. Não certifica dados de produção,
cliente já distribuído, credenciais ou operação comercial.

## Famílias, produtores, leitores e limpeza

| Família                                                                            | Produção e uso normal                                                                                | Captura e restauração                                                                                      | Exclusão e retenção                                                                                                                    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| books; acts; chapters                                                              | bookService, legacyChapter e composição; DTO de persona fechado                                      | BookBackupRead/Structure, BookRestoreArtifacts; IDs próprios e raiz privada só na ativação                 | sceneJobs apaga filhos e raiz; deletedBooks/reserva ficam como fences                                                                  |
| bookTextBodies e chunks                                                            | BookChapterStorage/Read, escrita legada, conversão e chat                                            | Texto corrente e histórico usam leitura lógica limitada; restauração confere SHA e nascimento              | BookChapterCleanup; fase text-bodies e conferência final no job de exclusão                                                            |
| sceneControls, sceneSources, scenes e filhos body/planning/references              | SceneJobs/Composition/Read e conversão                                                               | Snapshot consistente e remapeamento; fonte original preservada                                             | sceneJobs remove filhos antes dos pais; nenhum controle desconhecido é omitido                                                         |
| sceneLoreLinks; narrativeControls; arcs/milestones; timelineEvents; narrativeLinks | Índices e serviços narrativos existentes                                                             | Backup preserva conteúdo; apenas narrativeControls/entity-scenes é índice derivado e não registro autoral  | Fases planas e arcs/milestones do job; índices reconstruídos na cópia                                                                  |
| workProgress; workWordGroups; workWordSources                                      | Metas e contagem por revisão                                                                         | Valores e relações preservados, contagem reconstruída                                                      | Inventário de sceneJobs; não copia preferência de fuso do usuário para o livro                                                         |
| workVersions; workVersionBodies                                                    | Criação manual e antes de restauração, mesmo com recurso removido                                    | Fluxo integral do histórico; rascunho diferente vira versão separada                                       | Corpo antes do manifesto; exclusão do projeto inclui histórico, sem expiração automática                                               |
| lore inline, payloadStorage v1 e v2                                                | Leitura lógica; edição, criação, análise/aplicação, visibilidade e retirada autorizadas              | BookLorePortable/BackupRead e RestorePreparedLore; sem truncagem, stub ou inferência de acesso             | BookLoreDeletion coordena cabeças/corpos/gerações; retirada individual conserva tombstone e entrega coleta ao livro                    |
| bookResourceBodies; bookResourceChunks; bookLoreSegments                           | Payload limitado, geração indexada, inspeção/CAS e adoção                                            | Corpo lógico e segmentos certificados; runtime seleciona v2 só para jobs novos                             | Partes antes do header; origem, cutoff e inventário/lease reconferidos                                                                 |
| bookLoreGenerations; bookResourceInventory; bookResourceLeases                     | Alcance por geração e leitores; prova nativa e aposentadoria                                         | São controles reconstruídos, não conteúdo portátil                                                         | Não apagar lease/fence para contornar leitor; coordenador confere resíduos antes do finish                                             |
| Jobs de edição/criação/remoção/análise, field uploads e source inspections         | Operações privadas com recibos e checkpoints                                                         | Não exportar pedidos/chaves/recuperação                                                                    | BookLoreDeletion/RecoveryDeletion entrega cancelamento por origem exata; recibos mínimos e controles permanecem                        |
| bookLoreRecoveryKeys e recuperação no dispositivo                                  | AES-GCM, chave autorizada e retomada; nada de fallback plaintext                                     | Excluídos do arquivo portátil                                                                              | Inventário de chaves deve esvaziar antes do finish; audit-book-lore-recovery.mjs é ferramenta operacional, não prova de conta auditada |
| users/uid/aiPersonas e vínculos                                                    | Perfil autorizado por vínculo; marca explícita de ausência/overrides nos DTOs                        | Snapshot/remap, lote restaurado e disponibilidade fechada; ausência nunca consulta perfil por coincidência | Preparação cancelada revoga lote; perfil independente da biblioteca não é apagado por heurística do livro                              |
| Capa, imageLibrary e usos Storage                                                  | Biblioteca e vínculos exclusivamente no servidor                                                     | Bytes autorizados, não URL arbitrária; imagem só ativa após finalização                                    | Cancelamento/arquivo usam inventário de preparação e vínculo/uso; não remover imagem independente ou de outro projeto                  |
| Universo e vínculo de projeto                                                      | prepareUniverseProjectLink em universes, autorização atual                                           | Apenas origem; religa ao mesmo universo autorizado sem duplicar lore global                                | Exclusão ajusta vínculo/contador; arquivo e recibo não conferem grant                                                                  |
| publicBooks/revisions e filhos                                                     | Publication lê raiz no servidor, certifica fonte e campos públicos                                   | Publicação/direitos anteriores não são restaurados; nova cópia privada                                     | begin revoga público; sceneJobs inclui filhos de revisões e finaliza exclusão                                                          |
| Contextos privados de chat/análise e referências                                   | EditorChatContextRead, LoreAnalysisContext e leitores de referências usam conteúdo lógico autorizado | Conversas/contextos/pedidos não entram no backup                                                           | Indisponibilidade/revogação conservam recusas; sem reutilizar corpo de origem revogada                                                 |

Os nomes de módulos acima identificam famílias; os contratos executáveis ficam em
[functions/src](../../../functions/src) e as composições cliente em
[src/features](../../../src/features). O mapa não presume que todo documento sob
books desaparece: fences, leases, recibos e tombstones mínimos têm retenção
deliberada e não concedem conteúdo. Também não é coletor genérico de órfãos Admin.

## Preparação, controle e arquivo

users/uid/bookRestores guarda chunks, integrityProofs/State, validationIndex/
Items/State, materializationArtifacts, preparedPersonas/personaBindings,
preparedDrafts, preparedCovers/Chunks/Storage. O inventário de auditoria inclui
cada recurso produzido, corpos e filhos. Mídia e archiveCleanup têm conclusão
própria; o arquivo apaga preparação e journals sem apagar seus alvos ativos.

bookRestoreOperations, StartFences, RecoveryKeys, Reservations e recibos próprios
impedem replay destrutivo. Chave revogada não é recriada para resolver intenção
terminal. O job ativado permanece histórico; abrir livro exige leitura normal do
servidor. Após exclusão da cópia, consultar esse job não recria nem autoriza raiz.

Referências de implementação: bookRestoreAuditInventory, ResourcePaths,
Artifacts, ArchiveCleanup, Activation e bookLoreDeletion; o teste integrado
[bookRestoreActiveLifecycle](../../../functions/test/bookRestoreActiveLifecycle.test.mjs)
usa esses serviços reais com banco em memória, sem inserir uma raiz pronta.

## Matriz de prova local

| Comportamento                                                                   | Evidência e limite                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Captura → arquivo → restauração → recaptura atual e JSON v1–v6, mídia/histórico | [Plano 140](execucao/140-roundtrip-dos-livros-com-consumidores-normais.md); comparação lógica e remap com serviços normais; SDK separado para máscaras/Rules                           |
| Ausência de persona no manuscrito e rascunho                                    | [141](execucao/141-ausencia-de-persona-no-rascunho-portatil.md) e [144](execucao/144-metadata-de-persona-nos-leitores-do-editor.md); DTO real até captura, sem perfil por coincidência |
| Ativação/revisão concorrente, retry e arquivo                                   | [142](execucao/142-revisao-alterada-na-ativacao.md); SDK concorrente e Chromium com reinícios                                                                                          |
| Arquivo produzido pelo editor e restaurado no Estúdio                           | [143](execucao/143-backup-completo-no-dialogo-de-exportacao.md); handles nativos OPFS injetados, sem automatizar seletor externo do sistema                                            |
| Modo por job, reserva imutável e legado entre fichas                            | [145](execucao/145-modo-de-lore-fixado-na-restauracao.md); Node e dois SDK, sem flag retroativa                                                                                        |
| Edição, criação, retirada e exclusão após ativação/mídia/arquivo                | [146](execucao/146-inventario-e-consumidores-dos-livros-restaurados.md); inline/v1/v2, projeto alheio preservado; banco em memória                                                     |
| Fonte >8 MiB usando configuração real selecionada                               | Mesmo teste 146; SHA/aliases/datas idênticos após arquivo, schema v2 e job fixado                                                                                                      |
| Publicação/contextos/leitores e exclusão de recursos                            | Planos anteriores 55–60, 98–110 e 128–131, registrados no [índice de execução](execucao/README.md); não alegar um único teste conjunto de todas essas jornadas                         |

A leitura portátil tokenVersion 1 fixa o clock da coleção; não limita payload a
v1. O root raw lido pela publicação verifica hasLoreResources; omitir essa flag
do DTO visual não cria caminho de escrita legado. Writers antigos SDK/Admin
continuam bloqueados após a barreira, conforme plano 110.

## Compatibilidade e passagem operacional

Novas entradas JSON v1–v6 usam normalizador v2. Cursor interno v1 conserva
literal/hash; raiz interna antiga sem personaAvailability não recebe inferência,
novo grant, migração silenciosa ou cancelamento. Esses estados devem ser
identificados e revisados antes do rollout; não há prova de sua existência em
produção nem certificação automática de recaptura nessas condições.

Runtime local seleciona indexedLoreBodies true para pedidos novos, nos dois
pontos de composição Functions. Factory de baixo nível mantém false. Job/reserva
fixados, prefixos e provas antigas seguem a ADR 0168; trocar runtime não migra
pedido em andamento. Sem deploy.

Antes de operação real: auditar chaves históricas, revisar estados internos
antigos, coordenar Rules/clientes/Admin e conferir seletor externo em dispositivo
suportado. São gates operacionais explícitos; não bloqueiam implementação local
de P2/P3 aprovada. Pilotos humanos, contratos, Connect e demais fases continuam
pendentes. Validate global e resultado de revisão constam da entrega 146.
