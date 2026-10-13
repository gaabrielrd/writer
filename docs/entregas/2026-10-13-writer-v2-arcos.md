# Writer V2 — Arcos, marcos e cronologia básica

- **Data**: 2026-10-13
- **Branch**: `codex/writer-v2`
- **Plano de origem**: [contrato F2-03](../tasks/writer-v2/execucao/09-arcos-e-cronologia.md)
- **Estado**: implementação, QA, regras reais, validate integral final e E2E de produção aprovados localmente; Git e CI pendentes.

## Objetivo

Permitir que autores e criadores de aventuras acompanhem arcos e acontecimentos,
relacionando cenas e entidades sem alterar a composição do manuscrito.

## Funcionalidades entregues

- **Arcos e marcos** — estado inicial, objetivo, desfecho planejado e percurso ordenado com notas próprias.
- **Cronologia básica** — acontecimentos em ordem manual e data textual livre opcional, conforme escolha do operador.
- **Referências explícitas** — vínculos a cenas, eventos e lore autorizado por identidade; origens perdidas ficam indisponíveis, sem nome ou navegação.
- **Consulta por entidade** — cenas vinculadas e itens relacionados paginados; preparação retomável do índice existente, distinguindo vínculo de menção textual.
- **Concorrência e retomada** — revisão observada, pedido estável, conflitos com preenchimento preservado, exclusão e reorganização por lotes.
- **Backup privado v6** — arcos, marcos, eventos e referências, com captura consistente das revisões; publicação e exportações editoriais conservam somente a prosa.
- **Integração contextual** — livros e aventuras usam a mesma feature; retorno da cena conserva aba/arco. Troca local de universo invalida o contexto anterior.
- **Retorno de foco ao escrever** — fechar o lore não agenda uma segunda restauração de seleção que sobrescreva o próximo movimento do cursor.

## Critérios de aceite

- [x] Autor percorre arco/marcos e criador encontra acontecimentos da aventura.
- [x] Reordenação narrativa preserva ordem e prosa do manuscrito.
- [x] Referências removidas não abrem conteúdo perdido ou de outro projeto.
- [x] Consultas reavaliam autoria e origem; regras impedem escrita direta e acesso alheio.
- [x] Jornadas narrativas funcionam por teclado, nos três temas e em 320 px.
- [x] Regressões de cenas e dos fluxos existentes concluídas na revisão final.
- [x] Validate integral aprovado após correção, documentação e atualização de AGENTS.
- [ ] Alterações registradas no Git e CI verde no SHA pertinente do PR.

## Arquivos alterados

