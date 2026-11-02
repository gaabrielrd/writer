# ADR 0145 — Revogação das chaves na exclusão do livro

- Status: aceito e implementado localmente.
- Data: 2026-10-25.
- Plano: [126](../tasks/writer-v2/execucao/126-ciclo-das-chaves-na-exclusao-do-livro.md).

## Contexto

A chave de recuperação só era liberada enquanto livro/ficha originais seguiam
autorizados. Excluir o livro já negava HTTP, mas não removia necessariamente
a chave do servidor. O controlador de exclusão do lore não a inventariava.

## Decisão

Novas reservas escrevem books/bookId/bookLoreRecoveryKeys/writeId no mesmo
commit da raiz/prova/chave. O índice imutável contém UID/writeId/bookId,
bookBirth/requestHash/keyId, sem material AES. A raiz privada conserva
schemaVersion 1 e declara keyInventory:1; o carregador valida essa declaração.
Nenhum campo novo chega às respostas públicas de metadata/chave.

Liberação da chave exige o índice original para reservas indexadas. Reserva
repetida não recria índice/chave ausentes. Revogação explícita remove os dois
originais no commit do terminal/prova; não depende da origem ainda existir.
Controles antigos sem a declaração continuam compatíveis e sem índice
fabricado. Índice inesperado, ausente onde exigido, divergente ou recriado
bloqueia a operação.

Store interno compartilha validação das raízes e provas com a exclusão.
Nenhum endpoint, método RPC, chave ou formato cifrado do navegador foi criado.

O controlador de exclusão recebe estado v2 com recoveryCursor e
recoveriesComplete, além da fase/cursor/corpo/contadores existentes. Estado v1
é verificado pelo evento e hash originais antes de migrar, incluindo complete
se a raiz do livro ainda existe. O checkpoint externo/aliases v3 é preservado.

A exclusão visita um controle por transação, por UID/bookId e ordem de ID.
Exige abertura nativa registrada na mesma transação, cutoff, bookBirth e provas
originais. Controles legados também são visitados. Todos os produtores revalidam
o livro na transação e recusam deleting; a marca anterior à varredura impede
novas reservas nativas. Não transformar createdAt alegado em prova.

Da chave, a coleta lê somente schemaVersion e timestamps nativos por fieldMask.
Nascimento deve coincidir com a raiz imutável. Não lê keyBase64, prosa ou
ciphertext local. Cria terminal/prova e remove chave/índice no mesmo commit do
progresso filho e checkpoint externo. Chave ausente pode fechar sem regeneração.
Controle já fechado com resíduo inesperado bloqueia, sem sweep.

Descoberta inclui controles e índices mesmo sem flags na raiz. Tanto o finish
do lore quanto o finish externo do livro exigem o novo inventário vazio.
Índice órfão/tardio bloqueia; chaves/índices recriados e outros livros/UIDs são
preservados. Não remover raiz, prova, terminal, fence ou recibo histórico.

## Consequências e limites

Rules negam SDK para todo o índice, inclusive dono. Não é grant de leitura.
A identidade nativa e as provas, e não um path/DTO, autorizam a coleta.
A contagem processed inclui chave e índice removidos; coordinatedUnits inclui
controles visitados. Nenhuma chamada depende do total de recuperações.

Implantação futura deve coordenar produtores, liberador, exclusão e Rules,
com drain de versões antigas. Controles v1 permanecem compatíveis no backend
novo; código antigo pode recusar a declaração privada nova, sem fallback.
Não há autorização de deploy neste marco.

Chaves remanescentes de livros já excluídos antes deste protocolo exigem
auditoria/reconciliação específica antes do rollout. Não inventar a identidade
da origem ausente nem executar purge automático. A exclusão de ficha isolada
não é a exclusão integral do livro. Cópias locais e material já autorizado
em memória não podem ser apagados remotamente.

Demais escritores/consumidores, backup/restauração, inventário completo,
rollout/drain/validate integral de P1, fases 3–5 e gates humanos/comerciais
seguem necessários. Somente commits locais; sem CI/push/PR/merge/deploy.
