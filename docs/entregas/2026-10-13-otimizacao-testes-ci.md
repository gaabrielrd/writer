# Otimização dos testes e da CI

- **Data:** 2026-10-13.
- **Branch:** `codex/otimizacao-testes-ci`.
- **Plano de origem:** plano apresentado nesta conversa, com prioridade do usuário para o E2E.

## Objetivo

Reduzir a espera pelo `validate` e pelo E2E da CI, mantendo os cenários existentes,
o isolamento, a cobertura e as evidências de revisão.

## Funcionalidades entregues

- Vitest utiliza até quatro workers, limitados pelos CPUs disponíveis.
- Navegador de produção e suíte visual executam em jobs separados.
- A CI distribui a suíte visual completa entre três runners paralelos.
- Blobs, JSON, capturas e traces de cada shard têm nomes próprios; o relatório
  HTML consolidado conserva o artefato `writer-visual-preview`.
- Repetições substituem os artefatos do próprio job, evitando colisões de nomes
  e preservando as evidências dos demais jobs.
- O check `E2E (Chromium)` conserva seu nome e recusa falhas, cancelamentos,
  jobs pulados ou resultados ausentes. Falhas na consolidação também falham o job.
- Node 22 e 24 continuam executando o `validate` completo; o cache npm considera
  os lockfiles do frontend e do backend.

## Critérios de aceite

- [x] Preservar os 851 testes frontend e os limites de cobertura.
- [x] Preservar os seis projetos visuais e seus cenários, incluindo seleção parcial.
- [x] Distribuir a suíte completa sem omissões ou duplicatas.
- [x] Manter o gate e as evidências quando um job falhar.
- [x] Medir a mesma suíte com cobertura antes e depois, sem testes concorrentes.
- [x] Executar `npm run validate` completo e registrar o resultado real.

## Arquivos alterados

| Arquivo                                         | Mudança                                                |
| ----------------------------------------------- | ------------------------------------------------------ |
| `vitest.config.ts`                              | Paralelismo limitado pelos CPUs e por quatro workers   |
| `.github/workflows/ci.yml`                      | Jobs paralelos, três shards, consolidação e gate final |
| `playwright.visual.config.ts`                   | Blobs/JSON na CI; HTML/JSON local preservado           |
| `.gitignore` e `eslint.config.js`               | Diretórios gerados pelos relatórios ignorados          |
| `scripts/ci-contracts.test.mjs`                 | Contratos e execução real do gate com estados de falha |
| `docs/testing.md`                               | Execução, reprodução de shard e evidências             |
| `docs/decisions/0024-test-pipeline-sharding.md` | Decisão e consequências                                |
| Este registro                                   | Evidência da entrega                                   |

## Testes

Os oito contratos novos verificam os limites de cobertura, os ambientes Node,
a execução integral dos shards, nomes de evidências, dependências e o gate real.
O gate é executado com sucesso, falha, cancelamento, job pulado e resultado ausente.
Os uploads também são verificados para permitir repetição com nomes próprios.

O inventário do Playwright confirmou 474 cenários únicos: 158 em cada shard,
zero omitidos, zero duplicados e os seis cenários de seleção preservados.
A amostra de personas e criação de livros executou nos três shards: cada um
aprovou 11 cenários e pulou um exclusivo de desktop, totalizando 33 aprovados e
três pulados. Os três blobs foram consolidados em um HTML único.

## Validações executadas

| Verificação                   | Resultado                                             |
| ----------------------------- | ----------------------------------------------------- |
| Benchmark, dois workers       | 116 arquivos / 851 testes, 156,04 s                   |
| Benchmark, quatro workers     | 116 arquivos / 851 testes, 79,96 s                    |
| Cobertura dos dois benchmarks | Idêntica, incluindo contagens de linhas/funções/ramos |
| `npm ci --prefix functions`   | Concluído                                             |
| `npm run validate`            | Código 0, 175,41 s no total                           |
| Frontend do gate final        | 116 arquivos, 851 testes, 93,85 s                     |
| Scripts                       | 76 testes aprovados                                   |
| Backend                       | 87 testes e syntax checks aprovados                   |
| Amostra visual distribuída    | 33 aprovados, três pulados, consolidação concluída    |
| Documentação e diff           | `check:docs` e `git diff --check` aprovados           |

```text
Test Files  116 passed (116)
     Tests  851 passed (851)
All files          |   92.86 |    86.43 |   91.32 |   94.93 |
ℹ tests 76
ℹ pass 76
ℹ fail 0
ℹ tests 87
ℹ pass 87
ℹ fail 0
Smoke test do bundle OK.
```

A suíte com cobertura ficou 48,8% mais rápida no benchmark isolado. O tempo
total de `validate` inclui todos os outros portões; o ganho do E2E no GitHub deve
ser consultado na execução da CI ligada ao PR, considerando filas e preparação
dos runners. Os logs locais ficam no diretório de evidências desta conversa,
com os prefixos `validate-tests-`, `ci-shards-report-proof` e `optimized-validate`.

O lint inicial apontou duas regex com espaços literais nos contratos; ambas
foram corrigidas e o gate completo foi repetido. Na prova local de consolidação,
a primeira chamada usou três diretórios; foi corrigida para a pasta única de
blobs, como configurado no workflow, e terminou com sucesso.

## Fora do escopo

Redução de testes/temas/cobertura, alterações de produto, regeneração de snapshots,
novas dependências, mudanças nos workflows de publicação e qualquer deploy.

## Limitações e pendências conhecidas

Os tempos locais foram medidos em Windows com Node 24, 16 CPUs disponíveis e
32 GiB de memória. A CI usa Linux e sua capacidade própria. A divisão cria três
preparações de runner e depende do shard mais demorado, seguido da consolidação.
O build conserva os avisos anteriores de tamanho de chunks e importação dinâmica
de DOCX. A suíte visual completa será validada pela CI do PR; a prova local
executou a amostra e conferiu o inventário completo.

A primeira execução remota terminou os shards em 640, 631 e 627 segundos.
Dois passaram; um apresentou uma chamada inesperada no teste de autocomplete
de desktop claro, também na retentativa automática. O relatório consolidado
foi publicado e o gate recusou corretamente esse resultado. O mesmo teste
passou em 30 repetições locais nos seis projetos; a causa remota não foi
confirmada. Na repetição remota, o shard aprovou 154 casos e pulou quatro.
O GitHub aceitou uploads repetidos e manteve artefatos de ambas as tentativas
com os mesmos nomes; a consolidação poderia receber versões concorrentes dos
mesmos arquivos. `overwrite: true` evita essa mistura, agora protegida por
contrato. A versão final
deve ser conferida na CI do PR 20, sem ocultar essa primeira falha.

Após o ajuste dos uploads, `npm run validate` foi repetido e terminou com código
0: 851 testes frontend, 77 de scripts e 87 de backend aprovados, build e smoke
verdes. O frontend levou 104,68 s nessa execução; a cobertura permaneceu
92,86% / 86,43% / 91,32% / 94,93%. Log: `optimized-validate-reruns.log`.

## Como verificar manualmente

1. Executar `npm run validate` e conferir cobertura e contagens de testes.
2. Rodar a suíte visual com `--shard=1/3`, `2/3` e `3/3` ou consultar os jobs da CI.
3. Conferir o relatório consolidado `writer-visual-preview` e o check `E2E (Chromium)`.
4. Verificar que navegador de produção e todos os shards estão aprovados.
