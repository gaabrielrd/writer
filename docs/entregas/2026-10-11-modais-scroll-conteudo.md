# Modais com altura limitada e rolagem no conteúdo

- **Data**: 2026-10-11
- **Branch**: `codex/editor-compendio`
- **Plano de origem**: plano apresentado na conversa, conforme solicitação do usuário.

## Objetivo

Manter o título e as ações dos modais disponíveis ao consultar conteúdos extensos, com altura máxima de `80vh`.

## Funcionalidades entregues

- **Layout compartilhado** — `Dialog` limita a altura a `80vh`; header e footer não encolhem nem rolam. `DialogBody` concentra a rolagem do conteúdo.
- **Ações visíveis** — preferências de IA, assistente, aviso de créditos e demonstração do styleguide usam o footer compartilhado. O envio de preferências preserva validação e associação ao formulário.
- **Conteúdo extenso** — removida a rolagem adicional das listas de importação, fichas de lore e resultados de IA. Capítulos em modal usam a rolagem compartilhada; a lista inline mantém seu comportamento.
- **Responsividade** — botões do footer permitem quebra de texto e continuam dentro do modal em 320 px. Tokens, temas e retorno de foco permanecem compartilhados.

## Critérios de aceite

- [x] Altura máxima de `80vh`.
- [x] Header e footer permanecem visíveis ao rolar.
- [x] Uma área de rolagem para o conteúdo do modal; campos de texto mantêm sua rolagem nativa.
- [x] Compatibilidade com claro, escuro e sépia, desktop, celular e 320 px.
- [x] Envio de formulário pelo footer e retorno de foco preservados.
- [x] Validação local, revisão do diff e documentação atualizadas.

## Arquivos alterados

| Arquivos                                                                                       | Mudança                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/shared/ui/Dialog.tsx`, `index.ts`                                                         | Layout limitado e exportação de `DialogBody`.            |
| `src/shared/ui/StyleguidePage.tsx`                                                             | Demonstração com ações no footer.                        |
| `src/features/ai-assistant/components`                                                         | Footers dos três modais e adaptação dos botões.          |
| `src/features/books/components/ChapterList.tsx`, CSS da lista e de `ImportBookModal`           | Remoção de rolagem aninhada apenas no modal.             |
| `src/features/lore/components/LoreEntityForm.tsx`, CSS do formulário e de `LoreDrawer`         | Uso da área compartilhada de rolagem.                    |
| `e2e/visual/dialog-layout.visual.ts`, `editor-lore-analysis.visual.ts`, `scrollbars.visual.ts` | Medições de layout, envio, foco e seletores atualizados. |
| `docs/styleguide.md`, `docs/testing.md`                                                        | Contrato de layout, API de composição e cobertura.       |

## Testes

`dialog-layout.visual.ts` mede altura e posição de header/footer antes e depois da rolagem real. Cobre edição de livro em viewport de 480 px, importação com 30 capítulos, preferências de IA em 320 px e a ação longa do assistente. O teste distingue a rolagem nativa de textarea dos contêineres do modal.

Saídas reais:

```text
216 passed (6.6m)
6 passed (13.3s)
Test Files  81 passed (81)
     Tests  574 passed (574)
All files | 93.56 | 85.97 | 91.32 | 95.59 |
```

O primeiro teste de layout contou a rolagem da textarea de sinopse como rolagem de contêiner. A verificação foi corrigida; a suíte completa passou. Capturas de edição, importação e IA foram inspecionadas visualmente.

## Validações executadas

| Comando                                                                | Resultado                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| `npm ci --prefix functions`                                            | 249 pacotes instalados; zero vulnerabilidades. |
| `npm run validate`                                                     | Verde, código de saída 0.                      |
| `npx playwright test --config playwright.visual.config.ts --workers 2` | 216 testes aprovados.                          |
| Teste adicional do footer de IA em 320 px                              | 6 testes aprovados nos três temas.             |
| `git diff --check`                                                     | Sem erros.                                     |

```text
Infraestrutura: tests 68, pass 68, fail 0
Functions: tests 46, pass 46, fail 0
Smoke test do bundle OK.
```

A execução anterior de `validate` foi interrompida no build. Uma nova execução completa passou. Permanecem os avisos existentes de chunks grandes e import dinâmico inefetivo de `exportDocx`. A instalação de functions avisa que o ambiente usa Node 24 enquanto seu engine declara Node 22.

## Fora do escopo

Alterações de regras de negócio, dependências ou serviços. O dropdown foi registrado anteriormente no commit local `6815004`.

## Limitações e pendências conhecidas

Entrega e commit locais solicitados; sem push, PR ou execução de CI remoto. Alterações alheias à tarefa foram preservadas.

## Como verificar manualmente

1. Abra a edição de uma obra em uma janela baixa e role até o fim do formulário.
2. Confira que o título e os botões Cancelar/Salvar continuam visíveis.
3. Importe um Markdown com vários capítulos e role até o último: apenas o corpo deve rolar.
4. Em 320 px, abra as preferências e o assistente de IA; confira o footer e o envio de preferências nos três temas.
