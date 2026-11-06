# 25 — Origem das unidades publicadas e do ciclo atual

Implementação posterior ao incremento 24, ainda sem executar os gates do bloco.
Os resultados históricos de validação não cobrem estes novos arquivos.

## Unidade de integração sem corpo

`readLiteraryIntegrationUnitMetadata`, em `literaryIntegrationSources.mjs`, separa
as fórmulas nativas já usadas pela integração da abertura da prosa. A mesma função
agora serve a `readLiteraryIntegrationMarkup` e ao verificador de impacto.

Para capítulo legado, identidade e token derivam da origem/versão do capítulo.
Para cena, identidade inclui capítulo nativo, ID e nascimento da cena; versão
inclui token do capítulo, stamp da cena, bodyHash e revisão. Cena precisa continuar
ativa, do autor e no capítulo esperado. Não há leitura do corpo canônico neste passo.

A abertura de prosa continua exigindo os tokens capturados antes de chamar os
leitores existentes de capítulo/histórico. A recusa de metadata alterada agora
ocorre antes da abertura dos bytes. Leitura e hash real do corpo continuam nas
rotas já existentes, sem tratamento especial ou permissão de publicação pelo mapa.

O inventário de unidades preserva `identityToken`, `unit.token`, `unit.chapterToken`
e o locator tipado. A captura `integration-unit` distingue versão alterada,
recriação e indisponibilidade. `sourceRepresentation` é metadata-only; nem
`manuscriptRead`, `wholeUnitRead`, `editorialReview` ou `byteIntegrityChecked`
são promovidos a true. Unidade sem a captura original continua pendente.

## Ciclo atual de sequência

`literaryImpactSequenceMembership.mjs` cruza os registros já existentes:

- nascimento nativo da sequência, livro e posição/capítulo congelados;
- ID do ciclo atual e vínculo inverso sequence.id/birth/index no ciclo;
- nascimento nativo do ciclo e workflowBirth salvo;
- recibo original `startLiteraryWorkflow`, autor, livro, fingerprint e nascimento
  do ciclo, com nascimento próprio do recibo.

Somente a combinação coerente permite criar a captura `sequence-workflow`.
Não se adota o nascimento de um ciclo atual apenas porque o ID coincide. A origem
inclui também o nascimento do recibo; recriar o recibo invalida o ponteiro antigo.
Registro ainda incompleto, recibo ausente, ator divergente ou vínculo alterado
mantêm a pendência explícita. Não há reparo ou geração ao consultar o mapa.

O resultado comprova identidade/vínculo, com versão de texto desconhecida.
Cancelamento (`superseded`) conserva a procedência histórica do registro e não
concede execução nem volta a autorizar o ciclo. Não há novo recibo, campo de
execução, coleção, callable, dependência ou escritor.

## Testes preparados e revisão

Sete casos foram acrescentados a `literaryImpactProcessInventory.test.mjs`, além
dos dez do incremento anterior: unidade de cena sem corpo; revisão/composição e
recriação; retirada/arquivo/autoria; capítulo legado; vínculo por recibo; recriação
de ciclo/recibo; registro incompleto ou origem divergente. Os testes verificam
resultados de autorização/origem e ausência de leitura de prosa.

Revisão manual comparou as fórmulas anteriores com a extração metadata, os masks,
o namespace de operações e a reconstrução da captura no mesmo snapshot transacional.
Os testes completos existentes de integração/publicação também precisam rodar no
fechamento por causa da extração do leitor comum.

Nenhum teste, lint, typecheck, formatação, build, navegador, cobertura ou validate
foi executado neste incremento. São 17 casos novos preparados desde o 24; isso
não significa 17 casos aprovados. Arquivos novos precisam de formatação e gates.

## Continuação do objetivo integral

A cobertura do guia público ainda exige índice das evidências e relações,
produzido junto às versões e acompanhado de backfill autorizado. Também faltam
orquestração/fence/cobertura completos e interface de impacto, resolução de
pendências com evidências, portabilidade editorial `.writer` para cópia privada,
auditoria integral dos aceites e cobertura de funções mínima de 90%.

As cinco etapas continuam abertas. Não houve commit, merge de volta, push ou deploy.
