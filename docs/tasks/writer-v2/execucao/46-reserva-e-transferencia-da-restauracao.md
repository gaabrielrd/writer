# F2-09 P1 M13 — Reserva e transferência privada da restauração

Contrato em 2026-10-22 sobre a55ccbc. Implementação sequencial autorizada;
sem CI/push/deploy/subagentes. P1/F2-09 continuam abertos.

## Objetivo e sequência completa

Começar o protocolo servidor para restaurar qualquer backup suportado como nova
cópia privada. Não sobrescrever livro/origem, publicar, aplicar créditos ou tratar
o arquivo/relatório do cliente como autorização.

Sequência: (1) revisão local confirmada e recuperação protegida, (2) reserva e
transferência ordenada do arquivo, (3) validação servidor dos bytes/formato/DTO,
(4) remapeamento/preparação limitada de recursos e mídia, (5) revisão de origem
atual e ativação atômica, (6) limpeza/retomada. Este marco implementa a fundação
de reserva/upload/cancelamento; validar/materializar/ativar permanecem obrigatórios,
não substituídos por um upload bem-sucedido.

## Descoberta verificada

Grafo consultado primeiro; snippet de createBook tinha faixa antiga, conferida
na fonte atual. AdventureImport tem reserva nativa, CAS, recibo histórico, fence
de start incerto, chave HTTP e cleanup limitado. Não copiar DTO de aventura.

Livros já têm barreira permanente deletedBooks: criação SDK e serviços
imageLibrary/assistedBook recusam ID presente. Podemos reservar ID sem migrar
todos os writers: criar um marcador tipado de preparação nesse namespace,
mais bookRestoreReservations e job no mesmo commit. Raiz books continua ausente.
Ativação futura apagará o marcador na mesma transação de criação; exclusão normal
recria o tombstone. Reserva global da restauração permanece para recibos/encarnação.

## Contrato de reserva

startBookRestore recebe operationId, source fechado (format, version, byteLength,
sha256) e reviewHash da revisão confirmada. Nunca recebe UID, bookId novo, caminho,
URL, título ou prosa. Formatos: writer-book-archive v1 e writer-book-backup v1–v6.
Hash completo do arquivo, não chainHash do contêiner, fixa a transferência.
bookId deriva de UID/operationId/requestHash; comparar origem/novo ID também na
validação futura. Fonte pode pertencer a livro já excluído; não exige acesso ao
livro original para ler conteúdo próprio fornecido no arquivo.

Criar users/UID/bookRestores/ID, bookRestoreReservations/bookId e marcador
deletedBooks/bookId de uma vez, somente se nenhum existir. Validar createTime
nativo comum e fingerprint em todas as leituras/mutações; jobToken fixa encarnação,
não updatedAt mutável. Recriação/copiar documento com mesmo conteúdo não reautoriza.
Job/op/fence pertencem ao usuário autenticado e são server-only em Rules.

## Transferência e recuperação

Partes binárias de até 64 KiB, base64 canônico/hash direto SHA-256 e índices
contíguos, sem inteiro do projeto em memória. appendBookRestoreChunk exige
jobToken, operationId, checkpoint exato, índice, hash e bytes. tx.create da parte,
contadores/chain/checkpoint e recibo atômicos; nunca sobrescrever partes.
Hash por parte/chain não comprova ainda sha256 integral ou validade do livro.
Última parte muda para uploaded, nunca ready/activated.

Chave AES-GCM obtida somente por HTTP Auth+App Check, private,no-store, contexto
UID/jobToken/reviewHash/keyId. Não retornar chave em callable/list/recibo/log.
Geração inicial é única; ausência posterior falha, não cria nova chave e perde
a revisão antiga silenciosamente. Bind de hash da chave protege contra troca
incompatível. Emitir chave antes de permitir append; o host futuro deve persistir
a revisão confirmada cifrada e aguardar oncomplete antes do primeiro append.
Não afirmar que o servidor comprova esse commit local só por emitir a chave.

get/list são metadata paginada. resolveBookRestoreOperation compara fingerprint
integral do pedido e confirma recibo histórico, separado do progresso atual.
Resolver start com intent cancel retorna start existente sem cancelar trabalho
não observado; se start nunca chegou, cria fence/reserva/marcador permanentes.
404 sozinho não fecha intenção incerta e start tardio não atravessa fence.

## Cancelamento e inventário v1

cancelBookRestore usa CAS, revoga/remove chave e muda para cancelling.
advanceBookRestoreCleanup remove no máximo 50 partes por transação, lendo só
metadata e certificando EOF. Manter job/recibos/reserva/marcador como metadados
terminais, sem prosa/chave. Contar removidos reais; buracos Admin não são bytes
apagados por nós. Recusar contexto estranho ou raiz books inesperada.

Inventário de cleanup v1: chunks e recoveryKey; recibos/fence/job/reserva são
permanentes. Qualquer índice/recurso/mídia de preparação futuro precisa ampliar
versionamento/inventário antes de habilitar seu writer. Não aplicar cleanup em
livro ativado nem apagar conteúdo de outro job.

## Arquivos e validação

1. Contratos/serviço/recuperação HTTP em Functions; wiring privado e Rules deny.
2. Fingerprint de arquivo no cliente, por ranges, usando Noble já instalado.
3. Node: auth/closed DTOs, nativo/ABA, replay/fingerprint, gate da chave, CAS,
   índices/tamanhos/hash, corridas/fences/cancel e cleanup limitado.
4. SDK real no emulador: reserva/tombstone bloqueiam SDK e criação normal;
   isolamento usuário, partes/key inacessíveis, bytes e corridas com serviços reais.
5. Checks dirigidos, revisão, ADR/docs/entrega/AGENTS e commit local.

Sem nova dependência, Storage ou envio a produção. Upload fica em Firestore
privado como entrada não confiável até validar no servidor. API deste marco
não oferece ativação nem declara restauração concluída. Validate completo no
fechamento P1. Decisão de uso do draft foi perguntada; não bloqueia esta transferência.

## Resultado local

Servidor/HTTP/wiring/Rules e fingerprint de arquivo implementados. Testes dirigidos:
17 Node, três Vitest e seis SDK reais positivos, sem pulos.
A [evidência](../../../entregas/2026-10-22-writer-v2-reserva-e-transferencia-de-backups.md)
registra limites e checks finais. Nenhuma raiz de livro é criada.

Antes do próximo writer de preparação: ampliar cleanupVersion/inventário e
certificar ausência de filhos alheios; somente recursos criados pela operação
podem ser adotados/apagados. Validar SHA integral/formato/DTO no servidor,
remapear e reautorizar universo antes da ativação atômica. P1 permanece aberto.
