# Timeline e capacidade

## Situação em 2026-10-21

F2-01 a F2-07 e F2-08 S1 estão concluídos tecnicamente nos heads registrados na
[execução](execucao/README.md). S2A está concluído tecnicamente em `d9b7988`, com CI e regras verdes. S2B está concluído tecnicamente em 56cbb06, com CI/regras verdes. S3 passou na
validação local (1.998 frontend, 409 Functions, SDK e navegador), com CI do novo
head falhou por timeouts visuais, com correção visual validada localmente e nova CI pendente.
F2-09 está em descoberta/detalhamento, sem código implementado;
ver [sequência](execucao/25-lore-importacao-e-portabilidade.md). Fases seguintes permanecem abertas. Pilotos humanos,
condições comerciais e rollout continuam com seus aceites próprios.

A baseline de 13/10 abaixo é histórica: seus totais não representam saldo nem
previsão atual de lançamento. O detalhamento de F2-08 reabriu a estimativa.
S2A tem referência provisória **34/54/84 h** de esforço humano total, com baixa
confiança e sem horas realizadas informadas. A antiga divisão igual de S2 foi
abandonada. O [contrato S2B](execucao/23-cenas-completas-na-preparacao-da-sessao.md)
reabriu a referência total em **34/56/92 h** (backend 12/20/32, UI 12/20/34 e
QA/regressões/docs 10/16/26), também provisória e com confiança baixa. Não somar S2A à linha histórica como se fosse trabalho adicional medido,
nem subtrair tarefas entregues sem apontamento humano. Um novo total exige
reestimar os recortes restantes; por ora, não há saldo validado.

O [contrato S3](execucao/24-pistas-missoes-e-pendencias.md) substitui a referência
antiga 8/12/20 h por **46/78/128 h** humanas totais (backend 18/30/48,
cliente 16/28/46, QA 12/20/34), sem dupla contagem e com confiança baixa.
Catálogo reutilizável, dois controles CAS e C4 v4 ampliam o recorte. Não são
horas realizadas/restantes nem previsão de lançamento.

A descoberta de F2-09 confirmou ausência de restauração JSON e portabilidade dos
novos domínios. O [contrato L](execucao/26-lore-proprio-de-aventura.md) reabre somente
lore próprio de aventura em **60/102/168 h** humanas totais: backend 22/38/64,
cliente 20/34/54 e QA integrado 18/30/50, sem duplicar unidades. A faixa histórica
F2-09 56/88/144 h não representa mais o recorte atual. Falta consolidar as demais
verticais, incluindo o histórico integral confirmado pelo operador. Não há saldo
medido nem nova previsão de lançamento.

## Baseline histórica revisada em 2026-10-13

Uma pessoa, 20 horas brutas por semana. As 41 tarefas das fases 1–5 permanecem
no escopo; fase 6 não recebe estimativa nem compromisso. O orçamento anterior
de 12 meses não era estimativa de engenharia. A revisão abaixo é referência de
esforço humano ativo, com confiança baixa: sem horas realizadas, benchmark ou
fator comprovado de aceleração por IA. Tempo de agente/comando não é hora humana.

Os cenários otimista (O), central (C) e pessimista (P) preservam todos os critérios.
São hipóteses de retrabalho/integração, não intervalo estatístico ou compromisso.
Dados: [estimativas por tarefa](execucao/06-estimativas.json).

## Esforço por tarefa

Cada linha inclui descoberta específica, plano, implementação, migração aplicável,
testes pertinentes, inspeção visual/acessível, revisão, documentação e evidência.
Preparar/conduzir/analisar pilotos está incluído; esperar pessoas/processamento
externo não está. Fase 1 é referência de esforço total, com artefatos já produzidos:
não somar sua faixa integral como trabalho restante. Horas humanas efetivas/restantes
ainda não foram registradas.

