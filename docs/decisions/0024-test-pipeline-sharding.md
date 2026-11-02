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

## Revisão para F2-03 — 2026-10-13

F2-02 ampliou a suíte para 648 casos; o maior dos três shards aprovados levou
13,8 min, próximo do limite de 15 min/job. A execução de F2-03 distribui a mesma
suíte completa em seis shards. Preserva dois workers, timeout individual de 45 s,
limite de 15 min/job, uma retentativa, uploads isolados e gate agregado requerido.
O benchmark histórico de três runners acima continua como evidência daquela base.
Medir a distribuição dos novos casos e a duração remota antes de encerrar F2-03.
O workflow Hosting conserva seu portão próprio; seu integration sem sharding em
30 min é um risco separado e não é resolvido por esta alteração do CI.

## Revisão para F2-06 — 2026-10-15

A CI de `f4a0e42` cancelou o shard 3 de seis após cerca de 15 minutos: 141 passes,
dois skips, nenhum erro/retry registrado e dois casos sem resultado. O último
teste passou 1,3 segundo antes do cancelamento. O progresso contínuo e o limite
do job indicam orçamento total esgotado; o log não explicita uma anotação de
timeout. O gate agregado recusou corretamente o resultado cancelled.

F2-06 acrescenta jornadas e passa a distribuir a suíte inteira em oito shards.
Não aumenta limite de job/teste/expectativa, não muda workers/retries nem filtra
cenários. Os contratos continuam exigindo todos os shards e produção verdes.
Conferir a união dos IDs do `--list` contra a suíte sem shards prova distribuição
sem omissão/duplicação; isso não substitui executar testes nem comprova duração
remota. O custo de preparação sobe para oito runners, com menor carga por runner.
Registrar medição real da CI após o envio; a execução antiga continua reprovada.

A enumeração local final de F2-06 encontrou 948 casos: 119/119/119/119/118/118/118/118
nos oito shards. A união dos IDs coincide com os 948 da suíte inteira, sem omissão
ou duplicação. Esse comando usa apenas `--list`, sem executar os testes novamente.

## Revisão para F2-07 C3A — 2026-10-17

A CI de `75b9104` concluiu sete shards visuais, validate Node 22/24, auditoria,
produção e regras com sucesso, mas cancelou o shard 1 no limite de 15 minutos.
Antes do cancelamento, um teste de cronologia esgotou seus 45 segundos duas vezes:
os traces mostram navegações completas redundantes consumindo o prazo. Foram
removidas duas dessas navegações, preservando reload de persistência, ordem,
downloads e comparação integral do manuscrito. A execução antiga segue cancelada.

A suíte crescente passa a doze shards completos, mantendo dois workers, limites,
retries, evidências e gate agregado. Conferir a união dos IDs enumerados contra a
suíte inteira antes do envio; enumeração não comprova execução ou duração remota.
Há mais preparações de runner; a redução da espera depende da capacidade remota.

A enumeração local de C3A encontrou 1.092 casos: 91 em cada um dos doze shards.
A união coincide com os 1.092 IDs da suíte inteira, sem omissões/duplicações.
Os oito contratos dirigidos da CI também passaram; isso preserva gates e limites,
sem constituir aprovação remota ou execução dos 1.092 testes pelo `--list`.

A CI do head `fe10b15` confirmou os doze shards e a consolidação verdes:
1.080 passes, 12 skips preexistentes, zero retries/flaky. O tempo de execução de
testes por shard ficou entre 5,4 e 9,5 minutos, sem setup/consolidação. É medição
desse head; não garante prazo futuro ou capacidade fixa de runners.

## Revisão para P1 — 2026-10-21

A matriz M1 de e847afa concluiu sete shards e cancelou 1/3/5/9/11 perto do limite
de 15 min/job; o agregador falhou. Node 22/24, auditoria e produção passaram.
Artefatos 3/9 confirmaram uma expectativa de digitação após Control+End falhando
também no retry e três jornadas que passaram no retry após exceder 45 s.
Os demais cancelados não tinham linha de falha antes do encerramento. O avanço
contínuo perto do limite é compatível com orçamento total insuficiente, sem
atribuir causa oficial aos cancelamentos somente pelo status.

A suíte completa passa a 16 shards, preservando dois workers, limite de 45 s/caso,
15 min/job, um retry, fail-fast=false, evidências por shard e gate agregado.
A enumeração --list/JSON encontrou 1.332 identidades: 84 nos quatro primeiros
shards e 83 nos demais. A união ID/projeto/caminho/título coincide com a suíte
sem shards: zero omissões, extras ou duplicações. Nenhum cenário foi filtrado.
Isso prova distribuição, não execução ou duração remota. Há quatro preparações
extras de runner; a redução de espera depende da capacidade/filas do GitHub.

A jornada de lore agora verifica foco e seleção reconhecida pela interface antes
de digitar. A primeira tentativa de verificar só o DOM falhou uma vez: o caret
aparecia no fim, mas a digitação substituiu a prosa apesar dessa indicação no DOM.
O preparo final observa a barra de seleção aparecer e desaparecer, além da
posição colapsada no DOM. Não altera runtime nem relaxa prosa/alias esperados;
também não afirma corrigir o atalho Control+End como comportamento de produto.
Veja [plano dirigido 34](../tasks/writer-v2/execucao/34-regressao-visual-e-orcamento-ci.md).

### Confirmação da revisão P1

A CI de 96ff5e0 concluiu todos os 16 shards e o agregador com sucesso:
1.320 passes, 12 skips reportados, zero retries. As seis jornadas de alias
passaram no Linux na primeira tentativa. Os logs Playwright reportam 5,5–12,4 min
por shard, sem preparação/upload/consolidação. Esse head também tem validate
Node 22/24, auditoria, produção e Rules verdes. É medição desta execução,
não garantia de prazo futuro nem aprovação de mudanças posteriores.
