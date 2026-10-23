# Writer V2 — Texto lógico das fontes de conversão (P1 M37a)

- Data: 2026-10-23
- Branch: codex/writer-v2
- Plano: [contrato 74](../tasks/writer-v2/execucao/74-texto-logico-das-fontes-de-conversao.md)
- Decisão: [ADR 0085](../decisions/0085-frozen-scene-source-text.md)

## Objetivo e funcionalidades

Preservar fontes congeladas de conversão acima do limite de um documento,
sem cortar texto e sem depender da existência atual do capítulo. Leitura privada
e novo backup recuperam o texto literal, incluindo Unicode e BOM.

## Critérios atendidos

- [x] Texto externo pelo corpo de capítulo existente, geração imutável/pin próprio,
      até 128 partes de 64 KiB e fonte/cursor/journals/recibo atômicos.
- [x] Reconciliação compara texto lógico e hash; backup preserva original e
      omite ponteiro físico.
- [x] Fonte acima de 1 MiB e item perto do limite de 8 MiB restaurados sem raiz;
      contagens continuam indisponíveis até ativação.
- [x] Colisão/retry/replay preservam cursor e não duplicam geração.
- [x] Leitor privado por token nativo e revisão atual, sem precisar do capítulo;
      origem recriada ou corrompida não se torna fonte vazia.
- [x] Cliente mantém SceneSource com texto completo, confere conta/hash/UTF-8/BOM
      e autorização final, sem persistência.
- [x] SDK direto fechado inclusive com raiz própria existente; limpeza preserva
      partes recriadas e reutiliza inventários v5/v7 e delete-book v2.
- [x] Nenhuma ativação, Rule, dependência ou componente visual novo.

## Arquivos alterados

BookSceneSourceText/Read implementam representação/leitura. BookRestoreResources,
BookRestoreCountEffects e BookBackupResourceRead integram escrita, reconciliação
e exportação. Scenes/index registram o callable privado e a lista projetada.
SceneService/SceneSourceText no cliente montam as fontes sem mudar seus consumidores.
Functions check inclui os módulos novos. Fixtures/testes Node/SDK/Vitest,
AGENTS, README, arquitetura/testes, plano/registro e ADR completam o incremento.

## Testes e validações reais

**110 casos backend distintos positivos**, seis arquivos em lotes dirigidos:

```text
# Recursos, contagens, consumidores e backup
tests 62
pass 62
fail 0
skipped 0
duration_ms 6730.6256

# Cenas e consumidores (18 casos também estão no lote anterior)
tests 37
pass 37
fail 0
skipped 0
duration_ms 5080.334

# Fonte lógica e coleta/deleção de corpos
tests 29
pass 29
fail 0
skipped 0
duration_ms 6880.5933
```

São 10 cenários novos de fonte lógica. Não somar os 18 casos repetidos.
Depois de explicitar a recusa de null sem manifesto e instrumentar o custo do
backup, somente os dois casos afetados foram repetidos: 2/2, 1243.2971 ms.
A fonte próxima de 8 MiB preservou 128 partes; commits ficaram abaixo de 500
gravações. Colisão, retry, corrupção, recriação nativa e limpeza cobertos.

**58 testes Vitest distintos positivos**: 42 dos serviços de cenas/composição,
mais 16 de fontes externas. O lote inicial teve 56/56, 1,91 s; os dois novos
casos de UTF-8 inválido/ausência de conta foram incluídos e somente o arquivo
afetado foi repetido: 16/16, 1,71 s. Não somar repetições.

**Três cenários SDK reais positivos**, Firestore 1.22.0 verificado e portas
loopback dedicadas:

```text
# Restauração >1 MiB, leitura/backup, cleanup e parte recriada
tests 2
pass 2
fail 0
skipped 0
duration_ms 214134.8093

# Corpo privado mesmo com raiz própria existente
tests 1
pass 1
fail 0
skipped 0
duration_ms 2632.0125
```

SDK confere timestamps do mesmo commit, texto/backup literal, invalidação após
recriação da raiz, cleanup e preservação de parte recriada. O último cenário
usa plano nativo para testar Rules/leitor com raiz existente; não substitui a
validação do arquivo ou prova ativação. Raízes de leitura são harnesses sintéticos.

Tipos, arquitetura, sintaxe de Functions e bundle/smoke positivos. Bundle em
1,69 s, com avisos existentes de chunks grandes e imports dinâmicos também
importados estaticamente. Lint detectou uma asserção de tipo redundante, removida;
o arquivo passou novamente. Formatação, lint dirigido, links e diff conferidos
antes do commit. Não foram executadas jornadas visuais/autenticadas de restauração.
Validate integral permanece para o fechamento de P1, conforme instrução do usuário.

## Limitações e continuação

A instrumentação Node contou **361 leituras de partes para 19 páginas de saída**
do backup da fonte. Isso mede o algoritmo no teste, não faturamento. O primeiro
cenário SDK levou 115220.6048 ms incluindo preparação, leitores e cancelamento;
não é benchmark isolado de exportação. O backup ainda recompõe um item a cada
página; otimizar esse custo antes de habilitar P1 por completo.

Este incremento cobre original.content das fontes. Lore, outros campos de
cenas/narrativa, metadados (inclusive títulos da fonte), labels e metadata de
histórico/rascunho continuam pendentes. A conversão autoral conserva seus limites
atuais; nenhum consumidor é autorizado por uma origem apenas reservada.

Implantar leitor/callable/cliente antes de fontes externas. Ainda faltam
capa/biblioteca, certificação/ativação, limpeza pós-ativação e host/UI/roundtrip/
validate. P1/F2-09 e Writer V2 abertos. Somente commit local; sem CI/push/PR/deploy.
Checkout original e servidor local preservados.

## Como verificar

Executar os testes Node de bookSceneSourceText e Vitest de sceneSourceText.
O SDK em tests/firestore/bookSceneSourceText.rules.test.mjs requer Firestore
loopback compatível. O restaurador ainda não oferece ativação completa na interface.
