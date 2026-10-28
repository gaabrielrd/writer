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

[Transporte 169](execucao/169-transporte-privado-da-restauracao-de-aventuras.md)
implementa reserva nativa invisível, envio/verificação de bytes e limpeza
retomável. 22 Node/seis SDK distintos dirigidos positivos, com correção comprovada
de checkpoint atual adulterado. Ainda interno: bytes-verified não valida conteúdo
ou concede acesso. Coordenação semântica, recuperação, stager/ativação/UI e
roundtrip seguem pendentes; P2/P3/D/F2-09 e 8/35 não mudam.

[Validação persistente 170](execucao/170-validacao-semantica-persistente-de-aventuras.md)
liga transporte e máquina semântica com fonte/índice/snapshot autenticados,
recibo transacional e reconferência integral antes de content-verified.
Validate integral verde: 4.292 frontend, 90 scripts, 3.406 Functions e build/smoke;
cinco SDK novos distintos dirigidos positivos, mais regressão de cleanup.
[Evidência](../../entregas/2026-10-27-writer-v2-validacao-persistente-de-aventuras.md).
Não ativa projeto ou concede acesso. Consumo autenticado/remap, recuperação,
stager/ativação/UI/roundtrip, P2/P3/D/F2-09 e gates continuam pendentes.
8/35 (22,9% de tarefas) permanece inalterado.

[Consumo/remap 171](execucao/171-consumo-autenticado-e-remapeamento-de-aventuras.md)
autentica unidades aprovadas, oferece barreira transacional para consumidores e
projeta referências coerentes para a nova aventura, incluindo raw e imagens por
uso. Testes dirigidos positivos; o validate de 170 é base anterior, não prova
deste código. Ainda faltam stagers, autorizações externas, ativação, recuperação,
UI e roundtrip. P2/P3/D/F2-09, gates e 8/35 seguem abertos.

[Estrutura privada 172](execucao/172-estrutura-privada-da-aventura-restaurada.md)
prepara partes/cenas/blocos com texto exato, definição privada e journals atômicos,
com cleanup comprovado dos targets. Sete Vitest, cinco Node novos em seleções,
27 Node de regressão e três SDK demo positivos. structure-ready não é ativação;
controle de progresso continua incompleto. Recursos restantes, origens, mídia/
histórico/draft, contadores/audit, ativação, recuperação/UI/roundtrip, P2/P3/D/F2-09
e gates continuam pendentes. 8/35 permanece inalterado.

[Recursos privados 173](execucao/173-recursos-e-indices-da-aventura-restaurada.md)
prepara checklist/metas, planejamento, narrativa/ordens e referências com índices.
Cursor próprio preserva recibos; updates mantêm criador/birth e limpeza confirma
filhos antes dos pais. Testes dirigidos e estado dos checks estão na
[evidência](../../entregas/2026-10-27-writer-v2-recursos-privados-de-aventuras.md).
resources-ready mantém a raiz sem dono e countReady false. Lore/personas/mídia,
universo autorizado, histórico/draft, agregados/audit/ativação, recuperação/UI e
roundtrip continuam pendentes. P2/P3/D/F2-09 e gates permanecem abertos; 8/35 não muda.

[Lore/personas privados 174](execucao/174-lore-e-personas-da-aventura-restaurada.md)
acrescenta pares/tombstones nativos e perfis/bindings privados deduplicados, com
identidade da raiz comprovada e preservação de escrita sem mudança. Os resultados
locais estão na [evidência](../../entregas/2026-10-27-writer-v2-lore-personas-privados-de-aventuras.md).
profiles-ready não integra a biblioteca de personas nem ativa o projeto.
Universo, histórico/draft, mídia, agregados/audit/ativação, recuperação/UI e
roundtrip seguem pendentes; P2/P3/D/F2-09, gates e 8/35 permanecem abertos.

