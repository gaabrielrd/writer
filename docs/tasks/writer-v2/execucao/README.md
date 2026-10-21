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
