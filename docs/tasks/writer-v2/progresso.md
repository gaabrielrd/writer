# Progresso do Writer V2

**Snapshot local:** 2026-10-29, branch `codex/writer-v2`. Geração/restauração e exclusão de aventuras integradas localmente, com ciclo rico restaurado e validate integral 198–199 verdes. L/I/A/P1 e implementação técnica P2 presentes; a auditoria técnica P2 foi concluída. Política final das perguntas, P3/D e F2-09 continuam abertas. Durante o desenvolvimento, somente commits locais, sem acompanhamento de CI.
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

[Cliente da chave 191](execucao/191-cliente-da-chave-privada-de-aventuras.md)
acrescenta primeira autorização/revalidação com CryptoKey não extraível e
proxy/rewrite próprios. **52 Vitest em quatro arquivos e retake final 38/38**, tipos/lint/
arquitetura/bundle/smoke positivos; detalhes e limites na
[evidência](../../entregas/2026-10-28-writer-v2-cliente-da-chave-privada-de-aventuras.md).
Journal cifrado/bootstrap/controlador/UI/roundtrip, P2/P3/D/F2-09 e macro 8/35
seguem abertos. Sem CI/remoto; validate integral ao fechar o bloco do cliente.

[Journal cifrado 192](execucao/192-journal-cifrado-da-preparacao-de-aventuras.md)
preserva os 14 pedidos de preparação, com reautorização e CAS/locks, sem
guardar intent ou chave em claro. **70 Vitest e retake 35/35**, mais **8
verificações no Chromium com armazenamento real**; resultados e limites na
[evidência](../../entregas/2026-10-28-writer-v2-journal-cifrado-da-preparacao-de-aventuras.md).
Controlador/bootstrap/efeitos de ciclo de vida/revisão/UI/roundtrip e P2/P3/D/
F2-09 permanecem abertos. Macro 8/35 inalterada; validate no fechamento do
bloco do cliente, sem CI/remoto.

[Controlador 193](execucao/193-controlador-da-preparacao-de-aventuras.md)
executa uma unidade, retoma pedido exato e confirma recibo antes de limpar o
journal. **169 Vitest e sete verificações no Chromium**, com imagem/recarga
e duas auditorias, conforme
[evidência](../../entregas/2026-10-28-writer-v2-controlador-da-preparacao-de-aventuras.md).
A preparação pausa para revisão; não ativa automaticamente. Bootstrap/start/
upload/revisão/efeitos/UI/roundtrip e P2/P3/D/F2-09 seguem abertos; macro 8/35
inalterada. Validate integral no fim do bloco do cliente, sem CI/remoto.

[Início/upload 194](execucao/194-inicio-e-upload-retomavel-de-aventuras.md)
acrescenta bootstrap metadata, sessão/resolução e envio de arquivo verificado,
com retomada após recarga e sem troca de bytes/identidade. Dez verificações
Chromium positivas; detalhes e limites na
[evidência](../../entregas/2026-10-28-writer-v2-inicio-e-upload-retomavel-de-aventuras.md).

Fechamento integral **189–194 verde**: **4567 frontend em 347 arquivos,
90 scripts, 3772 Functions e sintaxe de 391 módulos**, tipos/bundle/smoke.
Cobertura 89,52/85,58/90,68/92,73 e limites preservados; hashes de 17 arquivos
de código conferidos durante a execução. Somente commit local.
UI/revisão/efeitos/roundtrip, P2/P3/D/F2-09 e macro 8/35 continuam abertos.

[Efeitos retomáveis 195](execucao/195-efeitos-retomaveis-da-restauracao-de-aventuras.md)
acrescenta revisão/ativação explícita, metadata de cinco efeitos e retomada de
cancelamento/mídia/coleta mesmo após remoção da chave. **136 Vitest em cinco
arquivos e 13 verificações Chromium** positivos, com tipos/lint/arquitetura/
build/smoke, conforme
[evidência](../../entregas/2026-10-28-writer-v2-efeitos-retomaveis-de-aventuras.md).
Validate integral no fechamento do próximo grande bloco; UI/revisão local/
roundtrip, P2/P3/D/F2-09, fases/gates e macro 8/35 continuam abertos.

