# Writer V2 — Bytes da capa na preparação privada (P1 M35a)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 70](../tasks/writer-v2/execucao/70-bytes-da-capa-na-preparacao.md)
- Decisão: [ADR 0081](../decisions/0081-restored-cover-byte-preparation.md)

## Objetivo e funcionalidades

Preservar privadamente a capa do backup, inclusive nome/datas e bytes exatos,
antes de materializar a imagem. Ausência e capa legada indisponível continuam
explícitas; não existe promoção de URL ou vínculo à biblioteca atual.

## Critérios atendidos

- [x] Uma parte M21 por operação, prova reconferida no commit, SHA incremental
      e conferência integral antes do descriptor.
- [x] ID remapeado, assinatura PNG e limites existentes de 16 MiB/64 KiB.
      Nome/BOM/espaços/datas preservados; Unicode malformado recusado.
- [x] Partes/descriptor privados sob o job, journals tipados e inventário v12
      instalado antes dos recursos, com certificação dos namespaces vazios.
- [x] Cursor/parte/journal/recibo atômicos, CAS/replay/retry, cancelamento,
      cleanup limitado por máscara e proteção a registros recriados.
- [x] Progresso v9 sem imagem inteira; cursor avança uma vez ao terminar,
      encerrando em cover-finalize com raiz ausente/countReady false.
- [x] Compatibilidade de inventários/recibos anteriores e preservação de
      biblioteca/outro job.
- [x] Nenhuma API pública, Rule, dependência, crédito, linha de biblioteca,
      objeto Storage, uso ou download token novo.

## Arquivos

BookRestoreCover/Contracts preparam partes e descriptor. Artifacts,
Upload/Contracts, Integrity e ValidationCleanup integram inventário/recibos/
progresso. BookBackupCover recusa nome Unicode malformado. Functions check,
fixtures/testes Node/SDK, AGENTS, README, arquitetura/testes, plano/execução e
ADR completam o incremento.

## Testes e validações reais

**150 testes Node distintos positivos**: regressão em 11 arquivos, 149/149 em
9.256,9151 ms; mais um teste de 16 MiB, 1/1 em 3.092,9059 ms.
Os 12 cenários novos da preparação estão incluídos nos 149; não somados novamente.

```text
# Regressão dirigida
tests 149
pass 149
fail 0
skipped 0
duration_ms 9256.9151

# Contribuição de 16 MiB
tests 1
pass 1
fail 0
skipped 0
duration_ms 3092.9059
```

Arquivos: Cover, DraftFinalize, Draft, Personas, Universe, History, Upload,
ContentRead, Validation, LegacyValidation e BookBackupCover; teste grande em
arquivo próprio. Cobre bytes/hash/metadata, marcadores, retomada, CAS/replay,
rollback/retry, cancelamento durante leitura, cleanup parcial, namespaces
ocupados e encarnações recriadas. O limite de 16.777.216 bytes resulta em
256 partes exatas; a fixture testa bytes, sem provar validade dos pixels.

**9 testes Vitest positivos**, BookCoverBackupRecords: um arquivo, 2,72 s,
incluindo captura e projeção do contrato da capa.

**2 cenários SDK reais positivos**, Firestore 1.22.0 verificado e porta loopback
dedicada; 149.433,7487 ms, nenhuma falha/skip:

1. PNG real 1200×1800 em múltiplas partes, bytes/metadata exatos, conferência por
   sharp, namespace ocupado sem avanço/recibo, nascimento nativo, regras privadas
   para dono/terceiro/anônimo, limpeza integral e replay.
2. Parte nativa apagada/recriada é preservada; limpeza recusa a nova encarnação:
   67.423,6766 ms.

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 149433.7487
```

Sintaxe de Functions e arquitetura passaram. Lint identificou prefer-const
no novo serviço; corrigido e check dirigido passou. Formatação/docs/diff e
revisão final conferidos antes do commit.

Sem mudança de interface ou I/O Storage; não repetidos build, jornadas UI ou
suíte Firestore+Storage M9. O SDK deste incremento exercita Firestore, sem
materializar objetos. Validate integral reservado ao fechamento do grande bloco P1.

## Limitações e próximos passos

Esta entrega preserva bytes privados; não restaura imagem na biblioteca.
M35b ainda precisa validar o formato completo e materializar objeto privado com
intenção durável, geração/precondições, proteção a I/O tardio e limpeza.
Disponibilização de imagem/uso depende da ativação autorizada.

Personas globais, campos grandes/consumidores, certificação/ativação e
host/UI/roundtrip/validate permanecem. P1/F2-09 e Writer V2 abertos.
Somente commit local; CI ignorada, sem push/PR/deploy. Checkout original e
servidor local preservados.
