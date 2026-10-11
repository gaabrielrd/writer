# Dropdown compartilhado para seleções e ações

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Plano de origem**: plano apresentado na conversa, executando a solicitação de implementação e migração do usuário.

## Objetivo

Oferecer uma interface consistente para seleções e menus em todas as telas, com
ícones, busca opcional, personalização visual e adaptação aos três temas.

## Funcionalidades entregues

- **Seleção** — `Dropdown mode="select"` exibe valor e ícone da opção, aceita valores vazios/numéricos, valores controlados ou iniciais, placeholder, feedback e dados de formulário.
- **Ações** — `Dropdown mode="action"` não recebe valor selecionado. O gatilho pode mostrar apenas ícone ou ícone e label; a escolha executa callbacks sem substituir seu texto.
- **Busca** — filtro por label ou termos adicionais, sem distinção de caixa/acentos, estado vazio e limpeza ao reabrir. Ativado em universos, entidades vinculadas e destinos de sugestões.
- **Visual e acessibilidade** — variantes, tamanhos, classes de botão/menu/itens, alinhamento, temas, foco, teclado, itens desabilitados, limite de viewport e rolagem.
- **Transição para diálogos** — callbacks de ação executam depois do fechamento do menu e restauração do foco. Diálogos abertos pelo menu retornam ao gatilho persistente.
- **Migração** — seleções em IA, exportação, revisão do lore, compêndio, relações, universos e temas usam o novo componente. Menus de livro, capítulos, bibliotecas e conta compartilham a mesma base, preservando links, permissões e confirmações.
- **Catálogo** — `/styleguide` demonstra seleção com ícones/busca e ações com/sem label dentro do modal. Referência Linux regenerada no ambiente oficial do Playwright e inspecionada visualmente.

## Critérios de aceite

- [x] Componente público em `@/shared/ui`, neutro em relação às features.
- [x] Labels com ícones, busca opcional e personalização visual.
- [x] Modo de ação sem valor selecionado, com callback e gatilhos pedidos.
- [x] Adaptação a claro, escuro e sépia, em desktop/celular.
- [x] Seletores e menus das telas usam a mesma base; não há select nativo nas telas.
- [x] Fluxos existentes preservados, incluindo estados desabilitados e diálogos.
- [x] Testes, validação local, revisão e documentação atualizados.

## Arquivos alterados

| Arquivos                                                                                             | Mudança                                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/shared/ui/Dropdown.tsx`, `Dropdown.module.css`, `index.ts`                                      | API tipada, modos, busca, superfície, foco e exports.                       |
| `src/shared/ui/Select.tsx`, `Floating.module.css`                                                    | Alias de seleção para imports existentes; remoção do CSS de menu duplicado. |
| `src/shared/ui/StyleguidePage.tsx`, `src/shared/theme/ThemeToggle.tsx`                               | Catálogo e controle de tema migrados, com ícones.                           |
| `src/features/books/components/BookPage.tsx`, `ChapterList.tsx`                                      | Menus de ações com gatilho apenas de ícone e variante destrutiva.           |
| `src/features/ai-assistant/components/BYOKSettingsDialog.tsx`                                        | Seleção de provedor.                                                        |
| `src/features/editor/components/EditorLoreSidebar.tsx`, `ExportDialog.tsx`, `LoreAnalysisDialog.tsx` | Escopo, exportação e revisão das propostas.                                 |
| `src/features/lore/components/LoreBulkActions.tsx`, `LoreEntityForm.tsx`, `LoreTab.tsx`              | Visibilidade, categorias, relações e escopo.                                |
| `src/features/universes/components/UniverseSelect.tsx`                                               | Seleção de universo com filtro.                                             |
| `src/shared/ui/tests/Dropdown.test.tsx`, testes dos fluxos migrados                                  | Contratos observáveis e migração de interações nativas.                     |
| `src/test/dropdown.ts`, `e2e/dropdown.ts`                                                            | Helpers que abrem o dropdown e escolhem por label.                          |
| `e2e/visual/dropdown.visual.ts`, testes E2E migrados, `e2e/__screenshots__/linux/styleguide.png`     | Tema, dimensões, modais, fluxos e referência visual.                        |
| `AGENTS.md`, `CLAUDE.md`, `docs/styleguide.md`, `docs/testing.md`, `docs/architecture.md`            | Convenções alinhadas ao componente.                                         |
| `docs/dropdown.md`, `docs/decisions/0020-shared-dropdown.md`                                         | API, exemplos e decisão de base única.                                      |

## Testes

| Teste                                                 | Tipo                    | O que cobre                                                                                                                                                |
| ----------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ui/tests/Dropdown.test.tsx`               | Componente, 11 cenários | Valores vazios/numéricos, formulário, controle externo, ícones, busca, vazio, teclado, callbacks, desabilitados, feedback, links e transição para diálogo. |
| Testes de livros, editor, lore, universos, IA e temas | Componente              | Fluxos existentes escolhendo as opções reais do dropdown.                                                                                                  |
| `e2e/visual/dropdown.visual.ts`                       | Chromium, 12 cenários   | Temas, viewport, filtro, teclado, callbacks, foco, portal, modais e clique externo.                                                                        |
| `e2e/visual/writer.visual.ts`                         | Chromium                | Menus de conta/bibliotecas e fluxo de 320px.                                                                                                               |
| `e2e/styleguide.spec.ts`                              | Chromium Windows/Linux  | Cores, persistência, sistema, modal e imagem Linux.                                                                                                        |

