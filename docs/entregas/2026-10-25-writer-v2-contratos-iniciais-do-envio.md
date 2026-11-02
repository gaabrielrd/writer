# Writer V2 — contratos iniciais de envio e IDs válidos

## Resultado parcial

O cliente passa a conferir IDs de restauração/operação com a mesma regra real
do servidor antes de persistir um pedido. UID conserva seu contrato próprio.
Evita guardar uma intenção que nunca poderia ser aceita pela API. Ciphertext
inválido continua preservado; não renomear operação pendente automaticamente.

Acrescentados contratos fechados de origem e start, cópias imutáveis sem prosa/
arquivo/chave, hash metadata canônico compatível com servidor e namespace
determinístico de operação por job/índice. Esses contratos ainda não executam
upload e não confirmam a fórmula de checkpoint: essa prova continua no
[plano 139](../tasks/writer-v2/execucao/139-restauracao-de-livros-no-estudio.md).

## Testes dirigidos

65 Vitest distintos positivos em seleções: 53 driver, sete contratos de
transferência, três regressões afetadas de crypto/journal e duas integrações
de preparação com serviço real. Um cenário Chromium do driver/journal nativos
também repetido positivamente após reinício; não é teste de upload ou UI.

Primeiro lote de transferência teve 5/6 positivos, 677 ms. Fixture usava ID menor
que o mínimo do servidor; a comparação real também revelou que o validador
genérico anterior do cliente aceitava IDs inadequados para pedidos.
Alinhado o contrato e ajustadas apenas fixtures que pretendiam IDs válidos.

Lote driver/transferência: 59/60 positivos, 1.03 s; uma variação de identidade
ainda usava ID inválido e foi corrigida. Repetido somente esse caso: 1/1,
697 ms (seis não selecionados). Três regressões afetadas: 3/3, 802 ms
(19 não selecionados). Integrações reais atual/JSON v6: 2/2, 2.43 s.
Não contar seleções por nome como testes executados ou aumentar total por repetições.

Paridade de hash comprovada contra requestHash/startInput reais para arquivo
atual e JSON v1–v6, incluindo ordenação, arrays e Unicode. Limites reais de
ID, escopo completo, origem/tamanho/versão inválidos e campos secretos extras
recusados. Driver não salva nem envia IDs inválidos. Dados e servidor não foram
alterados para acomodar fixtures.

## Checks e limites

Formato, lint dirigido, typecheck, arquitetura, documentação e diff verificados
no fechamento. Revisão conferiu IDs por papel, contrato fechado e paridade
canônica. Sem dependência ou endpoint novo; nenhuma alteração de Rules.

É o início do plano 139: inspeção/revisão de arquivo, bootstrap durável, upload,
revisão/ativação/mídia/limpeza do cliente e tela continuam por implementar.
P1/V2, inventários/writers/exclusão/legados/rollout/validate, fases 3–5 e gates
humanos/comerciais permanecem abertos. Padrão indexado false.
Build/validate global não repetidos; só commit local, sem CI/push/PR/merge/deploy.
