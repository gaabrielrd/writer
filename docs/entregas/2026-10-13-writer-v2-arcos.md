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

## Fora do escopo

Campanhas jogáveis, calendário avançado, análise por IA, restauração integral,
pagamentos, merge e deploy. Condições humanas e comerciais permanecem nas tarefas próprias.

## Limitações e pendências conhecidas

- Fixtures comprovam interface e transporte simulado; autorização, regras e atomicidade têm evidência separada de backend/SDK.
- Invalidação após troca de universo depende do refresh dos metadados locais; não promete atualização remota em tempo real entre abas.
- Novas funções, regras e índices precisam de implantação autorizada para uso real.
- CI deste incremento ainda pendente neste checkpoint; E2E local tem um skip legado por ausência da referência Windows.
- Node local 24 com engine 22 de functions produziu aviso; validação passou. Avisos preexistentes de bundle grande/importação dinâmica permanecem.
- Intermitência legada de autocomplete registrada em F2-02 permanece sem correção comprovada. Hosting sem sharding continua um risco separado.

## Como verificar manualmente

1. Abrir livro ou aventura no Estúdio e escolher Arcos e cronologia.
2. Criar um arco, preencher objetivo e adicionar marcos; criar eventos, inclusive sem data ou com “3º dia do inverno”.
3. Mover marcos/eventos e conferir que cenas, capítulos e prosa conservaram sua ordem.
4. Vincular cena/evento/entidade, consultar Entidades e abrir uma cena; retornar ao mesmo arco.
5. Remover a origem ou desvincular o universo pelo formulário do livro; conferir referência indisponível e ausência de navegação para a origem perdida.
6. Exportar JSON privado e verificar v6; comparar Markdown/publicação, que não incluem notas narrativas.
7. Repetir por teclado em 320 px nos temas claro, escuro e sépia.