[Interface de restauração 196](execucao/196-restauracao-de-aventuras-no-estudio.md)
integra seleção/inspeção, revisão explícita, retomadas e finalização/cancelamento
de aventuras no Estúdio. **103 Vitest e 12 verificações Chromium** positivos,
com tipos/lint/arquitetura/styleguide/build/smoke; resultados e limites na
[evidência](../../entregas/2026-10-28-writer-v2-restauracao-de-aventuras-no-estudio.md).
Inclui retry de quota pelo mesmo ID e descarte terminal sem chave.
Geração do arquivo pela UI/corpus amplo de roundtrip e P2/P3/D/F2-09 continuam
abertos. Macro 8/35 inalterada; validate integral no próximo bloco integrado.

[Backup de aventuras pela interface 197](execucao/197-geracao-do-backup-de-aventuras-pela-interface.md)
acrescenta geração por arquivo nativo nos três pontos do produto, com rascunho
explícito congelado e salvo preservado. Nove jornadas Chromium verificaram
geração/restauração, três versões, lore/persona e duas imagens, além de abort
com preservação do arquivo anterior.

[Fechamento integral local 195–197](../../entregas/2026-10-28-writer-v2-backup-de-aventuras-pela-interface.md):
**4791 frontend em 359 arquivos, 90 scripts, 3798 Functions e sintaxe de 393
módulos**, tipos/build/smoke verdes. Cobertura 89,59/85,72/90,79/92,75, limites
preservados, 24 hashes conferidos. Endpoints ainda sem implantação.
Auditoria ampla de P2/consumidores, P3/D/F2-09 e gates permanecem abertos;
macro **8/35** inalterada. Somente commit local, sem CI/operação remota.

[Ciclo normal 198](execucao/198-ciclo-normal-das-aventuras-restauradas.md)
prova edição/histórico/lore/contexto e nova restauração após coleta. O planejador
agora mostra fonte legada e oferece recuperação explícita de cenas sem parte.
[Matriz](consumidores-aventuras-restauradas.md) e
[entrega](../../entregas/2026-10-28-writer-v2-ciclo-normal-das-aventuras-restauradas.md)
registram 35 Vitest distintos, 30 Node/SDK e nove verificações Chromium positivos,
com checks dirigidos/build. Não houve novo validate integral.
Exclusão completa da aventura ainda falta; P2/P3/D/F2-09 e macro 8/35 seguem abertos.

[Exclusão 199](execucao/199-exclusao-completa-de-aventuras.md) permanece em
andamento. A primeira preparação integra reserva permanente nos criadores/
consumidores, Rules e fonte interna nativa de confirmação. São 42 testes novos,
regressões dirigidas e 37 cenários SDK/Rules distintos, com sobreposição entre
rodadas documentada na
[evidência parcial](../../entregas/2026-10-28-writer-v2-reserva-e-fonte-da-exclusao-de-aventuras.md).
Sem produtor público/início, job/limpeza ou UI de exclusão. Validate integral
no fechamento do bloco; P2/P3/D/F2-09 e macro **8/35** inalterados.

No mesmo plano 199, o serviço interno de início/consulta/resolução e o
inventário físico de órfãos passaram em **28 Node e oito SDK/Rules**.
O início é atômico e o catálogo suporta janela de 50 com provas nativas.
[Entregável parcial](../../entregas/2026-10-28-writer-v2-inicio-privado-e-inventario-da-exclusao-de-aventuras.md):
sem endpoint/UI ou avanço de limpeza; versão v1 e índice somente locais.
Não fecha P2/P3/D/F2-09 nem altera a macro **8/35**.

