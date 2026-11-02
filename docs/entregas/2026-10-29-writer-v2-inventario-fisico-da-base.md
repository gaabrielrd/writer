# Writer V2 — inventário físico e auditoria da base congelada

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 207](../tasks/writer-v2/execucao/207-inventario-fisico-e-auditoria-da-base.md).
- Decisão: [ADR 0237](../decisions/0237-campaign-frozen-physical-inventory.md).
- Macro 8/35 e P3/D/F2-09 abertos; somente commit local.

## Implementado

Inventário paginado das quatro famílias físicas restantes, com provas por
recurso/dependências e lookahead. Corpos e manifests são conferidos nos dois
sentidos; links exigem origem e alvos tipados; ledger exige captura coerente e
testemunha. Imagens exigem bloco/pin/uso próprios, com indisponibilidade explícita
quando biblioteca/uso somem. Listagem não lê prosa; revogadas não expõem manifests.

Auditoria servidor lê partes de todos os campos de um item e confere SHA/bytes
integrais sem concatenar o texto. Snapshot e DTOs de recursos são fechados e
lidos por partes, com SHA total. Imagens portáteis não levam paths/geração/URLs.

Leitura de corpo compartilhada com 206 e validadores extraídos sem mudar os
reexports existentes. Um override local de índice habilita somente image.imageKey
sob o mapa image já sem indexação.

## Testes e evidência real

- 26 testes Node novos passaram, saída 0, 688,3536 ms. Incluem quatro famílias,
  ausência/órfãos nos dois sentidos, auditoria SHA multichunk, provas nativas
  mesmo com bytes idênticos, indisponibilidade original/revogação, 43 corpos
  paginados, pins, tipos/escopos, fonte/C4/adoção e pedido desprendido.
- 31 regressões Node dos leitores afetados passaram, saída 0, 673,8905 ms.
- 29 Vitest do fluxo cliente usando backend real passaram, saída 0, duração
  3,24 s (269 ms de testes).
- O primeiro conjunto de 23 testes passou. Ao acrescentar casos, o fixture que
  tentava vincular ficha inexistente foi corretamente recusado pelo escritor.
  Corrigido para criar, vincular e excluir pela API real antes da captura;
  a indisponibilidade original passou sem enfraquecer produção.
- Lint inicial apontou refreshBase não usado; o caso de snapshot multichunk passou
  a usá-lo para renovar a origem após alterar a base no fixture. Lint final
  dos nove arquivos passou, saída 0. Formato dos 18 arquivos, diff e scan de
  segredos/artefatos grandes passaram. Documentação foi conferida após corrigir
  a marcação do comando validate, que o primeiro check interpretou com dois-pontos.

## Revisão e limites

São 86 testes distintos dirigidos, sem executar suítes não afetadas. Não rodou
`npm run validate`: reservado ao fechamento do grande bloco P3 por orientação do
operador. Nenhuma alegação de validação integral deste bloco ou CI.

Não há novos produtores persistentes, endpoints, Rules, dependências ou segredo.
O índice não foi implantado e suas queries não foram verificadas com índices
ativos/credenciais reais; o teste de configuração não substitui essa prova.
Storage/binários não foram lidos. Arquivo completo/segunda passagem conjunta,
variantes/legadas, procedência/atestado, restauração e UI/ciclo seguem pendentes.
Auditoria de bytes por item não autoriza restauração nem certifica arquivo inteiro.
