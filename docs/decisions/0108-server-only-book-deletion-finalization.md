# ADR 0108 — Finalização de livros somente pelo servidor

- Data: 2026-10-24.
- Estado: aceito localmente; rollout coordenado pendente.
- Plano: [93](../tasks/writer-v2/execucao/93-roteamento-integral-da-exclusao-de-livros.md).
- Antecedente: [ADR 0102](0102-coordinated-book-lore-deletion.md).

## Contexto

O cliente escolhia exclusão SDK quando hasSceneResources/hasNarrativeResources/
hasProgressResources/hasLoreResources não estivessem ativos. Preparações privadas
antigas de lore podem existir sem flag. Sua ausência não comprova inventário
vazio e o navegador não pode ler essas coleções para decidir com segurança.

## Decisão

deleteBook sempre chama beginBookDeletion e depois finishBookDeletion.
O início conserva a revogação pública e deleting atômicos antes da limpeza.
finishBookDeletion mantém sua API, mas executa deleteSceneBook existente,
com um operationId e limite fixos durante as páginas da chamada.
Não consulta flags/listas SDK, não remove filhos e não escreve deletedBooks.

O protocolo servidor já descobre atividade privada sem a marca e conserva
checkpoint canônico na raiz. Nova chamada durante exclusão em curso é
encaminhada a esse checkpoint; somente o servidor confirma limpeza e remove
raiz/grava tombstone, preservando controles/leases/recibos. Falha de RPC
interrompe sem fallback de exclusão no navegador.

Rules negam toda exclusão SDK de books/{bookId} e todo acesso/escrita SDK de
deletedBooks/{bookId}. Mesmo dono, deleting, flag ausente/false e tombstone
prévio não autorizam a finalização. Escritas legítimas de metadata e início
da exclusão continuam pelas regras existentes.

A guarda SDK de finalização não implica negar o início ou a exclusão legítima:
testes nativos precisam comprovar servidor concluindo um livro legado vazio
e outro com preparação privada sem flag, retomada por outra operação e
preservação de outros livros/vínculos/contadores de universo.

## Consequências e rollout

Cliente/backend/Rules devem ser implantados conjuntamente, com drenagem de
clientes antigos. Não habilitar produtores de lore com finalizador antigo.
Este incremento é local, sem deploy, migração, CI ou alteração de endpoint.

A marca hasLoreResources continua sendo metadata servidor útil, mas não decide
autoridade de excluir. Auditoria de outros namespaces ainda pendentes
(chat/imagens/capa etc.) não é declarada concluída por esse roteamento.
Demais writers/consumidores/backup/cliente de lore e ativação de P1 permanecem.
