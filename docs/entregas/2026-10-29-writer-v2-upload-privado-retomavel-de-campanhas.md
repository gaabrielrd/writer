# Writer V2 — Upload privado retomável de campanhas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base bf6bb14.
- Escopo: [plano 227](../tasks/writer-v2/execucao/227-upload-privado-retomavel-de-campanhas.md).
- Decisão: [ADR 0257](../decisions/0257-campaign-private-resumable-upload.md).
- Estado: núcleo interno implementado e validado por testes dirigidos/SDK.

## Implementado

Start/status/append/fence/cancel/cleanup e fonte interna de arquivo persistido.
Reserva global e marcador privado ficam invisíveis no Estúdio. Guards da
criação nativa impedem reutilizar o alvo. SDK não acessa job/chunks/recibos/
testemunhas/chave/fence/reserva nem como dono.

Bytes e estado SHA ficam cifrados com contexto de conta/encarnação/unidade.
Append preserva pedido/recibo original, ordem, CAS, SHA completo e retomada
após criar novo serviço. Hash-wasm 4.12.0 fica fixado no job. Recriação nativa
não é confundida com o recurso anterior; mapas usam digest canônico.

Cancel retira a chave antes da coleta em lotes metadata-only até 25.
Falhas, órfãos e identidades divergentes preservam checkpoint/dados alheios.
Terminal/fence impedem start tardio e reuso do ID. Não há ativação nem endpoint
público neste incremento.

## Validação observada

49 casos novos e 50 regressões passaram: 99/99, zero falhas/skips/cancelamentos,
em 2.782,745 ms. Log local m150-directed-final-v2.log no diretório de QA.
Suites: campaignRestoreTransfer, studio, campaignCapture, campaignDeletion
e campaignRestoredDeletion.

Cobre upload mínimo/exato/múltiplos blocos, retomada de serviço, SHA divergente,
fonte limitada, base64/índices fechados, cancelamento vazio/paginado, resposta
repetida, concorrência, rollback nas escritas, UID Unicode/entrada inválida,
recriação de job/reserva/marcador/chave/chunk/recibos/testemunhas e barreira C4.
Um arquivo de campanha real assinado, com UTF-8 longo e materiais congelados,
passou na revisão completa a partir da fonte cifrada persistida.
A revisão conserva campaign-backup-review-only e não cria campanha ativa.

SDK/Rules: 19 casos distintos positivos, sendo três novos e 16 regressões de
Studio/captura, em 58.545,2037 ms (m150-rules.log). Os três novos foram
reexecutados após o campo final do codec de hash: 3/3 em 10.908,5853 ms
(m150-sdk-final.log). Nascimentos Firestore reais, transação concorrente,
leitura exata, revogação de chave e coleta reais confirmados. Permission denied
dos testes negativos são esperados; zero falhas/skips.
Emulador demo local em porta efêmera com JAR verificado, encerrado pelo runner.

ESLint dirigido aos dez arquivos mjs positivo; sintaxe de 457 módulos Functions
positiva. Checks de arquitetura/documentação/formato/diff e scan dirigido de
segredos conferidos. Revisão sem achados bloqueantes. Build/interface/navegador
não foram repetidos: nenhuma UI/entrada pública mudou.

O validate de bf6bb14 (9.710 testes) é a base histórica 219–226; não comprova
este incremento. Conforme orientação do operador, suite completa fica para o
fechamento do novo bloco persistente. Nenhum limite foi reduzido.
Uma edição por payload teve precondição divergente e outra chamada teve erro
de sintaxe no comando de orquestração; ambas falharam antes de escrever e foram
corrigidas. Não houve falha de teste nem enfraquecimento de produção.

## Próxima entrega e limites

Revisão/autorização persistidas, remapeamento/materialização, mídia, integração
C4 dos novos recursos antes da ativação e Estúdio/ciclos continuam necessários.
O upload é temporário pré-ativação, com coleta própria v1 e barreira C4;
nenhum layout 1–4 foi alterado e não se declara o v4 coletor destes jobs.
P3/D/F2-09 e macro 8/35 permanecem abertos.

Sem agentes/CI/push/PR/merge/deploy; somente commit local. Servidor manual e
master preservados. Nenhuma nova validação visual ou liberação comercial.