[Histórico/texto 175](execucao/175-historico-e-texto-do-rascunho-de-aventuras.md)
monta versões nativas por frames e prepara draft separado, sem mudar manuscrito
ou criar cena somente histórica. 13 Node novos/78 conjuntos, quatro Vitest
conjuntos e três SDK demo positivos. [Evidência](../../entregas/2026-10-27-writer-v2-historico-texto-de-aventuras.md).
history-ready mantém draft pending-finalization e universo pendente; biblioteca
de personas, mídia, agregados/audit/ativação, recuperação/UI e roundtrip seguem
obrigatórios. P2/P3/D/F2-09, gates e 8/35 permanecem abertos.

[Finalização do draft 176](execucao/176-finalizacao-do-rascunho-de-aventuras.md)
cria a versão recuperada nativa, com contagem global exata e manuscrito intacto,
inclusive draft vazio/igual. Validate local integral positivo fecha o bloco
171–176: 4.316 frontend, 90 scripts, 3.477 Functions e sintaxe/tipos/build/smoke.
Testes e limites reais estão na
[evidência](../../entregas/2026-10-27-writer-v2-finalizacao-do-rascunho-de-aventuras.md).
draft-ready não ativa projeto: universo, personas na biblioteca, mídia, agregados/
audit/ativação, recuperação/UI e roundtrip seguem obrigatórios. P2/P3/D/F2-09,
gates e macro 8/35 permanecem abertos.

[Universo original 177](execucao/177-universo-original-da-aventura-restaurada.md)
prepara seleção privada com identidade nativa e acesso atual, sem copiar universo
ou alterar contador. O plano final reautoriza e compõe vínculo nativo strict;
ativação real continua pendente. Checks e resultados estão na
[evidência](../../entregas/2026-10-27-writer-v2-universo-original-de-aventuras.md).
Personas, mídia, agregados/audit/ativação, recuperação/UI e roundtrip seguem
obrigatórios. P2/P3/D/F2-09, gates e macro 8/35 permanecem abertos.

[Disponibilidade de personas 178](execucao/178-disponibilidade-de-personas-restauradas-de-aventuras.md)
acrescenta origem v2 própria de aventura no contrato, servidor, biblioteca e
Rules, preservando livro v1 e prova nativa/estado ativo. Testes reais dirigidos
e correções estão na [evidência](../../entregas/2026-10-27-writer-v2-disponibilidade-de-personas-de-aventuras.md).
Instalador de perfis/dedupe/journals/cleanup e ativação real continuam obrigatórios;
não confundir fixtures de lote com esse fluxo. Mídia, agregados/audit/ativação,
recuperação/UI/roundtrip, P2/P3/D/F2-09, fases seguintes, gates e 8/35 seguem abertos.

[Instalação de personas 179](execucao/179-instalacao-de-personas-da-aventura-restaurada.md)
copia perfis únicos para a biblioteca por unidades atômicas com lote preparing,
mantendo bindings e indisponibilidade. Revogação precede deletes; cleanup confere
provas e preserva existentes/recriados. Resultados dirigidos e gate integral do
bloco 177–179 estão na [evidência](../../entregas/2026-10-27-writer-v2-instalacao-de-personas-de-aventuras.md).
Ativação real, mídia, agregados/audit, recuperação/UI/roundtrip, P2/P3/D/F2-09,
fases seguintes, gates e macro 8/35 continuam abertos.

Fechamento local do bloco 177–179 em 2026-10-28: npm run validate verde com
4.323 frontend, 90 scripts, 3.523 Functions, sintaxe de 358 módulos e
tipos/build/smoke. A primeira tentativa falhou na máscara de leitura da
auditoria de livros; corrigida sem relaxar o teste e revalidada integralmente.
Resultado e limites estão na evidência de 179. Demais pendências e macro 8/35
permanecem inalteradas.

[Bytes de imagens 180](execucao/180-preparacao-privada-das-imagens-de-aventuras.md)
prepara vínculos explícitos/descritores/frames privados por uso, com replay e
cleanup comprovados. 15 Node novos distintos, 47 regressões, um corpus nativo e
um SDK demo positivos em seleções dirigidas; resultados e limites na
[evidência](../../entregas/2026-10-28-writer-v2-bytes-privados-das-imagens-de-aventuras.md).
Suíte integral no fechamento do bloco de mídia. Storage/decodificação/fence,
biblioteca/usos/ativação, agregados/audit, recuperação cifrada/UI/roundtrip,
P2/P3/D/F2-09, fases seguintes, gates e macro 8/35 permanecem abertos.

