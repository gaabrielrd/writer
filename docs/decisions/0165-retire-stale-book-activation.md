# ADR 0165 — retirada atômica da ativação com revisão antiga

Status: aceita para incremento local; P1 e rollout pendentes.
Data: 2026-10-25.

## Problema

A revisão exige confirmação nova quando o acesso ao universo muda. O pedido
original fica corretamente preservado no journal, mas activation-review-changed
não avança checkpoint nem grava recibo. Unknown no mesmo checkpoint não permite
apagá-lo: outra tentativa ainda pode estar em trânsito.

## Decisão

Adicionar retireBookRestoreActivation com entrada fechada idêntica à ativação.
O servidor deriva o fingerprint de activateBookRestore, reautoriza conta/job/
reserva/raiz ausente e arbitra no mesmo operationId em transação:

- Recibo existente: devolver a ativação ou retirada original, sem efeitos novos.
- Sem recibo: exigir mesmo checkpoint e activation-ready/schema13, conferir selo
  nativo atual/âncora, copiar a preparação e trocar somente audit.sealOperationId
  para o próprio operationId. Avançar checkpoint e gravar recibo explícito
  retireBookRestoreActivation com fingerprint original, atomicamente.

Nenhuma raiz, contagem, universo, mídia, perfil ou chave muda. Recibo da retirada
passa a certificar o mesmo audit congelado, com identidade nova. Revisão aceita
selo advanceBookRestoreAudit ou retirada, ambos com checkpoint/preparação exatos
e nascimento nativo original. Não reler cadeia ilimitada de selos.

Replay da ativação antiga encontra retirada e não executa, mesmo se a origem
voltar a estar disponível. ID/token/revisão divergentes não podem reaproveitar
o recibo. Se ativação vencer a corrida, retirada devolve a confirmação original.

## Cliente e histórico

Somente erro definitivo activation-review-changed dispara a retirada. Erro de
transporte ou unknown isolado mantém a intenção. Chamada usa a mesma metadata
já persistida; sem segunda intenção, chave ou schema de journal. Após conferir
recibo, apagar por CAS. Perda da resposta permite restart/replay original;
conta inválida ou CAS diferente preservam o journal.

Host reapresenta a revisão atual sem ativar automaticamente. Nova criação exige
outro clique explícito. Recibo histórico não concede acesso ao livro.

Leitor histórico admite mudança de identidade do selo somente para recibo
advanceBookRestoreAudit/retireBookRestoreActivation com audit done, selo anterior
igual ao próprio operationId, checkpoint estritamente anterior e todo o audit
congelado idêntico exceto sealOperationId. Demais diferenças continuam recusadas.
Limpeza exige também nascimento imutável anterior à ativação, como antes.

## Validação e limites

[Plano 142](../tasks/writer-v2/execucao/142-revisao-alterada-na-ativacao.md)
e [evidência](../entregas/2026-10-25-writer-v2-revisao-renovada-na-ativacao.md).
API nova exige implantação coordenada; nada foi enviado ou implantado.
Inventário geral, migração/certificação v1, coleta, rollout e validate de P1
continuam, assim como fases 3–5 e gates humanos/comerciais.
