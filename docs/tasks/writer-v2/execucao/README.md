# Execução do Writer V2

Base inicial: `master a2df540`; branch `codex/writer-v2`, checkout isolado.
Em 2026-10-13, `master d98c1ed` foi integrada sem conflitos por `5e2215e`;
[evidência da atualização](../../../entregas/2026-10-13-writer-v2-sincronizacao-master.md).
Os arquivos do checkout original e seus trabalhos paralelos permanecem preservados.

Após a consolidação `01f9b55`, `master 522ccaa` foi incorporada sem conflitos por
`0fa04fc`. Validate completo e 30 percursos Chromium passaram na branch integrada;
[evidência da nova integração](../../../entregas/2026-10-13-writer-v2-sincronizacao-master.md).
Naquele checkpoint, CI remoto, condições comerciais e pilotos humanos estavam pendentes.

O envio foi autorizado e o [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21)
foi aberto. O primeiro CI de `ea9a449` detectou deslocamento do manuscrito no
autosave móvel. A correção tem validate verde e 30 repetições de regressão.
O head `079d4e9` passou no [CI](https://github.com/gaabrielrd/writer/actions/runs/38401236217)
e nas [regras Firestore](https://github.com/gaabrielrd/writer/actions/runs/38401236138);
um caso de autocomplete passou após retry, registrado no PR. Veja a
[evidência da correção e do PR](../../../entregas/2026-10-13-writer-v2-ci.md).
Isso não libera merge, deploy nem encerra condições comerciais/humanas da fase 1.

Após esse resultado, o operador autorizou explicitamente implementar o Estúdio
F2-01, mantendo pendentes as condições humanas e comerciais. O
[contrato executável](07-estudio-projetos.md) fecha o incremento; a
[mudança de sequência](06-contratos-e-replanejamento.md) preserva os aceites pendentes.
F2-01 está implementado, com gates locais verdes e revisão independente sem
bloqueadores; [evidência](../../../entregas/2026-10-13-writer-v2-estudio.md).
A conclusão técnica de F2-01 foi confirmada em `15cd417`: [CI](https://github.com/gaabrielrd/writer/actions/runs/38411066845)
e [regras](https://github.com/gaabrielrd/writer/actions/runs/38411067039) verdes;
540 percursos visuais passaram, 12 skips preexistentes e nenhum retry.
F2-02 implementou texto próprio e arquivamento conforme escolhas explícitas;
[contrato executável](08-planejamento-de-cenas.md). Validate e regras reais locais
passaram; 96 cenários de cenas e 90 regressões Chromium verdes. E2E de produção
local encontrou timeout de fontes Google em duas tentativas intactas; conferir
o browser de produção e demais checks no CI do novo head. A confirmação de
`f4449a5` aprovou [CI](https://github.com/gaabrielrd/writer/actions/runs/38431179149)
e [regras](https://github.com/gaabrielrd/writer/actions/runs/38431178957): produção
7/7, 635 visuais diretos, um autocomplete legado após retry e 12 skips preexistentes.
Os 96 casos novos de cenas passaram sem retry; F2-02 concluído tecnicamente.
F2-03 começou com [contrato fechado](09-arcos-e-cronologia.md): ordem manual e
data textual livre confirmadas pelo operador, arcos/marcos e cronologia independentes.
Sua conclusão técnica foi confirmada em `3358c75`: [CI completo](https://github.com/gaabrielrd/writer/actions/runs/38459491836)
e [regras](https://github.com/gaabrielrd/writer/actions/runs/38459491878) verdes;
732 percursos visuais diretos, nenhum retry e 12 skips preexistentes.
F2-04 está implementado com meta total do manuscrito atual, checklist privado
de preparação e fuso configurável por usuário, usando o dispositivo como padrão.
O [contrato executável de F2-04](10-estados-metas-e-retomada.md) está fechado;
validate, regras reais e 90 jornadas Chromium locais passaram. A CI de `7988fb7`
revelou regressões visuais; a correção enviada em `16e71f6` passou 1.380 testes
frontend, 77 scripts, 224 Functions, 85 SDK e controles Chromium 24/24 + 90/90.
Em 2026-10-15, o operador autorizou avançar sem esperar a CI, usando testes
direcionados após ajustes. A CI segue em paralelo, sem aprovação presumida.
Ela terminou verde em `16e71f6`: validate Node 22/24, auditoria, produção 7/7,
822 cenários visuais diretos/12 skips preexistentes e regras 85/85, sem retry.
F2-04 está concluído tecnicamente; F2-05 já começou sob a sequência autorizada.

| Tarefa    | Estado                                                                      | Evidência                                                                                                                                                                                                                                                                                                    | Próxima condição                                                   |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| W2-F1-01  | Jornadas revisadas; validate local e CI da base verdes; corpus inventariado | [Jornadas e inventário](01-jornadas-e-escopo.md)                                                                                                                                                                                                                                                             | Importação/piloto nas tarefas próprias                             |
| W2-F1-02  | Contrato revisado; validate local e CI da base verdes                       | [Domínio e medições](02-modelo-de-dominio.md)                                                                                                                                                                                                                                                                | Critérios funcionais nas fases seguintes                           |
| W2-F1-03  | Contrato revisado; validate local e CI da base verdes                       | [Permissões e casos negativos](03-permissoes-e-privacidade.md)                                                                                                                                                                                                                                               | Implementação/regras reais nas fases próprias                      |
| W2-F1-04  | Contrato revisado; validate local verde; tarefa em execução                 | [Comércio e direitos](04-regras-comerciais-e-direitos.md)                                                                                                                                                                                                                                                    | Connect real, contratos e ensaio comercial                         |
| W2-F1-05  | Protótipo revisado, navegação aprovada; validate/30 percursos verdes        | [Protótipo](05-prototipos-e-pilotos.md), [roteiro](05-roteiro-de-pilotos.md)                                                                                                                                                                                                                                 | Participantes, critérios/tratamento de observações e piloto humano |
| W2-F1-06  | Consolidação revisada; validate local e CI da base verdes; 41 estimativas   | [Contratos/portões](06-contratos-e-replanejamento.md), [timeline](../timeline.md)                                                                                                                                                                                                                            | Condições comerciais/humanas de aceite permanecem pendentes        |
| W2-F2-01  | Concluído tecnicamente; gates locais, CI e regras verdes em 15cd417         | [Estúdio e projetos](07-estudio-projetos.md), [entrega](../../../entregas/2026-10-13-writer-v2-estudio.md)                                                                                                                                                                                                   | Condições humanas e comerciais permanecem nas respectivas entregas |
| W2-F2-02  | Concluído tecnicamente; gates locais, CI e regras verdes em f4449a5         | [Cenas e composição](08-planejamento-de-cenas.md), [entrega](../../../entregas/2026-10-13-writer-v2-cenas.md)                                                                                                                                                                                                | Condições humanas/comerciais nas respectivas entregas              |
| W2-F2-03  | Concluído tecnicamente; gates locais, CI e regras verdes em 3358c75         | [Arcos e cronologia](09-arcos-e-cronologia.md), [entrega](../../../entregas/2026-10-13-writer-v2-arcos.md)                                                                                                                                                                                                   | Condições humanas/comerciais nas respectivas entregas              |
| W2-F2-04  | Concluído tecnicamente em 16e71f6; CI e regras verdes                       | [Estados, metas e retomada](10-estados-metas-e-retomada.md), [entrega](../../../entregas/2026-10-15-writer-v2-progresso.md)                                                                                                                                                                                  | Condições humanas/comerciais nas entregas próprias                 |
| W2-F2-05  | Concluído tecnicamente em 624c912; correção de foco e CI verdes             | [Histórico](11-historico-e-restauracao.md), [entrega](../../../entregas/2026-10-15-writer-v2-historico.md)                                                                                                                                                                                                   | Aceites humanos/comerciais nas tarefas próprias                    |
| W2-F2-06  | Concluído tecnicamente em 624c912; CI e regras verdes                       | [Aventuras e blocos](12-aventuras-e-blocos.md), [entrega](../../../entregas/2026-10-15-writer-v2-aventuras-e-blocos.md)                                                                                                                                                                                      | Aceites humanos/comerciais nas tarefas próprias                    |
| W2-F2-07  | Concluído tecnicamente em 0006a66; CI e regras verdes                       | [Campanhas e variantes](14-campanhas-e-variantes.md), [captura B](15-captura-de-aventura.md), [notas C1](16-notas-proprias-da-campanha.md), [variantes C2](17-variantes-de-lore-da-campanha.md), [comparação C3A](18-comparacao-de-bases-da-campanha.md), [exclusão C4](20-exclusao-integral-da-campanha.md) | Condições humanas/comerciais nas entregas próprias                 |
| F2-08 S1  | Concluído tecnicamente em c95253a; CI e regras verdes                       | [Sessões privadas](21-sessoes-privadas-da-campanha.md)                                                                                                                                                                                                                                                       | Dependências e aceites pertinentes                                 |
| F2-08 S2A | Concluído tecnicamente em d9b7988; CI e regras verdes                       | [Referências de lore](22-referencias-de-lore-da-sessao.md), [entrega](../../../entregas/2026-10-18-writer-v2-referencias-de-lore-da-sessao.md)                                                                                                                                                               | S2B/S3 concluídos tecnicamente; F2-09 em andamento                 |
| F2-08 S2B | Concluído tecnicamente em 56cbb06; CI e regras verdes                       | [Cenas completas](23-cenas-completas-na-preparacao-da-sessao.md), [entrega](../../../entregas/2026-10-18-writer-v2-cenas-completas-da-sessao.md), [ADR 0039](../../../decisions/0039-session-scene-material.md)                                                                                              | S3 concluído tecnicamente; F2-09 em andamento                      |
| F2-08 S3  | Concluído tecnicamente em e924890; CI geral e regras verdes                 | [Pistas e missões](24-pistas-missoes-e-pendencias.md)                                                                                                                                                                                                                                                        | 1.998 frontend, 409 Functions; SDK e navegador verdes              |
| F2-09 L   | Concluído tecnicamente em 087bced; CI geral e regras verdes                 | [Lore próprio](26-lore-proprio-de-aventura.md), [entrega L](../../../entregas/2026-10-21-writer-v2-lore-proprio-de-aventura.md)                                                                                                                                                                              | I concluído tecnicamente; IA/portabilidade têm verticais próprias  |
| F2-09 I   | Concluído tecnicamente em ffc01d9; CI geral/regras verdes                   | [Importação](27-importacao-revisada-de-aventura.md), [ABI](28-contratos-da-importacao-de-aventura.md)                                                                                                                                                                                                        | 2.123 frontend/85 scripts/444 Functions; SDK e nativo positivos    |
| Fase 6    | Descoberta futura, fora da primeira versão pública                          | [Candidatos](../fase-06-evolucao-pos-v1/README.md)                                                                                                                                                                                                                                                           | Aprovação posterior de escopo                                      |

Um documento não comprova uma funcionalidade. Testes locais não comprovam CI,
capacidade comercial live, participação humana ou operação em produção.
Aceite final segue a [definição de concluído](../../../development-process.md).

C2 foi enviado em `16d90b9`; `75b9104` corrigiu o seletor B, mas a CI terminou
cancelada em um shard por prazo, com regressão de cronologia diagnosticada.
C3A está concluído tecnicamente em fe10b15: 1.680 frontend, 77 scripts,
324 Functions, 22 SDK e 24 combinações nativas, com repetições afetadas separadas.
A [entrega C3A](../../../entregas/2026-10-17-writer-v2-comparacao-de-bases.md) registra
também a correção dirigida da narrativa e os doze shards sem omissão de casos.
CI e regras do head fe10b15 terminaram verdes. Comparar uma candidata não substitui
a adoção explícita C3B ou a limpeza integral da campanha, obrigatórias no contrato.

O [planejamento C3B](19-adocao-explicita-de-base-da-campanha.md) começou após o
fechamento local C3A. Staging, continuidade de revisões/corpos, barreira de pedidos,
ABI comum, limites e cobertura estática dos epochs foram auditados em ebb1c1f.
O operador aprovou manter fichas legadas autorizadas. O contrato foi fechado com
participação separada do modo, anchors/bindings achatados e relógio global por UID;
ver [ADR 0035](../../../decisions/0035-campaign-base-adoption.md). C3B passou no
validate local: 1.755 frontend, 77 scripts, 347 Functions, SDK 5/5 e navegador
13/13. [Entrega C3B](../../../entregas/2026-10-18-writer-v2-adocao-de-bases.md).
CI e regras do próprio head `947cfc3` verdes permitiram avançar para a exclusão integral de F2-07.
O [contrato C4](20-exclusao-integral-da-campanha.md) foi fechado após revisões de
backend, cliente e QA: reserva permanente, fases limitadas, pins exatos e
encerramento de controles antigos. C4 passou no validate local: 1.813 frontend,
81 scripts e 358 Functions, cinco famílias SDK únicas e 12 combinações nativas
mais duas revalidações dirigidas. A [entrega C4](../../../entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md)
separa a primeira falha de baseline/cobertura, correções e limites da evidência.
CI de regras em 1b20f49 revelou expectativa SDK antiga; correção dirigida 1/1 verde. A correção 0006a66 passou no CI geral e regras 135/135, concluindo tecnicamente C4/F2-07.
O [contrato S1](21-sessoes-privadas-da-campanha.md) foi revisto por backend, cliente e QA.
S1 passou no validate: 1.860 frontend, 82 scripts e 369 Functions; cinco famílias SDK e 12 combinações nativas comprovadas. A CI do próprio head `c95253a` passou, incluindo regras 140/140. O [plano S2A](22-referencias-de-lore-da-sessao.md) passou no validate local: 1.910 frontend, 83 scripts, 383 Functions, cinco famílias SDK únicas e 12 combinações nativas. CI geral e regras 145/145 do head `d9b7988` verdes; [entrega S2A](../../../entregas/2026-10-18-writer-v2-referencias-de-lore-da-sessao.md). Veja a [entrega S1](../../../entregas/2026-10-18-writer-v2-sessoes-privadas.md). Referências S2 e itens S3 implementados; S3 concluiu tecnicamente após correção visual `e924890`, com CI geral/regras verdes.
F2-09 começou a descoberta sobre `a9b588a`. Após enviar a correção S3 em
`e924890`, L concluiu tecnicamente em `087bced`, com CI geral e regras verdes. Ver [entrega L](../../../entregas/2026-10-21-writer-v2-lore-proprio-de-aventura.md). O
[detalhamento sequencial](25-lore-importacao-e-portabilidade.md) começa por lore
próprio de aventura e distingue importação, IA e restauração privada. O
[contrato L](26-lore-proprio-de-aventura.md) está fechado e liberado para implementação. As fases
seguintes continuam não implementadas; [progresso verificado](../progresso.md).

## Decisões recebidas em 2026-10-13

- Brasil e BRL; Stripe preparado para pagamentos, segundo o operador.
- Criador vende; Writer cobra comissão configurável por contrato e centraliza atendimento.
- Compra avulsa, download e uso da aventura em campanhas próprias.
- Sem revenda do conteúdo autoral exclusivo; licenças de terceiros preservam seus direitos.
- Compra conserva a edição adquirida; atualização opcional; retirada interrompe novas vendas.
- Roteiros de piloto preparados; participantes serão indicados pelo operador.
- Cinco espaços aprovados: Universos, Estúdio, Publicações, Catálogo e Biblioteca; livros, aventuras e campanhas no Estúdio.

Criador absorve taxas/reversões e eventual reserva segue contrato. Reembolso integral
ou disputa perdida revoga novos downloads/acesso à edição; notas próprias são preservadas.
Disputa aberta suspende temporariamente; parcial mantém acesso. Comissão retorna
proporcionalmente ao refund e integralmente na disputa perdida. Operador confirmou
plataforma Stripe brasileira; inspeção do sandbox encontrou contas restritas, sem prova live.
Percentuais concretos, calendário, retenção e capacidade real Connect continuam em
[decisões e riscos](../decisoes-e-riscos.md).

## Continuidade

Executar um incremento por vez: plano mínimo, arquivos afetados, resultados reais
de testes, revisão e evidência. Estudos independentes podem usar subagentes;
mutações e aceites dependentes respeitam a sequência.
Pendências externas ficam visíveis enquanto trabalho independente continua.

## Importação revisada de aventuras em preparação

O [plano I](27-importacao-revisada-de-aventura.md) foi escrito após a decisão do
operador sobre cópia protegida da revisão confirmada no dispositivo, sem PDF.
O plano cobre nova aventura, upload/preparação/ativação, retomada e limpeza.
Contrato de wire e revisão cruzada foram fechados, com 13 hashes e AES conferidos
independentemente. I foi implementado, revisado e validado localmente; veja a
[entrega I](../../../entregas/2026-10-21-writer-v2-importacao-revisada-de-aventura.md).
CI geral/regras verdes em ffc01d9; IA é a próxima vertical. F2-09 segue em andamento.

## Contexto autorizado e IA de cenas/blocos validado localmente

O [plano A](29-contexto-autorizado-e-ia-de-cenas.md) e a [ABI 30](30-contratos-do-chat-de-cenas.md)
foram implementados para os três novos alvos, preservando capítulo e histórico
legados. Persona base por aventura, complemento por cena e preservação de perguntas
próprias seguem as escolhas do operador. Contexto/proveniência, geração/BYOK,
aplicação e recuperação têm unidades, SDKs reais e UI nativa próprios.

Veja a [entrega A](../../../entregas/2026-10-21-writer-v2-chat-autorizado-de-cenas.md):
validate 2.527/85/615, 30 combinações nativas novas e três regressões positivas.
CI do novo head pendente; o próximo incremento é P1 (portabilidade de livros),
sem aguardar CI conforme a autorização. F2-09 e a fase 2 continuam abertas.

## P1 — portabilidade de livros em descoberta

O [plano P1](31-portabilidade-de-livros.md) inventaria exportação v1–v6, histórico
completo/removido, rascunhos e nova cópia privada. O operador confirmou religar ao
universo original se o acesso continuar autorizado, sem duplicação. Dados próprios
continuam restauráveis com aviso quando a origem estiver indisponível; referências
externas não viram lore local. Consistência do snapshot e protocolo ainda precisam fechar.
P1 tem implementação interna limitada aos marcos registrados abaixo; restauração ainda não liberada. A foi enviado em 5f947a0; Rules 39659740521 verdes.
A CI 39659740574 revelou uma corrida no teste anterior de importação em Node 24;
correção isolada em f022094, com 13/13 testes dirigidos verdes e Node 24/Rules
remotos verdes nesse head intermediário. A expectativa visual de lore foi corrigida
em 6650408, com 6/6 perfis nativos verdes; produção permanece igual naquele ajuste. Head base
6650408 enviado e conferido; Rules 39663714845 verdes. CI 39663715057 cancelada:
Node 22/24, auditoria, produção e dez shards verdes; shards 1/3 cancelados e
agregador E2E falhou. Um caso no shard 1 passou após retry. Não é CI geral verde.

### P1 M1 — catálogo e captura completa do histórico

O [contrato M1](32-captura-consistente-do-historico.md) foi implementado: revisão
transacional do catálogo, token por identidade nativa e leituras paginadas com
reautorização. Versões de recursos removidos entram; nenhuma seleção parcial é
retornada. Validate 2.545/85/635, SDK 10/10 e seis regressões nativas positivos.
Veja a [entrega interna M1](../../../entregas/2026-10-21-writer-v2-captura-do-historico.md).
Sem pacote/restauração/roundtrip P1 ou fechamento de F2-09; o próximo marco fecha
formato, orçamento de bytes e captura dos demais dados/mídia. CI do novo head
continua condição própria, sem bloquear o próximo marco validado localmente.

### P1 M2 — contêiner limitado validado localmente

O [contrato M2](33-conteiner-limitado-de-backup.md) e a
[ADR 0045](../../../decisions/0045-book-backup-framing.md) implementam framing
sem compressão, leitura limitada, cadeia SHA-256 e selo/EOF. Validate
2.548/85/655 e cinco casos Chromium nativos verdes. Veja a
[entrega interna M2](../../../entregas/2026-10-21-writer-v2-conteiner-de-backup.md).
Ainda sem schema/captura restante/mídia/restauração de livro; P1 e F2-09 abertos.

CI do M1 e847afa: Rules verdes, CI geral parcial com sete shards verdes e cinco
cancelados; agregador falhou. Há falha de inserção/caret em dois perfis de
adventure-lore e timeouts em três casos que passaram no retry. Diagnóstico na
entrega M1; ajuste dirigido será incorporado sem bloquear o avanço validado local.

### Manutenção dirigida após M2

O [plano 34](34-regressao-visual-e-orcamento-ci.md) prepara foco/seleção reconhecida
antes da digitação no teste de alias e distribui a mesma suíte em 16 shards.
Seis perfis finais e oito contratos CI verdes; enumeração das 1.332 identidades
sem omissão/duplicação. Sem mudança de runtime ou novo validate completo; produto
conserva os bytes validados no M2. CI Linux/performance ainda pendentes.
Veja a [entrega dirigida](../../../entregas/2026-10-21-writer-v2-preparo-de-edicao-e-ci.md).
Não é nova tarefa ampla; continuar schema/captura restante de P1.

### P1 M3a — pertencimento SDK da estrutura

O [contrato 35](35-clock-da-estrutura-legada.md) exige raiz/filho atômicos para
criar capítulo/ato e remover capítulo ativo. Reproduziu quatro operações indevidas
no SDK e fechou o gate sem mudar os escritores atuais, que já avançam a raiz.
71 cenários distintos têm prova positiva composta; a
[entrega M3a](../../../entregas/2026-10-21-writer-v2-clock-da-estrutura-legada.md)
preserva as falhas/ajustes e os limites. CI nova pendente. Root token não cobre
sozinho metadados/personas/progresso/mídia ou Admin; continuar captura integral P1.

A manutenção anterior 96ff5e0 tem CI/regras verdes: 16 shards, 1.320 passes,
12 skips reportados e zero retries. As seis jornadas de alias passaram no Linux
sem retry; a duração Playwright por shard ficou entre 5,5 e 12,4 min, sem setup.
Esses resultados não substituem os checks das novas Rules de M3a.

### P1 M3b — estrutura salva com conferência final

O [contrato 36](36-leitura-limitada-da-estrutura.md) implementa leitura privada de
metadados/progresso, atos e capítulos, paginação sem prosa e partes de 64 KiB.
Cliente escreve um item por vez e reenumera tokens nativos no fim, sem readset
ilimitado. A [entrega M3b](../../../entregas/2026-10-21-writer-v2-leitura-da-estrutura.md)
registra nove testes Functions, 31 casos cliente com evidência composta, nove SDK
e cinco casos Chromium/emulador. Schema das demais capacidades, histórico por
fluxo, rascunho, mídia, sink persistente, revisão e restauração continuam em P1.
Avanço somente local, sem acompanhamento de CI, conforme instrução de 2026-10-21.

### P1 M4 — histórico completo por fluxo

O [contrato 37](37-historico-por-fluxo.md) acrescenta ordem ID de backup, hash
incremental e produtor com partes limitadas, preservando o coletor e a UI antigos.
A ponte emite registros M2 e índice final sem controles privados. Functions
36/36, SDK 5/5, cliente com 88 casos distintos em lotes e cinco cenários nativos
positivos; [evidência e limites](../../../entregas/2026-10-21-writer-v2-historico-por-fluxo.md).
O probe final compõe estrutura/histórico de 58 versões, com BOM literal, hash
corrompido, mudança real de catálogo e abort. Continua sem pacote P1 completo,
sink persistente ou restauração. Desenvolvimento somente local e sem CI.

### P1 M5 — cenas e narrativa na captura

O [contrato 38](38-cenas-e-narrativa-no-backup.md) inclui onze tipos de cenas,
fontes e narrativa, preservando arquivo/órfãos, prosa, planos, referências neutras
e ordem A/B. Duas leituras reautorizam origem/pai e a prova reenumera identidades
antes do selo. [Evidência M5](../../../entregas/2026-10-21-writer-v2-cenas-e-narrativa-no-backup.md):
18 Functions, 53 casos cliente com prova composta, 15 SDK e oito cenários nativos.
P1 segue aberto para demais capacidades, schema, sink e restauração; sem CI/push.

### P1 M6 — lore próprio e personas usadas

O [contrato 39](39-lore-e-personas-no-backup.md) acrescenta lore ao protocolo M5
e captura perfis por vínculo, sem biblioteca inteira/Set ilimitado. Edição ou
recriação de perfil externo à raiz invalida a prova. [Entrega M6](../../../entregas/2026-10-21-writer-v2-lore-e-personas-no-backup.md):
20 Functions, 30 cliente, seis SDK novos com evidência composta, seis SDK de
regressão e 11 cenários nativos. P1 continua aberto para universo/rascunho/mídia,
schema, sink e restauração; avanço local, sem CI/push.

### P1 M7 — origem de universo sem cópia global

O [contrato 40](40-origem-de-universo-no-backup.md) captura descriptor de vínculo
autorizado com encarnação nativa ou referência indisponível neutra. Não copia
metadata/lore global; edição/recriação/revogação invalida a prova antes do selo.
[Entrega M7](../../../entregas/2026-10-21-writer-v2-origem-de-universo-no-backup.md):
oito Functions, 14 cliente, cinco SDK e 14 cenários nativos. P1 segue aberto para
rascunho/mídia, schema, sink e restauração; avanço local, sem CI/push.

### P1 M8 — contribuição explícita do editor

O [contrato 41](41-rascunho-explicito-no-backup.md) congela rascunho antes de
next/await, preserva vazio/removido e captura seu estilo declarado sem autosave.
Hash/UTF-8 por partes e conferência final separam contribuição local e salvo.
[Entrega M8](../../../entregas/2026-10-21-writer-v2-rascunho-explicito-no-backup.md):
15 Functions, 44 cliente, quatro SDK e 17 cenários nativos. P1 continua para
mídia, schema, sink, revisão/restauração; somente local, sem CI/push.

### P1 M9 — bytes autorizados da capa

O [contrato 42](42-midia-autorizada-no-backup.md) captura PNG gerenciado por
stream/ranges, confere livro/uso/gerações antes/depois do I/O e verifica hashes.
URL legada não é buscada; origem quebrada falha. [Entrega M9](../../../entregas/2026-10-21-writer-v2-bytes-da-capa-no-backup.md):
12 Functions, 17 cliente, cinco SDK Firestore/Storage reais e 20 cenários nativos.
test:media torna a prova reproduzível; avisos de streams/runtime constam na entrega.
P1 continua para schema, sink e restauração; desenvolvimento local sem CI/push.

### P1 M10 — pacote por fluxo e gravação temporária

O [contrato 43](43-pacote-integral-e-gravacao.md) compõe sete capturas com pressão
de consumo e reconferência antes de footer/selo. Leitor verifica envelope, não DTO.
Sink confirma arquivo somente no sucesso. [Entrega M10](../../../entregas/2026-10-22-writer-v2-pacote-integral-por-fluxo.md):
24 Node, 114 cliente e nove cenários Chromium/OPFS/emuladores reais.
P1 continua para schema semântico, legado, UI e restauração; somente local, sem CI/push.

### P1 M11 — conteúdo e índice temporário protegido

O [contrato 44](44-validacao-semantica-do-pacote.md) fecha DTOs e valida partes,
hashes, identidades, contagens e vínculos. Índice protegido OPFS evita lista de
IDs ilimitada em RAM. [Entrega M11](../../../entregas/2026-10-22-writer-v2-validacao-do-conteudo-do-backup.md):
35 Node com regressões, lotes cliente dirigidos e dois probes nativos sobrepostos,
incluindo adulteração/cleanup/isolamento. P1 segue aberto para JSON legado, UI e
restauração; relatório content-only não é autorização. Sem CI/push.

### P1 M12 — leitura dos JSON v1–v6

O [contrato 45](45-leitura-dos-backups-json-legados.md) lê spans por ranges e
confere conteúdo com procedência/ausências explícitas, sem promover dados globais,
buscar capa ou fabricar histórico. [Entrega M12](../../../entregas/2026-10-22-writer-v2-leitura-dos-backups-legados.md):
27 Node, 46 cliente e nove cenários nativos File/OPFS com arquivos do exportador.
UI, preparação/ativação e recuperação permanecem em P1. Somente local, sem CI/push.

### P1 M13 — reserva, transferência e cancelamento

O [contrato 46](46-reserva-e-transferencia-da-restauracao.md) inicia o servidor
de restauração com raiz ausente, reserva nativa/marker, partes limitadas,
recibos, chave HTTP privada, fence e cleanup. [Evidência M13](../../../entregas/2026-10-22-writer-v2-reserva-e-transferencia-de-backups.md):
17 Node, três cliente e seis SDK reais. uploaded não significa validado/ativado.
P1 continua para revisão cifrada no host, validação servidor/remapeamento/mídia,
ativação/roundtrip/UI e validate completo. Somente commits locais, sem CI/push.

### P1 M14 — integridade retomável dos bytes

O [contrato 47](47-integridade-retomavel-da-restauracao.md) acrescenta SHA-256 e
chain em lotes, checkpoint privado, provas nativas por parte, leitor interno e
cleanup v2. [Entrega M14](../../../entregas/2026-10-22-writer-v2-integridade-dos-backups.md):
14 Node novos, regressões dirigidas e cinco cenários SDK novos positivos.
bytes-verified não é conteúdo validado nem livro ativado. P1 segue para validação
semântica servidor, remapeamento/mídia, revisão protegida no host, ativação/UI/
roundtrip e validate integral. Somente commits locais; CI ignorada.

### P1 M15 — núcleo semântico com checkpoints

O [contrato 48](48-nucleo-semantico-com-checkpoints.md) extrai uma única máquina
para pacote novo e legado, com checkpoints mínimos, expectativas raw e lotes
de relações/referências/ranks. [Evidência M15](../../../entregas/2026-10-22-writer-v2-nucleo-semantico-com-checkpoints.md):
35 Node distintos, 46 cliente e 20 cenários nativos em dois probes.
Resultado interno semantic-only não autoriza framing nem restauração.
Parser e coordenação de persistência servidor são a próxima ligação necessária;
remapeamento/mídia, ativação, host/UI/roundtrip e validate seguem em P1.
Somente commits locais, sem CI/push.

### P1 M16 — validação servidor do contêiner novo

O [contrato 49](49-validacao-servidor-do-conteiner.md) liga cursores e núcleo à
fonte/índice privados, reconferindo leituras e confirmando estado/efeitos/recibo
atomicamente. [Entrega M16](../../../entregas/2026-10-22-writer-v2-validacao-servidor-do-conteiner.md):
104 Node distintos, 46 cliente, nove SDK e 11 cenários nativos positivos.
Cleanup v3 inclui índice/itens/estado; content-verified não ativa livro.
JSON v1–v6 no servidor é a próxima etapa, ainda obrigatória em P1 junto de
remapeamento/mídia, ativação, host/UI/roundtrip e validate. Somente local, sem CI.

### P1 M17 — scanner legado com cursor

O [contrato 50](50-scanner-json-legado-com-cursor.md) torna a gramática JSON
estrita retomável em passos limitados, preservando scanner cliente e formatos.
[Entrega M17](../../../entregas/2026-10-22-writer-v2-scanner-legado-com-cursor.md):
26 Node, oito cliente, 11 cenários nativos e comparação diferencial lexical.
Cursor de até 512 KiB não acumula prosa/lista de itens. Catálogo/normalização e
snapshot servidor ainda precisam ser adaptados antes de ligar o legado ao job.
P1/F2-09 permanecem abertos, com materialização/mídia, ativação e host/UI/
roundtrip/validate pendentes. Somente local, CI ignorada.

### P1 M18 — catálogo e normalização legados retomáveis

O [contrato 51](51-catalogo-e-normalizacao-legados.md) extrai catálogo serializável
e normalização por unidades, compartilhados com o leitor, incluindo releitura sem
writes. [Entrega M18](../../../entregas/2026-10-22-writer-v2-catalogo-legado-retomavel.md):
29 Node, oito cliente, 14 cenários nativos e paridade em 85 casos de domínio.
Ligação ao job M16, snapshot ampliado e prova SDK são a próxima etapa obrigatória;
remapeamento/mídia/ativação e host/UI/roundtrip/validate seguem em P1.
Somente commits locais, sem CI/push.

### P1 M19 — validação servidor de JSON v1–v6

O [contrato 52](52-validacao-servidor-do-json-legado.md) liga passos compartilhados
ao job e à fonte M14, com snapshot opaco v2 e compatibilidade archive/cleanup.
[Entrega M19](../../../entregas/2026-10-22-writer-v2-validacao-servidor-do-legado.md):
85 Node, oito cliente e seis SDK reais positivos, incluindo estado grande,
Rules deny, nascimento/ABA e limpeza. content-verified ainda não cria livro.
Materialização/remapeamento/mídia e novo inventário são a próxima etapa;
reautorização/ativação e host/UI/roundtrip/validate continuam em P1.
Somente commits locais, sem CI/push.

### P1 M20 — leitura interna do conteúdo validado

O [contrato 53](53-leitura-autenticada-dos-itens-validados.md) acrescenta leitura
por item de novo/legado e raw limitado, com origem nativa e verify(tx) para uso
atômico pelo futuro escritor. Não cria livro, personas, mídia ou vínculo global.
A decisão de rascunho foi confirmada: manter salvo no manuscrito e recuperar
rascunho diferente como versão separada. Materialização/remapeamento/inventário,
ativação e host/UI/roundtrip/validate continuam em P1. Commits locais, sem CI.

[Evidência M20](../../../entregas/2026-10-22-writer-v2-leitura-autenticada-da-restauracao.md):
71 Node, seis SDK reais distintos; dois afetados repetidos depois do pin do
recibo inicial. Checks locais dirigidos passaram; validate integral segue em P1.

### P1 M21 — identidade da cópia restaurada

O [contrato 54](54-remapeamento-da-identidade-restaurada.md) acrescenta remapeamento
por contexto/tipo/pai, chaves nativas e relações de lore em páginas, consumindo
M20 com provas. [Evidência M21](../../../entregas/2026-10-22-writer-v2-identidade-da-copia-restaurada.md):
83 Node dirigidos e dois SDK reais passaram; vetor independente passou na repetição
do arquivo afetado. Não escreve recursos. Inventário/esquema/writers nativos,
perfis/mídia/ledger, autorização/ativação e host/UI/roundtrip/validate seguem em P1.
Somente commits locais, CI ignorada.

### P1 M22 — estrutura nativa e limpeza v4

O [contrato 55](55-preparacao-nativa-da-estrutura.md) grava atos/capítulos/ledger
sob raiz ausente, com journal nativo, CAS/recibo e cleanup v4. Snapshot final de
validação fica fixo. [Evidência M22](../../../entregas/2026-10-22-writer-v2-estrutura-nativa-da-restauracao.md):
103 Node e dois SDK reais passaram; cenário de estrutura repetido após correção
de clone por tentativa. SDK demonstrou rejeição atômica de campo de 1.100.000
bytes, sem truncamento; representação grande continua obrigatória.
Demais recursos, perfis/mídia, ativação e host/UI/roundtrip/validate seguem em P1.
Somente local, sem CI/push.

### P1 M23 — texto grande na preparação

O [contrato 56](56-texto-grande-na-preparacao.md) resolve armazenamento de content
por corpo imutável/partes, ledger completo e limpeza v5. Preserva v4 para projetos
pequenos e o limite lógico de 8 MiB. [Evidência M23](../../../entregas/2026-10-22-writer-v2-texto-grande-na-preparacao.md):
114 Node e três SDK reais positivos. A jornada de fonte tem 1.100.000 bytes;
a prova de 8.384.512 bytes é isolada de capacidade física.
Integração dos consumidores/pins/coleta, demais campos grandes/recursos,
perfis/mídia, ativação e host/UI/roundtrip/validate permanecem em P1/F2-09.
Somente commit local; CI ignorada.

### P1 M24 — leitura lógica dos capítulos

O [contrato 57](57-leitura-logica-dos-capitulos.md) integra corpo externo ao
cliente e leitores de histórico, contagem, análise e backup. Cada parte confere
acesso e origem; cliente valida bytes completos, conta e confirmação final.
[Evidência M24](../../../entregas/2026-10-22-writer-v2-leitura-logica-dos-capitulos.md):
120 Node distintos, 72 Vitest distintos e dois SDK positivos. Callable preparada, sem deploy.
Escrita/versões por referências/pins/coleta/exclusão/conversão, demais recursos,
campos grandes, mídia/personas, ativação e host/UI/roundtrip/validate seguem P1.
Somente commit local; CI ignorada.

### P1 M25 — escrita e versões por referência

O [contrato 58](58-escrita-e-versoes-dos-capitulos-grandes.md) integra escrita/CAS,
histórico v2 e deltas compartilhados; preserva versões de capítulos removidos.
[Evidência M25](../../../entregas/2026-10-22-writer-v2-escrita-e-versoes-de-capitulos-grandes.md):
97 Node, 60 Vitest e dois SDK distintos positivos, incluindo duas gerações perto
de 8 MiB e rollback por parte ocupada. Sem ativação ou deploy.
Coleta física/exclusão integral/conversão/chat, demais recursos/campos grandes,
personas/mídia, autorização e host/UI/roundtrip/validate seguem P1/F2-09.
Somente commit local; CI ignorada.

### P1 M26 — coleta e exclusão física

O [contrato 59](59-coleta-e-exclusao-dos-corpos.md) prepara worker por evento,
lotes/máscaras e exclusão v2 com finish legado compatível.
[Evidência M26](../../../entregas/2026-10-22-writer-v2-coleta-e-exclusao-dos-corpos.md):
100 Node e três SDK distintos positivos. Worker ainda sem deploy; entrega
Eventarc não foi verificada. Implantação exige drenar handlers antigos antes de
habilitar produtores do formato. Conversão/chat, demais recursos/campos grandes,
personas/mídia, autorização/ativação e host/UI/roundtrip/validate seguem P1/F2-09.
Somente commit local; CI ignorada.

### P1 M27 — consumidores do texto lógico

O [contrato 60](60-chat-e-conversao-com-texto-logico.md) integra chat, conversão e
remoção por agrupadores mistos, mantendo pins, versões, fonte e débito atômicos.
Editor compõe cenas e backup preserva campo congelado externo, sem fallback.
[Evidência M27](../../../entregas/2026-10-22-writer-v2-consumidores-do-texto-logico.md):
143 Node, 144 Vitest e três SDK distintos positivos; quotas anteriores preservadas.
Demais recursos/campos grandes, personas/mídia, autorização/ativação e
host/UI/roundtrip/validate continuam em P1/F2-09. Somente local; CI ignorada.

### P1 M28 — lore próprio na preparação

O [contrato 61](61-materializacao-do-lore-proprio.md) prepara fichas próprias e
relações de até 64 por unidade, com provas no commit, retomada e inventário v6.
Cursor de varredura separado cobre lore intercalado sem consumir cenas/narrativa.
[Evidência M28](../../../entregas/2026-10-22-writer-v2-materializacao-do-lore-proprio.md):
131 Node distintos e três SDK reais positivos, incluindo limite nativo com fonte
intacta, recriação protegida e compatibilidade JSON v1–v6. Nenhuma ativação/deploy.
Representação dos campos grandes, demais recursos, personas/mídia, histórico/
rascunho, autorização/ativação e host/UI/roundtrip/validate seguem P1/F2-09.
Somente commit local; CI ignorada.

### P1 M29 — cenas e narrativa na preparação

O [contrato 62](62-cenas-e-narrativa-na-preparacao.md) materializa todos os onze
tipos após lore e índices nativos. Progresso v3 confere o manifesto e aguarda
resource-counts; inventário v7 limpa filhos antes dos pais, mesmo sem cabeçalho.
[Evidência M29](../../../entregas/2026-10-22-writer-v2-cenas-e-narrativa-na-preparacao.md):
153 Node e três cenários SDK distintos positivos. Achado de updateTime em no-op
foi corrigido e o cenário afetado repetido; conteúdo/journal idênticos são reutilizados.
Reconciliação, campos grandes, personas, histórico/rascunho/capa, autorização/
ativação e host/UI/roundtrip/validate seguem P1/F2-09. Somente local; CI ignorada.

### P1 M30 — reconciliação dos recursos

O [contrato 63](63-reconciliacao-dos-recursos.md) recalcula cenas/agrupadores/ledger
e vínculos únicos, conferindo artefatos antes de preparar o índice. Progresso v4
termina em personas com raiz ausente/countReady false; inventário v8 preserva
no-op integral e limpeza compatível.
[Evidência M30](../../../entregas/2026-10-22-writer-v2-reconciliacao-dos-recursos.md):
175 Node e dois cenários SDK distintos positivos. Corrupção Unicode na expectativa
do teste foi corrigida e apenas o cenário afetado repetido.
Personas, histórico/rascunho/capa, campos grandes, autorização/ativação e
host/UI/roundtrip/validate continuam em P1/F2-09. Somente local; CI ignorada.

### P1 M31 — personas e vínculos privados

O [contrato 64](64-personas-na-preparacao-privada.md) prepara definições e vínculos
dos três scopes sem tocar a biblioteca. Inventário v9/progresso v5 conferem
manifesto/relatório e preservam a fronteira anterior de recursos.
[Evidência M31](../../../entregas/2026-10-22-writer-v2-personas-na-preparacao-privada.md):
197 Node distintos e dois SDK reais positivos; 53 perfis, conteúdo exato/arquivo,
ausências legadas, deduplicação, CAS e cleanup protegido. Estado final universe,
com raiz ausente. Integração de personas, universo, histórico/rascunho/capa,
campos grandes, autorização/ativação e host/UI/roundtrip/validate seguem P1/F2-09.
Somente local; CI ignorada.

### P1 M32 — universo original e vínculo estrito

O [contrato 65](65-universo-na-restauracao.md) prepara a origem sem copiar universo
ou lore e oferece composição transacional estrita para a futura ativação.
Progresso v6 mantém inventário v9, termina em history e não altera contadores.
[Evidência M32](../../../entregas/2026-10-22-writer-v2-universo-na-restauracao.md):
233 Node e dois SDK reais positivos. Reautorização/nascimento exato, ausência de
promoção de unavailable, revogação/ABA, CAS/replay/cleanup e rollback/commit nativo
com raiz sintética. Não demonstra ativação integral da cópia.
Histórico/rascunho/capa, personas, campos grandes, autorização/certificação final
e host/UI/roundtrip/validate seguem P1/F2-09. Somente local; CI ignorada.

### P1 M33 — histórico por partes

O [contrato 66](66-historico-na-preparacao.md) prepara todas as versões, inclusive
de recursos removidos, com hash incremental e manifesto depois do último corpo.
Inventário v10/progresso v7 mantêm compatibilidade e encerram em draft.
[Evidência M33](../../../entregas/2026-10-22-writer-v2-historico-na-preparacao.md):
284 Node e dois SDK reais positivos. Vazio/BOM/Unicode, datas/rótulo/razão,
retomada limitada, CAS/replay/rollback, partes sem manifesto e proteção contra ABA.
Raiz sintética confere somente o leitor existente. Rascunho/capa, personas,
campos grandes, certificação/ativação e host/UI/roundtrip/validate seguem P1/F2-09.
Somente local; CI ignorada.

### P1 M34a — contribuição exclusiva do rascunho

O [contrato 67](67-persona-exclusiva-do-rascunho.md) corrige o pré-requisito de M31:
reconcilia exatamente a persona usada somente pelo rascunho, sem copiar a biblioteca.
[Evidência M34a](../../../entregas/2026-10-22-writer-v2-persona-exclusiva-do-rascunho.md):
93 Node distintos e um cenário SDK novo positivos. Campo opcional conserva jobs/recibos e
permite avançar até draft; texto/perfil exclusivos ainda serão preparados em M34.
Raiz ausente; P1/F2-09 e Writer V2 abertos. Somente local; CI ignorada.

### P1 M34b — texto e estilo do rascunho preparados

O [contrato 68](68-rascunho-na-preparacao-privada.md) preserva a contribuição em
partes sem sobrescrever salvo/recriar capítulo. Inventário v11/progresso v8
terminam em draft-finalize. Perfil exclusivo é copiado privadamente; igual ao
salvo evita corpos duplicados.
[Evidência M34b](../../../entregas/2026-10-22-writer-v2-rascunho-na-preparacao-privada.md):
105 Node e dois SDK reais positivos. M34c deve conferir contagem/portabilidade
antes do manifesto da versão e da capa. Sem raiz; P1/F2-09 e Writer V2 abertos.
Somente local; CI ignorada.

### P1 M34c — versão recuperada finalizada e portátil

O [contrato 69](69-finalizacao-da-versao-recuperada.md) cria manifesto manual com
contagem real, metadata/estilo portáteis e provas reconferidas após a leitura.
Inventário v11 mantém compatibilidade; fase cover sem consumir a capa.
[Evidência M34c](../../../entregas/2026-10-22-writer-v2-finalizacao-da-versao-recuperada.md):
197 Node, 68 Vitest distintos e dois SDK positivos; 20 MiB/320 partes, ABA,
rollback, remapeamento e captura congelada em páginas por orçamento. Build/smoke OK.
Sem raiz ativada. Capa, personas globais, campos grandes, certificação/ativação e
host/UI/roundtrip/validate seguem P1/F2-09. Somente local; CI ignorada.

### P1 M35a — bytes da capa preparados privadamente

O [contrato 70](70-bytes-da-capa-na-preparacao.md) conserva partes e descriptor
com SHA integral, metadados exatos e marcadores explícitos. Inventário v12 e
progresso v9 terminam em cover-finalize, sem raiz ou imagem na biblioteca/Storage.
[Evidência M35a](../../../entregas/2026-10-22-writer-v2-bytes-da-capa-na-preparacao.md):
150 Node distintos, 9 Vitest e dois SDK positivos. M35b deve validar formato e
materializar objeto privado com proteção a I/O tardio/geração/limpeza. Personas,
campos grandes, certificação/ativação e host/UI/roundtrip/validate seguem P1.
P1/F2-09 e Writer V2 abertos. Somente local; CI ignorada.

### P1 M35b — capa materializada em Storage privado

O [contrato 71](71-materializacao-privada-da-capa.md) reserva intenção antes de
I/O, valida PNG e preserva bytes com prova de geração. Cancelamento v13 instala
fence vazio permanente antes da limpeza nativa; progresso v10 termina em
personas-integrate, sem biblioteca/uso/raiz.
[Evidência M35b](../../../entregas/2026-10-22-writer-v2-materializacao-privada-da-capa.md):
301 backend distintos, dois guards e cenários SDK positivos; limite válido de
16 MiB e contrato HTTP do SDK real. Limitações do emulador e falhas anteriores
estão registradas. Disponibilização da mídia, personas, campos grandes,
certificação/ativação e host/UI/roundtrip/validate seguem P1/F2-09.
Somente local; CI ignorada. Writer V2 continua aberto.

### P1 M36a — disponibilidade antes da instalação de personas

O [contrato 72](72-disponibilidade-das-personas-restauradas.md) prepara biblioteca,
Rules e consumidores para perfis restaurados pendentes/ativos. Gates nativos
exigem recibos imutáveis; edição conserva origem e eventos sem mudança visível
não reiniciam a apresentação. Nenhum lote/perfil global novo é criado pelo produto.
[Evidência M36a](../../../entregas/2026-10-23-writer-v2-disponibilidade-das-personas-restauradas.md):
114 backend distintos, 15 Vitest e 14 SDK positivos; build/smoke OK.
M36b deverá instalar cópias sob inventário ampliado; ativação final libera o lote.
Capa/biblioteca, campos grandes, certificação/ativação e host/UI/roundtrip/validate
seguem em P1/F2-09. Somente local; CI ignorada. Writer V2 continua aberto.

### P1 M36b — instalação das cópias globais de personas

O [contrato 73](73-instalacao-das-personas-restauradas.md) instala snapshots
literais por definição autenticada e unidade transacional, sem adotar biblioteca
atual. Inventário v14/progresso v11 e lote pendente antecedem as cópias; término
exige contagem exata e chega a resources-finalize, com raiz ausente/countReady false.
Cancelamento revoga antes de mídia/artefatos e conserva lote cancelled permanente.
[Evidência M36b](../../../entregas/2026-10-23-writer-v2-instalacao-das-personas-restauradas.md):
341 backend distintos, 39 Vitest e sete SDK positivos, incluindo 501 perfis e
proteção nativa contra registros recriados. Ativação ainda não é implementada.
Disponibilização da capa, campos grandes/consumidores, certificação/ativação,
limpeza pós-ativação e host/UI/roundtrip/validate seguem P1/F2-09.
Somente local; CI ignorada. Writer V2 permanece aberto.

### P1 M37a — texto lógico das fontes congeladas

O [contrato 74](74-texto-logico-das-fontes-de-conversao.md) preserva original.content
em corpos de capítulo existentes, sem novo namespace/inventário. Restauração e
reconciliação admitem fonte acima de 1 MiB e item perto de 8 MiB; leitor privado
por token nativo/revisão e cliente mantêm o texto literal, sem ponteiros no backup.
[Evidência M37a](../../../entregas/2026-10-23-writer-v2-texto-logico-das-fontes-de-conversao.md):
110 backend distintos, 58 Vitest e três SDK positivos; tipos/build/smoke OK.
O backup ainda recompõe cada item por página; otimizar as leituras antes de P1.
M37 segue com lore, outros campos de cenas/narrativa, metadados e labels/metadata
de versões/rascunho. Capa/biblioteca, certificação/ativação, limpeza pós-ativação e
host/UI/roundtrip/validate permanecem. P1/F2-09 e Writer V2 abertos, somente local.

### P1 M37b — leitura indexada do backup das fontes

O [contrato 75](75-backup-indexado-das-fontes.md) grava offsets/carries e hashes no
corpo já existente, sem texto duplicado ou inventário novo. As páginas continuam
idênticas, com até quatro partes nativas por leitura; tokens/varredura final
incluem nascimento/última alteração do corpo. Índice inválido falha fechado.
[Evidência M37b](../../../entregas/2026-10-23-writer-v2-backup-indexado-das-fontes.md):
104 backend distintos, 22 Vitest e três SDK positivos. Casos de 19 páginas/37
leituras e 128 páginas/255 leituras confirmados no SDK. A compatibilidade sem
índice permanece, com migração/certificação pendente antes de P1 integral.
Demais campos grandes, orçamento após remapeamento, capa/biblioteca,
certificação/ativação, limpeza pós-ativação e host/UI/roundtrip/validate seguem
obrigatórios. P1/F2-09 e Writer V2 continuam abertos; somente commits locais.

### P1 M37c — índices de fontes dos jobs antigos

O [contrato 76](76-migracao-dos-indices-das-fontes.md) acrescenta migração interna
por fonte com preparação v12, preservando inventário v14. Journals/recibos e cada
parte são autenticados antes de completar o índice; no-op conserva updateTime,
e cancelamento reconhece os recibos novos sem recriar corpos.
[Evidência M37c](../../../entregas/2026-10-23-writer-v2-migracao-dos-indices-das-fontes.md):
430 backend distintos/33 arquivos e dois SDK positivos, incluindo representação
anterior no nascimento nativo e preservação de parte recriada. Índice disponível
não significa migração de produção ou ativação. Certificação integral, demais
campos grandes/orçamento, capa/biblioteca, limpeza pós-ativação e host/UI/
roundtrip/validate seguem P1/F2-09. Writer V2 aberto, somente commits locais.

### P1 M38a — contrato dos recursos grandes

O [plano 77](77-campos-grandes-de-recursos-e-metadados.md) preserva o escopo de
todos os campos grandes, inclusive crescimento após remapeamento. Sua primeira
etapa define codec/leitura interna com provas por página, cabeçalho constante e
birth nativo fixado. [Evidência M38a](../../../entregas/2026-10-23-writer-v2-contrato-de-payloads-grandes.md):
41 Node e dois SDK distintos positivos; objeto sintético de 141 partes, dois docs
por página e rejeição de recriação/ABA. Nenhum produtor/callable/Rule habilitado.

A restauração de lore grande ainda depende de M38b (inventário/cleanup e escrita)
e M38c (consumidores/mutações); M38d, saída portátil ampliada e certificação seguem.
Capa/biblioteca, ativação, limpeza posterior, host/UI/roundtrip e validate continuam
em P1/F2-09. Writer V2 aberto, somente commits locais, sem CI/push/PR/deploy.

### P1 M38b — produção privada de lore grande

O [plano 78](78-producao-privada-de-lore-grande.md) implementa dados gerais e
páginas de relações em payloads, inventário de capacidade v1, reconciliação por
página e cancelamento limitado com provas nativas. Partes são planas para cobrir
órfãs sem cabeçalho. [Evidência M38b](../../../entregas/2026-10-23-writer-v2-producao-privada-de-lore-grande.md):
487 backend/35 arquivos e quatro SDK distintos positivos; nenhum produtor real
de dados de usuário ou ativação ocorreu.

A [tarefa 79](79-migracao-dos-prefixos-de-lore.md), entregue em M38b2, migra prefixos
inline antigos preservando recibos e contadores.
M38c cobre consumidores/edição/backup/exclusão; demais campos grandes, saída
portátil ampliada, capa/biblioteca, certificação/ativação e host/UI/roundtrip/
validate continuam P1/F2-09. Writer V2 aberto, somente commits locais e CI ignorada.

### P1 M38b2 — prefixos inline migrados sem recontagem

O [plano 79](79-migracao-dos-prefixos-de-lore.md) autentica o contador inicial pelo
recibo original, conserva o prefixo até replace e conta só as relações adicionais.
[Evidência](../../../entregas/2026-10-23-writer-v2-migracao-dos-prefixos-de-lore.md):
60 backend distintos e dois SDK positivos, com replay, rollback, recriação,
cancelamento e avanço até v14/v12. Nascimento do lore e primeiro journal/recibo
permanecem. Sem migração em produção, raiz ativada ou UI pronta.

A próxima etapa é M38c, com consumidores/assinaturas/mutações/backup e exclusão de
livro ativo. Demais campos grandes, saída portátil ampliada, certificação,
capa/biblioteca, ativação, limpeza posterior e host/UI/roundtrip/validate seguem
em P1/F2-09. Writer V2 aberto, somente commits locais; CI ignorada.

### P1 M38c1 — API privada para ler lore completo

O [plano 80](80-consumidores-do-lore-completo.md) começou pela leitura servidor:
lista metadata-only por ID, abertura e partes autorizadas, inline ou payload.
[Evidência](../../../entregas/2026-10-23-writer-v2-leitura-privada-do-lore-completo.md):
118 backend distintos e três SDK reais; Unicode em 141 partes e três páginas
de relações. Cada parte usa um chunk e quatro/seis leituras nativas.

Somente a etapa 1 está validada. Cliente/lista/assinatura, escritores/Rules,
contextos, backup lógico e coleta/exclusão seguem nas etapas 2–7 de M38c.
Outros campos grandes, saída portátil ampliada e certificação/ativação de P1
continuam pendentes. Writer V2 aberto, sem push/PR/deploy ou CI remota.

### P1 M38c2 — lore completo nos serviços cliente

O [plano 80, etapa 2](80-consumidores-do-lore-completo.md) agora monta e confere
base/relações antes de get/list/assinatura e criação existente. Conta/epoch,
root/metadata e unsubscribe preservam o contexto. Inline mantém SDK servidor;
payload exige API completa. Writers antigos bloqueiam update/delete de payload.
[Evidência](../../../entregas/2026-10-23-writer-v2-lore-completo-no-cliente.md):
149 casos distintos em nove arquivos, tipos/lint/arquitetura/bundle/smoke positivos,
com produtor/API/cliente em memória. Harness não representa ativação ou browser.

Próxima etapa 3: escritores/Rules/GC; contextos, backup e exclusão seguem em M38c.
Demais campos grandes, saída portátil ampliada e todos os gates finais de P1
continuam pendentes. Writer V2 aberto; somente commits locais e CI ignorada.

### P1 M38c3a — campos incrementais e guardas dos stubs

O [plano 81](81-escrita-do-lore-completo.md) começou pelo parser sem texto livre
no checkpoint e pela proteção contra mutação SDK de payloadStorage, inclusive
inválido/null e deleting. [Evidência](../../../entregas/2026-10-23-writer-v2-validacao-dos-campos-de-lore.md):
93 Node e sete SDK distintos positivos, com controles inline sob os mesmos gates.

O editor ainda exige upload/inventário/cancelamento/cleanup, geração/CAS/recibos,
criação/exclusão/coleta e integração cliente. Etapa 3 e todo M38c permanecem abertos,
assim como P1/F2-09/V2. Nenhuma Rule ou produtor foi implantado; commits locais.

### P1 M38c3b — upload privado dos campos

O [plano 81, passo 2](81-escrita-do-lore-completo.md) agora tem serviço interno
com job/lease, unidades Merkle/SHA/parser, recibos, verificação/selo e cleanup
com fence permanente. [Evidência](../../../entregas/2026-10-23-writer-v2-upload-privado-dos-campos-de-lore.md):
124 Node distintos e três SDK positivos, com 141 partes, fonte intacta e
preservação de recriados. Metadata de selo não é grant atual.

Próximos passos: readers/geração v2 e adoção CAS/privacidade; criação/exclusão/GC,
inventário do livro e cliente. Sem endpoint, UI, troca ativa ou deploy.
M38c/P1/F2-09 e Writer V2 abertos; somente commits locais, CI ignorada.

### P1 M38c3c — leitores de gerações v2

O [plano 81, passo 3a](81-escrita-do-lore-completo.md) prepara leitores backend
e cliente para base v1, campos achatados, remoções/datas explícitas e relações
da geração anterior ou novas. [Evidência](../../../entregas/2026-10-23-writer-v2-leitura-das-geracoes-de-lore.md):
72 Node, 85 Vitest e três SDK distintos positivos, com base/campo grandes,
identidade nativa, cutoff e custo constante por unidade.

Próximo passo: metadata da origem e adoção CAS certificada com leases,
privacidade/clock; depois criação/exclusão/GC, inventário do livro e cliente.
Nenhum produtor v2 habilitado, migração ou ativação. M38c/P1/F2-09/V2 abertos.
Somente commits locais, CI ignorada.

### P1 M38c3d — inspeção privada da metadata de origem

O [plano 81, passo 3b](81-escrita-do-lore-completo.md) agora resolve no servidor
presença, privacidade e datas da fonte, inclusive bases grandes, com checkpoints
privados, SHA e recibos nativos. [Evidência](../../../entregas/2026-10-23-writer-v2-inspecao-da-origem-do-lore.md):
205 Node distintos e quatro SDK positivos; fonte/clock preservados, 141 partes
e retry concorrente real. Certificado histórico não concede leitura ou
disponibilidade atual de todos os corpos.

Próximo: adoção CAS certificada com leases/inventário/clock/privacidade;
criação/exclusão/GC e integração cliente/writers ainda seguem obrigatórios.
Nenhum endpoint/adoção/ativação habilitados. M38c/P1/F2-09/V2 abertos.
Somente commits locais e CI ignorada.

### P1 M38c3e — núcleo de alcance e coleta de fontes

O [plano 82](82-alcance-e-coleta-dos-corpos-de-lore.md) implementa o pré-requisito
de inventário para a adoção CAS. Registro de fonte e coleta interna usam
controles/referências nativos, varredura da cabeça atual por lotes e fences.
[Evidência](../../../entregas/2026-10-23-writer-v2-alcance-e-coleta-do-lore.md):
102 Node e quatro SDK distintos positivos, incluindo 141 partes, páginas
deslocadas, cabeça idêntica recriada e referência tardia na 19ª página.

Próximo: reservar uploads/leases sob geração preparing, cancelamento e adoção
CAS/clock/privacidade; materialização inline e exclusão do livro/lore seguem.
Qualquer lease ou livro deleting/ausente adia a coleta. Nenhum endpoint,
worker, adoção ou ativação habilitados. M38c/P1/F2-09/V2 abertos; commits locais.

### P1 M38c3f — reserva dos uploads de lore

[Plano 83](83-reserva-dos-uploads-de-lore.md) e
[evidência](../../../entregas/2026-10-23-writer-v2-reserva-dos-uploads-de-lore.md):
113 Node e cinco SDK distintos positivos, com reserva preparing e cancelamento/
coleta coordenados por provas nativas. Inclui 141 partes, revogação, concorrência,
recriações e rollback, sem alterar cabeça/clock/publicação.

Próximo: compilar campos/páginas e materializar inline; referências completas e
adoção CAS/leases/clock/privacidade ainda pendentes, assim como exclusão e cliente.
Nenhum endpoint/UI/ativação. P1/F2-09/V2 abertos; somente commits locais.

### P1 M38c3g — composição de gerações em payload

[Plano 84](84-composicao-das-geracoes-de-lore.md) e
[evidência](../../../entregas/2026-10-23-writer-v2-composicao-das-geracoes-de-lore.md):
69 Node e três SDK distintos positivos. Campos achatados, referências preparing,
diff de páginas e auditoria por partes preparam um certificado privado ready.
Fonte/clock/publicação intactos; sem adoção ou UI.

Próximo: materialização servidor de inline, incluindo filhos em preparação;
depois adoção CAS/leases/clock/privacidade/recibo e integração de exclusão/
consumidores/cliente. Passo 4 completo, P1/F2-09/V2 continuam pendentes.

### P1 M38c3h — materialização servidor das fichas inline

[Plano 85](85-materializacao-das-fichas-inline.md) e
[evidência](../../../entregas/2026-10-23-writer-v2-materializacao-das-fichas-inline.md):
134 Node e três SDK distintos positivos em rodadas dirigidas.
Compositor prepara inline por filhos privados, preserva valores/ausências e
coordena cleanup antes da reserva, sem escrita da cabeça/clock/publicação.

Próximo: adoção CAS/leases/clock/privacidade/recibo e integração da exclusão/
consumidores/backup/cliente. O núcleo de composição cobre inline e payload;
P1/F2-09/V2 continuam abertos. Somente commits locais.

### P1 M38c3i — adoção atômica das gerações

[Plano 86](86-adocao-atomica-das-geracoes-de-lore.md) e
[evidência](../../../entregas/2026-10-23-writer-v2-adocao-atomica-das-geracoes-de-lore.md):
277 Node e três SDK distintos positivos em rodadas dirigidas. Serviço interno
troca cabeça/geração/leases lógicas/clock/privacidade/recibo atomicamente,
reconhece segunda edição e coleta de corpos retirados com provas nativas.

Próximo: criação/exclusão coordenadas, inventário do livro/lore, todos os
writers/consumidores, backup lógico/indexado e cliente antes de endpoint/UI.
P1/F2-09/V2 continuam abertos; somente commits locais.

### P1 M38c3j — exclusão dos recursos de lore do livro

[Plano 87](87-exclusao-dos-recursos-de-lore-do-livro.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-exclusao-dos-recursos-de-lore-do-livro.md):
248 Node distintos, 91 Vitest e cinco SDK positivos em rodadas dirigidas.
Inventário v3 coordena preparações e limpeza por metadata sob cutoff nativo;
partes antes dos headers, raiz por último e controles/leases/recibos preservados.

Próximo: criação/exclusão individual de lore e roteamento das preparações ainda
sem marca, depois writers/consumidores/backup/cliente antes de endpoint/UI.
Validate integral no fechamento de P1. P1/F2-09/V2 continuam abertos;
somente commits locais, sem CI remota/deploy.

### P1 M38c3k — exclusão individual do lore completo

[Plano 88](88-exclusao-individual-do-lore-completo.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-exclusao-individual-do-lore-completo.md):
303 Node e cinco SDK distintos positivos em rodadas dirigidas.
Retirada por inspeção/CAS e tombstone atômicos; cleanup por metadata, outras
fichas preservadas e handoff nativo para a exclusão do livro. Sem UI/endpoint.

Próximo: criação por reserva, depois demais writers/consumidores/backup/cliente
e roteamento de preparações sem marca antes da exposição. Validate integral
no fechamento de P1. P1/F2-09/V2 abertos; somente commits locais.

### P1 M38c3l L1 — reserva permanente da criação de lore

[Plano 89](89-criacao-do-lore-por-reserva-permanente.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-reserva-permanente-da-criacao-de-lore.md):
336 Node e três SDK distintos positivos em rodadas dirigidas.
Reserva vazia e cancelamento são nativos, com ID servidor e fences; etapa
creations coordena a exclusão do livro. Sem cabeça/bytes ou UI habilitados.

Próximo obrigatório L2: inventário/cancelamento de filhos e fonte privada dos
uploads antes do primeiro byte. L3: composição/auditoria e ativação atômica,
com sucesso histórico não cancelável. A reserva isolada não entrega criação.
M38c/P1/F2-09/V2 seguem abertos, com commits locais e CI ignorada.

### P1 M38c3m / criação L2 — uploads vinculados à reserva

[Plano 90](90-uploads-vinculados-a-criacao-de-lore.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-uploads-vinculados-a-criacao-de-lore.md):
294 Node e quatro SDK distintos positivos em rodadas dirigidas.
Campos/páginas são preparados sem cabeça/inspeção fictícias; cancel fecha novos
writes e limpa filhos por unidades, junto dos checkpoints, preservando fences.

Próximo L3: tentativas/seleção congelada, reserva dos uploads para geração,
cleanup de reserved, composição/auditoria sem base e ativação atômica de cabeça/
geração/leases/clock/datas/recibo. Nenhum endpoint/UI novo; criação completa,
demais integrações e P1/F2-09/V2 permanecem abertos. Commits somente locais.

### P1 M38c3n / criação L3A — composição sem cabeça e cleanup de tentativas

[Plano 91](91-composicao-do-lore-a-partir-da-reserva.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-composicao-do-lore-a-partir-da-reserva.md): 314 Node distintos e quatro SDK positivos.
Composição certifica campos/páginas por origem creation e tentativa nativa,
sem base/cabeça/inspeção fictícias. Cancel limpa reserved e audita controles
preservados; exclusão do livro retoma o mesmo fluxo.

Próximo L3B: ativação atômica e sucesso histórico, com reader/reedição/retirada/
exclusão do livro preservando a origem. Adoção creation segue bloqueada,
sem UI/endpoint. M38c/P1/F2-09/V2 continuam abertos; validate no fim de P1.
Somente commits locais, sem CI remota ou deploy.

### P1 M38c3o / criação L3B — ativação e sucesso histórico

[Plano 92](92-ativacao-atomica-da-criacao-de-lore.md) e [evidência](../../../entregas/2026-10-24-writer-v2-ativacao-atomica-da-criacao-de-lore.md):
454 Node e seis SDK distintos positivos em rodadas dirigidas.
Cabeça/geração/leases lógicas/clock/datas/recibo/criador são atômicos;
reader exige nascimento original e cancel não apaga sucesso. Reedição/
coleta/retirada/exclusão preservam confirmação sem recriar ficha.
Guarda de revisão exige comprovante do criador também no replay da edição.

Backend interno de criação concluído com L1/L2/L3A/L3B, sem endpoint/UI.
Próximos: demais writers/regras, consumidores, backup/cliente/recuperação,
roteamento de preparações sem flag e rollout. M38c/P1/F2-09/V2 continuam
abertos. Validate integral no fim de P1; somente commits locais, sem CI.

### P1 M38c3p — roteamento integral da exclusão de livros

[Plano 93](93-roteamento-integral-da-exclusao-de-livros.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-roteamento-integral-da-exclusao-de-livros.md):
92 Vitest, 23 Node e 17 SDK positivos.
Todo livro é finalizado pelo servidor; flags ausentes/false não escondem
preparações. SDK não remove raiz nem grava tombstone, com controles positivos
de início/metadata/limpeza nativa, retomada e contadores de universo.

Pendentes: rollout/drenagem, demais escritores, consumidores/backup/cliente e
auditoria dos outros namespaces. M38c/P1/F2-09/V2 continuam abertos.
Validate integral no fim de P1; somente commits locais, sem CI/push/deploy.

### P1 M38c4a / A1 — leitura lógica da análise de lore

[Plano 94](94-leitura-logica-da-analise-de-lore.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-leitura-logica-da-analise-de-lore.md):
54 Node e seis SDK positivos. Contexto lógico substitui stubs, com budgets,
origens nativas e reautorização após resposta/reutilização. Fonte não é
reescrita e recibos aplicados continuam metadata confirmável.

Próximo A2: preparar/adotar lote multi-item com crédito/recibo atômicos.
Writer payload ainda é recusado explicitamente, sem campos inline misturados.
Demais consumidores/backup/cliente e M38c/P1/F2-09/V2 permanecem abertos.
Validate integral no fim de P1; somente commits locais, sem CI/push/deploy.

### P1 M38c4b / A2a — adoção conjunta das gerações de lore

[Plano 95](95-adocao-conjunta-das-geracoes-de-lore.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-adocao-conjunta-das-geracoes-de-lore.md):
37 novos Node, 206 regressões Node e quatro casos SDK distintos positivos.
Lote de até 50 fichas adota cabeças/gerações/recibos/criadores com um clock;
prova conjunta nativa confirma metadata após GC/retirada/exclusão.
Rejeição aguarda leituras irmãs; retomada SDK dos dois afetados foi positiva.

Próximos A2b/A2c: preparação/inventário/cancelamento e ligação real do lote
local/global/novo com crédito/recibo. applyLoreAnalysis ainda recusa payload.
Demais integrações e P1/F2-09/V2 seguem abertos. Validate integral no fim
de P1; somente commits locais, sem CI/push/deploy.

### P1 M38c4c / A2b1 — reserva nativa do lote da análise

[Plano 96](96-reserva-nativa-do-lote-da-analise.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-reserva-nativa-do-lote-da-analise.md):
220 casos Node distintos e três SDK positivos em rodadas dirigidas.
Manifesto metadata de até 50 alvos fixa origens/provedor/IDs/hash antes de
produtores; get/retry e cancel-before-start preservam provas. Exclusão fecha
reservas sem filhos antes de edições. Filho encontrado exige reconciliação.

Próximo A2b2: produtores e cleanup ligados ao pai na mesma transação.
A2c deve confirmar locais/globais/novos com crédito/recibo reais; demais
integrações e P1/F2-09/V2 continuam abertos. Validate integral no fim de P1.
Somente commits locais, sem CI/push/deploy.

### P1 M38c4d / A2b2 — preparação vinculada do lote da análise

[Plano 97](97-preparacao-vinculada-do-lote-da-analise.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-preparacao-vinculada-do-lote-da-analise.md):
454 Node distintos e três SDK positivos. Workflow prepara até ready com
reautorização, filhos e checkpoints nativamente vinculados, sem aplicar ou
cobrar. Cancelamento fecha o pai e limpa após revogação; exclusão coordena
as unidades. Guards singulares impedem bypass e adoção individual.

Próximo A2c: prontidão/origem e aplicação integral local/global/nova junto
de crédito/recibo reais. Demais integrações e P1/F2-09/V2 seguem abertos.
Validate integral no fim de P1; somente commits locais, sem CI/push/deploy.

### P1 M38c4e / A2c — aplicação integral do lote preparado

[Plano 98](98-aplicacao-integral-da-analise-preparada.md) e
[ADR 0113](../../../decisions/0113-atomic-prepared-lore-analysis-application.md):
ready integra locais/globais/novos, débito único e recibo permanente no mesmo
commit. Grant agregado exato mantém singular/produção bloqueados; metadata
confirma após limpeza sem nova cobrança. Preparação/cancelamento bloqueiam
fallback legado, cujos recibos originais continuam confirmáveis.

47 casos Node novos distintos, 201 regressões relacionadas e cinco casos SDK
distintos positivos em rodadas dirigidas; confira a
[evidência](../../../entregas/2026-10-24-writer-v2-aplicacao-atomica-da-analise-preparada.md).
Cliente/endpoints de preparo/recuperação, demais writers/consumidores/backup,
rollout, P1/F2-09/V2 e condições humanas/comerciais continuam pendentes.
Validate integral no fim de P1; somente commits locais, sem CI/push/deploy.

### P1 M38c5a — diff e transporte literal do cliente de lore

[Plano 99](99-diff-e-transporte-dos-campos-de-lore.md),
[ADR 0114](../../../decisions/0114-literal-book-lore-client-edits.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-diff-e-transporte-do-lore.md):
175 casos Vitest distintos e cinco smokes Chromium positivos. Captura C1
preserva CAS/dados brutos; diff envia somente campos/páginas alterados.
Codec de duas passagens produz partes de 64 KiB, SHA/Merkle/IDs iguais ao
servidor, sem teto de 128 partes e com cancelamento por unidade.

Roundtrip real de serviços preserva corpo intocado de 9 MiB e recusa CAS
antigo/revogação. Não habilita UI ou escritor SDK legado para payloads.
Host/orquestração/recuperação, demais consumidores/backup/ativação/rollout,
P1/F2-09/V2 e aceites humanos/comerciais continuam abertos.
Validate integral no fim de P1; somente commits locais, sem CI/push/deploy.

### P1 M38c5b — coordenação da edição preparada de lore

[Plano 100](100-coordenacao-da-edicao-preparada-de-lore.md),
[ADR 0115](../../../decisions/0115-unit-coordination-of-book-lore-edits.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-coordenacao-da-edicao-de-lore.md):
47 novos e 18 regressões Vitest distintos positivos, três smokes Chromium.
Operação por unidade preserva pedido/CAS/bytes após resposta perdida,
ready sem adoção, apply explícito e cleanup independente de RPC pendente.
Status limitado e controles paginados evitam copiar lista por parte.

Em memória, writeId exclusivo por intenção; não recupera após recarga.
Host/UI/endpoints/recuperação, demais integrações/backup/ativação/rollout,
P1/F2-09/V2 e condições humanas/comerciais seguem abertos.
Validate integral no fim de P1; só commits locais.

### P1 M38c5c — transporte autenticado da edição manual

[Plano 101](101-transporte-autenticado-da-edicao-de-lore.md),
[ADR 0116](../../../decisions/0116-authenticated-manual-lore-edit-transport.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-transporte-autenticado-da-edicao-de-lore.md):
59 Vitest, 17 Node distintos e três smokes Chromium positivos em rodadas.
Callable bookLoreEdit fecha operações/IDs manuais, usa UID autenticado e
preserva input literal. Sessão SDK captura conta/contexto sem fallback.
Middleware exportado recusa App Check ausente/inválido e serve preflight.

SDK real em HTTP local usa Auth fixa/double; não certifica tokens reais.
Host visual/recuperação, demais integrações/backup/ativação/rollout e
P1/F2-09/V2 continuam abertos. Validate no fim de P1; só commits locais.

### P1 M38c5d — reserva e chave protegida da recuperação de lore

[Plano 102](102-reserva-e-chave-da-recuperacao-do-lore.md),
[ADR 0117](../../../decisions/0117-private-lore-edit-recovery-keys.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-chave-protegida-da-recuperacao-do-lore.md):
37 Node e três SDK distintos positivos em rodadas. Reserva/prova/chave
originais, metadata sem prosa, reautorização da mesma encarnação e revogação/
fence permanentes. Key só HTTP com Auth/App Check; namespace SDK negado.

Operador aprovou cópia cifrada no dispositivo, ainda não implementada:
journal por partes/retomada/host e ciclo de vida integrado seguem necessários.
Revogar chave não cancela jobs ou autoriza descartar controles incertos.
Demais integrações/backup/ativação/rollout e P1/F2-09/V2 continuam abertos.
Validate no fim de P1; sem CI/push/deploy.

### P1 M38c5e — journal cifrado e recuperação literal

[Plano 103](103-journal-cifrado-das-edicoes-de-lore.md),
[ADR 0118](../../../decisions/0118-partitioned-local-lore-edit-journal.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-journal-cifrado-das-edicoes-de-lore.md):
51 Vitest distintos e quatro cenários Chromium positivos. Journal por partes
cifradas, grant fresco, CAS/oncomplete, descoberta por conta, rascunho literal,
pedido exato/replay e metadata de cleanup/diagnóstico sem chave implementados.
Recuperar todas as partes com último selo abortado exige validar e confirmar
localmente antes de expor; abrir não envia.

Próximo incremento obrigatório: checkpoints/restauração do coordenador completo,
controles de todos os jobs e composição com reserva/host. Fechamento nativo antes
de coleta local e ciclo de vida da chave na exclusão continuam pendentes.
API ainda não integrada à edição visual. Demais integrações/backup/ativação/
rollout e P1/F2-09/V2 abertos; validate no fim de P1. Só commit local.

### P1 M38c5f — checkpoints e reconstrução do coordenador

[Plano 104](104-checkpoints-restauraveis-da-edicao-de-lore.md),
[ADR 0119](../../../decisions/0119-restorable-manual-lore-edit-checkpoints.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-checkpoints-restauraveis-da-edicao-de-lore.md):
143 Vitest distintos e dois cenários Chromium positivos em rodadas. Coordenador
pode ser reconstruído do input/checkpoint privados e controles paginados,
com cursores e pedidos exatos, sem RPC inicial. Sessão Auth protege restore.
Snapshot continua sem bytes; checkpoint com wire exige cifragem.

Próximo: composição da persistência cifrada/atômica de root/páginas e controles
metadata de todos os jobs, inclusive cleanup sem chave, com reserva/host.
Checkpoints ainda não são automaticamente guardados pelo journal. Fechamento
nativo antes de coleta, ciclo de vida da chave na exclusão e demais integrações/
backup/ativação/rollout permanecem pendentes. P1/F2-09/V2 abertos; validate no
fim de P1. Só commit local, sem CI/push/deploy.

### P1 M38c5g — persistência cifrada dos checkpoints

[Plano 105](105-persistencia-cifrada-dos-checkpoints-de-lore.md),
[ADR 0120](../../../decisions/0120-encrypted-persistence-of-lore-checkpoints.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-persistencia-cifrada-dos-checkpoints-de-lore.md):
50 Vitest distintos e dois cenários Chromium positivos. Captura privada,
gerações/partes cifradas, troca+acks atômicos, recuperação da falha final,
coleta limitada e reconstrução somente do storage protegido implementados.

Próximo: composição automática de write-ahead/acks e mapa metadata de todos
os jobs para cleanup sem chave, com reserva/sessão/host. Coleta local não
fecha jobs nativos; ciclo de vida da chave, demais writers/consumidores/
backup/ativação/rollout e P1/F2-09/V2 continuam necessários. Validate no fim
de P1; somente commit local, sem CI/push/deploy.

### P1 M38c5h — controles completos e cancelamento sem chave

[Plano 106](106-controles-e-cancelamento-de-lore-sem-chave.md),
[ADR 0121](../../../decisions/0121-keyless-cleanup-of-manual-lore-edits.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-controles-e-cancelamento-de-lore-sem-chave.md):
114 Vitest distintos e dois cenários Chromium positivos em rodadas. Mapa de
todos os IDs/hashes, referências fechadas de pai/filhos, worker metadata por
passo, replay/ACK, conta/contexto e reconhecimento de adoção implementados.
Sem chave/decrypt, preservando draft, produtor incerto, corpos ativos e recibos.

Próximo: compor write-ahead/acks automáticos com reserva/journal/coordenador/
sessão/host. Legado sem mapa não é automaticamente recuperável. Descarte/ciclo
de vida da chave, demais writers/consumidores/backup/ativação/rollout e
P1/F2-09/V2 continuam pendentes. Validate no fim de P1; só commit local.

### P1 M38c5i — coordenação persistida da edição manual

[Plano 107](107-coordenador-persistido-da-edicao-de-lore.md),
[ADR 0122](../../../decisions/0122-persisted-coordination-of-manual-lore-edits.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-coordenador-persistido-da-edicao-de-lore.md):
mapa/draft/baseline automáticos, checkpoint antes do envio, ponte metadata
do resultado e ACK/swap/receipt atômicos; retomada e dívida local preservadas.
Cancel em voo/sem chave e prefixos/cópia idempotente corrompidos cobertos.

Próximo: bootstrap da reserva/chave e host visual, com fechamento antes de
descarte e ciclo de vida integrado. Demais writers/consumidores/backup/
ativação/rollout e P1/F2-09/V2 continuam abertos; validate no fechamento de P1.
Sem CI/push/deploy.

### P1 M38c5j — reserva descobrível e encerramento explícito

[Plano 108](108-reserva-descobrivel-e-encerramento-da-edicao-de-lore.md),
[ADR 0123](../../../decisions/0123-discoverable-lore-recovery-reservations.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-reserva-descobrivel-da-edicao-de-lore.md):
reserva/journal/controller compostos pela sessão Auth, ticket durável antes de
RPC, replay exato e descoberta por conta. Migração aditiva IDB v2 preserva
cópias v1. Cancel conserva chave; releaseRecovery fecha jobs antes de revogar.
208 Vitest distintos em rodadas e três cenários Chromium positivos.

Próximo: host visual e purga local com fence de escritas antigas. Exclusão
integrada da chave no livro, demais writers/Rules/drenagem/consumidores/
backup/ativação/rollout e P1/F2-09/V2 continuam abertos. Validate no fim de P1;
somente commits locais, sem CI/push/deploy.

### P1 M38c5k — interface literal e descarte da recuperação

[Plano 109](109-interface-e-descarte-da-edicao-manual-de-lore.md),
[ADR 0124](../../../decisions/0124-literal-lore-editor-and-local-discard.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-interface-e-descarte-do-lore.md):
host e lista exportados, campos brutos/tocados, revisão/apply, retomada,
cancel e confirmação de descarte. Purga limitada/provada, fence e tombstone
atômicos; mantém original, corpos adotados e outras operações.
241 Vitest distintos em rodadas e três jornadas Chromium com temas/mobile.

Próximo: writers Admin/Rules/drenagem coordenados e depois ativar a entrada
no compêndio. Ciclo da chave na exclusão do livro, consumidores/backup/
ativação/rollout e P1/F2-09/V2, fases 3–5 e gates humanos/comerciais continuam
abertos. Validate no fechamento de P1; somente commits locais.

### P1 M38c5l — barreira dos escritores legados de lore

[Plano 110](110-coordenacao-dos-escritores-legados-de-lore.md),
[ADR 0125](../../../decisions/0125-legacy-lore-writer-barrier.md) e
[entrega](../../../entregas/2026-10-24-writer-v2-barreira-dos-escritores-legados-de-lore.md).
hasLoreResources controlado pelo servidor bloqueia mutações antigas inclusive
em fichas inline irmãs, pelo SDK/serviço e aplicação Admin legada da análise.
Recibos, leitura, legado false/ausente e rota nativa preparada preservados.
155 testes distintos positivos (24 novos): 97 Node, 43 Vitest e 15 SDK/Rules;
tipos, lint e sintaxe de 248 módulos positivos. Matriz de writers no plano 81.

Barreira preparada, sem drenagem real ou deploy isolado. Próximos passos
continuam a integração dos caminhos nativos de criação/exclusão/recuperação,
demais writers/consumidores e somente depois a entrada no compêndio.
P1/F2-09/V2, fases 3–5, exclusão de chaves e gates humanos/comerciais abertos.
Validate no fechamento de P1; servidor local mantido e nenhum envio remoto.

### P1 M38c5m — transporte e recuperação da criação de lore

[Plano 111](111-transporte-e-recuperacao-da-criacao-de-lore.md),
[ADR 0126](../../../decisions/0126-manual-lore-creation-recovery-origin.md) e
[entrega](../../../entregas/2026-10-24-writer-v2-transporte-e-recuperacao-da-criacao-de-lore.md).
Servidor oferece reserva/get/cancel/cleanup da criação na callable existente.
Chave protege draft antes da cabeça, conserva recuperação após cancel sem
liberar upload e exige a cabeça original após adoção. Hashes antigos preservados;
journal continua com seus 18 métodos, separados dos 22 do transporte manual.

143 testes distintos positivos (32 novos): 82 Node, 56 Vitest e cinco SDK,
com controles de origem/recriação/escopo, AES-GCM e upload pós-cancel recusado.
Lint/typecheck/sintaxe dirigida positivos. Sem ativar entrada no compêndio.

Próximo: coordenador e ticket duráveis da criação no cliente, junto da recuperação
cifrada; criação/exclusão e demais portões antes da entrada no compêndio.
Lifecycle de chaves, outros writers/consumidores/backup/rollout, P1/F2-09/V2,
fases 3–5 e condições humanas/comerciais abertos. Sem CI ou envio remoto.

### P1 M38c5n — coordenador cliente da criação de lore

[Plano 112](112-coordenador-cliente-da-criacao-de-lore.md),
[ADR 0127](../../../decisions/0127-client-native-lore-creation-coordinator.md) e
[entrega](../../../entregas/2026-10-24-writer-v2-coordenador-cliente-da-criacao-de-lore.md).
Coordenador percorre reserva/uploads/composição e apply explícito, repete wire
incerto e cancela sem esperar produtor. Checkpoint privado restaurável e controles
até 50; sessão Auth protege I/O e leitura privada por actor/host capturados.
Adoção estrangeira preserva conflito/cópia, sem sucesso próprio ou purge.

209 Vitest distintos positivos (50 novos), com >8 MiB/128 partes e 3.265 relações;
tipos/build/smoke e lint dirigidos verdes. Sem UI, backend ou Rules alterados.

Próximo: ticket e cópia cifrada/checkpoint persistidos da criação, reserva
incerta, cancel/descarte por metadata e depois host. Não confundir memória com
recuperação durável. Exclusão/lifecycle/consumidores/backup/rollout, P1/F2-09/V2,
fases 3–5 e gates humanos/comerciais continuam abertos; somente commits locais.

### P1 M38c5o — preparação e cópia protegida da criação

[Plano 113](113-preparacao-e-copia-protegida-da-criacao-de-lore.md),
[ADR 0128](../../../decisions/0128-protected-lore-creation-preparation.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-preparacao-protegida-da-criacao-de-lore.md).
Ticket antes de RPC, reserva incerta, draft imutável cifrado e cancel/release/
purge independentes. IDB v3 preserva edição v2; sessão Auth captura actor/host.

221 Vitest distintos positivos (38 novos), quatro jornadas Chromium com
reinícios/migração/>9 MiB/purge, build/smoke e lint/arquitetura positivos.
Bootstrap não oferece advance/apply: próximo é write-ahead privado do coordenador,
controles e ponte de resultado, antes do host. Exclusão/lifecycle, demais
writers/consumidores/backup/rollout e validate de P1 continuam necessários.
P1/F2-09/V2, fases 3–5 e gates humanos/comerciais abertos; somente commits locais.

### P1 M38c5p — checkpoint protegido da criação

[Plano 114](114-checkpoint-protegido-da-criacao-de-lore.md),
[ADR 0129](../../../decisions/0129-protected-lore-creation-checkpoints.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-checkpoint-protegido-da-criacao-de-lore.md).
Preparação oferece checkpointJournal: cifra, páginas até 50, ponte metadata,
swap/ACK atômicos e coleta/purge das gerações próprias. Preserva edição e
tickets v3 anteriores; não envia RPC de edição ao reconstruir.

250 Vitest distintos em rodadas (29 novos), quatro jornadas Chromium com
reinícios/prefixo em AES e build/tipos/smoke positivos. Próximo: compor executor
durável advance/apply, dívida local e adoção própria no cancel/encerramento,
antes do host. Lifecycle/exclusão/consumidores/backup/rollout e validate de P1
continuam necessários. P1/F2-09/V2/fases 3–5 e gates humanos/comerciais abertos;
sem CI ou envio remoto.

### P1 M38c5q — executor durável da criação

[Plano 115](115-executor-duravel-da-criacao-de-lore.md),
[ADR 0130](../../../decisions/0130-durable-lore-creation-executor.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-executor-duravel-da-criacao-de-lore.md).
Sessão oferece createLore/resumeLoreCreation com write-ahead/dívida/ponte,
ready sem cabeça, apply explícito e confirmação nativa por metadata. OwnApply
vincula wire cifrado a pai/edição/hash/token/geração/evento originais; permite
release/discard da recuperação aplicada sem remover cabeça/geração.

274 Vitest distintos positivos em rodadas, em 12 arquivos (24 novos), retake
final de quatro casos afetados, cinco jornadas Chromium e tipos/build/smoke verdes.
Próximo: host de criação, exclusão nativa do cliente e entrada coordenada no
compêndio. Lifecycle/consumidores/backup/rollout/validate de P1 continuam
necessários. P1/F2-09/V2/fases 3–5 e gates humanos/comerciais abertos; sem remoto.

### P1 M38c5r — interface da criação protegida

[Plano 116](116-interface-da-criacao-protegida-de-lore.md),
[ADR 0131](../../../decisions/0131-protected-lore-creation-ui.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-interface-da-criacao-protegida-de-lore.md).
Host/lista exportados, campos literais, preparar/revisar/criar explícito,
retomada por conta/livro e cancel/discard independentes, com foco/navegação.
Criação reaproveitada de cancel usa novo ID por ação própria.

77 Vitest distintos positivos em rodadas (21 novos), três jornadas Chromium com reinício e espera,
três temas/mobile inspecionados e tipos/build/smoke/styleguide verdes.
Próximo: exclusão nativa do cliente e integração coordenada no compêndio.
Lifecycle/consumidores/backup/rollout/validate de P1 continuam necessários.
P1/F2-09/V2/fases 3–5/gates humanos/comerciais abertos; somente commits locais.

### P1 M38c5s — transporte autenticado da retirada

[Plano 117](117-transporte-autenticado-da-retirada-de-lore.md),
[ADR 0132](../../../decisions/0132-authenticated-lore-removal-transport.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-transporte-da-retirada-de-lore.md).
Endpoint próprio com sete métodos e namespaces separados. Sessão Auth congela
wire e consulta metadata sem prosa/retry; allowlists antigas preservadas.

168 casos distintos positivos, 27 novos, incluindo dois SDK em emulador.
Tipos/build/smoke/lint positivos. Próximo: journal/executor recuperável da
retirada, confirmação visual e compêndio. Lifecycle/consumidores/backup/
rollout/validate de P1 ainda necessários. P1/F2-09/V2/fases 3–5 e gates
humanos/comerciais abertos; somente commit local, sem CI/remoto.

### P1 M38c5t — retirada recuperável de lore

[Plano 118](118-retirada-recuperavel-de-lore.md),
[ADR 0133](../../../decisions/0133-recoverable-lore-removal.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-retirada-recuperavel-de-lore.md).
Journal metadata próprio e executor na sessão Auth preservam wire/CAS/
oncomplete, apply explícito, cancel independente, dívida e handoff.
Reabrir não envia RPC; start incerto só consulta em advance.

43 Vitest distintos positivos (30 novos), três jornadas Chromium reais de
persistência/concorrência e tipos/build/smoke/lint positivos. Próximo: host
visual de retirada/retomada e composição no compêndio. Lifecycle/consumidores/
backup/rollout/validate de P1 e demais fases/gates continuam abertos.
Somente commit local; sem CI/envio remoto/deploy.

### P1 M38c5u — interface da retirada recuperável

[Plano 119](119-interface-da-retirada-recuperavel-de-lore.md),
[ADR 0134](../../../decisions/0134-recoverable-lore-removal-ui.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-interface-da-retirada-recuperavel-de-lore.md).
Host/lista exportados usam origem C1 fixa, confirmação explícita, dívida,
prova própria e cancel com handle fresco independente da RPC antiga.

67 Vitest distintos positivos (24 novos), quatro jornadas Chromium, três
temas/mobile/foco e tipos/build/smoke/lint positivos. Próximo: composição no
compêndio com criação/edição/retirada e ações em lote nativas; preservar lote
e revisar origem antes de aplicar. Lifecycle/consumidores/backup/rollout/
validate de P1 e demais fases/gates abertos. Somente commit local, sem remoto.

### P1 M38c5v — retirada conjunta de lore

[Plano 120](120-retirada-conjunta-de-lore.md),
[ADR 0135](../../../decisions/0135-atomic-lore-removal-batches.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-retirada-conjunta-de-lore.md).
Primitiva interna retira unidade de até 50 na mesma transação, com frame único,
origem preservada e prova nativa conjunta. Singular mantém seu formato.

103 casos distintos positivos em rodadas (24 novos), incluindo cinco SDK
distintos e unidade de 50 no emulador. Lint/sintaxe positivos. Ainda compor
seleção completa/orçamento/transporte/recuperação/UI, sem converter o limite
da unidade em cap de seleção ou renovar fontes cegamente entre unidades.
Compêndio/lifecycle/consumidores/backup/rollout/validate e demais fases/gates
abertos. Somente commit local; sem CI/envio remoto/deploy.

### P1 M38c5w — origem independente por ficha de lore

[Plano 121](121-origem-independente-por-ficha-de-lore.md),
[ADR 0136](../../../decisions/0136-independent-book-lore-source-tokens.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-origem-independente-de-lore.md).
Token v2 opcional conserva origem individual nativa ao alterar outras fichas;
v1/journals/pedidos permanecem, sem promoção ou rebase. Lista continua global.

601 casos distintos positivos em rodadas (38 novos), incluindo três SDK,
53 origens e preparação/adoção/recuperação nativas. Tipos/build/smoke/lint/
sintaxe positivos. Próximo: coordenar seleção durável com origens v2 explícitas,
progresso/conflitos e UI, preservando prova própria/atomicidade quando aplicável.
Compêndio/lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/
gates permanecem abertos. Somente commit local; sem CI/remoto/deploy.

### P1 M38c5x — seleção durável para retirada

[Plano 122](122-selecao-duravel-para-retirada-de-lore.md),
[ADR 0137](../../../decisions/0137-durable-book-lore-removal-selection.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-selecao-duravel-de-retirada-de-lore.md).
Seleção inteira em páginas metadata, sem cap de autoria, com executor que
compõe filhos e suas provas. Apply/retry/cancel/ACK e reconciliação preservam
intenção original e progresso parcial; não inferem grupo atômico ou cleanup.

70 Vitest (31 novos) e quatro jornadas Chromium positivos, incluindo 53
membros/reinício, duas abas e journal filho perdido. Tipos/build/smoke/lint
positivos. Próximo: interface da seleção/retomada, visibilidade nativa e
composição final do compêndio; recursos existentes permanecem obrigatórios.
Lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates
abertos. Somente commit local; sem CI/remoto/deploy.

### P1 M38c5y — interface da retirada de seleção

[Plano 123](123-interface-da-retirada-de-selecao.md),
[ADR 0138](../../../decisions/0138-book-lore-removal-selection-ui.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-interface-da-retirada-de-selecao.md).
Diálogo/lista exportados, revisão C1 v2 e confirmação separadas, nomes só em
RAM, cancel independente e callback por IDs comprovados. Nenhuma montagem.

65 Vitest positivos (34 novos), quatro jornadas Chromium e retake de teclado,
três temas/mobile/foco e tipos/build/smoke/lint/styleguide positivos.
Próximo: visibilidade nativa em lote e composição final do compêndio com
todas as ações preservadas. Lifecycle/consumidores/backup/rollout/validate
de P1 e demais fases/gates abertos. Somente commit local, sem CI/remoto/deploy.

### P1 M38c5z — prova histórica de edição manual

[Plano 124](124-consulta-do-aceite-original-da-edicao.md),
[ADR 0139](../../../decisions/0139-book-lore-edit-original-outcome.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-consulta-do-aceite-original.md).
Consulta de metadata confirma o efeito original sem reenviar apply,
abrir prosa ou depender da cabeça atual; escopo/UID/nascimentos e tokens
fixados conferidos. Sessão Auth e contratos cifrados anteriores preservados.

147 testes dirigidos positivos (66 novos), com três SDK Firestore reais.
Próximo: seleção/retomada de visibilidade e composição do compêndio.
Lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates
abertos. Somente commit local, sem CI/remoto/deploy.

### P1 M38c6a — pontos de controle da visibilidade

[Plano 125](125-visibilidade-duravel-da-selecao-de-lore.md), marco A,
[ADR 0140](../../../decisions/0140-lore-manual-unit-gate-and-local-flush.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-controle-de-unidades-da-visibilidade.md).
Gate metadata antes da RPC e flushLocal sem dirigir produção implementados.
155 casos distintos positivos, dez novos; lint/tipos/build/smoke positivos.
Não conclui visibilidade: manifesto/ledger/executor, revisão/retomada/UI e
composição do compêndio seguem necessários. Lifecycle/consumidores/backup/
rollout/validate de P1 e demais fases/gates abertos. Somente commit local.

### P1 M38c6b — seleção de visibilidade durável

[Plano 125](125-visibilidade-duravel-da-selecao-de-lore.md), marco B,
[ADR 0141](../../../decisions/0141-durable-book-lore-visibility-selection.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-executor-da-selecao-de-visibilidade.md).
Manifesto/ledger/executor e sessão Auth exportados; bool desejado e origens fixos,
sem cap de seleção, provas originais, retry explícito, no-op distinto e cancel
metadata independente. Respostas tardias isoladas por membro/geração.

98 casos dirigidos e nove jornadas Chromium positivos, com tipos/lint/build/
smoke positivos. Revisão/UI/retomada e compêndio ainda pendentes; não encerra
plano 125. Lifecycle/consumidores/backup/rollout/validate de P1 e fases/gates abertos.
Sem CI/envio remoto/deploy; somente commit local.

### P1 M38c6c — revisão e UI da visibilidade

[Plano 125](125-visibilidade-duravel-da-selecao-de-lore.md), marco C,
[ADR 0142](../../../decisions/0142-book-lore-visibility-selection-ui.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-interface-da-selecao-de-visibilidade.md).
Revisão C1/v2 e diálogo/lista exportados, bool original, confirmação distinta,
retry só da ficha revisada, cancel independente e resultado aplicado/unchanged.
Filhos preservados fora da lista manual isolada.

87 Vitest e quatro jornadas Chromium positivos; três temas/mobile/teclado/foco,
tipos/lint/bundle/smoke/styleguide positivos. Etapa 4 implementada; montagem
coordenada do compêndio e demais lifecycle/consumidores/backup/rollout/validate
de P1 e fases/gates ainda necessários. Somente commit local; sem CI/remoto/deploy.

### P1 M38c6d — compêndio nativo em BookPage/LorePage

[Plano 125](125-visibilidade-duravel-da-selecao-de-lore.md), marco D,
[ADR 0143](../../../decisions/0143-native-book-compendium-composition.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-compendio-nativo-dos-livros.md).
Leitura C1/v2 com tokens brutos, ficha reautorizada, hosts protegidos e cinco
retomadas montados. Busca/grid/lista/seleção/portal e universos preservados;
callback relê valores atuais. 115 casos dirigidos e 18 Chromium positivos,
três temas/320px/foco, tipos/lint/build2976/smoke e checks locais positivos.

Plano 125 não concluído: faltam lateral do editor, menções e revisão assistida
antes da migração/drain de todos os writers. Lifecycle/consumidores/backup/
restauração/rollout/validate de P1 e fases/gates seguem no objetivo.
Somente commit local; sem CI/envio remoto/deploy.

### P1 M38c6e — lore nativo na lateral e menções

[Plano 125](125-visibilidade-duravel-da-selecao-de-lore.md), marco E e
[ADR 0144](../../../decisions/0144-native-editor-book-lore-authoring.md).
Criação/edição/leitura e cinco retomadas locais pela interface pública do lore,
com nome/alvo originais e volta ao manuscrito. EditorPage somente relê após prova;
callbacks antigos atendem o universo. C1/v2 compartilhado entre modal e inline.

A etapa 5 de composição manual está implementada localmente. A pendência anterior
de revisão assistida foi corrigida pelo inventário: o formulário edita a proposta
em RAM antes da criação atômica, sem writer manual de ficha existente.
Lifecycle, demais produtores/consumidores, backup/restauração, drain/rollout/
validate de P1 e fases/gates humanos/comerciais seguem abertos.
Somente commit local, sem CI/envio remoto/deploy.

[Evidência M38c6e](../../../entregas/2026-10-25-writer-v2-lore-nativo-na-lateral-do-editor.md):
124 casos dirigidos distintos e 30 jornadas Chromium distintas positivos;
build2979 e checks locais positivos. Retomada após recarga conferida nos seis projetos.

### P1 M38c7 — chaves na exclusão do livro

[Plano 126](126-ciclo-das-chaves-na-exclusao-do-livro.md),
[ADR 0145](../../../decisions/0145-book-lore-recovery-key-deletion.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-chaves-de-lore-na-exclusao-do-livro.md).
Inventário privado da chave, revogação coordenada por unidade e migração v1/v2;
controladores avançados/completos não pulam chaves com raiz ainda existente.
Índice órfão/tardio/recriado bloqueia; recibos/metadata preservados.

85 Node distintos e 12 SDK positivos; sintaxe258/lint/arquitetura/checks locais.
Auditoria das chaves históricas de livros já apagados, demais namespaces,
escritores/consumidores, backup/restauração, drain/rollout/validate de P1 e
fases/gates humanos/comerciais seguem no objetivo. Sem CI/envio remoto/deploy.

### P1 M38c8 — auditoria das chaves históricas

[Plano 127](127-auditoria-das-chaves-historicas-de-lore.md),
[ADR 0146](../../../decisions/0146-historical-lore-recovery-key-audit.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-auditoria-das-chaves-historicas.md).
Serviço/CLI de leitura padrão, relatório paginado e revogação por revisão fixa,
com ausência do livro/marcador/provas reconferidos. Chaves recriadas e dados
sem evidência ficam preservados, sem certificado de inventário global.

45 Node e quatro SDK positivos, incluindo executável real no emulador;
sintaxe259/CLI e checks locais positivos. Ferramenta implementada; nenhuma conta
de produção auditada. Operação real e reconciliação, demais namespaces/
consumidores/backup/restauração/rollout/drain/validate de P1 e fases/gates
continuam necessários. Somente commit local, sem CI/push/PR/merge/deploy.

### P1 M38c9 A — projeção seletiva para contextos

[Plano 128](128-projecao-logica-do-lore-para-contextos.md),
[ADR 0147](../../../decisions/0147-selective-book-lore-context-projection.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-projecao-seletiva-do-lore.md).
Leitor C1 autorizado, projeções RAM limitadas, base em fluxo e v2 seletivo.
156 Node e quatro SDK positivos. Não integra chat; marco B é o próximo passo.
Demais consumidores/backup/restauração/rollout/drain/validate de P1, fases/gates
humanos e comerciais continuam necessários. Somente commit local.

### P1 M38c9 B — lore lógico no contexto do chat

[Plano 128](128-projecao-logica-do-lore-para-contextos.md) concluído localmente;
[ADR 0148](../../../decisions/0148-logical-lore-in-editor-chat-context.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-lore-nativo-no-contexto-do-chat.md).
Página/snapshot lógicos e budget por avanço; história por origem sem corpo de
lore. 99 Node e sete cenários SDK distintos positivos (dois retakes de fixtures).
Demais consumidores da etapa 4, namespaces/escritores, backup/restauração,
drain/rollout/validate de P1 e fases/gates permanecem necessários. Sem remoto.

### P1 M38c10 — lore nas referências de cenas e planejamento

[Plano 129](129-lore-logico-nas-referencias-de-cenas-e-planejamento.md),
[ADR 0149](../../../decisions/0149-native-book-lore-references.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-lore-nativo-nas-referencias.md).
Origem C1 sem chunks para vínculo/índices e labels seletivos completos nas listas;
cursores observam relógio/nascimento nativos. 60 Node e oito SDK positivos.
Plano concluído localmente. Publicação/campanhas/demais consumidores, inventário,
backup/restauração/drain/rollout/validate de P1 e fases/gates seguem necessários.

### P1 M38c11 A — publicação com lore nativo

[Plano 130](130-publicacao-com-lore-nativo.md),
[ADR 0150](../../../decisions/0150-native-book-publication.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-a.md).
Captura C1/metadata, cópia local e ativação no servidor, consentimento/prova e
barreiras SDK. 36 Node, 135 Vitest e 19 SDK positivos; tipos/build/smoke/checks.
Plano **aberto**: marco B deve preparar bases acima do orçamento por unidades e
copiar ranges certificados. Não fecha etapa 4/P1/V2. Demais inventários/
consumidores/backup/restauração/drain/rollout/validate e fases/gates continuam.

### P1 M38c11 B — publicação certificada por unidades

[Plano 130](130-publicacao-com-lore-nativo.md) implementado e validado localmente:
inspeção com candidato público fechado, hash/contexto nativo e cópia sem chunks.
Base/override >32 MiB, retomada/recibos/fence/cancelamento/exclusão conferidos;
nenhum namespace novo. 139 Node distintos, 98 Vitest e cinco SDK positivos;
tipos/build/smoke/checks. [Evidência B](../../../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-b.md).

Próximo passo de P1: inventariar os consumidores restantes da etapa 4 e os
namespaces/escritores/exclusão, sem expandir captura de campanhas para livros.
Backup/restauração/drain/rollout/validate de P1 e fases 3–5/gates permanecem.
Sem envio remoto/deploy; master e servidor preservados.

### P1 M38c12 A — núcleo do backup lógico indexado

[Plano 131](131-backup-logico-indexado-do-lore.md) aberto: fonte física e limite
8 MiB/recomposição dos validadores ainda precisam de integração B–D.
Núcleo puro do objeto data validado em unidades, sem prosa/lista no estado;
modo portátil de relações separado das páginas nativas. 335 Node distintos,
três jornadas Chromium e bundle browser/declaração TS positivos.
[ADR 0151](../../../decisions/0151-incremental-portable-lore-index.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-indice-portatil-do-lore.md).

Próximo passo é B: fonte lógica autorizada e índice de saída com custo linear,
sem usar esse parser como grant ou habilitar captura/restauração parcial.
Inventário geral/escritores/exclusão, backup/restauração/drain/rollout/validate
integral de P1, fases 3–5 e gates continuam. Somente commits locais.

### P1 M38c12 B — composição portátil individual

[Plano 131](131-backup-logico-indexado-do-lore.md): B implementado/validado localmente.
C1 com clock de coleção, base em leitura única, overrides/datas/relações literais,
hashes/spans e consumidor aguardado por parte. Sem endpoint/job/namespace novo.
147 Node, 114 Vitest distintos, cinco SDK e três Chromium positivos; tipos/build/
smoke/checks. [Evidência B](../../../entregas/2026-10-25-writer-v2-composicao-portatil-do-lore.md).

Próximo passo C: ligar ao arquivo e à validação incremental local/servidor;
depois D: leitor verificado/remap/materialização grandes e roundtrip. O caminho
anterior de arquivo permanece; não usar B como autorização de ativação.
Inventários/legacy/drain/rollout/validate de P1, fases 3–5 e gates continuam.

### P1 M38c12 C1 — envelope e orçamento semântico

[Plano 131](131-backup-logico-indexado-do-lore.md): prefixo com consumed e até 64
referências; envelope fechado, data incremental, estado sem prosa/lista.
260 Node distintos, 26 Vitest do bridge e três Chromium positivos; bundle browser
e declarações TS. [Evidência C1](../../../entregas/2026-10-25-writer-v2-envelope-incremental-do-lore.md).

C2 deve ligar ContentMachine/validadores e ponteiros; C3 captura/selo; D leitor/
remap/materialização/roundtrip. Plano 131/P1/V2/fases/gates continuam abertos.

### P1 M38c12 C2 — validação local/servidor sem montar o lore

[Plano 131](131-backup-logico-indexado-do-lore.md): máquina semântica e ambos os
validadores integrados; ponteiro constante, um frame pendente, SHA/EOF/endereço
e até 64 referências por avanço. Provas/cleanup nativos e compatibilidade antiga.
232 Node, 13 Vitest, seis SDK distintos e três Chromium positivos; build/smoke.
[Evidência C2](../../../entregas/2026-10-25-writer-v2-validacao-incremental-do-lore.md).

C3 captura/selo, D leitura/remap/materialização grande e demais inventários/
roundtrip/drain/rollout/validate de P1/V2/fases/gates permanecem obrigatórios.

### P1 M38c12 C3 — captura C1, arquivo e selo

[Plano 131](131-backup-logico-indexado-do-lore.md): A/B/C implementados/validados.
Lore lógico no arquivo completo, loreDigest privado/final por metadata v1,
port/ator compartilhados e guarda até resposta após close. Stub físico recusado.
27 Node, 75 Vitest distintos, três SDK distintos, cinco Chromium e build/smoke
positivos. [Evidência C3](../../../entregas/2026-10-25-writer-v2-captura-logica-e-selo-do-backup.md).

Próximo D: leitor/remap/materialização grandes, incluindo crescimento após remap,
e roundtrip. Plano 131/P1/F2-09/V2, inventários/legacy/drain/rollout/validate e
demais fases/gates continuam abertos. Sem CI ou operação de produção.

### P1 M38c12 D1 — leitura autenticada por ranges

[Plano 131](131-backup-logico-indexado-do-lore.md): acesso direto às partes
validadas e leitor interno de campos/ranges em até 64 KiB com provas limitadas
por unidade. Ausências e API integral pequena preservadas. Arquivo capturado
de base/overrides confere hash completo do campo grande após validação servidor.
69 Node, 13 Vitest, três SDK distintos e três Chromium positivos; veja a
[evidência D1](../../../entregas/2026-10-25-writer-v2-leitura-indexada-do-lore-restaurado.md).

D2/D3 ainda devem remapear/medir/materializar e provar roundtrip. Plano 131/P1/
F2-09/V2, inventários/legacy/drain/rollout/validate e fases/gates continuam abertos.

### P1 M38c12 D2 — remap e medição incremental do lore

[Plano 131](131-backup-logico-indexado-do-lore.md): alvos remapeados por unidades
com precedência local qualificada e prosa literal. Campos medidos por SHA/bytes,
checkpoint limitado e provas nativas por avanço. Fonte <8 MiB cresce para >8 MiB
sem remontar a ficha. 255 Node distintos, 13 Vitest, dois SDK e três Chromium
positivos; veja a [evidência D2](../../../entregas/2026-10-25-writer-v2-remap-incremental-do-lore-restaurado.md).
D3 deve empacotar/materializar sob inventário e provar retomada/rollback/roundtrip.
Plano 131/P1/F2-09/V2, validate e fases/gates continuam abertos.

### P1 M38c12 D3 em andamento — gravador de corpos

[Plano 131](131-backup-logico-indexado-do-lore.md): núcleo de gravação por estágios,
inventário atual e partes finais imutáveis. Fronteira Structure → Resources usa
metadata para não montar lore grande. 84 Node distintos e três SDK positivos;
checks/limites na
[evidência](../../../entregas/2026-10-25-writer-v2-gravador-incremental-de-corpos-de-lore.md).
Geração completa/páginas/Resources/Counts/drenagem/roundtrip ainda obrigatórios;
núcleo não conclui D3/P1/F2-09/V2, validate ou fases/gates.

### P1 M38c12 D3 em andamento — geração indexada e Resources

[Plano 131](131-backup-logico-indexado-do-lore.md): advanceLore real integra
campos/páginas com datas lógicas originais e controles nativos; Resources usa
metadata. 365 Node distintos, 63 Vitest e quatro Chromium positivos, discriminados
com SDK na [evidência parcial](../../../entregas/2026-10-25-writer-v2-geracao-indexada-de-lore-restaurado.md).

Counts/drenagem/roundtrip e habilitação coordenada da opção interna continuam
obrigatórios. Sem raiz ativada; D3/P1/F2-09/V2, validate, fases/gates abertos.

### P1 M38c12 D3 em andamento — Counts indexado

[Plano 131](131-backup-logico-indexado-do-lore.md): comparação por campo/página,
bytes e SHA com até três partes nativas por transação, controle nativo limitado,
provas e compatibilidade anterior. 34 Node distintos positivos; SDK na
[evidência](../../../entregas/2026-10-25-writer-v2-reconciliacao-indexada-do-lore.md).
Drenagem/roundtrip/habilitação coordenada e demais P1/V2/fases/gates continuam.

### P1 M38c12 D3 em andamento — drenagem do staging

[Plano 131](131-backup-logico-indexado-do-lore.md): finish de Counts drena privados
por journals, confere metadata física e mantém saldo separado de cancelamento.
60 Node distintos positivos; SDK na
[evidência](../../../entregas/2026-10-25-writer-v2-drenagem-do-lore-restaurado.md).
Leitura preparada/recaptura/roundtrip, habilitação coordenada, host, inventários/
demais P1/V2/fases/gates e validate continuam obrigatórios.

### P1 M38c12 D3 em andamento — port preparado e recaptura

[Plano 131](131-backup-logico-indexado-do-lore.md): leitura interna autorizada por
job e provas originais, geração indexada também pequena, produtor portátil real,
arquivo mínimo selado e segunda restauração privada. 118 Node distintos, sete
Vitest, dois SDK e quatro Chromium positivos; detalhes na
[evidência](../../../entregas/2026-10-25-writer-v2-leitura-preparada-e-recaptura-do-lore.md).
Host/roundtrip integral/consumidores/inventários/legados/rollout/validate, demais
P1/V2/fases e gates continuam. Padrão de novas gerações permanece false.

## P1 — inventário final antes da ativação

[Plano 132](132-inventario-final-da-restauracao.md): schema13 congela escritores,
varre journals e 32 namespaces por páginas limitadas, autentica origens e exige
contagens exatas antes de activation-ready. Não cria raiz nem concede acesso.
35 Node distintos e dois SDK positivos; veja a
[evidência](../../../entregas/2026-10-25-writer-v2-inventario-final-da-restauracao.md).
Revisão/ativação/host/roundtrip integral e demais inventários/legados/rollout/
validate de P1, fases 3–5 e gates continuam pendentes.

### P1 — revisão antes da ativação (passo 1 do plano 133)

[Plano 133](133-revisao-e-ativacao-do-livro.md): revisão somente leitura da
preparação final, token de identidade, universo autorizado, verificação da capa
e reautorização após a espera. Vinte Node distintos e três regressões positivos;
resultados SDK na [evidência](../../../entregas/2026-10-25-writer-v2-revisao-da-ativacao-de-livros.md).
Ativação/estado terminal/mídia/host/roundtrip e demais P1/V2/fases/gates pendentes.

### P1 — núcleo de ativação privada (plano 133)

[Plano 133](133-revisao-e-ativacao-do-livro.md): raiz/controle/lote/universo e
registro/uso da capa ativados atomicamente; consulta histórica e bloqueio de
cancelamento após ativação. 55 Node distintos e dois SDK positivos; veja a
[evidência](../../../entregas/2026-10-25-writer-v2-ativacao-atomica-de-livros.md).
Capa ainda preparando, limpeza pós-ativação/host/roundtrip integral e demais
P1/V2/fases/gates pendentes. Não exposto como endpoint ou UI final.

### P1 — finalização recuperável da capa (plano 134)

[Plano 134](134-finalizacao-da-capa-restaurada.md): PATCH condicional retomável,
conclusão da biblioteca/raiz aplicável, recibos sem URL e disponibilidade atual
separada do histórico. 47 Node distintos, cinco GCS/HTTP já incluídos e um SDK
Firestore positivos; [evidência](../../../entregas/2026-10-25-writer-v2-finalizacao-da-capa-restaurada.md).
Limpeza própria/host/UI/roundtrip e demais P1/V2/fases/gates continuam pendentes.

### P1 — limpeza retomável após ativação (plano 135)

[Plano 135](135-limpeza-pos-ativacao.md): apaga arquivo/preparação privados por
unidades nativas e contagem exata, preservando conteúdo ativo e provas originais.
Capa originalmente retirada conclui unavailable sem reconstrução. 27 Node de
limpeza, cinco de mídia e um SDK Firestore positivos; veja a
[evidência](../../../entregas/2026-10-25-writer-v2-limpeza-pos-ativacao.md).
Host/UI/roundtrip integral/inventários/legados/rollout/validate de P1, fases 3–5
e condições humanas/comerciais continuam obrigatórios.

### P1 — transporte explícito de restauração (plano 136)

[Plano 136](136-transporte-da-restauracao.md): 31 comandos públicos em lista
imutável/export literal, Auth/App Check e headers privados; ports internos e
chave não expostos por callable. Cem Node distintos positivos, incluindo
HTTP Functions loopback e regressões dirigidas; veja a
[evidência](../../../entregas/2026-10-25-writer-v2-transporte-da-restauracao.md).
Sem deploy; driver/journal/UI/roundtrip e demais P1/V2/fases/gates continuam.

### P1 — preparação do cliente em unidades (plano 137)

[Plano 137](137-preparacao-retomavel-no-cliente.md): sequenciador com intenção/CAS,
replay exato e uma unidade por chamada; pausa antes de ativar. Adaptador adia
Firebase. 75 Vitest distintos positivos, incluindo preparações atual/JSON v6 com
serviço real até revisão; [evidência](../../../entregas/2026-10-25-writer-v2-preparacao-retomavel-no-cliente.md).
Journal durável/cifrado concreto, upload/revisão/ativação/mídia/limpeza do cliente,
UI/roundtrip integral e demais P1/V2/fases/gates continuam obrigatórios.

### P1 — journal protegido da preparação (plano 138)

[Plano 138](138-journal-protegido-da-preparacao.md): chave HTTP autorizada,
AES-GCM sem chave persistida, IndexedDB/Web Locks e CAS completo. Driver recupera
mesmo pedido após reinício; recusas preservam ciphertext.
35 Vitest e dez cenários Chromium positivos; veja a
[evidência](../../../entregas/2026-10-25-writer-v2-journal-protegido-da-preparacao.md).
UI/descarte terminal/upload/revisão/ativação/mídia/limpeza/roundtrip e demais
P1/V2/fases/gates continuam obrigatórios.

### P1 — início do envio e revisão no Estúdio (plano 139)

[Plano 139](139-restauracao-de-livros-no-estudio.md) inicia com contratos
fechados de origem/start, hash canônico e IDs alinhados ao servidor antes de
persistir. 65 Vitest distintos e um cenário Chromium dirigidos positivos;
[evidência parcial](../../../entregas/2026-10-25-writer-v2-contratos-iniciais-do-envio.md).
Inspeção/bootstrap/upload/revisão/ativação/mídia/limpeza do cliente e UI continuam
no mesmo plano, sem fechar P1/V2/fases/gates.

### P1 — inspeção e envio retomáveis (plano 139 parcial)

[Plano 139](139-restauracao-de-livros-no-estudio.md): revisão metadata, controle
inicial antes da chave e upload limitado com repetição exata/prefixo autorizado.
46 Vitest distintos e oito cenários Chromium positivos; fluxo real para na
revisão, com raiz ausente após dois reinícios.
[Evidência](../../../entregas/2026-10-25-writer-v2-inspecao-inicio-e-envio-de-backups.md).
Finalização/cancelamento de job duráveis, UI/roundtrip e demais P1/V2/fases/gates
continuam obrigatórios.

### P1 — finalização durável e interface de restauração (plano 139 parcial)

[Finalização](../../../entregas/2026-10-25-writer-v2-finalizacao-duravel-no-cliente.md)
acrescenta intenção operacional sem chave, replay/reconciliação próprios,
ativação/mídia/limpeza/cancelamento. 44 Vitest distintos, quatro Node e 14 cenários
Chromium positivos em seleções. Commit local 221e7c7.

[Interface do Estúdio](../../../entregas/2026-10-25-writer-v2-restauracao-no-estudio.md)
compõe seleção/revisões/preparação/confirmação explícita, lista/pausa/retomada e
abertura com acesso atual. 30 Vitest distintos e oito verificações Chromium
positivos. Sem implantação. Roundtrip integral/consumidores/inventários/rollout/
validate de P1 e demais V2/fases/gates continuam obrigatórios.

### P1 — roundtrip com consumidores normais (plano 140 parcial)

[Plano 140](140-roundtrip-dos-livros-com-consumidores-normais.md): captura/recaptura
normal atual/JSON v1–v6, escrita, histórico/rascunho, capa e lore >8 MiB.
Corrigidos controle derivado em narrativa e ausência explícita de persona.
16 Vitest distintos, 109 Node distintos, dois SDK e sete verificações Chromium
positivos em seleções; [evidência](../../../entregas/2026-10-25-writer-v2-roundtrip-normal-dos-livros.md).
Inventários/writers/exclusão/coleta, fontes antigas e draft com perfil indisponível,
rollout e validate de P1 continuam, sem conclusão de F2-09/V2/fases/gates.

141. [Ausência de persona no rascunho portátil](141-ausencia-de-persona-no-rascunho-portatil.md):
     captura explícita, schema/histórico e avisos retomáveis; 32 Node, 16 Vitest e
     dois roundtrips positivos. Sem inventar perfil ou recriar capítulo.
     [Evidência](../../../entregas/2026-10-25-writer-v2-ausencia-de-persona-no-rascunho.md).
     P1 segue com inventários/legados/rollout/validate e fases 3–5 pendentes.

142. [Revisão alterada na ativação](142-revisao-alterada-na-ativacao.md):
     retirada atômica pelo pedido original, selo conferido e nova confirmação.
     65 Node/29 Vitest distintos em seleções, um SDK com três ordens concorrentes
     e oito verificações Chromium. [Evidência](../../../entregas/2026-10-25-writer-v2-revisao-renovada-na-ativacao.md).
     Inventários/legados/rollout/validate e demais fases/gates continuam pendentes.

143. [Backup completo no diálogo de exportação](143-backup-completo-no-dialogo-de-exportacao.md):
     gravação .writer com histórico e destino escolhido; JSON antigo identificado.
     22 Vitest distintos e 13 verificações Chromium de exportação/restauração.
     [Evidência](../../../entregas/2026-10-25-writer-v2-backup-completo-no-editor.md).
     Inventários gerais/legados/rollout/validate e demais fases/gates pendentes.

144. [Metadata de persona nos leitores do editor](144-metadata-de-persona-nos-leitores-do-editor.md):
     projeção fechada em get/list e DTO real até rascunho vazio sem lookup;
     69 testes do serviço positivos. [Evidência](../../../entregas/2026-10-25-writer-v2-metadata-de-persona-no-editor.md).
     Inventários gerais/legados/coleta/rollout/validate e demais fases/gates pendentes.

145. [Modo de lore fixado na restauração](145-modo-de-lore-fixado-na-restauracao.md):
     job/reserva imutáveis, retomada e compatibilidade por provas existentes;
     70 Node distintos e dois SDK positivos. [Evidência](../../../entregas/2026-10-25-writer-v2-modo-de-lore-fixado.md).
     Runtime/inventários/legados/coleta/rollout/validate e demais fases/gates pendentes.

146. [Inventário e consumidores dos livros restaurados](146-inventario-e-consumidores-dos-livros-restaurados.md):
     fecha P1 técnico local com ciclo inline/v1/v2, fonte >8 MiB e seleção do
     runtime para novos pedidos. Validate verde: 4.096 frontend, 87 scripts,
     3.007 Functions, cobertura atendida, sintaxe/tipos/build/smoke positivos.
     Sete SDK Storage também positivos; runner correto e concorrência limitada
     sem reduzir casos/limites. [Evidência](../../../entregas/2026-10-26-writer-v2-ciclo-e-inventario-dos-backups-de-livros.md).
     Gates operacionais/humanos/comerciais, P2/P3/D e demais fases continuam.

147. [Portabilidade privada de aventuras](147-portabilidade-privada-de-aventuras.md):
     inicia fonte interna metadata raiz/progresso; 26 Node dirigidos positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-fonte-do-backup-de-aventuras.md).
     Sem endpoint/UI/arquivo; demais recursos, restauração e validate P2 pendentes.

148. [Leitura da estrutura de aventuras](148-leitura-da-estrutura-de-aventuras.md):
     raiz/partes por unidades, fonte no mesmo snapshot, metadata paginada e
     procedência sem grant; 64 Node e três SDK positivos na versão final.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-leitura-da-estrutura-de-aventuras.md).
     Cenas/demais famílias, pacote/restauração/UI e validate P2 permanecem abertos.

149. [Cenas e blocos no backup de aventuras](149-cenas-e-blocos-no-backup-de-aventuras.md):
     oito famílias por metadata/unidades, presença explícita e dependências
     nativas; 118 Node e três SDK positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-cenas-e-blocos-no-backup-de-aventuras.md).
     Narrativa/lore/demais famílias, selo/pacote/restauração/UI e validate P2 abertos.

150. [Narrativa no backup de aventuras](150-narrativa-no-backup-de-aventuras.md):
     arcos/eventos/marcos, sete famílias e ordens determinísticas, links neutros
     com source/ancestrais autorizados; 158 Node e cinco SDK positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-narrativa-no-backup-de-aventuras.md).
     Lore/demais famílias, selo/pacote/restauração/UI e validate P2 abertos.

151. [Lore próprio no backup de aventuras](151-lore-proprio-no-backup-de-aventuras.md):
     metadata/corpo/tombstone por nascimento/revisão da origem, sem lookup global;
     204 Node e dois SDK positivos na seleção final.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-lore-proprio-no-backup-de-aventuras.md).
     Histórico/demais famílias, selo/pacote/restauração/UI e validate P2 abertos.

152. [Metas e checklist no backup de aventuras](152-metas-e-checklist-no-backup-de-aventuras.md):
     escolhas declaradas e tarefas atuais pelo leitor existente, sem controles
     derivados/atividade da conta; 115 Node e um SDK positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-metas-e-checklist-no-backup-de-aventuras.md).
     Histórico/personas/mídia, selo/pacote/restauração/UI e validate P2 abertos.

153. [Histórico no backup de aventuras](153-historico-no-backup-de-aventuras.md):
     versões manuais/before-restore de cena/bloco, chunks e provas nativas;
     66 Node e dois SDK positivos após ajuste de ambiente do emulador.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-historico-no-backup-de-aventuras.md).
     Personas/mídia, selo/pacote/restauração/UI e validate P2 abertos.

154. [Personas no backup de aventuras](154-personas-no-backup-de-aventuras.md):
     perfis usados por root/cena, IDs legados e disponibilidade ativa antes da
     prosa; projeção pura compartilhada com alias de livro e vetor preservado.
     50 Node e dois SDK positivos. [Evidência parcial](../../../entregas/2026-10-26-writer-v2-personas-no-backup-de-aventuras.md).
     Mídia/selo/pacote/restauração/UI e validate P2 abertos.

155. [Imagens autorizadas no backup de aventuras](155-imagens-autorizadas-no-backup-de-aventuras.md):
     vínculos/uso tipado e PNG por geração/ranges com revalidação após I/O;
     50 Node e três SDK Firestore/Storage positivos, avisos de listeners registrados.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-imagens-no-backup-de-aventuras.md).
     Selo/pacote/restauração/UI/roundtrip e validate P2 abertos.

