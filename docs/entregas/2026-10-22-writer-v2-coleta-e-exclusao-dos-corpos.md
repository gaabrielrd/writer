# Writer V2 — Coleta e exclusão dos corpos (P1 M26)

## Objetivo e funcionalidades

Remover bytes de gerações sem referências e incluir corpos no inventário de
exclusão integral, preservando versões existentes e a raiz até a limpeza acabar.

[Plano 59](../tasks/writer-v2/execucao/59-coleta-e-exclusao-dos-corpos.md) e
[ADR 0070](../decisions/0070-book-chapter-body-cleanup.md) descrevem worker,
máscaras, nascimento fixo e compatibilidade do inventário.

## Critérios atendidos e escopo

- Coleta normal exige livro ativo, corpo unreferenced/pins zero e origem nativa.
- Lotes de até 50 filhos, com gcRevision confirmado no mesmo commit para gerar
  continuidade. Cabeçalho removido só após certificar página vazia.
- Handler revalida evento/estado e protege contra entrega repetida ou nascimento
  substituído. Versões referenciadas continuam intactas até exclusão explícita.
- Exclusão integral v2 drena corpos após revogação. Jobs antigos e finish legado
  retomam sem saltar os novos recursos; raiz e tombstone aguardam sua ausência.
- Contexto/partes alterados e controles desconhecidos interrompem sem apagar.
- Nenhuma nova dependência, Rule, callable, índice ou interface visual.

Arquivos principais: functions/src/bookChapterCleanup.mjs, sceneJobs.mjs e index.mjs,
com testes Node/SDK próprios e check sintático no functions/package.json.

## Testes e validações reais

- Node dirigido: **100/100**, sem falhas ou skips, **18.272,8962 ms**:
  bookChapterCleanup, scenes, workHistory, workProgress e bookChapterStorage.
- Arquivo Node afetado após limitar laços: **19/19**, **2.829,8811 ms**.
- SDK Admin/Rules reais em emulador loopback: **3/3**, sem falhas ou skips,
  **21.266,2737 ms**. Caso afetado pelo mesmo ajuste passou novamente em
  **13.748,9553 ms**, sem skips.
- SDK comprova páginas de 50 partes, execução concorrente do handler, proteção de
  versão, liberação explícita, retomada do finish v1, raiz preservada e recusa de
  parte alterada/cabeçalho recriado. SDK direto dos corpos continua negado.
- Lint dirigido, check de Functions, arquitetura, formatação, docs e diff passaram.
  Revisão final conferiu máscaras, deltas, nascimento, continuidade, escopo e
  compatibilidade dos inventários; sem bloqueadores neste incremento.
- npm run validate integral reservado ao fechamento P1. Frontend não mudou;
  testes/UI/build/typecheck de cliente não foram repetidos. CI ignorada.

## Limitações e próximos passos

SDK invoca o handler com snapshots reais e prova transações; não comprova entrega
Eventarc, configuração IAM ou ativação em produção. O worker está preparado no
código, sem deploy. Metadados nativos comprovam pertencimento; a limpeza não baixa
texto para recalcular seu hash. Manutenção Admin deve respeitar os protocolos.

Implantação futura exige leitores/exclusão v2/coletor primeiro e drenagem das
invocações antigas antes de habilitar produtores do novo formato e clientes
compatíveis. Não houve qualquer alteração de infraestrutura nesta entrega.

Conversão e chat aplicador ainda precisam integrar os corpos. Demais recursos/
campos grandes, personas/mídia, autorização/ativação e host/UI/roundtrip/validate
seguem pendentes em P1/F2-09. Não há restauração final habilitada.

Somente commit local; checkout original e servidor local preservados.
