# Writer V2 — Unidade de retirada conjunta de lore

- **Data**: 2026-10-25.
- **Branch**: codex/writer-v2; commit local.
- **Plano**: [120 / M38c5v](../tasks/writer-v2/execucao/120-retirada-conjunta-de-lore.md).
- **Decisão**: [ADR 0135](../decisions/0135-atomic-lore-removal-batches.md).

## Funcionalidades implementadas

Primitiva interna retira 1..50 fichas na transação do caller, preservando
inspeções/sourceTokens originais e confirmando clock/privacidade uma única vez.
Preparar não grava. Uma falha ou rollback do caller preserva todas as cabeças,
publicação e contadores. Start singular reusa o plano sem alterar o seu formato.

Comprovante original é metadata privado com nascimento compartilhado com os
contextos de todos os membros. Recibos individuais, prova ausente ou documentos
recriados não autorizam alegar o lote original. Token nativo observado é fixado
na retomada. Histórico sobrevive à limpeza e ao handoff/exclusão do livro.

Sem ativação no compêndio: falta coordenar a seleção completa, orçamento das
unidades, transporte/recuperação e UI. 50 é limite da unidade, não da autoria.

## Critérios de aceite

- [x] Leitura/preparação separada do commit; origens e alvos distintos conferidos.
- [x] Uma transação/timestamp/clock/privacidade por unidade.
- [x] Rollback, fonte alterada ou inspeção cancelada sem efeitos parciais.
- [x] Prova conjunta nativa e replay histórico; token observado permanece fixado.
- [x] Cleanup/handoff original e recursos alheios preservados.
- [x] Unidade com 50 membros exercitada em Node e SDK real no emulador.
- [x] Regressões singulares/transporte/executor/sessão positivas.
- [ ] Coordenador da seleção completa, orçamento, transporte/recuperação/UI.
- [ ] Compêndio, validate integral e demais gates de produto/rollout.

## Arquivos alterados

| Grupo                                        | Mudança                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| RemovalStart                                 | Preparação compartilhada singular/conjunta e commit da raiz      |
| RemovalBatch/BatchContracts                  | Serviço interno, manifesto, prova e token nativos                |
| Removal                                      | Singular delega início, mantendo cleanup/DTOs existentes         |
| BatchFixture/Batch tests                     | 20 novos casos Node                                              |
| SDK removal rules tests                      | Quatro novos casos e alinhamento de regressão à barreira vigente |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contratos, evidência e continuidade                              |

## Testes e validações reais

**103 casos distintos positivos em rodadas: 24 novos e 79 existentes.**
68 Node distintos, 30 Vitest e cinco SDK distintos. Retakes não somam casos.

```text
Integração Node (lote/singular/transporte), antes do caso adicional de token:
tests 67
pass 67
fail 0
duration_ms 2261.3603

Retake final do lote incluindo token:
tests 20
pass 20
fail 0
duration_ms 560.3869

Executor e sessão contra o backend compartilhado:
Test Files  2 passed (2)
Tests  30 passed (30)
Duration  2.96s

SDK: quatro novos casos positivos na rodada inicial;
retake da regressão singular corrigida:
tests 1
pass 1
fail 0
duration_ms 8874.3382

Retake SDK dos dois casos afetados pelo token:
tests 2
pass 2
fail 0
duration_ms 12579.3111

Functions syntax checked: 254 modules
```

Node cobre inline/v1/v2, consentimento ausente/false/true, clock/epoch/datas,
concorrência/replay, rollback, fonte/inspeção alteradas, ausência/recriação de
provas e controles, conta/ordem/hash errados, cleanup, handoff e 50 membros.
SDK usa Firestore Admin/cliente reais no emulador 1.22.0: prova de nascimento,
concorrência, rollback e Rules privadas, além de unidade de 50 membros.

Rodada inicial da extração detectou uso incorreto do helper de relógio;
corrigido preservando sua função de entrada. Lint removeu import sem uso.
A primeira rodada SDK teve quatro novos casos verdes e uma regressão herdada
falhando: ela esperava escrita SDK após hasLoreResources. O teste foi alinhado
à barreira permanente da ADR 0125, sem alterar Rules: irmã é semeada antes da
barreira, novo writer SDK é recusado e o clock permanece 1. Retake passou.
PERMISSION_DENIED nos testes negativos é esperado.

| Verificação                          | Resultado                               |
| ------------------------------------ | --------------------------------------- |
| Node/Vitest/SDK direcionados         | Positivo em rodadas                     |
| Lint alterado e sintaxe de functions | Positivo                                |
| Docs/arquitetura/formato/diff        | Conferidos no fechamento                |
| Build/typecheck do app               | Não executados; frontend sem alterações |
| npm run validate/cobertura global    | Não executados; fechamento de P1        |
| CI/remoto/deploy                     | Não executados                          |

Logs externos em writer-v2-portability-qa: m38c5v-node-final.log,
m38c5v-token.log, m38c5v-sdk.log, m38c5v-sdk-retake.log e m38c5v-sdk-token.log.
O log inicial com falha foi preservado; os retakes têm arquivos separados.

## Fronteira e pendências

Não há callable nem cliente de lote ativado. Não ampliar formatos 18/22/7
existentes, impor seleção máxima de 50 ou capturar outra fonte depois de
aprovar a anterior. Coordenador completo deve gerir seleção/orçamento e
conservar origem ao dividir unidades, antes de transporte/recuperação/UI.

Teste de 50 usa os dados da fixture; não certifica limites de produção para
todo conteúdo grande. Auth/App Check reais, índices de produção, piloto,
leitor de tela/zoom/outro dispositivo e validate de P1 não foram exercitados.
Lifecycle/consumidores/backup/rollout/V2 e fases/gates restantes abertos.
Master original/servidor local preservados. Sem push, CI, PR, merge ou deploy.