156. [Origem do universo no backup de aventuras](156-origem-do-universo-no-backup-de-aventuras.md):
     origem neutra por fonte/birth/acesso, sem duplicação/prosa global;
     24 Node e um SDK positivos, alias puro de livro preservado.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-origem-do-universo-no-backup-de-aventuras.md).
     Inventário/selo/pacote/restauração/UI/roundtrip e validate P2 abertos.

157. [Imagens de aventuras importadas](157-imagens-de-aventuras-importadas.md):
     corrige idade do head materializado antes da ativação, mantendo uso tipado
     posterior à raiz como grant atual; RED reproduzido, 50 Node e três SDK verdes.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-imagens-de-aventuras-importadas.md).
     Inventário/selo/pacote/restauração/UI/roundtrip e validate do bloco abertos.

158. [Inventário e validação dos leitores de aventuras](158-inventario-e-validacao-dos-leitores-de-aventuras.md):
     matriz de produtores/provas/exclusões/drafts e validate integral verde:
     4.096 frontend, 87 scripts e 3.332 Functions; duas falhas de teste corrigidas.
     [Evidência](../../../entregas/2026-10-26-writer-v2-inventario-dos-leitores-de-aventuras.md).
     Fecha somente o bloco de leitores; assembler/pacote/restore/UI e P2 abertos.

