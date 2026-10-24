# P1 / M38c3l — Criação do lore por reserva permanente

## Resultado completo exigido

Criar fichas de qualquer tamanho aceito pelo contrato portátil sem cabeça visível
até confirmar nome/categoria, campos e páginas certificados. A criação completa
exige reserva, upload sem ficha preexistente, composição/auditoria e ativação
atômica de cabeça/geração/leases/clock/recibo. Reserva isolada não entrega criação.

## Sequência obrigatória

1. L1, neste incremento: reservar um ID derivado no servidor de UID/livro/
   creationId, sem conteúdo no contexto. Raiz privada imutável bookLoreCreations
   e marcador bookLoreReservations compartilham nascimento. Preparação vazia
   marca hasLoreResources sem avançar clock/prosa/publicação. Start/get/retry
   históricos não recriam raiz ou ID.
2. Cancelamento e cancel-before-start com fence permanente e prova nativa;
   autorização interna ligada à transação exige reserva original, livro próprio
   ativo e cabeça/tombstone ausentes. IDs não voltam a ficar disponíveis.
   Contextos são privados, SDK/análise/readers recusam ID reservado prematuro.
3. Integrar reserva vazia à etapa creations da exclusão do livro. Conferir cutoff
   e originalidade, cancelar na mesma transação do checkpoint e preservar fences.
   Recursos inesperados bloqueiam cancelar; não varrer namespaces nem declarar
   limpeza de payload ainda não implementada.
4. L2, próximo incremento: fonte privada de criação nos uploads, manifestos e
   leases vinculados à reserva nativa, sem fabricar uma cabeça ou uma inspeção
   de ficha existente. Estender inventário/cancelamento para todos os filhos
   antes de permitir o primeiro byte; reautorizar livro/reserva em cada unidade.
5. L3: compor geração sem base, todos os campos obrigatórios e páginas explícitos;
   auditar partes/domínio/SHA, congelar tentativa e ativar cabeça/geração/leases/
   clock/datas/recibo juntos. Reserva fica histórica; confirmar pedidos antigos
   sem recriar ficha após exclusão. Consentimento novo é privado por padrão,
   true só explícito, sem publicação automática.
6. Integrar criação aos writers/consumidores/backup/cliente e recuperação, junto
   das demais etapas do plano 81; não expor endpoint/UI antes dos gates.
   Roteamento de preparações sem marca também continua obrigatório.

## Contratos de L1

Intenção fechada bookId/creationId; loreId e startHash derivados no servidor.
Job/contexto imutável e prova permanente de cancelamento acoplada por nascimento/
hash; jobToken não é grant de texto. Reusar creationId com outra intenção falha.

Cancel-before-start cria somente fence privado do UID, sem reservar namespace
de livro alheio. Cancelar uma reserva confirma marcador original e ausência
de filhos conhecidos; bloqueia se bytes/gerações/leases/jobs já existirem.
L2 deve ampliar esse cancelamento antes de habilitar seus produtores.

O marcador e o contexto não são removidos ao cancelar ou excluir livro.
Leitor completo bloqueia cabeça criada indevidamente em ID ainda reservado.
Até L3, nenhuma cabeça com esse marcador é uma ficha ativa válida.

## Arquivos e validação

Contratos/store/serviço internos e coordenação do inventário de livro; Rules,
guardas do reader/análise e testes Node/SDK. Sem dependência, callable ou UI.

Aceites L1: somente autor/livro ativo, clock válido com capacidade para ativação,
reserva e marcador nativos atômicos, cabeça sempre ausente, ausência de prosa
e de débito, clocks/datas/publicação preservados, cancel/retry/concorrência/
rollback, fences antes do start e após revogação, marcador/contexto/livro
recriados recusados, bytes inesperados preservados, limpeza do livro retomável.
Controles positivos SDK devem demonstrar outra ficha editável/criável e negação
específica do ID reservado, além de negação dos namespaces privados.

Checks estáticos, docs/ADR/AGENTS/evidência e commit somente local.
Rodar testes dirigidos; validate integral no fechamento de P1, sem CI/deploy.
L2/L3 e criação completa permanecem pendentes após L1; P1/F2-09/V2 abertos.

## Evidência e estado de L1

[Entrega](../../../entregas/2026-10-24-writer-v2-reserva-permanente-da-criacao-de-lore.md)
e [ADR 0104](../../../decisions/0104-permanent-book-lore-creation-reservation.md):
336 Node e três SDK distintos positivos; arquitetura, lint corrigido e sintaxe
dos 213 módulos passaram. Sem cabeça/bytes/endpoint/UI habilitados.

L1 implementado tecnicamente. L2 deve criar intenção nativa de cancelamento
que impeça novos writes e limpar filhos antes do evento terminal. Somente então
habilitar bytes de criação. L3 deve reconhecer adoção nativa, recusar cancelá-la
e preservar esse sucesso na exclusão do livro. Criação completa e as integrações
continuam pendentes. Validate integral no fim de P1, sem CI/push/deploy.

## Evidência e estado de L2

[Plano 90](90-uploads-vinculados-a-criacao-de-lore.md),
[entrega](../../../entregas/2026-10-24-writer-v2-uploads-vinculados-a-criacao-de-lore.md)
e [ADR 0105](../../../decisions/0105-native-creation-field-uploads.md):
294 Node e quatro SDK distintos positivos. L2 prepara campos/páginas sob
reserva nativa, com intenção de cancel, inventário e cleanup coordenado.
Não cria cabeça ou inspeção falsa.

Próximo L3: congelar seleção/tentativa, reservar uploads para geração e ampliar
cleanup de filhos reserved, compor/auditar sem base e ativar cabeça/geração/
leases/clock/datas/recibo atomicamente. Adoção preserva sucesso histórico.
Criação completa e demais integrações continuam pendentes, sem endpoint/UI.

## Avanço de L3 — composição e cancelamento

[Plano 91](91-composicao-do-lore-a-partir-da-reserva.md) e [evidência](../../../entregas/2026-10-24-writer-v2-composicao-do-lore-a-partir-da-reserva.md):
L3A compõe/audita sem base, fixa tentativas nativas e coordena cleanup de reserved.
314 Node distintos e quatro SDK positivos. L3B ainda deve ativar cabeça/geração/
leases/clock/datas/recibo e conservar sucesso histórico após edição/retirada/
exclusão do livro. Criação completa permanece pendente, sem endpoint/UI.

## Ativação de L3 — L3B

[Plano 92](92-ativacao-atomica-da-criacao-de-lore.md) implementa ativação interna
de cabeça/geração/leases lógicas/clock/datas/recibo e sucesso do criador juntos.
Reader exige nascimento original; reedição/retirada/exclusão preservam a prova
histórica e retry não recria ficha. Demais writers/consumidores/backup/cliente e
habilitação continuam obrigatórios, sem endpoint/UI neste passo.