| Tarefa                                      | O (h) | C (h) | P (h) | Premissa/risco principal                                        |
| ------------------------------------------- | ----: | ----: | ----: | --------------------------------------------------------------- |
| W2-F1-01 — Jornadas e escopo                |     8 |    12 |    20 | Inventario e corpus; CI compartilhada na consolidacao           |
| W2-F1-02 — Dominio e compatibilidade        |    12 |    20 |    32 | Modelos, origem, bytes e migrações; medições nao sao benchmark  |
| W2-F1-03 — Permissoes e privacidade         |    12 |    20 |    32 | Projecoes, convites, revogacao e casos negativos                |
| W2-F1-04 — Comercio e direitos              |    16 |    24 |    40 | Pesquisa/configuracao; habilitacao/contratos sao espera externa |
| W2-F1-05 — Prototipos e pilotos             |    16 |    24 |    40 | Prototipo, ensaio e observacao; agenda de pessoas e espera      |
| W2-F1-06 — Consolidacao e estimativas       |     8 |    12 |    20 | Revisao cruzada, portao, normas e soma de estimativas           |
| W2-F2-01 — Projetos e navegacao             |    32 |    48 |    80 | Criacao idempotente, servicos, autorizacao e rotas antigas      |
| W2-F2-02 — Planejamento de cenas            |    48 |    72 |   112 | Vinculo ao manuscrito, ordem, teclado e formato legado          |
| W2-F2-03 — Arcos e cronologia               |    24 |    40 |    64 | Vinculos privados, ordem e alvos removidos                      |
| W2-F2-04 — Estados, metas e retomada        |    24 |    40 |    64 | Contagem, periodo/fuso e retomada autorizada                    |
| W2-F2-05 — Historico e restauracao          |    64 |   104 |   160 | Autosave/IA, snapshots, conflito, offline e cliente antigo      |
| W2-F2-06 — Aventuras                        |    48 |    80 |   128 | Dominio proprio, editor publico, audiencias e imagens           |
| W2-F2-07 — Campanhas e variantes            |    40 |    64 |   104 | Base congelada, duas mesas, origem removida e exclusao          |
| W2-F2-08 — Preparacao de sessoes            |    32 |    48 |    80 | CRUD/ordem, pistas, missoes e notas preservadas                 |
| W2-F2-09 — Lore, importacao e portabilidade |    56 |    88 |   144 | Arquivos reais, mencoes/IA e roundtrip de backup                |
| W2-F3-01 — Convites e acessos               |    40 |    64 |   104 | Identidade, expiracao, replay e revogacao em uso                |
| W2-F3-02 — Revisao editorial                |    48 |    80 |   128 | Snapshots, ancoras de texto rico, comentarios e papeis          |
| W2-F3-03 — Sugestoes e pendencias           |    40 |    64 |   104 | Aceite CAS/hash, autosave e aplicacao unica sem debito humano   |
| W2-F3-04 — Portal e materiais               |    48 |    80 |   128 | Projecoes fechadas, endpoint de arquivos e cache                |
| W2-F3-05 — Revelacoes e spoilers            |    48 |    80 |   136 | Capitulos, aliases, busca/IA e revogacao monotônica             |
| W2-F3-06 — Painel do mestre                 |    40 |    64 |   104 | UI densa, notas, rede/retry e 320 px                            |
| W2-F3-07 — Consequencias e canone           |    40 |    64 |   104 | Diario local, proposta escolhida e conflito global              |
| W2-F3-08 — Piloto duplo real                |    24 |    40 |    72 | Duas jornadas/sessoes, observacao e correcoes; agenda externa   |
| W2-F4-01 — Edicoes e projecoes              |    48 |    80 |   136 | Captura imutavel, ativacao, legado e origem revogada            |
| W2-F4-02 — EPUB e distribuicao externa      |    40 |    64 |   104 | Sumario, Unicode/imagens, validador e leitor real               |
| W2-F4-03 — Pacotes de aventura              |    40 |    64 |   112 | Audiencias, hashes, geracao parcial e inspeção de arquivos      |
| W2-F4-04 — Criadores convidados             |    40 |    64 |   112 | Connect real, direitos, submissao e suspensao                   |
| W2-F4-05 — Catalogo, series e amostras      |    32 |    56 |    88 | Projecoes publicas, busca e corpo pago ausente                  |
| W2-F4-06 — Ofertas e precos                 |    24 |    40 |    64 | Centavos, contrato/versionamento e concorrencia                 |
| W2-F4-07 — Pedidos e checkout               |    40 |    64 |   112 | Adapter real, direct charges, idempotencia e sandbox            |
| W2-F4-08 — Webhooks e conciliacao           |    56 |    96 |   160 | Assinatura/contexto, replay/ordem, razao e recuperacao          |
| W2-F4-09 — Biblioteca e entrega             |    48 |    80 |   136 | Direito, leitor, arquivos, respostas tardias e revogacao        |
| W2-F4-10 — Reembolsos e disputas            |    48 |    80 |   136 | Solicitacao/efetivacao, parcial, compensacao e notas            |
| W2-F4-11 — Repasses e operacao              |    40 |    72 |   120 | Extratos reais, taxas/comissao/payout e falhas                  |
| W2-F4-12 — Campanha da compra               |    32 |    56 |    96 | Instanciacao autorizada, update e reversao                      |
| W2-F5-01 — Onboarding e piloto              |    24 |    40 |    64 | Ajuda e piloto humano com compra sandbox nas duas jornadas      |
| W2-F5-02 — Metricas e economia              |    24 |    40 |    64 | Eventos minimos, teste/live, denominadores e dados ausentes     |
| W2-F5-03 — Qualidade integrada              |    48 |    80 |   136 | Regressao transversal, contas, formatos, acessibilidade e CI    |
| W2-F5-04 — Operacao e suporte               |    24 |    40 |    64 | Runbooks, entrega/refund/payout e retenção aplicável            |
| W2-F5-05 — Rollout e recuperacao            |    32 |    56 |    96 | Staging, backup/migracao/rollback e regras/indices              |
| W2-F5-06 — Aceite e lancamento              |    24 |    40 |    72 | Piloto real dos dois produtos, conciliacao e auditoria          |