159. [Formato privado de aventuras](159-formato-privado-de-aventuras.md):
     framer puro compartilhado com bytes de livro preservados, assinatura de
     aventura e envelope canônico de oito seções; 64 Node/37 Vitest e build verdes.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-formato-privado-de-aventuras.md).
     Report envelope-only; assembler/validação autoral/restauração/UI e P2 abertos.

160. [Inventário limitado do cliente de aventuras](160-inventario-limitado-do-cliente-de-aventuras.md):
     registro puro e percurso metadata completo com SHA/segunda passagem,
     24 Vitest/115 Node, types/lint e bundle isolado positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-inventario-do-cliente-de-aventuras.md).
     Inventory-only não certifica conteúdo/Storage nem sela arquivo; P2 aberta.

161. [Leitura limitada das unidades de aventuras](161-leitura-limitada-das-unidades-de-aventuras.md):
     JSON por ranges, SHA incremental e encerramento sem RPC tardio; 24 testes,
     seleção final de whitelist, types/lint e bundle isolado positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-unidades-de-aventuras-no-cliente.md).
     Unit-bytes-only não sela pacote nem certifica histórico/Storage; P2 aberta.

162. [Composição dos dados centrais de aventuras](162-composicao-dos-dados-centrais-de-aventuras.md):
     cinco seções/manifestos/endereço e ponte neutra compartilhada com livros;
     33 Vitest/dez Node, tipos/lint, bundle e smoke por passos positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-dados-centrais-de-aventuras.md).
     Prova core-data-only; seções finais/selo/RPC/UI/restore e P2 abertos.