| Arquivo/área                                                   | Mudança                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/features/narrative-planning`                              | Contratos públicos, serviço, hooks, componentes e testes da narrativa.                            |
| `src/features/books`, `adventures`, `scenes`, `editor`         | Integração contextual, guardas de autoria, backup v6 e proteção da composição/publicação.         |
| `functions/src/narrative*.mjs`, `sceneLoreIndex.mjs`           | Autorização, revisões, páginas, vínculos, índice e jobs privados.                                 |
| `functions/src/scenes.mjs`, `sceneJobs.mjs`, `index.mjs`       | Índice atômico, limpeza pelo protocolo existente e callables.                                     |
| `firestore.rules`, `firestore.indexes.json`, `tests/firestore` | Privacidade, marcadores protegidos, consultas e testes reais.                                     |
| `e2e/visual`, `vite.visual.config.ts`                          | Fixtures isoladas e 16 jornadas narrativas nos seis projetos.                                     |
| `.github/workflows/ci.yml`, `scripts/ci-contracts.test.mjs`    | Seis shards preservando a suíte inteira e os gates existentes.                                    |
| `AGENTS.md`, `README.md`, `docs/`                              | Regras novas, arquitetura, testes, ADR 0027, estado das tarefas e confirmação histórica de F2-02. |

## Testes

| Teste                                                     | Tipo               | Cobertura                                                                       |
| --------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `narrativePlanning.test.mjs`                              | Backend            | Autoria, CAS, retry, cursor, vínculos, origem perdida, índice e jobs.           |
| `narrativePlanning.rules.test.mjs` e suíte completa       | SDK real/emulador  | Acesso privado, escrita negada, marcadores e exclusão legada.                   |
| `features/narrative-planning/tests`                       | Unidade/componente | Serviço, estados, páginas, conflitos, referências, navegação e invalidação.     |
| `BookPage`, `AdventurePage`, backup/exportação/publicação | Integração         | UID e autoria, troca de universo, JSON v6 e projeção pública sem planejamento.  |
| `narrative-planning.visual.ts`                            | Chromium           | 16 jornadas × seis projetos, teclado, temas, 320 px e operações pela UI.        |
| `ci-contracts.test.mjs` e inventário Playwright           | Contrato           | Gates preservados; 744 identidades em seis shards, sem omissões ou duplicações. |

Resultados reais até este checkpoint:

```text
Validate integral: 142 arquivos / 1.195 testes frontend
Scripts: 77 testes; backend: 133 testes
Cobertura: 93,17 statements / 86,69 branches / 91,90 functions / 95,34 lines
Regras completas: tests 74, pass 74, fail 0, skipped 0
Regras completas: duration_ms 31999.5501
Narrativa final: 96 passed; skipped 0; unexpected 0; flaky 0
Narrativa final: 544,418 s; sem retries
Cenas — regressão final: 96 passed; skipped 0; unexpected 0; flaky 0
Cenas — regressão final: 498,592 s; sem retries
Fluxos existentes — primeira rodada: 89 passed; 1 failed (4,5 min)
WYSIWYG pós-correção: 18 passed (3 repetições × seis projetos), 69,401 s
Cenas focais pós-correção: 12 passed, 99,999 s
Fluxos existentes — rodada final após correção: 90 passed, 261,031 s
Inventário: 744 únicos; shards 124/124/124/124/124/124
Inventário: duplicações 0; omissões 0; extras 0
Smoke test do bundle OK.
```

O primeiro QA teve 14/16 aprovações e duas falhas no roteiro (paginação e troca de
UID por navegação completa). A execução seguinte teve 1/3 aprovações e revelou um
defeito real: contexto de universo antigo após desvinculação pelo formulário do
livro. A integração passou a invalidar o Planner por UID/projeto/universo, com
regressão unitária. Quatro percursos dirigidos passaram depois da correção; a
rodada final de 96 aprovou todas as jornadas. Revisão independente também corrigiu
livro alheio retornado de cache, cobrindo carga, refresh e guarda de renderização.

A primeira rodada dos 90 fluxos existentes aprovou 89 e falhou no WYSIWYG
mobile-dark: após fechar lore e mover o cursor até o fim, a digitação apareceu
no meio de “Lia”. Trace preservado em `writer-v2-arcos-qa/core-regression-90/`.
Um teste novo com o editor real reproduziu a janela entre mover a seleção DOM e
receber `selectionchange`: o frame tardio devolvia o cursor à palavra anterior.
O mesmo teste passou após restaurar o foco sincronamente no efeito pós-fechamento,
com guarda de editor destruído. Os 25 testes de RichEditor/AIAdapter passaram;
lint/tipos/formato também. A simulação JSDOM não implementa Control+End nativo;
o navegador confirmou separadamente a causa e o candidato. Um servidor temporário,
com configuração fora do checkout, serviu somente o RichEditor anterior de `f4449a5`.
No Android emulado, manter o callback de foco e liberá-lo no keyup de End enquanto
DOM estava no fim/ProseMirror ainda na posição 3 devolveu imediatamente DOM para
“Li”; o controle sem essa intervenção passou. O candidato com o mesmo gatilho
preservou o fim e a digitação, sem callback de foco pendente. O diagnóstico controla
o agendamento; não substitui a rodada intacta de regressão, ainda pendente.
Logs em `writer-v2-arcos-qa/caret-diagnostic-baseline-causal/` e
`writer-v2-arcos-qa/caret-diagnostic-candidate-causal/`. Nenhum teste original,
timeout ou resposta de rede foi alterado. A revisão do candidato não encontrou P0–P2.
O teste original WYSIWYG passou 18/18 após a correção, com três repetições por
projeto. Duas jornadas existentes de cenas passaram 12/12: escrita/Undo/autosave
em 320 px e movimento entre capítulos preservando prosa/referência privada.
Ambas as rodadas tiveram zero skips, falhas, flaky ou retries. A nova rodada
completa dos 90 fluxos existentes passou 90/90 em 261,031 s, também sem skips,
falhas, flaky ou retries. Dez portas próprias e últimos PIDs de QA foram
conferidos encerrados; screenshots focais de cena 320 px inspecionados nos três temas.

## Validações executadas

| Comando                                        | Resultado                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `npm ci --prefix functions`                    | 249 pacotes instalados; auditoria sem vulnerabilidades.                   |
| `npm run validate` — primeira integral         | Verde, incluindo lint, tipos, cobertura, scripts, backend, build e smoke. |
| `npm run validate` — integral após revisão     | Verde; 142 arquivos/1.196 testes frontend, 77 scripts e 133 backend.      |
| `npm run test:rules`                           | 74/74 verdes no emulador demo; processos próprios encerrados.             |
| Playwright narrativo nos seis projetos         | 96/96 verdes, sem skip ou retry.                                          |
| Playwright de cenas nos seis projetos          | 96/96 verdes em 498,592 s, sem skip ou retry.                             |
| Revisões independentes do backend e integração | Sem bloqueadores P0–P2 remanescentes.                                     |
| `git diff --check`                             | Verde no checkpoint.                                                      |
| E2E de produção intacto                        | Exit 0; seis passaram e um skip legado por falta da imagem Windows.       |

Logs e relatórios locais estão em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/`:
`writer-v2-arcos-validate-initial.log`, `writer-v2-arcos-rules-full.log`,
`writer-v2-arcos-validate-reviewed.log`,
`writer-v2-arcos-shard-inventory.json`, `writer-v2-arcos-qa/narrative-final-96/`
e `writer-v2-arcos-qa/scenes-regression-96/`. O JSON/HTML de cenas é completo;
seu run.log preserva os chunks a partir do cenário 39.

