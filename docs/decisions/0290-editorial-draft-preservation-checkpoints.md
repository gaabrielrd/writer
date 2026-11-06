# ADR 0290 — checkpoints históricos de redação e preservação

- Estado: implementada localmente; testes preparados sem execução.
- Data: 2026-11-03.

## Contexto

Jobs de primeira versão e preservação guardam estado técnico, instrução própria e
associações a propostas/versões. Seus IDs sozinhos não provam nascimento original.
Copiar registros brutos transportaria autorizações de execução e duplicaria corpos.

## Decisão

Projetar jobs/unidades por máscaras metadata em checkpoints privados/desabilitados,
com instrução/configuração histórica separada. Acrescentar preservation e contadores
verifiedUnits/adoptedUnits para evitar equivaler preservação a revisão ou adoção a
geração debitada.

Fixar testemunhos privados de nascimento nos novos escritores: capítulo no job,
pai/cena na enumeração, proposta na passagem nativa para aceite, versão na adoção ou
confirmação da preservação. Comparar revisão/cobertura/geração da resposta antes de
fixar proposta. Preservar DTOs públicos e transações de crédito existentes.

Não fazer backfill de legado por observação atual. Recriações mantêm referência
original indisponível. Reautorizar proposta pelo gate Prose, comparando nascimento
antes do cabeçalho; histórico usa metadata e hash verdadeiro, sem corpos. A captura
não escreve estado ou retoma execução.

## Consequências

28 famílias internas, bundles de até dois artefatos/1 MiB, partes de 64 KiB. Dezoito
casos preparados com serviços nativos, nenhum executado. Produtor/restauração v2 e
fechamento integral continuam pendentes. Detalhes no
[incremento 42](../tasks/producao-literaria/42-checkpoints-de-redacao-e-preservacao.md).
