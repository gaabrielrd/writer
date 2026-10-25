# P1 / M38c5t — Retirada recuperável de lore

## Objetivo e requisitos

Compor o transporte da ADR 0132 em executor recuperável, preparando a prova
da origem sem retirar a ficha. Retirada só por apply explícito; abrir/retomar/
advance com start incerto consulta evento próprio sem reenviar o start.

1. Journal separado writer.book-lore-removals v1, apenas metadata fechada:
   conta/livro/ficha/writeId/sourceToken, inspeção, intenção original, progresso,
   wire pendente, flags de cancelamento e stamp. Sem nome/prosa/chave/PDF.
   Não migrar nem ampliar stores/formatos cifrados de edição/criação.
2. IDs determinísticos por tentativa e origem; estado/tokens/pedidos validados,
   CAS integral e Web Locks curtos. Esperar oncomplete antes de RPC. Falha de
   gravação bloqueia produtor; resultado em RAM pendente só é gravado no retry,
   sem iniciar outra unidade. Metadata lista até 50 por conta.
3. Criar/retomar não envia RPC. Advance prepara inspeção até ready e para;
   apply congela intenção e grava wire antes de start destrutivo. Consulta
   original resolve resposta perdida; nunca adotar outra cabeça/recriar ID.
4. Limpeza usa pedido/revisão/recibo próprios, em unidades nativas. Handoff
   para exclusão do livro passa a consultar metadata, sem cursor individual.
5. Cancelamento persiste intenção independente de RPC pendente e fecha a
   inspeção original. Depois consulta retirada original: se venceu a corrida,
   mantém retirada/cleanup; caso ausente após fence, confirma cancelamento.
   Resposta antiga não reabre produção nem restaura conteúdo.
6. Sessão Auth captura actor/host antes/depois de I/O; retomada confere livro.
   Preservar entrada separada, regras e allowlists 18/22/7 existentes.

## Arquivos previstos e sequência

1. Contratos puros de estado/wire/progresso e plano.
2. Adaptador IndexedDB metadata, CAS/oncomplete/lista.
3. Executor com dívida, confirmação explícita e cancelamento independente.
4. Composição na RemovalService, testes dirigidos/native/Chromium de recarga,
   tipos/build/checks/revisão, ADR 0133 e evidência/commit local.

## Aceite e riscos

Preparar/abrir não retira. Recarregar start incerto não repete start.
Apply explícito usa somente a intenção original. Clock/tombstone avançam
uma vez. Cancel durante start/inspeção não perde controle nem revive produção.
Falha local antes/depois de RPC preserva recuperação e não produz outra unidade.
Duas abas usam CAS, wire original e monotonicidade. Origem/conta erradas falham.
Recursos alheios e ficheiros de criação/edição ficam intactos.

O fence de inspeção e a retirada são transacionais no servidor; cancelar
preparação não desfaz retirada confirmada. Histórico com handoff não autoriza
cleanup individual. Metadata local não concede acesso ao texto nem substitui
revalidação servidor.

Sem UI/entrada no compêndio, deps, Rules, env, remoto ou deploy. Host visual
vem depois. Lifecycle, consumidores/backup/rollout e validate integral de P1
continuam necessários. P1/F2-09/V2/fases 3–5/gates humanos/comerciais abertos.
Testes dirigidos durante ajustes; validate no fechamento de P1.

## Resultado local

Journal próprio, executor e composição Auth implementados. 43 Vitest
distintos positivos (30 novos), três jornadas Chromium repetidas após ajuste
final e tipos/build/smoke/lint positivos. Revisão bloqueou ACK local tardio
antes do produtor e exige confirmação remota na retomada de conclusão.

[ADR 0133](../../../decisions/0133-recoverable-lore-removal.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-retirada-recuperavel-de-lore.md).
API interna; host visual e compêndio são próximos. Lifecycle/consumidores/
backup/rollout/validate integral e demais fases/gates continuam abertos.
Sem CI/envio remoto/deploy.
