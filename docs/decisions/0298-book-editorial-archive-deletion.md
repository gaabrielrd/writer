# ADR 0298 — arquivo editorial no protocolo de exclusão do livro

- Estado: implementação local; testes preparados sem execução.
- Data: 2026-11-04.

## Contexto

O processo restaurado acrescenta partes, corpos, registros históricos e revisões
pendentes. A exclusão de livro já possui checkpoint retomável, mas suas coleções
planas anteriores não cobrem esses recursos. Um checkpoint antigo pode ter passado
pelo ponto de entrada de uma fase nova.

## Decisão

Compartilhar somente endereços por bookEditorialStorage e integrar um plano de
limpeza autorizado ao deleteSceneBook existente. Exigir dono, deleting e publicação
revogada. Consultar partes antes de corpos/headers, sem carregar conteúdo; manter
páginas de até50 e commit de remoções/contagem/checkpoint/recibo pelo caller.

Acrescentar fase editorial-archive e conferir vazio novamente antes da raiz.
Retomar essa fase quando finish encontrar qualquer recurso restante, cobrindo
checkpoints 1–3 sem alterar o protocolo de lore. Preservar outras cópias, biblioteca
e metadata externa ao livro. Não usar grants ou chaves antigas de restauração.

## Consequências

Whole-book deletion remove todos os filhos desse escopo; cancelar um job privado
continua exigindo seu próprio inventário/provas, sem adotar recursos estranhos.
A integração é pré-requisito de ativação, não sua autorização. Leitores, recaptura,
revisão/ativação e gates integrais continuam pendentes. Ver
[incremento50](../tasks/producao-literaria/50-exclusao-do-arquivo-editorial.md).