### Validação final após revisão — 2026-10-13

Após a correção de foco, QA e atualização da documentação/AGENTS, `npm run validate`
terminou com exit 0. Resultados reais:

```text
Test Files  142 passed (142)
Tests  1196 passed (1196)
Duration  116.65s
All files  93.18 statements / 86.71 branches / 91.90 functions / 95.35 lines
Scripts: tests 77, pass 77, fail 0
Backend: tests 133, pass 133, fail 0
2657 modules transformed; built in 1.58s
Smoke test do bundle OK.
```

Gates de arquitetura, docs, styleguide, skills, formato, lint e tipos verdes.
Limites de cobertura mantidos. Os avisos preexistentes de bundle/importação
continuam visíveis; não houve dependência nova. O checkout original `master`
permaneceu limpo em `522ccaa`, sem alterações de trabalhos paralelos.

### E2E de produção local — 2026-10-13

Rebuild e preview reais, sete casos intactos em um worker, rede e configuração
preservadas. Apenas diretórios/reporters de evidência foram configurados.

```text
6 passed (17.4s)
1 skipped
unexpected 0; flaky 0; exit 0
```

O skip é a condição preexistente de `styleguide.spec.ts`: “Sem imagem de referência
para win32”. Diferente do checkpoint de F2-02, esta rodada executou a suíte e não
teve casos não executados por timeout anterior. Sem falhas, não houve trace,
conforme `retain-on-failure`. Relatórios em `writer-v2-arcos-qa/production-final/`.
Processos próprios identificados encerrados e nenhum novo listener restante.
O CI do SHA novo ainda precisa comprovar os checks Linux, inclusive o screenshot.

## Primeiro CI e ajuste dirigido dos testes — 2026-10-13