O avanço privado do mesmo plano 199 agora retira snapshots de contexto por
metadata e encerra turnos ativos, com recibos/checkpoints atômicos.
[Preparação parcial](../../entregas/2026-10-28-writer-v2-avanco-privado-e-encerramento-de-contextos.md):
**27 Node e 11 SDK/Rules** positivos, lote nativo 10/3/0, ACK perdido, raiz ausente,
rollback de corpo recriado e fence de resposta tardia. Fontes/mídia/limpeza final
e cliente/UI ainda faltam; fase não certificada. Sem novo validate integral.
Somente commit local, sem CI/remoto. Macro **8/35** e pendências gerais preservadas.

A integração seguinte do plano 199 acrescenta retirada física de mídia ainda
preparing e coleta das fontes de restauração/importação, compondo seus recibos
originais com a exclusão. Biblioteca ativa/personas e jobs ativados permanecem.
[ADR 0224](../../decisions/0224-adventure-deletion-source-retirement.md) e
[evidência parcial](../../entregas/2026-10-28-writer-v2-fontes-na-exclusao-de-aventuras.md)
registram os resultados e limites. Quiescência avança para media após as fontes;
limpeza inteira/cliente/UI ainda faltam. Macro **8/35**, P2/P3/D/F2-09 e gates
continuam abertos. Sem novo validate integral ou operação remota.

A limpeza interna do plano 199 agora remove usos tipados de imagens com
contadores por lote e percorre as 23 famílias de autoria, incluindo órfãos.
78 Node distintos e 14 SDK/Rules distintos positivos em rodadas, com
[limites/evidência](../../entregas/2026-10-28-writer-v2-usos-e-autoria-na-exclusao-de-aventuras.md).
Imagens ativas independentes e dados de outros projetos/contas são preservados;
conteúdo conhecido reaparecido reabre a família antes da certificação.
Chega a controls em deleting; controles/atividade/final/cliente/UI continuam
abertos. Sem novo validate integral, CI ou remoto. Macro **8/35** inalterada.

O mesmo plano 199 agora retira corpos derivados do chat por metadata/provas
nativas e a retomada canônica com revisão atômica da conta. Preserva perguntas,
recibos e outros projetos; órfão sem atribuição verificável recusa sem ler prosa.
56 Node e três SDK/Rules passaram; veja
[evidência parcial](../../entregas/2026-10-28-writer-v2-chat-e-retomada-na-exclusao-de-aventuras.md).
Chega a verify em deleting; fechamento terminal/raiz, cliente/UI e validate
integral continuam pendentes. Macro **8/35**, P2/P3/D/F2-09 e gates inalterados.

A verificação terminal interna do plano 199 está implementada: segunda inspeção
limitada do chat, consultas vazias atuais e reabertura de fase conhecida.
Raiz/reserva terminal/job/recibo são atômicos e conferidos por relógios nativos.
123 Node e seis SDK/Rules passaram, com correções e limites na
[evidência parcial](../../entregas/2026-10-28-writer-v2-verificacao-terminal-da-exclusao-de-aventuras.md).
Motor chega a complete; transporte/cliente/UI/retomada, política final das perguntas
e validate integral ainda faltam. Macro **8/35**, P2/P3/D/F2-09 e gates inalterados.

O plano 199 ganhou núcleo cliente próprio: schemas/tokens/recibos conferidos,
adaptador de seis comandos e recuperação metadata com Web Locks/CAS e guards
após awaits. 49 Vitest e 21 testes arquiteturais passaram, incluindo ciclo
com as factories reais do servidor sobre double e ACK perdido; veja
[evidência parcial](../../entregas/2026-10-28-writer-v2-cliente-e-recuperacao-da-exclusao-de-aventuras.md).
Sem endpoint novo ou composição na UI. Transporte autenticado, hook/tela/recarga
real, política final de perguntas e validate integral continuam abertos.
Macro **8/35**, P2/P3/D/F2-09 e gates inalterados.

