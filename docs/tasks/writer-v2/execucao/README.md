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

| Tarefa     | Estado                                                                      | Evidência                                                                                                                   | Próxima condição                                                   |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| W2-F1-01   | Jornadas revisadas; validate local e CI da base verdes; corpus inventariado | [Jornadas e inventário](01-jornadas-e-escopo.md)                                                                            | Importação/piloto nas tarefas próprias                             |
| W2-F1-02   | Contrato revisado; validate local e CI da base verdes                       | [Domínio e medições](02-modelo-de-dominio.md)                                                                               | Critérios funcionais nas fases seguintes                           |
| W2-F1-03   | Contrato revisado; validate local e CI da base verdes                       | [Permissões e casos negativos](03-permissoes-e-privacidade.md)                                                              | Implementação/regras reais nas fases próprias                      |
| W2-F1-04   | Contrato revisado; validate local verde; tarefa em execução                 | [Comércio e direitos](04-regras-comerciais-e-direitos.md)                                                                   | Connect real, contratos e ensaio comercial                         |
| W2-F1-05   | Protótipo revisado, navegação aprovada; validate/30 percursos verdes        | [Protótipo](05-prototipos-e-pilotos.md), [roteiro](05-roteiro-de-pilotos.md)                                                | Participantes, critérios/tratamento de observações e piloto humano |
| W2-F1-06   | Consolidação revisada; validate local e CI da base verdes; 41 estimativas   | [Contratos/portões](06-contratos-e-replanejamento.md), [timeline](../timeline.md)                                           | Condições comerciais/humanas de aceite permanecem pendentes        |
| W2-F2-01   | Concluído tecnicamente; gates locais, CI e regras verdes em 15cd417         | [Estúdio e projetos](07-estudio-projetos.md), [entrega](../../../entregas/2026-10-13-writer-v2-estudio.md)                  | Condições humanas e comerciais permanecem nas respectivas entregas |
| W2-F2-02   | Concluído tecnicamente; gates locais, CI e regras verdes em f4449a5         | [Cenas e composição](08-planejamento-de-cenas.md), [entrega](../../../entregas/2026-10-13-writer-v2-cenas.md)               | Condições humanas/comerciais nas respectivas entregas              |
| W2-F2-03   | Concluído tecnicamente; gates locais, CI e regras verdes em 3358c75         | [Arcos e cronologia](09-arcos-e-cronologia.md), [entrega](../../../entregas/2026-10-13-writer-v2-arcos.md)                  | Condições humanas/comerciais nas respectivas entregas              |
| W2-F2-04   | Concluído tecnicamente em 16e71f6; CI e regras verdes                       | [Estados, metas e retomada](10-estados-metas-e-retomada.md), [entrega](../../../entregas/2026-10-15-writer-v2-progresso.md) | Condições humanas/comerciais nas entregas próprias                 |
| W2-F2-05   | Validado localmente; CI pendente                                            | [Histórico](11-historico-e-restauracao.md), [entrega](../../../entregas/2026-10-15-writer-v2-historico.md)                  | Commit/envio e CI; próximo F2-06                                   |
| F2-06 a F5 | Não iniciadas                                                               | [Plano](../README.md)                                                                                                       | Dependências e aceites pertinentes                                 |
| Fase 6     | Descoberta futura, fora da primeira versão pública                          | [Candidatos](../fase-06-evolucao-pos-v1/README.md)                                                                          | Aprovação posterior de escopo                                      |

Um documento não comprova uma funcionalidade. Testes locais não comprovam CI,
capacidade comercial live, participação humana ou operação em produção.
Aceite final segue a [definição de concluído](../../../development-process.md).

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
