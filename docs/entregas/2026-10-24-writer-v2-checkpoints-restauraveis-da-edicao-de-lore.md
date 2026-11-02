# Writer V2 — Checkpoints restauráveis da edição de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [104 / M38c5f](../tasks/writer-v2/execucao/104-checkpoints-restauraveis-da-edicao-de-lore.md).
- **Decisão**: [ADR 0119](../decisions/0119-restorable-manual-lore-edit-checkpoints.md).

## Objetivo e funcionalidades entregues

Coordenador manual pode ser reconstruído de um checkpoint explícito e
controles paginados, preservando cursores e pedidos exatos sem RPC no restore.
Snapshot de status continua sem conteúdo privado. Checkpoint inclui wires
privados e exige cifragem quando for persistido pela composição seguinte.

Root fechado/versionado fixa identidade, intenção/CAS, fase/cancelamento,
inicialização, contadores/cursores, inspeção/edição e os três slots pendentes.
Controles até 50 por página, com digest encadeado que vincula todos os
progressos ao root e recusa mistura de páginas antigas da mesma intenção.

Restore recompõe codecs/manifests a partir do input original autorizado,
confere progressos/cursores e reconstrói pedidos/ações locais de inicialização,
reservas e failedCancel/get. Bytes/prova de append são comparados ao codec.
Não substitui CAS, não envia automaticamente e não adota ao restaurar ready.

Cleanup concorrente conserva produtor incerto. Signal abortado impede produção,
mas intenção de cancelamento já confirmada permite restaurar cleanup com guards.
Reconciliação confirma adoção que venceu ou retém o cancel original para retry.
Sessão Auth restaura com UID forçado e revalida conta/contexto/host após awaits.

## Critérios de aceite

- [x] Checkpoint privado separado do status, fechado e imutável.
- [x] Controles de todos os uploads paginados e vinculados ao root por digest.
- [x] Identidade/intenção/CAS, progressos e cursores conferidos.
- [x] Pedidos exatos e callbacks locais reconstruídos sem RPC inicial.
- [x] Cancelamento concorrente, reconciliação e terminais preservados.
- [x] Restore integrado ao guard/UID da sessão autenticada.
- [x] Testes dirigidos, reload em Chromium, revisão e documentação.
- [ ] Persistência automática cifrada/atômica de checkpoints e controles.
- [ ] Host visual, fechamento/coleta e ciclo de vida integrados.
- [ ] Validate/certificação de P1/F2-09/V2.

## Arquivos alterados

Contrato BookLoreEditCheckpoint/Recovery, coordenador, sessão e barrel de lore.
Parser wire existente aceita a projeção de identidade que efetivamente valida,
sem mudar seu runtime ou permissões do journal. Novo teste de checkpoint e
cinco casos de sessão. Plano/ADR, AGENTS, README, arquitetura/testing e execução.
Sem dependências, backend, Rules, IndexedDB ou interface alterados.

## Testes e resultados

**143 casos Vitest distintos positivos em rodadas dirigidas**: 48 novos de
checkpoint, 17 da sessão (cinco novos), 47 existentes do coordenador e 31 do
journal/sessão da chave. São 53 casos novos, sem somar retakes como novos.

Checkpoint exercita inline/v1/v2/criação com reconstrução entre cada unidade;
perda de resposta em dez produtores e cinco classes de cleanup; wire/CAS/
operação/bytes adulterados; root/páginas inválidos, mistura de estados,
53 uploads de relações por páginas 50+3; texto de três partes, quatro slots,
remoção, privacidade e duas páginas de relações; concorrência com append
pendente e adoção vencedora; reconciliação sem adoção; estado terminal/no-op;
guards, signal abortado e snapshot legado recusado.

Rodadas: 89/89 coordenador+checkpoint; 94/94 checkpoint/sessão/journal;
64/64 checkpoint+sessão em 4.04 s; caso final da reconciliação sem adoção,
1/1 positivo (47 demais filtrados); regressão final direta do coordenador e
sessão, 64/64 em 5.67 s. WebCrypto e serviços servidor são reais sobre double
transacional, não SDK Firestore nativo.

Dois cenários Chromium reais positivos, repetidos no código final:

1. Reload com append aceito cuja resposta se perdeu: nova chave e draft do
   journal cifrado, reconstrução do coordenador sem RPC inicial, replay exato.
   Outro reload após inicialização não repete esse passo; ready aguarda apply
   explícito e adoção conserva literalidade com um único avanço do clock.
2. Adoção aceita com resposta perdida, cancel recusado e failedCancel/get;
   reload reconstrói reconciliação, get confirma sucesso próprio sem limpar
   uploads. Novo reload do terminal não envia ou reabre a operação.

Chromium usa IDB/Web Locks reais para draft/pedido e serviços reais sobre
double, com Auth/provedor de chave fictícios. Root/páginas do coordenador
ficam na memória externa do harness entre recargas; não são persistidos pelo
produto nem representam integração automática do checkpoint no journal.
Perfis/logs preservados fora do Git. Nenhuma prova de tokens reais ou UI.

## Validações e revisão

Lint/tipos/build/smoke/arquitetura e docs/formato/diff dirigidos no fechamento.
Build mantém avisos de bundle grande e imports dinâmicos também estáticos.

A primeira rodada teve dois testes com pressupostos incorretos: após ready,
o pai já havia limpo o upload e não havia advanceFieldCleanup a perder; apply
de no-op cancelado deve recusar. Ajustes dos cenários passaram. Lint apontou
três async sem await nas fixtures TS, corrigidas com Promise.resolve. Tipos
recusaram mutação de UID readonly em teste negativo, corrigida construindo
outro objeto, sem enfraquecer o contrato.

Uma tentativa via wrapper npx/PowerShell lançou exceção e deixou log parcial,
sem resultado de testes. Processo foi conferido ausente antes de rodar o
Vitest diretamente; somente a saída completa 64/64 é evidência dessa retake.
Revisão acrescentou controle do índice de append, teste de composição multipart
e a reconciliação que não encontra adoção.

Sem backend/Rules novos, não repetimos SDK nativo ou suite Functions.
Suite completa/cobertura/npm run validate no fechamento de P1, conforme
autorizado. Sem CI/push/PR/merge/deploy ou integração na master.

## Limitações e próxima entrega

Ainda não há autosave de checkpoint ou recuperação visual. A API pressupõe
input/checkpoint privados obtidos após reautorização da origem. Preparar codecs
do input recompõe o estado em memória e pode demandar trabalho proporcional
ao texto; o digest de controles faz passagem linear de metadata por checkpoint.

Composição seguinte deve gravar root/páginas cifrados de forma coerente antes
de enviar, manter metadata de todos os jobs para cleanup mesmo sem chave,
reconciliar resultado antes de descarte e ligar reserva/journal/coordenador/host.
Ciclo de vida da chave na exclusão e demais writers/consumidores/backup/
ativação/rollout continuam necessários. P1/F2-09/V2, fases 3–5 e condições
humanas/comerciais permanecem abertos.

Não há tela nova. Testes podem ser repetidos pelos dois arquivos da operação,
sessão e journal; harness Chromium externo prova os dois reloads descritos.
