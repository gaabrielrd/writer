# ADR 0127 — Coordenador cliente da criação nativa de lore

- Data: 2026-10-24.
- Estado: implementado localmente; persistência/host/rollout pendentes.
- Plano: [112 / M38c5n](../tasks/writer-v2/execucao/112-coordenador-cliente-da-criacao-de-lore.md).

## Decisão

Criar um coordenador próprio para a criação, reutilizando schema de campos,
codec, manifestos e parsers de upload/edição. A criação começa sem ficha e
usa a reserva permanente como origem; não fabricar uma captura de edição
nem estender silenciosamente o journal de edição já instalado.

Congelar UID/livro/writeId e dados antes de await. Derivar creationId/loreId/
editId/uploadIds e manifesto por intenção estável. Dados não incluem datas
autoritativas; todo campo presente é enviado, inclusive nome vazio/categoria
padrão. Ausência, vazio, duplicados, BOM/CRLF e relações mantêm seus significados.
Partes de 64 KiB e páginas de 64 relações usam o codec existente.

Uma unidade por advance, com wire/CAS/operationId imutáveis enquanto incertos.
A preparação não cria cabeça; ready e apply são separados. Pedido de apply
incerto continua ready até confirmação explícita; advance não o repete.
Replay confirma o próprio evento sem recriar ficha ou avançar clock novamente.

## Encerramento e prova

Cancelar é lane independente do produtor. A reserva nativa fenceia e coordena
seus filhos/artefatos, sem depender de reenviar prosa ou da resposta pendente.
Erro de CAS no cleanup é reconciliado por get; trocar revisão de cleanup só
ocorre depois da confirmação metadata, preservando o pedido de produção.

Adoção própria exige editId/hash/unitId e progresso nativos correspondentes.
Cancel que perde para apply confirma o próprio evento por metadata; outra
adoção fica em conflict, preservando texto/controles e cabeça ativa.
Conflict não significa jobs fechados nem autoriza liberar chave/purgar cópia.

Respostas tardias não mudam estado encerrado, inclusive contador. Não limpar
recursos por suposição de cancelamento ou usar metadata de sucesso como corpo
atual. Toda escrita continua reautorizada nos serviços de servidor.

## Checkpoint e fronteira Auth

Snapshot é limitado e sem prosa; controles saem em páginas de até 50.
Checkpoint privado contém o wire pendente, inclusive bytes de uma parte.
Preservar em cifra e obter grant fresco antes de reabrir; checkpoint não é grant.

Restauração confere input/manifesta/identidade, controles/hash/cursos/progressos
e reconstrói o wire pendente antes de aceitar a retomada. Abrir não envia RPC.
Controles antes da reserva contêm IDs e progressos nulos; a resposta da reserva
não reescreve todas as páginas de controles.

A sessão Auth oferece prepareCreation usando seu UID. Guardas capturadas
protegem avanço, respostas e leitura de snapshot/checkpoint/controles; trocar
actor exige reabrir. Abortar produção não impede cancelar com actor válido.

## Limites e continuidade

Não há persistência automática de criação nem UI produtora neste incremento.
Próximo: ticket metadata antes de reservar, reconciliação da reserva incerta,
reserva da chave, cópia cifrada/checkpoint e cancel/descarte coordenados.
Antes de existir uma cópia confirmada, não inventar draft após recarga.

Também permanecem exclusão nativa no cliente, lifecycle físico de chaves,
demais writers/consumidores/backup, implantação conjunta/drenagem e validate
de P1. P1/F2-09/Writer V2 e demais fases/gates continuam abertos.
Sem nova dependência, SDK fallback, CI ou envio remoto.