163. [Histórico de aventuras em ordem textual](163-historico-de-aventuras-em-ordem-textual.md):
     reader nativo por ordinal, cabeçalhos preservados e texto fixed64k/SHA;
     52 Node, 21 Vitest e um SDK dirigidos positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-historico-ordenado-de-aventuras.md).
     Imagens/drafts/selo/validador/restauração/UI e P2 seguem abertos.

164. [Imagens no arquivo de aventuras](164-imagens-no-arquivo-de-aventuras.md):
     vínculos/PNGs por recurso, hashes e segunda passagem completa; 20 Vitest/
     37 Node dirigidos positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-imagens-no-arquivo-de-aventuras.md).
     Drafts/selo/validador/transporte/restauração/UI e P2 permanecem abertos.

165. [Rascunho explícito no backup de aventuras](165-rascunho-explicito-no-backup-de-aventuras.md):
     texto separado por recurso/head/body autorizados e observador limitado;
     14 Vitest distintos e um Node dirigidos positivos.
     [Evidência parcial](../../../entregas/2026-10-26-writer-v2-rascunho-explicito-de-aventuras.md).
     Composição final/validador/transporte/restauração/UI e P2 seguem abertos.

166. [Composição integral da captura de aventuras](166-composicao-integral-da-captura-de-aventuras.md):
     oito seções/fontes reais, conferência final e framing próprio; testes
     integrados dirigidos positivos; rodada completa com um timeout corrigido
     em seleção própria, 90 scripts/3.367 Functions e build positivos.
     [Registro parcial](../../../entregas/2026-10-26-writer-v2-captura-integral-de-aventuras.md).
     Pendência formal encerrada pelo validate verde de 167 em 2026-10-27.
     A captura permanece distinta da validação; restauração/UI e P2 abertas.

