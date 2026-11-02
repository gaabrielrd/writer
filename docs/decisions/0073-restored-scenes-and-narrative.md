# ADR 0073 — Recursos de cenas e narrativa na preparação privada

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M29, continuação da ADR 0072

## Contexto

A estrutura e o lore próprio já podem ser preparados sob reserva. Para restaurar
o livro inteiro faltam cenas, fontes, blocos de planejamento, referências e
narrativa. A ordem portátil permite filhos antes dos pais e recursos intercalados.
Contagens não são portáteis: precisam ser derivadas antes de expor a cópia.

## Decisão

advanceBookRestoreResources é interno, fora de BOOK_RESTORE_METHODS. Cada unidade
confere reserva/checkpoint/estado e lê um item pelo leitor verificado M21.
item.verify(tx), artefatos, journal, cursor e recibo são confirmados juntos.

Projeções puras usam caminhos fechados: oito famílias de raiz e quatro tipos de
filhos (corpo, planejamento, referência de cena e marco de arco). IDs remapeados
não são caminhos. Chaves filhas codificam pai e ID por gramática fixa; códigos
de referência/índice são SHA-256 canônicos. Nenhum texto é usado como endereço.

São preparados os onze tipos após lore e o índice derivado sceneLoreLinks.
NarrativeLinks usa sourceKey/sourceArcId/loreKey dos escritores existentes.
Datas nativas e revisões são novas, enquanto prosa, ordem A/B, arquivo,
pais ausentes e fonte congelada conservam os campos portáteis.
Referências externas permanecem indisponíveis até reautorizar a origem.

Preparação v3 guarda início da seção, cursor principal e contagens por tipo de
registro consumido. Lore conta sem regravá-lo. O manifesto confere todas as
contagens e leva a resource-counts, deixando o cursor no primeiro item seguinte.
Contagens de registros e artefatos nativos únicos têm significados distintos:
vínculos equivalentes compartilham a chave nativa canônica com journal próprio.
Ao encontrar o mesmo vínculo, conferir prova nativa e conteúdo integral idêntico,
sem regravar artefato ou journal. Firestore conserva updateTime no no-op; mudar
somente o journal romperia sua prova de última alteração contra o recibo.

A migração para cleanupVersion 7 certifica vazios os novos namespaces e journals.
A fase resource-children drena pares tipados de filhos pelo journal, mesmo sem
cabeçalho do pai. Depois, corpos v5 e artefatos simples são removidos pelo
protocolo existente. Antes de remover cena/arco, consultas mascaradas e limitadas
certificam vazios os filhos, recusando os não registrados. A certificação das
famílias de raiz e journals é repetida ao final.

## Consequências

A raiz continua ausente e countReady false. WordCount/sceneCount/referenceCount,
revisões derivadas e prontidão de índices continuam pendentes de reconciliação
obrigatória; valores neutros nunca são servidos ao editor. Isso não ativa uma
cópia nem encerra P1/F2-09.

Recriações nativas e recibos/artefatos inconsistentes interrompem sem exclusão
cego. O inventário limita-se a caminhos produzidos pelo protocolo, sem varredura
destrutiva de subcoleções Admin arbitrárias. V1–v6 continuam legíveis/canceláveis.

Campos maiores que o armazenamento nativo ainda exigem representação e
consumidores: falha deve conservar fonte/cursor, sem reduzir o limite de 8 MiB.
Faltam também personas, histórico/rascunho/capa, autorização final, ativação,
host/UI, roundtrip e validate integral. Não há nova Rule, API pública, dependência,
CI, push ou deploy. Implantar leitores e cleanup antes de habilitar produtores.
