# ADR 0024 — Paralelismo dos testes e sharding visual

- **Status:** Aceito
- **Data:** 2026-10-13

## Contexto

O usuário identificou o E2E como o maior gargalo da CI, com esperas de 25 minutos
ou mais. Um único job executava navegador de produção, seleção por mouse e a
suíte visual inteira. Os seis cenários de seleção se repetiam nessa suíte.

No checkout principal, o benchmark isolado de 851 testes em 116 arquivos,
com cobertura e dois workers, demorou 156,04 s. Com quatro workers, os mesmos
testes passaram em 79,96 s. As contagens de cobertura foram idênticas.

## Decisão

Vitest usa `min(4, availableParallelism())`, mantendo o pool e o isolamento
existentes. Os limites continuam em 85% para instruções/linhas, 75% para ramos
e 90% para funções. O `validate` completo permanece em Node 22 e 24 na CI.

A CI separa navegador de produção e suíte visual. Playwright distribui a suíte
visual completa em três runners com `--shard`, aproveitando `fullyParallel` já
ativo. Cada runner mantém dois workers, os mesmos timeouts e uma retentativa.
Na conferência inicial, os 474 cenários foram distribuídos em 158 por shard,
sem omissões ou duplicatas, preservando os seis cenários de seleção.

O navegador e todos os shards executam em paralelo. `fail-fast: false` conserva
os resultados e as evidências mesmo quando um shard falha. Os blobs são
consolidados em HTML; capturas, traces e JSON por shard permanecem disponíveis.
O nome **E2E (Chromium)** identifica o gate final, que recusa qualquer resultado
diferente de sucesso nos jobs de navegador ou visual, incluindo cancelamento,
job pulado e resultado ausente. Falhas na consolidação também falham o job.

Os uploads usam nomes exclusivos por job/shard e `overwrite: true`. Assim,
repetir somente jobs com falha substitui seus próprios artefatos e conserva os
dos jobs que já passaram. A consolidação recebe a evidência mais recente de
cada shard, sem misturar tentativas ou duplicar cenários.

## Consequências

O tempo de espera passa a depender do shard mais demorado e da consolidação,
com três preparações de runner em vez de uma. A redução real no GitHub depende
da capacidade e disponibilidade dos runners, e deve ser medida na execução
remota; o benchmark local mede somente o Vitest.

A identidade dos cenários, a cobertura, os testes de segurança, os snapshots e
os fluxos de produto são preservados. Os contratos da CI protegem o gate e os
limites. Os workflows de publicação mantêm seus portões e autorizações próprios.
Não foram adicionadas dependências ou alterações de runtime do produto.

Referência: [sharding e consolidação de relatórios do Playwright](https://playwright.dev/docs/test-sharding).