167. [Validação semântica do arquivo de aventuras](167-validacao-semantica-do-arquivo-de-aventuras.md):
     DTOs/identidades/hashes e relações das oito seções, índice OPFS neutro cifrado,
     SHA/UTF-8 retomáveis e leitor público content-only. Corpus nativo/adversarial
     e Chromium positivos; validate integral verde com 4.259 frontend,
     90 scripts/3.379 Functions, sintaxe/tipos/build/smoke.
     [Evidência](../../../entregas/2026-10-27-writer-v2-validacao-semantica-de-aventuras.md).
     Transporte/revisão/restauração/UI, P2/P3/D e gates permanecem abertos.

168. [Validação retomável do arquivo de aventuras](168-validacao-retomavel-do-arquivo-de-aventuras.md):
     snapshots limitados, releitura por SHA e ponteiros JSON/raw, com fonte e
     ports fixados; 20 Vitest distintos em seleções, lint e sintaxe positivos.
     [Evidência dirigida](../../../entregas/2026-10-27-writer-v2-validacao-retomavel-de-aventuras.md).
     Não é coordenação remota ou restauração; transporte/UI e P2/P3/D abertos.

169. [Transporte privado da restauração de aventuras](169-transporte-privado-da-restauracao-de-aventuras.md):
     reserva/raiz invisível, chunks/SHA/provas nativas, replay e limpeza limitada;
     22 Node e seis SDK distintos em seleções, lint/sintaxe positivos.
     [Evidência](../../../entregas/2026-10-27-writer-v2-transporte-privado-da-restauracao-de-aventuras.md).
     Serviço interno sem endpoint/UI. Validação persistente, recuperação,
     remap/mídia/ativação/roundtrip e P2/P3/D permanecem abertos.

