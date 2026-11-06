# ADR 0287 — associações históricas dos ciclos de revisão

- Estado: implementada localmente; testes preparados sem execução.
- Data: 2026-11-03.

## Contexto

O ciclo de revisão guarda censo e associações; achados e citações pertencem aos
pedidos de prosa. O leitor interativo também altera o job quando encontra origem
stale. Usá-lo diretamente no backup produziria escrita durante a captura.
IDs reutilizados não provam que o pedido atual é o originalmente analisado.

## Decisão

Compartilhar inspeção de origem sem mutação e manter a transição stale no fluxo
interativo. Preservar job, unidade e análise em famílias internas distintas.
Relatórios de prosa continuam únicos e passam por autorização independente:
deriva do agregado não revoga sozinha a leitura histórica permitida por Prose.

Registrar testemunhos privados de nascimento dos pais e pedidos junto aos novos
registros nativos. Não migrar vínculos antigos por observação atual. Conferir
nascimento antes do cabeçalho do pedido; ausência ou recriação deixa a referência
original indisponível. Manter o DTO público anterior das análises.

Acrescentar chapter-scenes ao escopo portátil e analyses aos contadores históricos.
Representar censo parcial explicitamente. Checkpoints permanecem desabilitados,
privados e sem grant, inclusive depois de remapear IDs.

## Consequências

Dezessete famílias internas, sem endpoint ou produtor novo. Bundles de revisão
limitados a três artefatos/1 MiB, partes de 64 KiB. Nenhuma duplicação de citações
ou retomada de jobs. Dezesseis casos preparados, nenhum executado. Produtor e
restauração v2 continuam fechados. Ver o
[incremento 39](../tasks/producao-literaria/39-captura-de-ciclos-de-revisao.md).
