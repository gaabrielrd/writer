# Writer V2 — Referências de lore da sessão (F2-08 S2A)

- **Data:** 2026-10-18
- **Branch:** `codex/writer-v2`, checkout isolado
- **Plano de origem:** [S2A](../tasks/writer-v2/execucao/22-referencias-de-lore-da-sessao.md)
- **Estado:** implementado e validado localmente; CI do novo head pendente no [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21).
- **Decisão:** [ADR 0038](../decisions/0038-session-lore-references.md).

## Objetivo

Permitir ao mestre vincular e consultar fichas atuais ou legadas autorizadas na
preparação de uma sessão, mantendo sua escrita e a recuperação dos pedidos quando
a origem ou a sessão deixa de estar disponível.

## Funcionalidades entregues

- **Fichas por sessão:** seletor paginado, vínculo único por ficha, leitura privada,
  remoção e novo vínculo com outra identidade, sem modificar o original.
- **Legado autorizado:** variantes e fichas conservadas por C3B continuam consultáveis;
  perder o universo atual não oculta legado de outro universo ainda autorizado.
- **Indisponibilidade explícita:** vínculo sem origem fica neutro, sem nome ou alvo
  antigo, e pode ser removido. A preparação autoral S1 continua acessível.
- **Recuperação independente:** controles fora do diálogo confirmam recibos históricos
  após exclusão da sessão; cancelamento explícito impede um pedido desconhecido
  de executar depois. Não promete desfazer evento já confirmado.
- **Rascunho preservado:** atualizar/adotar base ou observar nova projeção C2 invalida
  somente a consulta derivada. Foco dos diálogos aninhados e texto dirty permanecem.
- **Exclusão integrada:** C4 v3 limpa vínculos/controles e sanitiza recibos/fences;
  checkpoints antigos v1/v2 conservam seus inventários e outras mesas ficam intactas.

## Critérios de aceite

- [x] Vincular, ler, remover e revincular ficha efetiva ou legada autorizada.
- [x] Duplicata e conflito de revisão não criam escrita parcial.
- [x] Sessão ativa/revisão são conferidas antes de candidatos ou corpo.
- [x] Material revogado não reaparece por resposta atrasada, foco ou cache do formulário.
- [x] Recibo histórico/fence não exigem corpo ou sessão ativa; outra aba/UID é preservada.
- [x] Rascunho S1 e sua pendência sobrevivem à invalidação do material.
- [x] C4 v1/v2/v3, tombstones, controle perdido e cursores antigos têm negativos.
- [x] Duas jornadas em seis perfis, três temas, teclado/foco e 320 px.

Estes critérios concluem o recorte técnico local S2A. F2-08 completa continua aberta:
cenas/blocos, pistas, missões e pendências têm S2B/S3; CI deste novo head ainda falta.

## Arquivos alterados

| Área                                                                   | Mudança                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `functions/src/campaignSessionReference{Contracts,s}.mjs`              | Cinco APIs, gates, cursores, recibos/fences e projeção C2.             |
| `functions/src/campaignBaseContracts.mjs`, `campaignLoreContracts.mjs` | Resolução opcional de origem com ausência explicitamente classificada. |
| `functions/src/campaignDeletion*.mjs`, `index.mjs`                     | Inventário v3 e composição dos callables.                              |
| `src/features/campaign-session-references/`                            | Serviço/validação, journal, recuperação, painel e controles públicos.  |
| `src/features/campaign-lore/`                                          | Picker/renderer públicos puros e notificação de projeção observada.    |
| `src/features/campaign-sessions/`, `campaigns/`                        | Slot salvo, composição estável, pendências e closer C4.                |
| `firestore.rules`, `firestore.indexes.json`                            | SDK fechado e consultas limitadas de lista/duplicata.                  |
| `e2e/visual/`, `tests/firestore/`                                      | Transporte simulado, jornadas e SDK com gates reais.                   |
| `scripts/check-architecture*`, `AGENTS.md`, `docs/`                    | Fronteiras verificáveis, contratos, reestimativa e evidência.          |

Sem dependência nova. CLAUDE.md continua coerente. O checkout original master foi
conferido limpo e preservado; artefatos de execução ficam fora do repositório.

## Testes

| Teste                                                        | Tipo        | Comportamento                                                                                     |
| ------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------- |
| `campaignSessionReferences.test.mjs`                         | domínio     | 11 famílias: projeção, CAS, duplicata, paginação, histórico/fence, máscara e gate antes de corpo. |
| `campaignSessionReferencesCleanup.test.mjs`                  | domínio     | Três casos: limpeza paginada v3, limites e retomada das posições v2.                              |
| `campaign-session-references/tests/`                         | cliente     | ABI fechada, cancelamento integral, Web Locks/CAS, persistência, UID e respostas tardias.         |
| `sessionReferenceSlot.test.tsx`, `loreDisplay.test.tsx`      | componentes | Slot S1 sem acoplamento, foco aninhado, picker/renderer e projeção invalidada.                    |
| `CampaignPage.test.tsx`, `campaignDeletionControls.test.tsx` | integração  | Composição real, rascunho e encerramento sem apagar outro controle.                               |
| `campaign-session-references.rules.test.mjs`                 | SDK real    | Cinco famílias: autorização, captura/adoção legada, concorrência/páginas, histórico/fence e C4.   |
| `campaign-session-references.visual.ts`                      | Chromium    | Duas jornadas × seis perfis com transporte simulado.                                              |

