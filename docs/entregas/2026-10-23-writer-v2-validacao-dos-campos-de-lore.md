# Writer V2 — Validação incremental dos campos e proteção do lore (M38c3a)

- **Data**: 2026-10-23
- **Branch**: codex/writer-v2
- **Plano de origem**: [M38c3, passo 1](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md)
- **Decisão**: [ADR 0093](../decisions/0093-streamed-lore-field-validation.md)

## Objetivo

Preparar a validação de uploads de campos extensos por unidades e impedir
mutações SDK de stubs. Esta entrega é um pré-requisito: ainda não oferece
edição, criação ou exclusão servidor de uma ficha em payloads.

## Funcionalidades entregues

- Validação de UTF-8/JSON canônico e domínio por unidades de até 64 KiB.
- Retomada por checkpoint pequeno, sem guardar texto livre ou listas completas.
- Aceitação de texto acima de 8 MiB/128 partes, aliases extensos e páginas
  de relações maiores que um documento, sem normalizar valores.
- Rules negam criação/edição/replace/remoção/exclusão SDK de payloadStorage,
  inclusive quando inválido/null e durante cleanup deleting.
- CRUD inline mantém clock, revogação e cleanup existentes.

## Critérios de aceite iniciais

- [x] Strings/aliases/structuredDetails/categoria/booleano/relações validados.
- [x] Fronteiras de UTF-8, escapes, chaves e literais atravessam checkpoint/reload.
- [x] JSON incompleto, não canônico ou fora do domínio não recebe EOF positivo.
- [x] Estado não cresce com o texto nem com a quantidade de aliases/relações.
- [x] Avanço inválido não modifica a base; retry válido pode continuar.
- [x] IDs usam os limites portáteis, inclusive duas partes de 1500 bytes.
- [x] Rules protegem stubs mesmo com os outros gates satisfeitos.
- [x] Controles positivos inline e gates existentes passam no SDK.
- [ ] Upload, recibos/hash/selo, geração ativa, writers/GC e cliente ainda pendentes.

## Arquivos alterados

| Grupo                                                          | Alteração                                     |
| -------------------------------------------------------------- | --------------------------------------------- |
| functions/src/bookLoreFieldValidation.mjs                      | Parser incremental puro e checkpoint fechado  |
| functions/test/bookLoreFieldValidation.test.mjs                | 93 cenários Node                              |
| firestore.rules                                                | Guardas por presença de payloadStorage        |
| tests/firestore/book-local-lore.rules.test.mjs                 | Três cenários SDK novos e controles positivos |
| functions/package.json                                         | Novo módulo no check de sintaxe               |
| Plano 81, plano 80, ADR, AGENTS, README, arquitetura e testing | Sequência completa, contrato e evidência      |

## Testes e resultado real

**93 testes Node distintos positivos** no arquivo do validador. A execução
final, após conferir o formato do checkpoint, registrou:

```text
tests 93
pass 93
fail 0
skipped 0
duration_ms 479.005
```

Incluem os oito tipos de campo; todos os splits de casos UTF-8/escape/chaves;
texto de mais de 8 MiB, 50.000 aliases, página de 64 relações acima de 1 MiB;
IDs qualificados no limite; UTF-8 overlong/surrogate/fora de faixa; JSON
redundante, tipos errados, chaves duplicadas/desconhecidas e conteúdo truncado.
160 fixtures determinísticas válidas foram comparadas ao schema portátil;
não são contadas como 160 testes distintos adicionais.

Estado de texto/aliases ficou abaixo de 1 KiB nos cenários extensos. Página e
target qualificado ficaram abaixo de 8 KiB. O parser não retorna o texto: valida
os bytes sem modificá-los, e não prova SHA, origem ou autorização.

**Sete cenários SDK distintos positivos**, Firestore 1.22.0 verificado,
loopback dedicado e projeto demo:

```text
tests 7
pass 7
fail 0
skipped 0
duration_ms 9071.0987
```

São quatro regressões de clock/CRUD/privacidade e três novos cenários de
presença do ponteiro. Os três novos receberam controles positivos com o mesmo
clock/revogação e foram repetidos isoladamente:

```text
tests 3
pass 3
fail 0
skipped 0
duration_ms 5551.9841
```

Não somar essa repetição como dez cenários distintos. Os controles confirmam
criação/edição inline com as mesmas condições de livro/publicação; o payload
permanece intacto. Durante deleting, remover inline funciona e remover stub
falha. Corpos/chunks/segmentos continuam negados. Permission denied esperado
é sucesso dos assertFails.

As fixtures novas de Rules são de presença, inclusive ponteiros malformados:
não comprovam payload certificado, nascimento nativo ou ativação de job.
Não houve chamada a dados de produção.

## Validações executadas

Sintaxe de Functions, arquitetura e lint dirigido passaram.
Formatação, documentação e diff final passaram antes do commit.
Não mudou código cliente; tipos/build/Vitest/browser não foram repetidos.
Validate integral fica no fechamento de P1, conforme o usuário; CI ignorada.

## Limitações e próximos passos

Só o passo 1 do plano 81 foi implementado. O produtor precisa vincular intenção,
origem nativa, manifesto/Merkle/SHA, parser/cursor/CAS e recibos por unidade.
Inventário/lease, cancelamento com fence e cleanup limitado vêm antes de gravar
os primeiros bytes. Depois integrar geração por campo e readers, troca atômica,
criação/exclusão/coleta e cliente. Um estado done não autoriza nem sela um upload.

Nenhum campo em payload foi editado por esta entrega. Não há novo callable,
namespace, dependência, geração v2 gravada, raiz ativada ou mudança de UI.
As Rules não foram implantadas. Contextos/backup, demais campos grandes,
saída portátil ampliada e certificação/ativação continuam em P1/F2-09.
Writer V2 permanece aberto; somente commit local, sem push/PR/deploy.

## Como verificar

Executar node --test functions/test/bookLoreFieldValidation.test.mjs.
Para as Rules, executar tests/firestore/book-local-lore.rules.test.mjs pelo
runner demo dedicado, com emulador local verificado. O dev server continua
disponível, mas não demonstra edição de payload por esta entrega.