O plano 199 agora possui diálogo/hook próprios e dispatcher privado lazy com
auth/contexto App Check antes da construção. Fonte por nova abertura,
pausa entre unidades, confirmação da pendência capturada e revogação antes do
CAS local passaram em 67 Vitest, 12 Node e 18 jornadas Chromium isoladas;
[evidência parcial](../../entregas/2026-10-28-writer-v2-fronteira-e-dialogo-da-exclusao-de-aventuras.md).
Catálogo/composição, binding HTTP/índices/mídia, ciclo integrado e validate
integral continuam necessários. Perguntas preservadas com política final
pendente. Macro **8/35**, P2/P3/D/F2-09 e gates inalterados.

## Fechamento técnico local 198–199 — 2026-10-29

O [ciclo restaurado e exclusão](../../entregas/2026-10-29-writer-v2-validacao-integral-das-aventuras.md)
comprovou uso normal, segunda captura/restauração, exclusão inteira da primeira
cópia e preservação de original, segunda cópia, aventura irmã e campanha.
Pergunta própria permanece legível; contexto/resposta/base derivada ficam
indisponíveis. Replay histórico não recria conteúdo nem chaves.

Validate integral verde: 4.890 frontend em 367 arquivos, 94 scripts, 3.989
Functions, sintaxe de 407 módulos, tipos/build/smoke. Cobertura global
89,67% instruções, 85,86% ramos, 90,88% funções e 92,84% linhas.
Mantidos os limites. Detalhes e falhas iniciais do roteiro na evidência.

O código de produção não mudou neste fechamento de testes. Os seis bindings e
as rotas já estão em 38c6673, com 36 jornadas Chromium na integração anterior.
Plano 199 conserva a confirmação pendente da política de perguntas; P2 mantém
auditoria final, e P3/D/F2-09 continuam obrigatórios. Macro 8/35 e gates
humanos/comerciais inalterados. Somente commits locais, sem CI/remoto/deploy.

## Auditoria técnica de P2 — 2026-10-29

A [auditoria 200](execucao/200-auditoria-tecnica-da-portabilidade-de-aventuras.md)
concluiu o cruzamento dos nove passos e todos os grupos de conteúdo do plano 147.
Há implementação e evidência técnica local para captura/restauração/recuperação/
UI e exclusão, com limites de plataforma e operação explícitos.

Nenhuma produção ou teste foi alterado; o validate integral de 8d7bb5a e relatórios
originais continuam a fonte das regressões, sem nova rodada atribuída à auditoria.
O probe de limites conferiu comprimentos medidos de F1, não importação dos PDFs.

Plano 199 aguarda a política final das perguntas; P3/D/F2-09 continuam obrigatórios
e os aceites humanos/comerciais seguem abertos. A contagem permanece 8/35.
Próxima implementação: portabilidade privada de campanhas com edição congelada,
procedência comprovada e próprios/derivados tratados conforme acesso atual.

## 2026-10-29 — primeiro incremento interno de P3

[Plano 201](execucao/201-portabilidade-privada-de-campanhas.md) registra inventário
e sequência de campanhas. Âncora privada da raiz/cinco controles globais está
implementada com máscaras, identidade nativa, reserva C4 e 18 testes dirigidos
positivos. Não lê prosa nem cria estado. Escritor real de vínculo por sessão
demonstra que a âncora não substitui provas completas por família/recurso.
Veja a [evidência parcial](../../entregas/2026-10-29-writer-v2-ancora-privada-de-campanhas.md).
Captura integral, procedência, arquivo/restauração/UI/ciclo P3 e D/F2-09 seguem
pendentes; macro **8/35**, retenção final de 199 e gates não mudam. Validate
integral será executado no fechamento do bloco novo. Somente commits locais.

## 2026-10-29 — inventário próprio e provas por sessão de P3

O [plano 202](execucao/202-inventario-proprio-da-portabilidade-de-campanhas.md)
acrescenta inventário interno das nove famílias próprias/estruturais, por páginas
limitadas e provas nativas por recurso/sessão. S2/S3 reais invalidam essas provas
sem mudar a âncora global. Vínculos de sessão/item excluído continuam observáveis;
61 notas paginam sem limite total artificial. 38 testes direcionados positivos,
incluindo 20 novos; [evidência parcial](../../entregas/2026-10-29-writer-v2-inventario-proprio-de-campanhas.md).
DTOs/texto em chunks, arquivo/segunda passagem, procedência/base, restauração/
UI/ciclo P3 e D/F2-09 seguem pendentes. Macro **8/35**, política final de 199 e
gates preservados; validate integral no fechamento do bloco. Somente commit local.

