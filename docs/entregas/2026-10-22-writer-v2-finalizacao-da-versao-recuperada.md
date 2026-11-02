# Writer V2 — Finalização da versão recuperada (P1 M34c)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 69](../tasks/writer-v2/execucao/69-finalizacao-da-versao-recuperada.md)
- Decisão: [ADR 0080](../decisions/0080-restored-draft-version-finalization.md)

## Objetivo e funcionalidades

Finalizar o rascunho diferente como versão manual privada, preservando o
manuscrito salvo e os metadados/estilo no próximo backup. Reconferir as partes
contadas antes de confirmar qualquer manifesto.

## Critérios atendidos

- [x] Item M21, descriptor, capítulo, perfil e corpos comprovados; conferência
      final por máscara detecta alteração/recriação após leitura.
- [x] Sequência/UTF-8/BOM/hash/bytes íntegros e countVisibleWords real, inclusive
      texto vazio, HTML e contribuição de 20 MiB. Nenhum wordCount inventado.
- [x] Contagem monta um único rascunho na RAM; nenhum limite total novo. Commit
      reconfere identidades sem reler a prosa inteira na mesma transação.
- [x] Novo manifesto manual com data do servidor, rótulo fixo e corpos imutáveis.
      None/saved não criam versão nem alteram o manuscrito.
- [x] draft portátil opcional fechado/canônico, com metadados e perfil exatos,
      remapeamento interno e sem promover snapshot histórico a vínculo ativo.
- [x] Captura cliente congela metadata, detecta mudança entre páginas e emite
      JSON em partes de até 64 KiB. Dados antigos sem draft continuam aceitos.
- [x] Listagem por limite de linhas/orçamento e cursor do último item entregue;
      captura aceita páginas curtas não vazias e mantém os controles de integridade.
- [x] Header/journal/cursor/recibo atômicos, rollback/retry/replay/cleanup
      compatíveis e fase cover sem consumir a capa. Inventário v11 mantido.
- [x] Raiz ausente/countReady false; nenhuma ativação, API pública, Rule,
      dependência ou crédito novo.

## Arquivos

BookRestoreDraftFinalize e observações de Artifacts finalizam a contribuição.
Upload/UploadContracts/DraftContracts/Functions check integram ação/estado.
BookBackupSchema(.mjs/.d.mts), Remap, WorkHistory/Contracts, modelos/captura de
manuscript-history e bookHistoryBackupRecords preservam a metadata e a página
por orçamento. Testes Node/Vitest/SDK, AGENTS, README, arquitetura/testes,
plano/execução e ADR completam o incremento.

## Testes e validações reais

**197 testes Node distintos positivos**: regressão em 12 arquivos, 196/196 em
7.713,6067 ms; mais um teste isolado de 20 MiB, 1/1 em 6.063,1161 ms.

```text
# Regressão dirigida
tests 196
pass 196
fail 0
skipped 0
duration_ms 7713.6067

# Rascunho de 20 MiB
tests 1
pass 1
fail 0
skipped 0
duration_ms 6063.1161
```

Arquivos: DraftFinalize, Draft, Personas, Universe, History, Upload, ContentRead,
Remap, BookBackupContent, Validation, LegacyValidation e WorkHistory; teste grande
em arquivo próprio. O rascunho de 20.971.520 bytes resultou em 320 partes e
2.621.440 palavras. Cobre vazio/igual/removido, HTML, metadados/datas/perfil,
hash/provas, ABA entre contagem e commit, rollback/retry/replay, cleanup e
segunda projeção/validação sem promover o perfil histórico a ativo.
A fixture inicial de paginação usava datas null inválidas; corrigida para datas
válidas e repetido somente o cenário afetado antes da regressão final.

**68 testes Vitest distintos positivos**, quatro arquivos: 62/62 na regressão
de WorkHistoryBackupStream/Service e BookHistoryBackupRecords, 1,82 s; mais seis
cenários novos de metadata recuperada. Os seis passaram novamente em 1,44 s após
correções de lint das fixtures (Promises/tipos/JSON unknown). Repetições não
foram somadas como testes distintos. Inclui páginas curtas, congelamento,
mudança de snapshot, campos inválidos e cabeçalhos JSON maiores que um frame.

**2 cenários SDK reais positivos**, Firestore 1.22.0 verificado e porta loopback
dedicada; nenhuma falha/skip, 146.253,4026 ms:

1. Corpo preservado, header ocupado sem avanço/recibo, finalização única,
   contagem/metadata, prova nativa, leitor/listagem sob raiz sintética e cleanup:
   75.501,2923 ms.
2. Corpo recriado depois da leitura contada impede o commit final:
   69.957,6785 ms.

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 146253.4026
```

Typecheck, sintaxe de Functions, arquitetura e lint dirigido passaram.
Bundle cliente passou e smoke test OK. Permanecem avisos de chunks acima de
500 kB e imports dinâmicos também importados estaticamente; não impediram build.
Formatação/docs/diff e revisão final conferidos antes do commit.
Sem mudança visual ou nova tela; jornadas de host/UI não foram executadas.
Validate integral permanece reservado ao fechamento do grande bloco P1.

## Limitações e próximos passos

A versão foi finalizada privadamente; a raiz sintética nos testes não é
ativação pelo restaurador. A contagem usa RAM proporcional a um rascunho.
Metadata acima do envelope nativo falha intacta; representação integral desses
campos continua obrigatória, sem truncamento/redefinição do escopo.

Faltam capa, integração de personas, campos grandes/consumidores, certificação/
ativação e host/UI/roundtrip/validate. P1/F2-09 e Writer V2 continuam abertos.
Somente commit local; CI ignorada, sem push/PR/deploy. Checkout original e
servidor local preservados.