170. [Validação semântica persistente de aventuras](170-validacao-semantica-persistente-de-aventuras.md):
     fonte com provas, índice/itens transacionais e snapshot atual autenticado,
     recheck integral e cleanup compatível. 13 Vitest/cinco Node novos e cinco
     SDK novos distintos em seleções, com regressão de transporte/cleanup.
     Validate integral verde: 4.292 frontend, 90 scripts, 3.406 Functions,
     sintaxe/tipos/build/smoke.
     [Evidência](../../../entregas/2026-10-27-writer-v2-validacao-persistente-de-aventuras.md).
     Serviço interno; leitura/remap, recuperação, stager/ativação/UI/roundtrip
     e P2/P3/D seguem abertos.

171. [Consumo autenticado e remapeamento de aventuras](171-consumo-autenticado-e-remapeamento-de-aventuras.md):
     relatório/item/fonte autenticados e verify(tx) antes de consumo, raw por
     frame com SHA/UTF-8 e remapeamento coerente dos 17 recursos/imagens por uso.
     Testes dirigidos de contrato e SDK real demo; sem novo validate integral.
     [Evidência dirigida](../../../entregas/2026-10-27-writer-v2-consumo-autenticado-de-aventuras.md).
     Contrato interno sem staging/ativação. Recuperação/UI/roundtrip e P2/P3/D
     permanecem abertos.

