# Writer V2 — Texto grande de capítulo na preparação (P1 M23)

## Objetivo e resultado

Superar a falha nativa do campo content demonstrada em M22. A preparação agora
guarda corpo externo acima de 512 KiB UTF-8, preservando até 8 MiB lógicos, sem
truncamento. Capítulo aponta explicitamente para geração imutável. Ledger recebe
o texto completo. Raiz continua ausente e a restauração final continua bloqueada.

[Plano 56](../tasks/writer-v2/execucao/56-texto-grande-na-preparacao.md) e
[ADR 0067](../decisions/0067-restored-chapter-text-bodies.md) descrevem contrato,
representação, leitor interno e cleanup v5, mantendo v1–v4.

## Funcionalidades e critérios atendidos

- Corpo, partes binárias, capítulo, ledger, inventário, cursor e recibo atômicos.
- Leitor interno confere contexto, partes nativas, hashes e UTF-8/BOM sem fallback.
- Cleanup limitado remove filhos antes do corpo, certifica inventário e preserva
  registros sem prova válida. Replay e cancelamento mantêm contratos existentes.
- Nenhuma nova rota, callable, regra de cliente, dependência ou ativação.

Principais arquivos: functions/src/bookChapterText.mjs, bookRestoreArtifacts.mjs,
bookRestoreStructure.mjs e guardas de versão de upload/validação/cleanup; testes
Node e SDK de corpos, além da adaptação do cenário de rejeição nativa existente.

## Testes e validações reais

- Regressão Node dirigida: **114/114**, sem falhas ou skips, 2.971,85 ms.
  Arquivos: bookChapterText, bookRestoreStructure, bookRestoreUpload,
  bookRestoreIntegrity, bookRestoreValidation, bookRestoreLegacyValidation,
  bookRestoreContentRead, bookRestoreRemap e bookRestoreRecovery.
- SDK Admin/Rules em emulador loopback, três testes selecionados: **3/3**,
  sem falhas ou skips, 55.632,6433 ms. Dois casos em bookChapterText.rules.test.mjs
  e caso oversized metadata em bookRestoreStructure.rules.test.mjs.
- Jornada real de texto de 1.100.000 bytes (inclui BOM): upload/validação,
  preparação, leitura integral, ledger e limpeza de 22 artefatos, sem raiz.
  Leituras SDK owner/outro/anônimo dos corpos foram negadas.
- Capacidade isolada: transação com 133 documentos nativos e journals; leitura
  exata de 8.384.512 bytes. Não comprova jornada completa de arquivo nesse tamanho.
- Título de 1.100.000 bytes continua rejeitado atomicamente, com fonte íntegra e
  sem avanço/recibo/capítulo parcial; proteção contra recriação continua exercitada.
- npm --prefix functions run check: passou.
- Lint e formatação dirigidos, check:architecture, check:docs e git diff --check:
  passaram. Revisão final não encontrou bloqueadores neste escopo de preparação.
- npm run validate integral: não executado neste incremento; reservado ao
  fechamento do grande bloco P1 por orientação do usuário. CI ignorada.

## Limitações e pendências

Não há hidratação para editor/histórico/chat/conversão/backup/exclusão nem ciclo
de pins/coleta após ativação. Outros campos grandes, demais recursos, personas,
mídia, autorização/ativação, host/UI/roundtrip e validate integral seguem em P1.
P1/F2-09 permanecem abertos. A prova perto de 8 MiB mede armazenamento, não toda
a restauração. Rascunho diferente deve virar versão separada, mantendo texto salvo.

Somente commit local, sem push, CI ou deploy. O checkout original permanece
intocado. Não há UI nova para verificar manualmente; testes usam emulador demo.
