# Writer V2 — Executor durável da criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [115 / M38c5q](../tasks/writer-v2/execucao/115-executor-duravel-da-criacao-de-lore.md).
- **Decisão**: [ADR 0130](../decisions/0130-durable-lore-creation-executor.md).

## Funcionalidade implementada

Criação nativa dispõe de uma operação durável que prepara, avança por unidades,
chega a ready e aplica explicitamente, preservando rascunho e pedido original
após recarga. Sessão Auth oferece createLore/resumeLoreCreation.

O pedido cifrado confirma antes do envio. Resposta validada fica na ponte até
confirmar o novo checkpoint; retry de gravação posterior não envia outro pedido.
Ausência da primeira cópia é indicada como awaiting-draft, sem texto inventado.

Apply sem resposta pode ser confirmado por provas nativas de reserva e edição,
sem chave e sem reaplicar. Se ainda não ocorreu, advance não reenvia apply.
Cancel não espera o produtor; se a aplicação venceu, confirma a adoção própria.
Release/discard removem só recuperação, preservando cabeça, geração e clock.

**Sem entrada nova na interface**: serviço composto e API Auth estão prontos
para o host, que continua uma entrega própria junto da exclusão nativa do cliente.

## Critérios de aceite

- [x] Pedido durável antes de cada RPC e dívida local bloqueando novo produtor.
- [x] Resultado/ponte e retomada exatos, sem replay ao abrir bytes/apply.
- [x] Ready sem cabeça e aplicação explícita/idempotente.
- [x] Intenção de apply vinculada ao checkpoint cifrado e gravada antes do envio.
- [x] Adoção própria por pai+edição/hash/token/revisão/geração/evento originais.
- [x] Cancel independente e confirmação/descarte sem chave quando apply vence.
- [x] Cabeça/geração adotadas preservadas ao liberar/purgar a recuperação.
- [x] Actor/host/posse/Signal e mutex tratados sem perder rascunho.
- [x] Descarte reaberto confirma ausência física antes do marcador de conclusão.
- [ ] Host/compêndio, exclusão/lifecycle e demais portões de P1.

## Arquivos alterados

| Grupo                                          | Mudança                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| CreationAdoptionContracts/Worker               | Intenção fechada, consultas nativas e prova correlacionada |
| CreationDurableOperation                       | Proxy write-ahead, dívida, recuperação e fechamento        |
| CreationPreparation/TicketContracts/TicketDb   | Composição/prova opcional, estados e release próprios      |
| EditService/services index                     | API Auth e tipo público                                    |
| CreationDurable test/harness e CreationSession | 24 testes novos e fixtures de origem real dos serviços     |
| Plano/ADR/AGENTS/arquitetura/testes/execução   | Regras, resultados e continuidade                          |

## Testes e validações reais

**274 Vitest distintos positivos em rodadas em 12 arquivos, com 24 casos novos**
(22 do executor e dois da sessão). Retakes não somam casos.

```text
Integração dirigida:
Test Files  12 passed (12)
Tests  273 passed (273)
Duration  32.08s

Executor antes do último ajuste:
Test Files  1 passed (1)
Tests  21 passed (21)
Duration  26.95s

Retake do descarte:
Test Files  1 passed (1)
Tests  1 passed | 20 skipped (21)
Duration  4.70s

Retake final dos casos afetados:
Test Files  1 passed (1)
Tests  4 passed | 18 skipped (22)
Duration  10.55s
```

Rodadas incrementais anteriores passaram: 8/8 em 15.93 s; 15/15 em 20.46 s;
88/88 em quatro arquivos em 25.91 s; executor/sessão 28/28 em 24.17 s.
A integração inicial teve 273 casos; o novo teste de confirmação no mesmo
handle elevou o conjunto a 274 distintos. O fechamento repetiu somente os quatro
afetados, sem executar novamente toda a integração.

Casos novos: fluxo literal completo, ready/retake, apply perdido ou não enviado,
confirmação sem chave, cancel com upload/apply retidos, ACK local abortado,
ponte com chave negada, checkpoint interrompido antes do append, primeira cópia
ausente, origem revogada, geração conflitante, mutex, Signal, takeover e host.
Também recusam intenção de apply que não esteja no checkpoint ativo original.

Revisão vinculou stageApply ao bundle cifrado conferido, endureceu nascimento/
transições da prova e protegeu queries após perda de posse. Um teste ampliado
pegou copyDiscarded falso após reabrir a recuperação já apagada: inicialização
agora reconfere a ausência física no bootstrap. O caso falhou antes da correção
e passou no retake dirigido. Outro teste pegou advance sem reconciliar um
apply perdido no mesmo handle: agora consulta as provas sem chave/replay e
canApply fica falso após a confirmação. O teste falhou antes da correção;
quatro afetados passaram depois. Chromium ampliado também passou.

**Cinco jornadas Chromium positivas pela API durável real**, repetidas com
a retomada do descarte e a confirmação no mesmo handle:

1. Ready sem cabeça; reinício de processo reabre sem envio autoral e aplicação
   confirma o evento uma vez, mantendo clock no replay.
2. Apply aceito sem resposta; novo processo confirma por pai/edição com chave
   negada, descarta e reabre o marcador concluído sem pedir a chave.
3. Resposta de apply fica retida enquanto cancel confirma a adoção própria e
   purga cópia sem chave; resposta tardia não recria frames nem remove cabeça.
4. Append aceito sem resposta reabre sem envio implícito; advance repete o
   wire exato e cancel/discard encerram somente a criação ainda não aplicada.
5. Mesmo handle confirma apply sem resposta por advance, sem chave/replay,
   e desabilita aplicar após a prova nativa.

Script/perfis/JSON ficam fora do Git no diretório writer-v2-portability-qa do
workspace de visualizações: m38c5q-browser-durable.mjs e m38c5q-browser-result.json.
O harness chama o executor real com serviços Functions reais e banco/identidade
de fixture. IndexedDB/WebCrypto/Web Locks e reinício são nativos Chromium;
SDK/Auth/App Check reais e UI não foram certificados.

| Validação                   | Resultado                                        |
| --------------------------- | ------------------------------------------------ |
| Vitest dirigido             | 274 distintos; retake final 4/4                  |
| Chromium durável            | 5/5, com reinício e mesmo handle                 |
| npm run build               | Tipos, bundle de 2.944 módulos e smoke positivos |
| Lint dirigido e arquitetura | Positivos                                        |
| Formatação/docs/diff        | Conferidos no fechamento                         |
| Validate/coverage integral  | Não executado; fechamento de P1                  |
| Backend/Rules/SDK reais/CI  | Não executados neste incremento                  |

Build conserva avisos existentes de chunks/imports dinâmicos. Sem mudanças de
backend/Rules, dependências, env, UI ou dados reais de produção.

## Como verificar e próximos passos

Executar CreationDurable.test.mjs e CreationSession.test.mjs no Vitest. A sessão
Auth expõe o serviço; initialize não envia bytes ou apply automaticamente.
Para confirmação pendente, usar advance para GETs ou apply explícito quando
a adoção ainda não ocorreu. Cancel/release/discard são operações independentes.

Próximo: host de criação, exclusão nativa do cliente e depois entrada coordenada
no compêndio. Lifecycle de chaves, demais writers/consumidores/backup/ativação/
rollout e validate de P1 continuam necessários. P1/F2-09/V2/fases 3–5 e gates
humanos/comerciais abertos. Dev server mantido em http://127.0.0.1:5173/;
somente commit local, sem CI/push/PR/merge/deploy.
