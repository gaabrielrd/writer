# P1 / M38c5p — Checkpoint protegido da criação de lore

## Objetivo

Persistir checkpoint privado e controles paginados do coordenador do plano 112
no ticket v3 do plano 113. Disponibilizar escrita antes da RPC, ponte metadata
do resultado e reconstrução sem envio. Preservar antecessora até troca atômica
e estender descarte para todas as gerações próprias.

## Requisitos e sequência

1. Bundle fechado contém checkpoint privado e páginas até 50; conferir com
   coordenador puro, input/IDs/intenção/controles e wire reconstruído. Captura
   não envia RPC. Ponte metadata permite somente checkpoint sem wire pendente e
   no máximo uma página alterada por resultado; dados autorais são recusados.
2. Acrescentar checkpoint opcional ao ticket v3: active/pending/garbage, outcome
   e receipt. Formatos anteriores de edição e tickets sem checkpoint preservados.
   Frames usam seção checkpoint e gerações próprias, nunca ampliam journal de edição.
3. Escrita AES-GCM particionada, digest cifrado e prefixo conferido antes de append.
   Swap active/ACK/remoção de outcome atômicos após oncomplete/grant fresco.
   Staging divergente é preservado; retry confirma cifra antes de idempotência.
4. Leitura confere SHA/UTF-8/schema/identidade/intenção e grant fresco nas duas
   pontas. Reconciliar outcome sobre a base exata antes de permitir outro pedido.
   Abrir/recuperar não envia RPC e não autoriza prosa por metadados.
5. Coletar antecessora somente após validar sucessora; até 50 frames por lote,
   contador e header na mesma transação. Descarte explicito inclui inventário
   fixo das gerações e fica disponível sem chave após jobs/key fechados.
6. Integrar serviço de checkpoint à preparação/sessão Auth com o mesmo handle
   de posse, sem abrir outro claim. Testes dirigidos, Chromium/reinício,
   revisão/ADR/evidência e commit local.

## Arquivos previstos

Novos serviços CreationCheckpointContracts/Bundle/Journal (crypto se necessário),
testes e harness da feature lore; adaptação de CreationTicketContracts/TicketDb/
Ticket, CreationPreparation e exports. Docs de arquitetura/testes/AGENTS,
execução/plano 81, ADR 0129 e entrega. Sem backend/Rules/UI/dependências.

## Aceite, riscos e fronteira

Cópia incompleta/corrompida não substitui active. Resposta confirmada sobrevive
a erro local por outcome vinculado à base; nova instância reconstrói sem RPC.
Cancel/takeover/actor/perda de autorização impedem novos frames. Coleta/descarte
não atingem draft, active, outra geração/conta/operação ou journals de edição.

Integração do loop de advance/apply, tratamento de adoção própria no encerramento
e host continuam seguintes: o serviço de checkpoint não é o executor durável
completo. Só habilitar UI após essa composição. Lifecycle/consumidores/backup/
rollout e P1/F2-09/V2/fases 3–5/gates humanos/comerciais continuam abertos.
Validate integral no fechamento de P1. Sem CI/push/PR/merge/deploy.

## Resultado local

Armazenamento implementado: bundle/ponte fechados, cifra/prefixo, troca atômica,
coleta por geração e inventário de descarte, compostos na preparação Auth.
250 Vitest distintos em rodadas (29 novos); retakes finais 60/60 e 29/29.
Quatro jornadas Chromium repetidas com reinícios e prefixo interrompido durante
AES-GCM; tipos/build/smoke e lint/arquitetura positivos. Docs/formato/diff
conferidos no fechamento; validate integral continua no fim de P1.

Ver [ADR 0129](../../../decisions/0129-protected-lore-creation-checkpoints.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-checkpoint-protegido-da-criacao-de-lore.md).
Próximo é compor executor advance/apply e encerramento com adoção própria.
Não habilitar UI/novo produtor apenas com o serviço de armazenamento.
