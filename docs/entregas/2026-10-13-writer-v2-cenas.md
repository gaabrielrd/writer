# Writer V2 — Cenas e composição do manuscrito

- **Data**: 2026-10-13
- **Branch**: `codex/writer-v2`, worktree isolado; base `15cd417`
- **Plano de origem**: [F2-02 executável](../tasks/writer-v2/execucao/08-planejamento-de-cenas.md)
- **Decisão**: [ADR 0026](../decisions/0026-scenes-and-manuscript-assembly.md)
- **PR**: [21, em rascunho para master](https://github.com/gaabrielrd/writer/pull/21)
- **Estado**: implementado e validado localmente; CI do novo head pendente

## Objetivo

Permitir a autores e criadores de aventuras planejar e escrever cenas com texto
próprio. Capítulos e partes reúnem a prosa ativa na ordem escolhida; arquivar
retira da composição sem apagar conteúdo, conforme as escolhas do operador.

## Funcionalidades entregues

- **Planejamento** — lista e quadro por estado, objetivo, conflito, ponto de vista,
  referências de lore, filtros e páginas de 25/50 cenas no agrupador escolhido.
- **Escrita** — editor rico por cena, autosave, recuperação privada de rascunhos,
  comparação explícita de conflitos e retry sem duplicar operações.
- **Organização** — mover entre capítulos/partes, posicionar antes/depois por
  teclado e arquivar/restaurar preservando texto e referências.
- **Compatibilidade** — capítulos legados conservam o editor. Conversão explícita
  guarda a fonte inteira e cria uma cena sem duplicar a contagem. A rota antiga
  passa a mostrar a composição; rascunho local anterior permanece disponível
  para comparação e cópia, sem substituir cenas automaticamente.
- **Remoção segura** — remover agrupadores desvincula cenas. Limpeza de livro e
  reorganização de posições são paginadas e retomáveis, com controles no servidor.
- **Leitura e distribuição existente** — exportação e publicação montam somente
  prosa ordenada, sem plano/referências privados. Backup JSON v5 conserva também
  cenas arquivadas/sem agrupador, planejamento e fontes de conversão.

## Critérios de aceite

- [x] Movimento preserva prosa e referências; arquivo retira da composição e restaura.
- [x] Livros legados mantêm leitura/exportação e conversão preserva a fonte.
- [x] Lista/quadro e ações funcionam por teclado nos três temas e em 320 px.
- [x] Falha/conflito conserva preenchimento, com recuperação por conta/projeto/cena.
- [x] Publicação não copia notas de planejamento; backup privado conserva os recursos.
- [x] Regras reais impedem acesso alheio, writes diretos e alterações de clientes antigos.
- [x] Validate completo verde e revisão independente sem bloqueadores.
- [ ] CI verde no SHA deste incremento; conferir checks do PR antes de concluir tecnicamente.

## Arquivos alterados

| Área                                                                   | Mudança                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/features/scenes`                                                  | Contratos públicos, transporte, planejador, editor, autosave e rascunhos |
| `functions/src/{scenes,sceneContracts,sceneRanks,sceneJobs}.mjs`       | Autoria, CAS, recibos, composição, conversão e checkpoints               |
| `functions/src/index.mjs`, `chapterChat.mjs`, `functions/package.json` | Callables, guarda transacional de IA legada e checagem de sintaxe        |
| `firestore.rules`, `firestore.indexes.json`                            | Privacidade, controles protegidos, publicação por revisão e consultas    |
| `src/features/books`, `adventures`, `editor`, `app/routes`             | Integração contextual, composição, remoção, publicação e exportações     |
| `e2e/visual`, `vite.visual.config.ts`                                  | Transporte/persistência fictícios isolados e percursos Chromium          |
| `AGENTS.md`, README e `docs`                                           | Regras vigentes, arquitetura, decisão, contratos e evidência             |

## Testes

| Testes                                                   | Evidência observável                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `scenes/tests`                                           | Formulários, páginas, teclado, lore indisponível, recuperação, troca de conta e conflito                              |
| `books/tests` e `editor/tests` alterados                 | Composição paginada/hash, fonte congelada, JSON v5, projeção pública, contagens e exclusão                            |
| `functions/test/scenes.test.mjs`, `chapterChat.test.mjs` | Autoria, retries, limites, ordem, arquivo, limpeza e bloqueio de IA no modo cenas                                     |
| `tests/firestore/scenes.rules.test.mjs`                  | Admin SDK/regras reais, slots atômicos, captura consistente, orçamento e clientes antigos                             |
| `e2e/visual/scenes.visual.ts`                            | Autor/aventura, texto rico, referência global, conflito, ordem, arquivo, conversão, recuperação e geometria em 320 px |

Saída real do validate repetido após documentação, AGENTS e correção do teste:

```text
Test Files  136 passed (136)
Tests  1069 passed (1069)
All files | 92.99 | 86.38 | 91.76 | 95.2
scripts: tests 77, pass 77, fail 0
functions: tests 119, pass 119, fail 0
Smoke test do bundle OK.
```

Regras reais:

```text
tests 67
pass 67
fail 0
skipped 0
duration_ms 26401.2951
```

## Validações executadas

| Comando/verificação                             | Resultado observado                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions`                     | Instalado; 250 pacotes auditados, zero vulnerabilidades                                                         |
| `npm run validate`                              | Verde: skills, arquitetura, links, styleguide, formato, lint, cobertura, scripts, backend, tipos, build e smoke |
| `npm run test:rules`                            | 67 aprovados; nenhum skip/falha                                                                                 |
| Chromium de cenas, primeira suíte completa      | 90 aprovados nos seis projetos; nenhum skip/retry                                                               |
| Chromium dirigido após reforço dos casos finais | 18 aprovados nos seis projetos; nenhum skip/retry                                                               |
| Inspeção visual                                 | Capturas finais claro/sépia em 320 px; editor interno cabe sem cortar prosa/controles                           |
| Revisões independentes                          | Integrações/frontend e backend revisados separadamente; achados corrigidos e reconferidos, sem bloqueadores     |
| `git diff --check`                              | Verde; checkout original preservado limpo em `522ccaa`                                                          |

A suíte final ampliada passou nos 96 casos, sem skip, falha ou retry, em
550.276 ms. JSON/HTML estão preservados em `scenes-final-96`.

O primeiro validate encontrou sintaxe de parameter property em um helper de
ClipboardItem incompatível com `erasableSyntaxOnly`. O helper foi corrigido e
o validate completo repetido passou. A repetição após AGENTS encontrou uma
consulta síncrona no teste de paginação antes de renderizar o cursor. O teste
agora verifica respostas adiadas e espera controles habilitados, preservando as
asserções; 23 testes dirigidos e o validate integral repetido passaram. Timeouts,
skips, comportamento da interface e limites de cobertura não foram relaxados.
Avisos existentes de engine das functions sob Node 24, chunks grandes e importação
de `exportDocx` permanecem; nenhuma dependência nova foi adicionada.

Dados visuais são fictícios e isolados; não comprovam autorização comercial,
piloto humano ou autenticação de produção. O resolver de composição real é usado
nas fixtures, enquanto as permissões são verificadas separadamente no emulador.
Capturas/relatórios ficam fora do checkout em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/writer-v2-cenas-qa`.
As 90 regressões existentes passaram nos seis projetos, sem skip, falha ou retry.
Relatórios estão em `regressions-final-90`; cobrem capítulos/atos, editor, arquivos
PDF/DOCX/JSON, leitor/republicação, personas e Estúdio.

E2E de produção local falhou em duas execuções intactas: dois timeouts aguardando
`load` em navegação/reload e cinco testes não executados pela interrupção antecipada.
Traces mostram UI renderizada, HTML/bundle/CSS locais 200/304 em menos de 55 ms,
mas fontes Roboto de `fonts.gstatic.com` sem resposta e recursos GSI pendentes.
Console inspecionado sem exceção da aplicação, apenas timeout de recurso externo
e aviso Canvas2D. A repetição durou 66.574 ms e confirmou a causa de rede externa.
Não são cinco skips de plataforma; o único skip existente no source (screenshot
sem baseline Windows) não foi alcançado. Não alterar timeout, env, interceptações
ou asserções para passar. Relatórios/traces ficam em `production-e2e-final` e
`production-e2e-repeat`; servidores próprios foram encerrados. O portão de browser
de produção continua pendente e será conferido no CI do SHA do incremento.

## Fora do escopo

IA especializada de cena, arcos, histórico/restauração de backups, templates de
aventura, pistas, sessões, calendário avançado, comércio e diagramação. Partes de
aventura são agrupadores mínimos; não são sessões nem uma engine de regras.

## Limitações e pendências conhecidas

- CI do incremento ainda precisa terminar antes da conclusão técnica.
- Uso real exige implantação autorizada de functions, regras e índices; não houve deploy ou merge.
- Fonte e backup são preservados; restauração completa pertence à tarefa própria.
- Composição que excede o orçamento público pede divisão e preserva a publicação anterior.
- Pilotos humanos, Connect/contratos e demais condições comerciais continuam pendentes.

## Como verificar manualmente

1. Autenticar num ambiente com backend/regras/índices correspondentes; abrir um livro e a aba Cenas.
2. Criar capítulo em modo cenas, escrever texto rico, mover por teclado e verificar a composição.
3. Arquivar: o texto sai do manuscrito e permanece no Arquivo; restaurar e conferir retorno.
4. Converter capítulo legado e comparar texto/fonte; remover o capítulo e conferir cenas Sem capítulo.
5. Simular edição em duas abas: comparar conflito sem perder texto local. Trocar de conta e verificar isolamento.
6. Criar parte de aventura e cena própria; conferir referência global removida como indisponível.
7. Exportar Markdown/DOCX/PDF, publicar e verificar ausência de notas; JSON v5 inclui os recursos privados.
8. Usar claro/escuro/sépia em 320 px, abrindo editor, formulário e menus somente pelo teclado.
