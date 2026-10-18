# ADR 0033 — Variantes inteiras e recuperação protegida da mesa

**Estado:** aceita; C2 concluído tecnicamente em `fe10b15`, CI e regras verdes.
**Data:** 2026-10-15.

## Contexto

Duas mesas precisam adaptar fichas capturadas sem modificar o original ou receber
suas alterações automaticamente. A variante continua derivada: renomear não muda
procedência nem concede acesso após revogação. Notas próprias ficam separadas.
O operador confirmou recuperar rascunhos protegidos após resposta perdida/reload.

## Decisão

Usar sobreposição da entidade inteira, identificada por sourceKey e vinculada à
base ativa e à encarnação precisa da campanha. Modos base/override/removed têm
revisão contínua. Retirar conserva o modo anterior; restaurar o recupera. Descartar
volta à base autorizada e apaga o corpo da variante, mantendo revisão/tombstone.
Não adotar revisão zero nem ressuscitar conteúdo por recibo antigo.

Corpo canônico fica em chunks privados com manifesto/hash e bodyRevision imutável,
separada da revisão do overlay. Remover/restaurar não copia os chunks. Mutações
comparam revisão e gravam corpo, metadados, controle global e recibo atomicamente.
SDK direto continua negado. Listas paginam os itens capturados e consultam overlays;
não juntam duas coleções inteiras. Cursores vinculam projeção/revisão e identidade.

Leituras, mutações e replay autorizam a origem/ficha atual antes de entregar corpo.
Relações só apontam a fichas capturadas autorizadas e não retiradas; nomes efetivos
vêm da base/variante, sem lore vivo ou resolução por nome. Relação indisponível não
entrega tipo, descrição ou nome. O Input do escritor não inclui targetName; a View
projetada inclui. Hash interno é opaco ao cliente porque a projeção pode filtrar.

Reservar pedidos por UID/campanha com IndexedDB e Web Locks. Salvar o ciphertext
binário e aguardar transaction.oncomplete antes de enviar. AES-256-GCM usa chave
aleatória por operação no servidor, sem chave persistida no navegador. AAD vincula
UID/campanha/token/base/ficha/operação/revisão e conjunto ordenado de alvos.

Cada entrega da chave exige autorização atual da ficha e de todos os alvos
congelados, inclusive chave já existente. Corpo cifrado precisa conservar esse
conjunto exato. Chave é entregue pelo callable com App Check preservado e header
private, no-store no callback. Erros anteriores do framework e produção têm provas
separadas. Sem autorização/conexão atual, não recuperar plaintext local.

Confirmação da mutação precisa conferir identidade e conteúdo esperado. Depois,
persistir fase confirmed sem ciphertext antes de encerrar a chave; uma resposta
perdida desse encerramento repete somente a confirmação de metadados. Cancelamento
explícito grava fence sem precisar da origem e não devolve texto/chave. Não usar
cancelamento como consulta automática de um pedido ainda desconhecido.

Troca de conta/base/sessão e mudança de projeção observada invalidam respostas e
trabalho criptográfico em voo, sem apagar automaticamente o journal protegido.
BroadcastChannel transmite apenas sinal opaco; a verdade continua no IDB sob lock.
Sem recursos seguros, leitura online continua e mutações são bloqueadas.

## Consequências

O mestre distingue Lore da mesa de Base congelada. O editor substitui a ficha
inteira; não faz merge por campo, não publica e não promove cânone. Notas C1
continuam autorizadas independentemente da origem.

Rascunho sem seal concluído não promete recuperação integral. Quota local pode
falhar sem truncamento/envio. Gate não apaga bytes já recebidos numa sessão
autorizada e não impede cópia manual. Chaves/pedidos pendentes não têm TTL nesta
etapa; limpeza integral futura deve incluí-los. C3 tratará pedidos da base anterior
explicitamente, sem transferir chave, ciphertext ou revisão automaticamente.

Ver [contrato C2](../tasks/writer-v2/execucao/17-variantes-de-lore-da-campanha.md),
[base congelada](0031-campaign-frozen-bases.md) e [notas próprias](0032-campaign-own-notes.md).
