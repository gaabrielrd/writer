# Writer V2 — Materialização do lore próprio (P1 M28)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Origem: [plano 61](../tasks/writer-v2/execucao/61-materializacao-do-lore-proprio.md)
- Decisão: [ADR 0072](../decisions/0072-restored-book-local-lore.md)

## Objetivo e funcionalidades

Preparar as fichas próprias do livro e suas relações para a futura cópia privada,
com retomada após interrupção e cancelamento seguro. O destino continua sem raiz
ativa; esta entrega interna não apresenta uma jornada nova no navegador.

## Critérios atendidos

- [x] Texto e campos próprios preservados, IDs locais remapeados e referências
      externas conservadas sem copiar/resolver lore global ou publicar conteúdo.
- [x] Relações em páginas de até 64, com prova do item/índice reconferida no commit.
      Ausência e array vazio continuam distintos; datas novas fixas na preparação.
- [x] Cursor separado encontra lore intercalado e conserva o cursor principal dos
      recursos pendentes. Manifesto confere contagem antes da fase scenes.
- [x] Ficha/journal/cursor/recibo atômicos; retry automático, replay histórico e
      operação gêmea não duplicam relações ou artefatos.
- [x] Inventário v6 antes da primeira escrita, namespace certificado vazio,
      limpeza limitada e mascarada, compatibilidade v1–v5 e corpos de capítulo.
- [x] Cancelamento durante leitura, prova alterada e recriação nativa bloqueiam
      gravação/limpeza sem substituir ou apagar dados de outra origem.
- [x] Falha por tamanho nativo conserva fonte integral e checkpoint anterior.
      Nenhuma redução do formato lógico de 8 MiB ou truncamento.

## Arquivos alterados

| Grupo                                                      | Mudança                                |
| ---------------------------------------------------------- | -------------------------------------- |
| functions/src/bookRestoreLore.mjs                          | Escritor interno e varredura paginada  |
| bookRestoreArtifacts, Upload, UploadContracts              | Inventário/progresso/recibos v6        |
| bookRestoreStructure, Integrity, ValidationCleanup         | Barreiras de fase e cleanup compatível |
| functions/package.json                                     | Sintaxe inclui o módulo novo           |
| Testes Node/helper e bookRestoreLore.rules.test.mjs        | Comportamento e SDKs reais             |
| AGENTS, README, arquitetura, testes, ADR, plano e execução | Contratos, limites e evidência         |

## Testes e validações reais

**131 testes Node distintos positivos**: lote dirigido de nove arquivos,
127/127 em 3.151,8943 ms, mais quatro novos cenários de prova/replay/cleanup.
Consolidação final do arquivo de lore: 21/21 em 2.895,6772 ms.

O lote inclui bookRestoreLore, Structure, Remap, ContentRead, Upload, Integrity,
Validation, LegacyValidation e bookChapterText. Repetições não foram somadas
como casos distintos. As falhas iniciais de fixtures (IDs curtos/colisão,
framing grande e limite de iteração) foram corrigidas antes das execuções finais.

```text
# Lote de regressão dirigido
tests 127
pass 127
fail 0
skipped 0

# Lore após os quatro casos adicionais
tests 21
pass 21
fail 0
skipped 0
```

**3 testes com SDK real positivos**, sem falhas/skips, em 135.091,1597 ms,
no emulador Firestore 1.22.0 verificado e porta loopback dedicada:

1. Lore intercalado, 130 relações em páginas, nascimentos/atualizações nativas
   iguais aos journals/recibos, SDK direto negado a dono/outro/anônimo e cleanup.
2. Ficha acima de 1 MiB recusada pelo limite nativo, com fonte exata,
   checkpoint e timestamp anteriores, sem ficha/recibo parcial, e cancelável.
3. Documento preparado recriado impede append e cleanup; o novo nascimento
   permanece preservado.

```text
tests 3
pass 3
fail 0
skipped 0
duration_ms 135091.1597
```

Lint dirigido, check de Functions e arquitetura passaram. Formatação, links/docs,
diff e revisão final foram conferidos antes do commit. O diff mantém o transporte
público e as Rules; não há nova dependência ou segredo.

Não foi necessário repetir Vitest/typecheck/build de cliente: nenhuma mudança de
código cliente. npm run validate integral permanece no fechamento do grande bloco
P1, conforme orientação do operador. CI ignorada, sem push/PR/deploy.

## Limitações e próximos passos

A representação de fichas/campos/arrays grandes e seus consumidores continua
obrigatória antes da ativação: a família nativa existente pode exceder o limite
do Firestore. A prova de rollback não demonstra suporte integral a esses itens.

Faltam cenas/fontes/referências/narrativa, personas, histórico/rascunho/capa,
autorização final, ativação, host/UI, roundtrip e validate integral. P1/F2-09 e
o objetivo Writer V2 continuam abertos. A futura implantação deve preparar
leitores/cleanup antes de habilitar o produtor.

Para verificar, execute o teste Node dirigido indicado em docs/testing.md.
O teste SDK exige Firestore local (FIRESTORE_EMULATOR_HOST loopback); não deve
usar credenciais/ambiente de produção. Não há ação manual nova na interface.
Checkout original e servidor local preservados.
