# Entrega — Importação de Documentos (.docx e .pdf) com Divisão Automática de Capítulos

- **Data**: 2026-08-19
- **Branch**: `master`

## Objetivo

Implementar a importação de manuscritos nos formatos `.docx` e `.pdf` diretamente no navegador, detectando e dividindo os capítulos e seus conteúdos automaticamente, exibindo um resumo detalhado com contagem de palavras, seleção por checkboxes e edição de títulos antes de persistir a obra e seus capítulos no Cloud Firestore.

## Funcionalidades entregues

- **Serviço de Análise e Divisão de Documentos (`documentParserService`)**:
  - Processamento 100% no cliente utilizando `mammoth` (para `.docx`) e `pdfjs-dist` (para `.pdf`) com importação dinâmica para não impactar o bundle inicial.
  - Reconhecimento automático de padrões de capítulos (_Capítulo 1_, _Chapter 2_, _Prólogo_, _Epílogo_, _Ato 1_, tags `<h1>`/`<h2>`, etc.).
  - Fallback automático para capítulo único caso o documento não possua divisores estruturados.
  - Cálculo automático de contagem de palavras por capítulo e total do documento com extração de texto limpo para pré-visualização.
- **Modal Interativo de Importação (`ImportBookModal`)**:
  - Área de arrastar e soltar (drag & drop) ou seleção manual de arquivos `.docx` e `.pdf`.
  - Estados claros de processamento (`LoadingState`) e tratamento de erros.
  - Barra de resumo com total de capítulos encontrados, total de palavras e contador em tempo real dos capítulos selecionados.
  - Controle em massa "Selecionar todos / Desmarcar todos".
  - Lista de capítulos com seleção individual por checkbox, campo editável para renomear capítulos inline, badge com contagem de palavras e prévia das primeiras linhas do conteúdo.
  - Suporte a dois modos de importação:
    1. **Criar Novo Livro**: cria a obra com título (sugerido a partir do nome do arquivo), gênero e sinopse, gerando os capítulos selecionados.
    2. **Importar para Livro Existente**: anexa os capítulos selecionados à obra atual.
- **Pontos de Acesso Integrados**:
  - `BookList`: Botão "Importar Documento" na toolbar superior e CTA secundário no `EmptyState` ("Importar Documento (.docx, .pdf)").
  - `BookPage`: Botão "Importar DOCX/PDF" nas ações do cabeçalho da obra e atalho na aba de capítulos.
  - `ChapterList`: Botão "Importar Arquivo" ao lado da adição de capítulos e CTA no estado vazio de capítulos.

## Arquivos alterados / criados

| Arquivo                                                    | Mudança                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/features/books/services/documentParserService.ts`     | [NOVO] Serviço de extração e divisão de capítulos em DOCX/PDF.             |
| `src/features/books/tests/documentParserService.test.ts`   | [NOVO] Testes unitários do parser de documentos e heurísticas de capítulo. |
| `src/features/books/components/ImportBookModal.tsx`        | [NOVO] Modal interativo de upload, resumo, seleção e importação.           |
| `src/features/books/components/ImportBookModal.module.css` | [NOVO] Estilos do modal com dropzone, checklist e badges.                  |
| `src/features/books/tests/ImportBookModal.test.tsx`        | [NOVO] Testes do fluxo de seleção, edição inline e importação em lote.     |
| `src/shared/types/mammoth.d.ts`                            | [NOVO] Declaração de tipos TypeScript para a biblioteca `mammoth`.         |
| `src/features/books/components/BookList.tsx`               | Integração do botão e modal de importação na lista de livros.              |
| `src/features/books/components/BookPage.tsx`               | Integração do modal de importação na página do livro.                      |
| `src/features/books/components/ChapterList.tsx`            | Botão de importação na toolbar e no estado vazio de capítulos.             |
| `src/features/books/services/index.ts`                     | Exportação de `documentParserService`.                                     |
| `src/features/books/index.ts`                              | Exportação de `ImportBookModal` e tipos de importação.                     |
| `src/features/books/tests/BookList.test.tsx`               | Testes de acionamento do modal de importação.                              |
| `src/features/books/tests/BookPage.test.tsx`               | Testes de acionamento do modal de importação no livro.                     |
| `package.json`                                             | Adição das dependências `mammoth` e `pdfjs-dist`.                          |

## Validações executadas

- `npm run validate` executado com sucesso:
  - Testes unitários: **217 testes passando** em 49 arquivos.
  - Cobertura de código acima de **90%**.
  - Lint, format (Prettier), typecheck (`tsc -b`), build de produção (`vite build`) e smoke test do bundle HTTP 100% verdes.
