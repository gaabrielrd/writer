# Writer V2 — Interface da retirada recuperável de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; commit local.
- **Plano**: [119 / M38c5u](../tasks/writer-v2/execucao/119-interface-da-retirada-recuperavel-de-lore.md).
- **Decisão**: [ADR 0134](../decisions/0134-recoverable-lore-removal-ui.md).

## Funcionalidades implementadas

Host e lista de retomada são exportados por lore. A ficha exige origem C1
fixada; abrir confere metadata, preparar dirige a inspeção, revisar confere
novamente e confirmar retira explicitamente. Pedido incerto verifica evento
original; reenvio exige nova revisão e confirmação. Salvar dívida é separado
de produzir outra unidade.

Cancelamento funciona com RPC antiga pendente. Driver antigo perde a UI;
handle fresco confere cancelamento/evento sem esperar a resposta anterior.
Dívida de cancel pede repetir o cancelamento. Retirada já aceita permanece e
callback depende de prova própria, uma vez por tentativa. Estado local não
é apresentado como nova confirmação remota. Fechar preserva retomada sem aviso
de prosa não salva.

Lista pagina por conta/livro, cobre estados completos e não abre prosa/produz.
Nomes literais longos quebram linha mantendo texto integral. Host não está
montado no compêndio: ações em lote ainda precisam de adaptação coordenada.

## Critérios de aceite

- [x] Origem original obrigatória, sem fallback de token atual.
- [x] Preparar/revisar/confirmar separados; reenvio exige verificação prévia.
- [x] Dívida sem outro produtor e callback por prova própria.
- [x] Cancel independente, handle fresco e driver antigo invalidado.
- [x] Loading/erro/retry/vazio/sucesso, foco, fechamento e actor/perfil.
- [x] Recarga real, nomes longos, três temas e largura móvel.
- [ ] Composição conjunta no compêndio, incluindo ações em lote.
- [ ] Validate de P1 e demais gates de rollout/produto.

## Arquivos alterados

| Grupo                                         | Mudança                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| RemovalDialog/RemovalRecoveries               | Confirmação e retomada privadas                                  |
| ManualEditor CSS                              | Classe nova de quebra de nomes; seletores existentes preservados |
| lore index                                    | Exporta hosts e props                                            |
| RemovalDialog tests                           | 24 casos novos                                                   |
| Plano/ADRs/AGENTS/arquitetura/testes/execução | Contrato e evidência                                             |

## Testes e validações reais

**67 Vitest distintos positivos em rodadas: 24 novos e 43 regressões.**
Retakes não somam casos.

```text
Integração UI/executor/sessões:
Test Files  4 passed (4)
Tests  66 passed (66)
Duration  8.02s

Retake da UI após ajuste de invalidação:
Test Files  1 passed (1)
Tests  23 passed (23)
Duration  6.19s

Novo caso de token obrigatório:
Test Files  1 passed (1)
Tests  1 passed | 23 skipped (24)
Duration  2.54s

Build observado:
2954 modules transformed.
Smoke test do bundle OK.
```

Casos cobrem preparação sem apply, revisão/foco, origem alterada, retry do
mesmo writeId, incerteza aceita/ausente, confirmação fria, escopo errado,
dívida, cancel com RPC/resposta/local pendentes, fechamento/perfil/actor,
descoberta/paginação, mensagens de resultado e cleanup/handoff.

Lint apontou leitura do contador no cleanup e callbacks async sem await em
testes; corrigidos sem reduzir regras. Revisão também distinguiu presença
não confirmada, registro local e prova servidor, e protegeu nomes longos.

Quatro jornadas Chromium distintas passaram com UI/kit/sessão/journal/executor
reais, native Functions sobre fixture de banco e ports SDK/Auth de teste:

1. Preparar/revisar/confirmar, callback único, foco/fechamento, três temas/mobile.
2. Resposta aceita perdida, reinício do navegador, descoberta metadata e consulta
   original; um único start de retirada.
3. Apply aceito com resposta retida e resposta de cancel perdida; handle fresco
   verifica/conclui antes da resposta antiga, sem novo envio do driver velho.
4. Nome literal de 400 caracteres no modal/lista a 390 px: corpo 316/316 px,
   documento 390 px, sem truncar nem rolar horizontalmente.

Capturas dark/mobile foram inspecionadas. Contraste do texto principal sobre
card: claro 14.21:1, escuro 14.64:1, sépia 12.98:1. Modal móvel ocupa x 16–374
em 390 px. Isso não substitui avaliação humana de leitor de tela/zoom físico.

Artefatos fora do Git em writer-v2-portability-qa:
m38c5u-browser.mjs, m38c5u-browser-result.json e m38c5u-removal-*.png.
Build conserva avisos existentes de chunk/import dinâmico.

| Verificação                                | Resultado                        |
| ------------------------------------------ | -------------------------------- |
| Vitest dirigido e quatro jornadas Chromium | Positivo                         |
| Typecheck/build/smoke/lint                 | Positivo                         |
| Formato/docs/arquitetura/styleguide/diff   | Conferidos no fechamento         |
| npm run validate/cobertura global          | Não executados; fechamento de P1 |
| CI/remoto/deploy                           | Não executados                   |

## Fronteira e pendências

Não ativado no compêndio: integrar criação/edição/retirada e adaptar lote com
origem congelada/revisão, preservando os recursos existentes. Sem backend,
Rules, dependências ou env alterados.

SDK/Auth/App Check em produção, piloto humano, leitor de tela, zoom físico e
segundo dispositivo não foram exercitados. Lifecycle, consumidores/backup/
rollout/validate de P1 e demais fases/gates permanecem abertos.
Master original e servidor local preservados. Sem push, CI, PR, merge ou deploy.
