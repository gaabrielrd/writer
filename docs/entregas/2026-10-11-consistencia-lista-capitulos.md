# Listagem de capítulos consistente com o compêndio

- **Data**: 2026-10-11
- **Branch**: `codex/chapter-list-consistency`
- **Plano de origem**: plano apresentado na conversa, para o ajuste solicitado
- **Base**: `f3e8ecf`, em uma nova worktree isolada

## Objetivo

Aplicar à listagem de capítulos o padrão visual da lista do compêndio,
preservando organização por atos, busca, seleção e ações existentes.

## Funcionalidades entregues

- Tabela contínua com borda arredondada, cabeçalho Capítulo/Palavras/Ações,
  divisórias e o mesmo espaçamento, tipografia e tokens da lista do compêndio.
- Selecionar todos os resultados exibidos no cabeçalho, estado intermediário e
  destaque das linhas selecionadas; ações em lote mantêm suas confirmações.
- Títulos em destaque abrem o editor também por teclado; contagens alinhadas e
  ações discretas por ícone conservam seus rótulos acessíveis.
- Atos usam cabeçalhos internos e preservam a mensagem de ato vazio. Títulos
  longos usam reticências e conservam o título completo no atributo `title`.

## Critérios de aceite

- [x] Listagem segue o padrão de tabela do compêndio.
- [x] Busca, atos, seleção, criação, renomeação, ordem e exclusão preservados.
- [x] Três temas, desktop/celular e 320 px sem transbordamento horizontal.
- [x] Validação completa e revisão do diff realizadas.

## Arquivos alterados

| Arquivo                                                | Mudança                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `src/features/books/components/ChapterList.tsx`        | Tabela compartilhada, grupos de atos e navegação pelo título. |
| `src/features/books/components/ChapterList.module.css` | Colunas, espaçamento, títulos e responsividade.               |
| `src/features/books/tests/ChapterList.test.tsx`        | Cabeçalhos acessíveis e navegação pelo título por teclado.    |
| `e2e/visual/chapters.visual.ts`                        | Comparação visual com compêndio, seleção e 320 px.            |
| `e2e/visual/acts.visual.ts`                            | Seletores semânticos dos grupos da tabela.                    |
| `e2e/visual/writer.visual.ts`                          | Criação de capítulos e alinhamento das células.               |
| `docs/styleguide.md`                                   | Contrato visual da listagem.                                  |
| `docs/testing.md`                                      | Cobertura visual e comando de execução.                       |

## Testes

- `ChapterList.test.tsx`: preserva os cenários existentes de carregamento, erro,
  criação, cancelamento, foco, renomeação, ordem, busca e ações em lote; verifica
  cabeçalhos e a abertura do editor pelo título com Enter.
- `chapters.visual.ts` e `acts.visual.ts`: 30 cenários passaram. A comparação
  no desktop confirma raio, borda, superfície do cabeçalho, divisórias, padding e
  fonte iguais ao compêndio. Inclui teclado, seleção parcial, atos, confirmações,
  exportação e largura mínima, nos três temas.
- `writer.visual.ts --grep 'obra'`: 24 cenários passaram, incluindo obra,
  histórico de navegação, criação e largura mínima.
- Capturas de desktop/celular foram inspecionadas visualmente. As prévias usam
  componentes reais e dados fictícios; a rede externa fica bloqueada.

Saída real das suítes:

```text
Test Files  93 passed (93)
     Tests  661 passed (661)
All files  | 93.02 | 86.19 | 91.52 | 95.06 |
ℹ tests 68
ℹ pass 68
ℹ fail 0
ℹ tests 63
ℹ pass 63
ℹ fail 0
30 passed (1.5m)
24 passed (1.4m)
```

## Validações executadas

| Comando                                                                                                            | Resultado                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `npm ci` e `npm ci --prefix functions`                                                                             | Dependências instaladas na worktree.                                                                                    |
| `npm run validate`                                                                                                 | Verde: skills, arquitetura, docs, styleguide, formato, lint, cobertura, ferramentas, backend, typecheck, build e smoke. |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/chapters.visual.ts e2e/visual/acts.visual.ts` | 30 passaram; porta isolada 4189.                                                                                        |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/writer.visual.ts --grep 'obra'`               | 24 passaram; porta isolada 4189.                                                                                        |
| `git diff --cached --check`                                                                                        | Sem erros.                                                                                                              |

```text
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
✓ 2563 modules transformed.
✓ built in 2.20s
Smoke test do bundle OK.
```

## Fora do escopo

Mudanças de backend, persistência, publicação, compêndio ou editor.
Integração na branch principal, push e deploy.

## Limitações e pendências conhecidas

CI remoto não executado: a entrega é local, em worktree própria.
O build mantém os avisos existentes de tamanho de bundle e importação de DOCX.
A primeira validação encontrou CRLF do checkout Windows; os finais de linha
foram normalizados somente nesta worktree, sem diferenças adicionais no Git.
Uma opção inválida no teste foi corrigida antes da validação final verde.

## Como verificar manualmente

1. Abrir um livro na aba Capítulos e comparar a tabela com a lista do Compêndio.
2. Selecionar um capítulo pelo teclado, conferir o checkbox intermediário e limpar.
3. Abrir um capítulo pelo título ou ícone de escrita e conferir o menu de ações.
4. Repetir nos temas claro, escuro e sépia, incluindo largura de 320 px e atos vazios.

## Integração na master em 2026-10-11

A pedido do usuário, a branch foi integrada à `master` local sobre `9c87d7d`,
preservando os commits recentes do minimapa. O único conflito foi em
`docs/testing.md`: as seções do minimapa e da tabela de capítulos foram mantidas.
A normalização dos finais de linha CRLF não acrescentou diferenças de conteúdo.

`npm run validate` passou novamente na versão combinada, com 96 arquivos e
672 testes de frontend, 68 testes de ferramentas e 63 testes de backend,
além de typecheck, build e smoke. A verificação visual da tabela e do fluxo de
obra passou nos 18 cenários de desktop/celular nos três temas, incluindo 320 px.

```text
Test Files  96 passed (96)
     Tests  672 passed (672)
All files  | 93.18 | 86.31 | 91.61 | 95.21 |
18 passed (58.9s)
✓ 2567 modules transformed.
✓ built in 1.40s
Smoke test do bundle OK.
```

Integração local, sem push ou deploy. CI remoto não executado.
