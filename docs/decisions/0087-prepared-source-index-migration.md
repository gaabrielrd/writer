# ADR 0087 — Migração dos índices de fontes preparadas

- Status: aceito para jobs privados
- Data: 2026-10-23
- Contexto: P1 M37c, depois da ADR 0086

## Problema

Jobs M37a podem conter corpos nascidos sem sceneSourceEncoding. O leitor legado
permanece correto, mas mantém custo quadrático. É necessário completar esses
índices com procedência nativa antes da certificação/ativação final.

## Decisão e progresso

advanceBookRestoreSourceIndexes é operação interna, sem callable novo. Exige
content-verified, resources-finalize e inventário v14. Preparação v11 migra para
v12, acrescentando sourceIndexes fechado: schemaVersion 1, scanned, backfilled,
after e complete. Uma fonte por transação, sem limite de quantidade.

Conferir fonte, corpo e cada parte por journal/recibos/nascimento/última alteração
próprios. O helper interno de artefatos expõe o snapshot nativo; o validador puro
de partes confere caminho, escopo, tamanho, SHA e imutabilidade sem uma segunda
leitura de bytes. Snapshots/aberturas nunca são inputs do cliente ou transporte.

Corpo sem índice recebe somente sceneSourceEncoding recomputado das partes
autenticadas. Índice existente é comparado ao recomputado; divergência falha,
sem reparo silencioso. Fonte inline mantém representação e hash anteriores.

Atualizar manifesto/journal/recibo/cursor juntos. Texto, fonte, partes, pins,
nascimento do corpo e artifactCount permanecem. No-op não regrava manifesto nem
journal e preserva updateTime. Clone por tentativa e protocolo CAS/recibos
impedem duplicação em replay, concorrência e retry.

Ao esgotar a consulta, exigir scanned igual ao total preparado de scene-source
antes de complete. Cursor do arquivo e fase resources-finalize permanecem.
Complete não certifica o namespace inteiro nem autoriza criar a raiz.

## Limpeza, compatibilidade e rollout

Nenhum caminho/artefato novo é criado: inventário v14 continua, com aceitação do
novo recibo na prova dos corpos. Preparações v11 e inventários anteriores seguem
legíveis/canceláveis. Cancelamento v12 conserva revogação do lote de personas,
fence de capa e remoção de partes antes do manifesto.

Implantar parsers v12, leitura de recibos e cleanup compatíveis, drenando handlers
antigos antes de habilitar a migração. Nenhum deploy foi executado.

## Evidência e limites

Fixtures antigas omitem o campo antes da criação nativa original, mantendo
journals/recibos genuínos; não removem o índice depois nem fabricam timestamps.
SDK confirma migração, atualização nativa do manifesto/journal/recibo,
preservação das partes e limpeza. Uma parte recriada impede a migração e é
preservada pelo cancelamento. Node cobre também índice já correto, zero/mais de
uma fonte, 8 MiB/128 partes, corrupção, fontes alheias e rollback/retry.

Migração disponível não significa execução em dados de produção nem ativação.
A certificação final ainda precisa reconferir namespaces/fontes/corpos/índices
e origem atual; a varredura não prova ausência de mutação Admin fora do protocolo.

Demais campos grandes, crescimento do JSON após remapeamento, capa/biblioteca,
certificação/ativação, limpeza pós-ativação e host/UI/roundtrip/validate seguem
pendentes. P1/F2-09 e Writer V2 abertos; somente commits locais e CI ignorada.
