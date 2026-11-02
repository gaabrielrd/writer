# ADR 0169 — seleção local de lore indexado na restauração

Status: aceita para implementação local; rollout não executado.
Data: 2026-10-26.

## Decisão

Após a matriz de consumidores e a prova de ciclo ativo inline/v1/v2, selecionar
indexedLoreBodies true na configuração pura bookRestoreRuntime. Os dois pontos
de composição em index (callables e recuperação HTTP) usam a mesma constante.

A factory conserva false para compatibilidade e testes. Novos jobs fixam o modo
na reserva original; retomada obedece à ADR 0168, sem migrar cursor/hash/reserva
antigos. Nenhum input, endpoint, Rule, namespace ou dependência é acrescentado.

Teste comportamental usa essa mesma configuração numa fonte acima de 8 MiB:
ativa, finaliza mídia, limpa preparação e lê conteúdo lógico por SHA/datas/
aliases. Testes menores exercem edição/criação/retirada e exclusão pelos serviços
normais nos três modos e preservam projeto de outra conta.

## Evidência e limites

[Plano 146](../tasks/writer-v2/execucao/146-inventario-e-consumidores-dos-livros-restaurados.md)
e [inventário](../tasks/writer-v2/inventario-portabilidade-livros.md).

Não transforma configuração em deploy. Auditoria operacional de chaves, revisão
de raízes internas antigas sem metadata de persona e coordenação de clientes/
Rules/Admin continuam antes de rollout. P2/P3 e fases posteriores seguem abertas.