## 2026-10-29 — conteúdo próprio de P3 em partes verificadas

O [plano 203](execucao/203-conteudo-proprio-da-portabilidade-de-campanhas.md)
acrescenta nove DTOs fechados e leitura de texto em partes de até 65.536 bytes,
após conferir a prova da unidade e dependências. Controles/tombstones/pais
inativos são omitidos sem recriação; próprios ativos continuam recuperáveis
quando sessão/origem desaparece. 57 testes dirigidos passaram, incluindo
texto multibyte/BOM e corpo válido acima de 2 MiB após escapes.
Veja a [evidência parcial](../../entregas/2026-10-29-writer-v2-conteudo-proprio-de-campanhas.md).
Composição/segunda passagem do arquivo, base/procedência, restauração/UI/ciclo
P3/D/F2-09 e gates continuam abertos; macro **8/35** inalterada. Somente commit
local; validate integral no fechamento do grande bloco.

## 2026-10-29 — captura incremental e reconferência dos próprios de P3

O [plano 204](execucao/204-captura-incremental-dos-proprios-de-campanha.md)
transmite partes próprias com pressão de consumo, hashes e segunda passagem
das nove famílias, detectando alterações S2/S3 sem mudança global. Prova
own-data-only somente no término natural; sem índice persistido/arquivo final.
21 Vitest e 57 Node dirigidos passaram; [evidência parcial](../../entregas/2026-10-29-writer-v2-captura-incremental-dos-proprios.md).
Base/procedência/variantes/mídia, restauração/UI/ciclo P3/D/F2-09 e gates seguem
pendentes; macro **8/35**. Somente commit local, validate integral no grande bloco.

## 2026-10-29 — primeiro gate de origem da base congelada em P3

O [plano 205](execucao/205-origem-autorizada-da-base-congelada.md) confere a origem
atual por metadados/encarnação, preservando a edição antiga quando o texto muda
e bloqueando origem recriada/reservada. Lore global permanece separado da
estrutura própria; estado/geração/guard/clock C3 são conferidos. 20 testes
dirigidos passaram; [evidência parcial](../../entregas/2026-10-29-writer-v2-origem-autorizada-da-base.md).
É âncora privada, não manifesto/atestado ou gate de ficha individual.
Base/variantes/mídia, arquivo/restauração/UI/ciclo P3/D/F2-09 e gates seguem
pendentes; macro **8/35**. Somente commit local, sem CI.

## 2026-10-29 — itens e campos congelados de P3

O [plano 206](execucao/206-itens-e-textos-da-base-congelada.md) lê os sete tipos
da base exata com hierarquia e autorização por ficha, cabeçalho lógico fechado
e partes de texto limitadas. Principal compartilha somente a própria cena;
ficha revogada/recriada não revela prosa/nome/hash antigo. Fluxo cliente confere
SHA/tamanho integral e interrupções, com prova frozen-field-bytes-only.
20 testes Node novos, 11 regressões e 29 Vitest dirigidos positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-textos-da-base-congelada.md).
Inventário físico completo/órfãos, variantes/legadas/mídia, manifesto/atestado,
arquivo/restauração/UI/ciclo P3/D/F2-09 continuam abertos; macro **8/35**.
Validate integral no fechamento do grande bloco; somente commit local, sem CI.

## 2026-10-29 — inventário físico e auditoria servidor da base em P3