O incremento foi registrado/enviado em `3b79591ee95e85345f13c3e76890be3d81a31c5f`,
com hooks ativos (pre-push: 142 arquivos/1.196 testes, typecheck verde). O
[CI desse SHA](https://github.com/gaabrielrd/writer/actions/runs/38450534231) aprovou
validate Node 24, auditoria e produção 7/7 em 17,3 s; as
[regras](https://github.com/gaabrielrd/writer/actions/runs/38450533850) passaram.
Node 22 falhou em dois testes de `PersonaManager.test.tsx`: o primeiro excedeu
5.000 ms e o seguinte recebeu `lVoz nova` em vez de `Voz nova` (141 arquivos/
1.194 testes aprovados, dois testes falhos). Outros shards ainda executavam
quando esse checkpoint foi registrado; o incremento não está concluído.

A implementação instalada de user-event agenda `setTimeout(0)` entre teclas.
O formulário de personas usa campos controlados sem debounce nem contrato de
intervalo entre caracteres. O timeout do runner rejeita o teste sem cancelar sua
Promise de digitação, e cada tecla usa o elemento focado naquele instante. Esse
mecanismo permite contaminação do teste seguinte; a atribuição exata do `l` do
log permanece inferência, sem trace de input.

Os cinco casos passaram a usar `userEvent.setup({ delay: null })`, conservando
ações, teclado/slider, asserções e timeout de 5 s. Não mudou produto, configuração
global, cobertura, skips ou retries. Baseline e candidato dirigidos passaram
5/5 em Node 24; isso não reproduz nem comprova Node 22. Lint, formato e revisão
independente verdes, sem P0–P2. Validate integral e novo CI ainda necessários.
Logs externos: `writer-v2-arcos-ci-node22.log`,
`writer-v2-persona-timers-before.log` e `writer-v2-persona-timers-after.log`.

### Fechamento do primeiro CI e correções — 2026-10-13

O primeiro CI terminou com falha exclusivamente no validate Node 22. Os seis
shards e o check E2E agregado passaram: 728 visuais diretamente aprovados,
quatro após retry e 12 skips preexistentes, totalizando os 744 casos. O maior
shard levou 11,4 min de testes e 12 min 42 s de job, dentro dos 15 min preservados.

Um retry foi o autocomplete legado desktop-dark (esperava uma chamada, recebeu
duas), ainda sem correção comprovada. Os outros três foram a mesma jornada nova
de reorganização em desktop-dark, desktop-light e mobile-sepia. Os logs mostram
`Expected Array []` e os 25 eventos corretos recebidos: `allTextContents()`
capturava a lista antes de carregar. O roteiro passou a exigir 25 itens antes
da captura; comparação exata da ordem/data, checkpoint, lock, recarga e retomada
permanecem. Não houve mudança de produto, timeout, retry ou dados esperados.
Lint e formato dirigidos passaram. Rodada focal: 18/18 em 43,190 s, seis projetos
com três repetições, dois workers, sem skips/falhas/flaky/retries. Porta e processos
próprios confirmados encerrados. Relatórios em
`writer-v2-arcos-qa/narrative-rebalance-ci-correction-18/`.

O validate integral após o ajuste de personas terminou com exit 0: 142 arquivos/
1.196 testes frontend, 77 scripts, 133 backend; cobertura 93,18/86,71/91,90/95,35.
Frontend levou 130,77 s; build 2,08 s, smoke verde. A linha de pré-condição E2E
recebeu lint/formato dirigidos depois de aplicada; o próximo CI valida o snapshot
completo. Log: `writer-v2-arcos-ci-correction-validate.log`.

As correções não alteram o produto validado pelos 312 percursos locais anteriores.
Não repetimos as suítes de browser/regras sem mudança de produto; verificações
dirigidas e novo CI são necessários para encerrar as falhas dos testes.

### Segundo CI e diagnóstico de autocomplete — 2026-10-13

O snapshot `47fe51c` passou remotamente no validate Node 22/24, auditoria,
produção (7/7 em 18,2 s) e regras Firestore (74/74, zero falhas/skips).
Os 96 cenários narrativos passaram diretamente, sem retry. O CI completo
falhou: 729 visuais diretos, dois flaky legados de autocomplete desktop-dark/light,
12 skips preexistentes e autocomplete desktop-sepia reprovado nas duas tentativas.
[Execução](https://github.com/gaabrielrd/writer/actions/runs/38453828337).
O gate continua pendente e F2-04 não começou.

Os traces mostram o relógio pausado durante a segunda digitação, 50 ms virtuais
antes das setas e pedido extra depois de avançar 850 ms. Não registram seleção PM
ou efeitos React; a origem exata no CI não pode ser atribuída apenas pelos traces.

Diagnóstico externo conservou gestos nativos, dados, asserções e tempos do roteiro.
Controle observador sem intervenção passou 3/3 em desktop-sepia. Controle causal
agrupou somente a entrega de `selectionchange` enquanto o DOM selecionava “.”
e voltava ao mesmo cursor; não alterou DOM, estado PM, pedidos ou timers.
PM permaneceu colapsado no mesmo ponto e o debounce sobrevivente fez o pedido 2
550 ms depois, reproduzindo a mesma asserção reprovada. Isso demonstra um mecanismo
compatível com a falha remota, sem comprovar que todos os retries tiveram essa causa.
Evidências externas em `writer-v2-arcos-qa/autocomplete-native-diagnostic/`,
incluindo logs, traces e `coalesced-baseline/events.json`. O primeiro bootstrap
externo falhou antes de executar testes por cwd incorreto; seu log foi preservado.
Portas e processos próprios dos controles foram confirmados encerrados.

O candidato cancela imediatamente a intenção de navegação e registra revisão nula,
com contador monotônico para uma nova digitação. A revisão participa do contexto
da oferta, impedindo aceite antigo; pedido manual posterior continua permitido.
O mesmo controle causal passou 1/1 em 15,3 s, com script SHA256
`C4E9AC561EC265AB4AE2100159DC9C38AE6FDAEDC4CA2B50B0100FE4DC2263CE`
inalterado. O log demonstra timer cancelado no keydown antes da seleção DOM.
Preservar distinção entre intervenção controlada e trace remoto sem estado PM.

Baseline unitário limpo teve três regressões novas reprovadas de forma observável
e 20 casos antigos verdes: navegação após 50 ms, navegação no mesmo batch antes
dos efeitos passivos e invalidação da oferta com revisão nula. O candidato passou
23/23. Revisão identificou a mesma janela no Escape; teste adicional reprovou
antes com pedido 1, esperado 0, preservando prosa/cursor. Registrar revisão nula
também no Escape corrigiu o caso. Rodada final passou 49/49 em quatro arquivos,
7,80 s, incluindo editor/adapter e todas as novas regressões, sem warnings/exceções.
Os testes simulam eventos/alteração DOM em JSDOM sem comandos internos PM;
comprovação nativa tem evidência separada. Logs em `writer-v2-arcos-qa/`:
`autocomplete-navigation-unit-negative-clean.log`, `autocomplete-escape-unit-negative.log`
e `autocomplete-navigation-unit-final.log`. Tentativas anteriores de suporte
JSDOM com geometria ausente/drain de timer e warnings foram preservadas, mas não
contam como negativos limpos nem validação final.

O roteiro visual principal, seus tempos/contagens e configuração continuam intactos.
Rodada intacta final passou 18/18 em 58,085 s: seis projetos, três repetições,
dois workers, retries 0, zero falhas/skips/flaky. Hash do roteiro preservado:
`252718521CA3F0DF3DE863477A2B15E264FA6FB97BC013632BFE95D40CBC8216`.
Relatório em `writer-v2-arcos-qa/autocomplete-final-intact-18/`.
O bootstrap de uma rodada interrompida antes de executar casos foi preservado
separadamente e não conta no total. Portas/processos próprios confirmados encerrados.
Revisão final independente sem P0–P2 remanescentes. Validate integral e CI do SHA
corrigido ainda pendentes neste checkpoint; limites, retries e timeouts preservados.

Validate integral do candidato final terminou com exit 0: 143 arquivos/1.200 testes
frontend, 77 scripts e 133 backend, sem falhas/skips. Cobertura
93,21% statements, 86,74% branches, 91,90% functions e 95,38% linhas, limites
mantidos. Frontend 122,46 s; build 3,36 s; arquitetura, docs, styleguide, formato,
lint, tipos e smoke verdes. Log externo `writer-v2-arcos-autocomplete-validate.log`.
Avisos preexistentes de bundle/importação dinâmica permanecem. A atualização final
de evidência recebeu checagens dirigidas; Git e CI do candidato ainda necessários.

## Fora do escopo

Campanhas jogáveis, calendário avançado, análise por IA, restauração integral,
pagamentos, merge e deploy. Condições humanas e comerciais permanecem nas tarefas próprias.

## Limitações e pendências conhecidas

- Fixtures comprovam interface e transporte simulado; autorização, regras e atomicidade têm evidência separada de backend/SDK.
- Invalidação após troca de universo depende do refresh dos metadados locais; não promete atualização remota em tempo real entre abas.
- Novas funções, regras e índices precisam de implantação autorizada para uso real.
- CI `47fe51c` falhou no autocomplete legado; novo CI do candidato corrigido ainda pendente. E2E local anterior tem um skip legado por ausência da referência Windows.
- Node local 24 com engine 22 de functions produziu aviso; validação passou. Avisos preexistentes de bundle grande/importação dinâmica permanecem.
- Falha de autocomplete reproduzida em controle causal e corrigida localmente, com regressões e roteiro intacto verdes; aguarda confirmação no CI. Hosting sem sharding continua um risco separado.

## Como verificar manualmente

1. Abrir livro ou aventura no Estúdio e escolher Arcos e cronologia.
2. Criar um arco, preencher objetivo e adicionar marcos; criar eventos, inclusive sem data ou com “3º dia do inverno”.
3. Mover marcos/eventos e conferir que cenas, capítulos e prosa conservaram sua ordem.
4. Vincular cena/evento/entidade, consultar Entidades e abrir uma cena; retornar ao mesmo arco.
5. Remover a origem ou desvincular o universo pelo formulário do livro; conferir referência indisponível e ausência de navegação para a origem perdida.
6. Exportar JSON privado e verificar v6; comparar Markdown/publicação, que não incluem notas narrativas.
7. Repetir por teclado em 320 px nos temas claro, escuro e sépia.
