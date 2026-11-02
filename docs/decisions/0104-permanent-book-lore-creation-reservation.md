# ADR 0104 — Reserva permanente da criação de lore

- Estado: aceita para reserva vazia L1; uploads L2 e ativação L3 pendentes.
- Data: 2026-10-24.
- Contexto: [plano 89](../tasks/writer-v2/execucao/89-criacao-do-lore-por-reserva-permanente.md).

## A reserva não é uma ficha

A criação completa exige uma fonte privada sem ficha preexistente. Não fabricar
uma cabeça vazia nem uma inspeção de origem existente para satisfazer o contrato
de edição. L1 implementa somente reserva, cancelamento e suas barreiras.

Intenção fechada contém bookId/creationId. LoreId é derivado no servidor de
UID/intenção; reutilizar creationId do mesmo UID com outra intenção falha.
Contexto imutável users/uid/bookLoreCreations/creationId e marcador
books/bookId/bookLoreReservations/loreId compartilham nascimento/hashes nativos.

Start exige livro próprio ativo, clock válido com capacidade para futura adoção
e slots/recursos conhecidos ausentes. Marca hasLoreResources no mesmo commit,
encaminhando a exclusão futura ao servidor. Não cria cabeça/bytes nem altera
clock lógico, datas, conteúdo, créditos, privacidade ou publicação.

Token/resposta são metadata, não grant de texto. A abertura interna reabre
contexto/marcador originais e livro atual, confere nascimento/dono/deleting/
capacidade de clock, marca servidor e ausência de cabeça/tombstone.
Somente o objeto nativo ligado àquela transação concede capacidade interna.
Mudanças de outras fichas não invalidam uma reserva ainda própria/autorizada.

## Cancelamento e fences

Cancelamento de reserva vazia preserva contexto/marcador e cria evento/prova
imutáveis no mesmo commit. Hash da intenção/contexto, token e nascimentos
impedem assimilar um marcador ou controle recriado.

Antes do start, cancel cria somente fence privado do UID, sem reservar livro
alheio. Esse fence encerra a operação daquele UID; start posterior confirma
cancelled, sem recriar raiz ou fabricar marcador no livro.
Isso não constitui reserva global do ID por um usuário sem autorização.

O primeiro payload exato de cancel é preservado; reutilizar seu operationId
com outro payload falha. Outro pedido de cancel sobre a operação já encerrada
confirma o estado histórico, identificando o primeiro cancelamento.

Contexto/marcador/cancelamento/prova permanecem após revogar origem ou excluir
livro. Consultar/repetir start confirma metadata própria; não concede capacidade
de ler/gravar conteúdo atual ou recriado.

## Limpeza antes do primeiro byte

L1 só cancela preparação vazia. Cabeça, headers, segmentos, gerações, inventário,
leases e jobs de upload/edição conhecidos impedem esse cancelamento. Não se
apagaram bytes nem se provou um inventário que ainda não foi implementado.

Antes de L2 gravar bytes, ampliar o inventário de filhos, criar intenção nativa
de cancelamento que bloqueie novos writes e implementar cleanup limitado dos
filhos antes do evento terminal. A origem dos uploads deve ser a reserva nativa,
sem aceitar token/UID/path alegado como grant.

O inventário v3 do livro acrescenta creations depois de removals. Reabre cada
reserva/fence por cutoff e, para reserva real, exige o livro original.
Cancela preparação vazia na mesma transação do checkpoint, preservando marcadores.
Recursos inesperados bloqueiam a limpeza e ficam intactos para reconciliação.

L3 deve reconhecer adoção nativa e recusar cancelar criação adotada; a exclusão
do livro preservará esse sucesso histórico. Não habilitar produtor antes dessa
extensão, composição/auditoria completas e ativação atômica.

## Guardas e custo

SDK não pode ler/escrever os namespaces privados nem criar/editar IDs realmente
reservados no livro. Outra ficha legada continua utilizável sob os gates atuais.
Análise Admin confere reserva antes de escrever/cobrar.

Leitor completo recusa cabeça prematura com marcador. Até implementar a prova
de adoção em L3, nenhuma cabeça com esse marcador é uma criação ativa válida.
Há uma consulta constante adicional por abertura: v1 base 6/relações 8;
v2 campo com base 7/relações 8, campo sem base 6 leituras, um chunk por unidade.

Sem dependência, callable, worker, UI ou deploy. L2/L3, criação completa e
integração de writers/consumidores/backup/cliente permanecem pendentes.
P1/F2-09/Writer V2 continuam abertos; validate integral no fechamento de P1.