[Retirada segura 181](execucao/181-retirada-segura-de-imagens-restauradas.md)
fecha a corrida reproduzida de upload atrasado após exclusão de uma imagem
restaurada. Marcador privado permanente e provas nativas preservam bytes/records
alheios; imagens legadas conservam fluxo anterior. 23 casos novos, 49 regressões
distintas em seleções e um SDK Firestore ampliado positivos; detalhes na
[evidência](../../entregas/2026-10-28-writer-v2-retirada-segura-de-imagens-restauradas.md).
Suíte integral no fechamento de mídia. Materialização Storage das aventuras,
ativação e demais pendências de P2/P3/D/F2-09/fases/gates continuam abertas;
macro 8/35 preservada.

[Materialização de imagens 182](execucao/182-materializacao-privada-das-imagens-de-aventuras.md)
liga intenção nativa, PNG completo/bytes exatos e Storage privado, com fence
antes da limpeza. 17 Node novos, limite real de 16 MiB/256 frames, corpus do Writer,
36 regressões e uma integração SDK Firestore/GCS local positivos. Fechamento
integral de 180–182 verde: 4.325 frontend, 90 scripts, 3.579 Functions e
sintaxe/tipos/build/smoke; duas tentativas anteriores não verdes preservadas na
[evidência](../../entregas/2026-10-28-writer-v2-materializacao-privada-das-imagens-de-aventuras.md).
Biblioteca/usos, agregados/audit/ativação, aceitação/URL posterior, recuperação
cifrada/UI/roundtrip, P2/P3/D/F2-09/fases/gates e macro 8/35 continuam abertos.

[Agregados da aventura 183](execucao/183-agregados-da-aventura-restaurada.md)
recompõe blocos, cenas/partes, ledger e referências diretas por unidades nativas,
preservando texto/arquivo/órfãos. Sete Node novos, dois casos com arquivo real,
quatro regressões selecionadas e um SDK Firestore demo positivos; resultados e
limites na [evidência](../../entregas/2026-10-28-writer-v2-agregados-da-aventura-restaurada.md).
counts-ready mantém raiz privada e countReady false. Auditoria/ativação,
biblioteca/usos, aceitação/URL, recuperação/UI/roundtrip, P2/P3/D/F2-09,
fases/gates e macro 8/35 continuam abertos. Validate integral no fechamento do
próximo grande bloco; o gate de 10708fd não é atribuído a este código novo.

[Auditoria privada 184](execucao/184-auditoria-da-aventura-restaurada.md)
confere journals/documentos físicos por páginas e gerações privadas de mídia,
com writers congelados, contexto/anchor e ACK retomável. Onze Node novos, um
corpus real, três regressões e um SDK integrado Firestore/GCS demo positivos;
resultados e limites na [evidência](../../entregas/2026-10-28-writer-v2-auditoria-da-aventura-restaurada.md).
audit-ready não ativa: novas instalações/layout/inventário exigem refazer o selo.
Biblioteca/usos, ativação, aceitação/URL, recuperação/UI/roundtrip, P2/P3/D/F2-09,
fases/gates e macro 8/35 permanecem abertos. Validate no fechamento do próximo
grande bloco; o gate de 10708fd não é atribuído ao código novo.

[Biblioteca das imagens 185](execucao/185-biblioteca-das-imagens-de-aventuras-restauradas.md)
instala pares imagem/uso preparing por unidade, com origem v2 de aventura e
retirada permanente. Invalida o selo inicial e exige nova auditoria dos registros;
replay histórico conserva a fronteira nativa. Treze Node novos, onze regressões
de retirada, três de auditoria, um corpus real e um SDK Firestore/GCS demo
positivos; [evidência](../../entregas/2026-10-28-writer-v2-biblioteca-das-imagens-restauradas-de-aventuras.md).
Fechamento integral local de 183–185 verde: 4.329 frontend, 90 scripts,
3.610 Functions, sintaxe/tipos/build/smoke. Ativação/finalização de mídia,
recuperação/UI/roundtrip, P2/P3/D/F2-09, fases/gates e macro 8/35 continuam abertos.

