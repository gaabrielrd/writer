# Writer V2 — Interface da retirada de seleção

- **Data**: 2026-10-25.
- **Branch**: codex/writer-v2; commit local.
- **Plano**: [123 / M38c5y](../tasks/writer-v2/execucao/123-interface-da-retirada-de-selecao.md).
- **Decisão**: [ADR 0138](../decisions/0138-book-lore-removal-selection-ui.md).

## Objetivo e funcionalidades

Conferir nomes/origens da seleção completa, confirmar retirada e retomar
pedidos no mesmo dispositivo. Os novos componentes são exportados, com
revisão C1 autorizada, confirmação separada e cancelamento independente.
A origem inicial fica fixa; revisão não renova tokens nem promove v1.

Lista de retomadas mostra metadata neutra por conta/livro e paginação.
Progresso distingue resultado gravado e conferido. Callback recebe somente
IDs retirados comprovados, uma vez por seleção no host. Fechar preserva a
tentativa e não dispara aviso de draft: não há prosa editável.

Ainda não montado no compêndio; visibilidade nativa e composição permanecem.

## Critérios de aceite

- [x] Abrir/retomar sem produtor destrutivo; conferência antes da confirmação.
- [x] Captura C1/token v2 original e nomes literais somente em RAM.
- [x] 53 fichas revisadas/aplicadas, sem teto de 50 na seleção.
- [x] Incerteza exige consulta/revisão/reenvio explícitos; dívida só salva.
- [x] Cancel não espera produtor; aceites e driver visual protegidos.
- [x] Callback por IDs confirmados e progresso parcial/cancelado correto.
- [x] Descoberta sem prosa e carregando/vazio/erro/sucesso/paginação.
- [x] Actor/perfil/livro, foco, Tab/Escape, três temas e 390 px.
- [ ] Visibilidade nativa, composição final e ativação no compêndio.
- [ ] Lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates.

## Arquivos alterados

| Grupo                                        | Mudança                                              |
| -------------------------------------------- | ---------------------------------------------------- |
| RemovalSelectionReview/Service               | Captura C1 autorizada na sessão, sem persistir nomes |
| SelectionDialog/Recoveries/index             | Confirmação/retomada visual exportadas               |
| Review/UI/Session tests e harness            | Casos novos e nomes literais configuráveis           |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contratos, evidência e continuidade                  |

## Testes e evidências

**65 Vitest positivos: 34 novos e 31 regressões.**

```text
Test Files  4 passed (4)
Tests  65 passed (65)
Duration  4.31s

2961 modules transformed.
Smoke test do bundle OK.
```

21 testes de interface: conferência/confirmação, callback único, 53 nomes,
tentativa congelada, erro/foco, resposta tardia ao fechar/trocar livro,
retomada neutra, incerteza/query/retry, dívida, escopo, cancel com produtor
retido, repetição de cancel, actor/perfil, parcial e lista paginada.
11 testes da revisão usam cliente/servidor de produção com banco em memória:
53 nomes literais, v1 não promovido, mudança durante C1/revalidação final,
pendentes após aceite, escopo, revogação e cancelamento do pai.
Dois testes novos integram revisão à sessão Auth do cliente. 31 regressões
do coordenador e sessão anterior. SDK/Auth e eventos IDB são simulados no Vitest.

A primeira rodada UI teve 16/17: seletor Fechar era ambíguo, pois o kit oferece
footer e botão X acessível com o mesmo nome. Ajustado o seletor do teste;
21 casos finais passaram. Lint/tipos iniciais em fixtures/callbacks foram
corrigidos sem suprimir regras. Campos e bindings do produto não foram
relaxados para satisfazer os testes.

### Chromium real

Quatro jornadas positivas com React, kit, serviço/revisão, executores,
IndexedDB e Web Locks reais:

1. Conferir 53 origens, nomes literais de 400 caracteres, confirmar, callback
   único, foco, três temas/mobile e lista metadata sem nome/prosa.
2. Resposta aceita perdida e reinício: consulta original, revisão somente das
   fichas pendentes e conclusão sem replay. Novo reinício confere três recibos.
3. Apply aceito retido, cancel com resposta perdida e repetição por handle
   fresco. Aceite preservado e resposta antiga sem nova ação/callback.
4. Origem muda durante C1: erro focado, sem promover token nem iniciar retirada.

Retake da primeira jornada conferiu sete Tabs dentro do diálogo, Escape e
retorno ao gatilho; depois retomou a mesma seleção pela lista. Ao fechar uma
retomada, foco volta ao botão da lista. O primeiro retake esperava o gatilho
inicial após essa reabertura; o harness foi corrigido, sem mudança de produto.

SDK/Auth e banco remoto são fixtures. Não comprova HTTP Functions/App Check,
credenciais de produção, piloto humano, leitor de tela ou zoom físico.

| Tema   | Contraste texto/superfície do diálogo |
| ------ | ------------------------------------- |
| Claro  | 14.21:1                               |
| Escuro | 14.64:1                               |
| Sépia  | 12.98:1                               |

Mobile: viewport/documento 390 px, diálogo x16–374, scrollWidth/clientWidth
356/356, sem overflow horizontal. Escuro e mobile inspecionados visualmente.
Capturas/logs fora do Git em writer-v2-portability-qa:
m38c5y-selection-{light,dark,sepia,mobile}.png, m38c5y-browser-result.json,
m38c5y-keyboard-result.json, m38c5y-integration.log e m38c5y-build.log.
Harness m38c5y-browser.mjs preserva modo --keyboard-only para o retake.
Logs iniciais com falhas preservados.

## Validações

| Verificação                       | Resultado                             |
| --------------------------------- | ------------------------------------- |
| Vitest direcionado                | 65/65                                 |
| Chromium                          | Quatro jornadas e retake de teclado   |
| Lint/tipos/build/smoke            | Positivo                              |
| Styleguide/arquitetura            | Positivo                              |
| Docs/formato/diff                 | Conferidos no fechamento              |
| Backend/Node/Rules/SDK real       | Não repetidos; servidor sem alteração |
| npm run validate/cobertura global | Não executados; fechamento de P1      |
| CI/remoto/deploy/piloto humano    | Não executados                        |

Build mantém avisos de tamanho de chunks e imports dinâmicos coexistentes;
smoke passou. Sem nova dependência, alteração de Rules ou do banco cifrado.

## Continuidade e verificação manual

Montar host futuro com tokens v2 da seleção e onCompleted que retire apenas
IDs comprovados da seleção atual. Conferir exige ação explícita; fechar e
retomar não retiram fichas. Revisão lê a ficha completa por unidade e conserva
limites reais do dispositivo, sem nome fictício de stub ou teto artificial.

Visibilidade nativa e composição do compêndio continuam obrigatórias, sem
remover ações existentes. Lifecycle/consumidores/backup/rollout/validate de
P1 e demais fases/gates da V2 permanecem abertos. Master e servidor local
preservados. Somente commit local; sem push, CI, PR, merge ou deploy.
