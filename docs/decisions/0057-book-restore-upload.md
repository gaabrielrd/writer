# ADR 0057 — Reserva e transferência privada de backups de livro

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M13](../tasks/writer-v2/execucao/46-reserva-e-transferencia-da-restauracao.md).

## Decisão

Preparar a restauração como novo projeto privado, com raiz ausente até a ativação.
M13 fornece reserva, transferência, consulta, recibos, recuperação da chave e
cancelamento. O estado uploaded significa apenas transferência encerrada:
não comprova SHA integral, formato, conteúdo ou autorização de origem.

Reservar bookId determinístico por UID/operationId/fingerprint em
bookRestoreReservations e deletedBooks, junto do job e recibo inicial.
O marcador tem kind book-restore-reservation, sem deletedAt fictício.
Criadores comuns já recusam qualquer ID em deletedBooks; Rules e os serviços
imageLibrary/assistedBook continuam com essa barreira.
Validar a identidade dos três documentos e seu createTime nativo comum.
jobToken inclui nascimento nativo e fingerprint; cópia/recriação não satisfaz
o contexto antigo.

A ativação futura poderá remover somente o marcador tipado exato, validado
contra a reserva e o nascimento do job, na mesma transação que cria a raiz e
seus vínculos/contadores/recibo. Nunca remover tombstone de exclusão comum.
A reserva global permanece, inclusive após cancelamento. M13 não remove marcador
nem cria raiz/filhos de books; não introduz operação de ativação.

## Entrada não confiável e limites

O pedido inicial contém somente operationId, source fechado (formato/versão,
tamanho/SHA-256 completo do arquivo) e reviewHash. O hash do contêiner é outra
prova. fingerprintBookBackup calcula o hash completo por ranges de até 64 KiB.

Cada append verifica base64 canônico, SHA direto, tamanho exato do trecho e índice
contíguo. Criação da parte, chain, checkpoint e recibo são atômicos. Não transportar
prosa nos recibos/resolvers/listas. Recibo é histórico; progresso é o estado atual.
Timeout/unknown/404 não comprovam encerramento. Resolver inicial com intenção
cancel instala fence se o start nunca chegou; se já existe, apenas o confirma.

Chunks ficam privados em Firestore como entrada bruta não confiável, com Rules
deny inclusive para o dono. Sem download de entrada, execução, Storage, crédito,
publicação ou vínculo de universo. A preparação posterior deve conferir SHA
integral e executar os validadores fechados do arquivo antes de materializar.

## Chave e recuperação

Emitir chave AES-GCM de 32 bytes uma única vez, vinculada a UID, jobToken,
reviewHash e keyId. Guardar fingerprint privado para detectar alteração da chave.
Chave ausente depois da emissão não pode ser regenerada silenciosamente.

Expor somente HTTP POST text/plain;charset=utf-8, Auth e App Check obrigatórios,
private/no-store, corpo UTF-8 de até 8 KiB e erros sanitizados. Hosting encaminha
/api/book-restore/recovery-key; não há callable da chave. Emissão habilita append,
mas não comprova persistência no dispositivo. O host futuro deve aguardar
oncomplete da revisão cifrada antes de enviar bytes, sem persistir PDF ou chave.

## Cancelamento e evolução

Cancelamento usa checkpoint/token, remove a chave e bloqueia novos append.
Cleanup v1 lê somente metadata e remove até 50 chunks por transação, contando
exclusões reais e certificando EOF. Job/recibos/reserva/marcador permanecem sem
bytes/chave; raiz inesperada ou contexto estranho bloqueia a operação.
Nenhuma árvore de livro é apagada.

Antes de qualquer writer de índices, DTOs normalizados, recursos ou mídia de
preparação, ampliar o inventário/versionamento de cleanup. Antes de materializar
filhos no ID reservado, certificar ausência de filhos alheios e criar somente
os da operação; nunca adotar nem apagar órfãos preexistentes pelo prefixo.

[Provas M13](../entregas/2026-10-22-writer-v2-reserva-e-transferencia-de-backups.md)
separam transações simuladas, Rules/SDK reais e HTTP com verificadores injetados.
Auth/App Check produtivos, UI protegida, validação servidor, remapeamento,
ativação, roundtrip e validate completo continuam em P1. Sem CI ou envio remoto.
