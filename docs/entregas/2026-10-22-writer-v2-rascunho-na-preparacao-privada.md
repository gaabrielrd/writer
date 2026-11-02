# Writer V2 — Rascunho na preparação privada (P1 M34b)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 68](../tasks/writer-v2/execucao/68-rascunho-na-preparacao-privada.md)
- Decisão: [ADR 0079](../decisions/0079-restored-draft-preparation.md)

## Objetivo e funcionalidades

Preservar a contribuição explícita do rascunho sem substituir o manuscrito salvo:
texto, metadados e estilo são preparados em etapas privadas. A finalização da
versão separada ainda é obrigatória antes de disponibilizar a cópia.

## Critérios atendidos

- [x] Uma parte raw por unidade, UTF-8/BOM exatos, SHA/tamanho integrais e provas
      do item/bytes no commit. Nenhum limite total novo ou lista de partes.
- [x] Comparação com capítulo legado comprovado, inline ou corpo lógico.
      Texto igual evita duplicação; campo congelado composto não serve como atual.
- [x] Vazio presente difere de none. Capítulo removido não é recriado; corpo
      diferente usa identidade independente das versões históricas remapeadas.
- [x] Metadados integrais e vínculo/hash de estilo em preparedDrafts/current.
      Perfil exclusivo preparado; compartilhado é comprovado e mantém native/journal
      sem no-op. Biblioteca atual preservada e draftProfileId estável.
- [x] Inventário v11 antes do namespace novo, progresso v8 e compatibilidade
      dos inventários/recibos anteriores. Cursor só avança após hash completo.
- [x] CAS/replay, rollback/retry, namespace ocupado e cancelamento durante leitura
      não deixam contribuições parciais confirmadas ou recibos novos.
- [x] Cleanup limitado remove partes sem descriptor e preserva biblioteca/outra
      cópia. Descriptor recriado não é apagado pela prova antiga.
- [x] Fase draft-finalize impede seguir para capa antes da finalização.
      Sem workVersions novo, raiz/countReady, API pública, Rule, dependência ou crédito.

## Arquivos

BookRestoreDraft/Contracts implementam o escritor e progresso; HistoryContracts
reutiliza o validador puro de checkpoint raw. Artifacts/Upload/UploadContracts/
Integrity/ValidationCleanup incorporam inventário v11. Functions check inclui
os módulos. Fixture e testes Node/SDK, AGENTS, README, arquitetura/testes,
execução/plano e ADR registram o comportamento e a continuação.

## Testes e validações reais

**105 testes Node distintos positivos**, seis arquivos, incluindo 12 cenários
de rascunho; 7.317,2267 ms, sem falhas/skips.

```text
tests 105
pass 105
fail 0
skipped 0
duration_ms 7317.2267
```

Arquivos: bookRestoreDraft, Personas, Universe, History, Upload e ContentRead.
Cobre texto vazio/ausente, recurso removido, mesma prosa inline/corpo lógico,
campo congelado composto, BOM/Unicode, 1.120.003 bytes em partes, metadados/datas/
perfil exatos, CAS/replay, rollback/retry, cancelamento e inventário v11.
Após a revisão, o caso de progresso inválido ganhou ausência de draft e exigência
de identity-conflict controlado: repetido isoladamente, 1/1 em 481,0426 ms.
Essa repetição não foi somada como teste distinto.

**Dois cenários SDK reais positivos**, Firestore 1.22.0 verificado, porta loopback
dedicada, sem falhas/skips; total 143.511,0145 ms:

1. Texto/perfil exatos, privacidade de dono/outro/anônimo, corpo ocupado sem
   avanço/recibo, retomada, prova nativa, deduplicação e cleanup v11:
   75.329,1074 ms.
2. Descriptor recriado preservado, com cleanup bloqueado pela prova antiga:
   67.363,529 ms.

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 143511.0145
```

PERMISSION_DENIED é esperado nas asserções de negação. Nenhuma raiz ou manifesto
de versão recuperada foi inserido nos testes; a preparação permanece privada.

Sintaxe de Functions, arquitetura e lint dirigido passaram. Formatação/docs/diff
e revisão final conferidos antes do commit. Sem código cliente modificado:
Vitest/typecheck/build não repetidos. Validate integral fica no fechamento P1.

## Limitações e próximos passos

M34c deve conferir contagem de palavras, preservação portátil dos metadados/perfil
e todos os corpos, finalizar a versão separada e só então seguir para capa.
Não foi fabricado wordCount zero nem uma versão utilizável nesta etapa.
Metadata acima do envelope nativo falha intacta e suporte integral a esses
campos continua obrigatório antes da ativação.

Faltam finalizar a versão, capa, integração de personas, campos grandes/
consumidores, certificação/ativação e host/UI/roundtrip/validate.
P1/F2-09 e Writer V2 continuam abertos; nenhuma jornada de restauração final
foi demonstrada no navegador. Somente commit local; CI ignorada, sem push/PR/deploy.
Checkout original e servidor local preservados.
