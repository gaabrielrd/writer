# Writer V2 — leitura privada da estrutura de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: 66d5565.
[Plano 148](../tasks/writer-v2/execucao/148-leitura-da-estrutura-de-aventuras.md),
[ADR 0171](../decisions/0171-adventure-backup-structure-read.md).

## Escopo entregue

Leitor interno lista partes por metadata/cursor e lê raiz/parte em unidades de
até 64 KiB com hash integral. Usa fonte e identidade nativa na mesma transação.
Codec próprio preserva metadata literal, datas zero, ausência/vazio/null e texto
legado da parte, sem serializar owner, contadores, jobs, importId ou URLs de origem.
Não consulta perfil por coincidência nem usa procedência como grant.

Fonte 147 foi extraída para reuso transacional sem mudar getter/saída/hash v1.
Revisão capturou também índice antes do primeiro await; teste altera a entrada
durante uma espera e comprova que faixa/IDs/tokens originais permanecem.
Falhas de corpo externo, exclusão, rebalance, futuro schema e metadados não
representáveis não retornam stub ou estrutura parcial como sucesso.

Arquivos: adventureBackupSource, novo adventureBackupStructure e
adventureBackupRead; testes Node de fonte/leitura e novo
tests/firestore/adventureBackup.rules.test.mjs. Sem frontend, endpoint, Rule,
dependência, escrita ou mudança de formato de livros.

## Validação dirigida real

Seleção final dos dois arquivos Node:

```text
ℹ tests 64
ℹ pass 64
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 384.1752
```

Inclui produtor real do Estúdio/partes em memória, 53 membros, páginas limitadas
sem prosa, Unicode/quotes/BOM e texto grande, remontagem/hash, presença literal,
mudança/ABA de raiz/controle/item, autoria/escopo/entrada, provenance filtrada,
schema/corpo externo e nenhuma escrita. Vetor v1 da fonte anterior permanece
c41d18f83b27fdecddd06b3b2f10dd77f1135a99339aa66ee8736e6d3469628e.

SDK real em Firestore Emulator 1.22.0 verificado e loopback/demo, seleção final:

```text
# tests 3
# pass 3
# fail 0
# skipped 0
# duration_ms 8166.2951
M60 targeted adventure SDK passed
```

Três cenários cobrem 52 partes dos produtores reais, máscara nativa sem texto,
cursors/bytes/hash, Rules contra outro/anônimo e escrita direta, recriação física,
writer estrutural mudando a fonte, falha de leitura e retentativa sem mutação.
Recusas PERMISSION_DENIED nos logs são esperadas. A primeira seleção SDK também
passou (8.013,3991 ms); após capturar índice/novo cenário, foram repetidos os
três casos sobre a versão final. Não somar execuções como casos distintos.

Lint dirigido positivo. Sintaxe dos três módulos, docs/arquitetura/styleguide,
formatação e diff são conferidos antes do commit. Validate completo de P2 será
executado no fechamento do bloco, conforme orientação do operador. O validate
de P1 em 3cf8823 não certifica esse código novo. Sem nova prova Chromium/callable
ou credenciais de produção.

## Revisão e pendências

Sem bloqueador remanescente nesse recorte interno. Cada faixa relê um documento
inline; memória não cresce com o projeto e não há promessa de uma leitura física
única por item. Origem não é selo de todas as famílias, conforme matriz no plano.

Próximo: cenas/blocos/planejamento/referências e demais famílias; pacote completo,
validador/restauração/UI/roundtrip continuam pendentes. P2/P3/D, fases e gates não
estão concluídos. Sem CI, push, PR, merge, deploy ou subagente.