O [plano 207](execucao/207-inventario-fisico-e-auditoria-da-base.md) acrescenta
quatro famílias físicas e snapshot, com conferência de corpos/manifests,
links/ledger e imagem/bloco/uso. SHA/tamanho integrais são conferidos no servidor
por item, sem montar texto completo. Revogadas permanecem indisponíveis.
26 testes Node novos, 31 regressões e 29 Vitest dirigidos positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-inventario-fisico-da-base.md).
Segunda passagem/reconciliação conjuntas, variantes/legadas/mídia, manifesto/
atestado, arquivo/restauração/UI/ciclo P3/D/F2-09 continuam abertos; macro **8/35**.
Somente commit local, sem CI. Validate integral no fechamento do grande bloco.

## 2026-10-29 — variantes e âncoras congeladas no backup P3

O [plano 208](execucao/208-variantes-e-ancoras-do-lore.md) lê variantes legado/
geração e âncoras antigas, seguindo corpos por binding exato e preservando
removed/inactive/legacy. Origem precisa autorizar âncora e base do corpo;
avanço da âncora não reautoriza corpo anterior à ficha recriada. SHA/JSON
canônico e relações são conferidos antes do DTO. 74 Node e 29 Vitest dirigidos
positivos; [evidência parcial](../../entregas/2026-10-29-writer-v2-variantes-no-backup.md).
Inventário físico dos bindings, reconferência conjunta, binários, atestado/
arquivo/restauração/UI/ciclo P3/D/F2-09 permanecem abertos; macro **8/35**.
Somente commit local; validate integral no fechamento do grande bloco.

## 2026-10-29 — corpos físicos das variantes em P3

O [plano 209](execucao/209-inventario-fisico-das-variantes.md) enumera lojas/
corpos e confere cobertura dos bindings ativos, distinguindo resíduos e
revogados sem prosa. Sonda por encarnação detecta pai ausente e preserva IDs
iguais entre lojas. 25 testes novos e 28 regressões dirigidos positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-corpos-fisicos-das-variantes.md).
Reconferência conjunta, imagens/Storage, atestado/arquivo/restauração/UI/ciclo
P3/D/F2-09 continuam pendentes; macro **8/35**. Índice somente local, sem CI/
push/deploy. Validate integral no fechamento do grande bloco.

## 2026-10-29 — imagens congeladas no backup P3

O [plano 210](execucao/210-imagens-congeladas-do-backup.md) lê metadata,
hash e ranges pela geração exata, sem fallback para a versão atual. Autorização
antes/depois de I/O, inclusive falha, e fluxo cliente com integridade integral,
pressão de consumo e interrupção. Prova frozen-image-bytes-only é parcial.
117 Node distintos e 38 Vitest dirigidos positivos; veja a
[evidência parcial](../../entregas/2026-10-29-writer-v2-imagens-congeladas-no-backup.md).
Reconferência conjunta, manifesto/atestado, arquivo/restauração/UI/ciclo P3/D/
F2-09 continuam pendentes; macro **8/35**. Validate integral no fechamento
do grande bloco; somente commit local, sem CI/push/deploy.

## 2026-10-29 — auditoria nativa conjunta do backup P3

O [plano 211](execucao/211-auditoria-conjunta-do-backup.md) compõe duas passagens
completas sobre próprios/base/lore/imagens e todos os inventários físicos,
com cobertura, órfãos e fontes finais. Prova interna sem prosa ou grant;
origem indisponível preserva próprios. 116 Node dirigidos e 38 Vitest positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-auditoria-conjunta-do-backup.md).
Manifesto/atestado portátil, framing/arquivo, persistência/cleanup, restauração/
UI/ciclo P3/D/F2-09 continuam pendentes; macro **8/35**. Validate integral no
fechamento do grande bloco; somente commit local, sem CI/push/deploy.

## 2026-10-29 — manifesto e procedência assinada em P3

O [plano 212](execucao/212-manifesto-e-procedencia-assinada.md) autentica raízes
nativas de conteúdo e evidências de nascimento, sem depender das bases antigas
para verificar emissão. Ed25519 por chave servidor versionada; conta/domínio/
keyId fixados. 31 testes novos e 119 regressões Node dirigidas positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-procedencia-assinada-do-backup.md).
Framing/arquivo, cobertura e autorização atual das evidências, persistência/
cleanup e restauração/UI/ciclo P3/D/F2-09 continuam pendentes; macro **8/35**.
Nenhuma chave real/endpoint/implantação. Validate integral no grande bloco;
somente commit local, sem CI/push/deploy.

