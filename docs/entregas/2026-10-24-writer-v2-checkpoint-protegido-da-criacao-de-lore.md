# Writer V2 — Checkpoint protegido da criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [114 / M38c5p](../tasks/writer-v2/execucao/114-checkpoint-protegido-da-criacao-de-lore.md).
- **Decisão**: [ADR 0129](../decisions/0129-protected-lore-creation-checkpoints.md).

## Objetivo e funcionalidades entregues

A preparação protegida oferece armazenamento do checkpoint do coordenador
e de seus controles paginados. Um pedido privado pode ser confirmado no banco
local antes de chamar o servidor; uma resposta validada pode ser registrada
sem prosa e reconciliada após recarga, sem repetir a chamada já confirmada.

A cópia anterior permanece até a nova geração estar cifrada, lida, validada e
confirmada por oncomplete. Falha ou prefixo corrompido preserva as duas.
Coleta da antecessora verifica a sucessora e remove até 50 frames por lote.
Descarte explícito do bootstrap agora inclui draft e gerações do checkpoint.

A API checkpointJournal é obtida da preparação Auth pelo mesmo handle de posse.
Não abre novo claim nem altera formatos do journal de edição. Ticket v3 aceita
campo checkpoint opcional; registros anteriores sem esse campo permanecem válidos.

**Fronteira**: serviço de armazenamento, com harness que compõe o core real nos
testes. Não é o executor durável de produção nem cria entrada na interface.
Ainda integrar avanço/aplicação, dívida local e adoção própria no encerramento.

## Critérios de aceite

- [x] Bundle fechado, wire privado reconstruído e controles em páginas até 50.
- [x] Gerações AES-GCM com prefixo/manifesto e autorização fresca nas duas pontas.
- [x] Active/outcome/receipt/antecessora confirmados atomicamente.
- [x] Resultado metadata sem prosa/chave e vinculado à base/pedido exatos.
- [x] Retake sem RPC de edição na abertura e sem texto inventado.
- [x] Coleta limitada/atômica, com sucessora e geração conferidas.
- [x] Cancel/release/discard preservam isolamento e impedem renascimento.
- [x] Regressões de criação/preparação e journals de edição preservadas.
- [ ] Executor durável advance/apply e tratamento de adoção própria no close.
- [ ] Host, exclusão/lifecycle, consumidores/backup/rollout e validate de P1.

## Arquivos alterados

| Grupo                                            | Mudança                                                  |
| ------------------------------------------------ | -------------------------------------------------------- |
| CreationCheckpointContracts/Bundle/Journal       | Schema, captura, validação, cifra, ponte e coleta        |
| CreationTicketContracts/TicketDb/Ticket          | Campo opcional, seção própria, CAS e inventário de purge |
| CreationPreparation/services index               | Composição Auth e exports de captura/tipos               |
| CreationCheckpoint test/harness                  | 29 testes novos, core e serviços nativos reais           |
| Plano 114/ADR/arquitetura/testes/AGENTS/execução | Contrato, evidência e próximos portões                   |

## Testes e validações reais

**250 Vitest distintos positivos em rodadas, 29 novos**. Retakes não somam
casos: a rodada de integração teve 249 (28 novos naquele momento); o novo
caso de corrida elevou o conjunto a 250. O fechamento repetiu somente os
arquivos afetados, conforme a orientação do operador.

```text
Integração dirigida:
Test Files  11 passed (11)
Tests  249 passed (249)
Duration  17.69s

Após ajuste de concorrência:
Test Files  2 passed (2)
Tests  60 passed (60)
Duration  5.66s

Retake final de checkpoint:
Test Files  1 passed (1)
Tests  29 passed (29)
Duration  5.64s
```

Os 29 novos casos cobrem persistência antes do envio, resposta perdida,
ponte sem acesso à chave, swap abortado, prefixo válido/corrompido, idempotência
com cifra corrompida, controles acima de 50, coleta abortada/órfãos, descarte de
múltiplas gerações, actor/takeover/cancel durante crypto e grant final negado.
Fluxo completo nativo chega a ready sem cabeça e aplica explicitamente.
Apply sem resposta continua ready após retake, advance não o repete e a
confirmação explícita mantém a mesma adoção/clock.

Dois testes iniciais foram corrigidos: fixture de relação deve usar
targetEntityId/relationType e o wire serializado ocupou duas partes, não três.
A revisão acrescentou releitura de outcome que chega durante decrypt e vínculo
da coleta à geração ativa efetivamente conferida. Guard de resultado é
verificado também dentro da mutação após a espera. Lint identificou async sem
await no adaptador de páginas; trocado por Promise.resolve.

**Quatro jornadas Chromium positivas**, repetidas após os ajustes de concorrência:

1. Pedido cifrado confirmado antes da RPC aceita sem resposta; novo processo
   abre sem RPC de edição e repete exatamente o mesmo pedido por ação posterior.
2. Resultado metadata sobrevive ao reinício e promove/ACK sem repetir a RPC.
3. Processo encerrado durante AES-GCM com manifesto e uma parte do wire já
   gravados; reinício confere/reutiliza o prefixo e envia append uma única vez.
4. Cancel nativo e revogação precedem purge limitado: 11 frames próprios de
   draft/active/antecessora são removidos, preservando checkpoints alheios.

Script/perfis/JSON permanecem fora do Git em writer-v2-portability-qa, no workspace
de visualizações: m38c5p-browser-checkpoint.mjs e m38c5p-browser-result.json.
O primeiro adaptador de perda de resposta atingia o bootstrap; foi ajustado para
simular a perda no pedido do coordenador após a preparação, antes das rodadas positivas.

| Validação                  | Resultado                                        |
| -------------------------- | ------------------------------------------------ |
| Vitest dirigido            | 250 distintos; fechamento 60/60 e retake 29/29   |
| Chromium de armazenamento  | 4/4                                              |
| npm run build              | Tipos, bundle de 2.941 módulos e smoke positivos |
| Lint dirigido, arquitetura | Positivos                                        |
| Formatação, docs e diff    | Conferidos no fechamento                         |
| Validate/coverage integral | Não executado; fechamento de P1                  |
| Backend/Rules/SDK reais/CI | Não executados neste incremento                  |

Build conserva avisos existentes de chunks/imports dinâmicos. Browser usa
IndexedDB/WebCrypto/Web Locks reais, com serviços Functions reais sobre
fixtures de banco/identidade. Não certifica Auth/App Check/SDK reais ou UI.
Backend/Rules, dependências e configuração de ambiente não foram alterados.

## Como verificar e próximos passos

Executar CreationCheckpoint.test.mjs e CreationPreparation.test.mjs no Vitest.
A preparação expõe checkpointJournal; write/read/recover não enviam RPC de edição.
Staging incompleto mantém active e dívida local: o executor deve reconstruir o
pedido exato e confirmar a gravação antes de enviar, sem ignorar pending/outcome.

Próximo: compor esse armazenamento com advance/apply, bloqueio por dívida local,
cancel e confirmação da adoção própria. Outcome local é resultado validado,
sem conceder autorização ou certificar sozinho um evento nativo.
Depois integrar host/criação/exclusão ao compêndio. Lifecycle, demais writers/
consumidores/backup/ativação/rollout, P1/F2-09/V2/fases 3–5 e gates humanos/
comerciais continuam abertos. Validate integral no fechamento de P1;
somente commit local, sem CI/push/PR/merge/deploy.
