# Writer V2 — Migração dos índices das fontes (P1 M37c)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [contrato 76](../tasks/writer-v2/execucao/76-migracao-dos-indices-das-fontes.md)
- Decisão: [ADR 0087](../decisions/0087-prepared-source-index-migration.md)

## Objetivo e funcionalidades

Preparar jobs antigos para o backup indexado sem substituir seus textos, partes,
pins ou biblioteca. A migração pode ser retomada por fonte e mantém os registros
existentes quando não consegue provar sua procedência.

## Critérios atendidos

- [x] Preparação v12 e contador/cursor fechados; total exato e EOF antes de complete.
- [x] Fonte/corpo/partes autenticados por journals/recibos e snapshots nativos.
- [x] Índice ausente atualizado junto ao journal/recibo/cursor; fonte, texto,
      partes, pins e artifactCount preservados.
- [x] Índice correto não regravado; índice divergente falha sem reparo silencioso.
- [x] Replay/CAS/retry não duplicam contagem nem recriam corpos após cancelamento.
- [x] Cancelamento v14 reconhece os recibos novos e preserva registros recriados.
- [x] Zero fontes, inline, múltiplas fontes e limite de 8 MiB/128 partes cobertos.
- [x] Raiz ausente, countReady false e lote de personas preparing permanecem.
- [x] Nenhum namespace, dependência, crédito, callable ou componente novo.

## Arquivos alterados

BookRestoreSourceIndexes/Contracts implementam operação/progresso.
BookChapterText separa a validação pura de partes; BookRestoreArtifacts oferece
o snapshot apenas internamente e reconhece os recibos. Upload/Contracts integram
a preparação v12 e sua compatibilidade. Functions check inclui os módulos novos.
Fixtures/testes Node/SDK e AGENTS/README/arquitetura/testes/plano/execução/ADR
registram o comportamento, as provas e as pendências.

## Testes e validações reais

**430 testes backend distintos positivos**, 33 arquivos de restauração, fontes e
leitura/escrita/coleta de capítulos, com até quatro processos paralelos:

```text
tests 430
pass 430
fail 0
skipped 0
duration_ms 44212.6511
```

Inclui 17 cenários novos: representação antiga no nascimento nativo, no-op,
inline/zero/múltiplas fontes, limite de 8 MiB/128 partes, replay/CAS/retry,
rollback, origem ausente/alheia, índices inválidos, caminho de snapshot incorreto
e recriação de fonte/corpo/parte/journals/recibo.

Um erro inicial no filtro da fixture comparava as partes com uma lista vazia.
Essa execução terminou em OOM, sem caso aprovado, e não foi contada como
validação. O filtro foi corrigido; comparações grandes passaram a usar provas
compactas de bytes/SHA, preservando os tipos. Nenhum limite de heap ou do produto
foi reduzido. A repetição dirigida dos 17 cenários após esse ajuste também passou:
17/17, 11686.4557 ms. Não somar repetições aos 430 casos.

**Dois cenários SDK reais positivos**, Firestore 1.22.0 verificado, porta
loopback dedicada:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 224825.8505
```

O primeiro reproduz o formato antigo antes da criação dos corpos, pelo fluxo
real de upload/validação/preparação. Confere nascimento preservado, última
alteração do manifesto/journal igual ao novo recibo, partes intactas,
cursor/contagens e cancelamento v12. Backup da fonte migrada: 19 páginas e
37 chamadas get de partes. A raiz do leitor é harness sintético, não ativação.
O segundo recria uma parte, confirma bloqueio sem índice gravado e preservação
da encarnação nova durante cancelamento.

O limite de 8 MiB é exercitado no fluxo Node com todas as provas; o SDK desta
entrega usa a fonte acima de 1 MiB e uma menor. Não alegar uma migração SDK de
8 MiB completa nesta evidência.

Sintaxe de Functions, arquitetura, lint dirigido, formatação, links e diff
positivos. Nenhum código cliente foi alterado; Vitest, tipos/bundle e jornadas
visuais não foram repetidos. Validate integral fica para o fechamento de P1,
conforme instrução do usuário.

## Limitações e continuação

Operação ainda interna, sem execução em dados de produção. Implantar leitura
v12/recibos/cleanup antes de habilitar migração. complete indica o fim da
varredura, sem substituir a certificação integral de fontes/índices/namespaces.

Demais campos grandes, orçamento após remapeamento, capa/biblioteca,
certificação/ativação, limpeza pós-ativação e host/UI/roundtrip/validate continuam
pendentes. P1/F2-09 e Writer V2 abertos. Somente commit local, sem CI/push/PR/deploy;
checkout original e servidor local preservados.

## Como verificar

Executar bookRestoreSourceIndexes em functions/test. O SDK em
tests/firestore/bookRestoreSourceIndexes.rules.test.mjs requer Firestore loopback
compatível. O restaurador ainda não ativa a cópia nem migra dados reais pela UI.
