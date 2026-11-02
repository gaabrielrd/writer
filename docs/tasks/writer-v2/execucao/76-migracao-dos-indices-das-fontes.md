# P1 / M37c — Migração dos índices de fontes preparadas

## Objetivo e escopo

Indexar fontes externas de jobs M37a ainda privados, sem alterar texto, fonte,
partes, pins ou biblioteca. A migração é necessária antes da habilitação integral;
não substitui a certificação/ativação final nem o suporte aos demais campos grandes.

## Contrato e arquivos

- Nova operação interna advanceBookRestoreSourceIndexes depois de resources-finalize,
  com inventário v14 e preparação v11/v12. Sem callable, DTO cliente ou namespace novo.
- Preparação v12 acrescenta sourceIndexes fechado: schemaVersion 1, scanned,
  backfilled, after e complete. Um source por transação, cursor por ID remapeado,
  sem limite de quantidade. Conferir total exato de scene-source antes de complete.
- Fonte, corpo e cada parte exigem journal/recibos/nascimento/última alteração
  próprios. Reutilizar validador puro de parte do leitor de capítulo; expor o
  snapshot nativo somente no helper interno de artefatos, sem repetir leitura de bytes.
- Corpo sem índice recebe apenas sceneSourceEncoding. Índice existente deve ser
  recomputado/conferido; divergência falha sem reparo silencioso. Inline é preservado.
- Atualizar corpo/journal/recibo/cursor atomicamente. Fonte/partes/nascimento/pins
  e artifactCount permanecem; nenhum registro novo é contado como artefato.
  No-op não regrava manifesto/journal, preservando updateTime e prova nativa.
- Replay/CAS/retry não duplicam backfilled. Cancelamento usa o protocolo v14
  existente e aceita recibos da migração; nenhuma fonte/global persona é liberada.
- Somente uma fonte/8 MiB por tentativa em RAM. Ler partes por unidades nativas
  com prova, nunca catálogo inteiro. Completar a varredura não autoriza a raiz.

Arquivos previstos: bookRestoreSourceIndexes/Contracts novos, bookChapterText,
bookRestoreArtifacts, Upload/Contracts, Functions check, fixtures/testes e docs.
Consumidores atuais já reconhecem índice novo; jobs v11 continuam canceláveis.

## Sequência e aceites

1. [x] Preparação v12, invariantes de total/cursor/recibos e compatibilidade v11.
2. [x] Validador puro de parte e snapshots internos, com caminho/escopo/SHA/prova.
3. [x] Migração autenticada por unidade e no-op integral; completar somente após EOF.
4. [x] Node/SDK real: corpo antigo nascido sem índice, mais de uma fonte, inline,
       zero fontes, índice existente, limite de 8 MiB, replay/CAS/retry,
       corrupção/recriação, cancelamento e biblioteca preservada.
5. [x] Revisão, ADR/documentação/evidência e commit local.

## Riscos e limites

Fixtures antigas devem omitir o campo na criação nativa original, mantendo
journal/recibo autênticos; remover campo depois e fabricar timestamps não prova
compatibilidade. SDK exercita o fluxo real com essa representação anterior.

Inventário de caminhos continua v14: a operação só atualiza corpos já registrados.
Implantar leitores de v12/recibos/cleanup e drenar handlers antigos antes de
habilitar a migração. Nenhum deploy agora.

Certificação final ainda deverá reconferir namespaces/fontes/corpos/índices e
origem atual antes da raiz; a varredura não prova ausência de mutação Admin fora
do protocolo. Persistem demais campos grandes, orçamento após remapeamento,
capa/biblioteca, certificação/ativação, limpeza pós-ativação e host/UI/roundtrip/
validate. P1/F2-09 e Writer V2 abertos. Testes dirigidos durante ajustes,
validate no fechamento de P1. CI ignorada; commits locais, sem push/PR/deploy.

## Evidência

[Entrega M37c](../../../entregas/2026-10-23-writer-v2-migracao-dos-indices-das-fontes.md)
e [ADR 0087](../../../decisions/0087-prepared-source-index-migration.md):
430 backend distintos e dois SDK reais positivos. Node cobre 8 MiB/128 partes;
SDK confirma migração/recibos/cleanup e rejeição de parte recriada. Sem ativação,
migração de produção ou conclusão de P1/F2-09.