Dirigidos frontend: **47/47** únicos novos, além da integração da raiz. Uma rodada
de regressão C2/host/closer passou **67/67**; o caso ampliado de invalidação em RAM
passou **1/1**. Backend teve 10/10 +23 regressões Base/C2 =33/33, e um caso adicional
isolado positivo; a suíte final abaixo é a autoridade global.

As primeiras falhas de unidade foram expectativas de shape de cursor, seleção de
metadados e mensagem DOMException no teste. O produto permaneceu fechado. A primeira
execução global parou em sete erros de lint de um novo mock de integração;
tipagem/sintaxe do teste corrigidas, o validate completo passou sem reduzir regras.

### SDK e navegador

SDK: primeira execução **3/5 positivas**, **176.907,5766 ms**. Duas falhas vieram de
operationId reutilizado entre campanhas no helper S1. Corrigido o preparo, repetiram-se
somente as duas famílias afetadas: **2/2**, **58.066,6087 ms**, zero skips/falhas.
Depois, o driver passou a usar a revisão do recibo em vez de relistar todos os vínculos
a cada mutação; preservou 27 mutações reais e verificações finais. Somente famílias
3 e 5 foram repetidas: **2/2**, **81.568,5739 ms**. A terceira caiu de 94,627 para
49,957 s e a quinta de 45,633 para 30,819 s. São cinco famílias únicas comprovadas,
nove execuções, sete positivas e duas falhas de preparo; nenhum batch único 5/5 é alegado.
Storage permanece injetado. Três controles dirigidos da fixture também passaram.

Chromium: **12/12**, zero retries/skips/flaky/falhas. Desktop inicial 2/2 em
**15.827,277 ms** e dez restantes em **54.510,850 ms**, total **70.338,127 ms**.
Doze anexos de console e doze de isolamento foram decodificados: console.error,
pageerror e requisições externas em zero. Web Locks/storage reais; transporte simulado.
18 capturas; a raiz inspecionou seis PNGs 320×740 do seletor/leitor nos três temas,
sem corte horizontal e com ações/rolagem legíveis. Não houve mudança de produto,
fixture ou spec entre os dois lotes nativos.

## Validações executadas

```text
Test Files  186 passed (186)
     Tests  1910 passed (1910)
  Duration  143.94s
All files: statements 90.65 | branches 84.98 | functions 90.35 | lines 93.21
scripts: tests 83, pass 83, fail 0, skipped 0, duration_ms 9333.2792
Functions: tests 383, pass 383, fail 0, skipped 0, duration_ms 2962.1547
built in 1.38s
Smoke test do bundle OK.
WRITER_REFERENCES_VALIDATE_EXIT=0
```

Cobertura HTML: instruções **16.644/18.359**, ramos **14.281/16.804**, funções
**4.337/4.800**, linhas **15.239/16.349**. Limites/exclusões, retries/timeouts e hooks
permanecem intactos. Skills, arquitetura, links, estilo, formato, lint, tipos e
sintaxe passaram no validate. `npm ci --prefix functions`: 251 pacotes, zero
vulnerabilidades; avisos existentes de engine Node22/local24 e dependências antigas.
Build conserva avisos anteriores de chunk grande e import DOCX misto.

Após o validate, somente documentação/AGENTS foram atualizados; checagens
de formato, links, arquitetura e diff passaram, sem repetir matriz nativa ou suíte
global por edição documental. A revisão de 68 arquivos não encontrou novos .env,
marcadores de credenciais ou artefatos acima de 5 MiB.

## Fora do escopo

Cenas/blocos/imagens, lore vivo independente, ordem manual dos vínculos, notas no
vínculo, pistas/missões, jogadores, compartilhamento, consequências, IA, backup,
histórico e condução ao vivo. Não houve merge, deploy ou alteração de dados reais.

## Limitações e pendências conhecidas

CI do próprio head pendente. A CI verde de S1/c95253a é evidência distinta. Habilitação
exige implantar APIs, guardas, índices/regras e C4 start/advance conjuntamente e
drenar versões antigas, inclusive start v2. Atualizar apenas advance não basta.
IDs mínimos de vínculo ficam no servidor após tombstone da sessão até C4; nenhuma
promessa de apagamento físico imediato. Texto derivado nunca é copiado para S1.

Não comprovados: rollout/índices em produção, Storage real, leitor de tela, zoom
físico 200%, segundo dispositivo ou piloto humano. Estimativa humana de S2A foi
reaberta para referência 34/54/84 h, com confiança baixa; não equivale a horas
gastas/restantes nem data. A baseline antiga da timeline permanece histórica.

## Evidências e verificação manual

Artefatos em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9`:
`writer-v2-session-references-validate.log`, `writer-v2-session-references-validate-lint-first.log`
e `writer-v2-session-references-qa/{qa-summary.json,captures-final.json,sdk-first.log,sdk-affected.log,sdk-optimized.log,desktop-first,remaining}`.
Emuladores 61439/62318/61014 e Vite 64991 foram encerrados.

1. Abrir sessão salva; escolher ficha efetiva/legada, consultar e remover vínculo.
2. Escrever preparação ainda não enviada; fechar leitor/seletor e conferir foco/texto.
3. Tornar origem indisponível; consultar vínculos, conferir linha neutra e remover.
4. Com resposta perdida, recarregar e confirmar o pedido original ou encerrá-lo;
   outro controle não é substituído. Sessão apagada conserva acesso à recuperação.
5. Excluir a campanha e encerrar o snapshot pelo closer; outra mesa permanece intacta.
