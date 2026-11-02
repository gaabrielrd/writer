# Writer V2 — reconciliação incremental do lore restaurado (D3 em andamento)

## Resultado

Counts seleciona explicitamente a origem indexada e a cabeça nativa v2 sem base.
Compara a projeção autenticada de cada campo/página com o intervalo correspondente
do corpo nativo, até três partes por transação. Cada parte mantém prova Merkle,
imutabilidade, barreira de nascimento e journal/recibo originais. Ao terminar o
campo/página, SHA, tamanho total e contagem devem coincidir com o manifesto.

Um controle privado restore-lore-reconcile, em payload-body do inventário
existente, fixa conta/job/origem/ID e identidade nativa da cabeça. Contém somente
fase, índices e cursor limitado; não guarda prosa, ficha ou catálogo de provas.
Cada avanço revalida explicitamente cabeça, controle e unidade da fonte.
Preparação, journal, recibo e checkpoint avançam atomicamente, com cópia nova
por tentativa SDK. O item continua pendente até terminar todas as unidades.

Datas físicas, datas lógicas originais, presença/ausência de campos, privacidade
e segmentos são conferidos. Inline e payload schema1 continuam no caminho
anterior. Não amplia a API integral nem usa leitura completa de testes como
implementação de produção. Sem novo DTO, namespace, Rule ou índice de consulta.

## Evidência Node

**34 casos distintos positivos**: 22 anteriores de Counts e 12 novos de lore
indexado, em execuções dirigidas:

- Lote inicial: 31/32. O teste grande incluiu por engano na instrumentação a
  leitura integral do harness privado, executada depois de Counts para comparar
  o resultado. Isso fez a asserção de orçamento abranger o oráculo inteiro.
- A instrumentação foi encerrada antes desse oráculo, sem mudar implementação
  ou limite. Reexecutado somente o teste afetado: 1/1 positivo.
- Dois novos casos de falha/retry e cancelamento concorrente: 2/2 positivos.
  Não é alegação de lote único de 34.

O teste grande compara toda a prosa e os IDs remapeados: campo e descrição
individual acima de 8 MiB, 130 relações, três páginas, datas ausentes, mais de
256 transações com partes e no máximo três partes nativas em cada transação
de reconciliação. Controle termina em done; raiz continua ausente.

Novos casos verificam replay sem duplicação, cleanup de produção durante a
conferência, controle/cabeça/parte/segmento/journal/recibo recriados, bytes
alterados com metadata conservada no double, rollback de falha de gravação,
callback repetido com um só avanço e cancelamento durante observação da origem
sem recibo de reconciliação. A compatibilidade anterior cobre versões v1–v6,
ledger, fontes congeladas, referências e controles derivados.

**1/1 SDK positivo**, zero skipped, 181251.2269 ms, Firestore Emulator 1.22.0
verificado em projeto demo isolado/loopback. Reexecutado somente o caso positivo
afetado de geração, ampliado para passar por Counts até personas. Confere
controle de reconciliação único em done, 65 relações/duas páginas, datas lógicas
ausentes e raiz ausente. O controle novo, confirmado existente, tem leitura SDK
negada para dono, outro usuário e anônimo. C1 recusa leitura antes da raiz.

Os dois casos independentes anteriores de geração (cancelamento e recriação de
controle) não foram repetidos neste ajuste; seu resultado permanece na evidência
do commit anterior. A reconciliação não usa coordenador sintético; os serviços,
Admin e Rules são reais no emulador. Retry forçado foi testado no double Node,
não no SDK. Não comprova Auth/Callable/App Check de produção ou piloto humano.

## Limites e próximos passos

D3 ainda precisa drenar staging com contabilidade compatível, integrar leitura
preparada/recaptura/roundtrip e habilitar novas gerações coordenadamente.
indexedLoreBodies continua false para novos jobs; jobs já streamed retomam.
Raiz geral ausente. Não conclui D3, plano 131, P1/F2-09 ou Writer V2.
Inventários/escritores/legados/host/drain/rollout, validate integral de P1, fases
3–5 e condições humanas/comerciais permanecem obrigatórios.

Formato, lint dirigido, arquitetura, documentação e diff positivos.
Sem nova fronteira browser ou alteração de tipos/UI: Chromium, Vitest e build
não foram repetidos neste ajuste de servidor. Validate global fica no fechamento
de P1 conforme orientação. Sem CI, push, PR, merge, deploy ou produção.

## Arquivos e reprodução

- functions/src/bookRestoreLoreReconcile.mjs: observação/projeção e comparação
  limitada dos corpos nativos.
- functions/src/bookRestoreCounts.mjs: seleção explícita e item pendente.
- functions/test/bookRestoreLoreReconcile.test.mjs: 12 casos novos.
- tests/firestore/bookRestoreLoreStream.rules.test.mjs: caso SDK positivo amplia
  o fluxo até Counts; os dois casos independentes anteriores não foram repetidos.

Rodar os dois testes Node de Counts/reconciliação. No SDK, selecionar somente
SDK lore generation: actual advanceLore em emulador demo dedicado verificado e
loopback. Runner/log externo QA com prefixo m38c12d3-reconcile; sem artefatos grandes
no Git.