| Fase                        |     O (h) |     C (h) |     P (h) | Situação                                                             |
| --------------------------- | --------: | --------: | --------: | -------------------------------------------------------------------- |
| 1                           |        72 |       112 |       184 | Referência total; artefatos entregues, pendências de aceite visíveis |
| 2                           |       368 |       584 |       936 | Parcialmente entregue; F2-08 reaberta, F2-09 não iniciado            |
| 3                           |       328 |       536 |       880 | Não implementada                                                     |
| 4                           |       488 |       816 |      1376 | Não implementada                                                     |
| 5                           |       176 |       296 |       496 | Não implementada                                                     |
| **Fases 2–5, baseline**     | **1.360** | **2.232** | **3.688** | Sem fase 1 remanescente ou espera externa                            |
| Fases 1–5, referência total |     1.432 |     2.344 |     3.872 | Não equivale a esforço restante                                      |

F5-03 cobre integração/regressão entre features, sem duplicar integralmente testes
específicos. Pilotos incluem correções locais; descoberta estrutural reabre a tarefa
responsável e sua estimativa, sem dupla contagem.

## Capacidade e horizonte aritmético da baseline histórica

Alocação proposta para conferência com a operação real, sem alterar as 20 h informadas:

| Período   | Brutas/semana | Rotina operacional | Reserva móvel |     Entrega |
| --------- | ------------: | -----------------: | ------------: | ----------: |
| Fases 1–3 |          20 h |                2 h |           2 h | 16 h/semana |
| Fases 4–5 |          20 h |                4 h |           2 h | 14 h/semana |

Rotina é manutenção/triagem e depois atendimento/monitoramento. Construir os processos
em F5-04 já está na tarefa; não é essa rotina semanal. Reserva cobre incidentes
sistêmicos não identificados, não espera externa. Não somar outro percentual de
contingência nem as antigas 80 h sobre esta alocação. Reserva não consumida pode
voltar à entrega; 2/4 h são hipóteses, não consumo medido.

| Fase na baseline    | Horas centrais | Entrega/semana | Semanas ativas centrais |
| ------------------- | -------------: | -------------: | ----------------------: |
| 2                   |            584 |           16 h |                    36,5 |
| 3                   |            536 |           16 h |                    33,5 |
| 4                   |            816 |           14 h |                    58,3 |
| 5                   |            296 |           14 h |                    21,1 |
| **Total fases 2–5** |      **2.232** |       Variável |               **149,4** |

Mesma alocação nos três cenários: aproximadamente **91 / 149 / 247 semanas ativas**,
ou **21 / 34 / 57 meses** pela conversão aritmética sem interrupções
(52 semanas/12 meses). Não são datas civis de lançamento. Adicionar fase 1 restante
quando medida, férias/feriados/pausas e esperas que interrompam o caminho crítico;
não somar esperas que coincidam com trabalho independente.

## Confronto com o orçamento histórico

| Fase             | Alocação inicial histórica |
| ---------------- | -------------------------: |
| 1                |                       80 h |
| 2                |                      240 h |
| 3                |                      160 h |
| 4                |                      240 h |
| 5                |                      240 h |
| Total            |                      960 h |
| Reserva original |                       80 h |

O desenho cabia em 52 semanas × 20 h = 1.040 h brutas, mas apenas **880 h**
estavam destinadas às fases 2–5. Mesmo a referência otimista de **1.360 h**
supera essa alocação antes de separar rotina operacional. Ampliar o horizonte
preservando autores, campanhas, EPUB/distribuição e venda dos dois produtos.
Janelas antigas “meses 2–4/5–6/7–9/10–12” ficam substituídas por esta referência.

## Incrementos, marcos e recalibração

Selecionar um incremento observável. Demonstrar ambas as jornadas em cada marco:
conto/aventura preparados (fase 2), revisão e duas sessões reais (fase 3),
edição/EPUB/pacote e compra/entrega de ambos (fase 4), operação/aceite público (fase 5).
Igual prioridade não exige dividir cada hora em 50/50 quando uma base atende ambos.

O antigo “marco de 90 dias” passa a ser recorte interno a recalibrar, sem data:
navegação, cenas, versão recuperável, aventura/campanha particulares e preparação
básica. Não é lançamento nem compromisso de concluir toda a fase 2 nesse período.

Registrar por incremento estimativa restante, horas humanas efetivas, espera externa,
nova descoberta e motivo de reestimativa. Recalibrar após os primeiros incrementos
produtivos da fase 2 e ao final de cada fase. Não descontar esforço por um protótipo
sem auditoria do reuso real.

## Dependências externas e portões

Connect BR/configuração/capacidades, contratos/direitos/retenção, participantes/
consentimento, leitores/ambientes, CI/índices/payout e autorização live têm espera
desconhecida. Preparação/inspeção/correção ativa está nas tarefas; registrar espera
passiva separadamente quando ocorrer. Não inventar prazo nem remover o portão.

A [matriz por incremento](execucao/06-contratos-e-replanejamento.md) localiza condições
técnicas, comerciais e humanas. Preparação de F2-01 é possível com a direção aprovada;
não declara aceite integral da fase 1. Implementação da fase seguinte respeita seu
portão, revisão e CI da definição de concluído. Estudos independentes podem reduzir
risco; planejar não executa todas as fases.
