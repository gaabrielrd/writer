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
