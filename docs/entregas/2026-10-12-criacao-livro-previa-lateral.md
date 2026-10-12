# Criação de livro com prévia lateral no desktop

- **Data**: 2026-10-12
- **Branch**: `codex/editor-paridade`
- **Plano de origem**: plano apresentado na conversa para ampliar o modal manual e acompanhar o preenchimento com uma prévia do livro.

## Objetivo

Dar feedback visual imediato durante a criação manual de livros no desktop,
com tipografia e hierarquia coerentes com a biblioteca.

## Funcionalidades entregues

- Modal com largura máxima de 960 px acima de 900 px, formulário à esquerda e prévia à direita.
- Prévia acompanha título, gênero, sinopse e capa, com capa 2:3 e estilos dos cards da biblioteca.
- Placeholders para campos vazios e imagens indisponíveis; troca da capa permite recuperar uma falha de carregamento.
- Sugestões de IA entram na prévia apenas após o aceite explícito.
- Header/footer preservados durante a rolagem do corpo. Até 900 px, formulário em uma coluna e prévia lateral oculta.

## Critérios de aceite

- [x] Modal ampliado apenas no desktop, com prévia lateral atualizada durante o preenchimento.
- [x] Título, gênero e sinopse seguem a hierarquia da biblioteca; a fonte do título foi comparada no navegador.
- [x] Capa mantém proporção 2:3, pode ser selecionada da biblioteca e removida.
- [x] Temas claro, escuro e sépia, textos longos, teclado, retorno de foco e 320 px verificados.
- [x] Uma única região de rolagem do modal, com ações finais visíveis em viewport baixa.
- [x] Validação completa local aprovada e diff revisado.

## Arquivos alterados

| Arquivo                                                          | Mudança                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| `src/features/books/components/BookCreationWizard.tsx`           | Amplia o modal e compõe formulário/prévia.              |
| `src/features/books/components/BookCreationWizard.module.css`    | Colunas, divisória, prévia e breakpoint.                |
| `src/features/books/components/BookDraftPreview.tsx`             | Apresenta os dados do rascunho e fallback da capa.      |
| `src/features/books/tests/BookCreationWizard.test.tsx`           | Confirma a entrada da sinopse na prévia após aceite.    |
| `src/features/books/tests/BookDraftPreview.test.tsx`             | Cobre placeholders, metadados e capas.                  |
| `e2e/visual/book-creation-preview.visual.ts`                     | Geometria, tipografia, temas, teclado e responsividade. |
| `docs/book-creation.md`, `docs/styleguide.md`, `docs/testing.md` | Documentam comportamento e validação.                   |

## Testes

| Teste                                                       | Tipo                  | Resultado                                                                 |
| ----------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| `BookDraftPreview.test.tsx` e `BookCreationWizard.test.tsx` | Componente            | 18 passaram.                                                              |
| `book-creation-preview.visual.ts`                           | Chromium com fixtures | 9 passaram; 3 casos de prévia lateral não se aplicam aos projetos mobile. |
| `studio-forms.visual.ts`                                    | Regressão visual      | 24 passaram nos seis projetos de tema/dispositivo.                        |

Saídas reais:

```text
Test Files  2 passed (2)
     Tests  18 passed (18)

3 skipped
9 passed (35.5s)

Execução conjunta inicial da prévia e dos formulários:
3 skipped
33 passed (1.1m)
```

As capturas foram inspecionadas para desktop escuro/sépia e 320 px. A última
correção removeu uma variante inexistente do Card, preservando as classes
visuais da variante padrão já capturada.

## Validações executadas

| Comando                     | Resultado                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm ci --prefix functions` | Instalado; zero vulnerabilidades. Aviso de engine: ambiente Node 24, functions declara Node 22. |
| `npm run validate`          | Verde, código de saída 0.                                                                       |
| `npm run typecheck`         | Verde.                                                                                          |
| `git diff --check`          | Sem erros.                                                                                      |

Saída real do gate final:

```text
Test Files  109 passed (109)
     Tests  768 passed (768)
Statements   : 92.63% ( 6637/7165 )
Branches     : 86.05% ( 5294/6152 )
Functions    : 91.14% ( 1709/1875 )
Lines        : 94.71% ( 6044/6381 )
Setup: tests 69, pass 69, fail 0
Functions: tests 73, pass 73, fail 0
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
Smoke test do bundle OK.
```

## Fora do escopo

Edição de livros, criação assistida, persistência, geração/cobrança de IA e editor.
As alterações paralelas do editor foram preservadas.

## Limitações e pendências conhecidas

Nenhum deploy, push ou PR faz parte desta entrega; CI remoto não foi executado.
Os testes visuais usam dados fictícios e não geram nem debitam em produção.
O build conserva avisos de chunks acima de 500 kB e importação dinâmica/estática de DOCX.

## Como verificar manualmente

1. Na biblioteca, abra **Novo Livro** em uma tela acima de 900 px.
2. Preencha título, gênero e sinopse; confira a prévia lateral enquanto edita.
3. Selecione uma capa da biblioteca, recolha a seção e confira o resultado na prévia.
4. Reduza a viewport a 320 px: somente o formulário deve permanecer, com ações visíveis e sem transbordamento.
