# Writer V2 — Controle de unidades da visibilidade protegida

- **Data**: 2026-10-25.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [125 / marco A](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md).
- **Decisão**: [ADR 0140](../decisions/0140-lore-manual-unit-gate-and-local-flush.md).

## Objetivo e funcionalidades

Permitir que o futuro coordenador registre referências antes do envio e
salve uma pendência local sem reenviar a alteração. São pontos de controle
da edição protegida, ainda sem seleção/interface de visibilidade montadas.

beforeUnit recebe somente metadata congelada após o write-ahead cifrado.
Gate que falha impede a RPC; actor/ticket/cancel são rechecados depois do await.
A função original fica fixa, mesmo que o objeto de opções seja alterado.

flushLocal salva dívida/checkpoint sem chamada de edição ou nova reserva remota.
No cold start, restaura apply pendente sem enviá-lo. A leitura de chave protegida
continua autorizada; isso não significa ausência de qualquer leitura de rede.
Cancel por handle fresco conclui enquanto o produtor está retido no gate.

## Critérios de aceite do marco

- [x] Gate metadata após write-ahead e antes de envio, sem prosa/chaves.
- [x] Falha preserva pedido; retomada explícita mantém a referência.
- [x] Actor/host/cancel rechecados após await.
- [x] Cancel sem chave nem espera do produtor; flush concorrente recusa espera.
- [x] Dívida antes/depois de RPC salva sem chamada de edição seguinte.
- [x] Cold flush não repete apply; ticket novo local não reserva remotamente.
- [x] Gate capturado e regressões de editor/sessão/recuperação preservadas.
- [ ] Manifesto/ledger/executor/revisão/retomada da seleção de visibilidade.
- [ ] Composição do compêndio, demais pendências de P1 e fases/gates da V2.

## Arquivos alterados

| Grupo                                        | Mudança                                    |
| -------------------------------------------- | ------------------------------------------ |
| ManualOperation                              | Opção metadata e flush local               |
| PersistedOperation                           | Flush separado da produção                 |
| EditService                                  | Encaminha opção na criação/retomada manual |
| ManualGate tests                             | Dez casos novos                            |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contratos, evidência e continuidade        |

## Testes e resultados

**155 casos distintos positivos: dez novos e 145 regressões.**

Primeira rodada: ManualGate (nove casos), ManualOperation,
PersistedOperation e ManualSession; 102 positivos.
Após fixar o callback original e fortalecer o cancel metadata, rodada de
Gate/ManualEditor/EditService com 62 positivos: dez + 18 + 34.
A interseção tem nove casos, portanto 155 casos distintos.
O caso de cancel recebeu ainda a verificação de flush concorrente;
retake somente do arquivo Gate: dez positivos.

```text
Test Files  4 passed (4)
Tests  102 passed (102)
Duration  21.75s

Test Files  1 passed (1)
Tests  10 passed (10)
Duration  3.93s

2962 modules transformed.
Smoke test do bundle OK.
```

Gate verifica metadata sem conteúdo, journal pendente antes de dispatch,
erro sem envio, actor/host depois do await, callback fixo, cancel sem chave
com produtor retido e flush sem aguardar a unidade. Os testes usam serviços
nativos reais com banco em memória e harness de IDB/WebCrypto/Web Locks.
Casos de dívida antes/depois da RPC verificam ausência de nova chamada e
manutenção dos registros nativos. Flush frio restaura o apply incerto sem replay.
Regressões de UI/Auth são testes de componente/fixtures, não navegador real.

## Validações

Lint dirigido e tipos positivos; build/bundle/smoke positivos com os avisos
anteriores de chunks/imports dinâmicos. Formatação, arquitetura, docs e
diff conferidos no fechamento. Report JSON fora do Git:
writer-v2-portability-qa/m38c6a-vitest.json (62 positivos).

Não houve mudança backend, Rules, esquema persistido, deps ou env.
Não foram repetidos testes Node/SDK ou Chromium, pois a unidade não altera
essas fronteiras nem a interface. Validate completo permanece no fechamento
de P1, conforme orientação explícita do operador. Sem CI/push/PR/merge/deploy.

## Limitações e continuidade

A API não decide se apply foi aceito. Antes de dirigir pedidos incertos,
o coordenador deve consultar a prova original e exigir reenvio explícito.
O gate precisa persistir metadata e respeitar cancelamento do pai.
O caminho de preparação manual existente conserva seu comportamento.

Este marco é infraestrutura, não conclusão da visibilidade em lote:
manifesto/ledger/executor/revisão/retomada, integração do compêndio,
lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates
humanos/comerciais seguem abertos.

## Como conferir

Nos testes do marco, suspender beforeUnit depois de gravar o pedido cifrado.
Concluir cancel por novo handle sem liberar o gate e depois liberar o produtor:
ele deve falhar antes de enviar. Para dívida local, chamar flushLocal e conferir
que o contador de RPCs de edição e os registros nativos não aumentam.
