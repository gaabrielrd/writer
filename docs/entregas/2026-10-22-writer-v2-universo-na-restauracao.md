# Writer V2 — Universo original na restauração (P1 M32)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 65](../tasks/writer-v2/execucao/65-universo-na-restauracao.md)
- Decisão: [ADR 0076](../decisions/0076-restored-universe-link.md)

## Objetivo e funcionalidades

Preparar a religação ao universo original sem duplicar universo ou lore e sem
confundir identidade do arquivo com autorização. Oferecer um plano transacional
estrito para a futura ativação integral, ainda não implementada.

## Critérios atendidos

- [x] book-universe consumido pelo leitor M21 com verify(tx), sem caminho do cliente.
- [x] Descriptor fechado none/unavailable/reference, nascimento exato e acesso
      authorId próprio/não deleting. Universo público alheio não concede vínculo.
- [x] Leitura de disponibilidade mascarada; indisponibilidade indistinguível para
      origem ausente/alheia/deleting/recriada. Sem nome, descrição ou lore no job/recibo.
- [x] None/unavailable não consultam a origem. Unavailable nunca é promovido
      pelo reaparecimento do mesmo ID; legados v1–v6 preservam ausência de prova.
- [x] Progresso v6 registra observação, fixa o índice e termina em history.
      Inventário v9 preservado: nenhuma nova coleção/recurso; compatibilidade v5/v6.
- [x] Cursor/observação/recibo atômicos, com CAS, replay, falha/retry e confirmação
      de operação gêmea durante leitura. Cancelamento interrompe nova preparação.
- [x] Helper final confere job nativo atual e origem verificada da mesma cópia.
      Reautoriza na transação e compõe vínculo/contador estritos com commit separado.
- [x] Perda de acesso dá universeId null; contador/uso inconsistente falha inteiro.
      A observação antiga não autoriza o vínculo.
- [x] Fluxo de produção sem raiz/countReady, uso ou alteração global. Cleanup
      cancela somente a cópia, preservando universo e lore.

## Arquivos

BookRestoreUniverse e seu contrato puro compõem a nova etapa interna;
Upload/UploadContracts aceitam progresso v6/recibos mantendo cleanup v9.
Functions check inclui os módulos. Fixture e testes Node/SDK cobrem origem,
reautorização e composição. AGENTS, README, arquitetura, testes, execução,
plano e ADR registram a regra e seus limites.

## Testes e validações reais

**233 testes Node distintos positivos**, 15 arquivos, incluindo 20 cenários
de universo da restauração; 8.021,6294 ms, nenhuma falha/skip. A execução
isolada dos mesmos 20 cenários passou em 4.172,5918 ms e não foi somada de novo.

```text
tests 233
pass 233
fail 0
skipped 0
duration_ms 8021.6294
```

Arquivos: bookRestoreUniverse, Personas, Counts, Resources, Lore, Structure,
Remap, ContentRead, Upload, Integrity, Validation, LegacyValidation,
bookChapterText, bookBackupUniverseRead e universes. Cobre máscara/nanossegundo,
revogação/ABA, nenhuma promoção de unavailable, JSON v1–v6, CAS/replay,
rollback/retry, cancelamento durante leitura, origem divergente, contadores
inconsistentes, uso ocupado e cleanup sem efeito global.

**2 testes SDK reais positivos**, Firestore 1.22.0 verificado, porta loopback
dedicada; 135.753,5567 ms, sem falhas/skips:

1. Preparação intacta, privacidade de dono/outro/anônimo, replay e plano estrito;
   rollback e confirmação de raiz/vínculo/contador no mesmo commit nativo:
   66.107,0644 ms.
2. Universo recriado após observação available impede vínculo; cancelamento
   mantém a nova origem, lore e contador: 68.839,2709 ms.

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 135753.5567
```

Os PERMISSION_DENIED do SDK são esperados nas asserções de negação. O teste de
raiz sintética prova somente composição/rollback transacionais do helper,
sem certificação final ou ativação real P1.

Lint dirigido, check de Functions e arquitetura passaram. Formatação, documentação,
diff e revisão final conferidos antes do commit. Nenhum código cliente modificado:
Vitest/typecheck/build não repetidos. npm run validate integral fica no fechamento
do grande bloco P1. Sem nova API pública, Rule, coleção, dependência ou crédito.

## Limitações e próximos passos

Observação available não é grant; origem será reautorizada pela composição final.
Nenhum livro restaurado foi ativado pelo fluxo de produção ou testado no navegador.
Faltam histórico/rascunho/capa, integração de personas, campos grandes e consumidores,
certificação/ativação e host/UI/roundtrip/validate. P1/F2-09 e Writer V2 seguem abertos.

Somente commit local; CI ignorada, sem push/PR/deploy. Checkout original e servidor
local preservados.