Saída real da validação final:

```text
Test Files  81 passed (81)
     Tests  574 passed (574)
All files          |   93.56 |    85.96 |   91.31 |   95.59 |
ℹ tests 68
ℹ pass 68
ℹ fail 0
ℹ tests 46
ℹ pass 46
ℹ fail 0
Smoke test do bundle OK.
```

Os percentuais são instruções, ramos, funções e linhas. Os limites de cobertura
foram preservados. Uma execução concorrente anterior excedeu os cinco segundos
do teste longo do editor; a repetição completa sem outros testes passou.

A suíte visual completa executou 198 cenários: 191 passaram e sete exigiram
correções nos testes (seis seletores antigos de configurações no fluxo de 320px
e um clique externo antes de o popup terminar de ganhar foco). Todos esses
cenários foram repetidos junto dos demais contratos do dropdown nos seis projetos:

```text
18 passed (36.6s)
```

O E2E de produção no Windows e a verificação do styleguide no Linux retornaram:

```text
Windows: 1 skipped; 6 passed (27.7s)
Linux: 6 passed (19.0s)
```

No Windows, somente a comparação por imagem foi pulada por não haver referência
para essa plataforma. A imagem Linux foi regenerada com
`npx playwright test e2e/styleguide.spec.ts --grep 'mantém a aparência' --update-snapshots=all`
na imagem oficial `mcr.microsoft.com/playwright:v1.63.0-noble`, e depois comparada
novamente sem atualização. A versão coincide com a dependência instalada.

## Validações executadas

| Comando                                                                | Resultado                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm ci --prefix functions`                                            | Dependências instaladas; zero vulnerabilidades no backend.              |
| `npm run validate`                                                     | Verde na execução final completa.                                       |
| `npm run test:e2e`                                                     | Seis aprovados no Windows; comparação de imagem pulada.                 |
| `npx playwright test --config playwright.visual.config.ts --workers 2` | Suíte de 198 executada; sete testes corrigidos e repetidos com sucesso. |
| Repetição de dropdown e 320px nos seis projetos                        | 18 aprovados.                                                           |
| Styleguide no Linux após regeneração da referência                     | Seis aprovados, incluindo comparação da imagem.                         |
| `git diff --check`                                                     | Sem erros de whitespace.                                                |

## Fora do escopo

Serviços, persistência, regras de domínio, backend, dependências novas e mudanças
nas capacidades do produto. Alterações locais alheias à tarefa foram preservadas.

## Limitações e pendências conhecidas

- Busca filtra `options`, não filhos compostos de `DropdownItem`.
- `Select` mantém o nome de import, usando a nova API `onValueChange`; não mantém eventos de um select nativo.
- Obrigatoriedade e confirmação de operações continuam nas telas; o componente não fornece validação nativa `required` de select.
- O build continua apresentando os avisos existentes de tamanho do bundle e import dinâmico de `exportDocx`.
- Alterações locais; commit, PR e CI remoto ainda não realizados. A validação descrita é local, incluindo o ambiente Linux isolado.

## Como verificar manualmente

1. Abra `/styleguide` e alterne os três temas.
2. Abra Categoria de Lore, filtre por texto sem acento e escolha com seta/Enter.
3. No modal de demonstração, teste Ações com busca e Ações somente com ícone; confira o resultado do callback e o foco.
4. No livro, abra Opções do livro e um diálogo; ao fechar, confira o retorno ao gatilho.
5. Confira seleção de universos, exportação, escopo e relações; teste também largura de 320px.