172. [Estrutura privada da aventura restaurada](172-estrutura-privada-da-aventura-restaurada.md):
     lookup autenticado, partes/cenas/blocos e pares de corpo nativos com journals,
     raiz reservada sem dono e controle de progresso incompleto. Sete Vitest,
     cinco Node novos em seleções, 27 Node de regressão e três SDK positivos.
     [Evidência dirigida](../../../entregas/2026-10-27-writer-v2-estrutura-privada-de-aventuras.md).
     Recursos/índices restantes, contadores/audit/ativação/recuperação/UI/roundtrip
     e P2/P3/D permanecem abertos.

173. [Ativação atômica da aventura restaurada](186-ativacao-atomica-da-aventura-restaurada.md):
     revisão final, raiz/countReady/personas/universo/recibo atômicos e encerramento
     de pedido incerto com histórico independente da raiz atual.
     [Evidência dirigida](../../../entregas/2026-10-28-writer-v2-ativacao-atomica-da-aventura-restaurada.md).
     Mídia pendente; finalização/GC/recuperação/UI/roundtrip e P2/P3/D/F2-09 abertos.

174. [Finalização das imagens da aventura restaurada](187-finalizacao-das-imagens-da-aventura-restaurada.md):
     uma imagem por unidade em sidecars, com accept/retire provados, ACK atômico,
     detach preservado e conclusão por consulta vazia.
     [Evidência dirigida](../../../entregas/2026-10-28-writer-v2-finalizacao-das-imagens-restauradas-de-aventuras.md).
     Coleta da fonte/recuperação/transportes/UI/roundtrip e P2/P3/D/F2-09 abertos.

