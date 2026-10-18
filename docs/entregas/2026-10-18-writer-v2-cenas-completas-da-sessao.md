# Writer V2 — Cenas completas na preparação da sessão

- **Data:** 2026-10-18
- **Branch:** `codex/writer-v2`
- **Plano:** [F2-08 S2B](../tasks/writer-v2/execucao/23-cenas-completas-na-preparacao-da-sessao.md).
- **Estado:** implementado e validado localmente; CI do novo head pendente no [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21).

## Objetivo

Consultar uma cena capturada com seu planejamento, principal, adicionais e
ilustrações durante a preparação privada, preservando o texto próprio da sessão.

## Funcionalidades entregues

- Fichas/Cenas em um host, com uma operação e recuperação por usuário/campanha.
  Kind omitido mantém o contrato lore anterior; servidor filtra antes de paginar.
- Plano separado de content; principal lido uma vez como bloco, adicionais na
  ordem capturada, audiência informativa e Arquivo explícito. Campo de planejamento
  ausente é diferente de vazio; ownArchived do principal permanece null.
- Ilustração por ação explícita, com alt/legenda e nova autorização após download
  e derivação. Nenhuma URL/caminho de Storage é entregue.
- Cena removida da base ativa após adoção fica neutra, sem legado/fallback; vínculo
  pode ser removido sem a origem. Lore legado conserva seu contrato independente.
- Hashes e janelas completos antes de exibir texto; troca/foco/fechamento limpa
  derivados e impede retorno tardio. S1, original e outra mesa são preservados.
- Mesmos journal metadata-only, CAS/Web Locks, recibos/fences e inventário C4 v3.
  Cancelamento/histórico continuam acessíveis após tombstone da sessão.

## Critérios de aceite

- [x] Consultar plano, principal e adicionais sem duplicar prosa nem copiar para S1.
- [x] Paginar blocos e consultar Arquivo e ilustração explicitamente.
- [x] Conferir sessão/vínculo/revisões/coleção/sourceContext antes de corpo ou mídia.
- [x] Recusar parent incorreto, contexto/cursor trocados e imagem revogada durante I/O.
- [x] Preservar lore anterior, recuperação, preparação própria e outra mesa.
- [x] Validar localmente, revisar e documentar sem reduzir os portões existentes.
- [ ] CI do novo head verde; habilitação/rollout não executados.

## Arquivos alterados

| Área                                                  | Mudança                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `functions/src/campaignSessionScenes.mjs` e contratos | Três leitores sob gate da sessão e projeções fechadas                          |
| `campaignSessionReferences.mjs` e contratos           | Alvo scene opt-in, filtro, paginação e CAS compartilhado                       |
| `campaignBaseRead.mjs`                                | Validador puro de descritores antes da seleção/I/O; comportamento B preservado |
| `functions/src/index.mjs`, HTTP, índices              | Exports/dispatch, private,no-store e índice kind/createdAt                     |
| `src/features/campaign-session-references`            | Host único, picker/leitor, contratos e verificação de janelas                  |
| `campaignRecoveryClosure.ts`                          | Rótulo comum para pedidos lore/scene                                           |
| `scripts/check-architecture.mjs`                      | Tipos/verificador puro B permitidos; loaders/readers continuam fechados        |
| Testes unitários, SDK e visual                        | Comportamentos, gates, corridas e compatibilidade                              |
| Docs/ADR/AGENTS                                       | [ADR 0039](../decisions/0039-session-scene-material.md), regras e evidência    |

## Testes e revisão

O cliente teve 72 casos afetados únicos comprovados, incluindo 25 novos no total
global. Um lote dirigido teve 69/70: o negativo anterior tratava scene como tipo
inválido; mudou somente para future-kind e os afetados passaram. Uma fixture
unitária repetia cursor indevido e foi corrigida sem relaxar a proteção. A revisão
independente encontrou dois P2 reais: refresh da primeira página com continuação
era falso ciclo; selecionar opção atual limpava RAM sem recarregar. Ambos tiveram
testes negativos antes/depois e correção local, sem alterar Dropdown global.
Rechecagem estática não encontrou bloqueadores restantes.

Servidor: 11 casos novos de cenas mais regressões S2A/B. Root executou 20 testes
de integração HTTP/arquitetura, todos verdes, 481,8451 ms; o rótulo do closer teve
1/1 dirigido verde (21 skips por filtro), 6,17 s. O validate final inclui todos.

