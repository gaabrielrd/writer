# P2 — histórico completo de texto no backup privado de aventuras

Base: f8a5f4b. Capturar versões manuais e cópias before-restore de cenas e
blocos adicionais, preservadas até exclusão explícita. Sem retenção automática.
Não confundir snapshot atual de campanha com histórico da aventura.

Grafo consultado sem resultados; fallback em workHistory/Contracts/Snapshot e
testes. Versão em workVersions/id contém target/resource, metadata e manifesto
SHA/bytes/chunkCount; corpo em workVersionBodies/digest(versionId,index), até
64 KiB UTF-8 nativos. Aventuras usam schema 1 inline, diferente da referência
schema 2 de capítulo de livro. Writers normais alteram historyRevision da raiz
em criação/restauração/início de exclusão. Cabeçalho não tem owner/birth token
da raiz; sua autorização exige target físico correspondente e origem nativa.

## Contrato antes do código

Leitor específico listAdventureBackupHistory/readAdventureBackupHistory:
kind version ou version-chunk. Versão é coleção raiz paginada; chunk recebe
parentId da versão e parentToken do descriptor da versão. Lista N+1 até 50,
por ID físico, com máscara metadata sem label/texto. Chunk query filtra somente
versionId do pai autorizado; não aceita coleção/caminho arbitrário.
Cursor canônico liga kind/parentId/parentToken/aventura/sourceToken.

Mesma transação confere fonte 147 e versão. Target deve ser adventure/ID exato;
resource somente scene/block. Deleting, schema futuro, draft de livro e
marcadores externos, inclusive null, falham sem fallback ou cast de livro.
Identidade nativa de versão/chunk precisa ser válida e não anteceder nascimento
da raiz. Produtores atuais criam raiz antes de versões/corpos; futuro restaurador
deve criar raiz privada pendente antes de materializar os filhos, ou planejar
explicitamente prova equivalente. Não adotar histórico de raiz recriada.

Token de versão liga fonte/conta/ID e identidade nativa do head. Token de chunk
liga essa versão e sua identidade nativa, ID derivado e ordinal. ParentToken
obrigatório evita mudar head entre páginas. Chunk exige versionId/index coerentes
com caminho, ordinal dentro de chunkCount e texto UTF-8 até 64 KiB, inclusive
vazio como chunk único. Não exige recurso atual existente: versões retidas são
conteúdo próprio, inclusive quando a fonte corrente foi removida/arquivada.
Remapeamento de recursos históricos sem head corrente será fechado no restore.

DTO version conserva resource, createdAt/reason/label/wordCount/byteLength/
contentHash/chunkCount declarados. DTO version-chunk conserva index/content.
Não copia target/owner/jobs/recibos/resourceKey/deleting/storage/draft.
Preservar literal e valores nulos/ausentes, não alterar rótulos antigos.
Cada DTO via JSON UTF-8 é lido em faixas de 64 KiB com hash integral próprio;
escape JSON pode exigir várias faixas para um chunk nativo, sem truncar.

Importante: hash de uma unidade JSON não prova hash do texto histórico inteiro.
O futuro assembler deve ordenar chunks, exigir quantidade/ordinais únicos,
verificar soma de bytes e SHA do texto contra o manifesto antes de selar arquivo.
Este incremento ainda não emite pacote nem certifica esse fechamento global.
Corpos órfãos sem versão não são adotados por ID; não são uma versão completa.

## Sequência e testes

1. Serviço/codec internos específicos, reusando fonte 147 e contratos de chunk/
   endereçamento onde compatíveis; sem alterar produtores.
2. Produtores reais criam versões de cena/bloco e restauram, gerando before-
   restore. Testar vazio, Unicode/grande/múltiplos chunks, labels, >50 versões,
   paginação, manifestação/bytes/SHA, metadata sem prosa e nenhuma escrita.
3. Testar autoria/target/resource/schema/draft/marcadores, root/versão/chunk
   mudança/ABA/nascimento, parentToken e cursor fechados, chunk ausente/índice/
   caminho/UTF-8 inválidos, intenção capturada e erro/retry.
4. SDK real dirigido e regressões relevantes; lint/sintaxe/docs/arquitetura/
   styleguide/format/diff. Validate integral no fechamento de P2.
5. Revisar, ADR/evidência parcial e commit local. Sem writer/Rule/runtime/UI,
   namespace persistido/dependência, CI/remoto/deploy/subagentes. Depois personas/
   mídia/selo/pacote/revisão/restauração/UI/roundtrip; P2/P3/D continuam abertos.

## Aceites

- [x] Versões manuais e before-restore de cena/bloco sem descarte automático.
- [x] Provas nativas, target/parent/ordinal e intenção na mesma transação.
- [x] Presença literal e faixas íntegras; limite do hash global explícito.
- [x] Testes/SDK/checks, revisão/docs/commit; demais famílias e P2 integral abertos.

## Resultado dirigido e revisão

66 Node positivos (33 novos + 33 regressões), sem skip, em 1.439,3216 ms.
Dois SDK positivos em 16.083,0589 ms após resolver falha ambiental da JVM
sem reduzir cenários/volumes. Cleanup somente dos processos desta execução,
Java direto e orçamento limitado no runner QA, com encerramento comprovado.

Revisão mantém limite explícito entre hash de DTO e manifesto do texto inteiro;
teste de adulteração demonstra por que o selo global ainda não está habilitado.
[ADR 0176](../../../decisions/0176-adventure-backup-retained-history.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-historico-no-backup-de-aventuras.md).
Lint dirigido positivo; demais checks finais acompanham o commit.
Personas/mídia, pacote integral/restore/UI/roundtrip e validate P2 abertos.