[Ativação interna 186](execucao/186-ativacao-atomica-da-aventura-restaurada.md)
acrescenta revisão final e confirmação atômica da raiz, contagens, personas e
universo reautorizado. Preserva nascimento da raiz e provas históricas, inclusive
após excluir/recriar o projeto. Encerra pedido incerto impedindo ativação atrasada;
o editor já é exercitado após ativação real. Veja os checks efetivamente executados
na [evidência dirigida](../../entregas/2026-10-28-writer-v2-ativacao-atomica-da-aventura-restaurada.md).
Mídia continua pendente. Finalização por ativo, coleta da fonte, recuperação/
transportes/UI/roundtrip, P2/P3/D/F2-09, fases/gates e macro 8/35 permanecem
abertos. Validate integral no fechamento do próximo grande bloco.

[Finalização de mídia 187](execucao/187-finalizacao-das-imagens-da-aventura-restaurada.md)
libera uma imagem por unidade com controle separado, preservando o job ativado.
Confere aceitação/retirada física e provas no ACK, sem reescrever ou religar
heads. Detach mantém a cópia própria; retirada/ABA não ressuscitam conteúdo.
Veja a [evidência dirigida](../../entregas/2026-10-28-writer-v2-finalizacao-das-imagens-restauradas-de-aventuras.md)
para os resultados executados. Coleta da fonte, recuperação/transportes/UI/
roundtrip, P2/P3/D/F2-09, fases/gates e macro 8/35 permanecem abertos.
Validate integral no fim do próximo grande bloco.

[Coleta privada 188](execucao/188-coleta-da-fonte-da-aventura-restaurada.md)
descarta fonte/preparação após a conclusão da mídia, com checkpoint próprio,
provas por página e verificação final. Preserva projeto editado, biblioteca,
personas e recibos, sem reidratar payload nem autorizar uma raiz recriada.
[Evidência do incremento e fechamento 186–188](../../entregas/2026-10-28-writer-v2-coleta-da-fonte-da-aventura-restaurada.md)
registra os resultados efetivamente executados. Recuperação/transportes/UI/
roundtrip, P2/P3/D/F2-09, fases/gates e macro 8/35 permanecem abertos.

Fechamento integral local de **186–188 verde**: **4.331 frontend em 336 arquivos,
90 scripts e 3.656 Functions**, sintaxe de 388 módulos, tipos/build/smoke.
Cobertura/limites preservados; SDK final de coleta 1/1 positivo na versão com
máscaras explícitas. Código conferido por hashes; somente commit local.
Esse fechamento não entrega recuperação/transportes/UI/roundtrip nem conclui P2.

[Transporte 189](execucao/189-transporte-autenticado-da-restauracao-de-aventuras.md)
acrescenta os 29 comandos explícitos de restauração de aventuras no index,
com UID/App Check, headers privados e limites preservados. **162 Node e um SDK
HTTP/Firestore demo positivos**; resultados e limites na
[evidência](../../entregas/2026-10-28-writer-v2-transporte-da-restauracao-de-aventuras.md).
Código transportável não equivale a deploy ou UI. Recuperação HTTP/chaves,
cliente/journal/interface/roundtrip, P2/P3/D/F2-09 e macro 8/35 seguem abertos.
Validate integral no próximo grande bloco; sem CI/operação remota.

[Chave privada 190](execucao/190-chave-privada-da-restauracao-de-aventuras.md)
acrescenta nascimento atômico e HTTP Auth/App Check para retomada futura.
Cancelamento/coleta encerram a chave por metadados, sem alterar job ativado;
legado não recebe chave tardia. Resultados efetivamente executados na
[evidência](../../entregas/2026-10-28-writer-v2-chave-privada-da-restauracao-de-aventuras.md).
Cliente/journal/interface/roundtrip, P2/P3/D/F2-09 e macro 8/35 seguem abertos.
Validate integral no próximo grande bloco; sem CI/operação remota.