175. [Coleta da fonte da aventura restaurada](188-coleta-da-fonte-da-aventura-restaurada.md):
     mídia concluída, exclusões privadas por páginas, provas de metadata e
     preservação de projeto/biblioteca/personas/recibos.
     [Evidência e fechamento 186–188](../../../entregas/2026-10-28-writer-v2-coleta-da-fonte-da-aventura-restaurada.md).
     Recuperação/transportes/UI/roundtrip e P2/P3/D/F2-09 permanecem abertos.

Fechamento integral local 186–188: **4.331 frontend / 336 arquivos, 90 scripts,
3.656 Functions e sintaxe de 388 módulos**, tipos/build/smoke verdes. Cobertura
89,94/85,71/91,12/93,24 e limites preservados. Coleta SDK final 1/1 positivo.
[Evidência](../../../entregas/2026-10-28-writer-v2-coleta-da-fonte-da-aventura-restaurada.md).
Recuperação/transportes/UI/roundtrip e P2/P3/D/F2-09 continuam abertos.

189. [Transporte autenticado da restauração de aventuras](189-transporte-autenticado-da-restauracao-de-aventuras.md):
     29 comandos explícitos, Auth/App Check, limites/headers privados e ports
     internos/chaves excluídos. 162 Node e um SDK HTTP/Firestore demo positivos;
     [evidência](../../../entregas/2026-10-28-writer-v2-transporte-da-restauracao-de-aventuras.md).
     Recuperação HTTP/chaves/cliente/UI/roundtrip e P2/P3/D/F2-09 abertos.

190. [Chave privada da restauração de aventuras](190-chave-privada-da-restauracao-de-aventuras.md):
     nascimento atômico, HTTP próprio autenticado e encerramento por metadados
     no cancelamento/coleta; sem chave tardia ou exposição em callables.
     [Evidência](../../../entregas/2026-10-28-writer-v2-chave-privada-da-restauracao-de-aventuras.md).
     Cliente/journal/UI/roundtrip e P2/P3/D/F2-09 permanecem abertos.

191. [Cliente da chave privada de aventuras](191-cliente-da-chave-privada-de-aventuras.md):
     primeira autorização/revalidação, CryptoKey não extraível e proxy/Hosting
     próprios; 52 Vitest, retake final 38/38 e checks de tipos/lint/arquitetura/bundle/smoke positivos.
     [Evidência](../../../entregas/2026-10-28-writer-v2-cliente-da-chave-privada-de-aventuras.md).
     Journal/controlador/UI/roundtrip e P2/P3/D/F2-09 continuam abertos.

192. [Journal cifrado da preparação de aventuras](192-journal-cifrado-da-preparacao-de-aventuras.md):
     14 comandos, AES-GCM próprio, reautorização e CAS/locks; 70 Vitest, retake
     35/35 e oito verificações nativas no Chromium.
     [Evidência](../../../entregas/2026-10-28-writer-v2-journal-cifrado-da-preparacao-de-aventuras.md).
     Controlador/bootstrap/efeitos/UI/roundtrip e P2/P3/D/F2-09 seguem abertos.

193. [Controlador da preparação de aventuras](193-controlador-da-preparacao-de-aventuras.md):
     step com journal/recibos e transporte contextual; duas auditorias e pausa
     privada para revisão. 169 Vitest e sete verificações Chromium positivas.
     [Evidência](../../../entregas/2026-10-28-writer-v2-controlador-da-preparacao-de-aventuras.md).
     Bootstrap/start/upload/efeitos/UI/roundtrip e P2/P3/D/F2-09 continuam abertos.

194. [Início e upload retomável de aventuras](194-inicio-e-upload-retomavel-de-aventuras.md):
     bootstrap metadata, sessão/fence, arquivo verificado e blocos com retomada;
     dez verificações Chromium positivas.
     [Fechamento integral 189–194](../../../entregas/2026-10-28-writer-v2-inicio-e-upload-retomavel-de-aventuras.md):
     4567 frontend, 90 scripts, 3772 Functions e 391 módulos de sintaxe,
     cobertura/tipos/bundle/smoke verdes. UI/efeitos/roundtrip e P2/P3/D/F2-09 abertos.

195. [Efeitos retomáveis da restauração de aventuras](195-efeitos-retomaveis-da-restauracao-de-aventuras.md):
     metadata própria, revisão/ativação explícita e confirmação após encerrar
     chave; mídia/coleta por checkpoints, com CAS e resolução/retirada.
     136 Vitest e 13 verificações Chromium positivos;
     [evidência dirigida](../../../entregas/2026-10-28-writer-v2-efeitos-retomaveis-de-aventuras.md).
     Tipos/lint/arquitetura/build/smoke verdes; validate no próximo grande bloco.
     UI/roundtrip e P2/P3/D/F2-09 continuam abertos; somente commit local.

196. [Restauração de aventuras no Estúdio](196-restauracao-de-aventuras-no-estudio.md):
     inspeção/revisão local, preparação e consentimento final, pausa/retomada,
     lista paginada e abertura autorizada; descarte terminal sem chave.
     103 Vitest e 12 verificações Chromium positivos;
     [evidência dirigida](../../../entregas/2026-10-28-writer-v2-restauracao-de-aventuras-no-estudio.md).
     Tipos/lint/arquitetura/styleguide/build/smoke verdes. Geração pela UI/corpus
     amplo e demais P2/P3/D/F2-09 abertos; validate no próximo bloco integrado.

197. [Geração do backup de aventuras pela interface](197-geracao-do-backup-de-aventuras-pela-interface.md):
     17 leitores públicos, escrita nativa por stream e rascunho explícito,
     com três entradas de UI e nove verificações Chromium positivas.
     [Fechamento integral 195–197](../../../entregas/2026-10-28-writer-v2-backup-de-aventuras-pela-interface.md):
     4791 frontend, 90 scripts, 3798 Functions e sintaxe de 393 módulos,
     cobertura/tipos/build/smoke verdes. Auditoria de P2/consumidores e P3/D/
     F2-09 continuam abertos; macro 8/35 inalterada. Somente commit local.

198. [Ciclo normal das aventuras restauradas](198-ciclo-normal-das-aventuras-restauradas.md):
     leitura/edição/histórico/IA e segunda captura/restauração após coleta.
     Corrige fonte legada invisível e recupera cenas sem parte por confirmação.
     [Matriz](../consumidores-aventuras-restauradas.md) e
     [evidência dirigida](../../../entregas/2026-10-28-writer-v2-ciclo-normal-das-aventuras-restauradas.md):
     35 Vitest distintos, 30 Node/SDK, nove verificações Chromium e build verdes.
     Exclusão completa de aventura é a próxima lacuna; P2/P3/D/F2-09 seguem
     abertos. Integral no fechamento do bloco; somente commit local.

### Plano 199 — avanço privado e encerramento de contextos

O avanço interno liga checkpoint/recibo e efeitos atômicos; retira snapshots
em páginas e desliga turnos ativos. 27 Node e 11 SDK/Rules positivos;
[ADR 0223](../../../decisions/0223-adventure-deletion-quiescence.md) e
[evidência parcial](../../../entregas/2026-10-28-writer-v2-avanco-privado-e-encerramento-de-contextos.md).
Fontes/mídia/autoria/controles/atividade/verificação e cliente/UI ainda faltam.
Plano 199, P2/P3/D/F2-09/V2 e macro 8/35 permanecem abertos; só commit local.

### Plano 199 — mídia pendente e fontes da exclusão

A quiescência integra mídia/coleta originais da restauração e manifests de
importação por metadata. Recibos e checkpoint de exclusão são atômicos;
preparing é retirado por geração, enquanto cópias ativas são preservadas.
Veja [ADR 0224](../../../decisions/0224-adventure-deletion-source-retirement.md) e
[evidência parcial](../../../entregas/2026-10-28-writer-v2-fontes-na-exclusao-de-aventuras.md).
Fases seguintes, cliente/UI e validação integrada permanecem pendentes.
Plano 199 e macro 8/35 não são concluídos por este incremento.

### Plano 199 — usos e autoria em lotes

Portão de mídia, vínculos tipados de imagens com contadores agregados e 23
famílias de autoria integrados ao avanço privado. Consulta vazia final reabre
família própria reaparecida; não remove arquivo independente nem outra conta.
78 Node e 14 SDK/Rules distintos positivos em rodadas; veja
[ADR 0225](../../../decisions/0225-adventure-deletion-images-and-authorship.md) e
[evidência parcial](../../../entregas/2026-10-28-writer-v2-usos-e-autoria-na-exclusao-de-aventuras.md).
Controles, atividade, fechamento terminal, cliente/UI e validate integral ainda
faltam. Plano 199, P2/P3/D/F2-09 e macro 8/35 permanecem abertos.

### Plano 199 — exclusão de aventuras no Estúdio

Catálogo remoto/local por conta, ações na página/cartão, sessão fora do conteúdo
revogado e consulta pela URL antiga estão compostos localmente. Seis exports de
index usam guards lazy, App Check, headers privados e a porta existente de mídia.
Veja a [ADR 0230](../../../decisions/0230-adventure-deletion-catalog-routes-and-binding.md)
e a [evidência dirigida](../../../entregas/2026-10-29-writer-v2-exclusao-de-aventuras-no-estudio.md).
Ciclo rico restaurado, validate integral e política final do chat seguem pendentes.
Plano 199, P2/P3/D/F2-09/V2 e macro 8/35 permanecem abertos; somente commit local.

### Fechamento técnico 198–199 — ciclo restaurado e exclusão

[Validação integral local](../../../entregas/2026-10-29-writer-v2-validacao-integral-das-aventuras.md)
verde: 4.890 frontend, 94 scripts, 3.989 Functions, sintaxe de 407 módulos,
tipos/build/smoke e cobertura preservada. Ciclo rico/vazio usa serviços reais
sobre dados/portas de teste, com origem, segunda cópia, irmã e campanha preservadas.
199 aguarda a política final das perguntas; auditoria final P2, P3/D/F2-09,
macro 8/35 e gates humanos/comerciais continuam abertos. Somente commit local.

200. [Auditoria técnica integral de P2](200-auditoria-tecnica-da-portabilidade-de-aventuras.md):
     nove passos e todos os grupos de conteúdo cruzados com fonte/testes/
     artefatos atuais em 8d7bb5a. Implementação v1 verificada localmente;
     limites/credenciais/produção separados das provas. Política final de 199,
     P3/D/F2-09 e gates gerais pendentes; macro 8/35. Somente documentação,
     sem repetir a suíte integral por ausência de mudança de comportamento.

201. [Portabilidade privada de campanhas](201-portabilidade-privada-de-campanhas.md):
     inventário P3 e primeiro serviço interno da âncora de raiz/cinco controles,
     somente metadata, com C4/encarnação e 18 testes dirigidos positivos.
     A âncora não cobre vínculos por sessão nem autoriza a edição congelada.
     Arquivo/restauração/UI/ciclo P3 e D/F2-09 continuam pendentes; macro 8/35.
     [Evidência parcial](../../../entregas/2026-10-29-writer-v2-ancora-privada-de-campanhas.md).

202. [Inventário próprio da portabilidade de campanhas](202-inventario-proprio-da-portabilidade-de-campanhas.md):
     nove famílias por páginas limitadas, provas nativas por unidade/sessão e
     lookahead, sem prosa/escrita. Escritores S2/S3 invalidam prova sem mudar a
     âncora global; tombstones e vínculos preservados. 38 testes direcionados
     positivos (20 novos/18 da âncora). [Evidência parcial](../../../entregas/2026-10-29-writer-v2-inventario-proprio-de-campanhas.md).
     Conteúdo/chunks, arquivo, procedência/base, restauração/UI/ciclo P3,
     D/F2-09 e gates continuam pendentes; macro 8/35, somente commit local.

203. [Conteúdo próprio da portabilidade de campanhas](203-conteudo-proprio-da-portabilidade-de-campanhas.md):
     nove DTOs fechados e leitor por partes de 65.536 bytes, após prova de
     unidade/pais/controles. Texto literal, estados e ordens preservados;
     controles/tombstones/pais inativos têm omissão explícita. 57 testes dirigidos
     positivos (19 novos), sem produtor persistente. [Evidência parcial](../../../entregas/2026-10-29-writer-v2-conteudo-proprio-de-campanhas.md).
     Arquivo/segunda passagem, base/procedência, restauração/UI/ciclo P3,
     D/F2-09 e gates continuam abertos; macro 8/35, somente commit local.

204. [Captura incremental dos próprios](204-captura-incremental-dos-proprios-de-campanha.md):
     fluxo provisório de partes, pressão de consumo e SHA integral por unidade,
     com segunda passagem das nove famílias e âncora final. Prova own-data-only;
     nenhum índice persistido/selo de arquivo ou grant. 21 Vitest e 57 Node
     dirigidos positivos; [evidência parcial](../../../entregas/2026-10-29-writer-v2-captura-incremental-dos-proprios.md).
     Base/procedência/variantes/mídia, arquivo completo, restauração/UI/ciclo
     P3/D/F2-09 e gates permanecem abertos; macro 8/35, somente commit local.

205. [Origem autorizada da base congelada](205-origem-autorizada-da-base-congelada.md):
     primeiro gate somente de metadados, com edição antiga preservada,
     encarnação/reservas permanentes, lore global separado e controles C3.
     20 Node dirigidos positivos; [evidência parcial](../../../entregas/2026-10-29-writer-v2-origem-autorizada-da-base.md).
     Não é assinatura/atestado portátil ou autorização de ficha individual.
     Manifesto/base/variantes/mídia, arquivo/restauração/UI/ciclo P3/D/F2-09
     e gates permanecem abertos; macro 8/35, somente commit local.

206. [Itens e textos da base congelada](206-itens-e-textos-da-base-congelada.md):
     listagem limitada, cabeçalhos lógicos e campos congelados dos sete tipos,
     com gate individual e SHA/tamanho integrais no fluxo cliente. 20 Node novos,
     11 regressões e 29 Vitest positivos; [evidência parcial](../../../entregas/2026-10-29-writer-v2-textos-da-base-congelada.md).
     Inventário físico completo/variantes/legadas/mídia, manifesto/atestado,
     arquivo/restauração/UI/ciclo P3/D/F2-09 pendentes; macro 8/35, commit local.

207. [Inventário físico e auditoria da base](207-inventario-fisico-e-auditoria-da-base.md):
     quatro famílias e snapshot, provas de vínculos nos dois sentidos e auditoria
     SHA/bytes servidor por campo. 26 Node novos, 31 regressões e 29 Vitest
     positivos; [evidência parcial](../../../entregas/2026-10-29-writer-v2-inventario-fisico-da-base.md).
     Segunda passagem/reconciliação integrais, variantes/legadas/binários,
     atestado/arquivo/restauração/UI/ciclo P3/D/F2-09 pendentes; macro 8/35.

208. [Variantes e âncoras do lore](208-variantes-e-ancoras-do-lore.md):
     inventário e leitores legado/geração, corpos vinculados anteriores e âncoras
     antigas, com origem conferida antes da prosa e SHA/JSON canônico. 74 Node
     e 29 Vitest positivos; [evidência parcial](../../../entregas/2026-10-29-writer-v2-variantes-no-backup.md).
     Inventário físico dos bindings, reconferência conjunta, binários e atestado/
     arquivo/restauração/UI/ciclo P3/D/F2-09 pendentes; macro 8/35, commit local.

209. [Corpos físicos das variantes](209-inventario-fisico-das-variantes.md):
     lojas, corpos, cobertura por binding e sonda de órfãos por encarnação,
     sem prosa. 25 testes novos e 28 regressões positivos;
     [evidência parcial](../../../entregas/2026-10-29-writer-v2-corpos-fisicos-das-variantes.md).
     Reconferência conjunta, binários, atestado/arquivo/restauração/UI/ciclo
     P3/D/F2-09 pendentes; macro 8/35, commit local.

210. [Imagens congeladas no backup](210-imagens-congeladas-do-backup.md):
     metadata/hash/ranges por geração decimal exata e fluxo cliente com SHA,
     contexto e interrupção. 117 Node distintos e 38 Vitest dirigidos positivos;
     [evidência parcial](../../../entregas/2026-10-29-writer-v2-imagens-congeladas-no-backup.md).
     Reconferência conjunta, manifesto/atestado, arquivo/restauração/UI/ciclo
     P3/D/F2-09 pendentes; macro 8/35, somente commit local.
