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
com 24 Node e um SDK positivos no último incremento. Não há backup integral ou
restauração de aventuras ainda; a contagem de tarefas completas não muda.
