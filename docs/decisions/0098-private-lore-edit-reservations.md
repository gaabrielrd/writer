# ADR 0098 — Reserva privada dos uploads de lore

- Estado: aceita para reserva/cancelamento internos; compilação, adoção e rollout pendentes.
- Data: 2026-10-23.
- Contexto: [plano 83](../tasks/writer-v2/execucao/83-reserva-dos-uploads-de-lore.md),
  continuidade da [ADR 0097](0097-lore-resource-reachability.md).

## Decisão

users/uid/bookLoreEdits mantém a tentativa privada, operações/âncoras e slots
imutáveis. Início congela sourceToken, inspeção pronta da mesma origem e intenção
de campos/removals/relações. Cada unidade nova reautoriza a inspeção e a origem;
replay confirma o evento próprio sem conceder leitura atual.

A geração preparing deriva do token que incorpora o nascimento do pai. Sua
inicialização e recibo do pai têm o mesmo nascimento nativo. Cada reserva liga
upload selado, alvo, slot, geração e inventário do corpo, alterando job/lease
para reserved junto do recibo. Prosa e ponteiros físicos não vêm no pedido do
pai. Slots e recibos não são autoridade sem suas provas de encarnação.

O upload reserved não aceita cancelamento isolado, append ou novo selo.
Marcador da reserva permanece após o cancelamento. Geração preparing protege
o corpo initializing antes de o compilador ligar suas referências; a API de
aposentadoria de fontes não pode encerrar essa preparação.

Cancelamento próprio fecha preparing em cancelled, irreversivelmente. Não
exige acesso atual à origem; um cancelamento anterior ao início cria fence.
Cleanup percorre um slot por vez, coloca o upload em cancelling e coleta por
unidades de até 16 partes, com header por último. Pai só conta a liberação após
o filho confirmar cancelled; retomadas não recontam.

A coleta usa o guard existente de cabeça/referências. Uma capacidade opaca em
WeakMap liga a transação a snapshots nativos do pai, geração, slot, upload e
lease. Ela autoriza somente a limpeza dos bytes staged daquela reserva após
ausência/deleting/revogação do livro. DTO, clone, outra transação, outro corpo
ou livro recriado não servem. Cabeça com escopo divergente bloqueia por
conservadorismo, inclusive se uma nova autoria tiver regravado essa metadata.

A lease é conferida por nascimento, atualização e hash dentro dessa mesma
transação. Remoções físicas, cursor do inventário, progresso do upload e recibo
do pai são atômicos. Cabeça ativa, referências protetoras e recriações continuam
impedindo a remoção. Sem capacidade nativa, a coleta genérica preserva qualquer
lease e adia livro ausente/deleting.

## Limites e consequências

Nenhuma cabeça, clock ou publicação é alterada. Não há endpoint, worker ou UI.
Cancelamento preserva controles, recibos, slots e lease como fences privados.
Inspeção/certificado histórico não concede leitura da origem nem comprova
disponibilidade atual dos corpos.

Leases adopted, referências da geração completa, materialização inline,
adoção CAS/clock/privacidade/recibo, criação/exclusão e integração dos demais
writers/clientes permanecem necessárias antes de habilitar escrita ativa.
A exclusão atual do livro ainda não cobre esses namespaces. Não há limpeza
automática nova nem autorização de namespace purge.

A verificação de sintaxe usa functions/scripts/check-syntax.mjs, que executa
node --check separadamente para cada módulo .mjs sob functions/src. Isso evita
o limite de linha do Windows sem remover módulos da validação.