## 2026-10-29 — arquivo nativo de campanha em P3

O [plano 213](execucao/213-arquivo-nativo-de-campanha.md) monta e valida arquivo
completo por partes, com contêiner próprio, raízes/assinatura e destino temporário.
Bytes reencadeados pelo atacante não passam na conferência do manifesto.
29 testes novos e 81 regressões Node positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-arquivo-nativo-de-campanha.md).
Retorno prova somente integridade/emissão. Autorização atual/vínculos, cleanup/
persistência/retomada, restauração/UI/ciclo P3/D/F2-09 permanecem pendentes;
macro **8/35**. Sem endpoint/adaptador real/CI/push/deploy; validate no grande bloco.

## 2026-10-29 — revisão atual das origens em P3

O [plano 214](execucao/214-revisao-autorizada-das-origens.md) autentica evidências
em índice MAC antes de consultar origens, conferindo nascimento/owner/C4 e clock
em duas passagens. Bases antigas podem estar ausentes; origem recriada não recebe
acesso. 35 testes novos e 60 regressões Node positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-revisao-das-origens-do-backup.md).
Prova efêmera não ativa restauração. Vínculos semânticos, consumidores de
procedência, cleanup/persistência/retomada e restauração/UI/ciclo P3/D/F2-09
continuam pendentes; macro **8/35**. Somente commit local; validate no grande bloco.

## 2026-10-29 — universo organizacional portátil em P3

O [plano 215](execucao/215-universo-organizacional-no-backup.md) separa o universo
organizacional do universo da base no backup/revisão. Emissão v2 inclui nascimento
próprio; v1 permanece legível com vínculo não comprovado para religação.
21 testes novos e 117 regressões Node positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-universo-organizacional-no-backup.md).
Vínculos semânticos/consumidores, C4, persistência/retomada e restauração/UI/ciclo
P3/D/F2-09 continuam abertos; macro **8/35**, somente commit local. Validate no bloco.

## 2026-10-29 — semântica própria do arquivo de campanha

O [plano 216](execucao/216-semantica-dos-dados-proprios-da-campanha.md) valida
DTOs próprios pelo domínio, organização raiz/project e joins de sessões,
preparação/corpos/vínculos em índice temporário autenticado, sem prosa.
47 testes novos e 157 regressões Node positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-semantica-dos-dados-proprios.md).
Derivados/consumidores, C4, persistência, restauração/ativação e UI/ciclo
P3/D/F2-09 continuam pendentes; macro **8/35**. Somente commit local.

## 2026-10-29 — correção de campos UTF-8 no arquivo de campanha

Na inspeção derivada, o [plano 217](execucao/217-campos-utf8-no-arquivo-de-campanha.md)
reproduziu e corrigiu a exportação de texto congelado multibyte. Emissão
contentVersion 2 conserva chunks nativos; leitor mantém v1 sem reinterpretar.
19 novos e 231 regressões Node positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-campos-utf8-no-backup-de-campanhas.md).
Joins derivados/consumidores, C4, persistência e restauração/UI/ciclo continuam
pendentes; P3/D/F2-09 e macro **8/35** abertos, somente commit local.

## 2026-10-29 — revisão derivada e composta do arquivo

O [plano 218](execucao/218-semantica-dos-derivados-da-campanha.md) confere DTOs e
joins derivados em índice MAC, com provas de ausência e referências legadas
externas não resolvidas. Compõe próprios/derivados/origens para a mesma cadeia.
62 novos e 151 regressões Node positivos;
[evidência parcial](../../entregas/2026-10-29-writer-v2-revisao-completa-do-arquivo-de-campanha.md).
Validação integral local do bloco interno passou (npm run validate, código 0).
Consumidores restaurados,
C4, persistência e restauração/UI/ciclos P3/D/F2-09 continuam pendentes; macro **8/35**.