SDK real: primeiro lote **5/5**, zero falhas/skips, **96.795,1256 ms**. Cinco famílias
cobrem compat lore/kind, SDK direto fechado, captura real/plano/main compartilhado,
Unicode/páginas/arquivo, escopos/adoção sem cena/legado U1, revogação de mídia e
histórico/fence/C4v1/v2/v3. Reforço de cursores reais repetiu só a família 2: a nova
expectativa exigia cursor-invalidated onde shape incompatível é recusado antes
com invalid-argument; primeira repetição falhou por expectativa (30.458,0982 ms).
Corrigiu-se só a expectativa, mantendo as negações; repetição final **1/1** verde,
**26.386,2769 ms**. São cinco famílias únicas, sete execuções, seis positivas e uma
falha de teste preservada. Storage/derivador injetados. Três controles únicos de
fixture ficaram positivos; primeiro lote teve 2/3 por expectativa que omitia items,
corrigida e repetida somente no afetado.

Chromium: **12/12**, zero retries/skips/flaky/falhas. Lote inicial 2/2 em
**19.327,894 ms**, restantes 10/10 em **56.025,005 ms**, total **75.352,899 ms**.
Root leu os JSONs brutos e decodificou 12 anexos de console e 12 de isolamento:
console.error, runtime/pageerrors e rede externa em zero. 24 eventos de captura;
root inspecionou seis PNGs de picker/plano nos três temas e três de imagem em
320×740: textos e ações legíveis, rolagem interna/footer preservado, sem corte
horizontal. A imagem da fixture é sintética e não comprova qualidade de uma
ilustração real. Transporte simulado, Web Locks/storage reais. Nenhuma alteração
de produto/fixture/spec entre os dois lotes. Locators S2A foram ajustados
mecanicamente ao rótulo geral, preservando asserções, sem repetir sua matriz.

## Validações executadas

```text
Test Files  189 passed (189)
     Tests  1935 passed (1935)
  Duration  147.21s
All files: statements 90.57 | branches 84.88 | functions 90.41 | lines 93.2
scripts: tests 84, pass 84, fail 0, skipped 0, duration_ms 9420.0269
Functions: tests 395, pass 395, fail 0, skipped 0, duration_ms 3792.9094
built in 1.78s
Smoke test do bundle OK.
WRITER_SESSION_SCENES_VALIDATE_EXIT=0
```

Cobertura HTML: instruções **17.008/18.778**, ramos **14.627/17.231**, funções
**4.407/4.874**, linhas **15.574/16.709**. Skills, arquitetura, links, estilo,
formato, lint, tipos e sintaxe verdes. Limites, exclusões, retries/timeouts,
hooks e dependências preservados; Functions já instaladas no checkpoint S2A,
sem mudança de dependências neste incremento. Build conserva avisos anteriores
de chunk grande e import DOCX misto. Nenhuma falha no validate de fechamento.

Após o validate, somente documentação/AGENTS foram realinhados. Não repetir suíte
global ou matriz visual por edição documental; checagens dirigidas de docs/formato
registradas no fechamento. Master original permanece limpa em 522ccaa.

## Fora do escopo

Pistas, missões e pendências S3, jogadores, revelação, consequências, IA, backup,
histórico, legado de cenas, concatenação integral, edição do original e mídia
permanente. S2B não conclui F2-08 inteira. Sem merge, deploy ou dados reais alterados.

## Limitações e pendências conhecidas

CI do próprio head pendente. S2A/d9b7988 passou na CI geral e regras 145/145;
essa evidência é distinta. O índice sessionId/deleted/target.kind/createdAt/name
precisa existir em produção; emulador não comprova implantação. Habilitar exige
as oito APIs, escritores/guardas, regras/índices e C4 conjuntos e drenagem de
versões antigas. C4 continua v3, sem novos namespaces ou pins por vínculo.

Não comprovados: Storage real, rollout, piloto humano, leitor de tela, zoom
físico 200% ou segundo dispositivo. Referência humana S2B **34/56/92 h**, confiança
baixa; não equivale a horas realizadas/restantes ou data de lançamento. A baseline
histórica permanece distinta e as condições comerciais/humanas continuam abertas.

## Evidências e verificação manual

Artefatos em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9`:
`writer-v2-session-scenes-validate.log` e
`writer-v2-session-scenes-qa/{qa-summary.json,captures-final.json,sdk-first.log,sdk-affected.log,sdk-final.log,desktop-first,remaining,review}`.
Emuladores 63518/62798/49401 e Vite 64991 encerrados.

1. Abrir sessão salva, manter preparação ainda não enviada e escolher Cenas.
2. Vincular cena; consultar plano, principal, adicionais após primeira página,
   Arquivo e ilustração. Trocar/fechar e conferir foco/texto S1.
3. Atualizar picker paginado e selecionar filtros atuais: conteúdo permanece.
4. Adotar base sem a cena; consultar, conferir linha neutra e remover vínculo.
5. Recuperar pedido scene sem resposta ou encerrá-lo explicitamente; excluir
   campanha, encerrar snapshot antigo e conferir a outra mesa preservada.
