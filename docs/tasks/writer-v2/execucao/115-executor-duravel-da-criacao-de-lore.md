# P1 / M38c5q — Executor durável da criação de lore

## Objetivo e contrato

Compor preparação/cópia/checkpoint e coordenador puro numa operação Auth:
initialize/advance/apply/cancel/release/discard/readDraft. Confirmar wire antes
de RPC, persistir resultado validado e bloquear outro produtor com dívida local.
Ready conserva cabeça ausente; apply incerto só é reenviado por apply explícito.

## Sequência e arquivos

1. Novo contrato/worker de adoção metadata, com intent exato persistido antes
   de apply. Correlacionar reserva e edição por IDs/hash/token/revisão/operação
   e geração original; nenhuma prova local de sucesso dispensa consultas nativas.
   Confirmar sem chave e preservar conflito/artefatos de outra tentativa.
2. Acrescentar estado opcional ao ticket e integrar bootstrap/fechamento. Distinguir
   cancel nativo de adoção própria confirmada; liberar chave/purgar cópia após
   qualquer fechamento próprio comprovado, preservando cabeça/gerações adotadas.
3. Novo executor compõe o mesmo handle de preparação e checkpoint: guardas
   capturadas, mutex produtor e lanes de cancel independentes. Dívida before/
   after retém bundle/resultado em RAM; cold resume usa cifra/ponte exatas.
   Nunca enviar outro pedido antes de resolver a gravação; não repetir apply
   por advance, initialize ou reconciliação.
4. Sessão Auth expõe criação durável e retomada. Inicialização pode reconciliar
   reservas/chaves/GETs pendentes, sem envio automático de bytes/apply.
   Cancel/release/discard continuam disponíveis sem decrypt ou produtor respondido.
5. Testes dirigidos e Chromium real com reload/reinício, falhas e concorrência;
   tipos/build/lint/revisão/ADR/evidência e commit somente local.

Arquivos: serviços CreationAdoptionContracts/Worker, CreationDurableOperation,
CreationPreparation/TicketContracts/TicketDb, EditService e exports; testes/
harness da feature lore, plano/ADR 0130/entrega, arquitetura/testes/AGENTS/execução.

## Aceite e riscos

Fluxo completo literal chega a ready e aplica uma vez, inclusive após reload.
Resposta aceita ou ACK local perdido não perde wire nem inventa draft.
Cancel com produtor/chave/crypto pendentes fecha a reserva sem esperar;
se apply vence, confirmar a adoção própria por metadata antes de liberar/purgar.
Adversário com mesmo editId/revisão mas hash/token diferentes fica em conflito.
Troca de actor/host/tomada de posse bloqueia envio, retorno privado e writes.

Guardar checkpoints não basta: avanço precisa usar exclusivamente o port
com write-ahead, resultado e guardas. Metadados de prova não concedem leitura
nem representam o corpo atual; não limpar recursos adotados ao descartar cópia.
Nenhuma mudança de backend/Rules/dependências/UI ou ativação do compêndio aqui.
Host/exclusão/lifecycle/consumidores/backup/rollout e validate integral de P1
seguem próximos. P1/F2-09/V2/fases 3–5/gates humanos/comerciais abertos.
Sem CI/push/PR/merge/deploy. Testes direcionados; validate no fechamento de P1.

## Resultado local

Executor/fechamento implementados e compostos na sessão Auth. 274 Vitest
distintos positivos em rodadas, em 12 arquivos (24 novos); retake final de quatro
casos afetados passou. Cinco jornadas Chromium reais da API com
reinício, apply/append perdidos e resposta retida passaram; tipos/build/smoke,
lint/arquitetura positivos. Formato/docs/diff conferidos no fechamento.

Ver [ADR 0130](../../../decisions/0130-durable-lore-creation-executor.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-executor-duravel-da-criacao-de-lore.md).
Próximo: host de criação e exclusão nativa do cliente antes da entrada
coordenada no compêndio. Demais portões e validate de P1 continuam abertos.
