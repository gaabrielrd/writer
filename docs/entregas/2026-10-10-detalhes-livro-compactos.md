# Detalhes do livro e navegação compactos

## Correção do CI — 2026-10-10

O CI de `f93d944` falhou no cenário visual de universos: a consulta imediata
`count()` podia acontecer antes de os detalhes do livro carregarem e selecionar
o fluxo antigo de edição. O teste agora aguarda Opções do livro e acessa Editar
pelo menu atual, sem fallback para o botão removido.

- Arquivo corrigido: `e2e/visual/universes.visual.ts`.
- Cenário de universos com `CI=true`: `6 passed (20.4s)`.
- Suíte visual completa com `CI=true`: `138 passed (3.1m)`.
- `npm run validate`: verde, com 74 arquivos e 483 testes Vitest aprovados,
  cobertura preservada, setup/backend, typecheck, build e smoke aprovados.
- Revisão: mudança restrita à sincronização e navegação observável do teste;
  sem aumento de timeout, supressão de cenários ou alteração da interface.
- A normalização local de CRLF para LF não gerou mudanças adicionais no diff.

Os jobs de validação em Node 22/24, auditoria e regras do Firestore já estavam
verdes na execução anterior; a falha visual também bloqueou a integração do
workflow de Hosting. A confirmação remota pertence à nova execução após o push.

- **Data**: 2026-10-10
- **Branch de entrega**: `master` (local)
- **Plano de origem**: ajustes do header e dos detalhes do livro solicitados na conversa.

## Objetivo

Uniformizar a navegação superior e reduzir a quantidade de controles e texto
exibidos de início nos detalhes do livro.

## Funcionalidades entregues

- Header com marca, menu, separadores e livro centralizados verticalmente;
  espaçamento horizontal compartilhado de 16 px no desktop e 8 px até 900 px.
- Sinopse limitada a duas linhas, com controle discreto Mais/Menos e estado
  acessível por `aria-expanded` e `aria-controls`.
- Exportar, importar DOCX/PDF, editar e excluir reunidos em Opções do livro (`...`).
  Os diálogos devolvem o foco ao botão do menu quando fechados.
- Novo capítulo abre um modal; título vazio impede envio, sucesso fecha o modal,
  cancelamento descarta o título e falha mantém o texto para tentar novamente.
- Barra única com quantidade de capítulos, palavras e criação. Cada capítulo usa
  uma linha com ordem, título, contagem, escrita e menu de renomear, mover e excluir.
  Em telas pequenas, os ícones mantêm rótulos acessíveis e os títulos usam reticências.

## Critérios de aceite

- [x] Header com alinhamento vertical e intervalos horizontais consistentes.
- [x] Sinopse inicia com no máximo duas linhas e pode ser expandida/recolhida.
- [x] As quatro ações do livro estão no dropdown de opções.
- [x] Criação de capítulo acontece por modal, com cancelamento e falha recuperável.
- [x] Capítulos exibem títulos, contagens e ações em uma linha, inclusive em 320 px.
- [x] Temas claro, escuro e sépia preservados.

## Arquivos alterados

| Arquivos                                                                                                                                | Mudança                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/app/App.module.css`, `src/features/books/components/BookNavigation.tsx`, `src/features/books/components/BookNavigation.module.css` | Alinhamento e espaçamento da navegação.                                           |
| `src/features/books/components/BookPage.tsx`, `src/features/books/components/BookPage.module.css`                                       | Sinopse e menu de opções.                                                         |
| `src/features/books/components/ChapterList.tsx`, `src/features/books/components/ChapterList.module.css`                                 | Modal e linhas de capítulos.                                                      |
| `src/features/editor/index.ts`                                                                                                          | Interface pública do diálogo de exportação existente.                             |
| `src/features/books/tests/BookPage.test.tsx`, `src/features/books/tests/ChapterList.test.tsx`                                           | Interações atualizadas e casos de expansão, cancelamento e falha.                 |
| `e2e/visual/writer.visual.ts`, `e2e/visual/exports.visual.ts`                                                                           | Fluxos reais, limite de duas linhas, modal, foco, exportação e largura de 320 px. |
| `docs/styleguide.md`                                                                                                                    | Comportamento e composição visual dos detalhes.                                   |

## Testes

Os testes de componentes cobrem as ações do menu, expansão/recolhimento da
sinopse, criação pelo modal, cancelamento, preservação do título após falha,
renomeação, reordenação e exclusão de capítulos. Os testes visuais usam serviços
fictícios e verificam desktop/celular nos três temas, sem acesso a produção.

Saída real da suíte completa:

```text
Test Files  74 passed (74)
     Tests  483 passed (483)
Statements   : 93.48% ( 3787/4051 )
Branches     : 84.08% ( 2794/3323 )
Functions    : 91.23% ( 947/1038 )
Lines        : 95.59% ( 3473/3633 )
```

Saída real do setup e backend:

```text
tests 66
pass 66
fail 0
tests 28
pass 28
fail 0
```

Saída real da seleção visual na configuração oficial:

```text
12 passed (41.2s)
```

## Validações executadas

| Comando                                                                                                                                                                      | Resultado                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions`                                                                                                                                                  | Dependências instaladas; nenhuma vulnerabilidade reportada.                                                                  |
| `npm run validate`                                                                                                                                                           | Verde: skills, arquitetura, documentação, styleguide, formatação, lint, cobertura, setup, backend, typecheck, build e smoke. |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/writer.visual.ts e2e/visual/exports.visual.ts --grep "obra, capítulos longos\|exporta o livro inteiro"` | 12 cenários passaram na configuração oficial.                                                                                |
| `git diff --check`                                                                                                                                                           | Sem erro de whitespace.                                                                                                      |

```text
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
Smoke test do bundle OK.
```

Capturas do estado inicial, modal e largura de 320 px foram revisadas em
`visual-test-results/`. A revisão do diff não identificou bloqueadores no escopo.

## Fora do escopo

Mudanças em persistência, geração, publicação, universos ou regras de acesso.
O diálogo de exportação reutiliza a implementação existente.

## Limitações e pendências conhecidas

CI e pull request não foram executados nesta entrega local. O build mantém
avisos sobre tamanho de chunks e importação dinâmica de DOCX; concluiu com sucesso.
As primeiras tentativas de validação encontraram restrições de subprocessos e
alterações simultâneas no workspace; a execução final completa e a seleção visual
oficial passaram depois que esse trabalho foi registrado.

## Como verificar manualmente

1. Abra um livro com sinopse longa e capítulos.
2. Confira a navegação superior e alterne Mais/Menos na sinopse.
3. Abra Opções do livro e confira exportação, importação, edição e exclusão.
4. Abra Novo capítulo, cancele e abra novamente; crie um capítulo com título.
5. Confira contagens, escrita e ações dos capítulos nos três temas e em tela estreita.
