# Writer V2 — Histórico na preparação privada (P1 M33)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 66](../tasks/writer-v2/execucao/66-historico-na-preparacao.md)
- Decisão: [ADR 0077](../decisions/0077-restored-history-stream.md)

## Objetivo e funcionalidades

Preparar todo o histórico manual e anterior a restaurações em etapas retomáveis,
preservando versões de recursos removidos e o texto salvo do manuscrito.
A cópia continua sem raiz e não é apresentada como livro restaurado utilizável.

## Critérios atendidos

- [x] Uma parte raw de origem por unidade, com cadeia, identidade, posição e
      provas do item/bytes conferidas no commit; nenhum cursor do cliente.
- [x] UTF-8/BOM, texto vazio, datas, razão e rótulo preservados. IDs/relações
      remapeados; versões de capítulos/cenas removidos não recriam os recursos.
- [x] SHA incremental e comprimento integral antes do manifesto; corpos nativos
      de até 64 KiB. Progresso sem coleção de todos os textos ou limite de versões.
- [x] Manifestos schema1/corpos compatíveis com leitores existentes. wordCount
      histórico conserva o snapshot e não altera o ledger do manuscrito.
- [x] Preparação v7 fixa começo do histórico/totais e só avança item ao terminar
      cada versão. work-history fecha com relatório antes de draft.
- [x] Inventário v10 antes dos recursos; namespaces vazios e journal/corpo/
      cursor/recibo atômicos. Compatibilidade v1–v9 e recibos históricos.
- [x] CAS/replay, serviço reinstanciado, rollback/retry, cancelamento durante
      leitura, hash inválido, origem alterada e namespace ocupado recusados.
- [x] Cleanup limitado preserva outra cópia e corpo recriado; remove corpos
      parciais sem manifesto e certifica ambas as novas famílias vazias.
- [x] Produção sem raiz/countReady, API pública, Rule, dependência ou crédito novo.

## Arquivos

BookRestoreHistory e seu contrato puro implementam o escritor/progresso.
ContentRead acrescenta leitura raw limitada; Artifacts/Upload/UploadContracts/
Integrity/ValidationCleanup incluem inventário v10. Functions check incorpora
os módulos. Fixture e testes Node/SDK, AGENTS, README, arquitetura/testes,
plano/execução e ADR completam o incremento.

## Testes e validações reais

**284 testes Node distintos positivos**, 17 arquivos, incluindo 18 cenários de
histórico restaurado; nenhuma falha/skip, 11.051,3079 ms.

```text
tests 284
pass 284
fail 0
skipped 0
duration_ms 11051.3079
```

Arquivos: bookRestoreHistory, Universe, Personas, Counts, Resources, Lore,
Structure, Remap, ContentRead, Upload, Integrity, Validation, LegacyValidation,
bookChapterText, bookBackupUniverseRead, universes e workHistory.
Cobre 17 partes/1.114.112 bytes, unidade limitada, leitores existentes após raiz
sintética, vazio/BOM/Unicode, recursos removidos, datas/rótulo/razão, JSON v1–v6,
replay/CAS/retry, partes sem manifesto, corrupção e limpeza com nascimento nativo.

A primeira rodada encontrou oito falhas nas fixtures: payload acima dos 64 KiB
permitidos pelo pacote, ID de operação curto e interceptação de leitura fora
da transação usada pelo serviço. Corrigidas as fixtures, os oito cenários
afetados passaram; a regressão final acima também passou. Não houve redução
de limite, remoção de asserts ou enfraquecimento do contrato para ajustar testes.

**2 testes SDK reais positivos**, Firestore 1.22.0 verificado, porta loopback
dedicada; nenhuma falha/skip, 141.816,6259 ms:

1. Privacidade de dono/outro/anônimo, corpo ocupado sem avanço/recibo,
   retomada, prova nativa, leitor de histórico e cleanup v10:
   74.987,4055 ms.
2. Corpo parcial recriado impede cleanup e mantém a nova encarnação:
   66.048,0565 ms.

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 141816.6259
```

Lint dirigido, sintaxe de Functions e arquitetura passaram. Formatação/docs/diff
e revisão final conferidos antes do commit. Sem código cliente modificado:
Vitest/typecheck/build não repetidos; validate integral no fechamento P1.
Os testes usam raiz sintética somente para conferir o leitor, sem comprovar
ativação pela restauração nem jornada completa no navegador.

## Limitações e próximos passos

A conferência final dos artefatos antes da raiz continua obrigatória, mesmo
após preparar um manifesto: partes podem mudar depois da preparação.
Rótulos/campos grandes que excedam o envelope nativo falham intactos; suporte
integral a esses campos segue obrigatório em P1. Não houve truncamento.

Faltam rascunho como versão separada, capa, integração de personas, campos
grandes/consumidores, certificação/ativação e host/UI/roundtrip/validate.
P1/F2-09 e Writer V2 continuam abertos. Somente commit local; CI ignorada,
sem push/PR/deploy. Checkout original e servidor local preservados.
