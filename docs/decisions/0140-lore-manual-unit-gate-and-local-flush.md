# ADR 0140 — Gate metadata e salvamento local da edição protegida

- Status: aceito, marco A implementado localmente.
- Data: 2026-10-25.
- Plano: [125 / visibilidade da seleção](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md).

## Contexto

O coordenador de visibilidade deve registrar referências originais de seus
filhos antes da chamada nativa. Uma RPC pode ser aceita e perder a resposta;
um checkpoint pode continuar com apply pendente depois de recarregar.
Salvar a cópia protegida não deve repetir esse apply nem iniciar outra unidade.

A sessão manual já oferece reserva, journal cifrado, checkpoint e cancelamento.
Faltavam uma oportunidade assíncrona de confirmar metadata do coordenador antes
do envio e uma operação para gravar dívida local sem dirigir a produção.

## Decisão

BookLoreManualOptions aceita beforeUnit, capturado na construção da operação.
O gate recebe uma cópia congelada da metadata fechada produzida por journalWire:
lane, method, id, startHash, jobToken, operationId, expectedRevision e requestHash.
Nenhum input, prosa, manifest, bytes ou chave passa ao callback.

O gate roda depois do write-ahead cifrado e antes da RPC de edição, incluindo
unidades de diagnóstico/cleanup. Erro bloqueia o envio e preserva a unidade
pendente. Depois do await, revalidar actor, contexto e ticket/cancelamento.
Não manter transação IDB ou lock de rede durante o callback. O coordenador
continua responsável por persistir suas referências e fechar IDs no cancel.

Adicionar flushLocal à operação persistida e à manual. Sem RPC de edição:
inicializar/restaurar somente o estado local quando necessário e gravar
checkpoint/dívida. Antes da reserva, pode criar o ticket local, mas não reserva
chave no servidor. Se precisar abrir conteúdo protegido já existente, a leitura
de chave continua sujeita à autorização original; não contornar seu serviço.
Flush com uma unidade de edição em andamento no controlador falha
imediatamente, sem aguardar a rede. O bootstrap local também não aguarda
uma reserva remota pendente nem a confirma.

Flush frio pode restaurar um checkpoint com apply pendente, mas não o envia
nem certifica aplicação. A consulta histórica da ADR 0139 continua necessária.
Cancelamento por handle fresco permanece independente do gate retido e não
precisa obter chave ou aguardar o produtor. O produtor antigo revalida o ticket
antes do envio e falha quando o encerramento venceu.

## Consequências e limites

Sessões manual/resume encaminham a opção, preservando os demais factories.
Sem gate configurado, contratos existentes permanecem. Nenhum campo novo
em snapshots cifrados/identidades, DB, método de wire, backend ou Rules.

Este marco não implementa manifesto, executor, resultados de no-op, revisão,
retomada visual ou montagem da seleção de visibilidade. Não altera o driver da
interface manual existente; o coordenador novo deve distinguir flush, consulta
e reenvio explicitamente. O plano 125 e o bloco P1 continuam abertos.
