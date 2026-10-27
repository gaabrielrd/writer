# Progresso do Writer V2

**Snapshot:** 2026-10-21, branch `codex/writer-v2`; L concluído em `087bced` e I em `ffc01d9`, ambos com CI/regras verdes. A implementado e validado localmente, com CI do novo head pendente.
Este relatório conta tarefas do plano, sem atribuir o mesmo esforço a cada tarefa.

| Fase                          | Total de tarefas | Implementadas | Restantes |
| ----------------------------- | ---------------: | ------------: | --------: |
| 2 — Criar e preparar          |                9 |             8 |         1 |
| 3 — Compartilhar e usar       |                8 |             0 |         8 |
| 4 — Publicar e comercializar  |               12 |             0 |        12 |
| 5 — Validar e lançar          |                6 |             0 |         6 |
| **Implementação (fases 2–5)** |           **35** |         **8** |    **27** |

**8/35 = 22,9% por contagem de tarefas implementadas e tecnicamente
concluídas.** F2-08 terminou a validação local em `a9b588a`; a CI original falhou
por timeouts em dois shards visuais. A correção `e924890` dividiu os cenários
longos, passou em 78 combinações dirigidas e na
[CI geral 39597170795](https://github.com/gaabrielrd/writer/actions/runs/39597170795)
e nas [regras 39597170719](https://github.com/gaabrielrd/writer/actions/runs/39597170719),
ambas concluídas com sucesso. Sem merge ou deploy.

F2-01 a F2-07 cobrem Estúdio, cenas/composição, arcos/cronologia, metas/retomada,
histórico/restauração, aventuras/blocos e campanhas/base/variantes/adoção/exclusão.
F2-08 acrescenta sessões, referências de lore, cenas completas, pistas e missões
particulares da campanha, reutilizáveis entre sessões.

F2-09 L foi implementado e validado localmente: lore próprio de aventura, menções e referências, com quatro famílias SDK e 12 combinações nativas positivas. CI de `2af6df5` revelou duas expectativas legadas, corrigidas e revalidadas localmente; O head corrigido `087bced` passou na CI geral 39607044458 e regras 39607044506;
a primeira execução teve um shard cancelado após 103 passes, preservado na
[entrega L](../../entregas/2026-10-21-writer-v2-lore-proprio-de-aventura.md).
L está concluído tecnicamente. I está implementado e validado localmente: 2.123 testes
frontend, 85 scripts e 444 Functions; quatro famílias SDK e 16 combinações nativas
novas únicas positivas, mais cinco regressões legadas. Concluído tecnicamente em
ffc01d9: CI geral 39622654285 e regras 39622654323 (162/162) verdes.
A acrescenta chat autorizado de cenas/blocos, persona por aventura/cena,
proveniência e aplicação atômica; validate verde (2.527 frontend, 85 scripts, 615 Functions),
30 combinações nativas novas e três regressões positivas. CI do novo head pendente;
[entrega A](../../entregas/2026-10-21-writer-v2-chat-autorizado-de-cenas.md).
As quatro verticais seguintes (P1/P2/P3/D) continuam planejadas. O
[plano I](execucao/27-importacao-revisada-de-aventura.md) e sua
[ABI](execucao/28-contratos-da-importacao-de-aventura.md) detalham a importação e a
recuperação protegida aprovada; [entrega local I](../../entregas/2026-10-21-writer-v2-importacao-revisada-de-aventura.md)
com falhas iniciais e limites preservados. [O detalhamento](execucao/25-lore-importacao-e-portabilidade.md)
separa lore local, importação, IA, portabilidade de livro/aventura/campanha e
validação integrada. Uma tarefa restante no índice representa vários incrementos.

A fase 1 tem seis tarefas de direção/fundamentos, tratadas separadamente desta
contagem de implementação. Artefatos técnicos foram produzidos; habilitação
comercial/contratos e pilotos humanos continuam com pendências explícitas.
A fase 6 é candidata posterior, fora da primeira versão pública.

Não interpretar 22,9% como percentual de horas gastas, esforço restante ou produto
pronto para lançamento. Colaboração, comércio, operação e aceites ainda concentram
trabalho relevante. A [timeline](timeline.md) distingue baseline histórica de saldo;
não há apontamento de horas humanas suficiente para um percentual por esforço.

Fontes: [registro de execução](execucao/README.md), índices das fases
[2](fase-02-criar-e-preparar/README.md), [3](fase-03-compartilhar-e-usar/README.md),
[4](fase-04-publicar-e-comercializar/README.md) e
[5](fase-05-validar-e-lancar/README.md), além da
[entrega S3](../../entregas/2026-10-21-writer-v2-pistas-e-missoes.md).

## Atualização local de P1 em 2026-10-24

A2c acrescenta aplicação transacional do lote preparado com crédito/recibo
reais, sobre reserva/preparo A2b e adoção A2a. Consulte o
[plano 98](execucao/98-aplicacao-integral-da-analise-preparada.md) e o
[registro de execução](execucao/README.md) para a validação efetiva.

Esse avanço interno não conclui F2-09: cliente/endpoints, demais escritores/
consumidores, backup, ativação/rollout e validação integrada de P1 continuam
necessários. A contagem histórica de tarefas não avança por subincremento.
Fases 3–5 e condições humanas/comerciais continuam abertas. O desenvolvimento
segue por commits locais, sem acompanhar CI, conforme orientação atual.

## Atualização técnica local — 2026-10-26

P1 (livros) foi implementado e validado no
[plano 146](execucao/146-inventario-e-consumidores-dos-livros-restaurados.md):
exportação .writer com todo histórico, leitura JSON v1–v6, restauração privada,
UI recuperável, consumidores e exclusão. Validate verde com 4.096 frontend,
87 scripts e 3.007 Functions; sete SDK Storage adicionais positivos.
[Inventário e limites](inventario-portabilidade-livros.md).

F2-09 segue aberta: faltam P2 (aventuras), P3 (campanhas) e D (integração).
A contagem histórica de tarefas completas permanece 8/35 (22,9%); não é medida
de horas/esforço nem equivale a lançamento. Gates operacionais, humanos e
comerciais continuam explícitos. Nenhum push, PR, merge, deploy ou CI nesta etapa.

P2 iniciou fonte interna (147), raiz/partes (148), cenas/blocos/controles/
planner/referências (149), narrativa (150), lore próprio (151), metas/checklist
(152), histórico (153), personas (154), imagens (155) e origem do universo (156),
com origem por identidade nativa. Compatibilidade do leitor de imagens com cenas
preparadas antes da ativação foi corrigida em 157: 50 Node e três SDK positivos.
Não há backup integral ou restauração de aventuras ainda; a contagem de tarefas
completas não muda.

O [fechamento 158](execucao/158-inventario-e-validacao-dos-leitores-de-aventuras.md)
registra inventário de fontes e validate integral verde dos leitores: 4.096 frontend,
87 scripts, 3.332 Functions, sintaxe/types/build/smoke. Duas falhas de infraestrutura
de testes foram corrigidas e preservadas na evidência. P2 ainda não monta/restaura
arquivo nem oferece UI; 8/35 e demais gates permanecem sem mudança.

[Formato 159](execucao/159-formato-privado-de-aventuras.md): framing próprio e
envelope de oito seções, com vetor de livro preservado; 64 Node/37 Vitest e
build dirigidos positivos. Não há montagem/restauração de aventura ainda;
validação semântica/segunda passagem, UI e demais gates permanecem pendentes.

[Inventário 160](execucao/160-inventario-limitado-do-cliente-de-aventuras.md)
acrescenta percurso metadata limitado e segunda passagem no cliente, com registro
puro compartilhado: 24 Vitest/115 Node dirigidos positivos. É inventory-only;
corpos, ordinais/hash de histórico, Storage, montagem/restauração/UI continuam
pendentes. P2/P3/D e contagem 8/35 preservadas.

[Unidades 161](execucao/161-leitura-limitada-das-unidades-de-aventuras.md)
acrescenta ranges/hash integral no cliente, com intenção congelada e fechamento
sem aguardar RPC: 24 casos e seleção final positivos. Prova unit-bytes-only não
é selo autoral; composição/histórico/Storage/restauração/UI e P2 continuam abertos.

[Composição 162](execucao/162-composicao-dos-dados-centrais-de-aventuras.md)
acrescenta as cinco primeiras seções, manifestos e fila compartilhada: 33 Vitest/
dez Node dirigidos positivos. Histórico, imagens/drafts, selo/validador/RPC/UI/
restore continuam pendentes; prova core-data-only e contagem 8/35 preservadas.

[Histórico 163](execucao/163-historico-de-aventuras-em-ordem-textual.md)
compõe cabeçalhos e texto ordenado, com contagem portátil separada/UTF-8/SHA:
52 Node, 21 Vitest e um SDK positivos. Imagens/drafts, composição/selo/validador,
RPC/UI/restore continuam pendentes; prova history-data-only e 8/35 preservados.

[Imagens 164](execucao/164-imagens-no-arquivo-de-aventuras.md) acrescenta PNGs,
vínculos e segunda passagem completa, com provas parciais e sem deduplicar
por imageId: 20 Vitest/37 Node dirigidos positivos. Drafts, composição final,
validador/transporte/UI/restore e P2/P3/D continuam abertos; 8/35 preservado.

[Rascunho 165](execucao/165-rascunho-explicito-no-backup-de-aventuras.md) conserva
texto explícito separado, com origem/hash salvos e observador limitado: 14 Vitest
distintos e um Node positivos. Composição final/selo/validador/transporte/UI/
restauração e P2/P3/D permanecem abertos, sem mudança de 8/35.

[Captura integral 166](execucao/166-composicao-integral-da-captura-de-aventuras.md)
reúne oito seções e fontes verificadas antes do fechamento do container.
Rodada completa: 4.226 passes/um timeout, com cobertura acima dos limites;
caso pesado corrigido passou em seleção própria. 90 scripts, 3.367 Functions e
build verdes. Wrapper verde permanece pendente no próximo grande bloco; captura
é técnica/parcial e não valida arquivo externo ou habilita restore/UI.
P2/P3/D, F2-09, gates e contagem 8/35 permanecem abertos/inalterados.

## Atualização local — 2026-10-27

[Validador 167](execucao/167-validacao-semantica-do-arquivo-de-aventuras.md)
confere independentemente conteúdo, hashes/manifestos e relações das oito seções,
com índice cifrado e SHA/UTF-8 retomáveis. Chromium e validate integral positivos:
4.259 frontend, 90 scripts, 3.379 Functions, sintaxe/tipos/build/smoke.
Fecha a pendência formal de validate de 166, sem aprovar a tentativa antiga.
[Evidência](../../entregas/2026-10-27-writer-v2-validacao-semantica-de-aventuras.md).

Relatório content-only não concede acesso ou ativação. Transporte/revisão,
restauração/remapeamento/mídia, UI e roundtrip ainda faltam em P2; P3/D e F2-09
seguem abertos. Contagem 8/35 (22,9% de tarefas) e gates humanos/comerciais não mudam.

[Validação retomável 168](execucao/168-validacao-retomavel-do-arquivo-de-aventuras.md)
prepara leitura em etapas com estado limitado, SHA de releitura e índice de
unidades, com 20 Vitest distintos em seleções e checks dirigidos positivos.
É núcleo inerte: transporte/reserva/upload/coordenação persistente e restauração/
UI/roundtrip ainda faltam. Validate de 167 não é atribuído ao novo código;
fechamento integral no próximo grande bloco. P2/P3/D/F2-09 e 8/35 preservados.
